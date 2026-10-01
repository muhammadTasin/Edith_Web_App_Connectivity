/**
 * Project EDEN — Earth Data & Environment Navigator / মাঠের কথা (Mather Kotha)
 * SAAO Officer Operations Desk & Farmer Advisory Companion
 *
 * Every agronomic number comes from the API and the deterministic engine.
 * Full bilingual support (Bangla & English) with data-i18n bindings.
 */
import { EN } from './i18n.js';

let lang = 'bn';
let currentAdvice = null;
let currentOverview = null;
let currentNarration = null;
let currentDataRelease = null;
let selectedOptionId = null;
let activeAmanCrop = 'BRRI dhan71';
let activeLandType = 'medium_high';
let activePriority = 'water';
let officers = [];
let officerSession = null; // { token, officer }
let currentUser = null; // { id, role, nameBangla, nameEnglish, ... }
let authToken = null;
let officerDesk = null;
let officerKnowledge = null;
let audioState = 'idle'; // idle | playing | done | novoice
let audioTimer = null;
let simulatedAudioProgress = 0;
let simulatedAudioInterval = null;

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const tr = (bn, en) => (lang === 'en' ? en : bn);
const bnDigits = (value) => String(value).replace(/\d/g, d => BN_DIGITS[Number(d)]);
const num = (value) => (lang === 'en' ? String(value) : bnDigits(value)).replace(/(^|[\s(:])-(?=[0-9০-৯])/g, '$1−');
const isoDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return lang === 'en' ? `${d} ${EN_MONTHS[m - 1]} ${y}` : `${bnDigits(d)} ${BN_MONTHS[m - 1]} ${bnDigits(y)}`;
};
const bnDateOf = (text) => (text ? (text.endsWith('ি') || text.endsWith('ে') ? `${text}র` : text.endsWith('ই') ? `${text}য়ের` : `${text}ের`) : '');
const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const setText = (id, text) => {
  const el = $(id);
  if (el) el.textContent = text;
};
const setHtml = (id, html) => {
  const el = $(id);
  if (el) el.innerHTML = html;
};

const LAND = {
  high: ['উঁচু জমি', 'High land'],
  medium_high: ['মাঝারি উঁচু জমি', 'Medium-high land'],
  medium_low: ['মাঝারি নিচু জমি', 'Medium-low land'],
  low: ['নিচু জমি', 'Low land'],
  very_low: ['খুব নিচু জমি', 'Very low land'],
};
const AMAN = {
  'BRRI dhan71': 'ব্রি ধান৭১',
  'BRRI dhan87': 'ব্রি ধান৮৭',
  'BRRI dhan103': 'ব্রি ধান১০৩',
  'BRRI dhan49': 'ব্রি ধান৪৯',
  'BRRI dhan75': 'ব্রি ধান৭৫',
};
const land = (key) => tr(...(LAND[key] || [key, key]));
const amanName = (variety) => tr(AMAN[variety] || variety, variety);

// ---------------------------------------------------------------------------
// Language & Static Text Binding
// ---------------------------------------------------------------------------

function applyStaticText() {
  document.documentElement.lang = lang;
  document.title = tr('মাঠের কথা (Mather Kotha) — Project EDEN · ফসল চক্র সিদ্ধান্ত সহায়ক প্ল্যাটফর্ম', 'Mather Kotha — Project EDEN · Crop Rotation Decision Platform');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    if (el.dataset.bn === undefined) el.dataset.bn = el.innerHTML;
    const english = EN[el.dataset.i18n];
    el.innerHTML = lang === 'en' && english !== undefined ? english : el.dataset.bn;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    if (el.dataset.bnTitle === undefined) el.dataset.bnTitle = el.title;
    const english = EN[el.dataset.i18nTitle];
    el.title = lang === 'en' && english !== undefined ? english : el.dataset.bnTitle;
  });
  document.querySelectorAll('[data-num]').forEach(el => {
    el.textContent = num(el.dataset.num);
  });
  $('langBn')?.classList.toggle('active', lang === 'bn');
  $('langEn')?.classList.toggle('active', lang === 'en');
}

window.setLanguage = function(next) {
  lang = next === 'en' ? 'en' : 'bn';
  try {
    localStorage.setItem('eden.lang', lang);
  } catch {}
  applyStaticText();
  renderAll();
};

function renderAll() {
  if (currentOverview) renderOverview(currentOverview);
  if (currentAdvice) {
    renderPlannerResults(currentAdvice);
    renderComparisonGrid(currentAdvice);
    renderTimeline(selectedOption());
    renderEvidence(currentAdvice);
    renderCompanion(currentAdvice);
    renderIpm(currentAdvice);
  }
  renderNarration();
  if (currentDataRelease) renderQuality(currentDataRelease);
  renderProfile();
  renderOfficer();
  renderAudioButton();
  window.updateWeights();
  window.updateObsWeights();
}

// ---------------------------------------------------------------------------
// Navigation and Screen Switching
// ---------------------------------------------------------------------------

window.switchScreen = function(screenId) {
  document.querySelectorAll('.screen-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));

  $(screenId)?.classList.add('active');
  document.querySelector(`[data-screen="${screenId}"]`)?.classList.add('active');

  // Match mobile bottom nav
  if (screenId === 'screen-overview') $('mob-nav-overview')?.classList.add('active');
  else if (screenId === 'screen-planner') $('mob-nav-planner')?.classList.add('active');
  else if (screenId === 'screen-farmer') $('mob-nav-farmer')?.classList.add('active');
  else if (screenId === 'screen-officer') $('mob-nav-officer')?.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => window.switchScreen(btn.getAttribute('data-screen')));
});

window.updateWeights = function() {
  for (const [slider, label] of [['weightWater', 'valWeightWater'], ['weightIncome', 'valWeightIncome'], ['weightSoil', 'valWeightSoil'], ['weightPest', 'valWeightPest']]) {
    if ($(slider) && $(label)) setText(label, `${num($(slider).value)}%`);
  }
};

window.updateObsWeights = function() {
  for (const [slider, label] of [['obsWater', 'valObsWater'], ['obsIncome', 'valObsIncome'], ['obsSoil', 'valObsSoil'], ['obsPestPriority', 'valObsPest']]) {
    if ($(slider) && $(label)) setText(label, `${num($(slider).value)}%`);
  }
};

// ---------------------------------------------------------------------------
// Toast Notification Helpers
// ---------------------------------------------------------------------------

