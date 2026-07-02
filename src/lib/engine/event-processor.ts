import BigNumber from 'bignumber.js';
import type { Transaction, TransactionType } from '$lib/types/transaction';
import type { TaxRules, TaxableEventType } from '$lib/types/tax-rules';
import type { ILotTracker, LotUsage, TaxableEvent } from '$lib/types/results';

const ZERO = new BigNumber(0);

export const transactionTypeToTaxEvent: Partial<Record<TransactionType, TaxableEventType>> = {
  sell: 'sell',
  trade: 'trade',
  mining: 'mining',
  staking: 'staking',
  airdrop: 'airdrop',
  fee: 'fee',
};

const daysBetween = (from: Date, to: Date): number =>
  Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

const makeLotUsage = (
  lot: ReturnType<ILotTracker['dispose']>['lots'][number]['lot'],
  amountUsed: BigNumber,
  txDate: Date,
  rules: TaxRules,
): LotUsage => {
  const holdingDays = daysBetween(lot.dateAcquired, txDate);
  return {
    lot,
    amountUsed,
    holdingDays,
    isLongTerm: rules.holdingPeriod.enabled && holdingDays >= rules.holdingPeriod.thresholdDays,
  };
};

const processDisposal = (
  tx: Transaction,
  rules: TaxRules,
  lotTracker: ILotTracker,
): TaxableEvent[] => {
  const asset = tx.fromAsset;
  const amount = tx.fromAmount;
  if (!asset || !amount) return [];

  if (tx.type === 'trade' && !rules.cryptoToCryptoTaxable) return [];

  const disposal = lotTracker.dispose(asset, amount);
  const proceeds = tx.fiatValue ?? ZERO;

  if (!rules.holdingPeriod.enabled || disposal.lots.length <= 1) {
    const costBasis = disposal.costBasis;
    const gainLoss = proceeds.minus(costBasis);
    const holdingDays = disposal.lots.length === 1
      ? daysBetween(disposal.lots[0].lot.dateAcquired, tx.date)
      : 0;
    const isLongTerm = rules.holdingPeriod.enabled && holdingDays >= rules.holdingPeriod.thresholdDays;
    const lots = disposal.lots.map(({ lot, amountUsed }) => makeLotUsage(lot, amountUsed, tx.date, rules));

    return [{
      transactionId: tx.id,
      date: tx.date,
      asset,
      amount,
      proceeds,
      costBasis,
      gainLoss,
      holdingDays,
      isLongTerm,
      type: 'disposal',
      lots,
    }];
  }

  // Multiple lots — split into per-lot events with proportional proceeds
  return disposal.lots.map(({ lot, amountUsed }) => {
    const holdingDays = daysBetween(lot.dateAcquired, tx.date);
    const isLongTerm = holdingDays >= rules.holdingPeriod.thresholdDays;
    const proportion = amountUsed.div(amount);
    const lotProceeds = proceeds.times(proportion);
    const lotCostBasis = amountUsed.times(lot.costBasisPerUnit);
    return {
      transactionId: tx.id,
      date: tx.date,
      asset,
      amount: amountUsed,
      proceeds: lotProceeds,
      costBasis: lotCostBasis,
      gainLoss: lotProceeds.minus(lotCostBasis),
      holdingDays,
      isLongTerm,
      type: 'disposal' as const,
      lots: [{ lot, amountUsed, holdingDays, isLongTerm }],
    };
  });
};

const processIncome = (tx: Transaction): TaxableEvent[] => {
  const asset = tx.toAsset;
  const amount = tx.toAmount;
  if (!asset || !amount) return [];

  return [{
    transactionId: tx.id,
    date: tx.date,
    asset,
    amount,
    proceeds: tx.fiatValue ?? ZERO,
    costBasis: ZERO,
    gainLoss: tx.fiatValue ?? ZERO,
    holdingDays: 0,
    isLongTerm: false,
    type: 'income',
    lots: [],
  }];
};

const addLotFromTransaction = (tx: Transaction, lotTracker: ILotTracker): void => {
  const asset = tx.toAsset;
  const amount = tx.toAmount;
  if (!asset || !amount || amount.eq(0)) return;

  lotTracker.addLot({
    asset,
    amount,
    costBasisPerUnit: (tx.fiatValue ?? ZERO).div(amount),
    dateAcquired: tx.date,
    source: tx.exchange ?? tx.id,
  });
};

export const processTransaction = (
  tx: Transaction,
  rules: TaxRules,
  lotTracker: ILotTracker,
): TaxableEvent[] => {
  switch (tx.type) {
    case 'buy':
      addLotFromTransaction(tx, lotTracker);
      return [];

    case 'transfer':
      return [];

    case 'sell':
    case 'fee':
      return processDisposal(tx, rules, lotTracker);

    case 'trade': {
      const events = processDisposal(tx, rules, lotTracker);
      addLotFromTransaction(tx, lotTracker);
      return events;
    }

    case 'mining':
    case 'staking':
    case 'airdrop': {
      addLotFromTransaction(tx, lotTracker);
      return processIncome(tx);
    }

    default:
      return [];
  }
};