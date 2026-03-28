<script lang="ts">
  import BigNumber from 'bignumber.js';
  import Card from '$lib/components/Card.svelte';
  import { TaxCalculator } from '$lib/engine/tax-calculator';
  import { LotTracker } from '$lib/engine/lot-tracker';
  import type { Transaction } from '$lib/types/transaction';
  import type { TaxRules } from '$lib/types/tax-rules';
  import type { TaxSummary, TaxableEvent } from '$lib/types/results';
  import dkRules from '$lib/rules/dk-2024.json';

  interface Props {
    transactions: Transaction[];
  }

  const { transactions }: Props = $props();

  const bn = (n: number) => new BigNumber(n);
  const rules = dkRules as TaxRules;
  const fmt = (v: BigNumber) => v.toFormat(2);

  const summary: TaxSummary = $derived.by(() => {
    const tracker = new LotTracker(rules.costBasisMethod);
    const calculator = new TaxCalculator(rules, tracker);
    return calculator.process(transactions);
  });

  const gainColor = (v: BigNumber) =>
    v.gt(0) ? 'text-green-600' : v.lt(0) ? 'text-red-500' : 'text-text';

  const eventTypeLabel = (e: TaxableEvent) =>
    e.type === 'income' ? 'Income' : 'Disposal';

  const txAsset = (tx: Transaction) => tx.toAsset ?? tx.fromAsset ?? tx.feeAsset ?? '—';
  const txAmount = (tx: Transaction) => tx.toAmount ?? tx.fromAmount ?? tx.feeAmount;
  const txDirection = (tx: Transaction) => tx.toAmount ? '+' : tx.fromAmount ? '-' : '';

  const typeBadgeClass = (type: string) => {
    const map: Record<string, string> = {
      transfer: 'bg-gray-100 text-gray-700',
      buy: 'bg-green-100 text-green-700',
      sell: 'bg-red-100 text-red-700',
      trade: 'bg-purple-100 text-purple-700',
      fee: 'bg-amber-100 text-amber-700',
      mining: 'bg-blue-100 text-blue-700',
      staking: 'bg-blue-100 text-blue-700',
      airdrop: 'bg-teal-100 text-teal-700',
    };
    return map[type] ?? 'bg-gray-100 text-gray-700';
  };
</script>

<section class="py-16">
  {#if transactions.length === 0}
    <div class="text-center">
      <h2 class="mb-4 font-heading text-2xl font-medium text-text-heading">No transactions</h2>
      <p class="text-sm text-text">Import a CSV file to see your tax report.</p>
    </div>
  {:else}
    <h2 class="mb-2 text-center font-heading text-2xl font-medium text-text-heading">
      Tax Report — {rules.country} {rules.taxYear}
    </h2>
    <p class="mx-auto mb-10 max-w-lg text-center text-sm text-text">
      {rules.currency} · {rules.costBasisMethod.toUpperCase()} method · {transactions.length} transactions
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

    <!-- Tax events table -->
    {#if summary.events.length > 0}
      <h3 class="mb-4 font-heading text-lg font-medium text-text-heading">Tax Events</h3>
      <div class="mb-10 overflow-x-auto rounded-xl border border-border">
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
    {/if}

    <!-- All activity table -->
    <h3 class="mb-4 font-heading text-lg font-medium text-text-heading">All Activity</h3>
    <div class="overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-border bg-bg-card text-xs uppercase tracking-wide text-text">
            <th class="px-4 py-3">Date</th>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Asset</th>
            <th class="px-4 py-3 text-right">Amount</th>
            <th class="px-4 py-3 text-right">Fee</th>
            <th class="px-4 py-3">Source</th>
          </tr>
        </thead>
        <tbody>
          {#each transactions as tx}
            {@const amount = txAmount(tx)}
            <tr class="border-b border-border last:border-none hover:bg-bg-card/50">
              <td class="px-4 py-3 font-mono text-text-heading">
                {tx.date.slice(0, 10)}
              </td>
              <td class="px-4 py-3">
                <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium {typeBadgeClass(tx.type)}">
                  {tx.type}
                </span>
              </td>
              <td class="px-4 py-3 font-medium text-text-heading">{txAsset(tx)}</td>
              <td class="px-4 py-3 text-right font-mono text-text-heading">
                {#if amount}
                  <span class={txDirection(tx) === '+' ? 'text-green-600' : txDirection(tx) === '-' ? 'text-red-500' : ''}>
                    {txDirection(tx)}{amount.toFormat(8)}
                  </span>
                {:else}
                  —
                {/if}
              </td>
              <td class="px-4 py-3 text-right font-mono text-text">
                {#if tx.feeAmount && tx.feeAmount.gt(0)}
                  {tx.feeAmount.toFormat(8)} {tx.feeAsset}
                {:else}
                  —
                {/if}
              </td>
              <td class="px-4 py-3 text-text">{tx.exchange ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>