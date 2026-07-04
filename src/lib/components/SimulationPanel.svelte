<script lang="ts">
  import BigNumber from 'bignumber.js';
  import Card from '$lib/components/Card.svelte';
  import { valueColor } from '$lib/components/valueColor';
  import type { Transaction } from '$lib/types/transaction';
  import type { CountryConfig } from '$lib/types/tax-rules';
  import type { TaxSummary } from '$lib/types/results';

  interface Props {
    transactions: Transaction[];
    holdings: { asset: string; totalAmount: BigNumber }[];
    baseSummary: TaxSummary;
    simSummary: TaxSummary | null;
    unrealizedTotal: BigNumber;
    holdingsCount: number;
    unpriced: string[];
    loading: boolean;
    countryConfig: CountryConfig;
  }

  const {
    baseSummary,
    simSummary,
    unrealizedTotal,
    holdingsCount,
    unpriced,
    loading,
    countryConfig,
  }: Props = $props();

  const fmt = (v: BigNumber) => v.toFormat(2);
  const signed = (v: BigNumber) =>
    `${v.gt(0) ? '+' : v.lt(0) ? '−' : ''}${v.abs().toFormat(2)}`;

  let showDetail = $state(false);
</script>

<div class="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-border bg-bg-card p-6">
  <div>
    <div class="text-xs font-semibold uppercase tracking-wider text-text">Unrealized on current holdings</div>
    {#if loading}
      <div class="mt-2 h-9 w-52 animate-pulse rounded-lg bg-text/10"></div>
      <div class="mt-2.5 h-4 w-80 max-w-full animate-pulse rounded bg-text/10"></div>
    {:else}
      <div class="mt-2 flex items-baseline gap-2.5">
        <span class="font-mono text-3xl font-semibold {valueColor(unrealizedTotal)}">{signed(unrealizedTotal)}</span>
        <span class="text-sm text-text/40">{countryConfig.currency}</span>
      </div>
      <div class="mt-1.5 text-meta text-text/70">
        If you sold all {holdingsCount} held asset{holdingsCount === 1 ? '' : 's'} today, est. tax would be
        ≈ {simSummary ? fmt(simSummary.estimatedTax) : '—'} {countryConfig.currency}.
      </div>
    {/if}
  </div>
  <button
    onclick={() => (showDetail = !showDetail)}
    disabled={loading || !simSummary}
    class="cursor-pointer whitespace-nowrap rounded-xl border border-accent bg-accent px-6 py-3 text-nav font-semibold text-on-accent transition hover:opacity-90 disabled:opacity-50"
  >
    {showDetail ? 'Hide Simulation' : 'Simulate Full Sell'}
  </button>
</div>

{#if unpriced.length > 0}
  <div class="mt-4 rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning">
    Could not fetch price for: {unpriced.join(', ')}. These assets were excluded from the unrealized figures.
  </div>
{/if}

{#if showDetail && simSummary}
  {@const gainDelta = simSummary.netGainLoss.minus(baseSummary.netGainLoss)}
  {@const taxDelta = simSummary.estimatedTax.minus(baseSummary.estimatedTax)}
  <h3 class="mb-4 mt-6 font-heading text-lg font-medium text-text-heading">
    Simulated Tax Outcome (if sold today)
  </h3>
  <div class="grid grid-cols-3 gap-4 max-md:grid-cols-1">
    <Card title="Capital Gains (Simulated)">
      <div class="space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-text">Proceeds</span>
          <span class="font-mono text-text-heading">{fmt(simSummary.totalProceeds)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Cost basis</span>
          <span class="font-mono text-text-heading">{fmt(simSummary.totalCostBasis)}</span>
        </div>
        <div class="flex justify-between border-t border-border pt-2 text-sm font-medium">
          <span class="text-text-heading">Net gain/loss</span>
          <span class="font-mono {valueColor(simSummary.netGainLoss)}">{fmt(simSummary.netGainLoss)}</span>
        </div>
        <div class="flex justify-between text-xs text-text">
          <span>vs. actual</span>
          <span class="font-mono {valueColor(gainDelta)}">{gainDelta.gt(0) ? '+' : ''}{fmt(gainDelta)}</span>
        </div>
      </div>
    </Card>

    <Card title="Income (Simulated)">
      <div class="space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-text">Mining</span>
          <span class="font-mono text-text-heading">{fmt(simSummary.incomeFromMining)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Staking</span>
          <span class="font-mono text-text-heading">{fmt(simSummary.incomeFromStaking)}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-text">Airdrops</span>
          <span class="font-mono text-text-heading">{fmt(simSummary.incomeFromAirdrops)}</span>
        </div>
        <div class="flex justify-between border-t border-border pt-2 text-sm font-medium">
          <span class="text-text-heading">Total income</span>
          <span class="font-mono text-text-heading">{fmt(simSummary.totalIncome)}</span>
        </div>
      </div>
    </Card>

    <Card title="Estimated Tax (Simulated)">
      <div class="flex h-full flex-col justify-center">
        <p class="text-center font-mono text-3xl font-semibold {valueColor(simSummary.estimatedTax.negated())}">
          {fmt(simSummary.estimatedTax)}
        </p>
        <p class="mt-1 text-center text-xs text-text">{countryConfig.currency}</p>
        <p class="mt-2 text-center font-mono text-xs {valueColor(taxDelta.negated())}">
          {taxDelta.gt(0) ? '+' : ''}{fmt(taxDelta)} vs. actual
        </p>
      </div>
    </Card>
  </div>
{/if}
