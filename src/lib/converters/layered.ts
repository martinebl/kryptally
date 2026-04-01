import type { ICryptoToFiatConverter } from '$lib/types';

/**
 * Creates a converter that tries each provided converter in order,
 * returning the first successful result. Throws if all converters fail.
 */
export const createLayeredCryptoToFiatConverter = (
  converters: ICryptoToFiatConverter[],
): ICryptoToFiatConverter => ({
  getRate: async (asset, fiatCurrency, datetime) => {
    for (const converter of converters) {
      try {
        return await converter.getRate(asset, fiatCurrency, datetime);
      } catch {
        // try next
      }
    }
    throw new Error(`No converter could resolve ${asset}/${fiatCurrency} on ${datetime.toISOString().slice(0, 10)}`);
  },
});