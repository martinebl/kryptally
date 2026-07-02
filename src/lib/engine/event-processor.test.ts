import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { processTransaction } from '$lib/engine/event-processor';
import { LotTracker } from '$lib/engine/lot-tracker';
import type { Transaction } from '$lib/types/transaction';
import type { TaxRules } from '$lib/types/tax-rules';
import dkRules from '$lib/rules/dk/dk-2024.json';

const bn = (n: number) => new BigNumber(n);
const rules = dkRules as TaxRules;

const makeTx = (overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'date'>): Transaction => ({
  fiatCurrency: 'DKK',
  fiatValue: bn(0),
  ...overrides,
});

describe('processTransaction', () => {
  describe('buy', () => {
    it('adds a lot and returns no event', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const events = processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        rules,
        tracker,
      );

      expect(events).toHaveLength(0);
      expect(tracker.getLots('BTC')).toHaveLength(1);
      expect(tracker.getLots('BTC')[0].costBasisPerUnit.toNumber()).toBe(100000);
    });
  });

  describe('sell', () => {
    it('returns a disposal event with correct gain', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(2), fiatValue: bn(200000) }),
        rules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
        rules, tracker,
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('disposal');
      expect(events[0].proceeds.toNumber()).toBe(150000);
      expect(events[0].costBasis.toNumber()).toBe(100000);
      expect(events[0].gainLoss.toNumber()).toBe(50000);
    });

    it('returns a disposal event with correct loss', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        rules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(60000) }),
        rules, tracker,
      );

      expect(events[0].gainLoss.toNumber()).toBe(-40000);
    });
  });

  describe('income (mining, staking, airdrop)', () => {
    it('returns an income event and adds a lot for mining', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const events = processTransaction(
        makeTx({ id: 'mine-1', type: 'mining', date: new Date('2024-03-01'), toAsset: 'BTC', toAmount: bn(0.1), fiatValue: bn(50000) }),
        rules, tracker,
      );

      expect(events[0].type).toBe('income');
      expect(events[0].proceeds.toNumber()).toBe(50000);

      const lots = tracker.getLots('BTC');
      expect(lots).toHaveLength(1);
      expect(lots[0].costBasisPerUnit.toNumber()).toBe(500000);
    });

    it('returns income events for staking and airdrops', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const stakeEvents = processTransaction(
        makeTx({ id: 'stake-1', type: 'staking', date: new Date('2024-03-01'), toAsset: 'ETH', toAmount: bn(1), fiatValue: bn(20000) }),
        rules, tracker,
      );
      const airdropEvents = processTransaction(
        makeTx({ id: 'airdrop-1', type: 'airdrop', date: new Date('2024-04-01'), toAsset: 'TOKEN', toAmount: bn(100), fiatValue: bn(5000) }),
        rules, tracker,
      );

      expect(stakeEvents[0].type).toBe('income');
      expect(airdropEvents[0].type).toBe('income');
      expect(stakeEvents[0].proceeds.toNumber()).toBe(20000);
      expect(airdropEvents[0].proceeds.toNumber()).toBe(5000);
    });
  });

  describe('trade', () => {
    it('creates a disposal and adds the received asset as a lot', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        rules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'trade-1', type: 'trade', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(0.5), toAsset: 'ETH', toAmount: bn(8), fiatValue: bn(75000) }),
        rules, tracker,
      );

      expect(events[0].gainLoss.toNumber()).toBe(25000);
      expect(tracker.getLots('ETH')).toHaveLength(1);
      expect(tracker.getLots('ETH')[0].amount.toNumber()).toBe(8);
    });

    it('skips disposal when cryptoToCryptoTaxable is false', () => {
      const noTradeRules: TaxRules = { ...rules, cryptoToCryptoTaxable: false };
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        noTradeRules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'trade-1', type: 'trade', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(0.5), toAsset: 'ETH', toAmount: bn(8), fiatValue: bn(75000) }),
        noTradeRules, tracker,
      );

      expect(events).toHaveLength(0);
    });
  });

  describe('holding period', () => {
    it('classifies long-term holds when enabled', () => {
      const longTermRules: TaxRules = {
        ...rules,
        holdingPeriod: { enabled: true, thresholdDays: 365, exemptFromTax: false },
      };
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2023-01-01'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        longTermRules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
        longTermRules, tracker,
      );

      expect(events[0].isLongTerm).toBe(true);
      expect(events[0].holdingDays).toBeGreaterThanOrEqual(365);
    });

    it('splits a disposal into per-lot events when lots have mixed holding status', () => {
      const longTermRules: TaxRules = {
        ...rules,
        holdingPeriod: { enabled: true, thresholdDays: 1095, exemptFromTax: true },
      };
      const tracker = new LotTracker(rules.costBasis.default);

      // Lot 1: bought 5 years ago (long-term, exceeds 3-year threshold)
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2019-06-15'), toAsset: 'BTC', toAmount: bn(0.5), fiatValue: bn(25000) }),
        longTermRules, tracker,
      );
      // Lot 2: bought 1 year ago (short-term)
      processTransaction(
        makeTx({ id: 'buy-2', type: 'buy', date: new Date('2023-06-15'), toAsset: 'BTC', toAmount: bn(0.5), fiatValue: bn(75000) }),
        longTermRules, tracker,
      );

      // Sell 1 BTC — spans both lots
      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(200000) }),
        longTermRules, tracker,
      );

      expect(events).toHaveLength(2);

      // FIFO: old lot consumed first
      const longTermEvent = events[0];
      expect(longTermEvent.isLongTerm).toBe(true);
      expect(longTermEvent.amount.toNumber()).toBe(0.5);
      expect(longTermEvent.costBasis.toNumber()).toBe(25000);
      // Proceeds allocated proportionally: 0.5/1 * 200000 = 100000
      expect(longTermEvent.proceeds.toNumber()).toBe(100000);
      expect(longTermEvent.gainLoss.toNumber()).toBe(75000);

      const shortTermEvent = events[1];
      expect(shortTermEvent.isLongTerm).toBe(false);
      expect(shortTermEvent.amount.toNumber()).toBe(0.5);
      expect(shortTermEvent.costBasis.toNumber()).toBe(75000);
      expect(shortTermEvent.proceeds.toNumber()).toBe(100000);
      expect(shortTermEvent.gainLoss.toNumber()).toBe(25000);
    });

    it('returns a per-lot event when all lots have the same holding status', () => {
      const longTermRules: TaxRules = {
        ...rules,
        holdingPeriod: { enabled: true, thresholdDays: 365, exemptFromTax: false },
      };
      const tracker = new LotTracker(rules.costBasis.default);

      // Both lots are short-term
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-01'), toAsset: 'BTC', toAmount: bn(0.5), fiatValue: bn(25000) }),
        longTermRules, tracker,
      );
      processTransaction(
        makeTx({ id: 'buy-2', type: 'buy', date: new Date('2024-03-01'), toAsset: 'BTC', toAmount: bn(0.5), fiatValue: bn(35000) }),
        longTermRules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(100000) }),
        longTermRules, tracker,
      );

      expect(events).toHaveLength(2);
      expect(events[0].isLongTerm).toBe(false);
      expect(events[1].isLongTerm).toBe(false);
      expect(events[0].costBasis.toNumber()).toBe(25000);
      expect(events[1].costBasis.toNumber()).toBe(35000);
      expect(events[0].proceeds.toNumber()).toBe(50000);
      expect(events[1].proceeds.toNumber()).toBe(50000);
    });
  });

  describe('transfer', () => {
    it('is a no-op for lot tracking — inbound transfers do not add a new lot', () => {
      const tracker = new LotTracker(rules.costBasis.default);

      // Buy TRX
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-01'), toAsset: 'TRX', toAmount: bn(8465), fiatValue: bn(500) }),
        rules, tracker,
      );

      // Transfer out to external wallet
      processTransaction(
        makeTx({ id: 'send-1', type: 'transfer', date: new Date('2024-02-01'), fromAsset: 'TRX', fromAmount: bn(8465) }),
        rules, tracker,
      );

      // Transfer back in (slightly less due to network fee)
      processTransaction(
        makeTx({ id: 'recv-1', type: 'transfer', date: new Date('2024-02-15'), toAsset: 'TRX', toAmount: bn(8461) }),
        rules, tracker,
      );

      // Should still have only the original lot — inbound transfer must not create a duplicate
      expect(tracker.getLots('TRX')).toHaveLength(1);
      expect(tracker.getLots('TRX')[0].amount.toNumber()).toBe(8465);
    });

    it('returns no tax events for transfers', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const outEvents = processTransaction(
        makeTx({ id: 'send-1', type: 'transfer', date: new Date('2024-01-01'), fromAsset: 'BTC', fromAmount: bn(1) }),
        rules, tracker,
      );
      const inEvents = processTransaction(
        makeTx({ id: 'recv-1', type: 'transfer', date: new Date('2024-01-02'), toAsset: 'BTC', toAmount: bn(1) }),
        rules, tracker,
      );

      expect(outEvents).toHaveLength(0);
      expect(inEvents).toHaveLength(0);
    });
  });

  describe('lot usages', () => {
    it('attaches lot usages to a single-lot disposal event', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(2), fiatValue: bn(200000) }),
        rules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
        rules, tracker,
      );

      expect(events[0].lots).toHaveLength(1);
      expect(events[0].lots[0].amountUsed.toNumber()).toBe(1);
      expect(events[0].lots[0].lot.costBasisPerUnit.toNumber()).toBe(100000);
      expect(events[0].lots[0].holdingDays).toBeGreaterThan(0);
      expect(events[0].lots[0].isLongTerm).toBe(false);
    });

    it('attaches all lot usages to an aggregated multi-lot disposal event', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-10'), toAsset: 'ETH', toAmount: bn(1), fiatValue: bn(20000) }),
        rules, tracker,
      );
      processTransaction(
        makeTx({ id: 'buy-2', type: 'buy', date: new Date('2024-02-10'), toAsset: 'ETH', toAmount: bn(1), fiatValue: bn(25000) }),
        rules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-08-01'), fromAsset: 'ETH', fromAmount: bn(2), fiatValue: bn(60000) }),
        rules, tracker,
      );

      expect(events).toHaveLength(1);
      expect(events[0].lots).toHaveLength(2);
      expect(events[0].lots[0].amountUsed.toNumber()).toBe(1);
      expect(events[0].lots[1].amountUsed.toNumber()).toBe(1);
    });

    it('marks partial lot consumption correctly', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-10'), toAsset: 'ETH', toAmount: bn(5), fiatValue: bn(50000) }),
        rules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-01'), fromAsset: 'ETH', fromAmount: bn(2), fiatValue: bn(25000) }),
        rules, tracker,
      );

      expect(events[0].lots).toHaveLength(1);
      expect(events[0].lots[0].amountUsed.toNumber()).toBe(2);
      expect(events[0].lots[0].lot.amount.toNumber()).toBe(5);
    });

    it('attaches empty lots to income events', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const events = processTransaction(
        makeTx({ id: 'mine-1', type: 'mining', date: new Date('2024-03-01'), toAsset: 'BTC', toAmount: bn(0.1), fiatValue: bn(50000) }),
        rules, tracker,
      );

      expect(events[0].lots).toHaveLength(0);
    });

    it('attaches one lot per per-lot event when holding period splits disposal', () => {
      const longTermRules: TaxRules = {
        ...rules,
        holdingPeriod: { enabled: true, thresholdDays: 1095, exemptFromTax: true },
      };
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2019-06-15'), toAsset: 'BTC', toAmount: bn(0.5), fiatValue: bn(25000) }),
        longTermRules, tracker,
      );
      processTransaction(
        makeTx({ id: 'buy-2', type: 'buy', date: new Date('2023-06-15'), toAsset: 'BTC', toAmount: bn(0.5), fiatValue: bn(75000) }),
        longTermRules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(200000) }),
        longTermRules, tracker,
      );

      expect(events).toHaveLength(2);
      expect(events[0].lots).toHaveLength(1);
      expect(events[0].lots[0].isLongTerm).toBe(true);
      expect(events[1].lots).toHaveLength(1);
      expect(events[1].lots[0].isLongTerm).toBe(false);
    });
  });

  describe('fee', () => {
    it('creates a disposal event for fees paid in crypto', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        rules, tracker,
      );

      const events = processTransaction(
        makeTx({ id: 'fee-1', type: 'fee', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(0.001), fiatValue: bn(150) }),
        rules, tracker,
      );

      expect(events[0].type).toBe('disposal');
      expect(events[0].amount.toNumber()).toBe(0.001);
      expect(events[0].proceeds.toNumber()).toBe(150);
    });
  });
});