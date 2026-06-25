import BigNumber from 'bignumber.js';
import type { CurrentPricesResult, ICurrentPriceFetcher, IFiatConverter } from '$lib/types/converters';
import { GECKO_COIN_IDS } from '$lib/converters/coin-ids';

const API_BASE = 'https://api.coingecko.com/api/v3';

type SimplePriceResponse = Record<string, Record<string, number>>;

const coinId = (ticker: string): string =>
  GECKO_COIN_IDS[ticker.toUpperCase()] ?? ticker.toLowerCase();

const fetchSimplePrice = async (ids: string[], vsCurrency: string): Promise<SimplePriceResponse> => {
  const url = `${API_BASE}/simple/price?ids=${ids.join(',')}&vs_currencies=${vsCurrency}`;
  const response = await fetch(url);
  if (!response.ok) return {};
  return (await response.json()) as SimplePriceResponse;
};

/**
 * Fetches current spot prices for many assets in a single CoinGecko
 * `/simple/price` request — far cheaper than the per-asset historical endpoint.
 * Prefers the requested fiat directly; if CoinGecko does not return it, falls
 * back to USD prices converted once via `fiatConverter`.
 */
export const createCoinGeckoCurrentPriceFetcher = (
  fiatConverter: IFiatConverter,
): ICurrentPriceFetcher => ({
  async fetchCurrentPrices(assets: string[], fiatCurrency: string): Promise<CurrentPricesResult> {
    const prices = new Map<string, BigNumber>();
    const unpriced: string[] = [];

    const uniqueAssets = [...new Set(assets)];
    if (uniqueAssets.length === 0) return { prices, unpriced };

    const idByAsset = new Map(uniqueAssets.map((a) => [a, coinId(a)]));
    const ids = [...new Set(idByAsset.values())];
    const fiat = fiatCurrency.toLowerCase();

    const data = await fetchSimplePrice(ids, fiat).catch(() => ({}) as SimplePriceResponse);

    // USD fallback, loaded lazily and at most once (only if a coin lacks the
    // requested fiat, e.g. a currency CoinGecko's /simple/price doesn't support).
    let fallback: { usdData: SimplePriceResponse; usdToFiat: BigNumber | null } | null = null;
    const loadUsdFallback = async () => {
      if (!fallback) {
        const usdData = await fetchSimplePrice(ids, 'usd').catch(() => ({}) as SimplePriceResponse);
        const usdToFiat = await fiatConverter.getRate('USD', fiatCurrency, new Date()).catch(() => null);
        fallback = { usdData, usdToFiat };
      }
      return fallback;
    };

    for (const asset of uniqueAssets) {
      const id = idByAsset.get(asset) as string;

      const direct = data[id]?.[fiat];
      if (direct !== undefined && direct > 0) {
        prices.set(asset, new BigNumber(direct));
        continue;
      }

      if (fiat !== 'usd') {
        const { usdData, usdToFiat } = await loadUsdFallback();
        const usd = usdData[id]?.['usd'];
        if (usd !== undefined && usd > 0 && usdToFiat && usdToFiat.gt(0)) {
          prices.set(asset, new BigNumber(usd).times(usdToFiat));
          continue;
        }
      }

      unpriced.push(asset);
    }

    return { prices, unpriced };
  },
});
