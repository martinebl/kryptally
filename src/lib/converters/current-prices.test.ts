import { describe, it, expect, vi, beforeEach } from 'vitest';
import BigNumber from 'bignumber.js';
import { createCoinGeckoCurrentPriceFetcher } from '$lib/converters/current-prices';
import type { IFiatConverter } from '$lib/types/converters';

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

// A fiat converter that returns a fixed USD->fiat rate, used only for the fallback path.
const fixedFiat = (rate: number): IFiatConverter => ({
  getRate: async () => new BigNumber(rate),
});

describe('createCoinGeckoCurrentPriceFetcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty result without fetching for no assets', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await createCoinGeckoCurrentPriceFetcher(fixedFiat(7)).fetchCurrentPrices([], 'DKK');

    expect(result.prices.size).toBe(0);
    expect(result.unpriced).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('batches all assets into a single request with resolved coin ids', async () => {
    const fetchMock = vi.fn(() => okJson({ bitcoin: { dkk: 410000 }, ethereum: { dkk: 18000 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createCoinGeckoCurrentPriceFetcher(fixedFiat(7)).fetchCurrentPrices(
      ['BTC', 'ETH'],
      'DKK',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/simple/price'));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('ids=bitcoin,ethereum'));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('vs_currencies=dkk'));

    expect(result.prices.get('BTC')!.toNumber()).toBe(410000);
    expect(result.prices.get('ETH')!.toNumber()).toBe(18000);
    expect(result.unpriced).toHaveLength(0);
  });

  it('keys the result by the exact asset string supplied', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okJson({ bitcoin: { eur: 55000 } })));

    const result = await createCoinGeckoCurrentPriceFetcher(fixedFiat(1)).fetchCurrentPrices(['BTC'], 'EUR');

    expect(result.prices.has('BTC')).toBe(true);
  });

  it('deduplicates repeated assets', async () => {
    const fetchMock = vi.fn(() => okJson({ bitcoin: { dkk: 410000 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createCoinGeckoCurrentPriceFetcher(fixedFiat(7)).fetchCurrentPrices(
      ['BTC', 'BTC'],
      'DKK',
    );

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('ids=bitcoin'));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('bitcoin,bitcoin'));
    expect(result.prices.get('BTC')!.toNumber()).toBe(410000);
  });

  it('marks assets missing from the response as unpriced', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okJson({ bitcoin: { dkk: 410000 } })));

    const result = await createCoinGeckoCurrentPriceFetcher(fixedFiat(7)).fetchCurrentPrices(
      ['BTC', 'ETH'],
      'DKK',
    );

    expect(result.prices.get('BTC')!.toNumber()).toBe(410000);
    expect(result.unpriced).toEqual(['ETH']);
  });

  it('falls back to USD + fiat conversion when the requested fiat is absent', async () => {
    // First call (dkk) returns no dkk keys; second call (usd) provides prices.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => okJson({ bitcoin: {} }))
      .mockImplementationOnce(() => okJson({ bitcoin: { usd: 60000 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createCoinGeckoCurrentPriceFetcher(fixedFiat(7)).fetchCurrentPrices(['BTC'], 'DKK');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('vs_currencies=usd'));
    expect(result.prices.get('BTC')!.toNumber()).toBe(420000); // 60000 * 7
    expect(result.unpriced).toHaveLength(0);
  });

  it('marks everything unpriced when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    const result = await createCoinGeckoCurrentPriceFetcher(fixedFiat(7)).fetchCurrentPrices(['BTC'], 'DKK');

    expect(result.prices.size).toBe(0);
    expect(result.unpriced).toEqual(['BTC']);
  });

  it('does not call the USD fallback when the fiat is already USD', async () => {
    const fetchMock = vi.fn(() => okJson({ bitcoin: {} })); // no usd key
    vi.stubGlobal('fetch', fetchMock);

    const result = await createCoinGeckoCurrentPriceFetcher(fixedFiat(7)).fetchCurrentPrices(['BTC'], 'USD');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.unpriced).toEqual(['BTC']);
  });
});
