<script lang="ts">
  import BigNumber from 'bignumber.js';
  import Card from '$lib/components/Card.svelte';
  import { TaxCalculator } from '$lib/engine/tax-calculator';
  import { LotTracker } from '$lib/engine/lot-tracker';
  import type { Transaction } from '$lib/types/transaction';
  import type { TaxRules } from '$lib/types/tax-rules';
  import type { TaxSummary, TaxableEvent } from '$lib/types/results';
  import dkRules from '$lib/rules/dk-2024.json';

  const bn = (n: number) => new BigNumber(n);
  const rules = dkRules as TaxRules;
  const fmt = (v: BigNumber) => v.toFormat(2);

  const hardcodedTransactions: Transaction[] = [
    {
      id: 'buy-1',
      type: 'buy',
      date: '2024-01-10',
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
      date: '2024-02-20',
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
      date: '2024-03-15',
      toAsset: 'BTC',
      toAmount: bn(0.05),
      fiatCurrency: 'DKK',
      fiatValue: bn(7500),
    },
    {
      id: 'sell-1',
      type: 'sell',
      date: '2024-06-01',
      fromAsset: 'BTC',
      fromAmount: bn(0.8),
      fiatCurrency: 'DKK',
      fiatValue: bn(120000),
      exchange: 'Coinbase',
    },
    {
      id: 'trade-1',
      type: 'trade',
      date: '2024-07-10',
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
      date: '2024-09-20',
      fromAsset: 'BTC',
      fromAmount: bn(0.5),
      fiatCurrency: 'DKK',
      fiatValue: bn(35000),
      exchange: 'Coinbase',
    },
    {
      id: 'stake-1',
      type: 'staking',
      date: '2024-11-01',
      toAsset: 'ETH',
      toAmount: bn(0.3),
      fiatCurrency: 'DKK',
      fiatValue: bn(4200),
    },
  ];

  const tracker = new LotTracker(rules.costBasisMethod);
  const calculator = new TaxCalculator(rules, tracker);
  const summary: TaxSummary = calculator.process(hardcodedTransactions);

  const gainColor = (v: BigNumber) =>
    v.gt(0) ? 'text-green-600' : v.lt(0) ? 'text-red-500' : 'text-text';

  const eventTypeLabel = (e: TaxableEvent) =>
    e.type === 'income' ? 'Income' : 'Disposal';
</script>

<section class="py-16">
  <h2 class="mb-2 text-center font-heading text-2xl font-medium text-text-heading">
    Tax Report — {rules.country} {rules.taxYear}
  </h2>
  <p class="mx-auto mb-10 max-w-lg text-center text-sm text-text">
    {rules.currency} · {rules.costBasisMethod.toUpperCase()} method
  </p>

  <!-- Summary cards -->
  <div class="mb-10 grid grid-cols-3 gap-4 max-md:grid-cols-1">
    <Card title="Capital Gains">
      <div class="space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-text">Proceeds</span>
          <span class="font-mono text-text-heading">{fmt(summary.totalProceeds)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Cost basis</span>
          <span class="font-mono text-text-heading">{fmt(summary.totalCostBasis)}</span>
        </div>
        <div class="border-t border-border pt-2 flex justify-between text-sm font-medium">
          <span class="text-text-heading">Net gain/loss</span>
          <span class="font-mono {gainColor(summary.netGainLoss)}">{fmt(summary.netGainLoss)}</span>
        </div>
      </div>
    </Card>

    <Card title="Income">
      <div class="space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-text">Mining</span>
          <span class="font-mono text-text-heading">{fmt(summary.incomeFromMining)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Staking</span>
          <span class="font-mono text-text-heading">{fmt(summary.incomeFromStaking)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Airdrops</span>
          <span class="font-mono text-text-heading">{fmt(summary.incomeFromAirdrops)}</span>
        </div>
        <div class="border-t border-border pt-2 flex justify-between text-sm font-medium">
          <span class="text-text-heading">Total income</span>
          <span class="font-mono text-text-heading">{fmt(summary.totalIncome)}</span>
        </div>
      </div>
    </Card>

    <Card title="Estimated Tax">
      <div class="flex h-full flex-col justify-center">
        <p class="text-center font-mono text-3xl font-semibold {gainColor(summary.estimatedTax.negated())}">
          {fmt(summary.estimatedTax)}
        </p>
        <p class="mt-1 text-center text-xs text-text">{rules.currency}</p>
      </div>
    </Card>
  </div>

  <!-- Gains vs losses bar -->
  {#if summary.totalGains.gt(0) || summary.totalLosses.gt(0)}
    {@const total = summary.totalGains.plus(summary.totalLosses)}
    {@const gainPct = total.gt(0) ? summary.totalGains.div(total).times(100).toNumber() : 0}
    <div class="mx-auto mb-10 max-w-2xl">
      <div class="mb-2 flex justify-between text-xs text-text">
        <span>Gains: {fmt(summary.totalGains)}</span>
        <span>Losses: {fmt(summary.totalLosses)}</span>
      </div>
      <div class="flex h-3 overflow-hidden rounded-full">
        <div class="bg-green-500" style="width: {gainPct}%"></div>
        <div class="bg-red-400" style="width: {100 - gainPct}%"></div>
      </div>
    </div>
  {/if}

  <!-- Events table -->
  <div class="overflow-x-auto rounded-xl border border-border">
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-border bg-bg-card text-xs uppercase tracking-wide text-text">
          <th class="px-4 py-3">Date</th>
          <th class="px-4 py-3">Type</th>
          <th class="px-4 py-3">Asset</th>
          <th class="px-4 py-3 text-right">Amount</th>
          <th class="px-4 py-3 text-right">Proceeds</th>
          <th class="px-4 py-3 text-right">Cost Basis</th>
          <th class="px-4 py-3 text-right">Gain / Loss</th>
        </tr>
      </thead>
      <tbody>
        {#each summary.events as event}
          <tr class="border-b border-border last:border-none hover:bg-bg-card/50">
            <td class="px-4 py-3 font-mono text-text-heading">
              {event.date.toISOString().slice(0, 10)}
            </td>
            <td class="px-4 py-3">
              <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium
                {event.type === 'income'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'}">
                {eventTypeLabel(event)}
              </span>
            </td>
            <td class="px-4 py-3 font-medium text-text-heading">{event.asset}</td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">{event.amount.toFormat(6)}</td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">{fmt(event.proceeds)}</td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">{fmt(event.costBasis)}</td>
            <td class="px-4 py-3 text-right font-mono font-medium {gainColor(event.gainLoss)}">
              {event.gainLoss.gt(0) ? '+' : ''}{fmt(event.gainLoss)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>