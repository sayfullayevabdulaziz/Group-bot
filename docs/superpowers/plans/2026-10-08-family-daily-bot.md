# Family Daily Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Telegram bot on the tgcloud platform that posts weather (Toshkent, Samarqand, Termiz, Denov) and CBU exchange rates (USD, EUR, RUB) to subscribed chats at 06:00 and 12:00 Asia/Tashkent, and answers `/currency` and `/weather`.

**Architecture:** Pure modules (time, CBU parsing, forecast parsing, formatting, command parsing) are unit-tested locally with `node --test`. IO modules (`sources.js`, `digest.js`, `tick.js`, handler, endpoints) run only on the platform and are verified with `npx tgcloud run`. The scheduler is a DB-backed idempotent `tick()` woken by every incoming message and by a GitHub Actions cron that runs `endpoints/tick`.

**Tech Stack:** tgcloud platform JS modules (`sdk`, `sdk/db`), SQLite, CBU JSON API, Open-Meteo API, Node 24 `node:test` for local tests, GitHub Actions.

## Global Constraints

Copied from the spec (`docs/superpowers/specs/2026-10-08-family-daily-bot-design.md`) and `AGENTS.md`:

- All bot text is Uzbek (Latin).
- Schedule: 06:00 and 12:00 `Asia/Tashkent` (fixed UTC+5, no DST); a slot is due from its start until 3 hours later.
- Default currencies: USD, EUR, RUB. Cities in display order: Toshkent (41.31, 69.24), Samarqand (39.65, 66.96), Termiz (37.22, 67.28), Denov (38.27, 67.90).
- `/weather [days]`: default 1, valid range 1–7; bad input falls back to 1 with a hint.
- `users` is written only on `/start`. `chats` row exists iff the chat is subscribed (`/start` inserts, `/stop` deletes, a 403 on send deletes).
- Platform rules: relative imports end in `.js`; SDK imported by name (`from 'sdk'`, `from 'sdk/db'`); every DB call is awaited; no foreign keys; no npm packages at runtime; only `.js` under `tgcloud/` is deployed.
- Modules that import `sdk` cannot be imported by local Node tests. Keep logic that needs tests in pure modules (no `sdk` import).
- Never read or edit `.tgcloud/`.
- Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

```
package.json                         modify: add "test" script
docs/superpowers/specs/...-design.md modify: align with platform findings (Task 1)
tgcloud/schema.js                    modify: users, chats, deliveries
tgcloud/lib/time.js                  create: pure — Tashkent time, slots, date helpers
tgcloud/lib/cbu.js                   create: pure — CBU URL builder, parser, code validation
tgcloud/lib/weather.js               create: pure — cities, Open-Meteo URL builder, parser
tgcloud/lib/commands.js              create: pure — command and argument parsing
tgcloud/lib/format.js                create: pure — all Uzbek message text
tgcloud/lib/sources.js               create: IO — fetch with retry/timeout (getRates, getForecast)
tgcloud/lib/digest.js                create: IO — builds the scheduled digest text
tgcloud/lib/tick.js                  create: IO — scheduler
tgcloud/endpoints/preview.js         create: returns digest text without sending (verification)
tgcloud/endpoints/tick.js            create: runs tick(); target of the GitHub Actions cron
tgcloud/handlers/message.js          modify: command routing + lazy tick
test/time.test.js                    create
test/cbu.test.js                     create
test/weather.test.js                 create
test/commands.test.js                create
test/format.test.js                  create
.github/workflows/tick.yml           create
```

---

### Task 1: Test harness and spec alignment

