import BigNumber from 'bignumber.js';
import type { ICryptoToFiatConverter, IFiatConverter } from '$lib/types';
import { resolveCoinId } from '$lib/converters/coin-ids';
import { parsePriceCSV } from '$lib/converters/price-csv-parser';
import { FIAT_CURRENCIES, STABLECOINS } from '$lib/converters/fiat-currencies';

/** Price data for a single asset: a date→price map plus the currency those prices are in */
export interface PriceData {
  prices: Map<string, BigNumber>;
  currency: string;
}

export type PricesByAsset = Map<string, PriceData>;

/**
 * Look up price for a date key, falling back to the nearest prior date
 * (up to MAX_LOOKBACK_DAYS) if no exact match exists.
 */
const MAX_LOOKBACK_DAYS = 0;

const lookupPrice = (prices: Map<string, BigNumber>, dateKey: string): BigNumber | undefined => {
  if (prices.has(dateKey)) return prices.get(dateKey);

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  for (let i = 1; i <= MAX_LOOKBACK_DAYS; i++) {
    date.setUTCDate(date.getUTCDate() - 1);
    const fallbackKey = date.toISOString().slice(0, 10);
    if (prices.has(fallbackKey)) return prices.get(fallbackKey);
  }

  return undefined;
};

/**
 * Creates a converter backed by pre-parsed CSV price data.
 * Uses `fiatConverter` to convert between currencies when needed.
 * Throws for unknown assets or dates outside the dataset.
 *
 * The map is read by reference, so entries added after creation are visible immediately.
 */
export const createCsvCryptoToFiatConverter = (
  pricesByAsset: PricesByAsset,
  fiatConverter: IFiatConverter,
): ICryptoToFiatConverter => ({
  getRate: async (asset: string, fiatCurrency: string, datetime: Date): Promise<BigNumber> => {
    const upper = asset.toUpperCase();

    if (FIAT_CURRENCIES.has(upper)) {
      return fiatConverter.getRate(upper, fiatCurrency, datetime);
    }

    if (STABLECOINS.has(upper)) {
      if (fiatCurrency.toUpperCase() === 'USD') return new BigNumber(1);
      return fiatConverter.getRate('USD', fiatCurrency, datetime);
    }

    const coinId = resolveCoinId(asset);
    const priceData = pricesByAsset.get(coinId);
    if (!priceData) throw new Error(`No CSV price data for ${asset}`);

    const dateKey = datetime.toISOString().slice(0, 10);
    const rawPrice = lookupPrice(priceData.prices, dateKey);
    if (rawPrice === undefined) {
      throw new Error(`No CSV price for ${asset} on or before ${dateKey}`);
    }

    const priceCurrency = priceData.currency.toUpperCase();
    const targetCurrency = fiatCurrency.toUpperCase();

    if (targetCurrency === priceCurrency) {
      return rawPrice;
    }

    const fiatRate = await fiatConverter.getRate(priceCurrency, targetCurrency, datetime);
    return rawPrice.times(fiatRate);
  },
});

/**
 * Loads and parses all CSV files from the crypto_prices directory.
 * Uses Vite's import.meta.glob — only call this at app initialisation.
 * All bundled files are assumed to contain USD prices.
 */
export const loadCsvPrices = (): PricesByAsset => {
  const rawFiles = import.meta.glob<string>('/src/crypto_prices/*.csv', {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  const result: PricesByAsset = new Map();

  for (const [path, content] of Object.entries(rawFiles)) {
    const filename = path.split('/').pop() ?? '';
    const coinId = filename.replace('_usd.csv', '');
    result.set(coinId, { prices: parsePriceCSV(content), currency: 'USD' });
  }

  return result;
};
