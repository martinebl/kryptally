import type BigNumber from 'bignumber.js';

export interface TaxableEvent {
  transactionId: string;
  date: string;
  asset: string;
  amount: BigNumber;
  proceeds: BigNumber;       // fiat value received
  costBasis: BigNumber;      // fiat value of acquisition
  gainLoss: BigNumber;       // proceeds - costBasis
  holdingDays: number;
  isLongTerm: boolean;
  type: 'disposal' | 'income';
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
  events: TaxableEvent[];
}

export interface LotRecord {
  asset: string;
  amount: BigNumber;
  costBasisPerUnit: BigNumber;
  dateAcquired: string;
  source: string; // transaction id
}
