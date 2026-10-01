import type {
  AdviceJSON,
  CandidateRotation,
  CropPhase,
  DimensionScoreResult,
  EvaluationContext,
  FarmerCard,
  IpmTip,
  LandType,
  MonthTimelineSlot,
  ThisSeasonFit,
} from '@project-eden/contracts';
import { FeatureRegistry } from './registry.ts';
import { RELEASE, TALANDA_SRDI, TANORE_AMAN_REPLAY, TANORE_CONDITIONS, TANORE_RABI_REPLAY } from './data/tanore_replay_data.ts';
import { AMAN_CATALOG, RABI_CATALOG } from './data/crop_catalog.ts';
import type { AmanRecord, RabiRecord } from './data/release_types.ts';
import type { RabiCatalogEntry } from './data/crop_catalog.ts';
import { IPM_AMAN, IPM_BY_RABI, IPM_GENERAL } from './data/ipm_catalog.ts';
import {
  LAND_TYPE_BANGLA,
  bnDate,
  bnDateOf,
  bnDecimal,
  bnDigits,
  bnMonth,
  bnNumber,
  bnOf,
  bnRange,
  enDate,
  enMonth,
  isoDate,
  seasonDate,
  seasonDay,
} from './bn.ts';

export interface PlanOptionsRequest {
  unionId: string;
  unionNameBangla: string;
  upazila: string;
  district: string;
  landType: LandType;
  season: string;
  currentAmanCrop?: string;
  today?: string; // ISO date for the crop-stage text; defaults to now
  farmerPriorities: {
    water?: number;
    income?: number;
    soil?: number;
    fodder?: number;
    heat?: number;
    flood?: number;
    pest?: number;
  };
}

export const SUPPORTED_UNIONS = ['talanda_tanore'];

export class UnsupportedUnionError extends Error {
  readonly unionId: string;

  constructor(unionId: string) {
    super(`No research data for union "${unionId}" yet; modelled unions: ${SUPPORTED_UNIONS.join(', ')}`);
    this.name = 'UnsupportedUnionError';
    this.unionId = unionId;
  }
}

/** Weight of a score the farmer gave no priority for, so the stated priorities decide the ranking. */
const UNSTATED_PRIORITY_WEIGHT = 0.05;
/** One bigha of 33 decimals, in hectares. */
const BIGHA_HA = 0.1336;
const DAY_MS = 86_400_000;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface CandidateSpec {
  id: string;
  aman: string;
  rabi: string;
  isBaseline: boolean;
  tagBangla: string;
  tagEnglish: string;
}

const CANDIDATES: CandidateSpec[] = [
  { id: 'rot_dhan71_lentil', aman: 'BRRI dhan71', rabi: 'BARI Masur-8', isBaseline: false, tagBangla: 'পানি সাশ্রয়ী, মাটি সমৃদ্ধকারী', tagEnglish: 'water-saving, soil-building' },
  { id: 'rot_dhan71_mustard', aman: 'BRRI dhan71', rabi: 'BARI Sarisha-14', isBaseline: false, tagBangla: 'কম সেচের তেলফসল', tagEnglish: 'low-irrigation oilseed' },
  { id: 'rot_dhan49_boro_conventional', aman: 'BRRI dhan49', rabi: 'BRRI dhan28', isBaseline: true, tagBangla: 'প্রচলিত, উচ্চ সেচ নির্ভর', tagEnglish: 'current practice, irrigation-heavy' },
  { id: 'rot_dhan49_wheat_early', aman: 'BRRI dhan49', rabi: 'BARI Gom 33 (Early)', isBaseline: false, tagBangla: 'ধান৪৯ রেখে সময়মতো গম', tagEnglish: 'keep dhan49, wheat on time' },
  { id: 'rot_dhan75_wheat_late', aman: 'BRRI dhan75', rabi: 'BARI Gom 33 (Late)', isBaseline: false, tagBangla: 'দেরিতে বোনা গম, তাপ ঝুঁকিপূর্ণ', tagEnglish: 'late-sown wheat, heat risk' },
];

function sowWord(rabiName: RabiCatalogEntry): string {
  return rabiName.isRice ? 'রোপণ' : 'বপন';
}

