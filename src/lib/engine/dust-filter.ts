import type BigNumber from 'bignumber.js';

interface Holding {
  asset: string;
  totalAmount: BigNumber;
  totalCostBasis: BigNumber;
}

export const filterDustHoldings = (
  holdings: Holding[],
  thresholdFiat: BigNumber,
): { visible: Holding[]; dust: Holding[] } => {
  const visible: Holding[] = [];
  const dust: Holding[] = [];

  for (const h of holdings) {
    if (h.totalCostBasis.gte(thresholdFiat)) {
      visible.push(h);
    } else {
      dust.push(h);
    }
  }

  return { visible, dust };
};
