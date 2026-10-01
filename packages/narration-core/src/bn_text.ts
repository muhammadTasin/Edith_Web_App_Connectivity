/** Small Bangla text helpers for the spoken script (kept here so narration-core only depends on contracts). */

const DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export const LAND_TYPE_BANGLA: Record<string, string> = {
  high: 'উঁচু',
  medium_high: 'মাঝারি উঁচু',
  medium_low: 'মাঝারি নিচু',
  low: 'নিচু',
  very_low: 'খুব নিচু',
};

export function bnDigits(value: number | string): string {
  return String(value).replace(/\d/g, d => DIGITS[Number(d)]);
}

/** 'তালন্দ ইউনিয়ন' -> 'তালন্দ ইউনিয়নের' */
export function bnOf(name: string): string {
  return name.endsWith('ইউনিয়ন') ? `${name}ের` : `${name}-এর`;
}

/** '১০ নভেম্বর' -> '১০ নভেম্বরের' */
export function bnDateOf(text: string): string {
  if (text.endsWith('ি') || text.endsWith('ে')) return `${text}র`;
  if (text.endsWith('ই')) return `${text}য়ের`;
  return `${text}ের`;
}
