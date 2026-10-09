// Pure admin helpers: access check, paging, and plain-text formatting (Uzbek).
// No `sdk` import, so everything here is testable locally.

import { SLOTS, tashkentNow, formatDay } from './time.js';

// Telegram user ids allowed to use the admin commands. Ids are not secrets.
export const ADMIN_IDS = [5948687547];
export const PAGE_SIZE = 20;

const MAX_NAME = 40;

export function isAdmin(message) {
  const id = message?.from?.id;
  return message?.chat?.type === 'private' && Number.isInteger(id) && ADMIN_IDS.includes(id);
}

export function pageCount(total) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function parsePage(args, pages) {
  const n = Number(args[0]);
  const page = Number.isInteger(n) && n >= 1 ? n : 1;
  return Math.min(page, pages);
}

// One line, at most MAX_NAME characters, '-' when empty.
function clip(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '-';
  const chars = [...text];
  return chars.length > MAX_NAME ? `${chars.slice(0, MAX_NAME - 1).join('')}…` : text;
}

function dateOf(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? formatDay(tashkentNow(date).day) : '-';
}

function formatList(header, lines, page, pages) {
  const out = [header];
  if (lines.length > 0) out.push('', ...lines);
  if (pages > 1) out.push('', `📄 ${page}/${pages}`);
  return out.join('\n');
}

export function formatUsers({ rows, total, page, pages }) {
  const offset = (page - 1) * PAGE_SIZE;
  const lines = rows.map((u, i) => {
    const handle = u.username ? `@${u.username}` : '-';
    return `${offset + i + 1}. ${clip(u.firstName)} ${handle} · ${u.tgId} · ${dateOf(u.startedAt)}`;
  });
  return formatList(`👥 Foydalanuvchilar: ${total}`, lines, page, pages);
}

export function formatChats({ rows, total, page, pages }) {
  const offset = (page - 1) * PAGE_SIZE;
  const lines = rows.map((c, i) => `${offset + i + 1}. ${clip(c.title)} · ${c.chatId} · ${dateOf(c.createdAt)}`);
  return formatList(`💬 Obunalar: ${total}`, lines, page, pages);
}

export function formatStats({ users, chats, day, claims }) {
  return [
    '📊 Statistika',
    `Foydalanuvchilar: ${users}`,
    `Obunalar: ${chats}`,
    '',
    `Bugun — ${formatDay(day)}`,
    ...SLOTS.map((s) => `${s.title}: ${claims[s.id] ?? 0}`),
  ].join('\n');
}
