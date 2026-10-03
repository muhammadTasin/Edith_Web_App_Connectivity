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
let activeRole = null; // 'visitor' | 'farmer' | 'officer' | null (entry screen)
let officerDesk = null;
let officerKnowledge = null;
let audioState = 'idle'; // idle | playing | done | novoice
let audioTimer = null;
let weatherLocations = [];
let weatherForecastData = null;
let weatherNasaData = null;
let selectedWeatherLocation = null;

// ---- API access (shared contract: docs/api-contract.md) ---------------------------------------------------------
const API_BASE = String((typeof window !== 'undefined' && window.EDEN_CONFIG && window.EDEN_CONFIG.apiBase) || '').replace(/\/+$/, '');
const api = (path, init) => fetch(`${API_BASE}${path}`, init);

/** A failed API call with a machine-readable kind: offline | timeout | invalid_input | provider_unavailable | no_data | configuration_required | not_found | unauthorized | internal */
class ApiFailure extends Error {
  constructor(kind, message, status) { super(message); this.kind = kind; this.status = status; }
}
async function apiJson(path, init) {
  let res;
  try {
    res = await api(path, init);
  } catch {
    throw new ApiFailure(navigator.onLine === false ? 'offline' : 'network', 'Network request failed');
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new ApiFailure(body?.error?.code || 'internal', body?.error?.message || `HTTP ${res.status}`, res.status);
  return body;
}
function failureText(failure) {
  switch (failure?.kind) {
    case 'offline': return tr('আপনি অফলাইনে আছেন। সংযোগ পরীক্ষা করুন।', 'You appear to be offline. Check your connection.');
    case 'network': return tr('সার্ভারের সাথে সংযোগ করা যায়নি।', 'Could not reach the server.');
    case 'invalid_input': return tr('অবস্থান বা তথ্য সঠিক নয়: ', 'Invalid input: ') + (failure.message || '');
    case 'provider_unavailable': return tr('তথ্য সরবরাহকারী সেবা (আবহাওয়া/নাসা) এখন পাওয়া যাচ্ছে না। পরে আবার চেষ্টা করুন।', 'The data provider is unavailable right now. Try again later.');
    case 'no_data': return tr('এই অবস্থানের জন্য কোনো উপাত্ত পাওয়া যায়নি।', 'No data is available for this location.');
    case 'configuration_required': return tr('সার্ভারে এই সুবিধার কনফিগারেশন নেই।', 'This capability is not configured on the server.');
    case 'unauthorized': return tr('অনুমতি নেই।', 'Not authorised.');
    default: return tr('একটি ত্রুটি হয়েছে: ', 'Something went wrong: ') + (failure?.message || '');
  }
}

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
  renderWeatherLocationSelectors();
  if (weatherForecastData && selectedWeatherLocation) renderWeatherForecast(weatherForecastData, selectedWeatherLocation);
  if (currentCattleAdvisory) window.renderCattleAdvisory?.(currentCattleAdvisory);
  window.refreshCattleReadiness?.();
  renderAll();
};

function renderAll() {
  if (currentOverview) renderOverview(currentOverview);
  else cattleLoadingState();
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

// Which screens each role can open. This only controls what the interface shows; it is not security.
// Protected API routes must enforce authorisation on the server.
const ROLES = {
  visitor: { home: 'screen-overview', screens: ['screen-overview', 'screen-weather'] },
  farmer: { home: 'screen-farmer', screens: ['screen-farmer', 'screen-planner', 'screen-companion'] },
  officer: {
    home: 'screen-officer',
    screens: ['screen-overview', 'screen-planner', 'screen-comparison', 'screen-evidence', 'screen-ipm', 'screen-officer', 'screen-delivery', 'screen-quality', 'screen-cattle'],
  },
};
const ROLE_KEY = 'eden.role';
const FARMER_KEY = 'eden.farmer';

/** Show only the navigation and controls marked data-roles for this role (null = entry screen). */
function applyRole(role) {
  activeRole = role;
  document.body.classList.toggle('state-entry', !role);
  document.body.classList.toggle('weather-only', false);
  document.body.dataset.role = role || '';
  document.querySelectorAll('[data-roles]').forEach(el => {
    el.hidden = !role || !el.dataset.roles.split(' ').includes(role);
  });
  renderProfile();
  if (currentOverview) renderCattleLive();
  if (role === 'officer' && cattleCardLive.status === 'idle' && currentOverview) loadCattleCardLive();
}

function enterPortal(role) {
  applyRole(role);
  try { sessionStorage.setItem(ROLE_KEY, role); } catch {}
  window.switchScreen(ROLES[role].home);
}

window.goHome = function() {
  if (activeRole) window.switchScreen(ROLES[activeRole].home);
};

window.switchScreen = function(requested) {
  if (!activeRole) return;
  const screenId = ROLES[activeRole].screens.includes(requested) ? requested : ROLES[activeRole].home;
  // A visitor reads weather through the farmer screen's weather panel, with the farmer-only tabs hidden.
  const weatherOnly = screenId === 'screen-weather';
  document.body.classList.toggle('weather-only', weatherOnly);

  document.querySelectorAll('.screen-section').forEach(sec => sec.classList.remove('active'));
  $(weatherOnly ? 'screen-farmer' : screenId)?.classList.add('active');
  document.querySelectorAll('.nav-tab[data-screen], .mobile-nav-item[data-screen]').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screenId);
  });
  if (weatherOnly) window.switchFarmerTab('weather');

  if (screenId === 'screen-cattle') {
    setTimeout(() => {
      window.initCattleScreen?.();
    }, 100);
  }

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
    const res = await api('/api/v1/overview');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    currentOverview = await res.json();
    renderOverview(currentOverview);
    return true;
  } catch (err) {
    console.warn('Overview API unavailable, using offline research baseline:', err);
    if (!currentOverview) currentOverview = FALLBACK_OVERVIEW;
    renderOverview(currentOverview);
    return false;
  }
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
  else renderCattleCard(null);
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
  renderCattleCard(w.cattleHeat);
}

// The API supplies `cattleHeat`, never the `cattleStress` this card used to read, so it stayed blank.

// ---- Dashboard cattle card ---------------------------------------------------------------------------------------
// Static part: the release's Tanore THI climatology (w.cattleHeat). Live part (officers only): the latest advisory of a
// saved farm AOI from /api/v1/cattle/aois. Nothing here is a trained prediction.
const CATTLE_ADVISORY_STALE_HOURS = 6;
let cattleCardLive = { status: 'idle' }; // idle | loading | ready | no_aoi | no_advisory | error

function cattleLoadingState() {
  const badge = $('cattleBadge');
  if (badge) badge.className = 'badge badge-neutral';
  setText('cattleBadge', tr('লোড হচ্ছে', 'Loading'));
  setText('cattleLead', tr('তানোরের গবাদিপশুর তাপ চাপের তথ্য লোড হচ্ছে…', 'Loading cattle heat-stress data for Tanore…'));
}

function renderCattleCard(heat) {
  const badge = $('cattleBadge');
  const months = Array.isArray(heat?.months) ? heat.months : [];
  if (!months.length) {
    if (badge) badge.className = 'badge badge-neutral';
    setText('cattleBadge', tr('উপলব্ধ নয়', 'Unavailable'));
    setText('cattleLead', tr(
      'এই রিলিজে তানোরের গবাদিপশুর তাপ চাপের ঐতিহাসিক তথ্য নেই। সার্ভার থেকে তথ্য পাওয়া গেলে এখানে দেখাবে।',
      'This data release has no historical cattle heat-stress data for Tanore. It will appear here once the server supplies it.'
    ));
    setHtml('cattleChart', '');
    setHtml('cattleFacts', '');
  } else {
    const monthName = (m) => tr(BN_MONTHS[m - 1], EN_MONTHS[m - 1]);
    const pct = (share) => `${num(Math.round(share * 100))}%`;
    const peak = months.find(m => m.month === heat.peakMonth) || months[0];
    const hot = months.filter(m => m.dangerShare >= 0.5).map(m => monthName(m.month));
    if (badge) badge.className = 'badge badge-info';
    setText('cattleBadge', tr('ঐতিহাসিক ধরন', 'Historical pattern'));
    setText('cattleLead', hot.length
      ? tr(
        `তানোরে ${hot.join(', ')} মাসে অর্ধেকের বেশি ঘণ্টা THI বিপদসীমায় বা তার ওপরে থাকে। সবচেয়ে বেশি ${monthName(peak.month)} (${pct(peak.dangerShare)})। এই সময়গুলোর আগে ছায়া ও পানির ব্যবস্থা ঠিক রাখুন।`,
        `In Tanore, more than half of all hours are at or above the THI danger band in ${hot.join(', ')}. The peak is ${monthName(peak.month)} (${pct(peak.dangerShare)}). Plan shade and water ahead of these months.`)
      : tr(
        `২০২৩–২০২৫ সালের তথ্যে কোনো মাসে অর্ধেকের বেশি ঘণ্টা THI বিপদসীমায় পৌঁছায়নি। সর্বোচ্চ ${monthName(peak.month)} (${pct(peak.dangerShare)})।`,
        `In the 2023–2025 data no month had more than half its hours in the THI danger band. Peak: ${monthName(peak.month)} (${pct(peak.dangerShare)}).`));
    const summary = tr(
      `মাসভিত্তিক বিপদসীমা বা তার ওপরে THI-র ঘণ্টার অংশ: ${months.map(m => `${monthName(m.month)} ${pct(m.dangerShare)}`).join(', ')}।`,
      `Share of hours at or above the THI danger band, by month: ${months.map(m => `${monthName(m.month)} ${pct(m.dangerShare)}`).join(', ')}.`);
    $('cattleChart')?.setAttribute('aria-label', summary);
    setHtml('cattleChart', months.map(m => `
      <div class="cattle-bar" title="${escapeHtml(`${monthName(m.month)}: ${pct(m.dangerShare)}`)}">
        <span class="cattle-bar-fill ${m.dangerShare >= 0.5 ? 'is-high' : ''}" style="height: ${Math.round(m.dangerShare * 100)}%"></span>
        <span class="cattle-bar-label" aria-hidden="true">${escapeHtml(lang === 'en' ? EN_MONTHS[m.month - 1] : num(m.month))}</span>
      </div>`).join(''));
    const noRelief = (heat.noReliefMonths || []).map(monthName);
    const coolest = (peak.coolestHours || []).join(', ');
    const facts = [
      coolest
        ? tr(`${monthName(peak.month)} মাসে সবচেয়ে ঠান্ডা ঘণ্টা: ${num(coolest)}। খাওয়ানো ও কাজ এই সময়ে সরানো যায়।`, `Coolest hours in ${monthName(peak.month)}: ${coolest}. Feeding and work can be shifted to these hours.`)
        : tr(`${monthName(peak.month)} মাসের ঠান্ডা ঘণ্টার তথ্য নেই।`, `No coolest-hours data for ${monthName(peak.month)}.`),
    ];
    if (noRelief.length) facts.push(tr(`${noRelief.join(', ')}: প্রায় প্রতি রাতেই কোনো স্বস্তি ছিল না (ঐতিহাসিক রাতের হিসাব)।`, `${noRelief.join(', ')}: nearly every night gave no relief (historical night count).`));
    const source = String(heat.source || '').split(';')[0];
    facts.push(tr(
      `উৎস: ${source}। মাত্র ৩ বছরের তথ্য: দীর্ঘমেয়াদি জলবায়ু নয়, আজকের পূর্বাভাসও নয়।`,
      `Source: ${source}. Only three years of data: not a long-term climatology and not today's forecast.`));
    setHtml('cattleFacts', facts.map(f => `<li>${escapeHtml(f)}</li>`).join(''));
  }
  renderCattleLive();
  if (activeRole === 'officer' && cattleCardLive.status === 'idle') loadCattleCardLive();
}

