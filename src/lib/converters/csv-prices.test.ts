import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { parsePriceCSV, readCsvHeaders, detectColumns } from '$lib/converters/price-csv-parser';
import { createCsvCryptoToFiatConverter, type PricesByAsset } from '$lib/converters/csv-prices';
import type { IFiatConverter } from '$lib/types';

const bn = (n: number | string) => new BigNumber(n);

const YAHOO_CSV = [
  'Date,Open,High,Low,Close,Adjusted Close,Volume',
  '"Apr 1, 2026","68,224.47","69,191.27","67,591.14","68,675.74","68,675.74","40,216,952,832"',
  '"Mar 31, 2026","66,694.59","68,495.27","65,950.44","68,233.31","68,233.31","42,997,691,338"',
  '"Jan 5, 2024",43500.00,44100.00,43200.00,43800.00,43800.00,"25,000,000,000"',
].join('\n');

const ISO_CSV = [
  'Date,Open,High,Low,Close,Volume',
  '2026-04-01,68224.47,69191.27,67591.14,68675.74,40216952832',
  '2026-03-31,66694.59,68495.27,65950.44,68233.31,42997691338',
].join('\n');

const SLASH_CSV = [
  'Date,Price',
  '2026/04/01,68675.74',
  '2026/03/31,68233.31',
].join('\n');

const US_DATE_CSV = [
  'Date,Price',
  '04/01/2026,68675.74',
  '03/31/2026,68233.31',
].join('\n');

const mockFiat: IFiatConverter = {
  getRate: async (from, to) => {
    if (from === 'USD' && to === 'DKK') return bn('6.85');
    if (from === 'EUR' && to === 'DKK') return bn('7.46');
    if (from === 'USD' && to === 'USD') return bn('1');
    throw new Error(`No mock rate for ${from}/${to}`);
  },
};

// ---------------------------------------------------------------------------
// readCsvHeaders
// ---------------------------------------------------------------------------