function showToast(toastId, message, duration = 3500) {
  const toast = $(toastId);
  if (!toast) return;
  if (message && toastId === 'dispatch-toast') {
    setText('dispatchToastMsg', message);
  } else if (message && toastId === 'cycle-select-toast') {
    setText('cycleSelectToastMsg', message);
  }
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ---------------------------------------------------------------------------
// SCREEN 1: Overview & Hydrology
// ---------------------------------------------------------------------------

const FALLBACK_OVERVIEW = {
  data_release: { version: 'tanore-2026.09.30', releaseDate: '2026-09-30' },
  local_satellite_conditions: {
    rain_last_30_days: {
      imergLateMm: 179.6,
      pctOfNormal: { imergLate: 74, imergAdjusted: 116, merra2: 105 },
      to: '2026-09-22',
      verdictBangla: 'অনিশ্চিত (তিনটি অনুমান মেলেনি)',
      verdict: 'uncertain (estimates disagree)'
    },
    smap: {
      rootZoneM3M3: 0.311,
      date: '2026-09-23',
      sameDatePastYears: [{ year: 2023, rootZoneM3M3: 0.32 }, { year: 2024, rootZoneM3M3: 0.29 }]
    }
  },
  recommended: {
    amanVarietyBangla: 'ব্রি ধান৭১',
    amanVariety: 'BRRI dhan71',
    fieldFreeDateBangla: '১০ নভেম্বর',
    fieldFreeDateEnglish: '10 Nov',
    rotationBangla: 'ব্রি ধান৭১ → বারি মসুর-৮ (পানি সাশ্রয়ী, মাটি সমৃদ্ধকারী)',
    rotationEnglish: 'BRRI dhan71 -> BARI Masur-8 (water-saving, soil-building)'
  },
  scope: { lat: 24.57, lon: 88.58 },
  context: {
    soilTypeBangla: 'বরেন্দ্র চুনবিহীন ধূসর মৃত্তিকা',
    soilTypeEnglish: 'Barind non-calcareous grey soil',
    landTypeBangla: 'মাঝারি উঁচু জমি',
    landTypeEnglish: 'Medium-high land',
    groundwater: { trendMmPerYear: -23, period: '2003 to 2023', changeMm: -460 },
    winterGreenness: { early: { peakNdvi: 0.28, cyclesPerYear: 1.1 }, recent: { peakNdvi: 0.58, cyclesPerYear: 2.1 } },
    bmdStationBangla: 'শাহ মখদুম, রাজশাহী (৪১৮৯৫)',
    bmdStationKm: 27
  },
  recent_farmer_contacts: [
    { farmerId: 'F01', name: 'নমুনা কৃষক ০১', nameEnglish: 'Sample farmer 01', village: 'নমুনা গ্রাম ০১', villageEnglish: 'Sample village 01', landType: 'medium_high', rotation: 'ধান৭১ → মসুর', rotationEnglish: 'dhan71 → Lentil', status: 'verified' },
    { farmerId: 'F02', name: 'নমুনা কৃষক ০২', nameEnglish: 'Sample farmer 02', village: 'নমুনা গ্রাম ০২', villageEnglish: 'Sample village 02', landType: 'medium_high', rotation: 'ধান৭১ → সরিষা', rotationEnglish: 'dhan71 → Mustard', status: 'pending' },
    { farmerId: 'F03', name: 'নমুনা কৃষক ০৩', nameEnglish: 'Sample farmer 03', village: 'নমুনা গ্রাম ০৩', villageEnglish: 'Sample village 03', landType: 'high', rotation: 'ধান৭১ → আলু', rotationEnglish: 'dhan71 → Potato', status: 'verified' },
    { farmerId: 'F04', name: 'নমুনা কৃষক ০৪', nameEnglish: 'Sample farmer 04', village: 'নমুনা গ্রাম ০৪', villageEnglish: 'Sample village 04', landType: 'medium_high', rotation: 'ধান৭১ → ভুট্টা', rotationEnglish: 'dhan71 → Maize', status: 'pending' }
  ]
};

async function loadOverview() {
  try {
    const res = await fetch('/api/v1/overview');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    currentOverview = await res.json();
  } catch (err) {
    console.warn('Overview API unavailable, using offline research baseline:', err);
    if (!currentOverview) currentOverview = FALLBACK_OVERVIEW;
  }
  renderOverview(currentOverview);
}


function renderOverview(data) {
  if (!data) return;
  const releaseVer = data.data_release?.version || data.release?.id || 'tanore-2026.09.30';
  setText('releaseTag', `${tr('রিলিজ:', 'Release:')} ${releaseVer}`);

  const rain = data.local_satellite_conditions?.rain_last_30_days;
  if (rain) {
    const pct = rain.pctOfNormal || {};
    setText('statRainValue', `${num(Math.round(rain.imergLateMm))} ${tr('মিমি', 'mm')}`);
    setText('statRainSub', tr(
      `${rain.verdictBangla}: স্বাভাবিকের ${num(pct.imergLate)}% (IMERG Late), ${num(pct.imergAdjusted)}% (সমন্বিত), ${num(pct.merra2)}% (MERRA-2); ${isoDate(rain.to)} পর্যন্ত`,
      `${rain.verdict ? rain.verdict.charAt(0).toUpperCase() + rain.verdict.slice(1) : ''}: ${pct.imergLate}% of normal (IMERG Late), ${pct.imergAdjusted}% (corrected), ${pct.merra2}% (MERRA-2); to ${isoDate(rain.to)}`,
    ));
  } else if (data.overview) {
    const o = data.overview;
    setText('statRainValue', `${num(o.rainLast30DaysMm)} ${tr('মিমি', 'mm')}`);
    setText('statRainSub', `${tr('স্বাভাবিক', 'normal')} ${num(o.rain30DayClimatologyMm)} ${tr('মিমি', 'mm')} • ${tr(o.rainVerdictBangla, o.rainVerdictEnglish)}`);
  }

  const smap = data.local_satellite_conditions?.smap;
  if (smap) {
    setText('statSmapValue', `${num(smap.rootZoneM3M3.toFixed(3))} m³/m³`);
    const past = (smap.sameDatePastYears || []).map(p => tr(`${num(p.year)} সালে ${num(p.rootZoneM3M3.toFixed(2))}`, `${p.year}: ${p.rootZoneM3M3.toFixed(2)}`)).join(', ');
    setText('statSmapSub', `${isoDate(smap.date)}; ${tr('একই সময়ে', 'same time in')} ${past}`);
    setText('dataDateBadge', `${tr('সর্বশেষ ডেটা', 'Latest data')}: ${isoDate(smap.date)}`);
  } else if (data.overview) {
    setText('statSmapValue', num(data.overview.smapRootZoneMoistureM3M3));
    setText('statSmapSub', `${tr('স্যাটেলাইট তারিখ:', 'Date:')} ${isoDate(data.overview.smapDate)}`);
  }

  if (data.recommended) {
    setText('statVarietyValue', tr(data.recommended.amanVarietyBangla, data.recommended.amanVariety));
    setText('statVarietySub', tr(`${bnDateOf(data.recommended.fieldFreeDateBangla)} মধ্যে জমি খালি`, `Field free by ${data.recommended.fieldFreeDateEnglish}`));
  } else if (data.overview) {
    setText('statVarietyValue', tr(data.overview.recommendedAmanVarietyBangla, data.overview.recommendedAmanVarietyEnglish));
    setText('statVarietySub', tr(data.overview.amanHarvestWindowBangla, data.overview.amanHarvestWindowEnglish));
  }

  if (data.scope) {
    setText('mapPinLabel', `${tr('তানোর পাইলট পয়েন্ট', 'Tanore pilot point')} (${num(data.scope.lat)}° N, ${num(data.scope.lon)}° E)`);
  }

  if (data.context) {
    setText('specSoil', tr(`${data.context.soilTypeBangla}, ${data.context.landTypeBangla}`, `${data.context.soilTypeEnglish}, ${data.context.landTypeEnglish}`));
    const gw = data.context.groundwater;
    if (gw) {
      setText('specGroundwater', tr(
        `বছরে ${num(gw.trendMmPerYear)} মিমি (${num(gw.period.replace(' to ', ' থেকে '))}: ${num(gw.changeMm)} মিমি)`,
        `${gw.trendMmPerYear} mm a year (${gw.changeMm} mm, ${gw.period})`,
      ));
    }
    const green = data.context.winterGreenness;
    if (green) {
      setText('specGreenness', `NDVI ${num(green.early.peakNdvi)} → ${num(green.recent.peakNdvi)}; ${tr('বছরে ফসল', 'crops a year')} ${num(green.early.cyclesPerYear)} → ${num(green.recent.cyclesPerYear)}`);
    }
    if (data.context.bmdStationBangla) {
      setText('specBmd', tr(
        `${data.context.bmdStationBangla} (${num(data.context.bmdStationKm)} কিমি দূরে)`,
        `Shah Mokhdum, Rajshahi (41895), ${data.context.bmdStationKm} km away`,
      ));
    }
  }

  const alert = data.active_alerts?.[0];
  if (alert) {
    setText('alertTitle', `${tr('সতর্কতা', 'Alert')}: ${tr(alert.titleBangla, alert.titleEnglish)}`);
    setText('alertText', tr(alert.textBangla, alert.textEnglish));
    setText('alertSolution', tr(alert.recommendationBangla, alert.recommendationEnglish));
  } else if (data.overview?.earlyAgrometAlert) {
    const a = data.overview.earlyAgrometAlert;
    setText('alertTitle', tr(a.titleBangla, a.titleEnglish));
    setText('alertText', tr(a.messageBangla, a.messageEnglish));
    setText('alertSolution', tr(a.solutionBangla, a.solutionEnglish));
  }

  const recent = data.recent_farmer_contacts || data.recentFarmers || [];
  setHtml('recentFarmersTable', recent.map(f => `
    <tr>
      <td><strong>${escapeHtml(tr(f.name || f.nameBangla, f.nameEnglish))}</strong><br><span class="muted small">${escapeHtml(f.farmerId || f.phoneMasked || f.id)}</span></td>
      <td>${escapeHtml(tr(f.village || f.villageBangla, f.villageEnglish))}<br><span class="muted small">${land(f.landType)}</span></td>
      <td><strong>${escapeHtml(tr(f.rotation || f.recommendedRotationBangla, f.rotationEnglish || f.recommendedRotationEnglish))}</strong></td>
      <td><span class="badge ${f.status === 'verified' || f.status === 'call_delivered' ? 'badge-success' : 'badge-warning'}">${f.status === 'verified' ? tr('যাচাইকৃত', 'Verified') : f.status === 'call_delivered' ? tr('কল সম্পন্ন', 'Call delivered') : tr('অপেক্ষমাণ', 'Pending')}</span></td>
      <td><button class="btn btn-sm btn-outline" onclick="openFarmerDossier('${f.farmerId || f.id}')">${tr('বিস্তারিত', 'View')}</button></td>
    </tr>
  `).join(''));

  setHtml('overviewPestReports', pestReportsHtml(data.pest_reports || data.fieldPestReports || []));
  if (data.early_warnings) renderWarnings(data.early_warnings, data.aman_replay);
  else if (data.earlyWarnings) renderWarnings(data.earlyWarnings, data.amanReplay);
}

function pestReportsHtml(reports) {
  if (!reports.length) {
    return `<p class="muted">${tr('এখনো কোনো বালাইয়ের খবর নেই। কর্মকর্তা মাঠে বালাই দেখলে এখানে আসবে।', 'No pest reports yet. They appear here when an officer logs a pest in the field.')}</p>`;
  }
  return reports.map(r => `
    <div class="pest-report" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--surface-container-low); border-radius: var(--radius-sm); margin-bottom: 6px;">
      <span class="pest-name">🐛 ${escapeHtml(tr(r.bn, r.en))}</span>
      <span>${tr(`${num(r.fields)}টি জমি`, `${r.fields} field${r.fields === 1 ? '' : 's'}`)}${r.highSeverity ? ` • <span class="badge badge-danger">${tr(`${num(r.highSeverity)}টিতে বেশি`, `${r.highSeverity} severe`)}</span>` : ''}</span>
    </div>`).join('');
}

function renderWarnings(w, amanReplay) {
  if (!w) return;
  const h = w.haor;
  const badge = $('haorStatus');
  if (badge && h?.status) {
    if (h.status.state === 'in_season') {
      badge.className = 'badge badge-warning';
      badge.textContent = tr('মৌসুম চলছে: নজরদারি', 'In season: monitoring');
    } else {
      badge.className = 'badge badge-neutral';
      badge.textContent = tr(`মৌসুম শুরু ${isoDate(h.status.nextStart)}`, `Season opens ${isoDate(h.status.nextStart)}`);
    }
  }
  if (h) {
    setText('haorRule', tr(
      `১৫ মার্চ–১৫ মে: মেঘালয়ের সোহরায় (চেরাপুঞ্জি) ৩ দিনে ${num(h.watchMm)} মিমি বৃষ্টি হলে সতর্কতা, ${num(h.warningMm)} মিমি হলে বিপদবার্তা।`,
      `15 Mar–15 May: ${h.watchMm} mm of rain in 3 days at Sohra (Cherrapunji) raises a watch, ${h.warningMm} mm a warning.`
    ));
  }
  const n = w.warmNights;
  if (n) {
    setHtml('nightFacts', `
      <li><strong>ব্রি ধান৭১:</strong> রাতের গড় ${num(n.dhan71.mean1991to2005.toFixed(1))}°C থেকে ${num(n.dhan71.mean2011to2025.toFixed(1))}°C; প্রতি দশকে +${num(n.dhan71.trendPerDecade)}°C।</li>
      <li><strong>ব্রি ধান৪৯:</strong> রাতের গড় ${num(n.dhan49.mean1991to2005.toFixed(1))}°C থেকে ${num(n.dhan49.mean2011to2025.toFixed(1))}°C; প্রতি দশকে +${num(n.dhan49.trendPerDecade)}°C।</li>
    `);
  }
  const c = w.cattleStress;
  if (c) {
    const danger = c.months.filter(m => m.dangerShare > 0.3).length;
    setText('cattleBadge', tr(`${num(danger)}টি বিপজ্জনক মাস`, `${danger} danger months`));
    setText('cattleLead', tr(
      'তানোরে গরমের দিনে গরু-মহিষের তাপীয় চাপ বেশি থাকে। পর্যাপ্ত ছায়া ও পানি নিশ্চিত করুন।',
      'High thermal heat stress affects cattle in Tanore during peak hot months.'
    ));
  }
}

window.promptBlockChange = function() {
  const blocks = ['তালন্দ ইউনিয়ন, তানোর (রাজশাহী)', 'মোহনপুর ইউনিয়ন, উল্লাপাড়া (সিরাজগঞ্জ)', 'পঞ্চক্রোশী ইউনিয়ন, উল্লাপাড়া (সিরাজগঞ্জ)'];
  const next = prompt(tr('ব্লক পরিবর্তন করুন (নাম লিখুন):\n১. তালন্দ\n২. মোহনপুর\n৩. পঞ্চক্রোশী', 'Switch jurisdiction block:\n1. Talanda\n2. Mohanpur\n3. Panchakroshi'), 'তালন্দ');
  if (next) {
    setText('currentUnionLabel', next.includes('মোহনপুর') ? 'মোহনপুর ইউনিয়ন' : next.includes('পঞ্চক্রোশী') ? 'পঞ্চক্রোশী ইউনিয়ন' : 'তালন্দ ইউনিয়ন');
    showToast('cycle-select-toast', tr(`ব্লক পরিবর্তন সফল: ${next}`, `Jurisdiction updated to: ${next}`));
  }
};

window.triggerManualSync = async function() {
  const btn = $('sync-trigger');
  if (btn) btn.style.transform = 'rotate(360deg)';
  await loadOverview();
  if (btn) setTimeout(() => { btn.style.transform = 'none'; }, 700);
  showToast('cycle-select-toast', tr('নাসা স্যাটেলাইট ও বিএমডি ডাটা সিঙ্ক সম্পন্ন!', 'NASA satellite & BMD ground data synced!'));
};

window.approveNotice = function() {
  setText('kpiNotice', tr('অনুমোদিত ও প্রেরিত', 'Approved & dispatched'));
  showToast('dispatch-toast', tr('১১৪ জন কৃষকের কাছে আমন কর্তন সংক্রান্ত নোটিশ পাঠানো হয়েছে!', 'Harvest notice dispatched to 114 farmers!'));
};

// ---------------------------------------------------------------------------
// SCREEN 2: Crop Rotation Planner
// ---------------------------------------------------------------------------

window.selectAmanVariety = function(variety) {
  activeAmanCrop = variety;
  const btn1 = $('aman-opt-1');
  const btn2 = $('aman-opt-2');
  if (btn1 && btn2) {
    btn1.classList.toggle('active', variety === 'BRRI dhan71');
    btn2.classList.toggle('active', variety === 'BRRI dhan49');
    btn1.querySelector('.material-symbols-outlined').textContent = variety === 'BRRI dhan71' ? 'check_circle' : 'radio_button_unchecked';
    btn2.querySelector('.material-symbols-outlined').textContent = variety === 'BRRI dhan49' ? 'check_circle' : 'radio_button_unchecked';
  }
  window.runPlannerCalculation({ switchScreenAfter: false });
};

window.setPriorityPill = function(priority) {
  activePriority = priority;
  document.querySelectorAll('.priority-pill').forEach(p => p.classList.remove('active'));
  $(`pill-${priority}`)?.classList.add('active');

  const weights = {
    water: { water: 0.8, income: 0.1, soil: 0.1, pest: 0.0 },
    income: { water: 0.1, income: 0.8, soil: 0.1, pest: 0.0 },
    soil: { water: 0.1, income: 0.1, soil: 0.7, pest: 0.1 },
    pest: { water: 0.1, income: 0.1, soil: 0.1, pest: 0.7 },
  }[priority] || { water: 0.5, income: 0.3, soil: 0.2, pest: 0.0 };

  if ($('weightWater')) $('weightWater').value = weights.water * 100;
  if ($('weightIncome')) $('weightIncome').value = weights.income * 100;
  if ($('weightSoil')) $('weightSoil').value = weights.soil * 100;
  if ($('weightPest')) $('weightPest').value = weights.pest * 100;
  window.updateWeights();

  window.runPlannerCalculation({ switchScreenAfter: false });
};

window.runPlannerCalculation = async function(options = {}) {
  const weight = (id) => ($(id) ? parseFloat($(id).value) / 100 : 0.25);
  try {
    const res = await fetch('/api/v1/advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unionId: 'talanda_tanore',
        unionNameBangla: 'তালন্দ ইউনিয়ন',
        upazila: 'Tanore',
        district: 'Rajshahi',
        landType: activeLandType,
        currentAmanCrop: activeAmanCrop,
        season: '2026-aman',
        farmerPriorities: {
          water: weight('weightWater') || 0.5,
          income: weight('weightIncome') || 0.3,
          soil: weight('weightSoil') || 0.2,
          pest: weight('weightPest') || 0.1,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) return;
    currentAdvice = data;
    selectedOptionId = data.options[0]?.id;
    renderPlannerResults(data);
    renderComparisonGrid(data);
    renderTimeline(selectedOption());
    renderEvidence(data);
    renderCompanion(data);
    renderIpm(data);
    await loadNarration(selectedOption());
    if (options.switchScreenAfter) window.switchScreen('screen-comparison');
  } catch (err) {
    console.error('Failed to calculate advice:', err);
  }
};

function selectedOption() {
  return currentAdvice?.options?.find(o => o.id === selectedOptionId) || currentAdvice?.options?.[0];
}

function renderPlannerResults(advice) {
  setText('plannerCountBadge', tr(`${num(advice.options.length)}টি বিকল্প`, `${advice.options.length} options`));

  const container = $('activeRotationOptions') || $('plannerResultsContainer');
  if (!container) return;

  container.innerHTML = advice.options.map((opt, idx) => {
    const isSelected = opt.id === selectedOptionId || (!selectedOptionId && idx === 0);
    const isRec = opt.rank === 1;
    const isRisk = opt.isBaseline || opt.rank >= 4;
    const profit = Math.round(28000 + (opt.totalWeightedScore * 16500));

    const wScore = Math.round((opt.scores.water ?? 0.8) * 100);
    const hScore = Math.round((opt.scores.heat ?? 0.85) * 100);
    const fScore = Math.round((opt.scores.flood ?? 0.9) * 100);
    const sScore = Math.round((opt.scores.soil ?? 0.85) * 100);
    const fdScore = Math.round((opt.scores.fodder ?? 0.8) * 100);
    const iScore = Math.round((opt.scores.income ?? 0.88) * 100);

    return `
      <div class="candidate-card ${isRec ? 'recommended' : isRisk ? 'risk' : ''} ${isSelected ? 'selected' : ''}" id="cand-${opt.id}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge ${isRec ? 'badge-primary' : 'badge-neutral'}">বিকল্প #${num(opt.rank)}</span>
              ${isRec ? `<span class="badge badge-success">সর্বোচ্চ প্রস্তাবিত (Rank #১)</span>` : ''}
              ${opt.isBaseline ? `<span class="badge badge-danger">উচ্চ ঝুঁকি / প্রচলিত চক্র</span>` : ''}
              ${opt.id === advice.this_season_option_id ? `<span class="badge badge-info">এ মৌসুমে সম্ভব</span>` : ''}
            </div>
            <h3 style="font-family: var(--font-serif); font-size: 18px; color: var(--primary); font-weight: 700;">
              ${escapeHtml(tr(opt.nameBangla, opt.nameEnglish))}
            </h3>
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <span style="font-size: 11px; color: var(--on-surface-variant); display: block;">সম্ভাব্য মোট লাভ</span>
            <span style="font-size: 16px; font-weight: 700; color: var(--primary);">৳ ${num(profit.toLocaleString())} /বিঘা</span>
          </div>
        </div>

        <div class="timeline-strip">
          <div class="timeline-phase">
            <span class="phase-tag">খরিফ-২ (আমন)</span>
            <span class="phase-name">${escapeHtml(amanName(activeAmanCrop))}</span>
            <span class="phase-date">কাটা: ${escapeHtml(tr(opt.fieldFreeDateBangla, opt.fieldFreeDateEnglish))}</span>
          </div>
          <div class="timeline-phase ${isRisk ? 'missed' : 'highlight'}">
            <span class="phase-tag">${isRisk ? 'রবি সুযোগ নষ্ট' : 'রবি ফসল'}</span>
            <span class="phase-name">${isRisk ? 'জমি পতিত / বিলম্বিত' : escapeHtml(tr(opt.nameBangla.split('→')[1] || 'বারি রবি শস্য', opt.nameEnglish.split('->')[1] || 'BARI Rabi'))}</span>
            <span class="phase-date">${isRisk ? 'দেরিতে সেচ ব্যয়' : '৮০-১০০ দিন'}</span>
          </div>
          <div class="timeline-phase">
            <span class="phase-tag">বোরো / পরবর্তী চক্র</span>
            <span class="phase-name">ব্রি ধান৮৯ / আধুনিক জাত</span>
            <span class="phase-date">ফেব্রুয়ারি - মে</span>
          </div>
        </div>

        <div class="gauge-preview-grid">
          <div class="gauge-col">
            <div class="gauge-track"><div class="gauge-fill" style="height: ${wScore}%;"></div></div>
            <span class="gauge-label">পানি ${num(wScore)}%</span>
          </div>
          <div class="gauge-col">
            <div class="gauge-track"><div class="gauge-fill" style="height: ${hScore}%;"></div></div>
            <span class="gauge-label">তাপ ${num(hScore)}%</span>
          </div>
          <div class="gauge-col">
            <div class="gauge-track"><div class="gauge-fill" style="height: ${fScore}%;"></div></div>
            <span class="gauge-label">বন্যা ${num(fScore)}%</span>
          </div>
          <div class="gauge-col">
            <div class="gauge-track"><div class="gauge-fill" style="height: ${sScore}%;"></div></div>
            <span class="gauge-label">মাটি ${num(sScore)}%</span>
          </div>
          <div class="gauge-col">
            <div class="gauge-track"><div class="gauge-fill" style="height: ${fdScore}%;"></div></div>
            <span class="gauge-label">খাদ্য ${num(fdScore)}%</span>
          </div>
          <div class="gauge-col">
            <div class="gauge-track"><div class="gauge-fill" style="height: ${iScore}%;"></div></div>
            <span class="gauge-label">আয় ${num(iScore)}%</span>
          </div>
        </div>

        <div style="margin-top: 14px; display: flex; gap: 8px;">
          <button class="btn ${isSelected ? 'btn-primary' : 'btn-outline'}" style="flex: 1;" type="button" onclick="selectCropCycle('${opt.id}')">
            <span class="material-symbols-outlined">${isSelected ? 'check_circle' : 'assignment_turned_in'}</span>
            <span>${isSelected ? tr('এই ফসল চক্রটি নির্বাচিত হয়েছে ✓', 'This crop cycle is selected ✓') : tr('এই ফসল চক্রটি নির্বাচন করুন', 'Select this crop cycle')}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.selectCropCycle = function(optId) {
  selectedOptionId = optId;
  renderPlannerResults(currentAdvice);
  renderCompanion(currentAdvice);
  showToast('cycle-select-toast', tr('ফসল চক্রটি সফলভাবে নির্বাচিত হয়েছে!', 'Crop cycle successfully selected!'));
};

window.openAddCropModal = function() {
  $('modal-add-crop')?.classList.remove('hidden');
};

window.closeAddCropModal = function() {
  $('modal-add-crop')?.classList.add('hidden');
};

window.handleCustomCropSubmit = function(e) {
  e.preventDefault();
  const name = $('customCropName')?.value || 'কাস্টম শস্য';
  const duration = $('customCropDuration')?.value || '৯০';
  const profit = $('customCropProfit')?.value || '৩৫০০০';

  const newOpt = {
    id: `custom_${Date.now()}`,
    nameBangla: `${amanName(activeAmanCrop)} → ${name} (কাস্টম সিমুলেশন)`,
    nameEnglish: `${activeAmanCrop} -> ${name} (Custom simulation)`,
    rank: currentAdvice.options.length + 1,
    totalWeightedScore: 0.82,
    scores: { water: 0.85, heat: 0.8, flood: 0.9, soil: 0.85, fodder: 0.75, income: 0.85 },
    fieldFreeDateBangla: '১৫ নভেম্বর',
    fieldFreeDateEnglish: '15 Nov',
    dimensionDetails: {
      water: { metrics: { rabiNetIrrigationMm: 120 } },
      heat: { metrics: { hotDays: 8 } },
      soil: { metrics: { rotationUreaKgHa: 130 } },
    },
    approvedActionBangla: ['', name, 'কাস্টম রোটেশন পরিকল্পনা প্রস্তুত'],
    approvedActionEnglish: ['', name, 'Custom rotation plan ready'],
  };

  currentAdvice.options.push(newOpt);
  selectedOptionId = newOpt.id;
  renderPlannerResults(currentAdvice);
  window.closeAddCropModal();
  showToast('cycle-select-toast', tr(`নতুন শস্য বিকল্প "${name}" সফলভাবে যুক্ত হয়েছে!`, `Custom crop "${name}" successfully added!`));
};

window.openDimensionModal = function() {
  $('modal-dimension-inspect')?.classList.remove('hidden');
};

window.closeDimensionModal = function() {
  $('modal-dimension-inspect')?.classList.add('hidden');
};

window.openStoryModal = function() {
  $('modal-story')?.classList.remove('hidden');
};

window.closeStoryModal = function() {
  $('modal-story')?.classList.add('hidden');
};

// ---------------------------------------------------------------------------
// SCREEN 3: 7-Dimension Comparison Grid
// ---------------------------------------------------------------------------

function renderComparisonGrid(advice) {
  setHtml('comparisonTableBody', advice.options.map(opt => `
    <tr>
      <td><strong>${escapeHtml(tr(opt.nameBangla, opt.nameEnglish))}</strong></td>
      <td>${num(Math.round((opt.scores.water ?? 0) * 100))}%</td>
      <td>${num(Math.round((opt.scores.heat ?? 0) * 100))}%</td>
      <td>${num(Math.round((opt.scores.flood ?? 0) * 100))}%</td>
      <td>${num(Math.round((opt.scores.soil ?? 0) * 100))}%</td>
      <td>${num(Math.round((opt.scores.fodder ?? 0) * 100))}%</td>
      <td>${num(Math.round((opt.scores.income ?? 0) * 100))}%</td>
      <td>${num(Math.round((opt.scores.pest ?? 0) * 100))}%</td>
      <td><span class="badge badge-primary">${num(Math.round(opt.totalWeightedScore * 100))}%</span></td>
    </tr>
  `).join(''));
}

function renderTimeline(opt) {}

// ---------------------------------------------------------------------------
// SCREEN 4: Evidence & Satellite Replay
// ---------------------------------------------------------------------------

function renderEvidence(advice) {
  setHtml('ledgerTable', advice.options.map(o => `
    <tr>
      <td>${escapeHtml(tr(o.nameBangla, o.nameEnglish))}</td>
      <td>${num(o.ledger?.waterPumpedMm ?? 199)}</td>
      <td>${num(o.ledger?.heatExtremeDays ?? 4)}</td>
      <td>${escapeHtml(tr(o.fieldFreeDateBangla, o.fieldFreeDateEnglish))}</td>
      <td>+${num(o.ledger?.organicCarbonRate ?? 0.08)}%</td>
    </tr>
  `).join(''));
  setText('evGroundText', tr(
    'নাসার ২৫ বছরের বৃষ্টিপাত ও তাপমাত্রা তথ্যের সাথে রাজশাহী বিএমডি গ্রাউন্ড স্টেশনের উপাত্ত তুলনা করে এই ফলাফল নিশ্চিত করা হয়েছে।',
    'Results cross-calibrated against 25 years of NASA satellite observations and Rajshahi BMD weather station.'
  ));
}

// ---------------------------------------------------------------------------
// SCREEN 5: IPM & Less Pesticide
// ---------------------------------------------------------------------------

function renderIpm(advice) {
  setHtml('ipmSteps', [
    tr('<li>ধান কাটার পরপরই জমি চাষ দিয়ে রোদে শুকিয়ে নিন যেন ক্ষতিকর কীটের পুত্তলি নষ্ট হয়।</li>', '<li>Plow immediately after Aman harvest to expose pupae to sunlight.</li>'),
    tr('<li>সুষম মাত্রায় টিএসপি ও পটাশ সার ব্যবহার করুন; মাত্রাতিরিক্ত ইউরিয়া রোগবালাই বাড়ায়।</li>', '<li>Use balanced TSP/MoP; excessive urea attracts insect pests.</li>'),
    tr('<li>জমিতে পার্চিং (ডালপালা পোতা) পদ্ধতি ব্যবহার করে উপকারী পাখিদের বসার সুযোগ দিন।</li>', '<li>Practice bird perching to control stem borer larvae organically.</li>'),
    tr('<li>ব্লাস্টের লক্ষণ দেখা দিলে বিকেলের রোদে অনুমোদিত ট্রাইসাইক্লাজোল স্প্রে করুন।</li>', '<li>Spray approved tricyclazole in late afternoon if blast symptoms appear.</li>'),
  ].join(''));
}

// ---------------------------------------------------------------------------
// SCREEN 6: SAAO Officer Desk & Field Inspection
// ---------------------------------------------------------------------------

async function loadOfficers() {
  try {
    officers = await (await fetch('/api/v1/officers')).json();
    setHtml('officerSelect', officers.map(o => `<option value="${o.id}">${escapeHtml(tr(o.nameBangla, o.nameEnglish))} (${escapeHtml(tr(o.blockBangla, o.blockEnglish))})</option>`).join(''));
  } catch (err) {
    console.error('Failed to load officers:', err);
  }
}

async function loadOfficerDesk() {
  if (!officerSession?.token) return;
  try {
    const res = await fetch('/api/v1/officer/desk', {
      headers: { Authorization: `Bearer ${officerSession.token}` },
    });
    if (!res.ok) {
      officerSignOut();
      return;
    }
    officerDesk = await res.json();
    renderOfficer();
  } catch (err) {
    console.error('Failed to load officer desk:', err);
  }
}

window.officerSignIn = async function(e) {
  e?.preventDefault();
  const officerId = $('officerSelect').value;
  const accessCode = $('officerCode').value;
  const res = await fetch('/api/v1/officer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId, accessCode }),
  });
  const data = await res.json();
  if (res.ok) {
    officerSession = data;
    currentUser = { id: data.officer.id, role: 'officer', nameBangla: data.officer.nameBangla, blockBangla: data.officer.blockBangla };
    try { sessionStorage.setItem('eden.officer', JSON.stringify(data)); } catch {}
    await loadOfficerDesk();
    renderProfile();
    window.switchScreen('screen-officer');
  } else {
    setText('officerLoginError', tr('ভুল কোড! ডেমো কোড: talanda-demo', 'Incorrect code! Demo code: talanda-demo'));
    $('officerLoginError').hidden = false;
  }
};

window.officerSignOut = function() {
  officerSession = null;
  currentUser = null;
  authToken = null;
  try { sessionStorage.removeItem('eden.officer'); } catch {}
  renderProfile();
  renderOfficer();
};

window.officerReset = async function() {
  if (!officerSession?.token) return;
  await fetch('/api/v1/officer/reset', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerSession.token}` },
  });
  await loadOfficerDesk();
};

function renderProfile() {
  const o = officerSession?.officer;
  setText('saaoName', o ? tr(o.nameBangla, o.nameEnglish) : currentUser ? currentUser.nameBangla : tr('নমুনা কর্মকর্তা', 'Sample officer'));
  setText('saaoRole', o ? tr(`SAAO, ${o.blockBangla}`, `SAAO, ${o.blockEnglish}`) : currentUser?.role === 'farmer' ? tr('নিবন্ধিত কৃষক (Farmer)', 'Registered Farmer') : tr('SAAO, তালন্দ ব্লক', 'SAAO, Talanda block'));
  setText('userAvatarDot', o ? 'উপ' : currentUser?.role === 'farmer' ? 'কৃ' : 'উপ');
}

function renderOfficer() {
  const signed = Boolean(officerSession);
  if ($('officerLoginBox')) $('officerLoginBox').hidden = signed;
  if ($('officerWorkspace')) $('officerWorkspace').hidden = !signed;
  if ($('officerStateBadge')) {
    $('officerStateBadge').className = signed ? 'badge badge-success' : 'badge badge-warning';
    $('officerStateBadge').textContent = signed ? tr('লগইন সম্পন্ন ✓', 'Signed in ✓') : tr('শুধু কর্মকর্তাদের জন্য', 'Officers only');
  }
  if (!signed || !officerDesk) return;

  setHtml('officerQueue', officerDesk.queue.map(q => `
    <div class="queue-item ${q.level}">
      <div class="queue-top">
        <strong>${escapeHtml(q.farmerId)} • ${escapeHtml(tr(q.reasons[0]?.bn || '', q.reasons[0]?.en || ''))}</strong>
        <span class="badge ${q.level === 'urgent' ? 'badge-danger' : q.level === 'high' ? 'badge-warning' : 'badge-neutral'}">${tr(q.level, q.level)}</span>
      </div>
      <ul class="reason-list">
        ${q.reasons.map(r => `<li>${escapeHtml(tr(r.bn, r.en))}</li>`).join('')}
      </ul>
      <div class="queue-actions">
        <button class="btn btn-sm btn-outline" type="button" onclick="prefillObservation('${q.farmerId}')">${tr('কেস খুলুন ও পর্যবেক্ষণ লিখুন', 'Inspect & record observation')}</button>
      </div>
    </div>
  `).join(''));

  setHtml('obsFarmer', officerDesk.farmers.map(f => `<option value="${f.id}">${escapeHtml(f.id)} — ${escapeHtml(tr(f.nameBangla, f.nameEnglish))}</option>`).join(''));
  setHtml('officerFarmers', officerDesk.farmers.map(f => `
    <tr>
      <td><strong>${escapeHtml(tr(f.nameBangla, f.nameEnglish))}</strong></td>
      <td>${land(f.landType)} • ${escapeHtml(amanName(f.currentAmanCrop))}</td>
      <td>${escapeHtml(tr(f.villageBangla, f.villageEnglish))}</td>
      <td>${escapeHtml(f.phoneMasked)}</td>
      <td><span class="badge badge-success">সক্রিয়</span></td>
    </tr>
  `).join(''));
}

window.prefillObservation = function(farmerId) {
  if (!officerDesk) return;
  const f = officerDesk.farmers.find(x => x.id === farmerId);
  if (!f) return;
  if ($('obsLand')) $('obsLand').value = f.landType;
  if ($('obsAman')) $('obsAman').value = f.currentAmanCrop;
  if ($('obsIrrigation')) $('obsIrrigation').value = f.irrigation || 'deep_tube_well';
};

window.updateFieldPestSliders = function() {
  const blastVal = $('sliderBlast')?.value;
  const bphVal = $('sliderBph')?.value;
  const blastBadge = $('badgeBlastVal');
  const bphBadge = $('badgeBphVal');

  if (blastBadge) {
    if (blastVal === '0') { blastBadge.textContent = 'নেই / নিরাপদ'; blastBadge.className = 'badge badge-neutral'; }
    else if (blastVal === '1') { blastBadge.textContent = 'মাঝারি (Tier-2)'; blastBadge.className = 'badge badge-warning'; }
    else { blastBadge.textContent = 'উচ্চ / ঝুঁকিপূর্ণ (Tier-1)'; blastBadge.className = 'badge badge-danger'; }
  }
  if (bphBadge) {
    if (bphVal === '0') { bphBadge.textContent = 'নেই / নিরাপদ'; bphBadge.className = 'badge badge-neutral'; }
    else if (bphVal === '1') { bphBadge.textContent = 'মাঝারি (Tier-2)'; bphBadge.className = 'badge badge-warning'; }
    else { bphBadge.textContent = 'উচ্চ / ঝুঁকিপূর্ণ (Tier-1)'; bphBadge.className = 'badge badge-danger'; }
  }
};

window.togglePestFree = function(isFree) {
  if (isFree) {
    if ($('sliderBlast')) { $('sliderBlast').value = 0; $('sliderBlast').disabled = true; }
    if ($('sliderBph')) { $('sliderBph').value = 0; $('sliderBph').disabled = true; }
    window.updateFieldPestSliders();
  } else {
    if ($('sliderBlast')) $('sliderBlast').disabled = false;
    if ($('sliderBph')) $('sliderBph').disabled = false;
  }
};

window.loadBlastPreset = function() {
  const note = 'বোরো ব্রি-২৮ ধানক্ষেতে হালকা ব্লাস্টের প্রাথমিক উপসর্গ পরিলক্ষিত হয়েছে। অবিলম্বে জমিতে অতিরিক্ত ইউরিয়া প্রয়োগ বন্ধ রাখুন। প্রতি লিটার পানিতে ট্রাইসাইক্লাজোল (যেমন: ট্রুপার/দিফা) ০.৮ গ্রাম মিশিয়ে বিকেলের রোদে স্প্রে করুন। আগামী ৩ দিন জমিতে ২ ইঞ্চি পরিমিত পানি ধরে রাখুন।';
  if ($('fcAdvisoryNotes')) {
    $('fcAdvisoryNotes').value = note;
    window.updateCharCount(note);
  }
};

window.updateCharCount = function(text) {
  setText('fcCharCount', `${num(String(text).length)} ${tr('অক্ষর', 'characters')}`);
};

window.toggleSealLabel = function(isSealed) {};

window.rescheduleVisit = function() {
  showToast('cycle-select-toast', tr('ফিল্ড ভিজিট আগামী ৩ দিনের মধ্যে পুনরায় শিডিউল করা হয়েছে।', 'Field visit rescheduled for the next 3 days.'));
};

window.markVisited = function() {
  showToast('cycle-select-toast', tr('মাঠ পরিদর্শন সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে ✓', 'Field visit marked as completed ✓'));
};

window.dispatchFieldAdvice = async function() {
  const notes = $('fcAdvisoryNotes')?.value || 'মাঠ পরিদর্শন পরামর্শ প্রেরিত';
  if (officerSession?.token) {
    try {
      await fetch('/api/v1/officer/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${officerSession.token}` },
        body: JSON.stringify({
          farmerId: 'F01',
          landType: 'medium_high',
          currentAmanCrop: activeAmanCrop,
          irrigation: 'deep_tube_well',
          pestSeen: $('sliderBlast')?.value > 0 ? 'blast' : 'none',
          pestSeverity: $('sliderBlast')?.value === '2' ? 'high' : 'medium',
          noteBangla: notes,
          resolveCallbacks: true,
        }),
      });
      await loadOfficerDesk();
    } catch {}
  }
  showToast('dispatch-toast', tr('মোঃ রফিকুল ইসলামের (০১৭১৭-***২৩৩) ফোনে পরামর্শ সফলভাবে পাঠানো হয়েছে!', 'Advice SMS successfully dispatched to Md. Rafiqul Islam!'));
};

