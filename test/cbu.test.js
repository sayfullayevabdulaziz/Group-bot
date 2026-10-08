import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CODES, ratesUrl, parseRates, normalizeCode } from '../tgcloud/lib/cbu.js';

const SAMPLE = [
  { id: 1, Code: '840', Ccy: 'USD', Nominal: '1', Rate: '11809.19', Diff: '18.4', Date: '08.10.2026' },
  { id: 2, Code: '978', Ccy: 'EUR', Nominal: '1', Rate: '14710.50', Diff: '-30.1', Date: '08.10.2026' },
  { id: 3, Code: '643', Ccy: 'RUB', Nominal: '1', Rate: '155.20', Diff: '0', Date: '08.10.2026' },
  { id: 4, Code: '392', Ccy: 'JPY', Nominal: '10', Rate: '801.00', Diff: '1.5', Date: '08.10.2026' },
];

test('DEFAULT_CODES', () => {
  assert.deepEqual(DEFAULT_CODES, ['USD', 'EUR', 'RUB']);
});

test('ratesUrl builds the four CBU URL shapes', () => {
  const base = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json';
  assert.equal(ratesUrl({}), `${base}/`);
  assert.equal(ratesUrl({ code: 'USD' }), `${base}/USD/`);
  assert.equal(ratesUrl({ day: '2018-12-11' }), `${base}/all/2018-12-11/`);
  assert.equal(ratesUrl({ code: 'RUB', day: '2019-01-01' }), `${base}/RUB/2019-01-01/`);
});

test('parseRates converts strings to numbers', () => {
  const [usd] = parseRates(SAMPLE, ['USD']);
  assert.deepEqual(usd, { code: 'USD', nominal: 1, rate: 11809.19, diff: 18.4, date: '08.10.2026' });
});

test('parseRates filters and orders by the requested codes', () => {
  assert.deepEqual(parseRates(SAMPLE, ['RUB', 'USD']).map((r) => r.code), ['RUB', 'USD']);
});

test('parseRates skips requested codes that are missing', () => {
  assert.deepEqual(parseRates(SAMPLE, ['USD', 'XXX']).map((r) => r.code), ['USD']);
});

test('parseRates without codes returns everything', () => {
  assert.equal(parseRates(SAMPLE).length, 4);
});

test('parseRates keeps nominal and handles negative diff', () => {
  assert.equal(parseRates(SAMPLE, ['JPY'])[0].nominal, 10);
  assert.equal(parseRates(SAMPLE, ['EUR'])[0].diff, -30.1);
});

test('parseRates returns [] for CBU empty array (unknown code)', () => {
  assert.deepEqual(parseRates([], ['XXX']), []);
});

test('parseRates throws on a non-array response', () => {
  assert.throws(() => parseRates({ error: 'x' }), /Unexpected CBU response/);
});

test('normalizeCode', () => {
  assert.equal(normalizeCode('usd'), 'USD');
  assert.equal(normalizeCode('KZT'), 'KZT');
  assert.equal(normalizeCode('US'), null);
  assert.equal(normalizeCode('US1'), null);
  assert.equal(normalizeCode('../x'), null);
});
