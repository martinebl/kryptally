import type { Transaction } from '$lib/types/transaction';
import type { ICryptoToFiatConverter } from '$lib/types/converters';
import type BigNumber from 'bignumber.js';
import { resolvePriorityAsset } from '$lib/engine/asset-priority';

const resolveAssetAndAmount = (tx: Transaction): { asset: string; amount: BigNumber } | undefined => {
  // For trades with both sides, use priority list to determine which asset's rate to look up
  if (tx.fromAsset && tx.fromAmount && tx.toAsset && tx.toAmount) {
    const priority = resolvePriorityAsset(tx.fromAsset, tx.toAsset);
    if (priority) {
      return priority.prioritySide === 'from'
        ? { asset: tx.fromAsset, amount: tx.fromAmount }
        : { asset: tx.toAsset, amount: tx.toAmount };
    }
    // Fall back to fromAsset (proceeds) when neither asset is on the priority list
    return { asset: tx.fromAsset, amount: tx.fromAmount };
  }
  // For sells/fees, the fiat value represents the proceeds (what you gave up)
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

export interface MissingPrice {
  asset: string;
  date: string; // YYYY-MM-DD
}

export interface EnrichmentResult {
  transactions: Transaction[];
  failed: number;
  missingPrices: MissingPrice[];
}

/**
 * Fills in missing fiatValue/fiatCurrency on transactions by looking up
 * rates from the provided converter. Transactions that already have
 * fiatValue are left untouched. Returns a new array (no mutation).
 *
 * Processes sequentially so `onProgress` can report meaningful updates.
 */
const toISODate = (d: Date): string => d.toISOString().slice(0, 10);

export const enrichFiatValues = async (
  transactions: Transaction[],
  converter: ICryptoToFiatConverter,
  fiatCurrency: string,
  onProgress?: (progress: EnrichmentProgress) => void,
): Promise<EnrichmentResult> => {
  const total = transactions.length;
  const results: Transaction[] = [];
  const missingPrices: MissingPrice[] = [];
  let failed = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    if (tx.fiatValue !== undefined) {
      const sourceCurrency = tx.fiatCurrency?.toUpperCase();
      const targetCurrency = fiatCurrency.toUpperCase();

      if (!sourceCurrency || sourceCurrency === targetCurrency) {
        results.push(tx);
        onProgress?.({ completed: i + 1, total, failed });
        continue;
      }

      // fiatValue exists but in a different currency — convert to the target
      try {
        const rate = await converter.getRate(sourceCurrency, targetCurrency, tx.date);
        results.push({ ...tx, fiatCurrency, fiatValue: tx.fiatValue.times(rate) });
      } catch {
        results.push(tx);
        failed++;
        missingPrices.push({ asset: sourceCurrency, date: toISODate(tx.date) });
      }
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
      missingPrices.push({ asset: resolved.asset, date: toISODate(tx.date) });
    }

    onProgress?.({ completed: i + 1, total, failed });
  }

  return { transactions: results, failed, missingPrices };
};