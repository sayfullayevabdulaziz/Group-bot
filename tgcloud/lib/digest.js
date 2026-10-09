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
