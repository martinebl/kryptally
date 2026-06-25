import type { MissingPrice } from '$lib/engine/enrich-fiat-values';

export interface MissingAssetGroup {
  asset: string;
  count: number;
  range: string;
  dates: string[];
}

/**
 * Groups per-transaction pricing failures by asset for display.
 * Dates are sorted ascending within each group; groups are ordered
 * by failure count descending. Pure — no side effects.
 */
export const groupMissingPrices = (missing: MissingPrice[]): MissingAssetGroup[] => {
  const byAsset = missing.reduce((acc, { asset, date }) => {
    acc.set(asset, [...(acc.get(asset) ?? []), date]);
    return acc;
  }, new Map<string, string[]>());

  return [...byAsset.entries()]
    .map(([asset, dates]) => {
      const sorted = [...dates].sort();
      const range = sorted.length > 1
        ? `${sorted[0]} → ${sorted[sorted.length - 1]}`
        : sorted[0];
      return { asset, count: dates.length, range, dates: sorted };
    })
    .sort((a, b) => b.count - a.count);
};
