import type { IEvidenceDimensionPlugin, EvaluationContext, DimensionScoreResult } from '@project-eden/contracts';
import { amanOf, rabiOf, clampScore } from '../data/lookup.ts';
import { bnDigits, bnNumber } from '../bn.ts';

export class WaterDimensionPlugin implements IEvidenceDimensionPlugin {
  readonly id = 'water';
  readonly displayNameBangla = 'পানির নিরাপত্তা ও সেচ সাশ্রয়';
  readonly displayNameEnglish = 'Water Security & Irrigation Demand';
  readonly version = '2.0.0';
  readonly isEnabled = true;

  evaluate(context: EvaluationContext): DimensionScoreResult {
    const { record: aman, catalog: amanName } = amanOf(context);
    const { record: rabi, catalog: rabiName } = rabiOf(context);

    const rescueShare = aman.rescueSeasons / aman.totalSeasons;
    const waterScore = clampScore(1.0 - rescueShare * 0.35 - (rabi.netIrrigationMm / 1000) * 0.55, 0.1, 0.98);
    const pumpedM3PerHa = rabi.pumpedM3PerHa;

    return {
      dimensionId: this.id,
      score: waterScore,
      confidence: 'medium',
      summaryBangla: `${amanName.varietyBangla}: ${bnDigits(aman.totalSeasons)} মৌসুমের ${bnDigits(aman.rescueSeasons)}টিতে ফুল আসার সময় সম্পূরক সেচ লেগেছে। রবিতে ${rabiName.cropInBangla} সেচ লাগে প্রায় ${bnDigits(rabi.netIrrigationMm)} মিমি (হেক্টরে ${bnNumber(pumpedM3PerHa)} ঘনমিটার ভূগর্ভস্থ পানি)।`,
      summaryEnglish: `${aman.variety} needed rescue irrigation at flowering in ${aman.rescueSeasons} of ${aman.totalSeasons} seasons. ${rabiName.crop} needs about ${rabi.netIrrigationMm} mm of irrigation (${pumpedM3PerHa.toLocaleString('en-US')} m3/ha of groundwater).`,
      metrics: {
        amanRescueIrrigationSeasons: aman.rescueSeasons,
        totalSeasonsSimulated: aman.totalSeasons,
        rescueYears: aman.rescueYears.join(', '),
        amanCropWaterUseMm: aman.cropWaterUseMm,
        rabiNetIrrigationMm: rabi.netIrrigationMm,
        rabiNetIrrigationRange: `${rabi.netIrrigationRangeMm[0]}-${rabi.netIrrigationRangeMm[1]} mm (p10-p90)`,
        groundwaterPumpedM3PerHa: pumpedM3PerHa,
      },
      provenance: {
        source: 'NASA POWER (FAO-56 Penman-Monteith ET0) + GPM IMERG Final daily rain; 25-season paddy water balance (research/explore/connect_check.py)',
        timePeriod: '2001-2025',
        spatialResolution: 'Tanore pilot point: IMERG 0.1° (~10 km), POWER 0.5° x 0.625°',
        measuredOrModeled: 'modeled',
        notesBangla: 'বৃষ্টি, বাষ্পীভবন ও ২ মিমি/দিন চুয়ানো ধরে ধানক্ষেতের পানির হিসাব; ফুল আসার আগে-পরে ৫ দিন বা বেশি পানি না থাকলে সম্পূরক সেচ ধরা হয়েছে।',
      },
    };
  }

  explain(result: DimensionScoreResult) {
    const m = result.metrics;
    return {
      banglaBullets: [
        `${bnDigits(m.totalSeasonsSimulated as number)} মৌসুমের ${bnDigits(m.amanRescueIrrigationSeasons as number)}টিতে ফুল আসার সময় সম্পূরক সেচ লেগেছে (বছর: ${bnDigits(m.rescueYears as string)})।`,
        `রবি মৌসুমে সেচ লাগে প্রায় ${bnDigits(m.rabiNetIrrigationMm as number)} মিমি।`,
      ],
      englishBullets: [
        `Rescue irrigation at flowering in ${m.amanRescueIrrigationSeasons} of ${m.totalSeasonsSimulated} seasons (${m.rescueYears}).`,
        `Rabi net irrigation about ${m.rabiNetIrrigationMm} mm, ${m.rabiNetIrrigationRange}.`,
      ],
    };
  }
}
