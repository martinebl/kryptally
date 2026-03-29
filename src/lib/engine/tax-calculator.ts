import BigNumber from 'bignumber.js';
import type { Transaction } from '$lib/types/transaction';
import type { TaxRules, IncomeType, TaxableEventType } from '$lib/types/tax-rules';
import type { ILotTracker, TaxableEvent, TaxSummary, ITaxCalculator } from '$lib/types/results';
import { processTransaction, transactionTypeToTaxEvent } from '$lib/engine/event-processor';
import { applyContributionsAndBrackets, computeDisposalTax } from '$lib/engine/tax-math';

const ZERO = new BigNumber(0);

const findIncomeType = (rules: TaxRules, eventType: TaxableEventType): IncomeType | undefined =>
  rules.incomeTypes.find((it) => it.events.includes(eventType));

export class TaxCalculator implements ITaxCalculator {
  constructor(
    private readonly rules: TaxRules,
    private readonly lotTracker: ILotTracker,
  ) {}

  process(transactions: Transaction[]): TaxSummary {
    const sorted = [...transactions].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    // Phase 1: convert transactions → taxable events
    const events: TaxableEvent[] = [];
    let incomeFromMining = ZERO;
    let incomeFromStaking = ZERO;
    let incomeFromAirdrops = ZERO;

    for (const tx of sorted) {
      const event = processTransaction(tx, this.rules, this.lotTracker);
      if (event) {
        events.push(event);

        if (event.type === 'income') {
          switch (tx.type) {
            case 'mining': incomeFromMining = incomeFromMining.plus(event.proceeds); break;
            case 'staking': incomeFromStaking = incomeFromStaking.plus(event.proceeds); break;
            case 'airdrop': incomeFromAirdrops = incomeFromAirdrops.plus(event.proceeds); break;
          }
        }
      }
    }

    // Phase 2: aggregate totals
    const disposals = events.filter((e) => e.type === 'disposal');
    const isExempt = (e: TaxableEvent) =>
      e.type === 'disposal' && e.isLongTerm && this.rules.holdingPeriod.exemptFromTax;

    const taxableDisposals = disposals.filter((e) => !isExempt(e));

    const totalProceeds = disposals.reduce((sum, e) => sum.plus(e.proceeds), ZERO);
    const totalCostBasis = disposals.reduce((sum, e) => sum.plus(e.costBasis), ZERO);

    const totalGains = taxableDisposals
      .filter((e) => e.gainLoss.gt(0))
      .reduce((sum, e) => sum.plus(e.gainLoss), ZERO);

    const totalLosses = taxableDisposals
      .filter((e) => e.gainLoss.lt(0))
      .reduce((sum, e) => sum.plus(e.gainLoss.abs()), ZERO);

    const netGainLoss = totalGains.minus(totalLosses);
    const totalIncome = incomeFromMining.plus(incomeFromStaking).plus(incomeFromAirdrops);

    // Phase 3: estimate tax
    let estimatedTax = ZERO;
    let lossCarryForward = ZERO;

    const disposalIncomeType = findIncomeType(this.rules, transactionTypeToTaxEvent['sell']!);
    if (disposalIncomeType) {
      const result = computeDisposalTax(disposalIncomeType, totalGains, totalLosses);
      estimatedTax = estimatedTax.plus(result.tax);
      lossCarryForward = lossCarryForward.plus(result.carryForward);
    }

    const incomeIncomeType = findIncomeType(this.rules, transactionTypeToTaxEvent['mining']!);
    if (incomeIncomeType && totalIncome.gt(0)) {
      estimatedTax = estimatedTax.plus(applyContributionsAndBrackets(incomeIncomeType, totalIncome));
    }

    return {
      taxYear: this.rules.taxYear,
      currency: this.rules.currency,
      totalProceeds,
      totalCostBasis,
      totalGains,
      totalLosses,
      netGainLoss,
      incomeFromMining,
      incomeFromStaking,
      incomeFromAirdrops,
      totalIncome,
      estimatedTax,
      lossCarryForward,
      events,
    };
  }
}