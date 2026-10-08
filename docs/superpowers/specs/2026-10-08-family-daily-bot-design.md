# Family Daily Bot — Design

Date: 2026-10-08

## Goal

A Telegram bot for a family group that posts the most essential daily information — weather and currency exchange rates — automatically at 06:00 and 12:00 (Asia/Tashkent), and answers on demand to `/currency` and `/weather`. All bot text is Uzbek (Latin).

## Platform constraints

The bot runs on the tgcloud serverless platform (see `AGENTS.md`, `docs/tgcloud-sdk.md`):

- Code lives in `tgcloud/`; only the `sdk` and project modules exist at runtime (no npm packages, no filesystem).
- Handlers run only on Telegram updates. Endpoints require Mini App init data. There is **no cron or timer**, and the docs and CLI show no scheduler.
- The database is SQLite through `sdk/db`. It is passive storage and cannot wake code, so the scheduler needs an external wake-up (see Scheduler).
- No foreign keys; every DB call is awaited.

## Data sources

- **Currency:** CBU (`https://cbu.uz/uz/arkhiv-kursov-valyut/json/`).
  - `/json/` — today, all currencies.
  - `/json/<CODE>/<YYYY-MM-DD>/` — one currency on a date.
  - `/json/all/<YYYY-MM-DD>/` — all currencies on a date.
  - Fields used: `Ccy`, `Rate`, `Diff` (change vs the previous rate), `Date`.
- **Weather:** Open-Meteo forecast API (free, no key), `timezone=Asia/Tashkent`. Daily variables: max and min temperature, WMO weather code, max precipitation probability, max wind speed. Chosen over Google Maps Weather API, which needs a Cloud project, billing and an API key.
- **Cities** (hardcoded latitude, longitude), in display order: Toshkent (41.31, 69.24), Samarqand (39.65, 66.96), Termiz (37.22, 67.28), Denov (38.27, 67.90).
- **Default currencies:** USD, EUR, RUB.

## File layout

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

## Database

- `users` — `tg_id` (unique), `first_name`, `username`, `started_at`. Written **only** when a user sends `/start` (upsert by `tg_id`).
- `chats` — `chat_id` (unique), `title`, `created_at`. This is the list of chats that receive the scheduled digest: a row exists if and only if the chat is subscribed. A digest is addressed to a chat, not to a user (a group's id differs from its members' ids), so this table is needed. `/start` inserts the row, `/stop` deletes it, and a 403 on send deletes it.
- `deliveries` — `chat_id`, `slot` (`'06'` | `'12'`), `day` (Tashkent date `YYYY-MM-DD`); unique index on all three. This is the scheduler's claim table.

## Commands

All replies are Uzbek (Latin). A `@botname` suffix on a command is stripped.

- `/start` — upsert the user, insert the chat as a subscriber, reply with a greeting listing the commands and the 06:00 / 12:00 schedule.
- `/stop` — delete the chat's subscription.
- `/currency` — USD, EUR and RUB for today with the change since the previous rate (from `Diff`).
  - `/currency <CODE>` — a single currency, e.g. `/currency KZT`.
  - `/currency <CODE> <YYYY-MM-DD>` — that currency on a past date.
  - An unknown code or malformed date gets a short Uzbek error message.
- `/weather [days]` — all four cities. Default is 1 day (today). Valid range is 1–7, so four cities times seven days fits in one Telegram message. Non-numeric or out-of-range input falls back to the default with a hint.

Example `/currency` output:

```
💱 Valyuta kursi (CBU) — 08.10.2026
🇺🇸 USD: 12 650.00 so'm (▲ 12.40)
🇪🇺 EUR: 14 710.50 so'm (▼ 30.10)
🇷🇺 RUB: 155.20 so'm (▲ 0.40)
```

Example `/weather` output:

```
🌤 Ob-havo — 08.10.2026
📍 Toshkent
  Bugun: 14°…26° ☀️ Ochiq, yomg'ir 5%, shamol 12 km/s
📍 Samarqand
  ...
```

## Scheduled digest

One message per slot: today's weather block followed by the currency block. The 06:00 message is headed "Ertalabki", the 12:00 message "Tushlik"; the format is otherwise identical.

## Scheduler (`lib/tick.js`)

`tick()` is idempotent and is called from two places:

1. `handlers/message.js`, on every incoming message (the "lazy" wake-up).
2. A GitHub Actions workflow every 5 minutes running `npx tgcloud run endpoints/tick '{}'` (`tgcloud run` only accepts modules in `handlers/` and `endpoints/`; CI authenticates with the `TGCLOUD_TOKEN` environment variable, stored as a repo secret).

Algorithm:

1. Compute the Tashkent time as UTC+5 (no DST, so a fixed offset is correct) and today's Tashkent date.
2. A slot is due when now is at or after the slot time and within 3 hours of it (06:00–09:00 and 12:00–15:00). The grace window prevents a stale morning digest from being sent late in the evening.
3. For each due slot and each row in `chats`, `INSERT INTO deliveries … ON CONFLICT DO NOTHING`. If a row was inserted, this caller owns the send; otherwise another caller already claimed it.
4. Build the digest once per tick and send it to each owned chat.
5. If sending throws a `BotApiError`, delete that chat's claim row so a later tick within the window retries. On 403 (bot kicked or blocked), also delete the chat's `chats` row.

The slot-due computation is a pure function so it can be unit-tested.

## Failure handling

- Each source fetch has a timeout and one retry.
- If one source fails, the message is still sent with the other half plus a line such as "⚠️ Valyuta ma'lumoti hozircha mavjud emas".
- If both sources fail, nothing is sent; for the scheduler the claim rows are deleted so the next tick retries within the grace window. Commands reply with an error message.

## Testing

- Local `node --test` tests in `test/` for the pure parts: `format.js`, CBU and Open-Meteo response parsing, Tashkent time and slot-due logic, and command argument parsing.
- Server-side checks with `npx tgcloud run endpoints/preview` and `npx tgcloud run endpoints/tick`: confirm fetches work in the platform runtime, and that running `tick()` twice in a row sends once.

## Known risks to verify early

- **Privacy mode.** With Telegram's default privacy mode a bot in a group sees only commands, not every message, so the lazy wake-up fires only on commands. The Actions ping is then the real scheduler. Disabling privacy mode in BotFather makes the lazy path effective.
- **`tgcloud run` side effects and CI auth.** It is not yet confirmed that `tgcloud run` executes with real side effects (sending messages, writing the DB). CI auth is known: the CLI reads `TGCLOUD_TOKEN`. Note this token can deploy code, so the repo must be private. This is checked in Task 10; if it does not work, the fallback is an alternative trigger (to be re-brainstormed).
- **GitHub Actions timing.** Scheduled workflows can be delayed or skipped under load; the lazy path and the 3-hour window mitigate this.

## Rollout

1. Update `schema.js`; `npx tgcloud push`, then `npx tgcloud migrate`.
2. Push the code and test the commands in a DM with the bot.
3. Add the bot to the family group, send `/start`, check `/currency` and `/weather 3`.
4. Add the Actions workflow and secret, trigger it with `workflow_dispatch`; confirm one digest arrives and a second run sends nothing.
5. Optionally disable privacy mode in BotFather.

## Out of scope

Per-user preferences, changing schedule times by command, cities beyond the four, a Mini App.
