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

/**
 * Fills in missing fiatValue/fiatCurrency on transactions by looking up
 * rates from the provided converter. Transactions that already have
 * fiatValue are left untouched. Returns a new array (no mutation).
 */
export const enrichFiatValues = async (
  transactions: Transaction[],
  converter: ICryptoToFiatConverter,
  fiatCurrency: string,
): Promise<Transaction[]> =>
  Promise.all(
    transactions.map(async (tx) => {
      if (tx.fiatValue !== undefined) return tx;

      const resolved = resolveAssetAndAmount(tx);
      if (!resolved) return tx;

      try {
        const rate = await converter.getRate(resolved.asset, fiatCurrency, tx.date);
        return {
          ...tx,
          fiatCurrency,
          fiatValue: resolved.amount.times(rate),
        };
      } catch {
        return tx;
      }
    }),
  );
