import type { IEvidenceDimensionPlugin, EvaluationContext, DimensionScoreResult } from '@project-eden/contracts';
import { rabiOf, clampScore } from '../data/lookup.ts';
import { ILLUSTRATIVE_AMAN_GROSS_MARGIN_TK_PER_HA } from '../data/crop_catalog.ts';
import { bnNumber } from '../bn.ts';

export class IncomeDimensionPlugin implements IEvidenceDimensionPlugin {
  readonly id = 'income';
  readonly displayNameBangla = 'নিট লাভ (নমুনা হিসাব)';
  readonly displayNameEnglish = 'Net Farm Income (illustrative)';
  readonly version = '2.0.0';
  readonly isEnabled = true;

  evaluate(context: EvaluationContext): DimensionScoreResult {
    const { record: rabi, catalog: rabiName } = rabiOf(context);

    // Team placeholders until DAM farm-gate prices and farmer cost interviews are in (see crop_catalog.ts).
    const total = ILLUSTRATIVE_AMAN_GROSS_MARGIN_TK_PER_HA + rabiName.illustrativeGrossMarginTkPerHa;
    const incomeScore = clampScore((total - 40000) / 80000, 0.35, 0.96);

    return {
      dimensionId: this.id,
      score: incomeScore,
      confidence: 'low',
      staleOrMissing: true,
      summaryBangla: `নমুনা হিসাব: দুই মৌসুমে প্রায় ${bnNumber(total)} টাকা/হেক্টর নিট লাভ ধরা হয়েছে (দলের অনুমান; বাজারদর ও খরচ যাচাই বাকি)।`,
      summaryEnglish: `Illustrative: about ${total.toLocaleString('en-US')} BDT/ha over two seasons (team estimate; prices and costs not yet verified).`,
      metrics: {
        illustrativeTotalBdtPerHa: total,
        illustrativeRabiBdtPerHa: rabiName.illustrativeGrossMarginTkPerHa,
        districtYieldTPerHa: rabi.districtYieldTPerHa ?? 'n/a',
      },
      provenance: {
        source: 'Team placeholder estimate. Pending: DAM farm-gate prices and farmer cost interviews. District yield for context: BBS Rajshahi 2024-25',
        timePeriod: 'demo placeholder',
        spatialResolution: 'Tanore',
        measuredOrModeled: 'assumed',
        notesBangla: 'এই সংখ্যা যাচাই করা বাজারদর নয়; কৃষক সাক্ষাৎকার ও DAM দর পাওয়ার পর বদলাবে।',
      },
    };
  }

  explain(result: DimensionScoreResult) {
    return {
      banglaBullets: [`নমুনা হিসাব: প্রায় ${bnNumber(result.metrics.illustrativeTotalBdtPerHa as number)} টাকা/হেক্টর (যাচাই বাকি)।`],
      englishBullets: [`Illustrative ${result.metrics.illustrativeTotalBdtPerHa} BDT/ha, not yet verified.`],
    };
  }
}
