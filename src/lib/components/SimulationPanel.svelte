<script lang="ts">
  import BigNumber from 'bignumber.js';
  import Card from '$lib/components/Card.svelte';
  import { TaxCalculator } from '$lib/engine/tax-calculator';
  import { LotTracker } from '$lib/engine/lot-tracker';
  import { buildSimulatedSells } from '$lib/engine/simulation';
  import { getCryptoConverter } from '$lib/context';
  import type { Transaction } from '$lib/types/transaction';
  import type { CountryConfig } from '$lib/types/tax-rules';
  import type { TaxSummary } from '$lib/types/results';

  interface Props {
    transactions: Transaction[];
    holdings: { asset: string; totalAmount: BigNumber }[];
    summary: TaxSummary;
    countryConfig: CountryConfig;
  }

  const { transactions, holdings, summary, countryConfig }: Props = $props();

  const fmt = (v: BigNumber) => v.toFormat(2);
  const gainColor = (v: BigNumber) =>
    v.gt(0) ? 'text-green-600' : v.lt(0) ? 'text-red-500' : 'text-text';
  const converter = getCryptoConverter();

  let simulationSummary = $state<TaxSummary | null>(null);
  let simulationUnpricedAssets = $state<string[]>([]);
  let simulationLoading = $state(false);

  async function runSimulation() {
    simulationLoading = true;
    const { transactions: syntheticSells, unpricedAssets } = await buildSimulatedSells(
      holdings, converter, new Date(), countryConfig.currency,
    );
    simulationUnpricedAssets = unpricedAssets;
    const tracker = new LotTracker(countryConfig.defaultCostBasisMethod);
    const calculator = new TaxCalculator(countryConfig.resolve, countryConfig.currency, tracker);
    const summaries = calculator.process([...transactions, ...syntheticSells]);
    const currentYear = new Date().getFullYear();
    simulationSummary = summaries.get(currentYear) ?? [...summaries.values()].at(-1) ?? null;
    simulationLoading = false;
  }

  function clearSimulation() {
    simulationSummary = null;
    simulationUnpricedAssets = [];
  }
</script>

<div class="mx-auto mb-10 max-w-2xl">
  {#if !simulationSummary}
    <button
      onclick={runSimulation}
      disabled={simulationLoading}
      class="w-full rounded-lg border border-border bg-bg-card px-6 py-3 text-sm font-medium text-text-heading transition hover:border-primary hover:text-primary disabled:opacity-50"
    >
      {simulationLoading ? 'Fetching prices...' : 'Simulate Full Sell'}
    </button>
    <p class="mt-2 text-center text-xs text-text">
      See estimated tax if you sold all {holdings.length} held asset{holdings.length > 1 ? 's' : ''} today
    </p>
  {:else}
    <button
      onclick={clearSimulation}
      class="mb-4 w-full rounded-lg border border-border bg-bg-card px-6 py-3 text-sm font-medium text-text-heading transition hover:border-red-400 hover:text-red-500"
    >
      Clear Simulation
    </button>
  {/if}
</div>

{#if simulationUnpricedAssets.length > 0}
  <div class="mx-auto mb-6 max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
    Could not fetch price for: {simulationUnpricedAssets.join(', ')}. These assets were excluded from the simulation.
  </div>
{/if}

{#if simulationSummary}
  {@const gainDelta = simulationSummary.netGainLoss.minus(summary.netGainLoss)}
  {@const taxDelta = simulationSummary.estimatedTax.minus(summary.estimatedTax)}
  <h3 class="mb-4 text-center font-heading text-lg font-medium text-text-heading">
    Simulated Tax Outcome (if sold today)
  </h3>
  <div class="mb-10 grid grid-cols-3 gap-4 max-md:grid-cols-1">
    <Card title="Capital Gains (Simulated)">
      <div class="space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-text">Proceeds</span>
          <span class="font-mono text-text-heading">{fmt(simulationSummary.totalProceeds)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Cost basis</span>
          <span class="font-mono text-text-heading">{fmt(simulationSummary.totalCostBasis)}</span>
        </div>
        <div class="border-t border-border pt-2 flex justify-between text-sm font-medium">
          <span class="text-text-heading">Net gain/loss</span>
          <span class="font-mono {gainColor(simulationSummary.netGainLoss)}">{fmt(simulationSummary.netGainLoss)}</span>
        </div>
        <div class="flex justify-between text-xs text-text">
          <span>vs. actual</span>
          <span class="font-mono {gainColor(gainDelta)}">{gainDelta.gt(0) ? '+' : ''}{fmt(gainDelta)}</span>
        </div>
      </div>
    </Card>

    <Card title="Income (Simulated)">
      <div class="space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-text">Mining</span>
          <span class="font-mono text-text-heading">{fmt(simulationSummary.incomeFromMining)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Staking</span>
          <span class="font-mono text-text-heading">{fmt(simulationSummary.incomeFromStaking)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Airdrops</span>
          <span class="font-mono text-text-heading">{fmt(simulationSummary.incomeFromAirdrops)}</span>
        </div>
        <div class="border-t border-border pt-2 flex justify-between text-sm font-medium">
          <span class="text-text-heading">Total income</span>
          <span class="font-mono text-text-heading">{fmt(simulationSummary.totalIncome)}</span>
        </div>
      </div>
    </Card>

    <Card title="Estimated Tax (Simulated)">
      <div class="flex h-full flex-col justify-center">
        <p class="text-center font-mono text-3xl font-semibold {gainColor(simulationSummary.estimatedTax.negated())}">
          {fmt(simulationSummary.estimatedTax)}
        </p>
        <p class="mt-1 text-center text-xs text-text">{countryConfig.currency}</p>
        <p class="mt-2 text-center text-xs font-mono {gainColor(taxDelta.negated())}">
          {taxDelta.gt(0) ? '+' : ''}{fmt(taxDelta)} vs. actual
        </p>
      </div>
    </Card>
  </div>
{/if}
