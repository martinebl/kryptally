import type { Transaction, IImportPreprocessor } from '$lib/types';

const isInboundTransferWithFiatData = (tx: Transaction): boolean =>
  tx.type === 'transfer' &&
  tx.toAsset !== undefined &&
  tx.toAmount !== undefined &&
  tx.fiatCurrency !== undefined &&
  tx.fiatValue !== undefined &&
  tx.fiatValue.gt(0);

const reclassify = (tx: Transaction): Transaction => ({
  ...tx,
  type: 'buy',
  fromAsset: tx.fiatCurrency!,
  fromAmount: tx.fiatValue!,
});

export const reclassifyInboundAsBuys: IImportPreprocessor = {
  id: 'reclassify-inbound-as-buys',
  label: 'Treat inbound transfers as purchases',
  description: 'Reclassifies inbound transfers that have fiat value data as buy transactions. Useful when purchases via on-ramps (e.g. Revolut Ramp) appear as transfers.',
  isEligible: isInboundTransferWithFiatData,
  apply: (transactions, selectedIds) =>
    transactions.map((tx) => {
      if (!isInboundTransferWithFiatData(tx)) return tx;
      if (selectedIds && !selectedIds.has(tx.id)) return tx;
      return reclassify(tx);
    }),
};