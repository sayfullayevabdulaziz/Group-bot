import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, forecastUrl, parseForecast } from '../tgcloud/lib/weather.js';

const loc = (tmax, code) => ({
  daily: {
    time: ['2026-10-08', '2026-10-09'],
    temperature_2m_max: [tmax, tmax + 1],
    temperature_2m_min: [10.4, 13.4],
    weather_code: [code, 0],
    precipitation_probability_max: [0, null],
    wind_speed_10m_max: [6.2, 11.4],
  },
});

test('CITIES order and coordinates', () => {
  assert.deepEqual(
    CITIES.map((c) => [c.name, c.lat, c.lon]),
    [
      ['Toshkent', 41.31, 69.24],
      ['Samarqand', 39.65, 66.96],
      ['Termiz', 37.22, 67.28],
      ['Denov', 38.27, 67.9],
    ],
  );
});

test('forecastUrl requests all cities in one call', () => {
  const url = forecastUrl(3);
  assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?'));
  assert.ok(url.includes('latitude=41.31,39.65,37.22,38.27'));
  assert.ok(url.includes('longitude=69.24,66.96,67.28,67.9'));
  assert.ok(url.includes('timezone=Asia%2FTashkent'));
  assert.ok(url.includes('forecast_days=3'));
  for (const v of ['temperature_2m_max', 'temperature_2m_min', 'weather_code', 'precipitation_probability_max', 'wind_speed_10m_max']) {
    assert.ok(url.includes(v), v);
  }
});

test('parseForecast maps each location to its city', () => {
  const out = parseForecast([loc(24.2, 2), loc(26, 3), loc(30, 0), loc(28, 1)]);
  assert.deepEqual(out.map((c) => c.name), ['Toshkent', 'Samarqand', 'Termiz', 'Denov']);
  assert.deepEqual(out[0].days[0], { day: '2026-10-08', tmax: 24.2, tmin: 10.4, code: 2, rain: 0, wind: 6.2 });
  assert.equal(out[0].days.length, 2);
});

test('parseForecast keeps null rain probability', () => {
  const out = parseForecast([loc(1, 0), loc(1, 0), loc(1, 0), loc(1, 0)]);
  assert.equal(out[0].days[1].rain, null);
});

test('parseForecast throws when the location count is wrong', () => {
  assert.throws(() => parseForecast(loc(1, 0)), /Unexpected Open-Meteo response/);
});

test('parseForecast throws when daily data is missing', () => {
  assert.throws(() => parseForecast([{}, {}, {}, {}]), /Unexpected Open-Meteo response/);
});
