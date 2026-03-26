import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { LotTracker } from '$lib/engine/lot-tracker';
import type { LotRecord } from '$lib/types';

const makeLot = (
  asset: string,
  amount: number,
  costBasisPerUnit: number,
  dateAcquired: string,
  source = 'test',
): LotRecord => ({
  asset,
  amount: new BigNumber(amount),
  costBasisPerUnit: new BigNumber(costBasisPerUnit),
  dateAcquired,
  source,
});

describe('LotTracker', () => {
  describe('addLot and getLots', () => {
    it('stores and retrieves lots for an asset', () => {
      const tracker = new LotTracker('fifo');
      const lot = makeLot('BTC', 1, 50000, '2024-01-01');

      tracker.addLot(lot);
      const lots = tracker.getLots('BTC');

      expect(lots).toHaveLength(1);
      expect(lots[0].amount.toNumber()).toBe(1);
      expect(lots[0].costBasisPerUnit.toNumber()).toBe(50000);
    });

    it('returns empty array for unknown asset', () => {
      const tracker = new LotTracker('fifo');
      expect(tracker.getLots('ETH')).toEqual([]);
    });

    it('tracks multiple assets independently', () => {
      const tracker = new LotTracker('fifo');
      tracker.addLot(makeLot('BTC', 1, 50000, '2024-01-01'));
      tracker.addLot(makeLot('ETH', 10, 3000, '2024-01-01'));

      expect(tracker.getLots('BTC')).toHaveLength(1);
      expect(tracker.getLots('ETH')).toHaveLength(1);
      expect(tracker.getAssets()).toEqual(['BTC', 'ETH']);
    });

    it('getLots returns a snapshot that does not mutate internal state', () => {
      const tracker = new LotTracker('fifo');
      tracker.addLot(makeLot('BTC', 1, 50000, '2024-01-01'));

      const snapshot = tracker.getLots('BTC');
      snapshot[0].amount = new BigNumber(999);

      const fresh = tracker.getLots('BTC');
      expect(fresh[0].amount.toNumber()).toBe(1);
    });
  });

  describe('dispose — FIFO', () => {
    it('consumes the oldest lot first', () => {
      const tracker = new LotTracker('fifo');
      tracker.addLot(makeLot('BTC', 1, 40000, '2024-01-01', 'buy-1'));
      tracker.addLot(makeLot('BTC', 1, 60000, '2024-06-01', 'buy-2'));

      const result = tracker.dispose('BTC', new BigNumber(1));

      expect(result.costBasis.toNumber()).toBe(40000);
      expect(result.lots).toHaveLength(1);
      expect(result.lots[0].lot.source).toBe('buy-1');
      expect(result.lots[0].amountUsed.toNumber()).toBe(1);
    });

    it('consumes across multiple lots', () => {
      const tracker = new LotTracker('fifo');
      tracker.addLot(makeLot('BTC', 0.5, 40000, '2024-01-01', 'buy-1'));
      tracker.addLot(makeLot('BTC', 0.5, 60000, '2024-06-01', 'buy-2'));

      const result = tracker.dispose('BTC', new BigNumber(0.75));

      // 0.5 * 40000 + 0.25 * 60000 = 20000 + 15000 = 35000
      expect(result.costBasis.toNumber()).toBe(35000);
      expect(result.lots).toHaveLength(2);
    });

    it('removes fully consumed lots from inventory', () => {
      const tracker = new LotTracker('fifo');
      tracker.addLot(makeLot('BTC', 1, 40000, '2024-01-01'));
      tracker.addLot(makeLot('BTC', 1, 60000, '2024-06-01'));

      tracker.dispose('BTC', new BigNumber(1));
      const remaining = tracker.getLots('BTC');

      expect(remaining).toHaveLength(1);
      expect(remaining[0].costBasisPerUnit.toNumber()).toBe(60000);
    });

    it('partially consumes a lot and leaves the remainder', () => {
      const tracker = new LotTracker('fifo');
      tracker.addLot(makeLot('BTC', 2, 50000, '2024-01-01'));

      tracker.dispose('BTC', new BigNumber(0.5));
      const remaining = tracker.getLots('BTC');

      expect(remaining).toHaveLength(1);
      expect(remaining[0].amount.toNumber()).toBe(1.5);
    });

    it('returns zero cost basis for unknown asset', () => {
      const tracker = new LotTracker('fifo');
      const result = tracker.dispose('BTC', new BigNumber(1));

      expect(result.costBasis.toNumber()).toBe(0);
      expect(result.lots).toEqual([]);
    });
  });

  describe('dispose — LIFO', () => {
    it('consumes the newest lot first', () => {
      const tracker = new LotTracker('lifo');
      tracker.addLot(makeLot('BTC', 1, 40000, '2024-01-01', 'buy-1'));
      tracker.addLot(makeLot('BTC', 1, 60000, '2024-06-01', 'buy-2'));

      const result = tracker.dispose('BTC', new BigNumber(1));

      expect(result.costBasis.toNumber()).toBe(60000);
      expect(result.lots[0].lot.source).toBe('buy-2');
    });
  });

  describe('dispose — HIFO', () => {
    it('consumes the highest cost lot first', () => {
      const tracker = new LotTracker('hifo');
      tracker.addLot(makeLot('BTC', 1, 40000, '2024-01-01', 'cheap'));
      tracker.addLot(makeLot('BTC', 1, 70000, '2024-03-01', 'expensive'));
      tracker.addLot(makeLot('BTC', 1, 55000, '2024-06-01', 'mid'));

      const result = tracker.dispose('BTC', new BigNumber(1));

      expect(result.costBasis.toNumber()).toBe(70000);
      expect(result.lots[0].lot.source).toBe('expensive');
    });
  });

  describe('dispose — Average cost', () => {
    it('uses weighted average cost basis', () => {
      const tracker = new LotTracker('average');
      tracker.addLot(makeLot('BTC', 1, 40000, '2024-01-01'));
      tracker.addLot(makeLot('BTC', 1, 60000, '2024-06-01'));

      // Average cost = (40000 + 60000) / 2 = 50000
      const result = tracker.dispose('BTC', new BigNumber(1));

      expect(result.costBasis.toNumber()).toBe(50000);
    });

    it('calculates weighted average for unequal lot sizes', () => {
      const tracker = new LotTracker('average');
      tracker.addLot(makeLot('BTC', 3, 40000, '2024-01-01'));
      tracker.addLot(makeLot('BTC', 1, 80000, '2024-06-01'));

      // Average cost = (3*40000 + 1*80000) / 4 = 200000 / 4 = 50000
      const result = tracker.dispose('BTC', new BigNumber(2));

      expect(result.costBasis.toNumber()).toBe(100000);
    });
  });

  describe('multiple disposals', () => {
    it('tracks state correctly across sequential disposals', () => {
      const tracker = new LotTracker('fifo');
      tracker.addLot(makeLot('BTC', 2, 40000, '2024-01-01'));
      tracker.addLot(makeLot('BTC', 1, 60000, '2024-06-01'));

      const first = tracker.dispose('BTC', new BigNumber(1));
      expect(first.costBasis.toNumber()).toBe(40000);

      const second = tracker.dispose('BTC', new BigNumber(1.5));
      // 1 * 40000 + 0.5 * 60000 = 40000 + 30000 = 70000
      expect(second.costBasis.toNumber()).toBe(70000);

      const remaining = tracker.getLots('BTC');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].amount.toNumber()).toBe(0.5);
    });
  });
});
