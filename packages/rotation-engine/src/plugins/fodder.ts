import type { IEvidenceDimensionPlugin, EvaluationContext, DimensionScoreResult } from '@project-eden/contracts';
import { rabiOf } from '../data/lookup.ts';
import { TANORE_CONDITIONS } from '../data/tanore_replay_data.ts';
import { bnDigits } from '../bn.ts';

const FODDER_SCORE = { high: 0.88, medium: 0.82, low: 0.65 };

export class FodderDimensionPlugin implements IEvidenceDimensionPlugin {
  readonly id = 'fodder';
  readonly displayNameBangla = 'গবাদিপশুর খাদ্য ও খড় প্রাপ্যতা';
  readonly displayNameEnglish = 'Livestock Fodder & Crop Residue';
  readonly version = '2.0.0';
  readonly isEnabled = true;

  evaluate(context: EvaluationContext): DimensionScoreResult {
    const { catalog: rabiName } = rabiOf(context);
    const cattle = Math.round(TANORE_CONDITIONS.cattlePerKm2);

    return {
      dimensionId: this.id,
      score: FODDER_SCORE[rabiName.fodderValue],
      confidence: 'medium',
      summaryBangla: `${rabiName.fodderNoteBangla} রাজশাহীতে প্রতি বর্গকিমিতে প্রায় ${bnDigits(cattle)}টি গরু (FAO GLW4)।`,
      summaryEnglish: `Residue class "${rabiName.fodderValue}" for ${rabiName.crop}; Rajshahi has about ${cattle} cattle per km2 (FAO GLW4, 2015).`,
      metrics: {
        residueClass: rabiName.fodderValue,
        districtCattlePerKm2: TANORE_CONDITIONS.cattlePerKm2,
      },
      provenance: {
        source: 'FAO Gridded Livestock of the World v4, cattle 2015 (Gilbert et al. 2018); residue classes are team estimates',
        timePeriod: '2015',
        spatialResolution: 'District (Rajshahi)',
        measuredOrModeled: 'assumed',
        notesBangla: 'গরুর ঘনত্ব মাপা তথ্য; খড়ের শ্রেণি দলের অনুমান।',
      },
    };
  }

  explain(result: DimensionScoreResult) {
    return {
      banglaBullets: [`রাজশাহীতে প্রতি বর্গকিমিতে প্রায় ${bnDigits(Math.round(result.metrics.districtCattlePerKm2 as number))}টি গরু।`],
      englishBullets: [`About ${Math.round(result.metrics.districtCattlePerKm2 as number)} cattle per km2 in Rajshahi.`],
    };
  }
}
