<script lang="ts">
  import BigNumber from 'bignumber.js';
  import ResultsPage from '$lib/components/ResultsPage.svelte';
  import type { Transaction } from '$lib/types/transaction';
  import type { TaxRules } from '$lib/types/tax-rules';
  import dkRules from '$lib/rules/dk/dk-2024.json';

  const bn = (n: number) => new BigNumber(n);

  const hardcodedTransactions: Transaction[] = [
    {
      id: 'buy-1',
      type: 'buy',
      date: new Date('2024-01-10'),
      fromAsset: 'DKK',
      fromAmount: bn(150000),
      toAsset: 'BTC',
      toAmount: bn(1.5),
      fiatCurrency: 'DKK',
      fiatValue: bn(150000),
      exchange: 'Coinbase',
    },
    {
      id: 'buy-2',
      type: 'buy',
      date: new Date('2024-02-20'),
      fromAsset: 'DKK',
      fromAmount: bn(30000),
      toAsset: 'ETH',
      toAmount: bn(5),
      fiatCurrency: 'DKK',
      fiatValue: bn(30000),
      exchange: 'Kraken',
    },
    {
      id: 'mine-1',
      type: 'mining',
      date: new Date('2024-03-15'),
      toAsset: 'BTC',
      toAmount: bn(0.05),
      fiatCurrency: 'DKK',
      fiatValue: bn(7500),
    },
    {
      id: 'sell-1',
      type: 'sell',
      date: new Date('2024-06-01'),
      fromAsset: 'BTC',
      fromAmount: bn(0.8),
      fiatCurrency: 'DKK',
      fiatValue: bn(120000),
      exchange: 'Coinbase',
    },
    {
      id: 'trade-1',
      type: 'trade',
      date: new Date('2024-07-10'),
      fromAsset: 'ETH',
      fromAmount: bn(2),
      toAsset: 'BTC',
      toAmount: bn(0.1),
      fiatCurrency: 'DKK',
      fiatValue: bn(14000),
      exchange: 'Kraken',
    },
    {
      id: 'sell-2',
      type: 'sell',
      date: new Date('2024-09-20'),
      fromAsset: 'BTC',
      fromAmount: bn(0.5),
      fiatCurrency: 'DKK',
      fiatValue: bn(35000),
      exchange: 'Coinbase',
    },
    {
      id: 'stake-1',
      type: 'staking',
      date: new Date('2024-11-01'),
      toAsset: 'ETH',
      toAmount: bn(0.3),
      fiatCurrency: 'DKK',
      fiatValue: bn(4200),
    },
  ];
</script>

<ResultsPage transactions={hardcodedTransactions} taxRules={dkRules as TaxRules} />