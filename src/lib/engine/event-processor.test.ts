import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { processTransaction } from '$lib/engine/event-processor';
import { LotTracker } from '$lib/engine/lot-tracker';
import type { Transaction } from '$lib/types/transaction';
import type { TaxRules } from '$lib/types/tax-rules';
import dkRules from '$lib/rules/dk-2024.json';

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
      const tracker = new LotTracker(rules.costBasisMethod);
      const event = processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        rules,
        tracker,
      );

      expect(event).toBeNull();
      expect(tracker.getLots('BTC')).toHaveLength(1);
      expect(tracker.getLots('BTC')[0].costBasisPerUnit.toNumber()).toBe(100000);
    });
  });

  describe('sell', () => {
    it('returns a disposal event with correct gain', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(2), fiatValue: bn(200000) }),
        rules, tracker,
      );

      const event = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
        rules, tracker,
      );

      expect(event).not.toBeNull();
      expect(event!.type).toBe('disposal');
      expect(event!.proceeds.toNumber()).toBe(150000);
      expect(event!.costBasis.toNumber()).toBe(100000);
      expect(event!.gainLoss.toNumber()).toBe(50000);
    });

    it('returns a disposal event with correct loss', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        rules, tracker,
      );

      const event = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(60000) }),
        rules, tracker,
      );

      expect(event!.gainLoss.toNumber()).toBe(-40000);
    });
  });

  describe('income (mining, staking, airdrop)', () => {
    it('returns an income event and adds a lot for mining', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const event = processTransaction(
        makeTx({ id: 'mine-1', type: 'mining', date: new Date('2024-03-01'), toAsset: 'BTC', toAmount: bn(0.1), fiatValue: bn(50000) }),
        rules, tracker,
      );

      expect(event!.type).toBe('income');
      expect(event!.proceeds.toNumber()).toBe(50000);

      const lots = tracker.getLots('BTC');
      expect(lots).toHaveLength(1);
      expect(lots[0].costBasisPerUnit.toNumber()).toBe(500000);
    });

    it('returns income events for staking and airdrops', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const stakeEvent = processTransaction(
        makeTx({ id: 'stake-1', type: 'staking', date: new Date('2024-03-01'), toAsset: 'ETH', toAmount: bn(1), fiatValue: bn(20000) }),
        rules, tracker,
      );
      const airdropEvent = processTransaction(
        makeTx({ id: 'airdrop-1', type: 'airdrop', date: new Date('2024-04-01'), toAsset: 'TOKEN', toAmount: bn(100), fiatValue: bn(5000) }),
        rules, tracker,
      );

      expect(stakeEvent!.type).toBe('income');
      expect(airdropEvent!.type).toBe('income');
      expect(stakeEvent!.proceeds.toNumber()).toBe(20000);
      expect(airdropEvent!.proceeds.toNumber()).toBe(5000);
    });
  });

  describe('trade', () => {
    it('creates a disposal and adds the received asset as a lot', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        rules, tracker,
      );

      const event = processTransaction(
        makeTx({ id: 'trade-1', type: 'trade', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(0.5), toAsset: 'ETH', toAmount: bn(8), fiatValue: bn(75000) }),
        rules, tracker,
      );

      expect(event!.gainLoss.toNumber()).toBe(25000);
      expect(tracker.getLots('ETH')).toHaveLength(1);
      expect(tracker.getLots('ETH')[0].amount.toNumber()).toBe(8);
    });

    it('skips disposal when cryptoToCryptoTaxable is false', () => {
      const noTradeRules: TaxRules = { ...rules, cryptoToCryptoTaxable: false };
      const tracker = new LotTracker(rules.costBasisMethod);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        noTradeRules, tracker,
      );

      const event = processTransaction(
        makeTx({ id: 'trade-1', type: 'trade', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(0.5), toAsset: 'ETH', toAmount: bn(8), fiatValue: bn(75000) }),
        noTradeRules, tracker,
      );

      expect(event).toBeNull();
    });
  });

  describe('holding period', () => {
    it('classifies long-term holds when enabled', () => {
      const longTermRules: TaxRules = {
        ...rules,
        holdingPeriod: { enabled: true, thresholdDays: 365, exemptFromTax: false },
      };
      const tracker = new LotTracker(rules.costBasisMethod);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2023-01-01'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        longTermRules, tracker,
      );

      const event = processTransaction(
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
        longTermRules, tracker,
      );

      expect(event!.isLongTerm).toBe(true);
      expect(event!.holdingDays).toBeGreaterThanOrEqual(365);
    });
  });

  describe('fee', () => {
    it('creates a disposal event for fees paid in crypto', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      processTransaction(
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        rules, tracker,
      );

      const event = processTransaction(
        makeTx({ id: 'fee-1', type: 'fee', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(0.001), fiatValue: bn(150) }),
        rules, tracker,
      );

      expect(event!.type).toBe('disposal');
      expect(event!.amount.toNumber()).toBe(0.001);
      expect(event!.proceeds.toNumber()).toBe(150);
    });
  });
});