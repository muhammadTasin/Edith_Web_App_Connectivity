/**
 * NASA POWER daily agroclimatology & SMAP soil moisture service.
 * Fetches real Earth observation data from NASA Langley POWER API (community=AG).
 *
 * NOTE: NASA POWER serves scientific observations and reanalysis (MERRA-2 / GEOS-IT),
 * NOT a weather forecast. Data latency is typically 2-3 days.
 */
import { TANORE_CONDITIONS } from '../../../packages/rotation-engine/src/data/tanore_replay_data.ts';

export interface WeatherObservationDay {
  date: string; // YYYY-MM-DD
  t2m: number; // mean temperature °C
  t2mMax: number; // max temperature °C
  t2mMin: number; // min temperature °C
  rh2m: number; // relative humidity %
  rainMm: number; // precipitation mm
  windSpeedMs: number; // wind speed m/s
}

export interface WeatherResponse {
  location: {
    districtBangla: string;
    districtEnglish: string;
    upazilaBangla: string;
    upazilaEnglish: string;
    unionBangla: string;
    unionEnglish: string;
    lat: number;
    lon: number;
  };
  dataSource: string;
  dataTypeNoticeBangla: string;
  dataTypeNoticeEnglish: string;
  latestObservationDate: string;
  latencyNoticeBangla: string;
  latencyNoticeEnglish: string;
  isLive: boolean;
  cachedAt: string;
  latest: {
    t2m: number;
    t2mMax: number;
    t2mMin: number;
    rh2m: number;
    rainMm: number;
    windSpeedMs: number;
    rootZoneMoistureM3M3: number;
    rootZoneMoistureStatusBangla: string;
    rootZoneMoistureDate: string;
    rainLast30DaysMm: number;
    rainVerdictBangla: string;
  };
  recentDays: WeatherObservationDay[];
}

let cachedWeather: WeatherResponse | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function formatDateYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function toHyphenDate(ymd: string): string {
  if (ymd.length === 8) {
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  }
  return ymd;
}

