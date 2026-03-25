import BigNumber from 'bignumber.js';
import type { CostBasisMethod, LotRecord } from '../types';

export class LotTracker {
  private lots: Map<string, LotRecord[]> = new Map();

  constructor(private method: CostBasisMethod = 'fifo') {}

  addLot(lot: LotRecord): void {
    const existing = this.lots.get(lot.asset) ?? [];
    existing.push({
      ...lot,
      amount: new BigNumber(lot.amount),
      costBasisPerUnit: new BigNumber(lot.costBasisPerUnit),
    });
    this.lots.set(lot.asset, existing);
  }

  /**
   * Dispose of `amount` units of `asset`, returning the cost basis consumed.
   * Mutates the internal lot list.
   */
  dispose(asset: string, amount: BigNumber): { costBasis: BigNumber; lots: { lot: LotRecord; amountUsed: BigNumber }[] } {
    const assetLots = this.lots.get(asset);
    if (!assetLots || assetLots.length === 0) {
      return { costBasis: new BigNumber(0), lots: [] };
    }

    this.sortLots(assetLots);

    let remaining = new BigNumber(amount);
    let costBasis = new BigNumber(0);
    const usedLots: { lot: LotRecord; amountUsed: BigNumber }[] = [];

    while (remaining.gt(1e-12) && assetLots.length > 0) {
      const lot = assetLots[0];
      const take = BigNumber.min(remaining, lot.amount);
      const cost = take.times(lot.costBasisPerUnit);

      costBasis = costBasis.plus(cost);
      usedLots.push({ lot: { ...lot, amount: new BigNumber(lot.amount) }, amountUsed: take });

      lot.amount = lot.amount.minus(take);
      remaining = remaining.minus(take);

      if (lot.amount.lt(1e-12)) {
        assetLots.shift();
      }
    }

    return { costBasis, lots: usedLots };
  }

  /** Get remaining lots for an asset (read-only snapshot) */
  getLots(asset: string): LotRecord[] {
    return (this.lots.get(asset) ?? []).map(l => ({
      ...l,
      amount: new BigNumber(l.amount),
      costBasisPerUnit: new BigNumber(l.costBasisPerUnit),
    }));
  }

  /** Get all tracked assets */
  getAssets(): string[] {
    return [...this.lots.keys()];
  }

  private sortLots(lots: LotRecord[]): void {
    switch (this.method) {
      case 'fifo':
        lots.sort((a, b) => new Date(a.dateAcquired).getTime() - new Date(b.dateAcquired).getTime());
        break;
      case 'lifo':
        lots.sort((a, b) => new Date(b.dateAcquired).getTime() - new Date(a.dateAcquired).getTime());
        break;
      case 'hifo':
        lots.sort((a, b) => b.costBasisPerUnit.comparedTo(a.costBasisPerUnit) ?? 0);
        break;
      case 'average':
        this.consolidateToAverage(lots);
        break;
    }
  }

  private consolidateToAverage(lots: LotRecord[]): void {
    if (lots.length <= 1) return;

    let totalAmount = new BigNumber(0);
    let totalCost = new BigNumber(0);
    for (const lot of lots) {
      totalAmount = totalAmount.plus(lot.amount);
      totalCost = totalCost.plus(new BigNumber(lot.amount).times(lot.costBasisPerUnit));
    }

    const avgCost = totalAmount.gt(0) ? totalCost.div(totalAmount) : new BigNumber(0);

    const consolidated: LotRecord = {
      asset: lots[0].asset,
      amount: totalAmount,
      costBasisPerUnit: avgCost,
      dateAcquired: lots[0].dateAcquired,
      source: 'average',
    };

    lots.length = 0;
    lots.push(consolidated);
  }
}
