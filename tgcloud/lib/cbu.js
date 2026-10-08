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
