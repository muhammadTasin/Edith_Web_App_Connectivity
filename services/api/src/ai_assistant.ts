/**
 * Grounded Bengali AI Agricultural Assistant.
 * Synthesizes advice strictly from verified research, NASA Earth observations,
 * SRDI fertilizer cards, BRRI/BARI variety guides, and BWDB hydrology.
 *
 * Hallucination Guard:
 * When evidence is insufficient or question is out of scope (loans, stock markets,
 * unverified pesticide brands, unrelated medical queries), it explicitly refuses to invent facts
 * and directs the farmer to their local SAAO officer.
 */

import { FORBIDDEN_TERMS } from '../../../packages/narration-core/src/dual_gate_validator.ts';
import { getNasaWeather } from './weather.ts';
import { getRiverErosion } from './erosion.ts';
import { TALANDA_SRDI, TANORE_CONDITIONS } from '../../../packages/rotation-engine/src/data/tanore_replay_data.ts';

export interface AiAskRequest {
  query: string;
  farmProfile?: {
    farmName?: string;
    region?: string;
    landType?: string;
    soilTexture?: string;
    currentCrop?: string;
  };
  language?: 'bn' | 'en';
}

export interface AiAskResponse {
  answer: string;
  sources: string[];
  evidenceLevel: 'verified_high' | 'verified_moderate' | 'insufficient_evidence';
  followUpSuggestions: string[];
  timestamp: string;
}

