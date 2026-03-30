import { describe, it, expect, vi } from 'vitest';
import BigNumber from 'bignumber.js';
import { buildSimulatedSells } from './simulation';
import type { ICryptoToFiatConverter } from '$lib/types/converters';

const bn = (n: number) => new BigNumber(n);
const date = new Date('2024-06-15T12:00:00Z');

function makeConverter(rates: Record<string, number>): ICryptoToFiatConverter {
  return {
    getRate: async (asset, _currency, _datetime) => {
      const rate = rates[asset.toUpperCase()];
      if (rate === undefined) throw new Error(`No rate for ${asset}`);
      return bn(rate);
    },
  };
}

describe('buildSimulatedSells', () => {
  it('returns empty result for empty holdings', async () => {
    const result = await buildSimulatedSells([], makeConverter({}), date, 'DKK');
    expect(result.transactions).toHaveLength(0);
    expect(result.unpricedAssets).toHaveLength(0);
  });

  it('creates a sell transaction with correct fiatValue', async () => {
    const converter = makeConverter({ BTC: 400000 });
    const holdings = [{ asset: 'BTC', totalAmount: bn(0.5) }];

    const result = await buildSimulatedSells(holdings, converter, date, 'DKK');

    expect(result.transactions).toHaveLength(1);
    expect(result.unpricedAssets).toHaveLength(0);

    const tx = result.transactions[0];
    expect(tx.type).toBe('sell');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount?.toNumber()).toBe(0.5);
    expect(tx.fiatValue!.toNumber()).toBe(200000); // 0.5 * 400000
    expect(tx.fiatCurrency).toBe('DKK');
    expect(tx.date).toEqual(date);
    expect(tx.id).toBe('sim-sell-BTC');
  });

  it('handles multiple assets independently', async () => {
    const converter = makeConverter({ BTC: 400000, ETH: 20000 });
    const holdings = [
      { asset: 'BTC', totalAmount: bn(1) },
      { asset: 'ETH', totalAmount: bn(2) },
    ];

    const result = await buildSimulatedSells(holdings, converter, date, 'DKK');

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].fromAsset).toBe('BTC');
    expect(result.transactions[0].fiatValue!.toNumber()).toBe(400000);
    expect(result.transactions[1].fromAsset).toBe('ETH');
    expect(result.transactions[1].fiatValue!.toNumber()).toBe(40000);
  });

  it('adds asset to unpricedAssets when converter throws', async () => {
    const converter = makeConverter({ ETH: 20000 }); // BTC has no rate
    const holdings = [
      { asset: 'BTC', totalAmount: bn(1) },
      { asset: 'ETH', totalAmount: bn(1) },
    ];

    const result = await buildSimulatedSells(holdings, converter, date, 'DKK');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].fromAsset).toBe('ETH');
    expect(result.unpricedAssets).toEqual(['BTC']);
  });

  it('adds asset to unpricedAssets when converter returns zero', async () => {
    const converter = makeConverter({ BTC: 0 });
    const holdings = [{ asset: 'BTC', totalAmount: bn(1) }];

    const result = await buildSimulatedSells(holdings, converter, date, 'DKK');

    expect(result.transactions).toHaveLength(0);
    expect(result.unpricedAssets).toEqual(['BTC']);
  });

  it('skips holdings with zero or negative amount', async () => {
    const converter = makeConverter({ BTC: 400000 });
    const holdings = [{ asset: 'BTC', totalAmount: bn(0) }];

    const result = await buildSimulatedSells(holdings, converter, date, 'DKK');

    expect(result.transactions).toHaveLength(0);
    expect(result.unpricedAssets).toHaveLength(0);
  });

  it('uses the provided fiat currency and date', async () => {
    const getRate = vi.fn(async () => bn(50000));
    const converter: ICryptoToFiatConverter = { getRate };
    const holdings = [{ asset: 'BTC', totalAmount: bn(1) }];
    const simDate = new Date('2024-12-31T00:00:00Z');

    await buildSimulatedSells(holdings, converter, simDate, 'EUR');

    expect(getRate).toHaveBeenCalledWith('BTC', 'EUR', simDate);
  });
});
