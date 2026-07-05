import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { LotTracker } from '$lib/engine/lot-tracker';
import type { ILotTracker, LotRecord } from '$lib/types';

const makeLot = (
  asset: string,
  amount: number,
  costBasisPerUnit: number,
  dateAcquired: Date,
  source = 'test',
): LotRecord => ({
  asset,
  amount: new BigNumber(amount),
  costBasisPerUnit: new BigNumber(costBasisPerUnit),
  dateAcquired,
  source,
});

const bn = (n: number) => new BigNumber(n);

const seedTracker = (method: 'fifo' | 'lifo' | 'hifo' | 'average', lots: LotRecord[]): ILotTracker => {
  const tracker = new LotTracker(method);
  lots.forEach((lot) => tracker.addLot(lot));
  return tracker;
};

describe('LotTracker', () => {
  describe('getLots and getAssets', () => {
    it('returns empty array for unknown asset', () => {
      const tracker = new LotTracker('fifo');
      expect(tracker.getLots('ETH')).toEqual([]);
    });

    it('tracks multiple assets independently', () => {
      const tracker = seedTracker('fifo', [
        makeLot('BTC', 1, 50000, new Date('2024-01-01')),
        makeLot('ETH', 10, 3000, new Date('2024-01-01')),
      ]);

      expect(tracker.getAssets()).toEqual(['BTC', 'ETH']);
    });
  });

  describe('dispose — returns zero for unknown asset', () => {
    it('returns zero cost basis and no lots', () => {
      const tracker = new LotTracker('fifo');
      const result = tracker.dispose('BTC', bn(1));

      expect(result.costBasis.toNumber()).toBe(0);
      expect(result.lots).toEqual([]);
    });
  });

  describe('dispose — FIFO', () => {
    it('uses the oldest lot cost basis first', () => {
      const tracker = seedTracker('fifo', [
        makeLot('BTC', 1, 40000, new Date('2024-01-01'), 'old'),
        makeLot('BTC', 1, 60000, new Date('2024-06-01'), 'new'),
      ]);

      const result = tracker.dispose('BTC', bn(1));

      expect(result.costBasis.toNumber()).toBe(40000);
      expect(result.lots[0].lot.source).toBe('old');
    });

    it('spans multiple lots when amount exceeds first lot', () => {
      const tracker = seedTracker('fifo', [
        makeLot('BTC', 0.5, 40000, new Date('2024-01-01')),
        makeLot('BTC', 0.5, 60000, new Date('2024-06-01')),
      ]);

      const result = tracker.dispose('BTC', bn(0.75));

      // 0.5 * 40000 + 0.25 * 60000 = 35000
      expect(result.costBasis.toNumber()).toBe(35000);
      expect(result.lots).toHaveLength(2);
    });
  });

  describe('dispose — LIFO', () => {
    it('uses the newest lot cost basis first', () => {
      const tracker = seedTracker('lifo', [
        makeLot('BTC', 1, 40000, new Date('2024-01-01'), 'old'),
        makeLot('BTC', 1, 60000, new Date('2024-06-01'), 'new'),
      ]);

      const result = tracker.dispose('BTC', bn(1));

      expect(result.costBasis.toNumber()).toBe(60000);
      expect(result.lots[0].lot.source).toBe('new');
    });
  });

  describe('dispose — HIFO', () => {
    it('uses the highest cost lot first', () => {
      const tracker = seedTracker('hifo', [
        makeLot('BTC', 1, 40000, new Date('2024-01-01'), 'cheap'),
        makeLot('BTC', 1, 70000, new Date('2024-03-01'), 'expensive'),
        makeLot('BTC', 1, 55000, new Date('2024-06-01'), 'mid'),
      ]);

      const result = tracker.dispose('BTC', bn(1));

      expect(result.costBasis.toNumber()).toBe(70000);
      expect(result.lots[0].lot.source).toBe('expensive');
    });
  });

  describe('dispose — Average cost', () => {
    it('uses weighted average for equal lot sizes', () => {
      const tracker = seedTracker('average', [
        makeLot('BTC', 1, 40000, new Date('2024-01-01')),
        makeLot('BTC', 1, 60000, new Date('2024-06-01')),
      ]);

      // Average = (40000 + 60000) / 2 = 50000
      const result = tracker.dispose('BTC', bn(1));

      expect(result.costBasis.toNumber()).toBe(50000);
    });

    it('uses weighted average for unequal lot sizes', () => {
      const tracker = seedTracker('average', [
        makeLot('BTC', 3, 40000, new Date('2024-01-01')),
        makeLot('BTC', 1, 80000, new Date('2024-06-01')),
      ]);

      // Average = (3*40000 + 1*80000) / 4 = 50000 per unit
      const result = tracker.dispose('BTC', bn(2));

      expect(result.costBasis.toNumber()).toBe(100000);
    });

    it('recomputes the average at each disposal — a later purchase cannot affect an earlier sale', () => {
      // This is the "moving weighted average" interpretation: the average used by a
      // disposal only ever pools lots that existed at the time of that disposal, not
      // lots acquired afterwards. It must be distinguished from a "lifetime average"
      // (pooling every purchase ever made, regardless of when disposals happened),
      // which would give different numbers below.
      const tracker = new LotTracker('average');
      tracker.addLot(makeLot('BTC', 1, 40000, new Date('2024-01-01')));

      // Only one lot exists so far — average must equal its cost, not some future blend.
      const first = tracker.dispose('BTC', bn(0.5));
      expect(first.costBasis.toNumber()).toBe(20000); // 0.5 * 40000

      tracker.addLot(makeLot('BTC', 1, 100000, new Date('2024-03-01')));

      // Remaining 0.5 @ 40000 pools with the new 1 @ 100000:
      // (0.5*40000 + 1*100000) / 1.5 = 80000 per unit
      const second = tracker.dispose('BTC', bn(1));
      expect(second.costBasis.toNumber()).toBe(80000);

      // A lifetime average of every purchase ever made — (1*40000 + 1*100000) / 2 = 70000 —
      // would have produced 35000 and 70000 instead. Confirm we're not doing that.
      expect(first.costBasis.toNumber()).not.toBe(35000);
      expect(second.costBasis.toNumber()).not.toBe(70000);
    });
  });

  describe('getHoldings', () => {
    it('returns empty array for a fresh tracker', () => {
      const tracker = new LotTracker('fifo');
      expect(tracker.getHoldings()).toEqual([]);
    });

    it('returns total amount per asset across multiple lots', () => {
      const tracker = seedTracker('fifo', [
        makeLot('BTC', 0.5, 40000, new Date('2024-01-01')),
        makeLot('BTC', 1.5, 60000, new Date('2024-06-01')),
        makeLot('ETH', 10, 3000, new Date('2024-01-01')),
      ]);

      const holdings = tracker.getHoldings();
      expect(holdings).toHaveLength(2);

      const btc = holdings.find((h) => h.asset === 'BTC')!;
      expect(btc.totalAmount.toNumber()).toBe(2);

      const eth = holdings.find((h) => h.asset === 'ETH')!;
      expect(eth.totalAmount.toNumber()).toBe(10);
    });

    it('reflects remaining amounts after partial disposal', () => {
      const tracker = seedTracker('fifo', [
        makeLot('BTC', 2, 50000, new Date('2024-01-01')),
      ]);

      tracker.dispose('BTC', bn(0.75));

      const holdings = tracker.getHoldings();
      expect(holdings).toHaveLength(1);
      expect(holdings[0].totalAmount.toNumber()).toBe(1.25);
    });
  });

  describe('sequential disposals', () => {
    it('returns correct cost basis across multiple sells', () => {
      const tracker = seedTracker('fifo', [
        makeLot('BTC', 2, 40000, new Date('2024-01-01')),
        makeLot('BTC', 1, 60000, new Date('2024-06-01')),
      ]);

      const first = tracker.dispose('BTC', bn(1));
      expect(first.costBasis.toNumber()).toBe(40000);

      const second = tracker.dispose('BTC', bn(1.5));
      // 1 * 40000 + 0.5 * 60000 = 70000
      expect(second.costBasis.toNumber()).toBe(70000);
    });

    it('does not affect other assets', () => {
      const tracker = seedTracker('fifo', [
        makeLot('BTC', 1, 50000, new Date('2024-01-01')),
        makeLot('ETH', 5, 3000, new Date('2024-01-01')),
      ]);

      tracker.dispose('BTC', bn(1));

      const ethResult = tracker.dispose('ETH', bn(2));
      expect(ethResult.costBasis.toNumber()).toBe(6000);
    });
  });
});