**Files:**
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-10-08-family-daily-bot-design.md`

**Interfaces:**
- Produces: `npm test` runs every `test/*.test.js` file with `node --test`.

Two platform facts found while planning change the spec: `tgcloud run` only accepts modules in `handlers/` and `endpoints/` (so the scheduler needs an endpoint, not `run lib/tick`), and the CLI reads a `TGCLOUD_TOKEN` environment variable for CI.

- [ ] **Step 1: Add the test script**

In `package.json`, add `"test": "node --test test/"` to `scripts`:

```json
{
  "name": "group_bot",
  "private": true,
  "devDependencies": {
    "@tgcloud/cli": "^0.2.0"
  },
  "scripts": {
    "deploy": "tgcloud push",
    "status": "tgcloud status",
    "run": "tgcloud run",
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Correct the spec's file layout block**

In the spec, replace the whole fenced block under `## File layout` with:

````markdown
```
tgcloud/
  schema.js              users, chats, deliveries
  handlers/message.js    command routing; calls tick() on every message
  endpoints/tick.js      runs tick(); target of the GitHub Actions cron
  endpoints/preview.js   returns the digest text without sending (verification)
  lib/time.js            Tashkent time, slots, date helpers (pure)
  lib/cbu.js             CBU URL builder and parser (pure)
  lib/weather.js         cities, Open-Meteo URL builder and parser (pure)
  lib/commands.js        command and argument parsing (pure)
  lib/format.js          Uzbek message text, weather-code map, number/date formatting (pure)
  lib/sources.js         fetch with timeout and retry (IO)
  lib/digest.js          builds the combined weather + currency message (IO)
  lib/tick.js            scheduler (IO)
test/                    local Node tests for the pure modules (not deployed)
.github/workflows/tick.yml
```
````

- [ ] **Step 3: Correct the spec's run/CI statements**

In the spec make these replacements:

1. In `## Scheduler (lib/tick.js)`, replace `A GitHub Actions workflow every 5 minutes running \`npx tgcloud run lib/tick\`.` with `A GitHub Actions workflow every 5 minutes running \`npx tgcloud run endpoints/tick '{}'\` (\`tgcloud run\` only accepts modules in \`handlers/\` and \`endpoints/\`; CI authenticates with the \`TGCLOUD_TOKEN\` environment variable, stored as a repo secret).`
2. In `## Testing`, replace `Server-side checks with \`npx tgcloud run lib/digest\` and \`npx tgcloud run lib/tick\`` with `Server-side checks with \`npx tgcloud run endpoints/preview\` and \`npx tgcloud run endpoints/tick\``.
3. In `## Known risks to verify early`, in the bullet starting `**\`tgcloud run\` side effects and CI auth.**`, replace its text after the bold lead with: `It is not yet confirmed that \`tgcloud run\` executes with real side effects (sending messages, writing the DB). CI auth is known: the CLI reads \`TGCLOUD_TOKEN\`. Note this token can deploy code, so the repo must be private. This is checked in Task 10; if it does not work, the fallback is an alternative trigger (to be re-brainstormed).`

- [ ] **Step 4: Verify `npm test` runs (no tests yet)**

Run: `npm test`
Expected: exits 0 or reports `no test files` / `tests 0`; it must not crash on a missing `test/` directory. If Node errors because `test/` does not exist, run `mkdir -p test && touch test/.gitkeep` and re-run.

- [ ] **Step 5: Commit**

```bash
git add package.json docs/superpowers/specs/2026-10-08-family-daily-bot-design.md test
git commit -m "chore: add test script and align spec with platform findings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Time and slot logic

**Files:**
- Create: `tgcloud/lib/time.js`
- Test: `test/time.test.js`

**Interfaces:**
- Produces (all pure):
  - `SLOTS: Array<{ id: '06'|'12', hour: number, title: string }>` — titles `'Ertalabki'`, `'Tushlik'`.
  - `tashkentNow(date?: Date): { day: string /* 'YYYY-MM-DD' */, minutes: number /* minutes since Tashkent midnight */ }`
  - `dueSlots(now: { minutes: number }): Array<slot>` — slots whose window `[hour*60, hour*60 + 180)` contains `now.minutes`.
  - `formatDay(day: string): string` — `'2026-10-08'` → `'08.10.2026'`.
  - `isValidDay(s: string): boolean` — strict `YYYY-MM-DD` that is a real calendar date.

- [ ] **Step 1: Write the failing test**

`test/time.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `tgcloud/lib/time.js`.

- [ ] **Step 3: Write the implementation**

`tgcloud/lib/time.js`:

```js
// Pure time helpers. Tashkent is UTC+5 all year (no DST), so a fixed offset is exact.

const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
const GRACE_MINUTES = 180;

export const SLOTS = [
  { id: '06', hour: 6, title: 'Ertalabki' },
  { id: '12', hour: 12, title: 'Tushlik' },
];

const pad = (n) => String(n).padStart(2, '0');

export function tashkentNow(date = new Date()) {
  const t = new Date(date.getTime() + TZ_OFFSET_MS);
  const day = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  return { day, minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

export function dueSlots(now) {
  return SLOTS.filter((s) => {
    const start = s.hour * 60;
    return now.minutes >= start && now.minutes < start + GRACE_MINUTES;
  });
}

export function formatDay(day) {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}

export function isValidDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `time.test.js` tests green.

- [ ] **Step 5: Commit**

```bash
git add tgcloud/lib/time.js test/time.test.js
git commit -m "feat: add Tashkent time and slot-due helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: CBU URL builder and parser

**Files:**
- Create: `tgcloud/lib/cbu.js`
- Test: `test/cbu.test.js`

**Interfaces:**
- Produces (pure):
  - `DEFAULT_CODES: ['USD','EUR','RUB']`
  - `ratesUrl({ code?: string, day?: string }): string`
  - `parseRates(json: unknown, codes?: string[]): Array<{ code: string, nominal: number, rate: number, diff: number, date: string /* 'DD.MM.YYYY' */ }>` — throws `Error('Unexpected CBU response')` if `json` is not an array; when `codes` is given, returns only those codes, in the order of `codes`.
  - `normalizeCode(s: string): string | null` — `'usd'` → `'USD'`; anything that is not exactly 3 letters → `null`.

- [ ] **Step 1: Write the failing test**

`test/cbu.test.js` (the `USD` row is a real CBU response; EUR/RUB/JPY are constructed in the same shape):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `tgcloud/lib/cbu.js`.

- [ ] **Step 3: Write the implementation**

`tgcloud/lib/cbu.js`:

