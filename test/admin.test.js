import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_IDS, PAGE_SIZE, isAdmin, pageCount, parsePage,
  formatUsers, formatChats, formatStats,
} from '../tgcloud/lib/admin.js';

test('constants', () => {
  assert.deepEqual(ADMIN_IDS, [5948687547]);
  assert.equal(PAGE_SIZE, 20);
});

test('isAdmin requires a private chat and a listed id', () => {
  assert.equal(isAdmin({ chat: { type: 'private' }, from: { id: 5948687547 } }), true);
  assert.equal(isAdmin({ chat: { type: 'group' }, from: { id: 5948687547 } }), false);
  assert.equal(isAdmin({ chat: { type: 'supergroup' }, from: { id: 5948687547 } }), false);
  assert.equal(isAdmin({ chat: { type: 'private' }, from: { id: 1 } }), false);
  assert.equal(isAdmin({ chat: { type: 'private' } }), false);
  assert.equal(isAdmin({ from: { id: 5948687547 } }), false);
  assert.equal(isAdmin(undefined), false);
});

test('pageCount is at least 1', () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(1), 1);
  assert.equal(pageCount(20), 1);
  assert.equal(pageCount(21), 2);
  assert.equal(pageCount(41), 3);
});

test('parsePage falls back to 1 and clamps to the last page', () => {
  assert.equal(parsePage([], 3), 1);
  assert.equal(parsePage(['2'], 3), 2);
  assert.equal(parsePage(['99'], 3), 3);
  assert.equal(parsePage(['0'], 3), 1);
  assert.equal(parsePage(['-2'], 3), 1);
  assert.equal(parsePage(['x'], 3), 1);
  assert.equal(parsePage(['1.5'], 3), 1);
  assert.equal(parsePage(['2'], 1), 1);
});

const U1 = { firstName: 'Aziz', username: 'aziz', tgId: 5948687547, startedAt: new Date('2026-10-08T10:00:00Z') };
const U2 = { firstName: null, username: null, tgId: 42, startedAt: new Date('2026-10-08T20:00:00Z') };

test('formatUsers lists rows with Tashkent dates and placeholders', () => {
  assert.equal(
    formatUsers({ rows: [U1, U2], total: 2, page: 1, pages: 1 }),
    [
      '👥 Foydalanuvchilar: 2',
      '',
      '1. Aziz @aziz · 5948687547 · 08.10.2026',
      '2. - - · 42 · 09.10.2026',
    ].join('\n'),
  );
});

test('formatUsers numbers rows across pages and adds a footer', () => {
  assert.equal(
    formatUsers({ rows: [U1], total: 21, page: 2, pages: 2 }),
    [
      '👥 Foydalanuvchilar: 21',
      '',
      '21. Aziz @aziz · 5948687547 · 08.10.2026',
      '',
      '📄 2/2',
    ].join('\n'),
  );
});

test('formatUsers with no rows shows only the header', () => {
  assert.equal(formatUsers({ rows: [], total: 0, page: 1, pages: 1 }), '👥 Foydalanuvchilar: 0');
});

test('formatUsers cuts long names to 40 characters', () => {
  const out = formatUsers({
    rows: [{ ...U1, firstName: 'A'.repeat(50) }], total: 1, page: 1, pages: 1,
  });
  assert.ok(out.includes(`1. ${'A'.repeat(39)}… @aziz`));
  assert.ok(!out.includes('A'.repeat(40)));
});

test('formatChats lists rows, collapses whitespace, uses placeholders', () => {
  assert.equal(
    formatChats({
      rows: [
        { title: 'Oila\nguruhi', chatId: -1001234567890, createdAt: new Date('2026-10-08T10:00:00Z') },
        { title: null, chatId: 7, createdAt: null },
      ],
      total: 2, page: 1, pages: 1,
    }),
    [
      '💬 Obunalar: 2',
      '',
      '1. Oila guruhi · -1001234567890 · 08.10.2026',
      '2. - · 7 · -',
    ].join('\n'),
  );
});

test('formatChats with no rows shows only the header', () => {
  assert.equal(formatChats({ rows: [], total: 0, page: 1, pages: 1 }), '💬 Obunalar: 0');
});

test('formatStats shows totals and per-slot claims, missing slots as 0', () => {
  assert.equal(
    formatStats({ users: 5, chats: 2, day: '2026-10-08', claims: { '06': 2 } }),
    [
      '📊 Statistika',
      'Foydalanuvchilar: 5',
      'Obunalar: 2',
      '',
      'Bugun — 08.10.2026',
      'Ertalabki: 2',
      'Tushlik: 0',
    ].join('\n'),
  );
});
