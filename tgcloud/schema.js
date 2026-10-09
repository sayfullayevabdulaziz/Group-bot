import { table, integer, text, uniqueIndex, sql } from 'sdk/db';

// People who sent /start. Written only on /start.
export const users = table('users', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  tgId:      integer('tg_id').notNull().unique(),
  firstName: text('first_name'),
  username:  text('username'),
  startedAt: integer('started_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Chats that receive the scheduled digest. A row exists iff the chat is subscribed.
export const chats = table('chats', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  chatId:    integer('chat_id').notNull().unique(),
  title:     text('title'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Scheduler claim table: one row per (chat, slot, Tashkent day) that has been claimed for sending.
export const deliveries = table('deliveries', {
  id:     integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  slot:   text('slot').notNull(),
  day:    text('day').notNull(),
}, (t) => ({
  claimIdx: uniqueIndex('uidx_deliveries_claim').on(t.chatId, t.slot, t.day),
}));
