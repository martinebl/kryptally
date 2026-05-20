<script lang="ts">
  import BigNumber from 'bignumber.js';
  import Card from '$lib/components/Card.svelte';
  import SimulationPanel from '$lib/components/SimulationPanel.svelte';
  import HoldingsTable from '$lib/components/HoldingsTable.svelte';
  import TaxEventsTable from '$lib/components/TaxEventsTable.svelte';
  import { TaxCalculator } from '$lib/engine/tax-calculator';
  import { LotTracker } from '$lib/engine/lot-tracker';
  import type { Transaction } from '$lib/types/transaction';
  import type { CountryConfig } from '$lib/types/tax-rules';
  import type { TaxSummary } from '$lib/types/results';
  import { filterDustHoldings } from '$lib/engine/dust-filter';
  import ActivitiesTable from './ActivitiesTable.svelte';

  interface Props {
    transactions: Transaction[];
    countryConfig: CountryConfig;
  }

  const { transactions, countryConfig }: Props = $props();
  const fmt = (v: BigNumber) => v.toFormat(2);

  const { summaries, holdings } = $derived.by(() => {
    const tracker = new LotTracker(countryConfig.defaultCostBasisMethod);
    const calculator = new TaxCalculator(countryConfig.resolve, countryConfig.currency, tracker);
    const summaries = calculator.process(transactions);
    const holdings = tracker.getHoldings().filter((h) => h.totalAmount.gt(0));
    return { summaries, holdings };
  });

  // Years that have at least one taxable event, most recent first
  const availableYears = $derived(
    [...summaries.keys()]
      .filter((y) => (summaries.get(y)?.events.length ?? 0) > 0)
      .sort((a, b) => b - a)
  );

  type YearSelection = number | 'all';
  let selectedYear = $state<YearSelection>('all');

  // Reset to 'all' if the selected year is no longer in the available list
  $effect(() => {
    if (typeof selectedYear === 'number' && !availableYears.includes(selectedYear)) {
      selectedYear = 'all';
    }
  });

  const ZERO = new BigNumber(0);

  const aggregateSummary = $derived.by((): TaxSummary | null => {
    if (summaries.size === 0) return null;
    const all = [...summaries.values()];
    return {
      taxYear: 0,
      currency: countryConfig.currency,
      totalProceeds:     all.reduce((s, y) => s.plus(y.totalProceeds),     ZERO),
      totalCostBasis:    all.reduce((s, y) => s.plus(y.totalCostBasis),    ZERO),
      totalGains:        all.reduce((s, y) => s.plus(y.totalGains),        ZERO),
      totalLosses:       all.reduce((s, y) => s.plus(y.totalLosses),       ZERO),
      netGainLoss:       all.reduce((s, y) => s.plus(y.netGainLoss),       ZERO),
      incomeFromMining:  all.reduce((s, y) => s.plus(y.incomeFromMining),  ZERO),
      incomeFromStaking: all.reduce((s, y) => s.plus(y.incomeFromStaking), ZERO),
      incomeFromAirdrops:all.reduce((s, y) => s.plus(y.incomeFromAirdrops),ZERO),
      totalIncome:       all.reduce((s, y) => s.plus(y.totalIncome),       ZERO),
      estimatedTax:      all.reduce((s, y) => s.plus(y.estimatedTax),      ZERO),
      lossCarryForward:  all.reduce((s, y) => s.plus(y.lossCarryForward),  ZERO),
      events:            all.flatMap((y) => y.events),
    };
  });

  const summary = $derived(
    selectedYear === 'all'
      ? aggregateSummary
      : (summaries.get(selectedYear) ?? null)
  );

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

  const yearButtonClass = (active: boolean) =>
    `rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'border-accent bg-accent text-white'
        : 'border-border bg-bg-card text-text-heading hover:border-accent-border'
    }`;
</script>

<section class="py-16">
  {#if transactions.length === 0}
    <div class="text-center">
      <h2 class="mb-4 font-heading text-2xl font-medium text-text-heading">No transactions</h2>
      <p class="text-sm text-text">Import a CSV file to see your tax report.</p>
    </div>
  {:else}
    <h2 class="mb-2 text-center font-heading text-2xl font-medium text-text-heading">
      Tax Report — {countryConfig.country}{selectedYear !== 'all' ? ` · ${selectedYear}` : ''}
    </h2>
    <p class="mx-auto mb-8 max-w-lg text-center text-sm text-text">
      {countryConfig.currency} · {countryConfig.defaultCostBasisMethod.toUpperCase()} method · {transactions.length} transactions
    </p>

    {#if availableYears.length > 0}
      <div class="mb-8 flex items-center justify-center gap-2 flex-wrap">
        <button class={yearButtonClass(selectedYear === 'all')} onclick={() => selectedYear = 'all'}>
          All
        </button>
        {#each availableYears as year}
          <button class={yearButtonClass(selectedYear === year)} onclick={() => selectedYear = year}>
            {year}
          </button>
        {/each}
      </div>
    {/if}

    {#if summary}
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
            <p class="mt-1 text-center text-xs text-text">{countryConfig.currency}</p>
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

      {#if summary.events.length > 0}
        <TaxEventsTable events={summary.events} />
      {/if}

      {#if visibleHoldings.length > 0}
        <SimulationPanel
          {transactions}
          holdings={visibleHoldings}
          summary={(selectedYear === 'all' ? summaries.get(new Date().getFullYear()) : undefined) ?? summary}
          {countryConfig}
        />
      {/if}
    {/if}

    {#if holdings.length > 0}
      <HoldingsTable
        {visibleHoldings}
        {dustHoldings}
        bind:hideDust
        bind:dustThresholdInput
        currency={countryConfig.currency}
      />
    {/if}

    <ActivitiesTable {transactions} />
  {/if}
</section>