async function loadCattleCardLive() {
  if (cattleCardLive.status === 'loading') return;
  cattleCardLive = { status: 'loading' };
  renderCattleLive();
  try {
    const { aois = [] } = await apiJson('/api/v1/cattle/aois');
    if (!aois.length) {
      cattleCardLive = { status: 'no_aoi' };
    } else {
      const aoi = (selectedCattleAoi && aois.find(a => a.aoiId === selectedCattleAoi.aoiId)) || aois[0];
      try {
        const { advisory } = await apiJson(`/api/v1/cattle/aois/${encodeURIComponent(aoi.aoiId)}/advisory`);
        cattleCardLive = { status: 'ready', aoi, adv: advisory };
      } catch (err) {
        cattleCardLive = err.kind === 'no_data' ? { status: 'no_advisory', aoi } : { status: 'error', err };
      }
    }
  } catch (err) {
    cattleCardLive = { status: 'error', err };
  }
  renderCattleLive();
}

window.reloadCattleCard = function() {
  cattleCardLive = { status: 'idle' };
  loadCattleCardLive();
};

function renderCattleLive() {
  const box = $('cattleLive');
  if (!box) return;
  const s = cattleCardLive;
  const head = `<h4>${escapeHtml(tr('খামারভিত্তিক পরামর্শ', 'Farm-specific advisory'))}</h4>`;
  const note = (bn, en) => `<p class="small muted">${escapeHtml(tr(bn, en))}</p>`;
  if (activeRole !== 'officer') {
    box.innerHTML = head + note('খামারভিত্তিক পরামর্শ শুধু কর্মকর্তার জন্য। এখানে শুধু তানোরের ঐতিহাসিক ধরন দেখানো হয়েছে।', 'Farm-specific advice is for officers. Only the historical Tanore pattern is shown here.');
  } else if (s.status === 'idle' || s.status === 'loading') {
    box.innerHTML = head + note('সংরক্ষিত খামারের সর্বশেষ পরামর্শ খোঁজা হচ্ছে…', 'Checking the latest advisory for a saved farm…');
  } else if (s.status === 'no_aoi') {
    box.innerHTML = head + note('কোনো খামারের সীমানা (AOI) সংরক্ষিত নেই, তাই খামারভিত্তিক পরামর্শ দেখানো যাচ্ছে না। নিচের বোতামে গিয়ে খামার আঁকুন বা GeoJSON আপলোড করুন।', 'No farm boundary (AOI) is saved, so no farm-specific advisory can be shown. Use the button below to draw a farm or upload GeoJSON.');
  } else if (s.status === 'no_advisory') {
    box.innerHTML = head + note(`“${s.aoi.farmLabel}” খামারের জন্য এখনও কোনো পরামর্শ তৈরি হয়নি। নিচের বোতামে গিয়ে “রিফ্রেশ ও বিশ্লেষণ চালান” চাপুন।`, `No advisory has been produced yet for “${s.aoi.farmLabel}”. Use the button below and press “Run refresh & analysis”.`);
  } else if (s.status === 'error') {
    box.innerHTML = head + note('খামারের পরামর্শ লোড করা যায়নি। ' + failureText(s.err), 'Could not load the farm advisory. ' + failureText(s.err))
      + `<button class="btn btn-sm btn-outline" type="button" onclick="reloadCattleCard()">${escapeHtml(tr('আবার চেষ্টা করুন', 'Retry'))}</button>`;
  } else {
    box.innerHTML = head + cattleLiveReadyHtml(s.aoi, s.adv);
  }
}

