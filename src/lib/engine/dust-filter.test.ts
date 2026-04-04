import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { filterDustHoldings } from '$lib/engine/dust-filter';

const bn = (n: number) => new BigNumber(n);

const makeHolding = (asset: string, totalAmount: number, totalCostBasis: number) => ({
  asset,
  totalAmount: bn(totalAmount),
  totalCostBasis: bn(totalCostBasis),
});

describe('filterDustHoldings', () => {
  it('returns empty arrays for empty input', () => {
    const result = filterDustHoldings([], bn(10));
    expect(result.visible).toEqual([]);
    expect(result.dust).toEqual([]);
  });

  it('puts all holdings in visible when all are above threshold', () => {
    const holdings = [
      makeHolding('BTC', 0.5, 50000),
      makeHolding('ETH', 10, 30000),
    ];

    const result = filterDustHoldings(holdings, bn(10));

    expect(result.visible).toHaveLength(2);
    expect(result.dust).toHaveLength(0);
  });

  it('puts all holdings in dust when all are below threshold', () => {
    const holdings = [
      makeHolding('TRX', 4.95, 0.5),
      makeHolding('DOGE', 0.001, 0.01),
    ];

    const result = filterDustHoldings(holdings, bn(10));

    expect(result.visible).toHaveLength(0);
    expect(result.dust).toHaveLength(2);
  });

  it('splits holdings into visible and dust', () => {
    const holdings = [
      makeHolding('BTC', 0.5, 50000),
      makeHolding('TRX', 4.95, 0.5),
      makeHolding('ETH', 10, 30000),
      makeHolding('DOGE', 0.001, 0.01),
    ];

    const result = filterDustHoldings(holdings, bn(10));

    expect(result.visible).toHaveLength(2);
    expect(result.visible.map((h) => h.asset)).toEqual(['BTC', 'ETH']);
    expect(result.dust).toHaveLength(2);
    expect(result.dust.map((h) => h.asset)).toEqual(['TRX', 'DOGE']);
  });

  it('treats exactly-at-threshold holdings as visible', () => {
    const holdings = [makeHolding('ETH', 1, 10)];

    const result = filterDustHoldings(holdings, bn(10));

    expect(result.visible).toHaveLength(1);
    expect(result.dust).toHaveLength(0);
  });

  it('filters nothing when threshold is zero', () => {
    const holdings = [
      makeHolding('TRX', 4.95, 0.5),
      makeHolding('BTC', 0.5, 50000),
    ];

    const result = filterDustHoldings(holdings, bn(0));

    expect(result.visible).toHaveLength(2);
    expect(result.dust).toHaveLength(0);
  });
});
