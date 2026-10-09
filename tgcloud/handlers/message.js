// handlers/message.js — runs on each `message` update.

import { api, db } from 'sdk';
import { eq, desc, sql } from 'sdk/db';
import { users, chats, deliveries } from '../schema.js';
import { parseCommand, parseWeatherDays, parseCurrencyArgs } from '../lib/commands.js';
import { DEFAULT_CODES } from '../lib/cbu.js';
import { getRates, getForecast } from '../lib/sources.js';
import {
  formatCurrency, formatWeather, GREETING, STOPPED, WEATHER_HINT, ERRORS,
} from '../lib/format.js';
import { tick } from '../lib/tick.js';
import { tashkentNow } from '../lib/time.js';
import {
  isAdmin, pageCount, parsePage, PAGE_SIZE, formatUsers, formatChats, formatStats,
} from '../lib/admin.js';

const reply = (message, text) => api.sendMessage({ chat_id: message.chat.id, text });

async function start(message) {
  if (message.from) {
    await db
      .insert(users)
      .values({ tgId: message.from.id, firstName: message.from.first_name ?? null, username: message.from.username ?? null })
      .onConflictDoUpdate({
        target: users.tgId,
        set: { firstName: message.from.first_name ?? null, username: message.from.username ?? null },
      })
      .run();
  }
  await db
    .insert(chats)
    .values({ chatId: message.chat.id, title: message.chat.title ?? message.chat.first_name ?? null })
    .onConflictDoNothing()
    .run();
  await reply(message, GREETING);
}

async function stop(message) {
  await db.delete(chats).where(eq(chats.chatId, message.chat.id)).run();
  await reply(message, STOPPED);
}

async function currency(message, args) {
  const parsed = parseCurrencyArgs(args);
  if (parsed.error) return reply(message, ERRORS[parsed.error]);
  const rates = parsed.code
    ? await getRates({ code: parsed.code, day: parsed.day })
    : await getRates({ codes: DEFAULT_CODES });
  if (rates.length === 0) return reply(message, ERRORS.no_data);
  return reply(message, formatCurrency(rates));
}

async function weather(message, args) {
  const { days, hint } = parseWeatherDays(args);
  const text = formatWeather(await getForecast(days));
  return reply(message, hint ? `${WEATHER_HINT}\n\n${text}` : text);
}

// Admin commands are silently ignored for everyone else (no reply at all).
const adminOnly = (fn) => (message, args) => (isAdmin(message) ? fn(message, args) : undefined);

async function listUsers(message, args) {
  const total = await db.$count(users);
  const pages = pageCount(total);
  const page = parsePage(args, pages);
  const rows = await db
    .select()
    .from(users)
    .orderBy(desc(users.startedAt), desc(users.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)
    .all();
  return reply(message, formatUsers({ rows, total, page, pages }));
}

async function listChats(message, args) {
  const total = await db.$count(chats);
  const pages = pageCount(total);
  const page = parsePage(args, pages);
  const rows = await db
    .select()
    .from(chats)
    .orderBy(desc(chats.createdAt), desc(chats.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)
    .all();
  return reply(message, formatChats({ rows, total, page, pages }));
}

async function showStats(message) {
  const day = tashkentNow().day;
  const userCount = await db.$count(users);
  const chatCount = await db.$count(chats);
  const claimRows = await db
    .select({ slot: deliveries.slot, n: sql`count(*)` })
    .from(deliveries)
    .where(eq(deliveries.day, day))
    .groupBy(deliveries.slot)
    .all();
  const claims = Object.fromEntries(claimRows.map((r) => [r.slot, Number(r.n)]));
  return reply(message, formatStats({ users: userCount, chats: chatCount, day, claims }));
}

const COMMANDS = {
  start, stop, currency, weather,
  users: adminOnly(listUsers),
  chats: adminOnly(listChats),
  stats: adminOnly(showStats),
};

export default async function (message) {
  const cmd = parseCommand(message.text);
  const run = cmd && Object.hasOwn(COMMANDS, cmd.name) && COMMANDS[cmd.name];
  if (run) {
    try {
      await run(message, cmd.args);
    } catch (e) {
      console.error(`/${cmd.name} failed`, e);
      try {
        await reply(message, ERRORS.fetch_failed);
      } catch (e2) {
        console.error('error reply failed', e2);
      }
    }
  }

  // Lazy scheduler wake-up. Never let it break command handling.
  try {
    await tick();
  } catch (e) {
    console.error('tick failed', e);
  }
}