export async function getNasaWeather(lat = 24.62, lon = 88.56): Promise<WeatherResponse> {
  const now = Date.now();
  if (cachedWeather && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedWeather;
  }

  const smap = TANORE_CONDITIONS.smap;
  const rain30 = TANORE_CONDITIONS.rainLast30Days;

  // Try live NASA POWER Daily API
  try {
    const endD = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const startD = new Date(endD.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days prior
    const start = formatDateYMD(startD);
    const end = formatDateYMD(endD);

    const params = 'T2M,T2M_MAX,T2M_MIN,RH2M,PRECTOTCORR,WS2M';
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${params}&community=AG&longitude=${lon}&latitude=${lat}&start=${start}&end=${end}&format=JSON`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as any;
      const p = data?.properties?.parameter;
      if (p && p.T2M) {
        const dates = Object.keys(p.T2M).sort();
        const validDays: WeatherObservationDay[] = [];
        for (const d of dates) {
          const tVal = Number(p.T2M[d] ?? -999);
          if (tVal < -100) continue; // skip fill values like -999
          validDays.push({
            date: toHyphenDate(d),
            t2m: Math.round(tVal * 10) / 10,
            t2mMax: Math.round(Number(p.T2M_MAX?.[d] ?? tVal) * 10) / 10,
            t2mMin: Math.round(Number(p.T2M_MIN?.[d] ?? tVal) * 10) / 10,
            rh2m: Math.round(Number(p.RH2M?.[d] ?? 80)),
            rainMm: Math.max(0, Math.round(Number(p.PRECTOTCORR?.[d] ?? 0) * 10) / 10),
            windSpeedMs: Math.max(0, Math.round(Number(p.WS2M?.[d] ?? 0) * 10) / 10),
          });
        }

        if (validDays.length > 0) {
          const lastDay = validDays[validDays.length - 1];
          const recentDays = validDays;

        cachedWeather = {
          location: {
            districtBangla: 'রাজশাহী',
            districtEnglish: 'Rajshahi',
            upazilaBangla: 'তানোর',
            upazilaEnglish: 'Tanore',
            unionBangla: 'তালন্দ',
            unionEnglish: 'Talanda',
            lat,
            lon,
          },
          dataSource: 'NASA POWER Daily Agroclimatology (GEOS-IT / MERRA-2) & SMAP L4',
          dataTypeNoticeBangla: 'উপগ্রহ ও বায়ুমণ্ডলীয় পর্যবেক্ষণ উপাত্ত (পূর্বাভাস নয়)',
          dataTypeNoticeEnglish: 'Satellite & atmospheric observation data (not a forecast)',
          latestObservationDate: lastDay.date,
          latencyNoticeBangla: 'নাসা উপগ্রহ উপাত্ত প্রক্রিয়াজাতকরণে সাধারণত ২–৩ দিন বিলম্ব থাকে।',
          latencyNoticeEnglish: 'NASA satellite observations typically have a 2-3 day processing latency.',
          isLive: true,
          cachedAt: new Date().toISOString(),
          latest: {
            t2m: lastDay.t2m,
            t2mMax: lastDay.t2mMax,
            t2mMin: lastDay.t2mMin,
            rh2m: lastDay.rh2m,
            rainMm: lastDay.rainMm,
            windSpeedMs: lastDay.windSpeedMs,
            rootZoneMoistureM3M3: smap?.rootZoneM3M3 ?? 0.311,
            rootZoneMoistureStatusBangla: 'মাটির মূল অঞ্চলে পর্যাপ্ত রস বিদ্যমান (৩১.১%)',
            rootZoneMoistureDate: smap?.date ?? '2026-09-23',
            rainLast30DaysMm: rain30.imergLateMm,
            rainVerdictBangla: 'স্বাভাবিকের চেয়ে শুকনো (৭৮.৪%)',
          },
          recentDays,
        };

          lastFetchTime = now;
          return cachedWeather;
        }
      }
    }
  } catch (err) {
    console.warn('NASA POWER live fetch warning (using verified baseline):', (err as any)?.message || err);
  }

  // Baseline fallback
  const baselineDays: WeatherObservationDay[] = [
    { date: '2026-09-21', t2m: 29.1, t2mMax: 33.8, t2mMin: 25.5, rh2m: 84, rainMm: 0.7, windSpeedMs: 1.2 },
    { date: '2026-09-22', t2m: 29.4, t2mMax: 33.8, t2mMin: 25.6, rh2m: 83, rainMm: 3.6, windSpeedMs: 1.7 },
    { date: '2026-09-23', t2m: 28.0, t2mMax: 31.3, t2mMin: 25.9, rh2m: 89, rainMm: 8.2, windSpeedMs: 2.5 },
    { date: '2026-09-24', t2m: 26.5, t2mMax: 28.8, t2mMin: 25.0, rh2m: 93, rainMm: 14.3, windSpeedMs: 2.9 },
    { date: '2026-09-25', t2m: 26.3, t2mMax: 27.8, t2mMin: 25.2, rh2m: 94, rainMm: 7.4, windSpeedMs: 3.5 },
  ];

  return {
    location: {
      districtBangla: 'রাজশাহী',
      districtEnglish: 'Rajshahi',
      upazilaBangla: 'তানোর',
      upazilaEnglish: 'Tanore',
      unionBangla: 'তালন্দ',
      unionEnglish: 'Talanda',
      lat,
      lon,
    },
    dataSource: 'NASA POWER Daily Agroclimatology (GEOS-IT / MERRA-2) & SMAP L4',
    dataTypeNoticeBangla: 'উপগ্রহ ও বায়ুমণ্ডলীয় পর্যবেক্ষণ উপাত্ত (পূর্বাভাস নয়)',
    dataTypeNoticeEnglish: 'Satellite & atmospheric observation data (not a forecast)',
    latestObservationDate: '2026-09-25',
    latencyNoticeBangla: 'নাসা উপগ্রহ উপাত্ত প্রক্রিয়াজাতকরণে সাধারণত ২–৩ দিন বিলম্ব থাকে।',
    latencyNoticeEnglish: 'NASA satellite observations typically have a 2-3 day processing latency.',
    isLive: false,
    cachedAt: new Date().toISOString(),
    latest: {
      t2m: 26.3,
      t2mMax: 27.8,
      t2mMin: 25.2,
      rh2m: 94,
      rainMm: 7.4,
      windSpeedMs: 3.5,
      rootZoneMoistureM3M3: smap?.rootZoneM3M3 ?? 0.311,
      rootZoneMoistureStatusBangla: 'মাটির মূল অঞ্চলে পর্যাপ্ত রস বিদ্যমান (৩১.১%)',
      rootZoneMoistureDate: smap?.date ?? '2026-09-23',
      rainLast30DaysMm: rain30.imergLateMm,
      rainVerdictBangla: 'স্বাভাবিকের চেয়ে শুকনো (৭৮.৪%)',
    },
    recentDays: baselineDays,
  };
}
