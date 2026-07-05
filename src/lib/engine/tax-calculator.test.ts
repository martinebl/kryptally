import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { TaxCalculator } from '$lib/engine/tax-calculator';
import { LotTracker } from '$lib/engine/lot-tracker';
import type { Transaction } from '$lib/types/transaction';
import type { TaxRules, RulesResolver } from '$lib/types/tax-rules';
import dkRules from '$lib/rules/dk/dk-2024.json';

const bn = (n: number) => new BigNumber(n);
const rules = dkRules as TaxRules;

/** Wraps a single TaxRules so it applies to all dates — for single-year tests. */
const staticResolver = (r: TaxRules): RulesResolver => () => r;

const makeTx = (overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'date'>): Transaction => ({
  fiatCurrency: 'DKK',
  fiatValue: bn(0),
  ...overrides,
});

describe('TaxCalculator (orchestration)', () => {
  describe('summary aggregation', () => {
    it('aggregates totals across multiple events', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const calc = new TaxCalculator(staticResolver(rules), rules.currency, tracker);

      const summaries = calc.process([
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(3), fiatValue: bn(300000) }),
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-04-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
        makeTx({ id: 'sell-2', type: 'sell', date: new Date('2024-07-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(80000) }),
      ]);

      const summary = summaries.get(2024)!;
      expect(summary.totalProceeds.toNumber()).toBe(230000);
      expect(summary.totalCostBasis.toNumber()).toBe(200000);
      expect(summary.totalGains.toNumber()).toBe(50000);
      expect(summary.totalLosses.toNumber()).toBe(20000);
      expect(summary.netGainLoss.toNumber()).toBe(30000);
    });

    it('tracks income by source', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const calc = new TaxCalculator(staticResolver(rules), rules.currency, tracker);

      const summaries = calc.process([
        makeTx({ id: 'mine-1', type: 'mining', date: new Date('2024-03-01'), toAsset: 'BTC', toAmount: bn(0.1), fiatValue: bn(50000) }),
        makeTx({ id: 'stake-1', type: 'staking', date: new Date('2024-03-01'), toAsset: 'ETH', toAmount: bn(1), fiatValue: bn(20000) }),
        makeTx({ id: 'airdrop-1', type: 'airdrop', date: new Date('2024-04-01'), toAsset: 'TOKEN', toAmount: bn(100), fiatValue: bn(5000) }),
      ]);

      const summary = summaries.get(2024)!;
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
      const tracker = new LotTracker(rules.costBasis.default);
      const calc = new TaxCalculator(staticResolver(exemptRules), rules.currency, tracker);

      const summaries = calc.process([
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2023-01-01'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(150000) }),
      ]);

      const summary = summaries.get(2024)!;
      expect(summary.events[0].isLongTerm).toBe(true);
      expect(summary.totalGains.toNumber()).toBe(0);
    });
  });

  describe('tax estimation wiring', () => {
    it('combines disposal tax and income tax', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const calc = new TaxCalculator(staticResolver(rules), rules.currency, tracker);

      const summaries = calc.process([
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-15'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-15'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(200000) }),
        makeTx({ id: 'mine-1', type: 'mining', date: new Date('2024-03-01'), toAsset: 'ETH', toAmount: bn(1), fiatValue: bn(100000) }),
      ]);

      // Disposal: gain 100000 → bracket tax 18611
      // Income: 100000 → AM-bidrag 8000 + bracket tax 15651 = 23651
      // Total: 18611 + 23651 = 42262
      const summary = summaries.get(2024)!;
      expect(summary.estimatedTax.toNumber()).toBe(42262);
    });
  });

  describe('multi-year rules resolver', () => {
    it('applies different rules to disposals in different years', () => {
      const noHoldingPeriod: TaxRules = {
        ...rules,
        taxYear: 2024,
        holdingPeriod: { enabled: false, thresholdDays: 0, exemptFromTax: false },
      };
      const withHoldingPeriod: TaxRules = {
        ...rules,
        taxYear: 2025,
        holdingPeriod: { enabled: true, thresholdDays: 1095, exemptFromTax: true },
      };
      const sorted = [noHoldingPeriod, withHoldingPeriod];
      const resolver: RulesResolver = (date) => {
        const year = date.getFullYear();
        let best = sorted[0];
        for (const r of sorted) if (r.taxYear <= year) best = r;
        return best;
      };

      const tracker = new LotTracker(rules.costBasis.default);
      const calc = new TaxCalculator(resolver, rules.currency, tracker);

      const summaries = calc.process([
        // Buy in 2022 — creates a lot
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2022-01-01'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(100000) }),
        // Sell in 2024 — uses 2024 rules (no holding period), gain is taxable
        // Gain must exceed DK personfradrag (49700) to produce estimated tax > 0
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-06-01'), fromAsset: 'BTC', fromAmount: bn(0.5), fiatValue: bn(160000) }),
        // Buy more in 2024
        makeTx({ id: 'buy-2', type: 'buy', date: new Date('2024-12-01'), toAsset: 'ETH', toAmount: bn(5), fiatValue: bn(50000) }),
        // Sell ETH in 2025 after 1100+ days from buy-2? No, let's use a different asset held 3+ years
        // Sell remaining BTC in 2026 (4+ years from buy-1) — uses 2025 rules (holding period exempt)
        makeTx({ id: 'sell-2', type: 'sell', date: new Date('2026-03-01'), fromAsset: 'BTC', fromAmount: bn(0.5), fiatValue: bn(120000) }),
      ]);

      // 2024: sell 0.5 BTC at 160000, cost basis 50000 → gain 110000, taxable (above DK personfradrag)
      const s2024 = summaries.get(2024)!;
      expect(s2024.totalGains.toNumber()).toBe(110000);
      expect(s2024.estimatedTax.gt(0)).toBe(true);

      // 2026: sell 0.5 BTC at 120000, cost basis 50000 → held 4+ years → long-term exempt
      const s2026 = summaries.get(2026)!;
      expect(s2026.events[0].isLongTerm).toBe(true);
      expect(s2026.totalGains.toNumber()).toBe(0);
      expect(s2026.estimatedTax.toNumber()).toBe(0);
    });

    it('falls back to the earliest rules when disposal year predates all available rules', () => {
      const rules2024: TaxRules = {
        ...rules,
        taxYear: 2024,
        holdingPeriod: { enabled: false, thresholdDays: 0, exemptFromTax: false },
      };
      const resolver: RulesResolver = () => rules2024;

      const tracker = new LotTracker(rules.costBasis.default);
      const calc = new TaxCalculator(resolver, rules.currency, tracker);

      const summaries = calc.process([
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2020-06-01'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(50000) }),
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2021-06-01'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(80000) }),
      ]);

      // Should use 2024 rules (the only available) — no holding period, gain is taxable
      const s2021 = summaries.get(2021)!;
      expect(s2021.events[0].isLongTerm).toBe(false);
      expect(s2021.totalGains.toNumber()).toBe(30000);
    });
  });

  describe('year coverage', () => {
    it('emits a zero-event summary key for a year with only non-taxable transactions', () => {
      const tracker = new LotTracker(rules.costBasis.default);
      const calc = new TaxCalculator(staticResolver(rules), rules.currency, tracker);

      const summaries = calc.process([
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-02-10'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(50000) }),
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2025-04-01'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(80000) }),
      ]);

      expect(summaries.has(2024)).toBe(true);
      const s2024 = summaries.get(2024)!;
      expect(s2024.events).toHaveLength(0);
      expect(s2024.totalProceeds.toNumber()).toBe(0);
      expect(s2024.totalIncome.toNumber()).toBe(0);

      expect(summaries.has(2025)).toBe(true);
      expect(summaries.get(2025)!.events).toHaveLength(1);
    });
  });

  describe('cost-basis method selection', () => {
    // Two lots of the same asset bought at different prices, then a partial
    // disposal — this is the scenario where fifo/lifo/hifo/average actually
    // diverge. Regression guard for the home-page cost-basis picker: confirms
    // 'average' produces a correct, different result than 'fifo' through the
    // real TaxCalculator + LotTracker pipeline (not just LotTracker alone).
    const buildTransactions = (): Transaction[] => [
      makeTx({ id: 'buy-1', type: 'buy', date: new Date('2024-01-12'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(437000) }),
      makeTx({ id: 'buy-2', type: 'buy', date: new Date('2024-03-04'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(913000) }),
      makeTx({ id: 'sell-1', type: 'sell', date: new Date('2024-08-19'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(721000) }),
    ];

    it('fifo consumes the oldest lot\'s cost basis first', () => {
      const tracker = new LotTracker('fifo');
      const calc = new TaxCalculator(staticResolver(rules), rules.currency, tracker);
      const summary = calc.process(buildTransactions()).get(2024)!;

      expect(summary.totalCostBasis.toNumber()).toBe(437000);
      expect(summary.netGainLoss.toNumber()).toBe(284000);
    });

    it('average pools both lots into a single weighted cost per unit', () => {
      const tracker = new LotTracker('average');
      const calc = new TaxCalculator(staticResolver(rules), rules.currency, tracker);
      const summary = calc.process(buildTransactions()).get(2024)!;

      // (437000 + 913000) / 2 = 675000 average cost per BTC
      expect(summary.totalCostBasis.toNumber()).toBe(675000);
      expect(summary.netGainLoss.toNumber()).toBe(46000);
    });

    it('fifo and average yield different results for the same transactions', () => {
      const fifoSummary = new TaxCalculator(staticResolver(rules), rules.currency, new LotTracker('fifo'))
        .process(buildTransactions()).get(2024)!;
      const averageSummary = new TaxCalculator(staticResolver(rules), rules.currency, new LotTracker('average'))
        .process(buildTransactions()).get(2024)!;

      expect(fifoSummary.totalCostBasis.toNumber()).not.toBe(averageSummary.totalCostBasis.toNumber());
      expect(fifoSummary.netGainLoss.toNumber()).not.toBe(averageSummary.netGainLoss.toNumber());
    });

    it('averages by transaction date, not by import/array order — buys and sells bundled by exchange', () => {
      // Simulates importing all buys from one exchange's CSV (bundled together) and all
      // disposals from a second exchange's CSV, appended afterwards — i.e. the array itself
      // is NOT in chronological order. TaxCalculator must still sort by date internally before
      // touching LotTracker, so each disposal only ever averages the lots that existed at its
      // own transaction date.
      const tracker = new LotTracker('average');
      const calc = new TaxCalculator(staticResolver(rules), rules.currency, tracker);

      const transactions: Transaction[] = [
        // "Exchange A" import: all buys, bundled first in the array.
        makeTx({ id: 'buy-1', type: 'buy', date: new Date('2022-03-10'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(400000) }),
        makeTx({ id: 'buy-2', type: 'buy', date: new Date('2023-04-18'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(800000) }),
        makeTx({ id: 'buy-3', type: 'buy', date: new Date('2024-06-30'), toAsset: 'BTC', toAmount: bn(1), fiatValue: bn(1200000) }),
        // "Exchange B" import: both disposals, appended after — despite sell-1 and sell-2
        // both predating buy-3 (and sell-1 predating buy-2) chronologically.
        makeTx({ id: 'sell-1', type: 'sell', date: new Date('2022-11-05'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(600000) }),
        makeTx({ id: 'sell-2', type: 'sell', date: new Date('2023-12-01'), fromAsset: 'BTC', fromAmount: bn(1), fiatValue: bn(1000000) }),
      ];

      const summaries = calc.process(transactions);

      // sell-1 (Nov 2022) must only ever see buy-1 — buy-2/buy-3 don't exist yet at that
      // date, even though they appear earlier in the raw array.
      const y2022 = summaries.get(2022)!;
      expect(y2022.totalCostBasis.toNumber()).toBe(400000);
      expect(y2022.netGainLoss.toNumber()).toBe(200000);

      // sell-2 (Dec 2023) must only see buy-2 (buy-1 was fully consumed by sell-1, buy-3
      // hasn't happened yet). A naive array-order pool of all 3 buys would give a materially
      // different (and here, sign-flipping) result for sell-1.
      const y2023 = summaries.get(2023)!;
      expect(y2023.totalCostBasis.toNumber()).toBe(800000);
      expect(y2023.netGainLoss.toNumber()).toBe(200000);
    });
  });
});