/** Month-by-month field use from July to May, from the replay dates (Bangla and English labels). */
function buildTimeline(aman: AmanRecord, rabi: RabiRecord, rabiName: RabiCatalogEntry): MonthTimelineSlot[] {
  const transplant = seasonDay(aman.transplant);
  const amanHarvest = seasonDay(aman.maturity);
  const seedbed = seasonDay(aman.seedbedWindow[0]);
  const rabiSow = seasonDay(rabi.sowing);
  const rabiHarvest = seasonDay(rabi.harvest);
  const sowEn = rabiName.isRice ? 'transplanting' : 'sowing';
  const months = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];

  return months.map(m => {
    const start = seasonDay(`${String(m + 1).padStart(2, '0')}-01`);
    const end = start + DAYS_IN_MONTH[m] - 1;
    const inMonth = (day: number) => day >= start && day <= end;
    const slot = (status: MonthTimelineSlot['status'], cropName: string, cropNameEnglish: string): MonthTimelineSlot => ({
      monthNameBangla: bnMonth(m),
      monthNameEnglish: enMonth(m),
      status,
      cropName,
      cropNameEnglish,
    });

    if (inMonth(amanHarvest) && inMonth(rabiSow)) return slot('transplanting', `আমন কাটা, ${rabiName.cropBangla} ${sowWord(rabiName)}`, `Aman harvest, ${rabiName.crop.toLowerCase()} ${sowEn}`);
    if (inMonth(rabiSow)) return slot('transplanting', `${rabiName.cropBangla} ${sowWord(rabiName)}`, `${rabiName.crop} ${sowEn}`);
    if (inMonth(amanHarvest)) return slot('harvesting', 'আমন কাটা', 'Aman harvest');
    if (inMonth(transplant)) return slot('transplanting', 'আমন রোপণ', 'Aman transplanting');
    if (inMonth(rabiHarvest)) return slot('harvesting', `${rabiName.cropBangla} কাটা`, `${rabiName.crop} harvest`);
    if (end >= transplant && start <= amanHarvest) return slot('occupied', 'আমন ধান', 'Aman rice');
    if (end >= rabiSow && start <= rabiHarvest) return slot('occupied', rabiName.cropBangla, rabiName.crop);
    if (inMonth(seedbed) && start < transplant) return slot('fallow_available', 'আমনের বীজতলা', 'Aman seedbed');
    return slot('fallow_available', 'জমি খালি', 'Field free');
  });
}

/** Where the recommended Aman crop is today, from the replay dates of this season. */
function amanStageBangla(aman: AmanRecord, today: Date, seasonYear: number): string {
  const at = (monthDay: string) => seasonDate(monthDay, seasonYear).getTime();
  const now = today.getTime();
  const flowering = at(aman.flowering);
  if (now < at(aman.transplant)) return 'বীজতলা ও রোপণের প্রস্তুতি';
  if (now < flowering - 35 * DAY_MS) return 'কুশি গজানোর পর্যায়';
  if (now < flowering - 3 * DAY_MS) return 'থোড় আসার পর্যায়';
  if (now <= flowering + 7 * DAY_MS) return 'ফুল আসার পর্যায়';
  if (now < at(aman.maturity)) return 'দানা পুষ্ট হওয়ার পর্যায়';
  if (now < at(aman.fieldFree)) return 'ধান কাটার সময়';
  return 'আমন কাটা শেষ, রবি ফসলের সময়';
}

