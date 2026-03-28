import BigNumber from 'bignumber.js';
import type { TaxBracket, IncomeType } from '$lib/types/tax-rules';

const ZERO = new BigNumber(0);

export const applyBrackets = (amount: BigNumber, brackets: TaxBracket[]): BigNumber =>
  brackets.reduce((tax, bracket) => {
    const floor = new BigNumber(bracket.min);
    const ceiling = bracket.max !== null ? new BigNumber(bracket.max) : amount;
    const taxable = BigNumber.min(amount, ceiling).minus(floor);
    return taxable.gt(0) ? tax.plus(taxable.times(bracket.rate)) : tax;
  }, ZERO);

export const applyContributionsAndBrackets = (
  incomeType: IncomeType,
  amount: BigNumber,
): BigNumber => {
  if (amount.lte(0)) return ZERO;

  const contributions = incomeType.contributions ?? [];

  const preGrossTotal = contributions
    .filter((c) => c.appliesToGross)
    .reduce((sum, c) => sum.plus(amount.times(c.rate)), ZERO);

  const taxableAmount = amount.minus(preGrossTotal);
  const bracketTax = applyBrackets(taxableAmount, incomeType.brackets);

  const postGrossTotal = contributions
    .filter((c) => !c.appliesToGross)
    .reduce((sum, c) => sum.plus(amount.times(c.rate)), ZERO);

  return preGrossTotal.plus(bracketTax).plus(postGrossTotal);
};

export interface LossResult {
  tax: BigNumber;
  carryForward: BigNumber;
}

export const computeDisposalTax = (
  incomeType: IncomeType,
  totalGains: BigNumber,
  totalLosses: BigNumber,
): LossResult => {
  const { lossRules } = incomeType;

  if (lossRules.offsetAgainstGains) {
    // Net gains and losses first, then tax the result
    const net = totalGains.minus(totalLosses);
    if (net.gte(0)) {
      return { tax: applyContributionsAndBrackets(incomeType, net), carryForward: ZERO };
    }
    // Net is negative (more losses than gains)
    const absNet = net.abs();
    const credit = lossRules.deductible && lossRules.effectiveRate != null
      ? absNet.times(lossRules.effectiveRate)
      : ZERO;
    const carryForward = lossRules.carryForward
      ? (lossRules.deductible ? ZERO : absNet)
      : ZERO;
    return { tax: credit.gt(0) ? credit.negated() : ZERO, carryForward };
  }

  // offsetAgainstGains is false — tax gains and losses separately
  const taxOnGains = applyContributionsAndBrackets(incomeType, totalGains);
  const lossCredit = lossRules.deductible && lossRules.effectiveRate != null
    ? totalLosses.times(lossRules.effectiveRate)
    : ZERO;
  const carryForward = lossRules.carryForward && !lossRules.deductible
    ? totalLosses
    : ZERO;

  return { tax: taxOnGains.minus(lossCredit), carryForward };
};