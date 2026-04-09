<script lang="ts">
  import BigNumber from 'bignumber.js';
  import Card from '$lib/components/Card.svelte';
  import SimulationPanel from '$lib/components/SimulationPanel.svelte';
  import HoldingsTable from '$lib/components/HoldingsTable.svelte';
  import TaxEventsTable from '$lib/components/TaxEventsTable.svelte';
  import { TaxCalculator } from '$lib/engine/tax-calculator';
  import { LotTracker } from '$lib/engine/lot-tracker';
  import type { Transaction } from '$lib/types/transaction';
  import type { TaxRules } from '$lib/types/tax-rules';
  import { filterDustHoldings } from '$lib/engine/dust-filter';
  import ActivitiesTable from './ActivitiesTable.svelte';

  interface Props {
    transactions: Transaction[];
    taxRules: TaxRules;
  }

  const { transactions, taxRules }: Props = $props();
  const fmt = (v: BigNumber) => v.toFormat(2);

  const { summary, holdings } = $derived.by(() => {
    const tracker = new LotTracker(taxRules.costBasis.default);
    const calculator = new TaxCalculator(taxRules, tracker);
    const summary = calculator.process(transactions);
    const holdings = tracker.getHoldings().filter((h) => h.totalAmount.gt(0));
    return { summary, holdings };
  });

  let hideDust = $state(false);
  let dustThresholdInput = $state('10');
  const dustThreshold = $derived(new BigNumber(dustThresholdInput || '0'));

  const { visible: visibleHoldings, dust: dustHoldings } = $derived.by(() =>
    hideDust
      ? filterDustHoldings(holdings, dustThreshold)
      : { visible: holdings, dust: [] as typeof holdings },
  );

  const gainColor = (v: BigNumber) =>
    v.gt(0) ? 'text-green-600' : v.lt(0) ? 'text-red-500' : 'text-text';

</script>

<section class="py-16">
  {#if transactions.length === 0}
    <div class="text-center">
      <h2 class="mb-4 font-heading text-2xl font-medium text-text-heading">No transactions</h2>
      <p class="text-sm text-text">Import a CSV file to see your tax report.</p>
    </div>
  {:else}
    <h2 class="mb-2 text-center font-heading text-2xl font-medium text-text-heading">
      Tax Report — {taxRules.country} {taxRules.taxYear}
    </h2>
    <p class="mx-auto mb-10 max-w-lg text-center text-sm text-text">
      {taxRules.currency} · {taxRules.costBasis.default.toUpperCase()} method · {transactions.length} transactions
    </p>


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
          <p class="mt-1 text-center text-xs text-text">{taxRules.currency}</p>
        </div>
      </Card>
    </div>


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


    {#if holdings.length > 0}
      <HoldingsTable
        {visibleHoldings}
        {dustHoldings}
        bind:hideDust
        bind:dustThresholdInput
        currency={taxRules.currency}
      />
    {/if}


    {#if visibleHoldings.length > 0}
      <SimulationPanel {transactions} holdings={visibleHoldings} {summary} rules={taxRules} />
    {/if}

    {#if summary.events.length > 0}
      <TaxEventsTable events={summary.events} />
    {/if}

    <ActivitiesTable transactions={transactions} />
    
  {/if}
</section>