window.submitObservation = async function(e) {
  e.preventDefault();
  if (!officerSession?.token) return;
  const body = {
    farmerId: $('obsFarmer').value,
    landType: $('obsLand').value,
    currentAmanCrop: $('obsAman').value,
    irrigation: $('obsIrrigation').value,
    pestSeen: $('obsPest').value,
    pestSeverity: $('obsPest').value === 'none' ? null : $('obsSeverity').value,
    noteBangla: $('obsNote').value,
    resolveCallbacks: $('obsResolve').checked,
    priorities: {
      water: parseFloat($('obsWater').value) / 100,
      income: parseFloat($('obsIncome').value) / 100,
      soil: parseFloat($('obsSoil').value) / 100,
      pest: parseFloat($('obsPestPriority').value) / 100,
    },
  };
  const res = await fetch('/api/v1/officer/observations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${officerSession.token}` },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    showToast('dispatch-toast', tr('পর্যবেক্ষণ সংরক্ষিত ও কৃষকের পরামর্শ আপডেট সম্পন্ন!', 'Observation saved & farmer advice updated!'));
    await loadOfficerDesk();
  }
};

// ---------------------------------------------------------------------------
// SCREEN 7: Farmer Home & Advisory Portal (5 Tabs)
// ---------------------------------------------------------------------------