describe('readCsvHeaders', () => {
  it('returns the header row', () => {
    expect(readCsvHeaders(YAHOO_CSV)).toEqual([
      'Date', 'Open', 'High', 'Low', 'Close', 'Adjusted Close', 'Volume',
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(readCsvHeaders('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectColumns
// ---------------------------------------------------------------------------

describe('detectColumns', () => {
  it('detects standard Yahoo Finance headers confidently', () => {
    const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Adjusted Close', 'Volume'];
    const result = detectColumns(headers);
    expect(result.mapping).toEqual({ dateCol: 0, priceCol: 4 });
    expect(result.confident).toBe(true);
  });

  it('detects generic date/price headers confidently', () => {
    const result = detectColumns(['timestamp', 'open', 'price']);
    expect(result.mapping).toEqual({ dateCol: 0, priceCol: 2 });
    expect(result.confident).toBe(true);
  });

  it('detects "value" as a price column', () => {
    const result = detectColumns(['date', 'value']);
    expect(result.mapping).toEqual({ dateCol: 0, priceCol: 1 });
    expect(result.confident).toBe(true);
  });

  it('returns confident: false for unknown headers', () => {
    const result = detectColumns(['foo', 'bar', 'baz']);
    expect(result.confident).toBe(false);
  });

  it('still returns partial detection when only one column is found', () => {
    const result = detectColumns(['date', 'foo', 'bar']);
    expect(result.mapping.dateCol).toBe(0);
    expect(result.confident).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parsePriceCSV — date format support
// ---------------------------------------------------------------------------

describe('parsePriceCSV date formats', () => {
  it('parses Yahoo Finance "Mon DD, YYYY" format', () => {
    const prices = parsePriceCSV(YAHOO_CSV);
    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
    expect(prices.get('2026-03-31')).toBeCloseTo(68233.31);
  });

  it('parses ISO YYYY-MM-DD format', () => {
    const prices = parsePriceCSV(ISO_CSV);
    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
    expect(prices.get('2026-03-31')).toBeCloseTo(68233.31);
  });

  it('parses YYYY/MM/DD format', () => {
    const prices = parsePriceCSV(SLASH_CSV);
    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
    expect(prices.get('2026-03-31')).toBeCloseTo(68233.31);
  });

  it('parses US MM/DD/YYYY format', () => {
    const prices = parsePriceCSV(US_DATE_CSV);
    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
    expect(prices.get('2026-03-31')).toBeCloseTo(68233.31);
  });

  it('skips rows with unparseable dates', () => {
    const csv = 'Date,Price\nnot-a-date,100\n2026-04-01,200';
    const prices = parsePriceCSV(csv);
    expect(prices.size).toBe(1);
    expect(prices.get('2026-04-01')).toBeCloseTo(200);
  });
});

// ---------------------------------------------------------------------------
// parsePriceCSV — column mapping
// ---------------------------------------------------------------------------

describe('parsePriceCSV column mapping', () => {
  it('auto-detects columns from headers', () => {
    const prices = parsePriceCSV(YAHOO_CSV);
    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
  });

  it('uses explicit column mapping when provided', () => {
    // SLASH_CSV has Date in col 0, Price in col 1
    const prices = parsePriceCSV(SLASH_CSV, { dateCol: 0, priceCol: 1 });
    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
  });

  it('handles prices with comma thousand-separators', () => {
    const prices = parsePriceCSV(YAHOO_CSV);
    expect(prices.get('2026-04-01')).toBeCloseTo(68675.74);
  });

  it('returns an empty map for a header-only CSV', () => {
    const prices = parsePriceCSV('Date,Open,High,Low,Close,Adjusted Close,Volume\n');
    expect(prices.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createCsvCryptoToFiatConverter
// ---------------------------------------------------------------------------

describe('createCsvCryptoToFiatConverter', () => {
  const btcPrices = parsePriceCSV(YAHOO_CSV);
  const pricesByAsset: PricesByAsset = new Map([
    ['bitcoin', { prices: btcPrices, currency: 'USD' }],
  ]);

  it('returns the close price converted to target currency', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);
    const rate = await converter.getRate('BTC', 'DKK', new Date('2026-04-01'));
    expect(rate.isEqualTo(bn(68675.74).times(6.85))).toBe(true);
  });

  it('returns price directly when target currency matches price currency', async () => {
    let fiatCalled = false;
    const trackingFiat: IFiatConverter = {
      getRate: async (from, to) => { fiatCalled = true; return mockFiat.getRate(from, to, new Date()); },
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

  it('converts EUR-denominated prices to target currency', async () => {
    const eurPrices = parsePriceCSV(YAHOO_CSV);
    const eurByAsset: PricesByAsset = new Map([
      ['bitcoin', { prices: eurPrices, currency: 'EUR' }],
    ]);
    const converter = createCsvCryptoToFiatConverter(eurByAsset, mockFiat);
    const rate = await converter.getRate('BTC', 'DKK', new Date('2026-04-01'));
    // 68675.74 EUR × 7.46 DKK/EUR
    expect(rate.isEqualTo(bn(68675.74).times(7.46))).toBe(true);
  });

  it('returns EUR price directly when target is also EUR', async () => {
    const eurPrices = parsePriceCSV(YAHOO_CSV);
    const eurByAsset: PricesByAsset = new Map([
      ['bitcoin', { prices: eurPrices, currency: 'EUR' }],
    ]);
    let fiatCalled = false;
    const trackingFiat: IFiatConverter = {
      getRate: async (from, to) => { fiatCalled = true; return mockFiat.getRate(from, to, new Date()); },
    };
    const converter = createCsvCryptoToFiatConverter(eurByAsset, trackingFiat);
    const rate = await converter.getRate('BTC', 'EUR', new Date('2026-04-01'));
    expect(fiatCalled).toBe(false);
    expect(rate.isEqualTo(bn(68675.74))).toBe(true);
  });

  it('throws when the exact date is missing (no lookback configured)', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);
    await expect(converter.getRate('BTC', 'USD', new Date('2026-04-02'))).rejects.toThrow();
  });

  it('routes fiat currency directly to fiat converter', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);
    const rate = await converter.getRate('USD', 'DKK', new Date('2026-04-01'));
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
    await expect(converter.getRate('SOL', 'USD', new Date('2026-04-01'))).rejects.toThrow();
  });

  it('throws when date is outside the dataset', async () => {
    const converter = createCsvCryptoToFiatConverter(pricesByAsset, mockFiat);
    await expect(converter.getRate('BTC', 'USD', new Date('2000-01-01'))).rejects.toThrow();
  });

  it('picks up assets added to the map after converter creation', async () => {
    const mutableMap: PricesByAsset = new Map([
      ['bitcoin', { prices: btcPrices, currency: 'USD' }],
    ]);
    const converter = createCsvCryptoToFiatConverter(mutableMap, mockFiat);

    const ethPrices = new Map([['2026-04-01', 3000]]);
    mutableMap.set('ethereum', { prices: ethPrices, currency: 'USD' });

    const rate = await converter.getRate('ETH', 'USD', new Date('2026-04-01'));
    expect(rate.isEqualTo(bn(3000))).toBe(true);
  });
});
