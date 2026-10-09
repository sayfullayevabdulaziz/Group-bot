// Scheduler. Idempotent: safe to call from every message and from the cron at any frequency.

import { api, db, BotApiError } from 'sdk';
import { and, eq } from 'sdk/db';
import { chats, deliveries } from '../schema.js';
import { tashkentNow, dueSlots } from './time.js';
import { buildDigest } from './digest.js';

// Best effort: one failed delete is logged and never stops the rest.
async function release(chatIds, slot, day) {
  for (const chatId of chatIds) {
    try {
      await db
        .delete(deliveries)
        .where(and(eq(deliveries.chatId, chatId), eq(deliveries.slot, slot.id), eq(deliveries.day, day)))
        .run();
    } catch (e) {
      console.error(`release failed for chat ${chatId} slot ${slot.id}`, e);
    }
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
    // Every claimed chat that is not sent by the end is released (finally), so a claim never leaks.
    const claimed = [];
    const settled = new Set();
    try {
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
        continue;
      }

      for (const chat of claimed) {
        try {
          await api.sendMessage({ chat_id: chat.chatId, text });
          settled.add(chat.chatId);
          sent++;
        } catch (e) {
          if (e instanceof BotApiError && e.code === 403) {
            try {
              await db.delete(chats).where(eq(chats.chatId, chat.chatId)).run();
              console.warn(`chat ${chat.chatId} unsubscribed (403)`);
            } catch (e2) {
              console.error(`failed to delete chat ${chat.chatId} after 403`, e2);
            }
          } else {
            console.error(`send failed for chat ${chat.chatId}`, e);
          }
        }
      }
    } finally {
      await release(
        claimed.map((c) => c.chatId).filter((id) => !settled.has(id)),
        slot,
        now.day,
      );
    }
  }
  return { sent };
}
