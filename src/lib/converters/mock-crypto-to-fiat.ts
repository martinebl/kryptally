import BigNumber from 'bignumber.js';
import type { ICryptoToFiatConverter } from '$lib/types';

/** Hardcoded rates for development and testing. Not for production use. */
const MOCK_RATES: Record<string, Record<string, number>> = {
  BTC: { USD: 60000, EUR: 55000, DKK: 433000 },
  ETH: { USD: 3000, EUR: 2750, DKK: 20500 },
  SOL: { USD: 150, EUR: 138, DKK: 1025 },
};

export const createMockCryptoToFiatConverter = (): ICryptoToFiatConverter => ({
  getRate: async (asset: string, fiatCurrency: string, _datetime: Date): Promise<BigNumber> => {
    const rate = MOCK_RATES[asset.toUpperCase()]?.[fiatCurrency.toUpperCase()];
    if (rate === undefined) {
      throw new Error(`No mock rate for ${asset}/${fiatCurrency}`);
    }
    return new BigNumber(rate);
  },
});
