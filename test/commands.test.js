import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseWeatherDays, parseCurrencyArgs } from '../tgcloud/lib/commands.js';

test('parseCommand splits name and args', () => {
  assert.deepEqual(parseCommand('/weather 3'), { name: 'weather', args: ['3'] });
});

test('parseCommand strips @botname and lowercases', () => {
  assert.deepEqual(parseCommand('/Currency@FamilyBot usd'), { name: 'currency', args: ['usd'] });
});

test('parseCommand tolerates extra spaces', () => {
  assert.deepEqual(parseCommand('  /start   '), { name: 'start', args: [] });
});

test('parseCommand returns null for non-commands', () => {
  assert.equal(parseCommand('hello'), null);
  assert.equal(parseCommand(undefined), null);
  assert.equal(parseCommand('/'), null);
});

test('parseWeatherDays defaults to 1', () => {
  assert.deepEqual(parseWeatherDays([]), { days: 1 });
});

test('parseWeatherDays accepts 1..7', () => {
  assert.deepEqual(parseWeatherDays(['3']), { days: 3 });
  assert.deepEqual(parseWeatherDays(['7']), { days: 7 });
});

test('parseWeatherDays falls back to 1 with a hint on bad input', () => {
  assert.deepEqual(parseWeatherDays(['0']), { days: 1, hint: true });
  assert.deepEqual(parseWeatherDays(['8']), { days: 1, hint: true });
  assert.deepEqual(parseWeatherDays(['abc']), { days: 1, hint: true });
  assert.deepEqual(parseWeatherDays(['2.5']), { days: 1, hint: true });
});

test('parseCurrencyArgs: no args means the defaults', () => {
  assert.deepEqual(parseCurrencyArgs([]), { code: null, day: null });
});

test('parseCurrencyArgs: a code', () => {
  assert.deepEqual(parseCurrencyArgs(['kzt']), { code: 'KZT', day: null });
});

test('parseCurrencyArgs: a code and a date', () => {
  assert.deepEqual(parseCurrencyArgs(['rub', '2019-01-01']), { code: 'RUB', day: '2019-01-01' });
});

test('parseCurrencyArgs: errors', () => {
  assert.deepEqual(parseCurrencyArgs(['dollar']), { error: 'bad_code' });
  assert.deepEqual(parseCurrencyArgs(['usd', '01.01.2019']), { error: 'bad_day' });
  assert.deepEqual(parseCurrencyArgs(['usd', '2019-02-30']), { error: 'bad_day' });
  assert.deepEqual(parseCurrencyArgs(['usd', '2019-01-01', 'x']), { error: 'usage' });
});
