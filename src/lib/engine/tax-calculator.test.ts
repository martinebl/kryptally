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

describe('TaxCalculator (orchestration)', () => {
  describe('summary aggregation', () => {
    it('aggregates totals across multiple events', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({ id: 'buy-1', type: 'buy', date: '2024-01-15', toAsset: 'BTC', toAmount: bn(3), fiatValue: bn(300000) }),
        makeTx({ id: 'sell-1', type: 'sell', date: '2024-04-15', fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
        makeTx({ id: 'sell-2', type: 'sell', date: '2024-07-15', fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(80000) }),
      ]);

      expect(summary.totalProceeds.toNumber()).toBe(230000);
      expect(summary.totalCostBasis.toNumber()).toBe(200000);
      expect(summary.totalGains.toNumber()).toBe(50000);
      expect(summary.totalLosses.toNumber()).toBe(20000);
      expect(summary.netGainLoss.toNumber()).toBe(30000);
    });

    it('tracks income by source', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({ id: 'mine-1', type: 'mining', date: '2024-03-01', toAsset: 'BTC', toAmount: bn(0.1), fiatValue: bn(50000) }),
        makeTx({ id: 'stake-1', type: 'staking', date: '2024-03-01', toAsset: 'ETH', toAmount: bn(1), fiatValue: bn(20000) }),
        makeTx({ id: 'airdrop-1', type: 'airdrop', date: '2024-04-01', toAsset: 'TOKEN', toAmount: bn(100), fiatValue: bn(5000) }),
      ]);

      expect(summary.incomeFromMining.toNumber()).toBe(50000);
      expect(summary.incomeFromStaking.toNumber()).toBe(20000);
      expect(summary.incomeFromAirdrops.toNumber()).toBe(5000);
      expect(summary.totalIncome.toNumber()).toBe(75000);
    });

    it('exempts long-term holds from gains when exemptFromTax is true', () => {
      const exemptRules: TaxRules = {
        ...rules,
        holdingPeriod: { enabled: true, thresholdDays: 365, exemptFromTax: true },
      };
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(exemptRules, tracker);

      const summary = calc.process([
        makeTx({ id: 'buy-1', type: 'buy', date: '2023-01-01', toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        makeTx({ id: 'sell-1', type: 'sell', date: '2024-06-15', fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
      ]);

      expect(summary.events[0].isLongTerm).toBe(true);
      expect(summary.totalGains.toNumber()).toBe(0);
    });
  });

  describe('tax estimation wiring', () => {
    it('combines disposal tax and income tax', () => {
      const tracker = new LotTracker(rules.costBasisMethod);
      const calc = new TaxCalculator(rules, tracker);

      const summary = calc.process([
        makeTx({ id: 'buy-1', type: 'buy', date: '2024-01-15', toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        makeTx({ id: 'sell-1', type: 'sell', date: '2024-06-15', fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(200000) }),
        makeTx({ id: 'mine-1', type: 'mining', date: '2024-03-01', toAsset: 'ETH', toAmount: bn(1), fiatValue: bn(100000) }),
      ]);

      // Disposal: gain 100000 → bracket tax 18611
      // Income: 100000 → AM-bidrag 8000 + bracket tax 15651 = 23651
      // Total: 18611 + 23651 = 42262
      expect(summary.estimatedTax.toNumber()).toBe(42262);
    });
  });
});