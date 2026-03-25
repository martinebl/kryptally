import type BigNumber from 'bignumber.js';

export type TransactionType =
  | 'buy'
  | 'sell'
  | 'trade'
  | 'mining'
  | 'staking'
  | 'airdrop'
  | 'transfer'
  | 'fee';

export interface Transaction {
  id: string;
  date: string; // ISO 8601
  type: TransactionType;

  // What you gave up
  fromAsset?: string;   // e.g. 'DKK', 'BTC'
  fromAmount?: BigNumber;

  // What you received
  toAsset?: string;     // e.g. 'BTC', 'ETH'
  toAmount?: BigNumber;

  // Fee (in any asset)
  feeAsset?: string;
  feeAmount?: BigNumber;

  // Market value in fiat at time of transaction
  fiatCurrency: string; // e.g. 'DKK'
  fiatValue: BigNumber;

  exchange?: string;
  notes?: string;
}