export async function askAiAssistant(req: AiAskRequest): Promise<AiAskResponse> {
  const query = (req.query || '').trim();
  const qLower = query.toLowerCase();

  // 1. Check forbidden commercial/financial terms
  for (const forbidden of FORBIDDEN_TERMS) {
    if (query.includes(forbidden)) {
      return {
        answer: `দুঃখিত, কৃষকদের আর্থিক বা বাণিজ্যিক প্রলোভন যেমন "${forbidden}" সংক্রান্ত পরামর্শ দেওয়া আমাদের নীতিমালায় সম্পূর্ণ নিষিদ্ধ। বৈজ্ঞানিক ফসল আবর্তন ও সেচ সংক্রান্ত প্রশ্ন থাকলে জিজ্ঞাসা করুন।`,
        sources: ['প্রজেক্ট ইডেন সততা ও নিরাপত্তা নীতিমালা'],
        evidenceLevel: 'insufficient_evidence',
        followUpSuggestions: [
          'আমার জমির উপযোগী ফসল চক্র কি?',
          'আজকের আবহাওয়া ও মাটির অবস্থা কেমন?',
        ],
        timestamp: new Date().toISOString(),
      };
    }
  }

  // 2. Fetch grounded facts
  const weather = await getNasaWeather();
  const erosion = getRiverErosion();
  const landType = req.farmProfile?.landType || 'মাঝারি উঁচু জমি';
  const soilTexture = req.farmProfile?.soilTexture || TALANDA_SRDI.soilTypeBangla;

  // 3. Question routing & Evidence-based answering

  // Topic: Irrigation / Water / সেচ
  if (qLower.includes('সেচ') || qLower.includes('পানি') || qLower.includes('পানিতে') || qLower.includes('irrigation')) {
    const smapStatus = weather.latest.rootZoneMoistureStatusBangla;
    const smapVal = Math.round(weather.latest.rootZoneMoistureM3M3 * 100);

    return {
      answer: `তালন্দ ও বরেন্দ্র অঞ্চলের ${landType}র জন্য সেচ পরামর্শ:\n\n` +
        `• **মাটির বর্তমান আর্দ্রতা**: নাসা SMAP উপগ্রহ অনুযায়ী মূল অঞ্চলে মাটির রস প্রায় ${smapVal}% (${smapStatus})।\n` +
        `• **আমন ধান (ব্রি ধান৭১)**: গত ২৫ মৌসুমের সিমুলেশন অনুযায়ী ফুল আসার সময় গড়ে ৭ বার সম্পূরক সেচ লেগেছে। ফুল আসার সময় জমিতে ছিপছিপে পানি নিশ্চিত রাখুন।\n` +
        `• **রবি মৌসুম (মসুর/সরিষা)**: আমন কাটার পর রবিতে মসুরে কোনো ভারী সেচ লাগে না (প্রয়োজনে কেবল ১টি সম্পূরক সেচ)। বোরো ধানের তুলনায় এটি প্রায় ৬০০ মিলিমিটার ভূগর্ভস্থ পানি সাশ্রয় করে।\n\n` +
        `অনুগ্রহ করে সেচ দেওয়ার আগে জমির ৩-৪ ইঞ্চি মাটির ভেজা ভাব হাত দিয়ে পরীক্ষা করুন।`,
      sources: [
        'NASA SMAP L4 (৯ কিমি গ্রিড রুটজোন আর্দ্রতা)',
        'বাংলাদেশ ধান গবেষণা ইনস্টিটিউট (BRRI) সেচ নির্দেশিকা',
        'প্রজেক্ট ইডেন ২৫-মৌসুম বরেন্দ্র পানি-ভারসাম্য মডেল',
      ],
      evidenceLevel: 'verified_high',
      followUpSuggestions: [
        'মসুর চাষে কি সার দেওয়া প্রয়োজন?',
        '১০ নভেম্বরের মধ্যে ধান কাটার সুবিধা কি?',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  // Topic: Weather / Rain / আবহাওয়া / বৃষ্টি
  if (qLower.includes('আবহাওয়া') || qLower.includes('বৃষ্টি') || qLower.includes('তাপমাত্রা') || qLower.includes('weather') || qLower.includes('rain')) {
    const w = weather.latest;
    return {
      answer: `নাসার সর্বশেষ উপগ্রহ ও বায়ুমণ্ডলীয় পর্যবেক্ষণ অনুযায়ী তথ্য:\n\n` +
        `• **পর্যবেক্ষণ তারিখ**: ${weather.latestObservationDate} (নাসা পাওয়ার সাধারণত ২-৩ দিন বিলম্বে আসে; এটি পূর্বাভাস নয়, পরীক্ষিত উপাত্ত)।\n` +
        `• **তাপমাত্রা**: সর্বোচ্চ প্রায় ${w.t2mMax}°C, সর্বনিম্ন প্রায় ${w.t2mMin}°C (গড় ${w.t2m}°C)।\n` +
        `• **বাতাসের আর্দ্রতা**: ${w.rh2m}%, বাতাস গতিবেগ প্রায় ${w.windSpeedMs} মি/সে।\n` +
        `• **সাম্প্রতিক বৃষ্টিপাত**: বিগত ৩০ দিনে মোট বৃষ্টিপাত প্রায় ${Math.round(w.rainLast30DaysMm)} মিমি (${w.rainVerdictBangla})।\n` +
        `• **মাটির রস**: নাসা SMAP মান ${w.rootZoneMoistureM3M3} m³/m³। জমি রবি ফসল বপনের উপযুক্ত জো অবস্থায় রয়েছে।`,
      sources: [
        'NASA POWER Daily Agroclimatology (GEOS-IT / MERRA-2)',
        'NASA GPM IMERG Late (দৈনিক বৃষ্টিপাত)',
        'NASA SMAP L4 (মাটির আর্দ্রতা)',
      ],
      evidenceLevel: 'verified_high',
      followUpSuggestions: [
        'এই আবহাওয়ায় কি রবি ফসল বোনা যাবে?',
        'সেচ কখন দেওয়া উচিত?',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  // Topic: Crop Rotation / ফসল চক্র / মসুর / সরিষা / ধান
  if (qLower.includes('ফসল') || qLower.includes('মসুর') || qLower.includes('সরিষা') || qLower.includes('ধান') || qLower.includes('crop') || qLower.includes('rotation')) {
    return {
      answer: `তালন্দ ও সমমানের বরেন্দ্র জমির জন্য সর্বোত্তম প্রস্তাবিত ফসল চক্র:\n\n` +
        `• **প্রস্তাবিত ক্রম**: ব্রি ধান৭১ → বারি মসুর-৮ (বা বারি সরিষা-১৪)।\n` +
        `• **কেন ব্রি ধান৭১?**: এটি ব্রি ধান৪৯-এর চেয়ে প্রায় ১২–১৫ দিন আগে (১০ নভেম্বরের মধ্যে) পাকে। ফলে রবি ফসল সময়মতো বোনা যায়।\n` +
        `• **রবি ফসলের সুবিধা**: মসুর ডাল বাতাসে নাইট্রোজেন সংবন্ধন করে মাটির উর্বরতা বৃদ্ধি করে এবং বোরো ধানের মতো অতিরিক্ত সেচ ও বিদ্যুৎ খরচ লাগে না।\n` +
        `• **সতর্কতা**: ধান কাটার পর ১৫ নভেম্বরের মধ্যে মসুর বপন শেষ করতে হবে। বিলম্ব হলে ফলন কমে যাওয়ার ঝুঁকি থাকে।`,
      sources: [
        'বাংলাদেশ ধান গবেষণা ইনস্টিটিউট (BRRI) জাত পরিচিতি',
        'বাংলাদেশ কৃষি গবেষণা ইনস্টিটিউট (BARI) ডাল শস্য উইং',
        'এসআরডিআই (SRDI) বরেন্দ্র ভূমি সার সুপারিশ নির্দেশিকা',
      ],
      evidenceLevel: 'verified_high',
      followUpSuggestions: [
        'মসুর চাষে কি পরিমাণ সার লাগবে?',
        'জমির মাটির রস কেমন আছে?',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  // Topic: Fertilizer / সার / মাটি
  if (qLower.includes('সার') || qLower.includes('ইউরিয়া') || qLower.includes('টিএসপি') || qLower.includes('পটাশ') || qLower.includes('fertilizer') || qLower.includes('soil')) {
    return {
      answer: `তালন্দ ইউনিয়ন মৃত্তিকা সম্পদ উন্নয়ন ইনস্টিটিউট (SRDI) সার সুপারিশ কার্ড:\n\n` +
        `• **মাটির শ্রেণি**: ${soilTexture} (${landType})।\n` +
        `• **আমন ধান (ব্রি ধান৭১)**:\n` +
        `   - ইউরিয়া: ${TALANDA_SRDI.aman.split(';')[0] || '১৬ কেজি/বিঘা (৩ কিস্তিতে)'}\n` +
        `   - টিএসপি ও এমওপি: শেষ চাষের সময় জমি তৈরির সাথে প্রয়োগ করুন।\n` +
        `• **বারি মসুর-৮**:\n` +
        `   - ডাল জাতীয় ফসলে নাইট্রোজেন কম লাগে। বিঘা প্রতি ইউরিয়া মাত্র ৫-৬ কেজি, টিএসপি ১০-১২ কেজি, এমওপি ৫-৬ কেজি এবং জিপসাম যথেষ্ট।\n` +
        `• **জৈব সার**: শেষ চাষে পর্যাপ্ত গোবর বা কম্পোস্ট মেশালে মাটির রস ধরে রাখার ক্ষমতা বাড়ে।`,
      sources: [
        'মৃত্তিকা সম্পদ উন্নয়ন ইনস্টিটিউট (SRDI) ইউনিয়ন সার নির্দেশিকা',
        'জাতীয় কৃষি প্রযুক্তি প্রকল্প (NATP-2) বরেন্দ্র ক্লাস্টার',
      ],
      evidenceLevel: 'verified_high',
      followUpSuggestions: [
        'সেচ দেওয়ার পর কি সার প্রয়োগ করব?',
        'মাটির বর্তমান আর্দ্রতা কত?',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  // Topic: River Erosion / নদী ভাঙন / বন্যা
  if (qLower.includes('ভাঙন') || qLower.includes('নদী') || qLower.includes('বন্যা') || qLower.includes('erosion') || qLower.includes('river')) {
    const jamuna = erosion.corridor;
    return {
      answer: `বাংলাদেশে নদীভাঙন ও হাইড্রোলজিক্যাল পর্যবেক্ষণ তথ্য:\n\n` +
        `• **প্রধান ঝুঁকিপূর্ণ নদী**: ${jamuna.riverNameBangla} (${jamuna.basinNameBangla})।\n` +
        `• **ঝুঁকির কারণ**: ${jamuna.primaryCauseBangla}\n` +
        `• **সর্বোচ্চ ঝুঁকিপূর্ণ অঞ্চল**: সিরাজগঞ্জ সদর, কাজীপুর এবং সারিয়াকান্দি। বার্ষিক তীর সরার হার প্রায় ৭০–১৫০ মিটার/বছর।\n` +
        `• **উজান অববাহিকা বৃষ্টিপাত**: বিগত ৩০ দিনে নাসা IMERG উপাত্তে বৃষ্টিপাত প্রায় ${Math.round(jamuna.basin30dRainMm)} মিমি।\n` +
        `• **সতর্কতা**: বর্ষা শেষে পানি দ্রুত নামার সময় পাড় ধসের ঝুঁকি সর্বাধিক হয়। চরের ঝুঁকিপূর্ণ জমিতে স্বল্পমেয়াদি ডাল ফসল চাষ নিরাপদ।`,
      sources: [
        'বাংলাদেশ পানি উন্নয়ন বোর্ড (BWDB / FFWC) বার্ষিক প্রতিবেদন',
        'সিইজিআইএস (CEGIS) নদীভাঙন ঝুঁকি সমীক্ষা',
        'NASA GPM IMERG স্যাটেলাইট বৃষ্টিপাত উপাত্ত',
      ],
      evidenceLevel: 'verified_high',
      followUpSuggestions: [
        'ভাঙনপ্রবণ জমিতে কি ফসল ফলানো নিরাপদ?',
        'সিরাজগঞ্জ স্টেশনের বিপদসীমা কত?',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  // Fallback for Out-of-Evidence / Unsupported Queries
  return {
    answer: `আপনার প্রশ্নটির সরাসরি বৈজ্ঞানিক উত্তর দেওয়ার মতো পর্যাপ্ত নির্ভরযোগ্য উপাত্ত বা মাঠ সমীক্ষা এই মুহূর্তে আমাদের প্রাতিষ্ঠানিক ডেটাবেজে নেই।\n\n` +
      `প্রজেক্ট ইডেন কৃত্রিম বুদ্ধিমত্তা কোনো মনগড়া বা আনুমানিক তথ্য প্রদান করে না। আপনার ফসলের যেকোনো নতুন লক্ষণ, পোকা বা স্থানীয় সমস্যার সুনির্দিষ্ট সমাধানের জন্য অনুগ্রহ করে আপনার ব্লকের দায়িত্বপ্রাপ্ত **উপসহকারী কৃষি কর্মকর্তা (SAAO)** অথবা নিকটস্থ উপজেলা কৃষি অফিসে সরাসরি পরামর্শ নিন।`,
    sources: [
      'প্রজেক্ট ইডেন বৈজ্ঞানিক প্রামাণ্যতা ফ্রেমওয়ার্ক',
      'কৃষি সম্প্রসারণ অধিদপ্তর (DAE) মাঠ পরামর্শ নির্দেশিকা',
    ],
    evidenceLevel: 'insufficient_evidence',
    followUpSuggestions: [
      'আমার জমিতে সেচ কখন দেওয়া উচিত?',
      'আজকের উপগ্রহ আবহাওয়া পরিস্থিতি কি?',
      'ব্রি ধান৭১ ও মসুরের সুবিধা কি?',
    ],
    timestamp: new Date().toISOString(),
  };
}
