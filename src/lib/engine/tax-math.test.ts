import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { applyBrackets, applyContributionsAndBrackets, computeDisposalTax } from '$lib/engine/tax-math';
import type { IncomeType, TaxBracket } from '$lib/types/tax-rules';
import type { TaxRules } from '$lib/types/tax-rules';
import dkRules from '$lib/rules/dk/dk-2024.json';

const bn = (n: number) => new BigNumber(n);
const rules = dkRules as TaxRules;
const kapital = rules.incomeTypes[0]; // Personlig indkomst (spekulation)
const personal = rules.incomeTypes[1]; // Personlig indkomst (erhverv)

describe('applyBrackets', () => {
  const brackets: TaxBracket[] = [
    { min: 0, max: 49700, rate: 0 },
    { min: 49700, max: 600000, rate: 0.37 },
    { min: 600000, max: null, rate: 0.42 },
  ];

  it('returns zero when amount is within the zero-rate bracket', () => {
    expect(applyBrackets(bn(30000), brackets).toNumber()).toBe(0);
  });

  it('applies the correct rate to the portion above the zero bracket', () => {
    // 100000: 0–49700 at 0%, 49700–100000 at 37% = 50300 * 0.37 = 18611
    expect(applyBrackets(bn(100000), brackets).toNumber()).toBe(18611);
  });

  it('applies multiple brackets for large amounts', () => {
    // 700000: 0–49700 at 0%, 49700–600000 at 37%, 600000–700000 at 42%
    // = 0 + 550300 * 0.37 + 100000 * 0.42 = 203611 + 42000 = 245611
    expect(applyBrackets(bn(700000), brackets).toNumber()).toBe(245611);
  });
});

describe('applyContributionsAndBrackets', () => {
  it('applies brackets without contributions for kapitalindkomst', () => {
    expect(applyContributionsAndBrackets(kapital, bn(100000)).toNumber()).toBe(18611);
  });

  it('returns zero for zero or negative amounts', () => {
    expect(applyContributionsAndBrackets(kapital, bn(0)).toNumber()).toBe(0);
    expect(applyContributionsAndBrackets(kapital, bn(-5000)).toNumber()).toBe(0);
  });

  it('applies AM-bidrag before brackets for personal income', () => {
    // 100000 income, AM-bidrag 8% = 8000
    // Taxable: 92000, brackets: 0–49700 at 0%, 49700–92000 at 37% = 42300 * 0.37 = 15651
    // Total: 8000 + 15651 = 23651
    expect(applyContributionsAndBrackets(personal, bn(100000)).toNumber()).toBe(23651);
  });

  it('applies post-bracket contributions on top of bracket tax', () => {
    const withPostContribution: IncomeType = {
      ...kapital,
      contributions: [
        { name: 'Post-fee', rate: 0.05, appliesToGross: false },
      ],
    };
    // 100000 income, no pre-gross contributions
    // Bracket tax: 0–49700 at 0%, 49700–100000 at 37% = 18611
    // Post-fee: 100000 * 0.05 = 5000
    // Total: 18611 + 5000 = 23611
    expect(applyContributionsAndBrackets(withPostContribution, bn(100000)).toNumber()).toBe(23611);
  });

  it('applies both pre- and post-bracket contributions', () => {
    const withBoth: IncomeType = {
      ...kapital,
      contributions: [
        { name: 'Pre-deduct', rate: 0.08, appliesToGross: true },
        { name: 'Post-fee', rate: 0.05, appliesToGross: false },
      ],
    };
    // 100000 income
    // Pre-deduct: 100000 * 0.08 = 8000, taxable: 92000
    // Bracket tax: 0–49700 at 0%, 49700–92000 at 37% = 42300 * 0.37 = 15651
    // Post-fee: 100000 * 0.05 = 5000
    // Total: 8000 + 15651 + 5000 = 28651
    expect(applyContributionsAndBrackets(withBoth, bn(100000)).toNumber()).toBe(28651);
  });
});

describe('computeDisposalTax', () => {
  describe('when offsetAgainstGains is true (DK default)', () => {
    it('nets gains and losses, taxes the net at brackets', () => {
      // 50000 gain - 20000 loss = 30000 net → within zero bracket
      const result = computeDisposalTax(kapital, bn(50000), bn(20000));
      expect(result.tax.toNumber()).toBe(0);
      expect(result.carryForward.toNumber()).toBe(0);
    });

    it('applies effectiveRate when net is negative', () => {
      // 0 gains - 40000 losses = -40000 net
      // deductible at effectiveRate 0.26 → -10400
      const result = computeDisposalTax(kapital, bn(0), bn(40000));
      expect(result.tax.toNumber()).toBe(-10400);
      expect(result.carryForward.toNumber()).toBe(0);
    });

    it('carries forward losses when carryForward is true and not deductible', () => {
      const nonDeductible: IncomeType = {
        ...kapital,
        lossRules: {
          ...kapital.lossRules,
          deductible: false,
          carryForward: true,
        },
      };
      const result = computeDisposalTax(nonDeductible, bn(0), bn(40000));
      expect(result.tax.toNumber()).toBe(0);
      expect(result.carryForward.toNumber()).toBe(40000);
    });
  });

  describe('when offsetAgainstGains is false', () => {
    const noOffset: IncomeType = {
      ...kapital,
      lossRules: { ...kapital.lossRules, offsetAgainstGains: false },
    };

    it('taxes gains at brackets and losses at effectiveRate separately', () => {
      // Gains: 50000 → bracket tax: 49700 at 0%, 300 at 37% = 111
      // Losses: 20000 → credit: 20000 * 0.26 = 5200
      // Net tax: 111 - 5200 = -5089
      const result = computeDisposalTax(noOffset, bn(50000), bn(20000));
      expect(result.tax.toNumber()).toBe(-5089);
    });

    it('carries forward losses when carryForward is true and not deductible', () => {
      const noOffsetCarry: IncomeType = {
        ...kapital,
        lossRules: {
          ...kapital.lossRules,
          offsetAgainstGains: false,
          deductible: false,
          carryForward: true,
        },
      };
      const result = computeDisposalTax(noOffsetCarry, bn(0), bn(40000));
      expect(result.tax.toNumber()).toBe(0);
      expect(result.carryForward.toNumber()).toBe(40000);
    });
  });
});