/** Which Rabi crops still fit their sowing deadline if a given Aman variety is already in the field. */
export function thisSeasonFit(currentAman: string | undefined): ThisSeasonFit | null {
  const aman = currentAman ? TANORE_AMAN_REPLAY[currentAman] : undefined;
  const name = currentAman ? AMAN_CATALOG[currentAman] : undefined;
  if (!currentAman || !aman || !name) return null;

  const fieldFree = seasonDay(aman.fieldFree);
  const crops = Object.entries(TANORE_RABI_REPLAY)
    .filter(([key, rabi]) => rabi.sowingWindow !== null && key !== 'BARI Gom 33 (Late)')
    .map(([key, rabi]) => ({
      cropBangla: RABI_CATALOG[key].cropBangla,
      cropEnglish: RABI_CATALOG[key].crop,
      sowingDeadlineBangla: bnDate(rabi.sowingWindow![1]),
      sowingDeadlineEnglish: enDate(rabi.sowingWindow![1]),
      fits: fieldFree <= seasonDay(rabi.sowingWindow![1]),
    }));
  const fits = crops.filter(c => c.fits);
  const misses = crops.filter(c => !c.fits);
  const noteBangla = [
    `এ মৌসুমে ${name.varietyBangla} থাকলে জমি খালি হবে ~${bnDate(aman.fieldFree)}।`,
    fits.length ? `সময়মতো বোনা যায়: ${fits.map(c => c.cropBangla).join(', ')}।` : '',
    misses.length ? `সময় পেরিয়ে যায়: ${misses.map(c => `${c.cropBangla} (শেষ সময় ${c.sowingDeadlineBangla})`).join(', ')}।` : '',
  ].filter(Boolean).join(' ');
  const noteEnglish = [
    `With ${currentAman} in the field this season, it is free around ${enDate(aman.fieldFree)}.`,
    fits.length ? `Still on time: ${fits.map(c => c.cropEnglish.toLowerCase()).join(', ')}.` : '',
    misses.length ? `Too late for: ${misses.map(c => `${c.cropEnglish.toLowerCase()} (deadline ${c.sowingDeadlineEnglish})`).join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  return {
    currentAmanVariety: currentAman,
    fieldFreeDateBangla: bnDate(aman.fieldFree),
    fieldFreeDateEnglish: enDate(aman.fieldFree),
    crops,
    noteBangla,
    noteEnglish,
  };
}

function parseSeasonYear(season: string): number {
  const year = Number(/\d{4}/.exec(season)?.[0]);
  return Number.isFinite(year) && year > 2000 ? year : new Date().getUTCFullYear();
}

export class RotationEngine {
  private registry: FeatureRegistry;

  constructor(registry?: FeatureRegistry) {
    this.registry = registry || new FeatureRegistry();
  }

  getRegistry(): FeatureRegistry {
    return this.registry;
  }

  private evaluateRotation(spec: CandidateSpec, request: PlanOptionsRequest, seasonYear: number): CandidateRotation {
    const aman = TANORE_AMAN_REPLAY[spec.aman];
    const rabi = TANORE_RABI_REPLAY[spec.rabi];
    const amanName = AMAN_CATALOG[spec.aman];
    const rabiName = RABI_CATALOG[spec.rabi];
    if (!aman || !rabi || !amanName || !rabiName) {
      throw new Error(`Missing research data for candidate ${spec.id}`);
    }

    const amanDays = Math.round((aman.durationDays[0] + aman.durationDays[1]) / 2);
    const rabiDays = seasonDay(rabi.harvest) - seasonDay(rabi.sowing);
    const crops: EvaluationContext['crops'] = [
      {
        season: 'Aman',
        cropName: 'Aman rice',
        variety: spec.aman,
        sowingDate: isoDate(seasonDate(aman.transplant, seasonYear)),
        harvestDate: isoDate(seasonDate(aman.maturity, seasonYear)),
        durationDays: amanDays,
      },
      {
        season: 'Rabi',
        cropName: rabiName.crop,
        variety: spec.rabi,
        sowingDate: isoDate(seasonDate(rabi.sowing, seasonYear)),
        harvestDate: isoDate(seasonDate(rabi.harvest, seasonYear)),
        durationDays: rabiDays,
      },
    ];

    const activePlugins = this.registry.getActivePlugins();
    const evalContext: EvaluationContext = {
      unionId: request.unionId,
      upazilaId: request.upazila,
      districtId: request.district,
      landType: request.landType,
      seasonYear,
      rotationId: spec.id,
      crops,
      farmerPriorities: request.farmerPriorities as Record<string, number>,
    };

    const scores: Record<string, number> = {};
    const dimensionDetails: Record<string, DimensionScoreResult> = {};
    for (const plugin of activePlugins) {
      const result = plugin.evaluate(evalContext) as DimensionScoreResult;
      scores[plugin.id] = result.score;
      dimensionDetails[plugin.id] = result;
    }

    // Weighted by the farmer's stated priorities; scores they did not mention count a little.
    const priorities = request.farmerPriorities as Record<string, number | undefined>;
    let totalWeight = 0;
    let weightedSum = 0;
    for (const plugin of activePlugins) {
      const weight = priorities[plugin.id] ?? UNSTATED_PRIORITY_WEIGHT;
      totalWeight += weight;
      weightedSum += (scores[plugin.id] || 0) * weight;
    }
    const totalWeightedScore = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(3)) : 0.5;

    const deadline = rabi.sowingWindow?.[1];
    const withinWindow = !deadline || seasonDay(rabi.sowing) <= seasonDay(deadline);

    const cropSequence: CropPhase[] = [
      {
        crop: 'Aman rice',
        cropBangla: 'আমন ধান',
        variety: spec.aman,
        varietyBangla: amanName.varietyBangla,
        seasonType: 'Aman',
        sowingWindow: `seedbed ${enDate(aman.seedbedWindow[0])}-${enDate(aman.seedbedWindow[1])}, transplant ~${enDate(aman.transplant)}`,
        harvestWindow: `~${enDate(aman.maturity)}`,
        durationDays: amanDays,
        daysToFieldFree: seasonDay(aman.fieldFree) - seasonDay(aman.transplant),
      },
      {
        crop: rabiName.crop,
        cropBangla: rabiName.cropBangla,
        variety: spec.rabi,
        varietyBangla: rabiName.varietyBangla,
        seasonType: 'Rabi',
        sowingWindow: rabi.sowingWindow
          ? `${enDate(rabi.sowingWindow[0])}-${enDate(rabi.sowingWindow[1])} (${rabi.sowingWindowSource}); replay sows ${enDate(rabi.sowing)}`
          : `transplant ~${enDate(rabi.sowing)}`,
        harvestWindow: `~${enDate(rabi.harvest)}`,
        durationDays: rabiDays,
        daysToFieldFree: rabiDays,
      },
    ];

    const rabiVarietyEn = spec.rabi.replace(/ \((Early|Late)\)$/, '');
    const windowEn = rabi.sowingWindow ? `${enDate(rabi.sowingWindow[0])}-${enDate(rabi.sowingWindow[1])}` : '';
    const rabiActionEn = rabiName.isRice
      ? `Transplant Boro around ${enDate(rabi.sowing)}; it needs about ${rabi.netIrrigationMm} mm of irrigation.`
      : withinWindow
        ? `Sow ${rabiVarietyEn} around ${enDate(rabi.sowing)} (window ${windowEn}).`
        : `${rabiVarietyEn} is sown around ${enDate(rabi.sowing)}, after the ${windowEn} window: heat risk.`;
    const actionsEnglish = [
      `Seedbed for ${spec.aman} ${enDate(aman.seedbedWindow[0])}-${enDate(aman.seedbedWindow[1])}; transplant around ${enDate(aman.transplant)}.`,
      `Harvest around ${enDate(aman.maturity)}; have the field ready by ${enDate(aman.fieldFree)}.`,
      rabiActionEn,
    ];
    const ipmActions: IpmTip[] = [...(IPM_BY_RABI[spec.rabi] ?? []), ...IPM_AMAN, ...IPM_GENERAL];
    // The research's environment ledger: rice stands flooded from transplanting to two weeks before harvest
    const ledger = {
      groundwaterPumpedM3PerHa: rabi.pumpedM3PerHa,
      floodedRiceDays: aman.fieldDays - 14 + (rabiName.isRice ? rabi.fieldDays - 14 : 0),
      ureaKgHa: Math.round(TALANDA_SRDI.aman.ureaKgHa + rabi.fertilizer.ureaKgHa),
      legume: rabiName.isLegume,
      bareDays: 365 - aman.fieldDays - rabi.fieldDays,
    };

    const rabiAction: [string, string] = rabiName.isRice
      ? ['action_boro_transplant', `বোরোর চারা ~${bnDate(rabi.sowing)} রোপণ; সেচ লাগবে প্রায় ${bnDigits(rabi.netIrrigationMm)} মিমি।`]
      : withinWindow
        ? ['action_sow_rabi', `${rabiName.varietyBangla} বুনুন ~${bnDate(rabi.sowing)} (সময়সীমা ${bnRange(rabi.sowingWindow![0], rabi.sowingWindow![1])})।`]
        : ['action_warn_late_sowing', `${rabiName.varietyBangla} বোনা হয় ~${bnDate(rabi.sowing)}, সময়সীমা (${bnRange(rabi.sowingWindow![0], rabi.sowingWindow![1])}) পেরিয়ে: তাপের ঝুঁকি।`];
    const actions: Array<[string, string]> = [
      ['action_seedbed', `${amanName.varietyBangla}-এর বীজতলা ${bnDateOf(bnRange(aman.seedbedWindow[0], aman.seedbedWindow[1]))} মধ্যে করুন; চারা রোপণ ~${bnDate(aman.transplant)}।`],
      ['action_harvest', `~${bnDate(aman.maturity)} ধান কাটুন, ${bnDateOf(bnDate(aman.fieldFree))} মধ্যে জমি তৈরি করুন।`],
      rabiAction,
    ];

    return {
      id: spec.id,
      nameBangla: `${amanName.varietyBangla} → ${rabiName.varietyBangla} (${spec.tagBangla})`,
      nameEnglish: `${spec.aman} -> ${spec.rabi} (${spec.tagEnglish})`,
      isBaseline: spec.isBaseline,
      cropSequence,
      scores,
      dimensionDetails,
      totalWeightedScore,
      rank: 0,
      timeline: buildTimeline(aman, rabi, rabiName),
      approvedActionIds: actions.map(a => a[0]),
      approvedActionBangla: actions.map(a => a[1]),
      approvedActionEnglish: actionsEnglish,
      fieldFreeDateBangla: bnDate(aman.fieldFree),
      fieldFreeDateEnglish: enDate(aman.fieldFree),
      ipmActions,
      ledger,
    };
  }

  private farmerCard(best: CandidateSpec, alt: CandidateSpec | undefined, stageBangla: string): FarmerCard {
    const aman = TANORE_AMAN_REPLAY[best.aman];
    const rabi = TANORE_RABI_REPLAY[best.rabi];
    const amanName = AMAN_CATALOG[best.aman];
    const rabiName = RABI_CATALOG[best.rabi];
    const boro = TANORE_RABI_REPLAY['BRRI dhan28'];
    const dose = rabi.fertilizer;
    const perBigha = (kgHa: number) => bnDecimal(kgHa * BIGHA_HA);
    const deadlineText = rabi.sowingWindow ? ` (শেষ সময় ${bnDate(rabi.sowingWindow[1])})` : '';
    const savedM3 = boro.pumpedM3PerHa - rabi.pumpedM3PerHa;

    const altRabi = alt ? TANORE_RABI_REPLAY[alt.rabi] : undefined;
    const altName = alt ? RABI_CATALOG[alt.rabi] : undefined;
    const altAman = alt ? AMAN_CATALOG[alt.aman] : undefined;
    const irrigationClass = (mm: number) => (mm < 150 ? 'কম সেচ' : mm < 400 ? 'মাঝারি সেচ' : 'বেশি সেচ');

    return {
      rotationTitleBangla: `আমন ধান → ${rabiName.cropBangla}`,
      rotationSubtitleBangla: `${amanName.varietyBangla} কেটে ${rabiName.varietyBangla}: ${best.tagBangla}`,
      season1: {
        name: 'আমন ধান',
        variety: amanName.varietyBangla,
        windowBangla: `রোপণ: ~${bnDate(aman.transplant)} • কাটা: ~${bnDate(aman.maturity)}`,
        stageBangla,
        irrigationBangla: `${bnDigits(aman.totalSeasons)} মৌসুমের ${bnDigits(aman.rescueSeasons)}টিতে ফুল আসার সময় সম্পূরক সেচ লেগেছে`,
      },
      season2: {
        name: rabiName.cropBangla,
        variety: rabiName.varietyBangla,
        windowBangla: `${sowWord(rabiName)}: ~${bnDate(rabi.sowing)}${deadlineText} • কাটা: ~${bnDate(rabi.harvest)}`,
        notesBangla: `সেচ লাগে প্রায় ${bnDigits(rabi.netIrrigationMm)} মিমি${rabiName.isLegume ? '; ডাল ফসল মাটিতে নাইট্রোজেন যোগ করে' : ''}`,
        fertilizerBangla: `প্রতি বিঘায় (৩৩ শতক) ইউরিয়া ${perBigha(dose.ureaKgHa)}, টিএসপি ${perBigha(dose.tspKgHa)}, এমওপি ${perBigha(dose.mopKgHa)} কেজি (SRDI তালন্দ কার্ড)`,
      },
      alternative: altRabi && altName && altAman
        ? {
            name: `${altName.cropBangla} (${altName.varietyBangla})`,
            categoryBangla: irrigationClass(altRabi.netIrrigationMm),
            sowingBangla: `~${bnDate(altRabi.sowing)}${altRabi.sowingWindow ? ` (শেষ সময় ${bnDate(altRabi.sowingWindow[1])})` : ''}`,
            yieldBangla: altRabi.districtYieldTPerHa ? `জেলার গড় ${bnDecimal(altRabi.districtYieldTPerHa)} টন/হেক্টর (BBS)` : 'তথ্য পাওয়া যায়নি',
            noteBangla: `আমন ${altAman.varietyBangla}; সেচ প্রায় ${bnDigits(altRabi.netIrrigationMm)} মিমি`,
            marketPriceBangla: 'তথ্য পাওয়া যায়নি',
          }
        : { name: 'তথ্য পাওয়া যায়নি', categoryBangla: '', sowingBangla: '', yieldBangla: '', noteBangla: '', marketPriceBangla: 'তথ্য পাওয়া যায়নি' },
      narrativeBangla: rabiName.isRice
        ? `${amanName.varietyBangla} কেটে বোরো করলে সেচ লাগে প্রায় ${bnDigits(rabi.netIrrigationMm)} মিমি।`
        : `${amanName.varietyBangla} ${bnDateOf(bnDate(aman.fieldFree))} মধ্যে জমি খালি করে, তাই ${rabiName.cropBangla} সময়মতো বোনা যায়। বোরোর বদলে ${rabiName.cropBangla} করলে হেক্টরে প্রায় ${bnNumber(savedM3)} ঘনমিটার ভূগর্ভস্থ পানি বাঁচে।`,
      provenanceBangla: `তথ্যসূত্র: নাসা POWER ও GPM IMERG দিয়ে ${bnDigits(aman.totalSeasons)} মৌসুমের পানির হিসাব, SRDI তালন্দ কার্ড, BRRI/BARI সময়সূচি। রিলিজ ${RELEASE.id}।`,
      audioScriptBangla: '',
      audioDurationSeconds: 0,
    };
  }

  generateAdvice(request: PlanOptionsRequest): AdviceJSON {
    if (!SUPPORTED_UNIONS.includes(request.unionId)) {
      throw new UnsupportedUnionError(request.unionId);
    }
    const seasonYear = parseSeasonYear(request.season);
    const today = request.today ? new Date(request.today) : new Date();

    const options = CANDIDATES.map(spec => this.evaluateRotation(spec, request, seasonYear));
    options.sort((a, b) => b.totalWeightedScore - a.totalWeightedScore);
    options.forEach((opt, idx) => {
      opt.rank = idx + 1;
    });

    const bestSpec = CANDIDATES.find(c => c.id === options[0].id)!;
    const altSpec = options[1] ? CANDIDATES.find(c => c.id === options[1].id) : undefined;
    const aman = TANORE_AMAN_REPLAY[bestSpec.aman];
    const rabi = TANORE_RABI_REPLAY[bestSpec.rabi];
    const amanName = AMAN_CATALOG[bestSpec.aman];
    const rabiName = RABI_CATALOG[bestSpec.rabi];
    const boro = TANORE_RABI_REPLAY['BRRI dhan28'];
    const smap = TANORE_CONDITIONS.smap;
    const landBangla = LAND_TYPE_BANGLA[request.landType] ?? '';

    const farmerSummary = [
      `${bnOf(request.unionNameBangla)} ${landBangla} জমির জন্য শীর্ষে: ${options[0].nameBangla}।`,
      `${amanName.varietyBangla} ${bnDateOf(bnDate(aman.fieldFree))} মধ্যে জমি খালি করে; ${bnDigits(aman.totalSeasons)} মৌসুমের ${bnDigits(aman.rescueSeasons)}টিতে ফুল আসার সময় সম্পূরক সেচ লেগেছে।`,
      `রবিতে ${rabiName.cropInBangla} সেচ লাগে প্রায় ${bnDigits(rabi.netIrrigationMm)} মিমি।`,
      rabiName.isLegume ? `${rabiName.cropBangla} মাটিতে নাইট্রোজেন যোগ করে।` : '',
    ].filter(Boolean).join(' ');

    const farmerSummaryEnglish = [
      `Top option for ${request.landType.replace('_', '-')} land in ${request.unionId === 'talanda_tanore' ? 'Talanda union' : request.unionId}: ${options[0].nameEnglish}.`,
      `${bestSpec.aman} frees the field by ${enDate(aman.fieldFree)}; it needed rescue irrigation at flowering in ${aman.rescueSeasons} of ${aman.totalSeasons} seasons.`,
      `${rabiName.crop} needs about ${rabi.netIrrigationMm} mm of irrigation.`,
      rabiName.isLegume ? `${rabiName.crop} adds nitrogen to the soil.` : '',
    ].filter(Boolean).join(' ');

    const saaoNotes = [
      `Talanda (Tanore) replay ${RELEASE.seasons} with NASA POWER ET0 and GPM IMERG Final rain: ${bestSpec.aman} flowers ~${enDate(aman.flowering)} and needed rescue irrigation at flowering in ${aman.rescueSeasons} of ${aman.totalSeasons} seasons; field free ~${enDate(aman.fieldFree)}.`,
      `${rabiName.crop} net irrigation ~${rabi.netIrrigationMm} mm (p10-p90 ${rabi.netIrrigationRangeMm[0]}-${rabi.netIrrigationRangeMm[1]}) against ~${boro.netIrrigationMm} mm for Boro.`,
      smap ? `SMAP L4 root zone around 10 Nov (${smap.nov10Years.join(', ')}): ${smap.nov10TypicalM3M3} m3/m3.` : '',
      `GLDAS-2.2 groundwater at Tanore: ${TANORE_CONDITIONS.groundwater.trendMmPerYear} mm/yr (${TANORE_CONDITIONS.groundwater.changeMm} mm, ${TANORE_CONDITIONS.groundwater.period}).`,
      `Income scores are illustrative team estimates. Release ${RELEASE.id} (research ${RELEASE.researchCommit}).`,
    ].filter(Boolean).join(' ');

    return {
      schema_version: '1.0',
      advice_id: `adv_${Date.now()}_${request.unionId}`,
      created_at: new Date().toISOString(),
      scope: {
        union_id: request.unionId,
        union_name_bangla: request.unionNameBangla,
        upazila: request.upazila,
        district: request.district,
        land_type: request.landType,
        season: request.season,
      },
      data_release: RELEASE.id,
      release: { id: RELEASE.id, generatedOn: RELEASE.generatedOn, researchCommit: RELEASE.researchCommit },
      farmer_priorities: request.farmerPriorities as Record<string, number>,
      active_plugins: this.registry.getActivePlugins().map(p => p.id),
      options,
      stale_or_missing_inputs: [
        { dataset: 'DAM farm-gate prices and farmer cost survey', issue: 'Not collected yet; income uses illustrative team estimates', affectedDimension: 'income' },
        { dataset: 'Farmer interviews in Talanda', issue: 'Priority weights are defaults until interviews', affectedDimension: 'all' },
        { dataset: 'Flood model for Barind land', issue: 'Not modelled; land-type assumption from the SRDI card', affectedDimension: 'flood' },
      ],
      farmer_summary_bangla: farmerSummary,
      farmer_summary_english: farmerSummaryEnglish,
      saao_technical_notes: saaoNotes,
      verification: null,
      this_season: thisSeasonFit(request.currentAmanCrop),
      this_season_option_id: request.currentAmanCrop
        ? options.find(o => o.cropSequence[0].variety === request.currentAmanCrop)?.id ?? null
        : null,
      farmer_card: this.farmerCard(bestSpec, altSpec, amanStageBangla(aman, today, seasonYear)),
    };
  }
}
