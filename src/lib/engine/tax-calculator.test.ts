import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { TaxCalculator } from '$lib/engine/tax-calculator';
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

describe('TaxCalculator', () => {
  describe('buy transactions', () => {
    it('adds a lot but does not create a taxable event', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          fromAsset: 'DKK',
          fromAmount: bn(100000),
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
      ]);

      expect(summary.events).toHaveLength(0);
      expect(tracker.getLots('BTC')).toHaveLength(1);
      expect(tracker.getLots('BTC')[0].costBasisPerUnit.toNumber()).toBe(100000);
    });
  });

  describe('sell transactions', () => {
    it('creates a disposal event with correct gain', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          toAsset: 'BTC',
          toAmount: bn(2),
          fiatValue: bn(200000),
        }),
        makeTx({
          id: 'sell-1',
          type: 'sell',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(1),
          fiatValue: bn(150000),
        }),
      ]);

      expect(summary.events).toHaveLength(1);
      const event = summary.events[0];
      expect(event.type).toBe('disposal');
      expect(event.proceeds.toNumber()).toBe(150000);
      expect(event.costBasis.toNumber()).toBe(100000);
      expect(event.gainLoss.toNumber()).toBe(50000);
    });

    it('records a loss when sold below cost basis', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
        makeTx({
          id: 'sell-1',
          type: 'sell',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(1),
          fiatValue: bn(60000),
        }),
      ]);

      expect(summary.events[0].gainLoss.toNumber()).toBe(-40000);
      expect(summary.totalLosses.toNumber()).toBe(40000);
      expect(summary.totalGains.toNumber()).toBe(0);
    });
  });

  describe('income transactions', () => {
    it('creates an income event for mining and adds a lot', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'mine-1',
          type: 'mining',
          date: '2024-03-01',
          toAsset: 'BTC',
          toAmount: bn(0.1),
          fiatValue: bn(50000),
        }),
      ]);

      expect(summary.events).toHaveLength(1);
      expect(summary.events[0].type).toBe('income');
      expect(summary.events[0].proceeds.toNumber()).toBe(50000);
      expect(summary.incomeFromMining.toNumber()).toBe(50000);

      const lots = tracker.getLots('BTC');
      expect(lots).toHaveLength(1);
      expect(lots[0].costBasisPerUnit.toNumber()).toBe(500000); // 50000 / 0.1
    });

    it('tracks staking and airdrop income separately', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'stake-1',
          type: 'staking',
          date: '2024-03-01',
          toAsset: 'ETH',
          toAmount: bn(1),
          fiatValue: bn(20000),
        }),
        makeTx({
          id: 'airdrop-1',
          type: 'airdrop',
          date: '2024-04-01',
          toAsset: 'TOKEN',
          toAmount: bn(100),
          fiatValue: bn(5000),
        }),
      ]);

      expect(summary.incomeFromStaking.toNumber()).toBe(20000);
      expect(summary.incomeFromAirdrops.toNumber()).toBe(5000);
      expect(summary.totalIncome.toNumber()).toBe(25000);
    });
  });

  describe('crypto-to-crypto trades', () => {
    it('creates a disposal when cryptoToCryptoTaxable is true', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
        makeTx({
          id: 'trade-1',
          type: 'trade',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(0.5),
          toAsset: 'ETH',
          toAmount: bn(8),
          fiatValue: bn(75000),
        }),
      ]);

      expect(summary.events).toHaveLength(1);
      expect(summary.events[0].gainLoss.toNumber()).toBe(25000);

      const ethLots = tracker.getLots('ETH');
      expect(ethLots).toHaveLength(1);
      expect(ethLots[0].amount.toNumber()).toBe(8);
    });

    it('skips disposal when cryptoToCryptoTaxable is false', () => {
      const nonTaxableRules: TaxRules = { ...rules, cryptoToCryptoTaxable: false };
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(nonTaxableRules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
        makeTx({
          id: 'trade-1',
          type: 'trade',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(0.5),
          toAsset: 'ETH',
          toAmount: bn(8),
          fiatValue: bn(75000),
        }),
      ]);

      expect(summary.events).toHaveLength(0);
    });
  });

  describe('holding period', () => {
    it('classifies long-term holds when holding period is enabled', () => {
      const longTermRules: TaxRules = {
        ...rules,
        holdingPeriod: { enabled: true, thresholdDays: 365, exemptFromTax: false },
      };
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(longTermRules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2023-01-01',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
        makeTx({
          id: 'sell-1',
          type: 'sell',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(1),
          fiatValue: bn(150000),
        }),
      ]);

      expect(summary.events[0].isLongTerm).toBe(true);
      expect(summary.events[0].holdingDays).toBeGreaterThanOrEqual(365);
    });

    it('exempts long-term holds from tax when exemptFromTax is true', () => {
      const exemptRules: TaxRules = {
        ...rules,
        holdingPeriod: { enabled: true, thresholdDays: 365, exemptFromTax: true },
      };
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(exemptRules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2023-01-01',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
        makeTx({
          id: 'sell-1',
          type: 'sell',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(1),
          fiatValue: bn(150000),
        }),
      ]);

      expect(summary.events[0].isLongTerm).toBe(true);
      expect(summary.totalGains.toNumber()).toBe(0);
    });
  });

  describe('summary aggregation', () => {
    it('aggregates totals across multiple events', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          toAsset: 'BTC',
          toAmount: bn(3),
          fiatValue: bn(300000),
        }),
        makeTx({
          id: 'sell-1',
          type: 'sell',
          date: '2024-04-15',
          fromAsset: 'BTC',
          fromAmount: bn(1),
          fiatValue: bn(150000),
        }),
        makeTx({
          id: 'sell-2',
          type: 'sell',
          date: '2024-07-15',
          fromAsset: 'BTC',
          fromAmount: bn(1),
          fiatValue: bn(80000),
        }),
      ]);

      // sell-1: gain 50000, sell-2: loss 20000
      expect(summary.totalProceeds.toNumber()).toBe(230000);
      expect(summary.totalCostBasis.toNumber()).toBe(200000);
      expect(summary.totalGains.toNumber()).toBe(50000);
      expect(summary.totalLosses.toNumber()).toBe(20000);
      expect(summary.netGainLoss.toNumber()).toBe(30000);
    });
  });

  describe('tax estimation', () => {
    it('applies brackets to capital gains', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
        makeTx({
          id: 'sell-1',
          type: 'sell',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(1),
          fiatValue: bn(200000),
        }),
      ]);

      // Gain: 100000 DKK
      // Bracket 1: 0–49700 at 0% = 0
      // Bracket 2: 49700–100000 at 37% = 50300 * 0.37 = 18611
      expect(summary.estimatedTax.toNumber()).toBe(18611);
    });

    it('applies AM-bidrag before brackets for income', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'mine-1',
          type: 'mining',
          date: '2024-03-01',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
      ]);

      // Mining income: 100000 DKK
      // AM-bidrag: 100000 * 0.08 = 8000
      // Taxable after AM-bidrag: 92000
      // Bracket 1: 0–49700 at 0% = 0
      // Bracket 2: 49700–92000 at 37% = 42300 * 0.37 = 15651
      // Total: 8000 + 15651 = 23651
      expect(summary.estimatedTax.toNumber()).toBe(23651);
    });

    it('applies loss deduction at effective rate', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
        makeTx({
          id: 'sell-1',
          type: 'sell',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(1),
          fiatValue: bn(60000),
        }),
      ]);

      // Loss: 40000 DKK, effective rate 0.33
      // Tax credit: -40000 * 0.33 = -13200
      expect(summary.estimatedTax.toNumber()).toBe(-13200);
    });
  });

  describe('fee handling', () => {
    it('creates a disposal event for fees paid in crypto', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({
          id: 'buy-1',
          type: 'buy',
          date: '2024-01-15',
          toAsset: 'BTC',
          toAmount: bn(1),
          fiatValue: bn(100000),
        }),
        makeTx({
          id: 'fee-1',
          type: 'fee',
          date: '2024-06-15',
          fromAsset: 'BTC',
          fromAmount: bn(0.001),
          fiatValue: bn(150),
        }),
      ]);

      expect(summary.events).toHaveLength(1);
      expect(summary.events[0].type).toBe('disposal');
      expect(summary.events[0].amount.toNumber()).toBe(0.001);
      expect(summary.events[0].proceeds.toNumber()).toBe(150);
    });
  });
});