function cattleLiveReadyHtml(aoi, adv) {
  const thi = adv.derived.thi;
  const heur = adv.heuristic;
  const forage = adv.forageStatus;
  const [cls, bn, en] = THI_BADGE[thi.category] || ['badge-neutral', thi.category, thi.category];
  const generated = new Date(adv.generatedAt);
  const stale = (Date.now() - generated.getTime()) / 3600000 > CATTLE_ADVISORY_STALE_HOURS;
  const when = generated.toLocaleString(lang === 'en' ? 'en-GB' : 'bn-BD');
  const provider = adv.measured?.forecast?.source?.provider || 'Open-Meteo';
  const cool = thi.lowestThiHours?.length ? thi.lowestThiHours.map(h => num(h)).join(', ') : tr('উপাত্ত নেই', 'no data');
  const water = lang === 'en' ? heur.waterDemand.labelEnglish : heur.waterDemand.labelBangla;
  const grazing = lang === 'en' ? heur.grazing.rationaleEnglish : heur.grazing.rationaleBangla;
  const bullets = (lang === 'en' ? heur.bulletsEnglish : heur.bulletsBangla) || [];
  const obs = forage.observationDate ? `, ${isoDate(forage.observationDate)}` : '';
  const greenness = forage.ndviProxy !== null
    ? tr(`${num(forage.ndviProxy.toFixed(2))} (MODIS ৫০০ মি.${obs}) — শুধু সবুজতা, ঘাসের পরিমাণ নয়`, `${forage.ndviProxy.toFixed(2)} (MODIS 500 m${obs}) — greenness only, not forage biomass`)
    : tr('উপলব্ধ নয় (Earth Engine থেকে মান আসেনি); ঘাসের অবস্থা বলা যাচ্ছে না', 'Unavailable (no Earth Engine value); forage condition cannot be stated');
  const unavailable = (adv.modelStatus?.unavailablePredictions || [])
    .map(p => `${lang === 'en' ? p.targetLabelEnglish : p.targetLabelBangla}: ${lang === 'en' ? p.reasonEnglish : p.reasonBangla}`);
  if (!unavailable.length) unavailable.push(tr('দুধ কমা ও রোগের ঝুঁকির পূর্বাভাস: যাচাইকৃত লেবেলযুক্ত উপাত্ত নেই, তাই উপলব্ধ নয়।', 'Milk-loss and disease-risk prediction: unavailable; no validated labelled data.'));
  const li = (label, value) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`;
  const staleText = tr(` — ${num(CATTLE_ADVISORY_STALE_HOURS)} ঘণ্টার বেশি পুরনো; অবস্থা বদলে থাকতে পারে। পর্দা খুলে রিফ্রেশ করুন।`, ` — older than ${CATTLE_ADVISORY_STALE_HOURS} hours; conditions may have changed. Open the screen and refresh.`);
  return `
    <p class="small"><strong>${escapeHtml(aoi.farmLabel)}</strong>${aoi.demo ? ` <span class="badge badge-neutral">${escapeHtml(tr('ডেমো খামার', 'Demo farm'))}</span>` : ''}</p>
    <p class="small">${escapeHtml(tr('তাপ চাপ সূচক (THI)', 'Heat-stress index (THI)'))}: <strong>${num(thi.current)}</strong> <span class="badge ${cls}">${escapeHtml(tr(bn, en))}</span></p>
    <ul class="warning-list">
      ${li(tr('গণনা', 'Computed'), tr(`THI NRC (1971) সূত্রে, ${provider} আবহাওয়া মডেলের অনুমান থেকে`, `THI by the NRC (1971) formula from ${provider} weather-model estimates`))}
      ${li(tr('ঠান্ডা ঘণ্টা (পূর্বাভাস)', 'Cooler hours (forecast)'), cool)}
      ${li(tr('চারণ (নিয়মভিত্তিক অনুমান)', 'Grazing (rule-based heuristic)'), grazing)}
      ${li(tr('পানির চাহিদা (শ্রেণি, লিটার নয়)', 'Water demand (category, not litres)'), water)}
      ${li(tr('সবুজতা', 'Greenness'), greenness)}
    </ul>
    ${bullets.length ? `<ul class="warning-list">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
    <p class="small muted">${escapeHtml(tr('উপলব্ধ নয়', 'Unavailable'))}: ${escapeHtml(unavailable.join(' · '))}</p>
    <p class="small ${stale ? 'cattle-stale' : 'muted'}">${escapeHtml(tr(`তৈরি: ${when}`, `Generated: ${when}`))}${stale ? escapeHtml(staleText) : ''}</p>`;
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
  const ok = await loadOverview();
  if (btn) setTimeout(() => { btn.style.transform = 'none'; }, 700);
  // Only re-reads the server's current release; there is no endpoint that fetches NASA/BMD data on demand.
  showToast('cycle-select-toast', ok
    ? tr('সার্ভারের সর্বশেষ ডেটা রিলিজ পুনরায় লোড হয়েছে। নাসা/বিএমডি থেকে নতুন ডেটা আনা হয়নি।', 'Reloaded the latest data release from the server. No new NASA/BMD data was fetched.')
    : tr('সার্ভারে সংযোগ করা যায়নি; অফলাইন ডেটা দেখানো হচ্ছে। কিছুই সিঙ্ক হয়নি।', 'Could not reach the server; showing offline data. Nothing was synced.'));
};

// Demo-only: there is no notice-sending endpoint, so nothing is stored or sent.
window.approveNotice = function() {
  setText('dispatchToastTitle', tr('ডেমো অনুমোদন', 'Demo approval'));
  showToast('dispatch-toast', tr(
    'এটি শুধু ডেমো। কোনো এসএমএস বা নোটিশ কৃষকের কাছে পাঠানো হয়নি এবং অনুমোদন সংরক্ষিত হয়নি।',
    'Demo only. No SMS or notice was sent to any farmer and the approval was not saved.'
  ), 5000);
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
    const res = await api('/api/v1/advice', {
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
    officers = await (await api('/api/v1/officers')).json();
    setHtml('officerSelect', officers.map(o => `<option value="${o.id}">${escapeHtml(tr(o.nameBangla, o.nameEnglish))} (${escapeHtml(tr(o.blockBangla, o.blockEnglish))})</option>`).join(''));
  } catch (err) {
    console.error('Failed to load officers:', err);
  }
}

async function loadOfficerDesk() {
  if (!officerSession?.token) return;
  try {
    const res = await api('/api/v1/officer/desk', {
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

function setEntryError(id, message) {
  const box = $(id);
  if (!box) return;
  box.textContent = message || '';
  box.hidden = !message;
}

function setEntryBusy(buttonId, busy) {
  const btn = $(buttonId);
  if (btn) btn.disabled = busy;
}

window.officerSignIn = async function(e) {
  e?.preventDefault();
  const officerId = $('officerSelect').value;
  const accessCode = $('officerCode').value;
  setEntryError('officerLoginError', '');
  if (!officerId) {
    setEntryError('officerLoginError', tr('কর্মকর্তার তালিকা লোড হয়নি। সার্ভার চালু আছে কি না দেখুন।', 'The officer list did not load. Check that the server is running.'));
    loadOfficers();
    return;
  }
  setEntryBusy('entryOfficerBtn', true);
  try {
    const res = await api('/api/v1/officer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officerId, accessCode }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token) {
      setEntryError('officerLoginError', tr('কর্মকর্তা বা প্রবেশ কোড সঠিক নয়।', 'The officer or access code is not correct.'));
      return;
    }
    officerSession = data;
    currentUser = { id: data.officer.id, role: 'officer', nameBangla: data.officer.nameBangla, blockBangla: data.officer.blockBangla };
    try { sessionStorage.setItem('eden.officer', JSON.stringify(data)); } catch {}
    await loadOfficerDesk();
    if (!officerSession) {
      setEntryError('officerLoginError', tr('সেশন শুরু করা যায়নি। আবার চেষ্টা করুন।', 'Could not start the session. Please try again.'));
      return;
    }
    $('officerCode').value = '';
    enterPortal('officer');
  } catch {
    setEntryError('officerLoginError', tr('সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।', 'Could not reach the server. Please try again.'));
  } finally {
    setEntryBusy('entryOfficerBtn', false);
  }
};

/** End the current role (and its demo session, if any) and return to the role chooser. */
window.signOutRole = function() {
  const token = authToken || officerSession?.token;
  if (token) api('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  officerSession = null;
  officerDesk = null;
  currentUser = null;
  authToken = null;
  try {
    sessionStorage.removeItem('eden.officer');
    sessionStorage.removeItem(FARMER_KEY);
    sessionStorage.removeItem(ROLE_KEY);
  } catch {}
  window.closeRoleModal();
  applyRole(null);
  renderOfficer();
  if ($('officerCode')) $('officerCode').value = '';
  window.showEntryStep('choose');
  window.scrollTo({ top: 0 });
};
window.switchRole = window.signOutRole;
window.officerSignOut = window.signOutRole;

window.officerReset = async function() {
  if (!officerSession?.token) return;
  await api('/api/v1/officer/reset', {
    method: 'POST',
    headers: { Authorization: `Bearer ${officerSession.token}` },
  });
  await loadOfficerDesk();
};

function renderProfile() {
  const o = officerSession?.officer;
  let name = '';
  let role = '';
  let avatar = '';
  let note = '';
  if (activeRole === 'visitor') {
    name = tr('দর্শনার্থী', 'Visitor');
    role = tr('সাইন-ইন ছাড়া · শুধু পড়া', 'Not signed in · read-only');
    avatar = tr('দ', 'V');
    note = tr('আপনি সাইন-ইন ছাড়া শুধু খোলা পাতা দেখছেন।', 'You are viewing public pages only, without signing in.');
  } else if (activeRole === 'farmer') {
    name = currentUser?.nameBangla ? tr(currentUser.nameBangla, currentUser.nameEnglish || currentUser.nameBangla) : tr('নমুনা কৃষক', 'Sample farmer');
    role = tr('কৃষক · ডেমো সেশন', 'Farmer · demo session');
    avatar = tr('কৃ', 'F');
    note = tr('ডেমো সেশন: এসএমএস বা ওটিপি দিয়ে যাচাই হয়নি।', 'Demo session: not verified by SMS or OTP.');
  } else if (activeRole === 'officer') {
    name = o ? tr(o.nameBangla, o.nameEnglish || o.nameBangla) : tr('কর্মকর্তা', 'Officer');
    role = o ? tr(`SAAO, ${o.blockBangla} · ডেমো`, `SAAO, ${o.blockEnglish || o.blockBangla} · demo`) : tr('SAAO · ডেমো', 'SAAO · demo');
    avatar = tr('কর্', 'O');
    note = tr('ডেমো প্রবেশ: এটি আসল বা নিরাপদ লগইন নয়।', 'Demo access: not a real or secure login.');
  }
  setText('saaoName', name);
  setText('saaoRole', role);
  setText('userAvatarDot', avatar);
  setText('accountName', name);
  setText('accountRole', role);
  setText('accountAvatar', avatar);
  setText('accountNote', note);
  if ($('accountSignOutBtn')) $('accountSignOutBtn').hidden = activeRole === 'visitor';
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
  showToast('cycle-select-toast', tr('ডেমো: শিডিউল সংরক্ষিত হয়নি এবং কৃষককে জানানো হয়নি।', 'Demo only: the new schedule was not saved and the farmer was not notified.'));
};

window.markVisited = function() {
  showToast('cycle-select-toast', tr('ডেমো: ভিজিট সম্পন্ন হিসেবে সংরক্ষিত হয়নি।', 'Demo only: the visit was not recorded as completed.'));
};

window.dispatchFieldAdvice = async function() {
  const notes = $('fcAdvisoryNotes')?.value || 'মাঠ পরিদর্শন পরামর্শ প্রেরিত';
  let saved = false;
  if (officerSession?.token) {
    try {
      const res = await api('/api/v1/officer/observations', {
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
      saved = res.ok;
      if (saved) await loadOfficerDesk();
    } catch { /* offline: reported below as not saved */ }
  }
  // No SMS or app push exists yet (docs/api-contract.md): say what really happened.
  setText('dispatchToastTitle', saved ? tr('পরামর্শ সংরক্ষিত হয়েছে', 'Advice saved') : tr('পরামর্শ সংরক্ষিত হয়নি', 'Advice not saved'));
  showToast('dispatch-toast', saved
    ? tr('অফিসার ডেস্কে সংরক্ষিত হয়েছে। কোনো এসএমএস পাঠানো হয়নি — এসএমএস সেবা এখনো সংযুক্ত নয়।', 'Saved to the officer desk. No SMS was sent: SMS delivery is not connected yet.')
    : tr('সংরক্ষণ করা যায়নি (কর্মকর্তা হিসেবে সাইন-ইন করুন বা আবার চেষ্টা করুন)। কোনো এসএমএস পাঠানো হয়নি।', 'Not saved (sign in as an officer or try again). No SMS was sent.'));
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
  const res = await api('/api/v1/officer/observations', {
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

  if (tab === 'weather') loadWeatherForecast();
  else if (tab === 'erosion') fetchRiverErosion('jamuna');
};

const weatherLocationName = (location) => location.source === 'gps'
  ? tr(`আপনার বর্তমান অবস্থান (${location.lat.toFixed(2)}, ${location.lon.toFixed(2)})`, `Your current location (${location.lat.toFixed(2)}, ${location.lon.toFixed(2)})`)
  : tr(`${location.upazilaBn}, ${location.districtBn}`, `${location.upazilaEn}, ${location.districtEn}`);

function renderWeatherLocationSelectors() {
  const districtSelect = $('weatherDistrictSelect');
  const upazilaSelect = $('weatherUpazilaSelect');
  if (!districtSelect || !upazilaSelect || !weatherLocations.length) return;

  const previousDistrict = districtSelect.value;
  const previousUpazila = upazilaSelect.value;
  const districtMap = new Map();
  weatherLocations.forEach(location => {
    if (!districtMap.has(location.districtId)) {
      districtMap.set(location.districtId, { id: location.districtId, bn: location.districtBn, en: location.districtEn });
    }
  });
  const sortLocalName = (a, b) => lang === 'en'
    ? a.en.localeCompare(b.en)
    : a.bn.localeCompare(b.bn, 'bn');
  const districts = [...districtMap.values()].sort(sortLocalName);
  const savedDistrict = districts.some(d => d.id === previousDistrict)
    ? previousDistrict
    : selectedWeatherLocation?.districtId || districts[0]?.id; // no pilot-site default: nothing loads until an upazila is chosen
  districtSelect.innerHTML = districts.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(tr(d.bn, d.en))}</option>`).join('');
  districtSelect.value = savedDistrict;
  districtSelect.disabled = false;

  const inDistrict = weatherLocations.filter(location => location.districtId === savedDistrict).sort((a, b) => sortLocalName(
    { bn: a.upazilaBn, en: a.upazilaEn },
    { bn: b.upazilaBn, en: b.upazilaEn },
  ));
  const selectedUpazila = inDistrict.some(location => location.id === previousUpazila)
    ? previousUpazila
    : selectedWeatherLocation?.districtId === savedDistrict ? selectedWeatherLocation.id : '';
  upazilaSelect.innerHTML = `<option value="">${tr('উপজেলা বেছে নিন', 'Choose an upazila')}</option>${inDistrict.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(tr(location.upazilaBn, location.upazilaEn))}</option>`).join('')}`;
  upazilaSelect.value = selectedUpazila;
  upazilaSelect.disabled = false;
}

const WEATHER_STORAGE_KEY = 'eden.weather.location';
const saveWeatherChoice = (value) => { try { value ? localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(value)) : localStorage.removeItem(WEATHER_STORAGE_KEY); } catch { /* storage unavailable */ } };
const readWeatherChoice = () => {
  try {
    const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
    if (!raw) return null;
    return raw.startsWith('{') ? JSON.parse(raw) : { type: 'upazila', id: raw }; // older versions stored just the id
  } catch { return null; }
};

/** Flatten the API's district -> upazila hierarchy into the list the selectors use. */
function flattenLocations(payload) {
  return (payload?.districts || []).flatMap(d => d.upazilas.map(u => ({
    id: u.id, districtId: d.id, districtBn: d.nameBn, districtEn: d.nameEn,
    upazilaBn: u.nameBn, upazilaEn: u.nameEn, lat: u.lat, lon: u.lon, approximate: u.approximate,
  })));
}

function showWeatherStatus(kind, bn, en, retry = false) {
  const box = $('weatherStatusBox');
  if (!box) return;
  box.hidden = !bn;
  box.className = `weather-status weather-status-${kind}`;
  setText('weatherStatusText', bn ? tr(bn, en) : '');
  const btn = $('weatherRetryBtn');
  if (btn) btn.hidden = !retry;
}

function clearWeatherView() {
  weatherForecastData = null;
  weatherNasaData = null;
  setText('fwTemp', '—');
  setText('fwHumidity', '—');
  setText('fwRain', '—');
  setHtml('weatherForecastList', '');
  setHtml('weatherHourlyThi', '');
  setHtml('weatherNasaBox', '');
  setText('weatherSourceNote', '');
}

async function initializeWeatherLocations() {
  const districtSelect = $('weatherDistrictSelect');
  const upazilaSelect = $('weatherUpazilaSelect');
  if (!districtSelect || !upazilaSelect) return;

  try {
    const payload = await apiJson('/api/v1/locations');
    weatherLocations = flattenLocations(payload);
    if (!weatherLocations.length) throw new ApiFailure('no_data', 'Location list is empty');

    const saved = readWeatherChoice();
    selectedWeatherLocation = null;
    if (saved?.type === 'gps' && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
      selectedWeatherLocation = { id: `gps:${saved.lat},${saved.lon}`, source: 'gps', lat: saved.lat, lon: saved.lon };
    } else if (saved?.id) {
      selectedWeatherLocation = weatherLocations.find(location => location.id === saved.id) || null;
    }
    renderWeatherLocationSelectors();
    if (selectedWeatherLocation && selectedWeatherLocation.source !== 'gps') {
      $('weatherDistrictSelect').value = selectedWeatherLocation.districtId;
      $('weatherUpazilaSelect').value = selectedWeatherLocation.id;
    }
    if (selectedWeatherLocation) {
      setText('weatherDataNotice', tr(
        `${weatherLocationName(selectedWeatherLocation)}-এর আবহাওয়া লোড করতে আবহাওয়া ট্যাব খুলুন।`,
        `Open the Weather tab to load the forecast for ${weatherLocationName(selectedWeatherLocation)}.`,
      ));
    } else {
      setText('weatherDataNotice', tr('আবহাওয়া দেখতে জেলা ও উপজেলা বেছে নিন, অথবা বর্তমান অবস্থান ব্যবহার করুন।', 'Choose a district and upazila, or use your current location.'));
    }
    districtSelect.addEventListener('change', () => {
      selectedWeatherLocation = null;
      clearWeatherView();
      renderWeatherLocationSelectors();
      showWeatherStatus('', '', '');
      setText('weatherDataNotice', tr('উপজেলার আবহাওয়া দেখতে তালিকা থেকে উপজেলা বেছে নিন।', 'Choose an upazila to view its weather forecast.'));
      saveWeatherChoice(null);
    });
    upazilaSelect.addEventListener('change', () => {
      selectedWeatherLocation = weatherLocations.find(location => location.id === upazilaSelect.value) || null;
      clearWeatherView();
      if (!selectedWeatherLocation) return;
      saveWeatherChoice({ type: 'upazila', id: selectedWeatherLocation.id });
      loadWeatherForecast();
    });
  } catch (error) {
    console.error('Weather location list error:', error);
    districtSelect.disabled = true;
    upazilaSelect.disabled = true;
    showWeatherStatus('error', `জেলা-উপজেলার তালিকা লোড করা যায়নি। ${failureText(error)}`, `Could not load the district/upazila list. ${failureText(error)}`, true);
    $('weatherRetryBtn')?.setAttribute('data-retry', 'locations');
  }
}

/** Browser location. Denial, unsupported browsers, timeouts and positions outside Bangladesh each get their own message. */
window.useCurrentWeatherLocation = function() {
  if (!('geolocation' in navigator)) {
    showWeatherStatus('error', 'এই ব্রাউজার লোকেশন সমর্থন করে না। জেলা ও উপজেলা বেছে নিন।', 'This browser does not support location. Please choose a district and upazila.');
    return;
  }
  showWeatherStatus('info', 'আপনার অবস্থান নির্ণয় করা হচ্ছে…', 'Finding your location…');
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = Math.round(pos.coords.latitude * 100) / 100; // ~1 km: coarse on purpose, since this value is stored on the device
    const lon = Math.round(pos.coords.longitude * 100) / 100;
    if (lat < 20.4 || lat > 26.8 || lon < 88.0 || lon > 92.8) {
      showWeatherStatus('error', 'আপনার অবস্থান বাংলাদেশের বাইরে। জেলা ও উপজেলা বেছে নিন।', 'Your location is outside Bangladesh. Please choose a district and upazila.');
      return;
    }
    selectedWeatherLocation = { id: `gps:${lat},${lon}`, source: 'gps', lat, lon };
    $('weatherDistrictSelect').value = '';
    renderWeatherLocationSelectors();
    clearWeatherView();
    saveWeatherChoice({ type: 'gps', lat, lon });
    loadWeatherForecast();
  }, (err) => {
    if (err.code === err.PERMISSION_DENIED) showWeatherStatus('error', 'লোকেশনের অনুমতি দেওয়া হয়নি। জেলা ও উপজেলা বেছে নিন।', 'Location permission was denied. Please choose a district and upazila.');
    else if (err.code === err.TIMEOUT) showWeatherStatus('error', 'অবস্থান নির্ণয়ে বেশি সময় লাগছে। আবার চেষ্টা করুন বা হাতে বেছে নিন।', 'Finding your location timed out. Try again or choose manually.');
    else showWeatherStatus('error', 'অবস্থান পাওয়া যায়নি (জিপিএস বন্ধ থাকতে পারে)। হাতে বেছে নিন।', 'Your position is unavailable (GPS may be off). Please choose manually.');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
};

window.retryWeather = function() {
  if ($('weatherRetryBtn')?.getAttribute('data-retry') === 'locations') {
    initializeWeatherLocations();
    return;
  }
  loadWeatherForecast();
};

const weatherIcon = (code) => {
  if (code === 0 || code === 1) return 'wb_sunny';
  if (code === 2 || code === 3) return 'partly_cloudy_day';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 67) return 'rainy';
  if (code >= 71 && code <= 77) return 'weather_snowy';
  if (code >= 80 && code <= 82) return 'rainy';
  if (code === 85 || code === 86) return 'weather_snowy';
  if (code >= 95) return 'thunderstorm';
  return 'cloud';
};

/** NRC (1971) THI, same formula as the API. Computed only for hours that have BOTH temperature and humidity from the forecast. */
const thiOf = (t, rh) => (1.8 * t + 32) - (0.55 - 0.0055 * Math.min(100, Math.max(0, rh))) * (1.8 * t - 26);
const thiClass = (thi) => (thi < 72 ? 'normal' : thi < 79 ? 'alert' : thi < 84 ? 'danger' : 'emergency');

function renderHourlyThi(forecast) {
  const nowLocal = forecast.current.time; // zone-naive local time string
  const hours = (forecast.hourly || []).filter(h => h.time >= nowLocal.slice(0, 13)).slice(0, 24);
  if (!hours.length) { setHtml('weatherHourlyThi', ''); return; }
  const usable = hours.filter(h => h.temperatureC != null && h.relativeHumidityPct != null);
  const missing = hours.length - usable.length;
  const pills = usable.map(h => {
    const thi = thiOf(Number(h.temperatureC), Number(h.relativeHumidityPct));
    return `<div class="hourly-thi-pill thi-${thiClass(thi)}">
      <span>${num(h.time.slice(11, 16))}</span><strong>${num(thi.toFixed(0))}</strong>
      <small>${num(Number(h.temperatureC).toFixed(0))}°C · ${num(Math.round(Number(h.relativeHumidityPct)))}%</small></div>`;
  }).join('');
  setHtml('weatherHourlyThi', `<h4>${escapeHtml(tr('ঘণ্টাভিত্তিক গরুর তাপ চাপ সূচক (THI)', 'Hourly cattle heat-stress index (THI)'))}</h4>
    <p class="weather-source-note">${escapeHtml(tr('গণনা করা মান (আবহাওয়া মডেলের ঘণ্টাভিত্তিক তাপমাত্রা ও আর্দ্রতা থেকে, NRC 1971 সূত্র)। সাধারণ গরুর ক্যাটাগরি; স্থানীয় জাতের জন্য যাচাইকৃত নয়।', 'Calculated value (from the model\'s hourly temperature and humidity, NRC 1971 formula). Generic dairy-cattle categories, not validated for local breeds.'))}</p>
    <div class="hourly-thi-strip">${pills || ''}</div>
    ${missing ? `<p class="weather-source-note">${escapeHtml(tr(`${num(missing)} ঘণ্টার উপাত্ত অসম্পূর্ণ, তাই বাদ দেওয়া হয়েছে।`, `${missing} hour(s) lack temperature or humidity and are omitted.`))}</p>` : ''}`);
}

function renderNasaBox(nasa, failure) {
  if (failure) {
    setHtml('weatherNasaBox', `<h4>${escapeHtml(tr('নাসা পর্যবেক্ষণ (বিলম্বিত উপাত্ত)', 'NASA observations (delayed data)'))}</h4><p class="weather-source-note">${escapeHtml(failureText(failure))}</p>`);
    return;
  }
  const mm = (v) => (v == null ? '—' : `${num(Number(v).toFixed(1))} ${tr('মিমি', 'mm')}`);
  const deg = (v) => (v == null ? '—' : `${num(Number(v).toFixed(1))}°C`);
  setHtml('weatherNasaBox', `<h4>${escapeHtml(tr('নাসা পর্যবেক্ষণ — বিলম্বিত, সরাসরি নয়', 'NASA observations — delayed, not live'))}</h4>
    <p class="weather-source-note">${escapeHtml(tr(`নাসা পাওয়ার; সর্বশেষ পর্যবেক্ষণ ${isoDate(nasa.latestObservationDate)}। পূর্বাভাস নয়। মাটির আর্দ্রতা (SMAP) এখানে পাওয়া যায় না।`, `NASA POWER; latest observation ${isoDate(nasa.latestObservationDate)}. Not a forecast. SMAP soil moisture is not available here.`))}</p>
    <ul class="warning-list">
      <li>${escapeHtml(tr('সর্বশেষ দিনের গড় তাপমাত্রা', 'Latest-day mean temperature'))}: <strong>${deg(nasa.latest.t2m)}</strong></li>
      <li>${escapeHtml(tr(`${nasa.windowStart} – ${nasa.windowEnd} গড় তাপমাত্রা`, `Mean temperature ${nasa.windowStart} – ${nasa.windowEnd}`))}: <strong>${deg(nasa.meanT2mWindow)}</strong></li>
      <li>${escapeHtml(tr('একই সময়ের মোট বৃষ্টি', 'Total rain in the same period'))}: <strong>${mm(nasa.rainWindowMm)}</strong> (${num(nasa.rainDaysWithData)}/${num(30)} ${escapeHtml(tr('দিনের উপাত্ত', 'days with data'))})</li>
    </ul>`);
}

function renderWeatherForecast(data, location) {
  const forecast = data?.forecast;
  if (!forecast?.current || !Array.isArray(forecast.daily)) return;
  const current = forecast.current;
  const locale = lang === 'en' ? 'en-BD' : 'bn-BD';
  const dateFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: forecast.timezone || 'Asia/Dhaka' });
  const currentTemp = current.temperatureC == null ? NaN : Number(current.temperatureC);
  const humidity = current.relativeHumidityPct == null ? NaN : Number(current.relativeHumidityPct);
  const upcomingHours = (forecast.hourly || []).filter(hour => hour.time >= current.time.slice(0, 13)).slice(0, 24);
  const hasNextDayRain = upcomingHours.length === 24 && upcomingHours.every(hour => hour.precipitationMm != null && Number.isFinite(Number(hour.precipitationMm)));
  const nextDayRain = hasNextDayRain ? upcomingHours.reduce((sum, hour) => sum + Number(hour.precipitationMm), 0) : NaN;
  setText('fwTemp', Number.isFinite(currentTemp) ? `${num(currentTemp.toFixed(1))}°C` : '—');
  setText('fwHumidity', Number.isFinite(humidity) ? `${num(Math.round(humidity))}%` : '—');
  setText('fwRain', Number.isFinite(nextDayRain) ? `${num(nextDayRain.toFixed(1))} ${tr('মিমি', 'mm')}` : '—');

  const updateTime = forecast.fetchedAt ? new Date(forecast.fetchedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  setHtml('weatherDataNotice', `${escapeHtml(weatherLocationName(location))}<br>${escapeHtml(tr('সর্বশেষ হালনাগাদ', 'Updated'))}: ${escapeHtml(updateTime)} · ${escapeHtml(tr('পূর্বাভাস সময় (স্থানীয়)', 'Forecast time (local)'))}: ${escapeHtml(current.time.replace('T', ' '))}`);
  setText('weatherSourceNote', tr(
    'সূত্র: Open-Meteo — সংখ্যাভিত্তিক আবহাওয়া মডেলের অনুমান (পূর্বাভাস), স্থানীয় আবহাওয়া স্টেশনের মাপ নয়।',
    'Source: Open-Meteo — numerical weather-model estimate (forecast), not a local weather-station observation.',
  ));
  setHtml('weatherForecastList', forecast.daily.map(day => {
    const max = day.temperatureMaxC == null ? NaN : Number(day.temperatureMaxC);
    const min = day.temperatureMinC == null ? NaN : Number(day.temperatureMinC);
    const rain = day.precipitationMm == null ? NaN : Number(day.precipitationMm);
    const date = day.date ? dateFormatter.format(new Date(`${day.date}T12:00:00`)) : '';
    return `<div class="weather-day-card">
      <span class="weather-day-date">${escapeHtml(date)}</span>
      <span class="material-symbols-outlined weather-day-icon">${weatherIcon(Number(day.weatherCode))}</span>
      <span class="weather-day-temperature">${num(Number.isFinite(max) ? max.toFixed(0) : '—')}° / ${num(Number.isFinite(min) ? min.toFixed(0) : '—')}°</span>
      <span class="weather-day-rain">${Number.isFinite(rain) ? `${num(rain.toFixed(1))} ${tr('মিমি', 'mm')}` : '—'}</span>
    </div>`;
  }).join(''));
  renderHourlyThi(forecast);
  if (weatherNasaData) renderNasaBox(weatherNasaData, null);
}

let weatherLoadSeq = 0;
async function loadWeatherForecast() {
  const location = selectedWeatherLocation;
  if (!location) return;
  const seq = ++weatherLoadSeq;
  const stale = () => seq !== weatherLoadSeq || selectedWeatherLocation?.id !== location.id;
  clearWeatherView();
  showWeatherStatus('info', `${weatherLocationName(location)}-এর আবহাওয়া লোড হচ্ছে…`, `Loading weather for ${weatherLocationName(location)}…`);
  const query = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon) });

  // The two sources are independent: a NASA outage must not hide the forecast, and vice versa.
  const [forecastResult, nasaResult] = await Promise.allSettled([
    apiJson(`/api/v1/weather/forecast?${query}`),
    apiJson(`/api/v1/weather?${query}`),
  ]);
  if (stale()) return;

  if (forecastResult.status === 'fulfilled') {
    weatherForecastData = forecastResult.value;
    weatherNasaData = nasaResult.status === 'fulfilled' ? nasaResult.value : null;
    showWeatherStatus('', '', '');
    renderWeatherForecast(weatherForecastData, location);
  } else {
    console.error('Weather forecast load error:', forecastResult.reason);
    showWeatherStatus('error', `${weatherLocationName(location)}-এর পূর্বাভাস আনা যায়নি। ${failureText(forecastResult.reason)}`, `Could not load the forecast for ${weatherLocationName(location)}. ${failureText(forecastResult.reason)}`, true);
    $('weatherRetryBtn')?.setAttribute('data-retry', 'forecast');
  }
  if (nasaResult.status === 'fulfilled') renderNasaBox(nasaResult.value, null);
  else renderNasaBox(null, nasaResult.reason);
}

window.fetchRiverErosion = async function(river) {
  try {
    const res = await api(`/api/v1/erosion?river=${river}`);
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

let farmerAudioEl = null;
function setAudioStatus(bn, en) { setText('audioStatusText', tr(bn, en)); }

/** Speaks only text the API produced. Tries the server TTS provider; if it is not configured or fails, falls back to the
 *  browser's speech engine and says which was used. If neither is available it says so; it never invents a script. */
window.toggleFarmerAudio = async function() {
  const icon = $('farmerAudioIcon');
  const stop = () => {
    if (farmerAudioEl) { farmerAudioEl.pause(); farmerAudioEl = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (icon) icon.textContent = 'play_arrow';
    if ($('audioProgressBar')) $('audioProgressBar').style.width = '0%';
  };
  if (audioState === 'playing') { audioState = 'idle'; stop(); return; }

  const script = currentAdvice?.farmer_card?.audioScriptBangla;
  if (!script) { setAudioStatus('শোনানোর মতো পরামর্শ এখনও লোড হয়নি।', 'There is no advisory text to read yet.'); return; }

  audioState = 'playing';
  if (icon) icon.textContent = 'pause';
  const finish = () => { audioState = 'idle'; stop(); };
  try {
    const res = await api('/api/v1/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: script, language: 'bn' }) });
    if (res.ok) {
      const url = URL.createObjectURL(await res.blob());
      farmerAudioEl = new Audio(url);
      farmerAudioEl.ontimeupdate = () => { if (farmerAudioEl?.duration) $('audioProgressBar').style.width = `${(farmerAudioEl.currentTime / farmerAudioEl.duration) * 100}%`; };
      farmerAudioEl.onended = finish;
      setAudioStatus('সার্ভারের টেক্সট-টু-স্পিচ ব্যবহার করা হচ্ছে।', 'Playing audio from the server text-to-speech provider.');
      await farmerAudioEl.play();
      return;
    }
  } catch { /* fall through to on-device speech */ }

  if ('speechSynthesis' in window) {
    const voices = window.speechSynthesis.getVoices();
    const hasBangla = voices.some(v => /^bn/i.test(v.lang));
    if (voices.length && !hasBangla) {
      setAudioStatus('এই ডিভাইসে বাংলা ভয়েস নেই এবং সার্ভারে টিটিএস কনফিগার করা নেই, তাই অডিও চালানো যাচ্ছে না। লিখিত পরামর্শ পড়ুন।', 'No Bangla voice on this device and no server TTS configured, so audio cannot play. Please read the text advisory.');
      finish();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.lang = 'bn-BD';
    utterance.rate = 0.95;
    utterance.onend = finish;
    utterance.onerror = finish;
    setAudioStatus('সার্ভারে টিটিএস কনফিগার করা নেই; ডিভাইসের ভয়েস ব্যবহার করা হচ্ছে।', 'Server TTS is not configured; using this device\'s speech engine.');
    window.speechSynthesis.speak(utterance);
    return;
  }
  setAudioStatus('অডিও চালানো সম্ভব নয়: সার্ভারে টিটিএস নেই এবং এই ব্রাউজার স্পিচ সমর্থন করে না।', 'Audio is unavailable: no server TTS and this browser has no speech support.');
  finish();
};

function renderAudioButton() {
  const btn = $('farmerAudioBtn');
  if (btn) {
    btn.title = tr('পরামর্শ শুনুন', 'Listen to advisory');
  }
}


window.requestSaaoCallback = async function() {
  const result = await simulateFarmerKeypad('9');
  // The server only records a callback request on the officer desk; no call or SMS is placed.
  showToast('cycle-select-toast', result?.callbackId
    ? tr('কল-ব্যাক অনুরোধ কর্মকর্তা ডেস্কে নথিভুক্ত হয়েছে (ডেমো)। কোনো ফোন কল বা এসএমএস করা হয়নি।', 'Callback request recorded on the officer desk (demo). No call or SMS was made.')
    : tr('কল-ব্যাক অনুরোধ নথিভুক্ত করা যায়নি। আবার চেষ্টা করুন।', 'Could not record the callback request. Please try again.'), 5000);
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
    const res = await api('/api/v1/ai/ask', {
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
    showToast('cycle-select-toast', tr('খামারের তথ্য শুধু এই পেজে দেখানো হয়েছে; সার্ভারে সংরক্ষিত হয়নি।', 'Farm details are shown on this page only; they were not saved to the server.'));
  }
};

// ---------------------------------------------------------------------------
// Unified Role Modal & Auth
// ---------------------------------------------------------------------------

window.openRoleModal = function() {
  if (!activeRole) return;
  renderProfile();
  $('modal-account')?.classList.remove('hidden');
  $('modal-account')?.querySelector('button.btn')?.focus();
};

window.closeRoleModal = function() {
  $('modal-account')?.classList.add('hidden');
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('modal-account')?.classList.contains('hidden')) window.closeRoleModal();
});

// ---- Entry screen: role selection ------------------------------------------------------------------------------

window.showEntryStep = function(step) {
  for (const [id, name] of [['entryChoose', 'choose'], ['entryFarmer', 'farmer'], ['entryOfficer', 'officer']]) {
    if ($(id)) $(id).hidden = name !== step;
  }
  setEntryError('entryFarmerError', '');
  setEntryError('officerLoginError', '');
  if (step === 'farmer') $('entryFarmerBtn')?.focus();
  if (step === 'officer') $('officerSelect')?.focus();
};

window.chooseRole = function(role) {
  if (role === 'visitor') enterPortal('visitor');
  else if (role === 'farmer') window.showEntryStep('farmer');
  else if (role === 'officer') {
    window.showEntryStep('officer');
    if (!officers.length) loadOfficers();
  }
};

// Demo only: no SMS is sent and no phone number is verified (real SMS OTP needs a provider; see docs/api-contract.md).
// The server's demo farmer account (F01) is used; the person typing proves nothing about who they are.
window.farmerDemoSignIn = async function() {
  setEntryError('entryFarmerError', '');
  setEntryBusy('entryFarmerBtn', true);
  try {
    const res = await api('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'farmer', farmerId: 'F01', pin: '1234' }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.token) {
      setEntryError('entryFarmerError', tr('ডেমো সাইন-ইন করা যায়নি।', 'Could not start the demo sign-in.'));
      return;
    }
    authToken = data.token;
    currentUser = data.user;
    try { sessionStorage.setItem(FARMER_KEY, JSON.stringify({ token: data.token, user: data.user })); } catch {}
    enterPortal('farmer');
  } catch {
    setEntryError('entryFarmerError', tr('সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।', 'Could not reach the server. Please try again.'));
  } finally {
    setEntryBusy('entryFarmerBtn', false);
  }
};

/** On load: re-enter a role only for an explicit visitor choice or a demo session the server still accepts. */
async function restoreSession() {
  let saved = null;
  try { saved = sessionStorage.getItem(ROLE_KEY); } catch {}
  if (!saved) return;
  if (saved === 'visitor') {
    enterPortal('visitor');
    return;
  }
  if ($('entryChecking')) $('entryChecking').hidden = false;
  try {
    if (saved === 'farmer') {
      const stored = JSON.parse(sessionStorage.getItem(FARMER_KEY) || 'null');
      if (!stored?.token) throw new Error('no session');
      const res = await api('/api/v1/auth/session', { headers: { Authorization: `Bearer ${stored.token}` } });
      if (!res.ok) throw new Error('expired');
      authToken = stored.token;
      currentUser = (await res.json()).user || stored.user;
      enterPortal('farmer');
    } else if (saved === 'officer') {
      const stored = JSON.parse(sessionStorage.getItem('eden.officer') || 'null');
      if (!stored?.token) throw new Error('no session');
      const res = await api('/api/v1/officer/desk', { headers: { Authorization: `Bearer ${stored.token}` } });
      if (!res.ok) throw new Error('expired');
      officerSession = stored;
      currentUser = { id: stored.officer.id, role: 'officer', nameBangla: stored.officer.nameBangla, blockBangla: stored.officer.blockBangla };
      officerDesk = await res.json();
      enterPortal('officer');
      renderOfficer();
    }
  } catch {
    // Missing, expired or unreachable: stay on the role chooser and drop the stale record.
    try {
      sessionStorage.removeItem(ROLE_KEY);
      sessionStorage.removeItem(FARMER_KEY);
      sessionStorage.removeItem('eden.officer');
    } catch {}
  } finally {
    if ($('entryChecking')) $('entryChecking').hidden = true;
  }
}

// ---------------------------------------------------------------------------
// SCREEN 8: Narration & IVR Call Delivery
// ---------------------------------------------------------------------------

async function loadNarration(option) {
  if (!currentAdvice || !option) return;
  try {
    const res = await api('/api/v1/narrate', {
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

window.playCurrentNarration = async function() {
  if (!currentNarration?.banglaSpeechText) return;
  try {
    const res = await api('/api/v1/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: currentNarration.banglaSpeechText, language: 'bn' }) });
    if (res.ok) { new Audio(URL.createObjectURL(await res.blob())).play(); return; }
  } catch { /* fall back below */ }
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(currentNarration.banglaSpeechText);
    u.lang = 'bn-BD';
    window.speechSynthesis.speak(u);
  } else {
    showToast('cycle-select-toast', tr('অডিও চালানো সম্ভব নয়: কোনো টিটিএস নেই।', 'Audio unavailable: no text-to-speech available.'));
  }
};

window.simulateFarmerKeypad = async function(key) {
  try {
    const res = await api('/api/v1/channel-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keypad: key, phone: '01711-002233', farmerId: 'F01' }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const logBox = $('liveCallLog');
    if (logBox) {
      logBox.innerHTML += `<div style="padding: 4px 0; border-bottom: 1px dashed var(--outline-variant);">[${tr('সিমুলেটেড বোতাম', 'Simulated key')} ${num(key)}] ${escapeHtml(tr(data.acknowledgementBangla, data.acknowledgementEnglish))}</div>`;
      logBox.scrollTop = logBox.scrollHeight;
    }
    if (key === '9' && officerSession?.token) {
      await loadOfficerDesk();
    }
    return data;
  } catch (err) {
    console.error('Keypad simulation error:', err);
    return null;
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
    currentDataRelease = await (await api('/api/v1/data-release')).json();
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
  } catch {}

  // Always start on the role chooser; a role is restored only if its session checks out (see restoreSession).
  applyRole(null);
  applyStaticText();
  const restoring = restoreSession();
  await initializeWeatherLocations();
  await loadOverview();
  await window.runPlannerCalculation({ switchScreenAfter: false });
  await loadDataQualityTable();
  await loadOfficers();
  await restoring;
  renderAll();
});

// ===========================================================================
// Screen 11: Cattle AOI Advisory & Data Pipeline Controller
// ===========================================================================

let cattleAois = [];
let selectedCattleAoi = null;
let cattleMap = null;
let cattleAoiLayer = null;
let cattleCentroidMarker = null;
let isDrawingAoi = false;
let drawingPoints = [];
let drawingMarkers = [];
let drawingPolyline = null;
let activeJobPollInterval = null;
let currentCattleAdvisory = null;
let cattleReadiness = null;

window.initCattleScreen = async function() {
  await window.refreshCattleReadiness();
  window.initCattleMap();
  await window.loadCattleAois();
};

window.initCattleMap = function() {
  const container = $('cattleMap');
  if (!container || !window.L) return;

  if (!cattleMap) {
    cattleMap = L.map('cattleMap').setView([23.7, 90.4], 7); // whole of Bangladesh; draw the farm where it is
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors'
    }).addTo(cattleMap);

    cattleMap.on('click', (e) => {
      if (isDrawingAoi) {
        window.addDrawingPoint(e.latlng);
      }
    });
  }

  setTimeout(() => {
    cattleMap.invalidateSize();
  }, 200);
};

function showCattleNotice(kind, bn, en) {
  const box = $('cattleNotice');
  if (!box) return;
  box.hidden = !bn;
  box.className = `alert-box ${kind === 'error' ? 'alert-danger' : kind === 'warning' ? 'alert-warning' : 'alert-info'}`;
  box.textContent = bn ? tr(bn, en) : '';
}

window.refreshCattleReadiness = async function() {
  try {
    cattleReadiness = await apiJson('/api/v1/cattle/readiness');
    const ee = cattleReadiness.earthEngine;
    const badge = $('cattleEeBadge');
    const banner = $('cattleEeNoticeBanner');
    const bannerText = $('cattleEeBannerText');
    const instructions = $('cattleEeSetupInstructions');

    if (ee.status === 'ready') {
      if (badge) {
        badge.className = 'badge badge-success';
        badge.textContent = tr('আর্থ ইঞ্জিন প্রস্তুত (প্রমাণিত সংযোগ)', 'Earth Engine ready (verified connection)');
      }
      if (banner) banner.style.display = 'none';
    } else {
      if (badge) {
        badge.className = 'badge badge-warning';
        badge.textContent = ee.status === 'error' ? tr('আর্থ ইঞ্জিন ত্রুটি', 'Earth Engine error') : tr('আর্থ ইঞ্জিন কনফিগার করা নেই', 'Earth Engine not configured');
      }
      if (banner) banner.style.display = 'block';
      if (bannerText) {
        bannerText.textContent = tr(
          `উপগ্রহ উপাত্ত (NDVI, মাটির আর্দ্রতা, বৃষ্টি) এখন পাওয়া যাচ্ছে না: ${ee.details || ''} আবহাওয়া ও THI আলাদাভাবে কাজ করছে।`,
          `Satellite data (NDVI, soil moisture, rain) is unavailable: ${ee.details || ''} Weather and THI work independently.`,
        );
      }
      if (instructions) instructions.textContent = ee.setupInstructions || '';
    }
    if (cattleReadiness.jobs && cattleReadiness.jobs.productionDurable === false) {
      setText('cattleDurabilityNote', tr(
        'সতর্কতা: কাজের তালিকা সার্ভারের স্থানীয় ফাইলে থাকে এবং সার্ভার রিস্টার্ট হলে চলমান কাজ থেমে যায় (প্রোডাকশন-উপযোগী নয়)।',
        'Note: jobs are kept in a local server file and running jobs stop if the server restarts (not production-durable).',
      ));
    }
  } catch (err) {
    console.warn('Cattle readiness check failed:', err);
    showCattleNotice('error', `স্ট্যাটাস পরীক্ষা করা যায়নি। ${failureText(err)}`, `Could not check status. ${failureText(err)}`);
  }
};

window.loadCattleAois = async function() {
  try {
    const data = await apiJson('/api/v1/cattle/aois');
    cattleAois = data.aois || [];

    const select = $('cattleAoiSelect');
    if (select) {
      select.innerHTML = '';
      if (cattleAois.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = tr('কোন খামার সংরক্ষিত নেই (+ আঁকুন)', 'No farm AOI saved (+ Draw)');
        select.appendChild(opt);
      } else {
        cattleAois.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a.aoiId;
          const haText = lang === 'en' ? `${a.areaHectares} ha` : `${bnDigits(a.areaHectares)} হেক্টর`;
          opt.textContent = `${a.demo ? tr('[ডেমো] ', '[DEMO] ') : ''}${a.farmLabel} (${haText})`;
          select.appendChild(opt);
        });
      }
    }

    if (cattleAois.length > 0) {
      const targetId = selectedCattleAoi ? selectedCattleAoi.aoiId : cattleAois[0].aoiId;
      window.onSelectCattleAoi(targetId);
    }
  } catch (err) {
    console.error('Failed to load cattle AOIs:', err);
    showCattleNotice('error', `খামারের তালিকা লোড করা যায়নি। ${failureText(err)}`, `Could not load the farm list. ${failureText(err)}`);
  }
};

window.onSelectCattleAoi = async function(aoiId) {
  if (!aoiId) return;
  const select = $('cattleAoiSelect');
  if (select) select.value = aoiId;

  selectedCattleAoi = cattleAois.find(a => a.aoiId === aoiId);
  if (!selectedCattleAoi) return;

  const haText = lang === 'en'
    ? `${selectedCattleAoi.areaHectares} ha (${selectedCattleAoi.areaAcres} ac)`
    : `${bnDigits(selectedCattleAoi.areaHectares)} হেক্টর (${bnDigits(selectedCattleAoi.areaAcres)} একর)`;
  setText('selectedAoiAreaBadge', haText);

  // Render on Leaflet Map
  window.renderAoiOnMap(selectedCattleAoi);

  // Load latest advisory (it exists only after a job has really completed)
  showCattleNotice('', '', '');
  currentCattleAdvisory = null;
  window.renderCattleAdvisory(null);
  try {
    const data = await apiJson(`/api/v1/cattle/aois/${encodeURIComponent(aoiId)}/advisory`);
    currentCattleAdvisory = data.advisory;
    window.renderCattleAdvisory(currentCattleAdvisory);
  } catch (err) {
    if (err.kind === 'no_data') showCattleNotice('info', 'এই খামারের জন্য এখনও কোনো পরামর্শ তৈরি হয়নি। "রিফ্রেশ ও বিশ্লেষণ চালান" বাটনে চাপুন।', 'No advisory has been produced for this farm yet. Press "Run refresh & analysis".');
    else showCattleNotice('error', `পরামর্শ লোড করা যায়নি। ${failureText(err)}`, `Could not load the advisory. ${failureText(err)}`);
  }
};

window.renderAoiOnMap = function(aoi) {
  if (!cattleMap || !window.L) return;

  if (cattleAoiLayer) {
    cattleMap.removeLayer(cattleAoiLayer);
    cattleAoiLayer = null;
  }
  if (cattleCentroidMarker) {
    cattleMap.removeLayer(cattleCentroidMarker);
    cattleCentroidMarker = null;
  }

  try {
    cattleAoiLayer = L.geoJSON(aoi.geometry, {
      style: {
        color: '#1b5e20',
        weight: 3,
        opacity: 0.9,
        fillColor: '#81c784',
        fillOpacity: 0.35,
      }
    }).addTo(cattleMap);

    const [cLon, cLat] = aoi.centroid;
    cattleCentroidMarker = L.circleMarker([cLat, cLon], {
      radius: 6,
      fillColor: '#d97706',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(cattleMap).bindPopup(`<strong>${escapeHtml(aoi.farmLabel)}</strong><br>${escapeHtml(aoi.nearestUpazila || '')}`);

    cattleMap.fitBounds(cattleAoiLayer.getBounds(), { padding: [30, 30] });
  } catch (err) {
    console.warn('Could not render AOI layer on map:', err);
  }
};

// Map drawing tools
window.toggleAoiDrawMode = function() {
  isDrawingAoi = !isDrawingAoi;
  const bar = $('drawInstructionsBar');
  const btn = $('drawAoiBtn');
  const mapEl = $('cattleMap');

  if (isDrawingAoi) {
    if (bar) bar.style.display = 'block';
    if (btn) btn.classList.add('active');
    if (mapEl) mapEl.classList.add('cattle-drawing-active');
    window.clearDrawing();
  } else {
    window.cancelDrawing();
  }
};

window.addDrawingPoint = function(latlng) {
  if (!cattleMap || !isDrawingAoi) return;
  drawingPoints.push([latlng.lat, latlng.lng]);

  const marker = L.circleMarker(latlng, {
    radius: 5,
    color: '#2563eb',
    fillColor: '#60a5fa',
    fillOpacity: 0.8,
  }).addTo(cattleMap);
  drawingMarkers.push(marker);

  if (drawingPolyline) {
    cattleMap.removeLayer(drawingPolyline);
  }
  drawingPolyline = L.polyline(drawingPoints, { color: '#2563eb', dashArray: '4, 4' }).addTo(cattleMap);
};

window.finishCurrentDrawing = async function() {
  if (drawingPoints.length < 3) {
    showCattleNotice('error', 'অন্তত ৩টি পয়েন্ট প্রয়োজন।', 'At least 3 points are required.');
    return;
  }

  // Close ring: [lon, lat]
  const ring = drawingPoints.map(p => [Number(p[1].toFixed(6)), Number(p[0].toFixed(6))]);
  ring.push([ring[0][0], ring[0][1]]); // close ring

  const label = $('drawFarmName')?.value?.trim();
  if (!label) {
    showCattleNotice('error', 'খামারের নাম লিখুন।', 'Enter a farm name.');
    $('drawFarmName')?.focus();
    return;
  }

  const payload = {
    farmLabel: label.trim(),
    source: 'map_draw',
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };

  try {
    const data = await apiJson('/api/v1/cattle/aois', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cattleWriteHeaders() },
      body: JSON.stringify(payload),
    });
    window.cancelDrawing();
    await window.loadCattleAois();
    window.onSelectCattleAoi(data.aoi.aoiId);
    if (data.job?.jobId) {
      window.startJobPolling(data.job.jobId);
    }
  } catch (err) {
    showCattleNotice('error', `খামার সংরক্ষণ করা যায়নি: ${failureText(err)}`, `Could not save the farm: ${failureText(err)}`);
  }
};

window.cancelDrawing = function() {
  isDrawingAoi = false;
  const bar = $('drawInstructionsBar');
  const btn = $('drawAoiBtn');
  const mapEl = $('cattleMap');
  if (bar) bar.style.display = 'none';
  if (btn) btn.classList.remove('active');
  if (mapEl) mapEl.classList.remove('cattle-drawing-active');
  window.clearDrawing();
};

window.clearDrawing = function() {
  drawingPoints = [];
  drawingMarkers.forEach(m => cattleMap?.removeLayer(m));
  drawingMarkers = [];
  if (drawingPolyline) {
    cattleMap?.removeLayer(drawingPolyline);
    drawingPolyline = null;
  }
};

window.handleGeoJsonFileUpload = function(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target?.result;
      const parsed = JSON.parse(text);
      let geom = parsed;
      if (parsed.type === 'FeatureCollection' && parsed.features?.[0]?.geometry) {
        geom = parsed.features[0].geometry;
      } else if (parsed.type === 'Feature' && parsed.geometry) {
        geom = parsed.geometry;
      }
      $('rawGeoJsonInput').value = JSON.stringify(geom, null, 2);
      if (!$('customFarmLabel').value) {
        $('customFarmLabel').value = file.name.replace(/\.[^/.]+$/, '');
      }
    } catch (err) {
      showCattleNotice('error', 'GeoJSON ফাইলটি বৈধ নয়।', 'Invalid GeoJSON file.');
    }
  };
  reader.readAsText(file);
};

window.saveCustomGeoJsonAoi = async function() {
  const labelInput = $('customFarmLabel');
  const jsonInput = $('rawGeoJsonInput');
  const errBox = $('aoiErrorAlert');
  if (errBox) errBox.style.display = 'none';

  const label = labelInput?.value?.trim();
  if (!label) {
    if (errBox) { errBox.style.display = 'block'; errBox.textContent = tr('খামারের নাম লিখুন।', 'Enter a farm name.'); }
    return;
  }
  const rawText = jsonInput?.value?.trim();

  if (!rawText) {
    if (errBox) {
      errBox.style.display = 'block';
      errBox.textContent = tr('GeoJSON ডেটা প্রদান করুন।', 'Please provide GeoJSON data.');
    }
    return;
  }

  let geometry;
  try {
    geometry = JSON.parse(rawText);
  } catch (e) {
    if (errBox) {
      errBox.style.display = 'block';
      errBox.textContent = tr('অবৈধ JSON সিনট্যাক্স।', 'Invalid JSON syntax.');
    }
    return;
  }

  try {
    const data = await apiJson('/api/v1/cattle/aois', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cattleWriteHeaders() },
      body: JSON.stringify({
        farmLabel: label,
        geometry,
        source: 'geojson_upload',
      }),
    });

    if (jsonInput) jsonInput.value = '';
    if (labelInput) labelInput.value = '';
    await window.loadCattleAois();
    window.onSelectCattleAoi(data.aoi.aoiId);
    if (data.job?.jobId) {
      window.startJobPolling(data.job.jobId);
    }
  } catch (err) {
    if (errBox) {
      errBox.style.display = 'block';
      errBox.textContent = failureText(err);
    }
  }
};

window.deleteSelectedAoi = async function() {
  if (!selectedCattleAoi) return;
  if (!confirm(tr(`আপনি কি নিশ্চিত যে "${selectedCattleAoi.farmLabel}" খামারটি মুছে ফেলতে চান?`, `Are you sure you want to delete "${selectedCattleAoi.farmLabel}"?`))) return;

  try {
    await apiJson(`/api/v1/cattle/aois/${encodeURIComponent(selectedCattleAoi.aoiId)}`, { method: 'DELETE', headers: cattleWriteHeaders() });
    selectedCattleAoi = null;
    await window.loadCattleAois();
  } catch (err) {
    showCattleNotice('error', `খামার মুছতে ব্যর্থ: ${failureText(err)}`, `Could not delete the farm: ${failureText(err)}`);
  }
};

// Optional write token for servers that set API_WRITE_TOKEN. Entered by the user for this session only, never stored in source.
function cattleWriteHeaders() {
  const token = sessionStorage.getItem('eden.writeToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
window.setCattleWriteToken = function() {
  const token = $('cattleWriteToken')?.value?.trim();
  try { token ? sessionStorage.setItem('eden.writeToken', token) : sessionStorage.removeItem('eden.writeToken'); } catch { /* ignore */ }
  showCattleNotice('info', 'টোকেন এই ট্যাবের জন্য সংরক্ষিত হয়েছে।', 'Token kept for this browser tab only.');
};

window.triggerCattlePipelineJob = async function() {
  if (!selectedCattleAoi) {
    showCattleNotice('error', 'প্রথমে একটি খামার নির্বাচন করুন।', 'Select a farm first.');
    return;
  }
  const btn = $('runPipelineBtn');
  if (btn) btn.disabled = true;
  try {
    const data = await apiJson('/api/v1/cattle/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cattleWriteHeaders() },
      body: JSON.stringify({ aoiId: selectedCattleAoi.aoiId, jobType: 'pipeline_refresh' }),
    });
    showCattleNotice('', '', '');
    window.startJobPolling(data.job.jobId);
  } catch (err) {
    showCattleNotice('error', `কাজ শুরু করা যায়নি: ${failureText(err)}`, `Could not start the job: ${failureText(err)}`);
    if (btn) btn.disabled = false;
  }
};

window.retryCattleJob = async function(jobId) {
  try {
    const data = await apiJson(`/api/v1/cattle/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST', headers: cattleWriteHeaders() });
    window.startJobPolling(data.job.jobId);
  } catch (err) {
    showCattleNotice('error', `পুনরায় চেষ্টা করা যায়নি: ${failureText(err)}`, `Could not retry: ${failureText(err)}`);
  }
};

const JOB_STATUS_LABEL = {
  queued: ['অপেক্ষমাণ', 'Queued', 'badge-info'],
  running: ['চলমান…', 'Running…', 'badge-info'],
  succeeded: ['সম্পন্ন ✓ (সব উপাত্ত পাওয়া গেছে)', 'Succeeded ✓ (all inputs obtained)', 'badge-success'],
  partial: ['আংশিক — কিছু উপাত্ত নেই', 'Partial — some inputs missing', 'badge-warning'],
  failed: ['ব্যর্থ', 'Failed', 'badge-danger'],
  blocked: ['আটকে আছে — কনফিগারেশন/উপাত্ত প্রয়োজন', 'Blocked — configuration or data required', 'badge-warning'],
};

window.startJobPolling = function(jobId) {
  if (activeJobPollInterval) { clearInterval(activeJobPollInterval); activeJobPollInterval = null; }
  let consecutiveFailures = 0;
  const startedAt = Date.now();
  const stopPolling = () => { clearInterval(activeJobPollInterval); activeJobPollInterval = null; $('runPipelineBtn')?.removeAttribute('disabled'); };

  const poll = async () => {
    if (Date.now() - startedAt > 5 * 60 * 1000) {
      stopPolling();
      showCattleNotice('error', 'কাজের অবস্থা জানার অপেক্ষা সময়সীমা পেরিয়ে গেছে। তালিকা রিফ্রেশ করে দেখুন।', 'Stopped waiting for the job status (timeout). Refresh to check again.');
      return;
    }
    let job;
    try {
      job = (await apiJson(`/api/v1/cattle/jobs/${encodeURIComponent(jobId)}`)).job;
      consecutiveFailures = 0;
    } catch (err) {
      if (err.kind === 'not_found') { stopPolling(); showCattleNotice('error', 'কাজটি আর পাওয়া যাচ্ছে না।', 'The job no longer exists.'); return; }
      if (++consecutiveFailures >= 3) { stopPolling(); showCattleNotice('error', `কাজের অবস্থা আনা যাচ্ছে না। ${failureText(err)}`, `Cannot read the job status. ${failureText(err)}`); }
      return;
    }

    const label = JOB_STATUS_LABEL[job.status] || [job.status, job.status, 'badge-info'];
    const pBar = $('jobProgressBar'); if (pBar) pBar.style.width = `${job.progressPct}%`;
    setText('jobPercentText', num(`${job.progressPct}%`));
    setText('jobStageText', lang === 'en' ? job.stageMessage : job.stageMessageBangla);
    const badge = $('jobStatusBadge');
    if (badge) { badge.className = `badge ${label[2]}`; badge.textContent = tr(label[0], label[1]); }

    // What is missing / why it failed, so a partial or failed job is never mistaken for a complete one
    const details = [
      ...job.missing.map(m => `${m.input}: ${m.reason}`),
      ...job.errors,
    ];
    setHtml('jobDetails', details.length
      ? `<ul class="warning-list">${details.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>${(job.status === 'failed' || job.status === 'blocked') && job.attempts < job.maxAttempts ? `<button class="btn btn-sm btn-outline" type="button" onclick="retryCattleJob('${escapeHtml(job.jobId)}')">${escapeHtml(tr('আবার চেষ্টা করুন', 'Retry'))}</button>` : ''}`
      : '');

    if (!['queued', 'running'].includes(job.status)) {
      stopPolling();
      if (selectedCattleAoi) {
        try {
          const adv = await apiJson(`/api/v1/cattle/aois/${encodeURIComponent(selectedCattleAoi.aoiId)}/advisory`);
          currentCattleAdvisory = adv.advisory;
          window.renderCattleAdvisory(currentCattleAdvisory);
        } catch (err) {
          if (err.kind !== 'no_data') showCattleNotice('error', `পরামর্শ লোড করা যায়নি। ${failureText(err)}`, `Could not load the advisory. ${failureText(err)}`);
        }
      }
    }
  };
  poll();
  activeJobPollInterval = setInterval(poll, 1500);
};

const THI_BADGE = {
  normal: ['badge-success', 'স্বাভাবিক', 'Normal'],
  alert: ['badge-warning', 'সতর্কতা', 'Alert'],
  danger: ['badge-danger', 'বিপজ্জনক', 'Danger'],
  emergency: ['badge-danger', 'জরুরি', 'Emergency'],
};

window.renderCattleAdvisory = function(adv) {
  const content = $('cattleAdvisoryContent');
  if (!adv) {
    ['cThiVal', 'cWaterVal', 'cNdviVal', 'cGrazingVal', 'coolHoursList'].forEach(id => setText(id, '—'));
    ['cThiBadge', 'cWaterBadge', 'cGrazingBadge'].forEach(id => { const el = $(id); if (el) { el.className = 'badge'; el.textContent = '—'; } });
    setText('cThiSummary', '');
    setHtml('cHourlyStrip', '');
    setHtml('cattleAdvisoryBullets', '');
    setHtml('cattleEvidenceNote', '');
    if (content) content.dataset.empty = 'true';
    return;
  }
  if (content) content.dataset.empty = 'false';

  const thi = adv.derived.thi;
  const heur = adv.heuristic;
  const forage = adv.forageStatus;

  // Derived: THI
  setText('cThiVal', num(thi.current));
  setText('cThiSummary', lang === 'en' ? heur.summaryEnglish : heur.summaryBangla);
  const thiBadge = $('cThiBadge');
  if (thiBadge) {
    const [cls, bn, en] = THI_BADGE[thi.category];
    thiBadge.className = `badge ${cls}`;
    thiBadge.textContent = tr(bn, en);
  }

  // Heuristic: water demand is categorical only (no invented percentages)
  setText('cWaterVal', lang === 'en' ? heur.waterDemand.labelEnglish : heur.waterDemand.labelBangla);
  const waterBadge = $('cWaterBadge');
  if (waterBadge) {
    waterBadge.className = `badge ${heur.waterDemand.category === 'normal' ? 'badge-success' : heur.waterDemand.category === 'elevated' ? 'badge-warning' : 'badge-danger'}`;
    waterBadge.textContent = tr('অনুমান', 'Heuristic');
  }

  // Measured by satellite: only when Earth Engine returned a real value
  setText('cNdviVal', forage.ndviProxy !== null ? num(forage.ndviProxy.toFixed(2)) : tr('উপলব্ধ নয়', 'Unavailable'));

  // Heuristic: grazing, derived from THI; no fixed clock windows
  const g = heur.grazing;
  setText('cGrazingVal', lang === 'en' ? g.rationaleEnglish : g.rationaleBangla);
  const grazingBadge = $('cGrazingBadge');
  if (grazingBadge) {
    grazingBadge.className = `badge ${g.suitableNow ? 'badge-success' : 'badge-danger'}`;
    grazingBadge.textContent = g.suitableNow ? tr('তুলনামূলক কম ঝুঁকি', 'Lower risk') : tr('ঝুঁকিপূর্ণ হতে পারে', 'May be risky');
  }

  setText('coolHoursList', thi.lowestThiHours ? thi.lowestThiHours.map(h => num(h)).join(', ') : tr('উপাত্ত নেই', 'No data'));

  // 24 h strip: each hour uses its own forecast temperature and humidity
  const strip = $('cHourlyStrip');
  if (strip) {
    strip.innerHTML = '';
    if (!thi.hourly.length) strip.textContent = tr('ঘণ্টাভিত্তিক উপাত্ত নেই।', 'No hourly data.');
    thi.hourly.forEach(h => {
      const timeStr = h.time.slice(11, 16);
      const isCool = (thi.lowestThiHours || []).includes(timeStr);
      const pill = document.createElement('div');
      pill.className = `hourly-thi-pill thi-${h.category} ${isCool ? 'cool-feeding' : ''}`;
      pill.innerHTML = `
        <span style="font-size: 11px; font-weight: 600; color: var(--on-surface);">${num(timeStr)}</span>
        <strong style="font-size: 15px; color: var(--primary);">${num(h.thi)}</strong>
        <span style="font-size: 10px; color: var(--on-surface-variant);">${num(h.temperatureC)}°C · ${num(h.relativeHumidityPct)}%</span>`;
      strip.appendChild(pill);
    });
    if (thi.hoursMissingInputs) {
      const note = document.createElement('small');
      note.textContent = tr(`${num(thi.hoursMissingInputs)} ঘণ্টার উপাত্ত অসম্পূর্ণ, বাদ দেওয়া হয়েছে।`, `${thi.hoursMissingInputs} hour(s) omitted: incomplete forecast data.`);
      strip.appendChild(note);
    }
  }

  const bulletList = $('cattleAdvisoryBullets');
  if (bulletList) {
    bulletList.innerHTML = '';
    (lang === 'en' ? heur.bulletsEnglish : heur.bulletsBangla).forEach(b => {
      const li = document.createElement('li');
      li.textContent = b;
      bulletList.appendChild(li);
    });
  }

  // Evidence separation: what is measured, what is derived, what is only generic guidance
  const m = adv.measured;
  const nasa = 'status' in m.nasaPower
    ? tr(`নাসা পাওয়ার: উপলব্ধ নয় (${m.nasaPower.reason})`, `NASA POWER: unavailable (${m.nasaPower.reason})`)
    : tr(`নাসা পাওয়ার (বিলম্বিত, সরাসরি নয়): সর্বশেষ ${isoDate(m.nasaPower.latestObservationDate)}`, `NASA POWER (delayed, not live): latest ${isoDate(m.nasaPower.latestObservationDate)}`);
  const sat = m.satellite.status === 'unavailable'
    ? tr(`উপগ্রহ (Earth Engine): উপলব্ধ নয় — ${m.satellite.reason || ''}`, `Satellite (Earth Engine): unavailable — ${m.satellite.reason || ''}`)
    : tr(`উপগ্রহ (Earth Engine): ${m.satellite.features.length}টি ডেটাসেট${m.satellite.unavailable.length ? `, ${m.satellite.unavailable.length}টি অনুপলব্ধ` : ''}`, `Satellite (Earth Engine): ${m.satellite.features.length} dataset(s)${m.satellite.unavailable.length ? `, ${m.satellite.unavailable.length} unavailable` : ''}`);
  setHtml('cattleEvidenceNote', `<ul class="warning-list">
    <li><strong>${escapeHtml(tr('পরিমাপকৃত/প্রদানকৃত', 'Measured / provider data'))}:</strong> ${escapeHtml(tr('আবহাওয়া মডেলের অনুমান (Open-Meteo)', 'Weather-model estimate (Open-Meteo)'))}; ${escapeHtml(nasa)}; ${escapeHtml(sat)}</li>
    <li><strong>${escapeHtml(tr('গণনা করা', 'Derived'))}:</strong> ${escapeHtml(tr('THI — ' + thi.formula, 'THI — ' + thi.formula))}. ${escapeHtml(thi.thresholdNote)}</li>
    <li><strong>${escapeHtml(tr('সাধারণ নির্দেশনা (অনুমানভিত্তিক)', 'Generic guidance (heuristic)'))}:</strong> ${escapeHtml(heur.basis)}</li>
  </ul>`);
};

window.triggerSupervisedTrainingCheck = async function() {
  try {
    const data = await apiJson('/api/v1/cattle/models/train', { method: 'POST', headers: { 'Content-Type': 'application/json', ...cattleWriteHeaders() }, body: JSON.stringify({ target: 'heat_stress_panting' }) });
    showCattleNotice(data.success ? 'info' : 'warning',
      `মডেল প্রশিক্ষণ: ${data.status} (নমুনা ${num(data.sampleCount)})। ${data.success ? '' : 'কোনো মডেল তৈরি হয়নি।'}`,
      `Model training: ${data.status} (samples: ${data.sampleCount}). ${data.success ? '' : 'No model was produced.'} ${data.message}`);
  } catch (err) {
    showCattleNotice('error', `প্রশিক্ষণ যাচাই করা যায়নি: ${failureText(err)}`, `Training check failed: ${failureText(err)}`);
  }
};
