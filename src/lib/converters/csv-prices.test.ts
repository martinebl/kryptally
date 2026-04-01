import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { parsePriceCSV, createCsvCryptoToFiatConverter } from '$lib/converters/csv-prices';
import type { IFiatConverter } from '$lib/types';

const bn = (n: number | string) => new BigNumber(n);

const SAMPLE_CSV = [
  'Date,Open,High,Low,Close,Adjusted Close,Volume',
  '"Apr 1, 2026","68,224.47","69,191.27","67,591.14","68,675.74","68,675.74","40,216,952,832"',
  '"Mar 31, 2026","66,694.59","68,495.27","65,950.44","68,233.31","68,233.31","42,997,691,338"',
  '"Jan 5, 2024",43500.00,44100.00,43200.00,43800.00,43800.00,"25,000,000,000"', // unquoted decimals (BNB-style)
].join('\n');

const mockFiat: IFiatConverter = {
  getRate: async (from, to) => {
    if (from === 'USD' && to === 'DKK') return bn('6.85');
    if (from === 'USD' && to === 'USD') return bn('1');
    throw new Error(`No mock rate for ${from}/${to}`);
  },
};

describe('parsePriceCSV', () => {
  it('parses a valid CSV into a date → USD price map', () => {
    const prices = parsePriceCSV(SAMPLE_CSV);

    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
    expect(prices.get('2026-03-31')).toBeCloseTo(68233.31);
    expect(prices.get('2024-01-05')).toBeCloseTo(43800);
  });

  it('handles prices with comma thousand-separators', () => {
    const prices = parsePriceCSV(SAMPLE_CSV);

    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
  });

  it('returns an empty map for an empty CSV', () => {
    const prices = parsePriceCSV('Date,Open,High,Low,Close,Adjusted Close,Volume\n');

    expect(prices.size).toBe(0);
  });
});

describe('createCsvCryptoToFiatConverter', () => {
  const btcPrices = parsePriceCSV(SAMPLE_CSV);
  const pricesByAsset = new Map([['bitcoin', btcPrices]]);

  it('returns the close price converted to target currency', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);

    const rate = await converter.getRate('BTC', 'DKK', new Date('2026-04-01'));

    // 68675.74 USD × 6.85 DKK/USD
    expect(rate.isEqualTo(bn(68675.74).times(6.85))).toBe(true);
  });

  it('returns USD price directly without calling fiat converter', async () => {
    let fiatCalled = false;
    const trackingFiat: IFiatConverter = {
      getRate: async (from, to) => {
        fiatCalled = true;
        return mockFiat.getRate(from, to, new Date());
      },
    };
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, trackingFiat);

    await converter.getRate('BTC', 'USD', new Date('2026-04-01'));

    expect(fiatCalled).toBe(false);
  });

  it('resolves ticker to coinId (BTC → bitcoin)', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);

    const rate = await converter.getRate('BTC', 'USD', new Date('2026-04-01'));

    expect(rate.isEqualTo(bn(68675.74))).toBe(true);
  });

  it('falls back to nearest prior date when exact date is missing', async () => {
    // 2026-04-02 is not in the sample CSV; nearest prior is 2026-04-01
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);

    const rate = await converter.getRate('BTC', 'USD', new Date('2026-04-02'));

    expect(rate.isEqualTo(bn(68675.74))).toBe(true);
  });

  it('routes fiat currency directly to fiat converter', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);

    const rate = await converter.getRate('USD', 'DKK', new Date('2026-04-01'));

    // mockFiat returns 6.85 for USD→DKK; amount multiplier is 1 (it's a rate, not a price)
    expect(rate.isEqualTo(bn('6.85'))).toBe(true);
  });

  it('treats stablecoins as 1 USD and converts to target currency', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);

    const rate = await converter.getRate('USDT', 'DKK', new Date('2026-04-01'));

    expect(rate.isEqualTo(bn('6.85'))).toBe(true);
  });

  it('returns 1 for stablecoin when target currency is USD', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);

    const rate = await converter.getRate('BUSD', 'USD', new Date('2026-04-01'));

    expect(rate.isEqualTo(bn(1))).toBe(true);
  });

  it('throws for a crypto asset not in the dataset', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);

    await expect(converter.getRate('SOL', 'USD', new Date('2026-04-01')))
      .rejects.toThrow();
  });

  it('throws when date is too far before the dataset begins', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);

    await expect(converter.getRate('BTC', 'USD', new Date('2000-01-01')))
      .rejects.toThrow();
  });
});