import BigNumber from 'bignumber.js';
import type { Transaction } from '$lib/types/transaction';
import type { TaxRules, IncomeType, TaxableEventType, RulesResolver } from '$lib/types/tax-rules';
import type { ILotTracker, TaxableEvent, TaxSummary, ITaxCalculator } from '$lib/types/results';
import { processTransaction, transactionTypeToTaxEvent } from '$lib/engine/event-processor';
import { applyContributionsAndBrackets, computeDisposalTax } from '$lib/engine/tax-math';

const ZERO = new BigNumber(0);

const findIncomeType = (rules: TaxRules, eventType: TaxableEventType): IncomeType | undefined =>
  rules.incomeTypes.find((it) => it.events.includes(eventType));

interface YearlyIncome {
  mining: BigNumber;
  staking: BigNumber;
  airdrops: BigNumber;
}

const buildYearSummary = (
  year: number,
  currency: string,
  events: TaxableEvent[],
  income: YearlyIncome,
  rules: TaxRules,
): TaxSummary => {
  const disposals = events.filter((e) => e.type === 'disposal');
  const isExempt = (e: TaxableEvent) =>
    e.type === 'disposal' && e.isLongTerm && rules.holdingPeriod.exemptFromTax;

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
  const totalIncome = income.mining.plus(income.staking).plus(income.airdrops);

  let estimatedTax = ZERO;
  let lossCarryForward = ZERO;

  const disposalIncomeType = findIncomeType(rules, transactionTypeToTaxEvent['sell']!);
  if (disposalIncomeType) {
    const result = computeDisposalTax(disposalIncomeType, totalGains, totalLosses);
    estimatedTax = estimatedTax.plus(result.tax);
    lossCarryForward = lossCarryForward.plus(result.carryForward);
  }

  const incomeIncomeType = findIncomeType(rules, transactionTypeToTaxEvent['mining']!);
  if (incomeIncomeType && totalIncome.gt(0)) {
    estimatedTax = estimatedTax.plus(applyContributionsAndBrackets(incomeIncomeType, totalIncome));
  }

  return {
    taxYear: year,
    currency,
    totalProceeds,
    totalCostBasis,
    totalGains,
    totalLosses,
    netGainLoss,
    incomeFromMining: income.mining,
    incomeFromStaking: income.staking,
    incomeFromAirdrops: income.airdrops,
    totalIncome,
    estimatedTax,
    lossCarryForward,
    events,
  };
};

export class TaxCalculator implements ITaxCalculator {
  constructor(
    private readonly resolver: RulesResolver,
    private readonly currency: string,
    private readonly lotTracker: ILotTracker,
  ) {}

  process(transactions: Transaction[]): Map<number, TaxSummary> {
    const sorted = [...transactions].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    // Phase 1: produce events; accumulate per-year income buckets
    const allEvents: TaxableEvent[] = [];
    const yearlyIncome = new Map<number, YearlyIncome>();

    for (const tx of sorted) {
      const rules = this.resolver(tx.date);
      const txEvents = processTransaction(tx, rules, this.lotTracker);
      const year = tx.date.getUTCFullYear();

      if (!yearlyIncome.has(year)) {
        yearlyIncome.set(year, { mining: ZERO, staking: ZERO, airdrops: ZERO });
      }
      const inc = yearlyIncome.get(year)!;

      for (const event of txEvents) {
        allEvents.push(event);
        if (event.type === 'income') {
          switch (tx.type) {
            case 'mining':  inc.mining  = inc.mining.plus(event.proceeds);   break;
            case 'staking': inc.staking = inc.staking.plus(event.proceeds);  break;
            case 'airdrop': inc.airdrops = inc.airdrops.plus(event.proceeds); break;
          }
        }
      }
    }

    // Phase 2: group events by year
    const eventsByYear = new Map<number, TaxableEvent[]>();
    for (const event of allEvents) {
      const year = event.date.getUTCFullYear();
      if (!eventsByYear.has(year)) eventsByYear.set(year, []);
      eventsByYear.get(year)!.push(event);
    }

    // Phase 3: build per-year summaries
    const result = new Map<number, TaxSummary>();
    const allYears = new Set([...eventsByYear.keys(), ...yearlyIncome.keys()]);

    for (const year of allYears) {
      const rules = this.resolver(new Date(Date.UTC(year, 6, 1)));
      const events = eventsByYear.get(year) ?? [];
      const income = yearlyIncome.get(year) ?? { mining: ZERO, staking: ZERO, airdrops: ZERO };
      result.set(year, buildYearSummary(year, this.currency, events, income, rules));
    }

    return result;
  }
}
