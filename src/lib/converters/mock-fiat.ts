import BigNumber from 'bignumber.js';
import type { IFiatConverter } from '$lib/types';

/** Hardcoded rates for development and testing. Not for production use. */
const MOCK_RATES: Record<string, Record<string, number>> = {
  USD: { EUR: 0.92, DKK: 6.85, GBP: 0.79 },
  EUR: { USD: 1.09, DKK: 7.46, GBP: 0.86 },
  DKK: { USD: 0.146, EUR: 0.134, GBP: 0.115 },
  GBP: { USD: 1.27, EUR: 1.16, DKK: 8.68 },
};

export const createMockFiatConverter = (): IFiatConverter => ({
  getRate: async (fromCurrency: string, toCurrency: string, _date: Date): Promise<BigNumber> => {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) {
      return new BigNumber(1);
    }
    const rate = MOCK_RATES[from]?.[to];
    if (rate === undefined) {
      throw new Error(`No mock rate for ${from}/${to}`);
    }
    return new BigNumber(rate);
  },
});
