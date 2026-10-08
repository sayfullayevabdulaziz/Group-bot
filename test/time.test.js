import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, tashkentNow, dueSlots, formatDay, isValidDay } from '../tgcloud/lib/time.js';

test('tashkentNow converts UTC to UTC+5', () => {
  assert.deepEqual(tashkentNow(new Date('2026-10-08T01:00:00Z')), { day: '2026-10-08', minutes: 360 });
});

test('tashkentNow rolls the date over at 19:00 UTC', () => {
  assert.deepEqual(tashkentNow(new Date('2026-10-07T20:30:00Z')), { day: '2026-10-08', minutes: 90 });
});

test('SLOTS lists 06 and 12 with Uzbek titles', () => {
  assert.deepEqual(SLOTS.map((s) => [s.id, s.hour, s.title]), [
    ['06', 6, 'Ertalabki'],
    ['12', 12, 'Tushlik'],
  ]);
});

test('dueSlots: nothing before 06:00', () => {
  assert.deepEqual(dueSlots({ minutes: 359 }), []);
});

test('dueSlots: 06 slot is due from 06:00 until 08:59', () => {
  assert.deepEqual(dueSlots({ minutes: 360 }).map((s) => s.id), ['06']);
  assert.deepEqual(dueSlots({ minutes: 539 }).map((s) => s.id), ['06']);
});

test('dueSlots: nothing between the windows (09:00-11:59)', () => {
  assert.deepEqual(dueSlots({ minutes: 540 }), []);
  assert.deepEqual(dueSlots({ minutes: 719 }), []);
});

test('dueSlots: 12 slot is due from 12:00 until 14:59', () => {
  assert.deepEqual(dueSlots({ minutes: 720 }).map((s) => s.id), ['12']);
  assert.deepEqual(dueSlots({ minutes: 899 }).map((s) => s.id), ['12']);
  assert.deepEqual(dueSlots({ minutes: 900 }), []);
});

test('formatDay converts ISO to DD.MM.YYYY', () => {
  assert.equal(formatDay('2026-10-08'), '08.10.2026');
});

test('isValidDay accepts real dates only', () => {
  assert.equal(isValidDay('2026-10-08'), true);
  assert.equal(isValidDay('2026-02-30'), false);
  assert.equal(isValidDay('2026-1-8'), false);
  assert.equal(isValidDay('08.10.2026'), false);
  assert.equal(isValidDay('abc'), false);
});
