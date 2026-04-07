import BigNumber from 'bignumber.js';
import type { ICryptoToFiatConverter } from '$lib/types';
import { GECKO_COIN_IDS } from '$lib/converters/coin-ids';

const formatDate = (date: Date): string => {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const cacheKey = (coinId: string, date: Date): string =>
  `${coinId}-${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimum milliseconds between API requests (~20 req/min, conservative for the free tier) */
const MIN_REQUEST_INTERVAL_MS = 3000;

const API_BASE = 'https://api.coingecko.com/api/v3';

export interface CoinListEntry { id: string; symbol: string; name: string; }

let coinListPromise: Promise<CoinListEntry[]> | null = null;
const userResolutions: Record<string, string> = {};

const fetchCoinList = (): Promise<CoinListEntry[]> => {
  if (!coinListPromise) {
    coinListPromise = fetch(`${API_BASE}/coins/list`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to fetch coin list'))))
      .catch(() => {
        coinListPromise = null;
        return [] as CoinListEntry[];
      });
  }
  return coinListPromise;
};

const resolveCoinId = async (ticker: string): Promise<string> => {
  const upper = ticker.toUpperCase();
  if (userResolutions[upper]) return userResolutions[upper];
  if (GECKO_COIN_IDS[upper]) return GECKO_COIN_IDS[upper];

  const list = await fetchCoinList();
  const matches = list.filter((c) => c.symbol.toUpperCase() === upper);
  if (matches.length === 1) return matches[0].id;
  return ticker.toLowerCase();
};

export const setUserResolutions = (map: Record<string, string>): void => {
  for (const [ticker, id] of Object.entries(map)) {
    userResolutions[ticker.toUpperCase()] = id;
  }
};

/**
 * Pre-flight check: given a list of asset tickers, returns any that map to
 * multiple CoinGecko coins and therefore need user disambiguation.
 * Unambiguous unknowns are auto-resolved and stored internally.
 */
export const preflightResolve = async (
  tickers: string[],
): Promise<Record<string, CoinListEntry[]>> => {
  const needsLookup = tickers.filter(
    (t) => !userResolutions[t.toUpperCase()] && !GECKO_COIN_IDS[t.toUpperCase()],
  );
  if (needsLookup.length === 0) return {};

  const list = await fetchCoinList();
  const ambiguous: Record<string, CoinListEntry[]> = {};

  for (const ticker of needsLookup) {
    const upper = ticker.toUpperCase();
    const matches = list.filter((c) => c.symbol.toUpperCase() === upper);
    if (matches.length === 1) {
      userResolutions[upper] = matches[0].id;
    } else if (matches.length > 1) {
      ambiguous[ticker] = matches;
    }
  }

  return ambiguous;
};

export const createCoinGeckoCryptoToFiatConverter = (): ICryptoToFiatConverter => {
  /** null = we tried and it failed (don't retry) */
  const cache = new Map<string, Record<string, number> | null>();
  let lastRequestTime = 0;

  const fetchHistoricalPrices = async (coinId: string, date: Date): Promise<Record<string, number> | null> => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }

    const url = `${API_BASE}/coins/${coinId}/history?date=${formatDate(date)}&localization=false`;
    lastRequestTime = Date.now();

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const prices = data?.market_data?.current_price;
    if (!prices || typeof prices !== 'object') {
      return null;
    }

    return prices as Record<string, number>;
  };

  return {
    getRate: async (asset: string, fiatCurrency: string, datetime: Date): Promise<BigNumber> => {
      const coinId = await resolveCoinId(asset);
      const key = cacheKey(coinId, datetime);

      if (!cache.has(key)) {
        cache.set(key, await fetchHistoricalPrices(coinId, datetime));
      }

      const prices = cache.get(key);
      if (!prices) {
        throw new Error(`No price data for ${asset} on ${formatDate(datetime)}`);
      }

      const rate = prices[fiatCurrency.toLowerCase()];
      if (rate === undefined) {
        throw new Error(`No ${fiatCurrency} price for ${asset} on ${formatDate(datetime)}`);
      }

      return new BigNumber(rate);
    },
  };
};
