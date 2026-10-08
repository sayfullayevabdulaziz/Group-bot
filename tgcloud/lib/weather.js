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