```js
// Pure helpers for the CBU (Central Bank of Uzbekistan) exchange-rate API.

const BASE = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json';

export const DEFAULT_CODES = ['USD', 'EUR', 'RUB'];

export function ratesUrl({ code, day } = {}) {
  if (code && day) return `${BASE}/${code}/${day}/`;
  if (code) return `${BASE}/${code}/`;
  if (day) return `${BASE}/all/${day}/`;
  return `${BASE}/`;
}

export function parseRates(json, codes) {
  if (!Array.isArray(json)) throw new Error('Unexpected CBU response');
  const all = json
    .map((r) => ({
      code: r.Ccy,
      nominal: Number(r.Nominal),
      rate: Number(r.Rate),
      diff: Number(r.Diff),
      date: r.Date,
    }))
    .filter((r) => Number.isFinite(r.rate));
  if (!codes) return all;
  return codes.map((c) => all.find((r) => r.code === c)).filter(Boolean);
}

export function normalizeCode(s) {
  return /^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tgcloud/lib/cbu.js test/cbu.test.js
git commit -m "feat: add CBU URL builder and rate parser

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Weather URL builder and parser

**Files:**
- Create: `tgcloud/lib/weather.js`
- Test: `test/weather.test.js`

**Interfaces:**
- Produces (pure):
  - `CITIES: Array<{ name: string, lat: number, lon: number }>` in the display order Toshkent, Samarqand, Termiz, Denov.
  - `forecastUrl(days: number): string` — one Open-Meteo request for all four cities.
  - `parseForecast(json: unknown): Array<{ name: string, days: Array<{ day: string /* 'YYYY-MM-DD' */, tmax: number, tmin: number, code: number, rain: number | null, wind: number }> }>` — throws `Error('Unexpected Open-Meteo response')` unless the response has one entry per city, each with `daily.time`.

Open-Meteo returns an array (one object per location, same order as the request) when several coordinates are passed. `precipitation_probability_max` can be `null` for later days.

- [ ] **Step 1: Write the failing test**

`test/weather.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `tgcloud/lib/weather.js`.

- [ ] **Step 3: Write the implementation**

`tgcloud/lib/weather.js`:

```js
// Pure helpers for the Open-Meteo forecast API.

export const CITIES = [
  { name: 'Toshkent', lat: 41.31, lon: 69.24 },
  { name: 'Samarqand', lat: 39.65, lon: 66.96 },
  { name: 'Termiz', lat: 37.22, lon: 67.28 },
  { name: 'Denov', lat: 38.27, lon: 67.9 },
];

const DAILY = [
  'temperature_2m_max',
  'temperature_2m_min',
  'weather_code',
  'precipitation_probability_max',
  'wind_speed_10m_max',
].join(',');

export function forecastUrl(days) {
  const lat = CITIES.map((c) => c.lat).join(',');
  const lon = CITIES.map((c) => c.lon).join(',');
  return (
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}&daily=${DAILY}` +
    `&timezone=Asia%2FTashkent&forecast_days=${days}`
  );
}