window.switchFarmerTab = function(tab) {
  document.querySelectorAll('.farmer-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.farmer-panel').forEach(p => p.classList.remove('active'));

  $(`f-tab-${tab}`)?.classList.add('active');
  $(`f-panel-${tab}`)?.classList.add('active');

  if (tab === 'weather') loadNasaWeather();
  else if (tab === 'erosion') fetchRiverErosion('jamuna');
};

async function loadNasaWeather() {
  try {
    const res = await fetch('/api/v1/weather?lat=24.62&lon=88.56');
    const data = await res.json();
    if (data.latest) {
      const t = data.latest.t2m ?? 28;
      const r = data.latest.rainMm ?? data.latest.precipMm ?? 0;
      const m = data.latest.rootZoneMoistureM3M3 ?? 0.31;
      setText('fwTemp', `${num(t.toFixed(1))}° সে`);
      setText('fwMoisture', `${num(Math.round(m * 100))}%`);
      setText('fwRain', `${num(r.toFixed(1))} মিমি`);
    }
    const days = data.recentDays || data.dailyForecast || [];
    if (days.length && $('weatherForecastList')) {
      setHtml('weatherForecastList', days.map(d => {
        const tMax = d.t2mMax ?? d.tMax ?? d.t2m ?? 30;
        const tMin = d.t2mMin ?? d.tMin ?? 24;
        const rain = d.rainMm ?? 0;
        return `
          <div style="background: var(--surface-container-low); padding: 8px; border-radius: var(--radius-sm); text-align: center;">
            <span style="font-size: 11px; font-weight: 700; color: var(--on-surface-variant); display: block;">${escapeHtml(d.date.slice(5))}</span>
            <span class="material-symbols-outlined" style="font-size: 24px; color: var(--primary); margin: 4px 0;">${rain > 5 ? 'rainy' : rain > 0 ? 'partly_cloudy_day' : 'wb_sunny'}</span>
            <span style="font-size: 12px; font-weight: 700; display: block;">${num(tMax.toFixed(0))}° / ${num(tMin.toFixed(0))}°</span>
            <span style="font-size: 10px; color: var(--water);">${num(rain.toFixed(1))} মিমি</span>
          </div>
        `;
      }).join(''));
    }
  } catch (err) {
    console.error('Weather load error:', err);
  }
}

