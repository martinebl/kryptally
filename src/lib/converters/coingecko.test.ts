import { describe, it, expect, vi, beforeEach } from 'vitest';
import BigNumber from 'bignumber.js';
import { createCoinGeckoCryptoToFiatConverter } from '$lib/converters/coingecko';

const mockPrices = {
  usd: 66000,
  eur: 50000,
  dkk: 433000,
};

const makeFetchResponse = (prices: Record<string, number>) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ market_data: { current_price: prices } }),
  });

describe('CoinGecko crypto-to-fiat converter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves known ticker to CoinGecko coin ID', async () => {
    const fetchSpy = vi.stubGlobal('fetch', vi.fn(() => makeFetchResponse(mockPrices)));
    const converter = createCoinGeckoCryptoToFiatConverter();

    await converter.getRate('BTC', 'USD', new Date('2024-01-15'));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/coins/bitcoin/history'),
    );
  });

  it('falls back to lowercase ticker for unknown coins', async () => {
    vi.stubGlobal('fetch', vi.fn(() => makeFetchResponse({ usd: 1.5 })));
    const converter = createCoinGeckoCryptoToFiatConverter();

    await converter.getRate('NEWCOIN', 'USD', new Date('2024-01-15'));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/coins/newcoin/history'),
    );
  });

  it('returns the correct rate as a BigNumber', async () => {
    vi.stubGlobal('fetch', vi.fn(() => makeFetchResponse(mockPrices)));
    const converter = createCoinGeckoCryptoToFiatConverter();

    const rate = await converter.getRate('BTC', 'DKK', new Date('2024-01-15'));

    expect(rate.isEqualTo(new BigNumber(433000))).toBe(true);
  });

  it('caches results — second call with same asset+date does not fetch again', async () => {
    const fetchMock = vi.fn(() => makeFetchResponse(mockPrices));
    vi.stubGlobal('fetch', fetchMock);
    const converter = createCoinGeckoCryptoToFiatConverter();

    await converter.getRate('BTC', 'USD', new Date('2024-01-15'));
    await converter.getRate('BTC', 'DKK', new Date('2024-01-15'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches again for a different date', async () => {
    const fetchMock = vi.fn(() => makeFetchResponse(mockPrices));
    vi.stubGlobal('fetch', fetchMock);
    const converter = createCoinGeckoCryptoToFiatConverter();

    await converter.getRate('BTC', 'USD', new Date('2024-01-15'));
    await converter.getRate('BTC', 'USD', new Date('2024-01-16'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('formats the date as dd-mm-yyyy in the URL', async () => {
    vi.stubGlobal('fetch', vi.fn(() => makeFetchResponse(mockPrices)));
    const converter = createCoinGeckoCryptoToFiatConverter();

    await converter.getRate('BTC', 'USD', new Date('2024-03-05'));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('date=05-03-2024'),
    );
  });

  it('throws when API returns non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    })));
    const converter = createCoinGeckoCryptoToFiatConverter();

    await expect(converter.getRate('BTC', 'USD', new Date('2024-01-15')))
      .rejects.toThrow('No price data');
  });

  it('throws when response has no market data', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: 'bitcoin' }),
    })));
    const converter = createCoinGeckoCryptoToFiatConverter();

    await expect(converter.getRate('BTC', 'USD', new Date('2024-01-15')))
      .rejects.toThrow('No price data');
  });

  it('throws when requested fiat currency is not in response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => makeFetchResponse({ usd: 66000 })));
    const converter = createCoinGeckoCryptoToFiatConverter();

    await expect(converter.getRate('BTC', 'XYZ', new Date('2024-01-15')))
      .rejects.toThrow('No XYZ price');
  });

  it('caches failures — does not retry a failed lookup', async () => {
    const fetchMock = vi.fn()
      .mockReturnValueOnce(Promise.resolve({ ok: false, status: 401, statusText: 'Unauthorized' }))
      .mockReturnValue(makeFetchResponse(mockPrices));
    vi.stubGlobal('fetch', fetchMock);
    const converter = createCoinGeckoCryptoToFiatConverter();

    await expect(converter.getRate('BTC', 'USD', new Date('2023-01-15'))).rejects.toThrow();
    await expect(converter.getRate('BTC', 'USD', new Date('2023-01-15'))).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rate-limits requests with a delay between fetches', async () => {
    vi.stubGlobal('fetch', vi.fn(() => makeFetchResponse(mockPrices)));
    const converter = createCoinGeckoCryptoToFiatConverter();

    const start = Date.now();
    await converter.getRate('BTC', 'USD', new Date('2024-01-15'));
    await converter.getRate('ETH', 'USD', new Date('2024-01-15'));
    const elapsed = Date.now() - start;

    // Second call should have waited ~4000ms
    expect(elapsed).toBeGreaterThanOrEqual(3800);
  }, 10000);
});
