import type BigNumber from 'bignumber.js';

/**
 * Tailwind text-color class for a monetary value: green for gains, red for
 * losses, neutral otherwise. Centralized so tables/results share one source of
 * truth for value coloring.
 */
export const valueColor = (v: BigNumber): string =>
  v.gt(0) ? 'text-positive' : v.lt(0) ? 'text-negative' : 'text-text';
