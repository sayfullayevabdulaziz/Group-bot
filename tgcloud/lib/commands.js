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
