import type { IEvidenceDimensionPlugin, EvaluationContext, DimensionScoreResult } from '@project-eden/contracts';

export class FloodDimensionPlugin implements IEvidenceDimensionPlugin {
  readonly id = 'flood';
  readonly displayNameBangla = 'বন্যা ও জলাবদ্ধতা ঝুঁকি';
  readonly displayNameEnglish = 'Flood & Waterlogging Hazard';
  readonly version = '2.0.0';
  readonly isEnabled = true;

  evaluate(context: EvaluationContext): DimensionScoreResult {
    // Not modelled for the Barind pilot yet: the score follows the SRDI land-type class.
    // The haor flash-flood model (Dharmapasha pilot) is the next step.
    const isUpland = context.landType === 'high' || context.landType === 'medium_high';
    const floodScore = isUpland ? 0.95 : 0.65;

    return {
      dimensionId: this.id,
      score: floodScore,
      confidence: 'low',
      summaryBangla: isUpland
        ? 'মাঝারি উঁচু বরেন্দ্র জমি (SRDI শ্রেণি): রবি ফসলের সময় বন্যার ঝুঁকি কম ধরা হয়েছে; বন্যা এখনো মডেল করা হয়নি।'
        : 'নিচু জমি: বর্ষার শেষে জলাবদ্ধতার ঝুঁকি ধরা হয়েছে; বন্যা এখনো মডেল করা হয়নি।',
      summaryEnglish: isUpland
        ? 'Medium-high Barind land (SRDI class): low flood exposure for Rabi crops is assumed; floods are not modelled yet.'
        : 'Lower land: late-monsoon waterlogging risk is assumed; floods are not modelled yet.',
      metrics: {
        landTypeClass: context.landType,
        floodModelled: false,
      },
      provenance: {
        source: 'Land-type class from the SRDI Talanda union card (assumption, not a flood model)',
        timePeriod: 'static',
        spatialResolution: 'Union land-type class',
        measuredOrModeled: 'assumed',
        notesBangla: 'হাওরের আকস্মিক বন্যার মডেল (ধর্মপাশা পাইলট) পরবর্তী ধাপে যুক্ত হবে।',
      },
    };
  }

  explain(result: DimensionScoreResult) {
    return {
      banglaBullets: ['বরেন্দ্র পাইলটে বন্যার স্কোর জমির শ্রেণি থেকে ধরা; আলাদা বন্যা মডেল নয়।'],
      englishBullets: ['For the Barind pilot the flood score comes from the land-type class, not a flood model.'],
    };
  }
}
