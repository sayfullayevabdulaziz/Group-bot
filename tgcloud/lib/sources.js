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
