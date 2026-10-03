/**
 * Seven-day numerical weather-model forecast from Open-Meteo.
 * This is a forecast estimate, not a local ground-station observation.
 */

export interface OpenMeteoForecast {
  provider: 'Open-Meteo';
  fetchedAt: string;
  timezone: string;
  modelNoticeBangla: string;
  modelNoticeEnglish: string;
  current: {
    time: string;
    temperatureC: number;
    apparentTemperatureC: number;
    relativeHumidityPct: number;
    precipitationMm: number | null;
    rainMm: number | null;
    windSpeedMs: number;
    windDirectionDeg: number;
    weatherCode: number;
  };
  hourly: Array<{
    time: string;
    temperatureC: number | null;
    precipitationProbabilityPct: number | null;
    precipitationMm: number | null;
    rainMm: number | null;
    weatherCode: number;
  }>;
  daily: Array<{
    date: string;
    weatherCode: number;
    temperatureMaxC: number | null;
    temperatureMinC: number | null;
    precipitationMm: number | null;
    rainMm: number | null;
    precipitationProbabilityMaxPct: number | null;
    windSpeedMaxMs: number | null;
  }>;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { cachedAt: number; forecast: OpenMeteoForecast }>();

const finite = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const finiteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function getOpenMeteoForecast(lat: number, lon: number): Promise<OpenMeteoForecast> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error('Invalid latitude or longitude');
  }

  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) return cached.forecast;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,wind_speed_10m,wind_direction_10m,weather_code',
    hourly: 'temperature_2m,precipitation_probability,precipitation,rain,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max',
    forecast_days: '7',
    timezone: 'auto',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
    wind_speed_unit: 'ms',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
    const data = await response.json() as any;
    const current = data?.current;
    const hourly = data?.hourly;
    const daily = data?.daily;
    if (!current || !hourly?.time?.length || !daily?.time?.length
      || !current.time || finiteOrNull(current.temperature_2m) === null || finiteOrNull(current.relative_humidity_2m) === null) {
      throw new Error('Open-Meteo returned an incomplete forecast');
    }

    const forecast: OpenMeteoForecast = {
      provider: 'Open-Meteo',
      fetchedAt: new Date().toISOString(),
      timezone: String(data.timezone || 'Asia/Dhaka'),
      modelNoticeBangla: 'এটি আবহাওয়া মডেলের পূর্বাভাস, স্থানীয় আবহাওয়া স্টেশনের মাপ নয়। একই উপজেলার মধ্যেও আবহাওয়া ভিন্ন হতে পারে।',
      modelNoticeEnglish: 'This is a weather-model forecast, not a local weather-station observation. Conditions may vary within an upazila.',
      current: {
        time: String(current.time || ''),
        temperatureC: finite(current.temperature_2m),
        apparentTemperatureC: finite(current.apparent_temperature),
        relativeHumidityPct: finite(current.relative_humidity_2m),
        precipitationMm: finiteOrNull(current.precipitation),
        rainMm: finiteOrNull(current.rain),
        windSpeedMs: finite(current.wind_speed_10m),
        windDirectionDeg: finite(current.wind_direction_10m),
        weatherCode: finite(current.weather_code, -1),
      },
      hourly: hourly.time.map((time: string, index: number) => ({
        time: String(time),
        temperatureC: finiteOrNull(hourly.temperature_2m?.[index]),
        precipitationProbabilityPct: finiteOrNull(hourly.precipitation_probability?.[index]),
        precipitationMm: finiteOrNull(hourly.precipitation?.[index]),
        rainMm: finiteOrNull(hourly.rain?.[index]),
        weatherCode: finite(hourly.weather_code?.[index], -1),
      })),
      daily: daily.time.map((date: string, index: number) => ({
        date: String(date),
        weatherCode: finite(daily.weather_code?.[index], -1),
        temperatureMaxC: finiteOrNull(daily.temperature_2m_max?.[index]),
        temperatureMinC: finiteOrNull(daily.temperature_2m_min?.[index]),
        precipitationMm: finiteOrNull(daily.precipitation_sum?.[index]),
        rainMm: finiteOrNull(daily.rain_sum?.[index]),
        precipitationProbabilityMaxPct: finiteOrNull(daily.precipitation_probability_max?.[index]),
        windSpeedMaxMs: finiteOrNull(daily.wind_speed_10m_max?.[index]),
      })),
    };
    cache.set(key, { cachedAt: now, forecast });
    return forecast;
  } finally {
    clearTimeout(timeout);
  }
}
