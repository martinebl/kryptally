import BigNumber from 'bignumber.js';
import type { ICryptoToFiatConverter } from '$lib/types/converters';
import type { Transaction } from '$lib/types/transaction';

export interface SimulatedSellsResult {
  transactions: Transaction[];
  unpricedAssets: string[];
}

/**
 * Builds synthetic sell transactions for all provided holdings using current prices
 * from the given converter. Assets whose price cannot be fetched are skipped and
 * reported in `unpricedAssets`.
 */
export async function buildSimulatedSells(
  holdings: { asset: string; totalAmount: BigNumber }[],
  converter: ICryptoToFiatConverter,
  simulationDate: Date,
  fiatCurrency: string,
): Promise<SimulatedSellsResult> {
  const transactions: Transaction[] = [];
  const unpricedAssets: string[] = [];

  for (const { asset, totalAmount } of holdings) {
    if (totalAmount.lte(0)) continue;

    let rate: BigNumber;
    try {
      rate = await converter.getRate(asset, fiatCurrency, simulationDate);
    } catch {
      unpricedAssets.push(asset);
      continue;
    }

    if (rate.lte(0)) {
      unpricedAssets.push(asset);
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

  return { transactions, unpricedAssets };
}
