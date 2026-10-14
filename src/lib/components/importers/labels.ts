import type { MatchMode, RowKind } from '$lib/types';

export const KIND_LABELS: Record<RowKind, string> = {
  buy: 'Buy',
  sell: 'Sell',
  'trade-out': 'Trade (outgoing side only)',
  'transfer-in': 'Transfer in',
  'transfer-out': 'Transfer out',
  'transfer-by-sign': 'Transfer (direction by sign)',
  staking: 'Staking income',
  mining: 'Mining income',
  airdrop: 'Airdrop',
  fee: 'Fee',
  ignore: 'Ignore row',
};

export const MATCH_LABELS: Record<MatchMode, string> = {
  equals: 'equals',
  startsWith: 'starts with',
  contains: 'contains',
};
