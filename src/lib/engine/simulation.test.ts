import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { buildSellsFromPrices } from './simulation';

const bn = (n: number) => new BigNumber(n);
const date = new Date('2024-06-15T12:00:00Z');
const priceMap = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([k, v]) => [k, bn(v)]));

describe('buildSellsFromPrices', () => {
  it('returns empty result for empty holdings', () => {
    const result = buildSellsFromPrices([], priceMap({}), date, 'DKK');
    expect(result.transactions).toHaveLength(0);
    expect(result.unpriced).toHaveLength(0);
  });

  it('creates a sell transaction with correct fiatValue', () => {
    const holdings = [{ asset: 'BTC', totalAmount: bn(0.5) }];

    const result = buildSellsFromPrices(holdings, priceMap({ BTC: 400000 }), date, 'DKK');

    expect(result.transactions).toHaveLength(1);
    expect(result.unpriced).toHaveLength(0);

    const tx = result.transactions[0];
    expect(tx.type).toBe('sell');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount?.toNumber()).toBe(0.5);
    expect(tx.fiatValue!.toNumber()).toBe(200000); // 0.5 * 400000
    expect(tx.fiatCurrency).toBe('DKK');
    expect(tx.date).toEqual(date);
    expect(tx.id).toBe('sim-sell-BTC');
  });

  it('handles multiple assets independently', () => {
    const holdings = [
      { asset: 'BTC', totalAmount: bn(1) },
      { asset: 'ETH', totalAmount: bn(2) },
    ];

    const result = buildSellsFromPrices(holdings, priceMap({ BTC: 400000, ETH: 20000 }), date, 'DKK');

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].fromAsset).toBe('BTC');
    expect(result.transactions[0].fiatValue!.toNumber()).toBe(400000);
    expect(result.transactions[1].fromAsset).toBe('ETH');
    expect(result.transactions[1].fiatValue!.toNumber()).toBe(40000);
  });

  it('adds asset to unpriced when no price is supplied', () => {
    const holdings = [
      { asset: 'BTC', totalAmount: bn(1) },
      { asset: 'ETH', totalAmount: bn(1) },
    ];

    const result = buildSellsFromPrices(holdings, priceMap({ ETH: 20000 }), date, 'DKK');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].fromAsset).toBe('ETH');
    expect(result.unpriced).toEqual(['BTC']);
  });

  it('adds asset to unpriced when the price is zero', () => {
    const holdings = [{ asset: 'BTC', totalAmount: bn(1) }];

    const result = buildSellsFromPrices(holdings, priceMap({ BTC: 0 }), date, 'DKK');

    expect(result.transactions).toHaveLength(0);
    expect(result.unpriced).toEqual(['BTC']);
  });

  it('skips holdings with zero or negative amount', () => {
    const holdings = [{ asset: 'BTC', totalAmount: bn(0) }];

    const result = buildSellsFromPrices(holdings, priceMap({ BTC: 400000 }), date, 'DKK');

    expect(result.transactions).toHaveLength(0);
    expect(result.unpriced).toHaveLength(0);
  });

  it('uses the provided fiat currency and date', () => {
    const holdings = [{ asset: 'BTC', totalAmount: bn(1) }];
    const simDate = new Date('2024-12-31T00:00:00Z');

    const result = buildSellsFromPrices(holdings, priceMap({ BTC: 50000 }), simDate, 'EUR');

    expect(result.transactions[0].fiatCurrency).toBe('EUR');
    expect(result.transactions[0].date).toEqual(simDate);
  });
});
