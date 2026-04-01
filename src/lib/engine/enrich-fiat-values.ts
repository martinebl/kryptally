import type { Transaction } from '$lib/types/transaction';
import type { ICryptoToFiatConverter } from '$lib/types/converters';
import type BigNumber from 'bignumber.js';

const resolveAssetAndAmount = (tx: Transaction): { asset: string; amount: BigNumber } | undefined => {
  // For sells/trades/fees, the fiat value represents the proceeds (what you gave up)
  if (tx.fromAsset && tx.fromAmount) return { asset: tx.fromAsset, amount: tx.fromAmount };
  // For buys/income, the fiat value represents what you received
  if (tx.toAsset && tx.toAmount) return { asset: tx.toAsset, amount: tx.toAmount };
  // For standalone fees
  if (tx.feeAsset && tx.feeAmount) return { asset: tx.feeAsset, amount: tx.feeAmount };
  return undefined;
};

export interface EnrichmentProgress {
  completed: number;
  total: number;
  failed: number;
}

export interface EnrichmentResult {
  transactions: Transaction[];
  failed: number;
}

/**
 * Fills in missing fiatValue/fiatCurrency on transactions by looking up
 * rates from the provided converter. Transactions that already have
 * fiatValue are left untouched. Returns a new array (no mutation).
 *
 * Processes sequentially so `onProgress` can report meaningful updates.
 */
export const enrichFiatValues = async (
  transactions: Transaction[],
  converter: ICryptoToFiatConverter,
  fiatCurrency: string,
  onProgress?: (progress: EnrichmentProgress) => void,
): Promise<EnrichmentResult> => {
  const total = transactions.length;
  const results: Transaction[] = [];
  let failed = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    if (tx.fiatValue !== undefined) {
      results.push(tx);
      onProgress?.({ completed: i + 1, total, failed });
      continue;
    }

    const resolved = resolveAssetAndAmount(tx);
    if (!resolved) {
      results.push(tx);
      onProgress?.({ completed: i + 1, total, failed });
      continue;
    }

    try {
      const rate = await converter.getRate(resolved.asset, fiatCurrency, tx.date);
      results.push({ ...tx, fiatCurrency, fiatValue: resolved.amount.times(rate) });
    } catch {
      results.push(tx);
      failed++;
    }

    onProgress?.({ completed: i + 1, total, failed });
  }

  return { transactions: results, failed };
};