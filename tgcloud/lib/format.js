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
