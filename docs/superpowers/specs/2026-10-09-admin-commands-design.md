# Admin Commands Design

Add read-only admin commands to the family daily bot so the owner can see who uses it.

## Goal

Let an admin list users and subscribed chats and see simple usage stats, from a private chat with the bot. No web front-end.

## Scope

In: `/users [page]`, `/chats [page]`, `/stats`. Read-only.
Out: any write action (remove chat, broadcast), a Mini App panel, changes to the schema.

## Access control

- Admin ids live in one constant, `ADMIN_IDS`, in `tgcloud/lib/admin.js`. Initial value: `[5948687547]`. Telegram user ids are not secrets.
- A command runs only when both hold: `message.chat.type === 'private'` and `message.from.id` is in `ADMIN_IDS`.
- Otherwise the command is ignored with no reply (same as an unknown command), so non-admins cannot tell the commands exist. The lazy `tick()` wake-up still runs afterwards, as for every message.
- The commands are not added to the BotFather command menu or to any greeting text.

## Commands

| Command | Output |
|---|---|
| `/users [page]` | Total users, then 20 per page, newest `startedAt` first: name, `@username` (or `-`), Telegram id, `/start` date (`DD.MM.YYYY`, Tashkent). Footer shows `page N/M` when there is more than one page. |
| `/chats [page]` | Total subscribed chats, then 20 per page, newest `createdAt` first: title (or `-`), chat id, subscribed date. Same footer. |
| `/stats` | Total users, total chats, and for today's Tashkent day the number of `deliveries` rows per slot (`06`, `12`). |

- `page` is a positive integer; missing, invalid or out of range falls back to page 1 (or the last page when too large).
- Output is plain text (no `parse_mode`), so user-controlled names cannot inject markup. Each name/title is cut to 40 characters. A full page stays well under Telegram's 4096-character limit.
- Bot text is Uzbek (Latin), like the rest of the bot. Admin labels are short.

## Code layout

- `tgcloud/lib/admin.js` (new, pure, no `sdk` import): `ADMIN_IDS`, `isAdmin(message)`, `parsePage(args, totalPages)`, `formatUsers`, `formatChats`, `formatStats`. Locally testable.
- `tgcloud/handlers/message.js` (modify): add `users`, `chats`, `stats` to `COMMANDS`; a guard calls `isAdmin` before running them. DB queries (count, order by, limit/offset, count of `deliveries` where `day` = today) are in the handler because only it may import `sdk`.
- `test/admin.test.js` (new): `isAdmin` (admin in private, admin in group, non-admin, missing `from`), `parsePage`, formatters (empty list, full page, long name, `-` placeholders).
- `tgcloud/schema.js`: unchanged. No migration.

## Errors

A failing admin command is answered with the existing `ERRORS.fetch_failed` through the handler's current try/catch. Non-admins get nothing.

## Verification

1. `npm test` passes with the new tests.
2. After `push`, from the admin account in a private chat: `/users`, `/chats`, `/stats`, `/users 99` return sensible output.
3. A non-admin (or the admin from a group) gets no reply to the three commands.

## Known limits

- Admin list changes need a code edit and `push`.
- Users and chats lists reflect only people who sent `/start` and subscribed chats.
