import type { IEvidenceDimensionPlugin, EvaluationContext, DimensionScoreResult } from '@project-eden/contracts';
import { rabiOf } from '../data/lookup.ts';
import { TALANDA_SRDI } from '../data/tanore_replay_data.ts';
import { bnDigits, bnDecimal } from '../bn.ts';

export class SoilDimensionPlugin implements IEvidenceDimensionPlugin {
  readonly id = 'soil';
  readonly displayNameBangla = 'মাটি স্বাস্থ্য ও পুষ্টি ভারসাম্য';
  readonly displayNameEnglish = 'Soil Health & Fertilizer Load';
  readonly version = '2.0.0';
  readonly isEnabled = true;

  evaluate(context: EvaluationContext): DimensionScoreResult {
    const { record: rabi, catalog: rabiName } = rabiOf(context);
    const dose = rabi.fertilizer;
    const rotationUrea = Math.round(TALANDA_SRDI.aman.ureaKgHa + dose.ureaKgHa);

    // Legumes add nitrogen and cut urea; two rice crops in a year work the soil hardest.
    const soilScore = rabiName.isLegume ? 0.9 : rabiName.isRice ? 0.45 : 0.7;
    const why = rabiName.isLegume
      ? 'ডাল ফসল বাতাসের নাইট্রোজেন মাটিতে যোগ করে, তাই ইউরিয়া কম লাগে।'
      : rabiName.isRice
        ? 'বছরে দুবার ধানে মাটির ওপর চাপ ও সারের খরচ সবচেয়ে বেশি।'
        : 'মাটির পুষ্টি ভারসাম্য মোটামুটি বজায় থাকে।';

    return {
      dimensionId: this.id,
      score: soilScore,
      confidence: 'medium',
      summaryBangla: `${why} SRDI তালন্দ কার্ডে (${TALANDA_SRDI.soilTypeBangla}) ${rabiName.cropInBangla} ইউরিয়া ${bnDecimal(dose.ureaKgHa)} কেজি/হেক্টর; আমনসহ পুরো চক্রে ${bnDigits(rotationUrea)} কেজি।`,
      summaryEnglish: `SRDI Talanda card (Kharia soil): ${rabiName.crop} urea ${dose.ureaKgHa} kg/ha; ${rotationUrea} kg/ha for the whole rotation with Aman.`,
      metrics: {
        srdiSoilType: TALANDA_SRDI.soilTypeBangla,
        rabiUreaKgHa: dose.ureaKgHa,
        rabiTspKgHa: dose.tspKgHa,
        rabiMopKgHa: dose.mopKgHa,
        rotationUreaKgHa: rotationUrea,
        legume: rabiName.isLegume,
      },
      provenance: {
        source: TALANDA_SRDI.source + ' — Talanda, medium-high land',
        timePeriod: 'current SRDI card',
        spatialResolution: 'Union (Talanda)',
        measuredOrModeled: 'measured',
        notesBangla: 'SRDI-র মাটি পরীক্ষাভিত্তিক ইউনিয়ন সার সুপারিশ; নিজের জমির মাটি পরীক্ষা হলে সেটিই আগে।',
      },
    };
  }

  explain(result: DimensionScoreResult) {
    const m = result.metrics;
    return {
      banglaBullets: [
        m.legume
          ? 'ডাল ফসলের পরে পরের ফসলে ইউরিয়া কম লাগে।'
          : `পুরো চক্রে ইউরিয়া ${bnDigits(m.rotationUreaKgHa as number)} কেজি/হেক্টর (SRDI কার্ড)।`,
      ],
      englishBullets: [`Rotation urea ${m.rotationUreaKgHa} kg/ha on the SRDI card.`],
    };
  }
}
