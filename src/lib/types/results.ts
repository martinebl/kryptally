import type BigNumber from 'bignumber.js';
import type { Transaction } from '$lib/types/transaction';

export interface LotUsage {
  lot: LotRecord;
  amountUsed: BigNumber;
  holdingDays: number;
  isLongTerm: boolean;
}

export interface TaxableEvent {
  transactionId: string;
  date: Date;
  asset: string;
  amount: BigNumber;
  proceeds: BigNumber;       // fiat value received
  costBasis: BigNumber;      // fiat value of acquisition
  gainLoss: BigNumber;       // proceeds - costBasis
  holdingDays: number;
  isLongTerm: boolean;
  type: 'disposal' | 'income';
  lots: LotUsage[];
}

export interface TaxSummary {
  taxYear: number;
  currency: string;
  totalProceeds: BigNumber;
  totalCostBasis: BigNumber;
  totalGains: BigNumber;
  totalLosses: BigNumber;
  netGainLoss: BigNumber;
  incomeFromMining: BigNumber;
  incomeFromStaking: BigNumber;
  incomeFromAirdrops: BigNumber;
  totalIncome: BigNumber;
  estimatedTax: BigNumber;
  lossCarryForward: BigNumber;
  events: TaxableEvent[];
}

export interface LotRecord {
  asset: string;
  amount: BigNumber;
  costBasisPerUnit: BigNumber;
  dateAcquired: Date;
  source: string; // exchange name, or transaction id as fallback
}

export interface DisposalResult {
  costBasis: BigNumber;
  lots: { lot: LotRecord; amountUsed: BigNumber }[];
}

export interface ILotTracker {
  addLot(lot: LotRecord): void;
  dispose(asset: string, amount: BigNumber): DisposalResult;
  getLots(asset: string): LotRecord[];
  getAssets(): string[];
  getHoldings(): { asset: string; totalAmount: BigNumber; totalCostBasis: BigNumber }[];
}

export interface ITaxCalculator {
  process(transactions: Transaction[]): Map<number, TaxSummary>;
}
