import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtMoney, weatherText, formatCurrency, formatWeather, formatDigest,
  GREETING, STOPPED, WEATHER_HINT, ERRORS,
} from '../tgcloud/lib/format.js';

const RATES = [
  { code: 'USD', nominal: 1, rate: 11809.19, diff: 18.4, date: '08.10.2026' },
  { code: 'EUR', nominal: 1, rate: 14710.5, diff: -30.1, date: '08.10.2026' },
  { code: 'RUB', nominal: 1, rate: 155.2, diff: 0, date: '08.10.2026' },
];

const day = (d, tmin, tmax, code, rain, wind) => ({ day: d, tmin, tmax, code, rain, wind });
const CITIES = [
  { name: 'Toshkent', days: [day('2026-10-08', 10.4, 24.2, 0, 5, 12.4), day('2026-10-09', 13.4, 25.3, 61, null, 11.4), day('2026-10-10', 9.6, 20, 3, 40, 3)] },
  { name: 'Samarqand', days: [day('2026-10-08', 8.1, 26, 3, 0, 6.2)] },
];

test('fmtMoney groups thousands and shows 2 decimals', () => {
  assert.equal(fmtMoney(11809.19), '11 809.19');
  assert.equal(fmtMoney(155.2), '155.20');
  assert.equal(fmtMoney(1234567.5), '1 234 567.50');
});

test('fmtMoney uses the absolute value', () => {
  assert.equal(fmtMoney(-30.1), '30.10');
});

test('weatherText maps WMO codes and falls back', () => {
  assert.equal(weatherText(0), '☀️ Ochiq');
  assert.equal(weatherText(61), "🌧 Yomg'ir");
  assert.equal(weatherText(999), "🌡 Noma'lum");
});

test('formatCurrency renders header, flags, arrows', () => {
  assert.equal(
    formatCurrency(RATES),
    [
      '💱 Valyuta kursi (CBU) — 08.10.2026',
      "🇺🇸 USD: 11 809.19 so'm (▲ 18.40)",
      "🇪🇺 EUR: 14 710.50 so'm (▼ 30.10)",
      "🇷🇺 RUB: 155.20 so'm (= 0.00)",
    ].join('\n'),
  );
});

test('formatCurrency prefixes nominal when it is not 1 and uses a generic flag', () => {
  const out = formatCurrency([{ code: 'JPY', nominal: 10, rate: 801, diff: 1.5, date: '08.10.2026' }]);
  assert.ok(out.includes("💵 10 JPY: 801.00 so'm (▲ 1.50)"));
});

test('formatWeather renders cities, day labels and null rain', () => {
  assert.equal(
    formatWeather(CITIES),
    [
      '🌤 Ob-havo — 08.10.2026',
      '📍 Toshkent',
      "  Bugun: 10°…24° ☀️ Ochiq, yomg'ir 5%, shamol 12 km/s",
      "  Ertaga: 13°…25° 🌧 Yomg'ir, shamol 11 km/s",
      "  10.10: 10°…20° ☁️ Bulutli, yomg'ir 40%, shamol 3 km/s",
      '📍 Samarqand',
      "  Bugun: 8°…26° ☁️ Bulutli, yomg'ir 0%, shamol 6 km/s",
    ].join('\n'),
  );
});

test('formatDigest combines heading, weather and currency', () => {
  const slot = { id: '06', hour: 6, title: 'Ertalabki' };
  const out = formatDigest({ slot, day: '2026-10-08', weather: CITIES, rates: RATES });
  assert.ok(out.startsWith('🗓 Ertalabki xabar — 08.10.2026\n\n🌤 Ob-havo'));
  assert.ok(out.includes('\n\n💱 Valyuta kursi'));
});

test('formatDigest shows a warning when a source is missing', () => {
  const slot = { id: '12', hour: 12, title: 'Tushlik' };
  const noRates = formatDigest({ slot, day: '2026-10-08', weather: CITIES, rates: null });
  assert.ok(noRates.includes("⚠️ Valyuta ma'lumoti hozircha mavjud emas"));
  assert.ok(noRates.includes('🌤 Ob-havo'));
  const noWeather = formatDigest({ slot, day: '2026-10-08', weather: null, rates: RATES });
  assert.ok(noWeather.includes("⚠️ Ob-havo ma'lumoti hozircha mavjud emas"));
  assert.ok(noWeather.includes('💱 Valyuta kursi'));
});

test('static texts exist', () => {
  assert.ok(GREETING.includes('/currency') && GREETING.includes('/weather') && GREETING.includes('/stop'));
  assert.ok(GREETING.includes('06:00') && GREETING.includes('12:00'));
  assert.ok(STOPPED.includes('/start'));
  assert.ok(WEATHER_HINT.includes('1'));
  assert.deepEqual(Object.keys(ERRORS).sort(), ['bad_code', 'bad_day', 'fetch_failed', 'no_data', 'usage']);
});
