import type { EvaluationContext } from '@project-eden/contracts';
import { TANORE_AMAN_REPLAY, TANORE_RABI_REPLAY } from './tanore_replay_data.ts';
import { AMAN_CATALOG, RABI_CATALOG } from './crop_catalog.ts';

/*
 * Look up a rotation's crops by their explicit season. These throw instead of falling back to a default crop:
 * a silent fallback once made the dhan49 -> Boro rotation score with lentil's water and heat numbers.
 */

export function amanOf(context: EvaluationContext) {
  const crop = context.crops.find(c => c.season === 'Aman');
  const record = crop ? TANORE_AMAN_REPLAY[crop.variety] : undefined;
  const catalog = crop ? AMAN_CATALOG[crop.variety] : undefined;
  if (!crop || !record || !catalog) {
    throw new Error(`No Aman replay data for "${crop?.variety ?? 'none'}" in rotation ${context.rotationId}`);
  }
  return { crop, record, catalog };
}

export function rabiOf(context: EvaluationContext) {
  const crop = context.crops.find(c => c.season === 'Rabi');
  const record = crop ? TANORE_RABI_REPLAY[crop.variety] : undefined;
  const catalog = crop ? RABI_CATALOG[crop.variety] : undefined;
  if (!crop || !record || !catalog) {
    throw new Error(`No Rabi replay data for "${crop?.variety ?? 'none'}" in rotation ${context.rotationId}`);
  }
  return { crop, record, catalog };
}

export function clampScore(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Number(value.toFixed(2))));
}