export function parseForecast(json) {
  const list = Array.isArray(json) ? json : [json];
  if (list.length !== CITIES.length) throw new Error('Unexpected Open-Meteo response');
  return list.map((loc, i) => {
    const d = loc && loc.daily;
    if (!d || !Array.isArray(d.time)) throw new Error('Unexpected Open-Meteo response');
    return {
      name: CITIES[i].name,
      days: d.time.map((day, j) => ({
        day,
        tmax: d.temperature_2m_max[j],
        tmin: d.temperature_2m_min[j],
        code: d.weather_code[j],
        rain: d.precipitation_probability_max[j],
        wind: d.wind_speed_10m_max[j],
      })),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tgcloud/lib/weather.js test/weather.test.js
git commit -m "feat: add Open-Meteo URL builder and forecast parser

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Command parsing

**Files:**
- Create: `tgcloud/lib/commands.js`
- Test: `test/commands.test.js`

**Interfaces:**
- Consumes: `normalizeCode` from `./cbu.js`, `isValidDay` from `./time.js`.
- Produces (pure):
  - `parseCommand(text: unknown): { name: string, args: string[] } | null` — `'/Weather@MyBot 3'` → `{ name: 'weather', args: ['3'] }`; non-command text → `null`.
  - `parseWeatherDays(args: string[]): { days: number, hint?: true }` — `hint: true` when input was invalid or out of range (days falls back to 1).
  - `parseCurrencyArgs(args: string[]): { code: string | null, day: string | null } | { error: 'bad_code' | 'bad_day' | 'usage' }`

- [ ] **Step 1: Write the failing test**

`test/commands.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `tgcloud/lib/commands.js`.

- [ ] **Step 3: Write the implementation**

`tgcloud/lib/commands.js`:

```js
// Pure command and argument parsing.

import { normalizeCode } from './cbu.js';
import { isValidDay } from './time.js';

export function parseCommand(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const [head, ...args] = trimmed.split(/\s+/);
  const name = head.slice(1).split('@')[0].toLowerCase();
  if (!name) return null;
  return { name, args };
}

export function parseWeatherDays(args) {
  if (args.length === 0) return { days: 1 };
  const n = Number(args[0]);
  if (!Number.isInteger(n) || n < 1 || n > 7) return { days: 1, hint: true };
  return { days: n };
}

export function parseCurrencyArgs(args) {
  if (args.length === 0) return { code: null, day: null };
  if (args.length > 2) return { error: 'usage' };
  const code = normalizeCode(args[0]);
  if (!code) return { error: 'bad_code' };
  if (args.length === 1) return { code, day: null };
  if (!isValidDay(args[1])) return { error: 'bad_day' };
  return { code, day: args[1] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tgcloud/lib/commands.js test/commands.test.js
git commit -m "feat: add command and argument parsing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Message formatting

**Files:**
- Create: `tgcloud/lib/format.js`
- Test: `test/format.test.js`

**Interfaces:**
- Consumes: `formatDay` from `./time.js`; rate objects from `parseRates` (Task 3); city objects from `parseForecast` (Task 4); slot objects from `SLOTS` (Task 2).
- Produces (pure; all output is plain text, no `parse_mode`):
  - `fmtMoney(n: number): string` — absolute value, 2 decimals, space as thousands separator (`11809.19` → `'11 809.19'`).
  - `weatherText(code: number): string` — emoji and Uzbek label, e.g. `'☀️ Ochiq'`; unknown code → `"🌡 Noma'lum"`.
  - `formatCurrency(rates: Rate[]): string` — requires a non-empty array.
  - `formatWeather(cities: City[]): string`
  - `formatDigest({ slot, day, weather, rates }): string` — `weather` / `rates` may be `null`, which renders a warning line for that half.
  - `GREETING: string`, `STOPPED: string`, `WEATHER_HINT: string`, `ERRORS: Record<'bad_code'|'bad_day'|'usage'|'no_data'|'fetch_failed', string>`

- [ ] **Step 1: Write the failing test**

`test/format.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `tgcloud/lib/format.js`.

- [ ] **Step 3: Write the implementation**

`tgcloud/lib/format.js`:

```js
// Pure message formatting. All user-facing text is Uzbek (Latin), sent as plain text.

import { formatDay } from './time.js';

const FLAGS = { USD: '🇺🇸', EUR: '🇪🇺', RUB: '🇷🇺' };

// WMO weather interpretation codes -> [emoji, label]
const WEATHER = {
  0: ['☀️', 'Ochiq'],
  1: ['🌤', 'Asosan ochiq'],
  2: ['⛅', 'Qisman bulutli'],
  3: ['☁️', 'Bulutli'],
  45: ['🌫', 'Tuman'],
  48: ['🌫', 'Tuman'],
  51: ['🌦', "Mayda yomg'ir"],
  53: ['🌦', "Mayda yomg'ir"],
  55: ['🌦', "Mayda yomg'ir"],
  56: ['🌧', "Muzlovchi mayda yomg'ir"],
  57: ['🌧', "Muzlovchi mayda yomg'ir"],
  61: ['🌧', "Yomg'ir"],
  63: ['🌧', "Yomg'ir"],
  65: ['🌧', "Kuchli yomg'ir"],
  66: ['🌧', "Muzlovchi yomg'ir"],
  67: ['🌧', "Muzlovchi yomg'ir"],
  71: ['🌨', 'Qor'],
  73: ['🌨', 'Qor'],
  75: ['❄️', 'Kuchli qor'],
  77: ['🌨', 'Qor donalari'],
  80: ['🌦', "Yomg'ir jalasi"],
  81: ['🌦', "Yomg'ir jalasi"],
  82: ['⛈', "Kuchli yomg'ir jalasi"],
  85: ['🌨', 'Qor jalasi'],
  86: ['🌨', 'Qor jalasi'],
  95: ['⛈', 'Momaqaldiroq'],
  96: ['⛈', "Do'l bilan momaqaldiroq"],
  99: ['⛈', "Do'l bilan momaqaldiroq"],
};

export function fmtMoney(n) {
  const [int, frac] = Math.abs(n).toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${frac}`;
}

export function weatherText(code) {
  const w = WEATHER[code];
  return w ? `${w[0]} ${w[1]}` : "🌡 Noma'lum";
}

const arrow = (diff) => (diff > 0 ? '▲' : diff < 0 ? '▼' : '=');

export function formatCurrency(rates) {
  const lines = rates.map((r) => {
    const flag = FLAGS[r.code] ?? '💵';
    const label = r.nominal === 1 ? r.code : `${r.nominal} ${r.code}`;
    return `${flag} ${label}: ${fmtMoney(r.rate)} so'm (${arrow(r.diff)} ${fmtMoney(r.diff)})`;
  });
  return [`💱 Valyuta kursi (CBU) — ${rates[0].date}`, ...lines].join('\n');
}

function dayLabel(day, i) {
  if (i === 0) return 'Bugun';
  if (i === 1) return 'Ertaga';
  const [, m, d] = day.split('-');
  return `${d}.${m}`;
}

export function formatWeather(cities) {
  const blocks = cities.map((c) => {
    const lines = c.days.map((d, i) => {
      const rain = d.rain == null ? '' : `, yomg'ir ${d.rain}%`;
      return `  ${dayLabel(d.day, i)}: ${Math.round(d.tmin)}°…${Math.round(d.tmax)}° ${weatherText(d.code)}${rain}, shamol ${Math.round(d.wind)} km/s`;
    });
    return [`📍 ${c.name}`, ...lines].join('\n');
  });
  return [`🌤 Ob-havo — ${formatDay(cities[0].days[0].day)}`, ...blocks].join('\n');
}

export function formatDigest({ slot, day, weather, rates }) {
  return [
    `🗓 ${slot.title} xabar — ${formatDay(day)}`,
    weather ? formatWeather(weather) : "⚠️ Ob-havo ma'lumoti hozircha mavjud emas",
    rates ? formatCurrency(rates) : "⚠️ Valyuta ma'lumoti hozircha mavjud emas",
  ].join('\n\n');
}

export const GREETING = [
  'Salom! Men oilaviy kunlik xabarlar botiman.',
  '',
  "Har kuni soat 06:00 va 12:00 da ob-havo (Toshkent, Samarqand, Termiz, Denov) va valyuta kursini (USD, EUR, RUB) shu chatga yuboraman.",
  '',
  'Buyruqlar:',
  '/currency [kod] [YYYY-MM-DD] — valyuta kursi (CBU)',
  '/weather [kunlar] — ob-havo, 1 dan 7 kungacha',
  "/stop — kunlik xabarlarni to'xtatish",
].join('\n');

export const STOPPED = "Kunlik xabarlar to'xtatildi. Qayta yoqish uchun /start yuboring.";

export const WEATHER_HINT = "Kunlar soni 1 dan 7 gacha bo'lishi kerak, bugungi ob-havo ko'rsatildi.";

export const ERRORS = {
  bad_code: "Valyuta kodi noto'g'ri. Misol: /currency USD",
  bad_day: "Sana noto'g'ri. Format: YYYY-MM-DD, misol: /currency USD 2026-01-15",
  usage: 'Foydalanish: /currency [kod] [YYYY-MM-DD]',
  no_data: "Bu so'rov bo'yicha ma'lumot topilmadi.",
  fetch_failed: "Ma'lumotni olib bo'lmadi, birozdan keyin qayta urinib ko'ring.",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — every test file green. If the `formatWeather` equality test fails on `Math.round`, re-check the expected string against the sample data (`10.4 → 10`, `24.2 → 24`, `13.4 → 13`, `25.3 → 25`, `9.6 → 10`, `8.1 → 8`).

- [ ] **Step 5: Commit**

```bash
git add tgcloud/lib/format.js test/format.test.js
git commit -m "feat: add Uzbek message formatting

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Data sources, digest builder and preview endpoint

**Files:**
- Create: `tgcloud/lib/sources.js`
- Create: `tgcloud/lib/digest.js`
- Create: `tgcloud/endpoints/preview.js`

**Interfaces:**
- Consumes: `ratesUrl`, `parseRates`, `DEFAULT_CODES` (Task 3); `forecastUrl`, `parseForecast` (Task 4); `formatDigest` (Task 6); `tashkentNow`, `SLOTS` (Task 2).
- Produces:
  - `getRates({ code?: string, day?: string, codes?: string[] }): Promise<Rate[]>` — `code` set means fetch that one currency (optionally on `day`); otherwise fetch all of today (or of `day`) and filter to `codes`.
  - `getForecast(days: number): Promise<City[]>`
  - `buildDigest(slot, day: string): Promise<string>` — throws `Error('Both data sources failed')` only when both sources fail; otherwise returns text (with a warning line for a failed half).
  - Endpoint `endpoints/preview`: input `{ slot?: '06'|'12' }` (default `'06'`) → `{ text }`. Does not send anything.

These modules import `sdk`, so they cannot be unit-tested locally; they are verified with `tgcloud run`.

- [ ] **Step 1: Confirm the project is linked and runs**

Run: `npx tgcloud status`
Expected: prints the project/bot status without a login prompt. If it asks to log in, stop and ask the user to run `! npx tgcloud login`.

- [ ] **Step 2: Write `sources.js`**

`tgcloud/lib/sources.js`:

```js
// Outbound HTTP to CBU and Open-Meteo, with a timeout and one retry.

import { fetch } from 'sdk';
import { ratesUrl, parseRates } from './cbu.js';
import { forecastUrl, parseForecast } from './weather.js';

const TIMEOUT_MS = 8000;
const RETRIES = 1;

function withTimeout(promise, ms) {
  // setTimeout may not exist in the platform runtime; without it, rely on the platform's own limits.
  if (typeof setTimeout !== 'function') return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getJson(url) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await withTimeout(fetch(url), TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await withTimeout(res.json(), TIMEOUT_MS);
    } catch (e) {
      lastError = e;
      console.warn(`fetch failed (attempt ${attempt + 1}): ${e.message}`);
    }
  }
  throw lastError;
}

export async function getRates({ code, day, codes } = {}) {
  const json = await getJson(ratesUrl({ code, day }));
  return parseRates(json, code ? [code] : codes);
}

export async function getForecast(days) {
  return parseForecast(await getJson(forecastUrl(days)));
}
```

- [ ] **Step 3: Write `digest.js`**

`tgcloud/lib/digest.js`:

```js
// Builds the scheduled digest text. One failed source degrades the message; both failing is an error.

import { getRates, getForecast } from './sources.js';
import { DEFAULT_CODES } from './cbu.js';
import { formatDigest } from './format.js';

export async function buildDigest(slot, day) {
  const [weather, rates] = await Promise.allSettled([
    getForecast(1),
    getRates({ codes: DEFAULT_CODES }),
  ]);
  if (weather.status === 'rejected') console.error('weather failed', weather.reason);
  if (rates.status === 'rejected') console.error('rates failed', rates.reason);
  if (weather.status === 'rejected' && rates.status === 'rejected') {
    throw new Error('Both data sources failed');
  }
  return formatDigest({
    slot,
    day,
    weather: weather.status === 'fulfilled' ? weather.value : null,
    rates: rates.status === 'fulfilled' && rates.value.length > 0 ? rates.value : null,
  });
}
```

- [ ] **Step 4: Write the preview endpoint**

`tgcloud/endpoints/preview.js`:

```js
// Returns the digest text without sending it. Used to verify the data pipeline with `tgcloud run`.

import { buildDigest } from '../lib/digest.js';
import { SLOTS, tashkentNow } from '../lib/time.js';

export default async function (input) {
  const slot = SLOTS.find((s) => s.id === input?.slot) ?? SLOTS[0];
  return { text: await buildDigest(slot, tashkentNow().day) };
}
```

- [ ] **Step 5: Run it in the platform runtime**

Run: `npx tgcloud run endpoints/preview '{ slot: "12" }'`
Expected: the logs show no `fetch failed` lines and the returned `text` starts with `🗓 Tushlik xabar — <today DD.MM.YYYY>`, followed by a `🌤 Ob-havo` block with four cities and a `💱 Valyuta kursi (CBU)` block with USD, EUR and RUB lines.

If it fails:
- `setTimeout is not defined` or a `Timeout` error on every call: remove the `withTimeout` wrapping in `getJson` (call `fetch(url)` and `res.json()` directly) and re-run.
- `Both data sources failed`: read the logged `fetch failed` message; a 4xx/5xx means a URL bug in Task 3 or 4.

- [ ] **Step 6: Commit**

```bash
git add tgcloud/lib/sources.js tgcloud/lib/digest.js tgcloud/endpoints/preview.js
git commit -m "feat: add data sources, digest builder and preview endpoint

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Database schema

**Files:**
- Modify: `tgcloud/schema.js`

**Interfaces:**
- Produces named exports used by later tasks:
  - `users`: `id`, `tgId` (unique, not null), `firstName`, `username`, `startedAt` (timestamp, default now)
  - `chats`: `id`, `chatId` (unique, not null), `title`, `createdAt` (timestamp, default now)
  - `deliveries`: `id`, `chatId` (not null), `slot` (not null), `day` (not null); unique index on (`chatId`, `slot`, `day`)

- [ ] **Step 1: Write the schema**

Replace the contents of `tgcloud/schema.js` with:

```js
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
```

- [ ] **Step 2: Deploy and check the pending migration**

Run: `npx tgcloud push`
Expected: deploys the modules and reports pending DB changes (3 new tables) without applying them. If push reports a schema error (for example about `uniqueIndex` or `.unique()` after `.notNull()`), fix the declaration per `docs/tgcloud-sdk.md` and re-run.

- [ ] **Step 3: Apply the migration**

`migrate` is interactive, so ask the user to run it: `! npx tgcloud migrate`
Expected: it lists the three new tables and, after confirmation, applies them.

- [ ] **Step 4: Commit**

```bash
git add tgcloud/schema.js
git commit -m "feat: add users, chats and deliveries tables

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Scheduler and tick endpoint

**Files:**
- Create: `tgcloud/lib/tick.js`
- Create: `tgcloud/endpoints/tick.js`

**Interfaces:**
- Consumes: `chats`, `deliveries` (Task 8); `tashkentNow`, `dueSlots` (Task 2); `buildDigest` (Task 7).
- Produces:
  - `tick(date?: Date): Promise<{ sent: number }>` — idempotent. Claims `(chat, slot, day)` rows with `INSERT … ON CONFLICT DO NOTHING`, sends the digest to claimed chats, releases the claim on failure, deletes the chat on a 403.
  - Endpoint `endpoints/tick`: runs `tick()`. When invoked through `tgcloud run` (no verified `ctx.initData`) it honors `input.at` (an ISO timestamp) as the "current time", to allow testing outside real slot times. Over HTTP the platform always supplies `ctx.initData`, so `at` is ignored there and an HTTP caller cannot make the bot send for fake dates.

- [ ] **Step 1: Write `tick.js`**

`tgcloud/lib/tick.js`:

```js
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
```

- [ ] **Step 2: Write the endpoint**

`tgcloud/endpoints/tick.js`:

```js
// Target of the GitHub Actions cron: `npx tgcloud run endpoints/tick '{}'`.
// `input.at` (ISO timestamp) overrides "now" for testing, but only when there is no verified
// Mini App init data, i.e. when invoked through `tgcloud run`, never over HTTP.

import { tick } from '../lib/tick.js';

export default async function (input, ctx) {
  const at = !ctx?.initData && input?.at ? new Date(input.at) : new Date();
  return await tick(at);
}
```

- [ ] **Step 3: Verify outside a slot window returns immediately**

Run: `npx tgcloud run endpoints/tick '{ at: "2026-10-08T05:00:00Z" }'`
(10:00 Tashkent, between the windows.)
Expected: returns `{ sent: 0 }` with no errors in the logs.

- [ ] **Step 4: Verify inside a window with no subscribers**

Run: `npx tgcloud run endpoints/tick '{ at: "2026-10-08T01:05:00Z" }'`
(06:05 Tashkent.)
Expected: returns `{ sent: 0 }`, no errors. This also proves the `chats` select works against the migrated DB. Full send and idempotency are verified in Task 10 once a chat can subscribe.

- [ ] **Step 5: Commit**

```bash
git add tgcloud/lib/tick.js tgcloud/endpoints/tick.js
git commit -m "feat: add idempotent scheduler and tick endpoint

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Message handler and end-to-end verification

**Files:**
- Modify: `tgcloud/handlers/message.js`

**Interfaces:**
- Consumes: `users`, `chats` (Task 8); `parseCommand`, `parseWeatherDays`, `parseCurrencyArgs` (Task 5); `getRates`, `getForecast` (Task 7); `formatCurrency`, `formatWeather`, `GREETING`, `STOPPED`, `WEATHER_HINT`, `ERRORS` (Task 6); `DEFAULT_CODES` (Task 3); `tick` (Task 9).
- Produces: the bot's command behavior. Handler flow: parse command, run it (errors are caught and answered with `ERRORS.fetch_failed`), then run `tick()` in a try/catch so a scheduler failure never breaks command handling. Unknown commands are ignored (other bots in the group may own them).

- [ ] **Step 1: Write the handler**

Replace `tgcloud/handlers/message.js` with:

```js
// handlers/message.js — runs on each `message` update.

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { users, chats } from '../schema.js';
import { parseCommand, parseWeatherDays, parseCurrencyArgs } from '../lib/commands.js';
import { DEFAULT_CODES } from '../lib/cbu.js';
import { getRates, getForecast } from '../lib/sources.js';
import {
  formatCurrency, formatWeather, GREETING, STOPPED, WEATHER_HINT, ERRORS,
} from '../lib/format.js';
import { tick } from '../lib/tick.js';

const reply = (message, text) => api.sendMessage({ chat_id: message.chat.id, text });

async function start(message) {
  if (message.from) {
    await db
      .insert(users)
      .values({ tgId: message.from.id, firstName: message.from.first_name ?? null, username: message.from.username ?? null })
      .onConflictDoUpdate({
        target: users.tgId,
        set: { firstName: message.from.first_name ?? null, username: message.from.username ?? null },
      })
      .run();
  }
  await db
    .insert(chats)
    .values({ chatId: message.chat.id, title: message.chat.title ?? message.chat.first_name ?? null })
    .onConflictDoNothing()
    .run();
  await reply(message, GREETING);
}

async function stop(message) {
  await db.delete(chats).where(eq(chats.chatId, message.chat.id)).run();
  await reply(message, STOPPED);
}

async function currency(message, args) {
  const parsed = parseCurrencyArgs(args);
  if (parsed.error) return reply(message, ERRORS[parsed.error]);
  const rates = parsed.code
    ? await getRates({ code: parsed.code, day: parsed.day })
    : await getRates({ codes: DEFAULT_CODES });
  if (rates.length === 0) return reply(message, ERRORS.no_data);
  return reply(message, formatCurrency(rates));
}

async function weather(message, args) {
  const { days, hint } = parseWeatherDays(args);
  const text = formatWeather(await getForecast(days));
  return reply(message, hint ? `${WEATHER_HINT}\n\n${text}` : text);
}

const COMMANDS = { start, stop, currency, weather };

export default async function (message) {
  const cmd = parseCommand(message.text);
  const run = cmd && COMMANDS[cmd.name];
  if (run) {
    try {
      await run(message, cmd.args);
    } catch (e) {
      console.error(`/${cmd.name} failed`, e);
      try {
        await reply(message, ERRORS.fetch_failed);
      } catch (e2) {
        console.error('error reply failed', e2);
      }
    }
  }

  // Lazy scheduler wake-up. Never let it break command handling.
  try {
    await tick();
  } catch (e) {
    console.error('tick failed', e);
  }
}
```

- [ ] **Step 2: Run the local tests and deploy**

Run: `npm test && npx tgcloud push`
Expected: all local tests pass; push deploys without module or import errors.

- [ ] **Step 3: Verify commands in a DM**

Ask the user to message the bot in a private chat: `/start`, `/currency`, `/currency kzt`, `/currency usd 2026-01-15`, `/currency xx`, `/weather`, `/weather 3`, `/weather 9`, `/stop`, then `/start` again.
Expected: greeting; USD/EUR/RUB block; single KZT line; USD on 15.01.2026; the `bad_code` error; today's weather for 4 cities; a 3-day forecast; the hint line followed by today's weather; the stop message; the greeting again.

- [ ] **Step 4: Verify `tgcloud run` has real side effects and the scheduler is idempotent**

The user is now subscribed (their DM). Run the scheduler inside a window with a day that cannot collide with real days:

Run: `npx tgcloud run endpoints/tick '{ at: "2026-01-01T01:05:00Z" }'`
Expected: returns `{ sent: 1 }` and the user receives a message headed `🗓 Ertalabki xabar — 01.01.2026` (current weather and rates; only the heading date is the test date). This confirms `tgcloud run` really sends and writes the DB.

Run the exact same command again.
Expected: returns `{ sent: 0 }` and no new message arrives — the claim row blocked the duplicate.

Run: `npx tgcloud run endpoints/tick '{ at: "2026-01-01T07:05:00Z" }'`
Expected: `{ sent: 1 }` and a `Tushlik xabar — 01.01.2026` message (the 12 slot is a different claim).

If `tgcloud run` returns `{ sent: 1 }` but no message arrives, or `sent` is 0 on the first run while subscribed, stop and report: the spec's CI trigger (Task 11) depends on this, and the design must be revisited (see spec, "Known risks").

- [ ] **Step 5: Commit**

```bash
git add tgcloud/handlers/message.js
git commit -m "feat: add command handler with lazy scheduler wake-up

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: GitHub Actions cron and rollout

**Files:**
- Create: `.github/workflows/tick.yml`

**Interfaces:**
- Consumes: `endpoints/tick` (Task 9).
- Produces: a workflow that runs `npx tgcloud run endpoints/tick '{}'` every 5 minutes. Needs a repo secret named `TGCLOUD_TOKEN`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/tick.yml`:

```yaml
name: tick

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

# Overlapping runs are safe (tick is idempotent), but there is no reason to stack them.
concurrency:
  group: tick
  cancel-in-progress: false

jobs:
  tick:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Run scheduler
        run: npx tgcloud run endpoints/tick '{}'
        env:
          TGCLOUD_TOKEN: ${{ secrets.TGCLOUD_TOKEN }}
```

- [ ] **Step 2: Commit the workflow**

```bash
git add .github/workflows/tick.yml
git commit -m "ci: run the scheduler tick every 5 minutes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Ask the user to set up GitHub (manual)**

These steps need the user's GitHub account; do not attempt them with credentials from this machine. Ask the user to:
1. Create a **private** GitHub repository and push this project to it (`git remote add origin <url>`, `git push -u origin main`). The repo must be private because `TGCLOUD_TOKEN` can deploy code to the bot.
2. Get the CLI access token from @BotFather: the bot → Serverless → CLI Access → Access token (format `app<id>:<secret>`).
3. Add it in the repo under Settings → Secrets and variables → Actions → New repository secret, name `TGCLOUD_TOKEN`.
4. Run the workflow once from the Actions tab (`workflow_dispatch`).

Expected: the run is green and its log shows the `tgcloud run` output ending with a returned `{ sent: 0 }` (or `1` if a slot is currently due and not yet sent).

- [ ] **Step 4: Add the bot to the family group**

Ask the user to add the bot to the family group and send `/start` there, then `/currency` and `/weather 3`.
Expected: greeting, then correct replies. The group is now subscribed.

- [ ] **Step 5: Observe the first real scheduled slot**

After the next 06:00 or 12:00 Tashkent time, check that exactly one digest arrived in the group, within roughly 15 minutes of the slot, with the correct date in its heading.
Expected: one message per slot per day. If none arrived, check the Actions run history (GitHub can delay or skip scheduled runs) and run `npx tgcloud run endpoints/tick '{}'` by hand within the 3-hour window; the claim table guarantees it will not duplicate a message that was already sent.

- [ ] **Step 6 (optional): Disable privacy mode**

In @BotFather: `/mybots` → the bot → Bot Settings → Group Privacy → Turn off. After this the bot sees every group message, so the lazy wake-up in the handler also drives the scheduler. Re-add the bot to the group if Telegram requires it for the change to apply.

---

## Self-Review Notes

Checked against the spec:

- Data sources, cities, default currencies → Tasks 3, 4, 7.
- Database (`users` only on `/start`, `chats` iff subscribed, `deliveries` claim table) → Tasks 8, 10.
- Commands (`/start`, `/stop`, `/currency [CODE] [date]`, `/weather [1–7]`, hint fallback, unknown code or date errors) → Tasks 5, 6, 10.
- Scheduled digest format and "Ertalabki" / "Tushlik" headings → Tasks 6, 9.
- Scheduler (UTC+5, 3-hour window, atomic claim, release on failure, 403 unsubscribes, lazy and cron wake-ups) → Tasks 2, 9, 10, 11.
- Failure handling (timeout and one retry, degraded message, both fail means no send and claims released) → Tasks 7, 9.
- Testing (local pure tests, server-side checks) and known risks (`run` side effects, privacy mode, Actions timing) → Tasks 2–6, 10, 11.
- The spec deviations found while planning (`run` limited to `handlers/` and `endpoints/`; `TGCLOUD_TOKEN`) are written back into the spec in Task 1.

Type names used consistently: `Rate` = `{ code, nominal, rate, diff, date }`; `City` = `{ name, days[] }` with day `{ day, tmin, tmax, code, rain, wind }`; `slot` = `{ id, hour, title }`.
