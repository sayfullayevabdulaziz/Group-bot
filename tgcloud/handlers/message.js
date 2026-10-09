// handlers/message.js — runs on each `message` update.

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { users, chats } from '../schema.js';
import { parseCommand, parseWeatherDays, parseCurrencyArgs } from '../lib/commands.js';
import { DEFAULT_CODES } from '../lib/cbu.js';
import { getRates, getForecast } from '../lib/sources.js';
import {
  formatCurrency, formatWeather, GREETING, STOPPED, WEATHER_HINT, ERRORS,
} from '../lib/format.js';
import { tick } from '../lib/tick.js';

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

const COMMANDS = { start, stop, currency, weather };

export default async function (message) {
  const cmd = parseCommand(message.text);
  const run = cmd && COMMANDS[cmd.name];
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
