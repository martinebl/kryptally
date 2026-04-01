import BigNumber from 'bignumber.js';
import type { ICryptoToFiatConverter } from '$lib/types';

/** Map common ticker symbols to CoinGecko coin IDs */
const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  USDT: 'tether',
  USDC: 'usd-coin',
  BUSD: 'binance-usd',
  TRX: 'tron',
  DOT: 'polkadot',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  XRP: 'ripple',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  LUNA: 'terra-luna',
  SHIB: 'shiba-inu',
  LTC: 'litecoin',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  FIL: 'filecoin',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  NEAR: 'near',
};

const resolveCoinId = (ticker: string): string =>
  COIN_IDS[ticker.toUpperCase()] ?? ticker.toLowerCase();

const formatDate = (date: Date): string => {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const cacheKey = (coinId: string, date: Date): string =>
  `${coinId}-${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimum milliseconds between API requests (~15 req/min, conservative for the free tier) */
const MIN_REQUEST_INTERVAL_MS = 4000;

const API_BASE = 'https://api.coingecko.com/api/v3';

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
      const coinId = resolveCoinId(asset);
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
