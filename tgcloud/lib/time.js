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
