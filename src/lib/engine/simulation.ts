import type BigNumber from 'bignumber.js';
import type { Transaction } from '$lib/types/transaction';

export interface SimulatedSellsResult {
  transactions: Transaction[];
  unpriced: string[];
}

/**
 * Builds synthetic sell transactions for the given holdings using the supplied
 * current prices (keyed by asset). Holdings with no positive price are skipped
 * and reported in `unpriced`. Pure — fetching prices is the caller's concern.
 */
export function buildSellsFromPrices(
  holdings: { asset: string; totalAmount: BigNumber }[],
  prices: Map<string, BigNumber>,
  simulationDate: Date,
  fiatCurrency: string,
): SimulatedSellsResult {
  const transactions: Transaction[] = [];
  const unpriced: string[] = [];

  for (const { asset, totalAmount } of holdings) {
    if (totalAmount.lte(0)) continue;

    const rate = prices.get(asset);
    if (!rate || rate.lte(0)) {
      unpriced.push(asset);
      continue;
    }

    transactions.push({
      id: `sim-sell-${asset}`,
      date: simulationDate,
      type: 'sell',
      fromAsset: asset,
      fromAmount: totalAmount,
      fiatCurrency,
      fiatValue: totalAmount.times(rate),
    });
  }

  return { transactions, unpriced };
}
