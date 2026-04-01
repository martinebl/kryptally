import BigNumber from 'bignumber.js';
import type { IFiatConverter } from '$lib/types';

const API_BASE = 'https://api.frankfurter.app';

const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);

const cacheKey = (from: string, to: string, dateKey: string): string =>
  `${from}-${to}-${dateKey}`;

/**
 * Fiat-to-fiat converter backed by the Frankfurter API (ECB data).
 * Free, no API key required, no rate limits.
 * Weekends and holidays automatically fall back to the most recent trading day.
 * Results are cached per requested date so repeated lookups are free.
 */
export const createFrankfurterFiatConverter = (): IFiatConverter => {
  const cache = new Map<string, BigNumber>();

  return {
    getRate: async (fromCurrency: string, toCurrency: string, date: Date): Promise<BigNumber> => {
      const from = fromCurrency.toUpperCase();
      const to = toCurrency.toUpperCase();

      if (from === to) return new BigNumber(1);

      const dateKey = toDateKey(date);
      const key = cacheKey(from, to, dateKey);

      if (cache.has(key)) return cache.get(key)!;

      const url = `${API_BASE}/${dateKey}?from=${from}&to=${to}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Frankfurter API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rate = data?.rates?.[to];

      if (rate === undefined) {
        throw new Error(`No ${to} rate for ${from} on ${dateKey}`);
      }

      const result = new BigNumber(rate);
      // Cache by the requested date (not the response date, which may differ on weekends)
      cache.set(key, result);
      return result;
    },
  };
};