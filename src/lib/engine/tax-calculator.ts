import BigNumber from 'bignumber.js';
import type { Transaction, TransactionType } from '$lib/types/transaction';
import type { TaxRules, TaxBracket, IncomeType, TaxableEventType } from '$lib/types/tax-rules';
import type { ILotTracker, TaxableEvent, TaxSummary, ITaxCalculator } from '$lib/types/results';

const ZERO = new BigNumber(0);

const daysBetween = (from: string, to: string): number =>
  Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));

const applyBrackets = (amount: BigNumber, brackets: TaxBracket[]): BigNumber =>
  brackets.reduce((tax, bracket) => {
    const floor = new BigNumber(bracket.min);
    const ceiling = bracket.max !== null ? new BigNumber(bracket.max) : amount;
    const taxable = BigNumber.min(amount, ceiling).minus(floor);
    return taxable.gt(0) ? tax.plus(taxable.times(bracket.rate)) : tax;
  }, ZERO);

const transactionTypeToTaxEvent: Partial<Record<TransactionType, TaxableEventType>> = {
  sell: 'sell',
  trade: 'trade',
  mining: 'mining',
  staking: 'staking',
  airdrop: 'airdrop',
  fee: 'fee',
};

const findIncomeType = (rules: TaxRules, eventType: TaxableEventType): IncomeType | undefined =>
  rules.incomeTypes.find((it) => it.events.includes(eventType));

const computeHoldingDays = (
  disposedLots: { lot: { dateAcquired: string }; amountUsed: BigNumber }[],
  disposalDate: string,
  totalAmount: BigNumber,
): number => {
  if (disposedLots.length === 0) return 0;

  // Weighted average holding period across consumed lots
  const weightedDays = disposedLots.reduce((sum, { lot, amountUsed }) => {
    const days = daysBetween(lot.dateAcquired, disposalDate);
    return sum.plus(amountUsed.times(days));
  }, ZERO);

  return totalAmount.gt(0)
    ? weightedDays.div(totalAmount).integerValue(BigNumber.ROUND_FLOOR).toNumber()
    : 0;
};

const processDisposal = (
  tx: Transaction,
  rules: TaxRules,
  lotTracker: ILotTracker,
): TaxableEvent | null => {
  const asset = tx.fromAsset;
  const amount = tx.fromAmount;
  if (!asset || !amount) return null;

  if (tx.type === 'trade' && !rules.cryptoToCryptoTaxable) return null;

  const disposal = lotTracker.dispose(asset, amount);
  const proceeds = tx.fiatValue;
  const costBasis = disposal.costBasis;
  const gainLoss = proceeds.minus(costBasis);
  const holdingDays = computeHoldingDays(disposal.lots, tx.date, amount);
  const isLongTerm = rules.holdingPeriod.enabled && holdingDays >= rules.holdingPeriod.thresholdDays;

  return {
    transactionId: tx.id,
    date: new Date(tx.date),
    asset,
    amount,
    proceeds,
    costBasis,
    gainLoss,
    holdingDays,
    isLongTerm,
    type: 'disposal',
  };
};

const processIncome = (tx: Transaction): TaxableEvent | null => {
  const asset = tx.toAsset;
  const amount = tx.toAmount;
  if (!asset || !amount) return null;

  return {
    transactionId: tx.id,
    date: new Date(tx.date),
    asset,
    amount,
    proceeds: tx.fiatValue,
    costBasis: ZERO,
    gainLoss: tx.fiatValue,
    holdingDays: 0,
    isLongTerm: false,
    type: 'income',
  };
};

const addLotFromTransaction = (tx: Transaction, lotTracker: ILotTracker): void => {
  const asset = tx.toAsset;
  const amount = tx.toAmount;
  if (!asset || !amount || amount.eq(0)) return;

  lotTracker.addLot({
    asset,
    amount,
    costBasisPerUnit: tx.fiatValue.div(amount),
    dateAcquired: tx.date,
    source: tx.id,
  });
};

const processTransaction = (
  tx: Transaction,
  rules: TaxRules,
  lotTracker: ILotTracker,
): TaxableEvent | null => {
  switch (tx.type) {
    case 'buy':
    case 'transfer':
      addLotFromTransaction(tx, lotTracker);
      return null;

    case 'sell':
    case 'fee':
      return processDisposal(tx, rules, lotTracker);

    case 'trade': {
      const event = processDisposal(tx, rules, lotTracker);
      addLotFromTransaction(tx, lotTracker);
      return event;
    }

    case 'mining':
    case 'staking':
    case 'airdrop': {
      addLotFromTransaction(tx, lotTracker);
      return processIncome(tx);
    }

    default:
      return null;
  }
};

const estimateTaxForIncomeType = (
  incomeType: IncomeType,
  amount: BigNumber,
): BigNumber => {
  if (amount.eq(0)) return ZERO;

  // Handle losses with effective rate
  if (amount.lt(0)) {
    const effectiveRate = incomeType.lossRules.deductible && incomeType.lossRules.effectiveRate != null
      ? incomeType.lossRules.effectiveRate
      : 0;
    return amount.times(effectiveRate);
  }

  // Apply contributions (e.g. AM-bidrag) that reduce gross before bracket calc
  const grossContributions = (incomeType.contributions ?? [])
    .filter((c) => c.appliesToGross);

  const contributionTotal = grossContributions.reduce(
    (sum, c) => sum.plus(amount.times(c.rate)),
    ZERO,
  );

  const taxableAmount = amount.minus(contributionTotal);
  const bracketTax = applyBrackets(taxableAmount, incomeType.brackets);

  return contributionTotal.plus(bracketTax);
};

export class TaxCalculator implements ITaxCalculator {
  constructor(
    private readonly rules: TaxRules,
    private readonly lotTracker: ILotTracker,
  ) {}

  process(transactions: Transaction[]): TaxSummary {
    const events: TaxableEvent[] = [];
    let incomeFromMining = ZERO;
    let incomeFromStaking = ZERO;
    let incomeFromAirdrops = ZERO;

    const sorted = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

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

    // Estimate tax per income type
    let estimatedTax = ZERO;

    // Tax on disposal gains/losses (find the income type that covers sell/trade)
    const disposalTaxType = transactionTypeToTaxEvent['sell']!;
    const disposalIncomeType = findIncomeType(this.rules, disposalTaxType);
    if (disposalIncomeType) {
      estimatedTax = estimatedTax.plus(estimateTaxForIncomeType(disposalIncomeType, netGainLoss));
    }

    // Tax on income (mining/staking/airdrops)
    const incomeTaxType = transactionTypeToTaxEvent['mining']!;
    const incomeIncomeType = findIncomeType(this.rules, incomeTaxType);
    if (incomeIncomeType && totalIncome.gt(0)) {
      estimatedTax = estimatedTax.plus(estimateTaxForIncomeType(incomeIncomeType, totalIncome));
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
      events,
    };
  }
}