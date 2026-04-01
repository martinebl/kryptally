import Papa from 'papaparse';
import BigNumber from 'bignumber.js';
import type { ICryptoToFiatConverter, IFiatConverter } from '$lib/types';

/**
 * Fiat currencies supported by Frankfurter. These are never crypto assets,
 * so we route them directly to the fiat converter instead of a price lookup.
 */
const FIAT_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'HKD', 'SGD', 'KRW',
  'SEK', 'NOK', 'DKK', 'TRY', 'BRL', 'ZAR', 'MXN', 'INR', 'PLN', 'CZK',
  'HUF', 'RON', 'BGN', 'ISK', 'NZD', 'PHP', 'IDR', 'MYR', 'THB',
]);

/**
 * USD-pegged stablecoins. Treat as exactly 1 USD for fiat value purposes,
 * rather than trying to look them up as volatile crypto.
 */
const STABLECOINS = new Set([
  'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'GUSD', 'USDP', 'FRAX',
  'LUSD', 'FDUSD', 'PYUSD', 'USDD',
]);

/** Reuse the same ticker→coinId map as the CoinGecko converter */
const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
  BNB: 'binancecoin', USDT: 'tether', USDC: 'usd-coin',
  BUSD: 'binance-usd', TRX: 'tron', DOT: 'polkadot',
  ADA: 'cardano', DOGE: 'dogecoin', XRP: 'ripple',
  MATIC: 'matic-network', AVAX: 'avalanche-2', LINK: 'chainlink',
  LUNA: 'terra-luna', SHIB: 'shiba-inu', LTC: 'litecoin',
  UNI: 'uniswap', ATOM: 'cosmos', APT: 'aptos',
  ARB: 'arbitrum', OP: 'optimism', NEAR: 'near',
};

const resolveCoinId = (ticker: string): string =>
  COIN_IDS[ticker.toUpperCase()] ?? ticker.toLowerCase();

/** Parse "Apr 1, 2026" → "2026-04-01" */
const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

const parseDateKey = (raw: string): string => {
  const match = raw.trim().match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) throw new Error(`Cannot parse CSV date: "${raw}"`);
  const [, mon, day, year] = match;
  return `${year}-${MONTHS[mon]}-${day.padStart(2, '0')}`;
};

/** Strip thousand-separator commas and parse as float */
const parsePrice = (raw: string): number => parseFloat(raw.replace(/,/g, ''));

/**
 * Parse a Yahoo Finance–style CSV into a Map of YYYY-MM-DD → USD close price.
 * Exported for testing.
 */
export const parsePriceCSV = (csv: string): Map<string, number> => {
  const { data } = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: 'greedy' });
  const result = new Map<string, number>();

  for (const row of data.slice(1)) { // skip header
    if (row.length < 5) continue;
    try {
      const dateKey = parseDateKey(row[0]);
      const price = parsePrice(row[4]); // Close price
      if (!isNaN(price)) result.set(dateKey, price);
    } catch {
      // skip malformed rows
    }
  }

  return result;
};

/**
 * Look up price for a date key, falling back to the nearest prior date
 * (up to MAX_LOOKBACK_DAYS) if no exact match exists.
 */
const MAX_LOOKBACK_DAYS = 0;

const lookupPrice = (prices: Map<string, number>, dateKey: string): number | undefined => {
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
 * Creates a converter backed by pre-parsed CSV price data (USD).
 * Uses `fiatConverter` to convert USD to other currencies.
 * Throws for unknown assets or dates outside the dataset.
 *
 * Pass the result of `loadCsvPrices()` as `pricesByAsset`.
 */
export const createCsvCryptoToFiatConverter = (
  pricesByAsset: Map<string, Map<string, number>>,
  fiatConverter: IFiatConverter,
): ICryptoToFiatConverter => ({
  getRate: async (asset: string, fiatCurrency: string, datetime: Date): Promise<BigNumber> => {
    const upper = asset.toUpperCase();

    // Fiat currency (e.g. USD deposited on Binance): route directly to fiat converter
    if (FIAT_CURRENCIES.has(upper)) {
      return fiatConverter.getRate(upper, fiatCurrency, datetime);
    }

    // USD-pegged stablecoin: treat as exactly 1 USD
    if (STABLECOINS.has(upper)) {
      if (fiatCurrency.toUpperCase() === 'USD') return new BigNumber(1);
      return fiatConverter.getRate('USD', fiatCurrency, datetime);
    }

    // Crypto: look up in CSV data
    const coinId = resolveCoinId(asset);
    const prices = pricesByAsset.get(coinId);
    if (!prices) throw new Error(`No CSV price data for ${asset}`);

    const dateKey = datetime.toISOString().slice(0, 10);
    const usdPrice = lookupPrice(prices, dateKey);
    if (usdPrice === undefined) {
      throw new Error(`No CSV price for ${asset} on or before ${dateKey}`);
    }

    if (fiatCurrency.toUpperCase() === 'USD') {
      return new BigNumber(usdPrice);
    }

    const fiatRate = await fiatConverter.getRate('USD', fiatCurrency, datetime);
    return new BigNumber(usdPrice).times(fiatRate);
  },
});

/**
 * Loads and parses all CSV files from the crypto_prices directory.
 * Uses Vite's import.meta.glob — only call this at app initialisation.
 */
export const loadCsvPrices = (): Map<string, Map<string, number>> => {
  const rawFiles = import.meta.glob<string>('/src/crypto_prices/*.csv', {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  const result = new Map<string, Map<string, number>>();

  for (const [path, content] of Object.entries(rawFiles)) {
    // e.g. "../../crypto_prices/bitcoin_usd.csv" → "bitcoin"
    const filename = path.split('/').pop() ?? '';
    const coinId = filename.replace('_usd.csv', '');
    result.set(coinId, parsePriceCSV(content));
  }

  return result;
};