// Scheduler. Idempotent: safe to call from every message and from the cron at any frequency.

import { api, db, BotApiError } from 'sdk';
import { and, eq } from 'sdk/db';
import { chats, deliveries } from '../schema.js';
import { tashkentNow, dueSlots } from './time.js';
import { buildDigest } from './digest.js';

async function release(chatIds, slot, day) {
  for (const chatId of chatIds) {
    await db
      .delete(deliveries)
      .where(and(eq(deliveries.chatId, chatId), eq(deliveries.slot, slot.id), eq(deliveries.day, day)))
      .run();
  }
}

export async function tick(date = new Date()) {
  const now = tashkentNow(date);
  const slots = dueSlots(now);
  if (slots.length === 0) return { sent: 0 };

  const subscribed = await db.select().from(chats).all();
  if (subscribed.length === 0) return { sent: 0 };

  let sent = 0;
  for (const slot of slots) {
    // Claim: only the caller whose insert actually adds a row owns the send for that chat.
    const claimed = [];
    for (const chat of subscribed) {
      const res = await db
        .insert(deliveries)
        .values({ chatId: chat.chatId, slot: slot.id, day: now.day })
        .onConflictDoNothing()
        .run();
      if (res.rowsAffected === 1) claimed.push(chat);
    }
    if (claimed.length === 0) continue;

    let text;
    try {
      text = await buildDigest(slot, now.day);
    } catch (e) {
      console.error(`digest failed for slot ${slot.id}`, e);
      await release(claimed.map((c) => c.chatId), slot, now.day);
      continue;
    }

    for (const chat of claimed) {
      try {
        await api.sendMessage({ chat_id: chat.chatId, text });
        sent++;
      } catch (e) {
        await release([chat.chatId], slot, now.day);
        if (e instanceof BotApiError && e.code === 403) {
          await db.delete(chats).where(eq(chats.chatId, chat.chatId)).run();
          console.warn(`chat ${chat.chatId} unsubscribed (403)`);
        } else {
          console.error(`send failed for chat ${chat.chatId}`, e);
        }
      }
    }
  }
  return { sent };
}