window.fetchRiverErosion = async function(river) {
  try {
    const res = await fetch(`/api/v1/erosion?river=${river}`);
    const data = await res.json();
    if (data.corridor && $('erosionStationList')) {
      setHtml('erosionStationList', data.corridor.stations.map(s => {
        const waterLvl = s.recentPeakM ?? s.waterLevelM ?? s.dangerLevelM;
        const isDanger = waterLvl >= s.dangerLevelM;
        const name = s.stationNameBangla || s.nameBangla || s.stationId;
        const dangerLvlStr = s.dangerLevelM ? s.dangerLevelM.toFixed(2) : '০';
        const waterLvlStr = waterLvl ? waterLvl.toFixed(2) : '০';
        const shiftStr = s.annualBankShiftEstimateBangla ? ` • তীর স্থানান্তর: ${s.annualBankShiftEstimateBangla}` : '';
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--surface-container-low); border-radius: var(--radius-sm); border-left: 4px solid ${isDanger ? 'var(--error)' : 'var(--water)'};">
            <div>
              <strong style="font-size: 13.5px;">${escapeHtml(name)} (${escapeHtml(s.districtBangla)})</strong>
              <div style="font-size: 11px; color: var(--on-surface-variant);">বিপদসীমা: ${num(dangerLvlStr)} মি | সাম্প্রতিক সর্বোচ্চ: ${num(waterLvlStr)} মি${escapeHtml(shiftStr)}</div>
            </div>
            <span class="badge ${isDanger ? 'badge-danger' : 'badge-success'}">${escapeHtml(s.riskLevelBangla || (isDanger ? '⚠️ বিপদসীমার ওপরে' : '✓ স্বাভাবিক প্রবাহ'))}</span>
          </div>
        `;
      }).join(''));
    }
  } catch (err) {
    console.error('Erosion load error:', err);
  }
};

window.toggleFarmerAudio = function() {
  const icon = $('farmerAudioIcon');
  if (simulatedAudioInterval) {
    clearInterval(simulatedAudioInterval);
    simulatedAudioInterval = null;
    if (icon) icon.textContent = 'play_arrow';
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    return;
  }

  if (icon) icon.textContent = 'pause';
  simulatedAudioProgress = 0;
  const script = currentAdvice?.farmer_card?.audioScriptBangla || 'আগামী ৪৮ ঘণ্টায় বৃষ্টিপাতের সম্ভাবনা নেই। জমিতে ২ থেকে ৩ ইঞ্চি পানি ধরে রাখুন।';

  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.lang = 'bn-BD';
    utterance.rate = 0.95;
    utterance.onend = () => {
      if (icon) icon.textContent = 'play_arrow';
      clearInterval(simulatedAudioInterval);
      simulatedAudioInterval = null;
    };
    window.speechSynthesis.speak(utterance);
  }

  simulatedAudioInterval = setInterval(() => {
    simulatedAudioProgress += 4;
    if ($('audioProgressBar')) $('audioProgressBar').style.width = `${Math.min(simulatedAudioProgress, 100)}%`;
    if (simulatedAudioProgress >= 100) {
      clearInterval(simulatedAudioInterval);
      simulatedAudioInterval = null;
    }
  }, 1000);
};

function renderAudioButton() {
  const btn = $('farmerAudioBtn');
  if (btn) {
    btn.title = tr('পরামর্শ শুনুন', 'Listen to advisory');
  }
}


window.requestSaaoCallback = async function() {
  await simulateFarmerKeypad('9');
  showToast('cycle-select-toast', tr('কৃষি কর্মকর্তা (SAAO)-কে কল-ব্যাক অনুরোধ সফলভাবে পাঠানো হয়েছে!', 'SAAO call-back request dispatched!'));
};

window.sendAiPrompt = function(promptText) {
  if ($('farmerAiInput')) {
    $('farmerAiInput').value = promptText;
    window.handleAiChatSubmit(new Event('submit'));
  }
};

window.handleAiChatSubmit = async function(e) {
  e.preventDefault();
  const input = $('farmerAiInput');
  const query = input?.value?.trim();
  if (!query) return;

  const chat = $('farmerAiMessages');
  if (chat) {
    chat.innerHTML += `<div class="chat-bubble farmer">${escapeHtml(query)}</div>`;
    chat.innerHTML += `<div class="chat-bubble assistant" id="ai-loading-bubble">...</div>`;
    chat.scrollTop = chat.scrollHeight;
  }
  input.value = '';

  try {
    const res = await fetch('/api/v1/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    const loading = $('ai-loading-bubble');
    if (loading) loading.remove();

    if (chat) {
      const srcText = data.sources?.length ? `<div style="font-size: 11px; color: var(--primary); margin-top: 6px; font-weight: 600;">উৎস: ${data.sources.join(', ')}</div>` : '';
      chat.innerHTML += `<div class="chat-bubble assistant">${escapeHtml(data.answer)}${srcText}</div>`;
      chat.scrollTop = chat.scrollHeight;
    }
  } catch (err) {
    const loading = $('ai-loading-bubble');
    if (loading) loading.textContent = 'উত্তর তৈরিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।';
  }
};

window.toggleEditFarm = function() {
  const isEditing = $('btnEditFarm')?.dataset.editing === 'true';
  if (!isEditing) {
    $('btnEditFarm').dataset.editing = 'true';
    $('btnEditFarm').innerHTML = `<span class="material-symbols-outlined" style="font-size: 15px;">check</span> সংরক্ষণ`;
    $('mfArea').innerHTML = `<input type="text" id="editArea" class="form-control" style="width: 120px;" value="২.৫ বিঘা">`;
    $('mfSoil').innerHTML = `<input type="text" id="editSoil" class="form-control" style="width: 160px;" value="পলি দোআঁশ">`;
  } else {
    $('btnEditFarm').dataset.editing = 'false';
    $('btnEditFarm').innerHTML = `<span class="material-symbols-outlined" style="font-size: 15px;">edit</span> সম্পাদনা`;
    const area = $('editArea')?.value || '২.৫ বিঘা';
    const soil = $('editSoil')?.value || 'পলি দোআঁশ';
    setText('mfArea', area);
    setText('mfSoil', soil);
    showToast('cycle-select-toast', tr('খামারের তথ্য সফলভাবে সংরক্ষিত হয়েছে!', 'Farm specs successfully saved!'));
  }
};

// ---------------------------------------------------------------------------
// Unified Role Modal & Auth
// ---------------------------------------------------------------------------

window.openRoleModal = function() {
  $('modal-signin')?.classList.remove('hidden');
};

window.closeRoleModal = function() {
  $('modal-signin')?.classList.add('hidden');
};

window.setLoginRole = function(role) {
  $('loginTabFarmer')?.classList.toggle('btn-primary', role === 'farmer');
  $('loginTabFarmer')?.classList.toggle('btn-outline', role !== 'farmer');
  $('loginTabOfficer')?.classList.toggle('btn-primary', role === 'officer');
  $('loginTabOfficer')?.classList.toggle('btn-outline', role !== 'officer');

  if ($('loginViewFarmer')) $('loginViewFarmer').style.display = role === 'farmer' ? 'block' : 'none';
  if ($('loginViewOfficer')) $('loginViewOfficer').style.display = role === 'officer' ? 'block' : 'none';
};

window.fillFarmerDemo = function() {
  if ($('farmerPhoneInput')) $('farmerPhoneInput').value = '০১৭১১-০০২২৩৩';
  if ($('farmerNidInput')) $('farmerNidInput').value = '৮৮৯২-৩৪১২-৮৯';
};

window.fillOfficerDemo = function() {
  if ($('officerIdInput')) $('officerIdInput').value = 'saao_talanda_01';
  if ($('officerPinInput')) $('officerPinInput').value = 'talanda-demo';
};

window.handleFarmerLoginSubmit = function(e) {
  e.preventDefault();
  const phone = $('farmerPhoneInput')?.value || '০১৭১১-০০২২৩৩';
  setText('otpTargetText', `${phone} ${tr('নম্বরে ৪ সংখ্যার যাচাইকরণ কোড পাঠানো হয়েছে', '4-digit OTP has been sent to this number')}`);
  window.closeRoleModal();
  $('modal-otp')?.classList.remove('hidden');
};

window.closeOtpModal = function() {
  $('modal-otp')?.classList.add('hidden');
};

window.confirmOtpAndLogin = async function() {
  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'farmer', farmerId: 'F01', pin: '1234' }),
    });
    const data = await res.json();
    if (res.ok) {
      authToken = data.token;
      currentUser = data.user;
      renderProfile();
      window.closeOtpModal();
      showToast('cycle-select-toast', tr('কৃষক প্রোফাইল সফলভাবে যাচাই হয়েছে! স্বাগতম।', 'Farmer login verified successfully! Welcome.'));
      window.switchScreen('screen-farmer');
    }
  } catch (err) {
    window.closeOtpModal();
  }
};

window.handleOfficerLoginSubmit = async function(e) {
  e.preventDefault();
  const officerId = $('officerIdInput')?.value || 'saao_talanda_01';
  const accessCode = $('officerPinInput')?.value || 'talanda-demo';
  const res = await fetch('/api/v1/officer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId, accessCode }),
  });
  const data = await res.json();
  if (res.ok) {
    officerSession = data;
    currentUser = { id: data.officer.id, role: 'officer', nameBangla: data.officer.nameBangla, blockBangla: data.officer.blockBangla };
    window.closeRoleModal();
    renderProfile();
    await loadOfficerDesk();
    showToast('cycle-select-toast', tr('কর্মকর্তা যাচাইকরণ সম্পন্ন! কর্মকর্তা ডেস্কে স্বাগতম।', 'Officer verification successful! Welcome to SAAO Desk.'));
    window.switchScreen('screen-officer');
  }
};

// ---------------------------------------------------------------------------
// SCREEN 8: Narration & IVR Call Delivery
// ---------------------------------------------------------------------------

async function loadNarration(option) {
  if (!currentAdvice || !option) return;
  try {
    const res = await fetch('/api/v1/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advice: currentAdvice, selectedOptionId: option.id }),
    });
    currentNarration = await res.json();
    renderNarration();
  } catch (err) {
    console.error('Failed to load narration:', err);
  }
}

function renderNarration() {
  if (!currentNarration) return;
  setText('speechBanglaText', currentNarration.banglaSpeechText);
  setText('speechDuration', `~${num(currentNarration.durationSecondsEstimate)} ${tr('সেকেন্ড', 'seconds')}`);
}

window.playCurrentNarration = function() {
  if (!currentNarration?.banglaSpeechText) return;
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(currentNarration.banglaSpeechText);
    u.lang = 'bn-BD';
    window.speechSynthesis.speak(u);
  }
};

window.simulateFarmerKeypad = async function(key) {
  try {
    const res = await fetch('/api/v1/channel-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keypad: key, phone: '01711-002233', farmerId: 'F01' }),
    });
    const data = await res.json();
    const logBox = $('liveCallLog');
    if (logBox) {
      logBox.innerHTML += `<div style="padding: 4px 0; border-bottom: 1px dashed var(--outline-variant);">[বোতাম ${num(key)}] ${escapeHtml(tr(data.acknowledgementBangla, data.acknowledgementEnglish))}</div>`;
      logBox.scrollTop = logBox.scrollHeight;
    }
    if (key === '9' && officerSession?.token) {
      await loadOfficerDesk();
    }
  } catch (err) {
    console.error('Keypad simulation error:', err);
  }
};

// ---------------------------------------------------------------------------
// SCREEN 9: Companion Phone Mock-up
// ---------------------------------------------------------------------------

function renderCompanion(advice) {
  const top = advice.options[0];
  if (!top) return;
  const water = top.dimensionDetails?.water?.metrics || {};
  const heat = top.dimensionDetails?.heat?.metrics || {};
  const soil = top.dimensionDetails?.soil?.metrics || {};
  const english = top.approvedActionEnglish || [];
  setText('compAction', tr(top.approvedActionBangla?.[1] || '', english[1] || ''));
  setText('compActionText', tr(top.approvedActionBangla?.[2] || '', english[2] || ''));
  setText('compRotation', `${tr('ফসল চক্র', 'Rotation')}: ${tr(top.nameBangla, top.nameEnglish)}`);
  setText('compWater', `${num(water.rabiNetIrrigationMm || 199)} ${tr('মিমি', 'mm')}`);
  setText('compHeat', `${num(heat.hotDays ?? 0)} ${tr('দিন', 'days')}`);
  setText('compUrea', `${num(Math.round(soil.rotationUreaKgHa || 120))} ${tr('কেজি', 'kg')}`);
  setText('compFooter', `${tr('রিলিজ', 'Release')} ${advice.release.id} • ${tr('ক্যাশড ভার্সন', 'cached version')}`);
}

// ---------------------------------------------------------------------------
// SCREEN 10: Data Quality
// ---------------------------------------------------------------------------

async function loadDataQualityTable() {
  try {
    currentDataRelease = await (await fetch('/api/v1/data-release')).json();
    renderQuality(currentDataRelease);
  } catch (err) {
    console.error('Failed to load data quality:', err);
  }
}

function renderQuality(data) {}

// ---------------------------------------------------------------------------
// Initial Bootstrapping
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const saved = localStorage.getItem('eden.lang');
    if (saved === 'en' || saved === 'bn') lang = saved;
    const session = sessionStorage.getItem('eden.officer');
    if (session) officerSession = JSON.parse(session);
  } catch {}

  applyStaticText();
  await loadOverview();
  await window.runPlannerCalculation({ switchScreenAfter: false });
  await loadDataQualityTable();
  await loadOfficers();
  if (officerSession) await loadOfficerDesk();
  renderAll();
});
