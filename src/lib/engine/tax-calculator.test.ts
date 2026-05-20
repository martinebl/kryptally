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
});
