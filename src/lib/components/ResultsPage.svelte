<script lang="ts">
  import BigNumber from 'bignumber.js';
  import { onMount } from 'svelte';
  import SimulationPanel from '$lib/components/SimulationPanel.svelte';
  import HoldingsTable from '$lib/components/HoldingsTable.svelte';
  import TaxEventsTable from '$lib/components/TaxEventsTable.svelte';
  import { TaxCalculator } from '$lib/engine/tax-calculator';
  import { LotTracker } from '$lib/engine/lot-tracker';
  import { buildSellsFromPrices } from '$lib/engine/simulation';
  import { getCurrentPriceFetcher } from '$lib/context';
  import type { Transaction } from '$lib/types/transaction';
  import type { CountryConfig } from '$lib/types/tax-rules';
  import type { TaxSummary } from '$lib/types/results';
  import { filterDustHoldings } from '$lib/engine/dust-filter';
  import ActivitiesTable from '$lib/components/ActivitiesTable.svelte';

  interface Props {
    transactions: Transaction[];
    countryConfig: CountryConfig;
  }

  const { transactions, countryConfig }: Props = $props();

  // Mount the heavy tables only after the first frame is painted. WebKitGTK
  // (the Linux Tauri webview) spends a long time on the first style/layout/paint
  // of the full page; deferring the tables lets the hero + breakdown appear
  // immediately, with the tables filling in on the next frame.
  let deferredReady = $state(false);
  onMount(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => { deferredReady = true; }));
  });

  const fmt = (v: BigNumber) => v.toFormat(2);
  const signed = (v: BigNumber) =>
    `${v.gt(0) ? '+' : v.lt(0) ? '−' : ''}${v.abs().toFormat(2)}`;

  const priceFetcher = getCurrentPriceFetcher();

  const { summaries, holdings } = $derived.by(() => {
    const tracker = new LotTracker(countryConfig.defaultCostBasisMethod);
    const calculator = new TaxCalculator(countryConfig.resolve, countryConfig.currency, tracker);
    const summaries = calculator.process(transactions);
    const holdings = tracker.getHoldings().filter((h) => h.totalAmount.gt(0));
    return { summaries, holdings };
  });

  // Years with any activity, plus the current year, most recent first
  const availableYears = $derived(
    [...new Set([...summaries.keys(), new Date().getFullYear()])].sort((a, b) => b - a),
  );

  type YearSelection = number | 'all';
  let selectedYear = $state<YearSelection>('all');

  const effectiveYear = $derived(
    typeof selectedYear === 'number' && !availableYears.includes(selectedYear)
      ? 'all'
      : selectedYear,
  );

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
    effectiveYear === 'all'
      ? aggregateSummary
      : (summaries.get(effectiveYear) ?? null)
  );

  const periodLabel = $derived(effectiveYear === 'all' ? 'All years' : String(effectiveYear));

  // Transactions belonging to the selected tax year, used by the
  // "All Activity" table which is otherwise unaffected by the year picker.
  const visibleTransactions = $derived(
    effectiveYear === 'all'
      ? transactions
      : transactions.filter((tx) => tx.date.getFullYear() === effectiveYear),
  );

  // ----- current prices, shared by holdings table + simulation panel -----
  // Fetched once on load so the design's value/unrealized figures can populate.
  // Reuses the same machinery as the "Simulate Full Sell" flow.
  // `pricesLoading` is kept separate from `priceData` so the effect below only
  // ever writes these — reading its own state would make it self-triggering.
  type PriceData = {
    valueByAsset: Map<string, BigNumber>;
    unpriced: string[];
    simSummary: TaxSummary | null;
  };
  const emptyPriceData = (): PriceData => ({ valueByAsset: new Map(), unpriced: [], simSummary: null });
  // Start in the loading state so the price-dependent cells render as shimmer
  // on first paint rather than briefly flashing empty before the effect runs.
  let pricesLoading = $state(true);
  let priceData = $state<PriceData>(emptyPriceData());

  $effect(() => {
    const hs = holdings;
    const txs = transactions;
    const cc = countryConfig;
    if (hs.length === 0) {
      pricesLoading = false;
      priceData = emptyPriceData();
      return;
    }
    let cancelled = false;
    pricesLoading = true;
    (async () => {
      const now = new Date();
      const { prices } = await priceFetcher.fetchCurrentPrices(hs.map((h) => h.asset), cc.currency);
      if (cancelled) return;
      const { transactions: sells, unpriced } = buildSellsFromPrices(hs, prices, now, cc.currency);
      const valueByAsset = new Map<string, BigNumber>(
        sells.map((s) => [s.fromAsset as string, s.fiatValue as BigNumber]),
      );
      const tracker = new LotTracker(cc.defaultCostBasisMethod);
      const calculator = new TaxCalculator(cc.resolve, cc.currency, tracker);
      const sums = calculator.process([...txs, ...sells]);
      const currentYear = now.getFullYear();
      const simSummary = sums.get(currentYear) ?? [...sums.values()].at(-1) ?? null;
      priceData = { valueByAsset, unpriced, simSummary };
      pricesLoading = false;
    })().catch(() => {
      if (cancelled) return;
      priceData = emptyPriceData();
      pricesLoading = false;
    });
    return () => { cancelled = true; };
  });

  // Unrealized gain/loss across all current holdings (priced assets only).
  const unrealizedTotal = $derived.by(() =>
    holdings.reduce((sum, h) => {
      const value = priceData.valueByAsset.get(h.asset);
      return value ? sum.plus(value.minus(h.totalCostBasis)) : sum;
    }, ZERO),
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
    `cursor-pointer rounded-md border-none px-4 py-1.5 text-sm font-semibold transition-colors ${
      active ? 'bg-accent text-white' : 'bg-transparent text-text hover:text-text-heading'
    }`;
</script>

<section class="py-10">
  {#if transactions.length === 0}
    <div class="py-16 text-center">
      <h2 class="mb-4 font-heading text-2xl font-medium text-text-heading">No transactions</h2>
      <p class="text-sm text-text">Import a CSV file to see your tax report.</p>
    </div>
  {:else}
    <!-- Header + year selector -->
    <div class="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 class="m-0 font-heading text-3xl font-bold tracking-tight text-text-heading">
          Tax Report <span class="font-medium text-text/50">— {countryConfig.country}</span>
        </h1>
        <p class="mt-1.5 text-sm text-text">
          {countryConfig.currency} · {countryConfig.defaultCostBasisMethod.toUpperCase()} method ·
          {transactions.length} transactions · {periodLabel}
        </p>
      </div>
      {#if availableYears.length > 0}
        <div class="flex gap-1.5 rounded-xl bg-bg-card p-1">
          <button class={yearButtonClass(effectiveYear === 'all')} onclick={() => (selectedYear = 'all')}>
            All
          </button>
          {#each availableYears as year}
            <button class={yearButtonClass(effectiveYear === year)} onclick={() => (selectedYear = year)}>
              {year}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if summary}
    <!-- Hero -->
    {@const total = summary.totalGains.plus(summary.totalLosses)}
    {@const gainPct = total.gt(0) ? summary.totalGains.div(total).times(100).toNumber() : 50}
    <div class="mt-6 flex flex-wrap rounded-2xl border border-border bg-bg shadow-sm">
      <!-- Realized result -->
      <div class="min-w-[320px] flex-[1.7] p-8">
        <div class="text-xs font-semibold uppercase tracking-wider text-text">
          {summary.netGainLoss.gte(0) ? 'Net realized gain' : 'Net realized loss'} · {periodLabel}
        </div>
        <div class="mt-2.5 font-mono text-5xl font-semibold leading-none tracking-tight {gainColor(summary.netGainLoss)}">
          {signed(summary.netGainLoss)}<span class="ml-2 text-xl text-text/40">{countryConfig.currency}</span>
        </div>

        <!-- Gains / losses bar -->
        <div class="mt-6">
          <div class="mb-1.5 flex justify-between text-meta">
            <span class="font-medium text-green-600">Gains <span class="font-mono">{fmt(summary.totalGains)}</span></span>
            <span class="font-medium text-red-500">Losses <span class="font-mono">{fmt(summary.totalLosses)}</span></span>
          </div>
          <div class="flex h-2.5 overflow-hidden rounded-md bg-bg-card">
            <div class="bg-green-500" style="width: {gainPct}%"></div>
            <div class="bg-red-400" style="width: {100 - gainPct}%"></div>
          </div>
        </div>
      </div>

      <!-- Taxable income + estimated tax -->
      <div class="flex min-w-[240px] flex-1 flex-col gap-5 border-t border-border p-8 md:border-l md:border-t-0">
        <div>
          <div class="text-xs font-semibold uppercase tracking-wider text-text">Taxable income</div>
          <div class="mt-2 font-mono text-2xl font-semibold text-text-heading">
            {fmt(summary.totalIncome)} <span class="text-sm text-text/40">{countryConfig.currency}</span>
          </div>
          <div class="mt-1 text-xs text-text/70">Mining, staking &amp; airdrops</div>
        </div>

        <div class="mt-auto border-t border-dashed border-border pt-4">
          <div class="flex items-baseline gap-2">
              <span class="text-meta text-text">Estimated tax</span>
              <span class="font-mono text-nav font-medium text-text-heading">≈ {fmt(summary.estimatedTax)} {countryConfig.currency}</span>
          </div>
          <p class="mt-1.5 text-tag leading-relaxed text-text/60">
            Very rough estimate — excludes your personal income, deductions &amp; the asymmetric treatment of
            crypto losses. For orientation only, not tax advice.
          </p>
        </div>
      </div>
    </div>

    <!-- Breakdown -->
    <div class="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1">
      <div class="rounded-2xl border border-border bg-bg-card p-6">
        <h3 class="mb-3.5 font-heading text-nav font-semibold text-text-heading">Capital Gains</h3>
        <div class="flex justify-between py-1.5 text-sm text-text"><span>Proceeds</span><span class="font-mono text-text-heading">{fmt(summary.totalProceeds)}</span></div>
        <div class="flex justify-between py-1.5 text-sm text-text"><span>Cost basis</span><span class="font-mono text-text-heading">{fmt(summary.totalCostBasis)}</span></div>
        <div class="mt-2 flex justify-between border-t border-border pt-2.5 text-sm font-semibold"><span class="text-text-heading">Net gain/loss</span><span class="font-mono {gainColor(summary.netGainLoss)}">{signed(summary.netGainLoss)}</span></div>
      </div>
      <div class="rounded-2xl border border-border bg-bg-card p-6">
        <h3 class="mb-3.5 font-heading text-nav font-semibold text-text-heading">Income</h3>
        <div class="flex justify-between py-1.5 text-sm text-text"><span>Mining</span><span class="font-mono text-text-heading">{fmt(summary.incomeFromMining)}</span></div>
        <div class="flex justify-between py-1.5 text-sm text-text"><span>Staking</span><span class="font-mono text-text-heading">{fmt(summary.incomeFromStaking)}</span></div>
        <div class="flex justify-between py-1.5 text-sm text-text"><span>Airdrops</span><span class="font-mono text-text-heading">{fmt(summary.incomeFromAirdrops)}</span></div>
        <div class="mt-2 flex justify-between border-t border-border pt-2.5 text-sm font-semibold"><span class="text-text-heading">Total income</span><span class="font-mono text-text-heading">{fmt(summary.totalIncome)}</span></div>
      </div>
    </div>

    {#if deferredReady}
        <div class="mt-10">
          <TaxEventsTable events={summary.events} {periodLabel} method={countryConfig.defaultCostBasisMethod} currency={countryConfig.currency} />
        </div>

      {#if holdings.length > 0}
        <div class="mt-10">
          <SimulationPanel
            {transactions}
            holdings={visibleHoldings}
            baseSummary={summary}
            simSummary={priceData.simSummary}
            {unrealizedTotal}
            holdingsCount={holdings.length}
            unpriced={priceData.unpriced}
            loading={pricesLoading}
            {countryConfig}
          />
        </div>

        <div class="mt-10">
          <HoldingsTable
            {visibleHoldings}
            {dustHoldings}
            bind:hideDust
            bind:dustThresholdInput
            valueByAsset={priceData.valueByAsset}
            pricesLoading={pricesLoading}
            currency={countryConfig.currency}
          />
        </div>
      {/if}

      <div class="mt-10">
        <ActivitiesTable transactions={visibleTransactions} />
      </div>
    {:else}
      <!-- Placeholder shown for one frame while the tables mount -->
      <div class="mt-10 space-y-4">
        <div class="h-7 w-44 animate-pulse rounded bg-text/10"></div>
        <div class="h-72 animate-pulse rounded-2xl border border-border bg-bg-card"></div>
      </div>
    {/if}
    {:else}
      <div class="py-16 text-center">
        <h2 class="mb-4 font-heading text-2xl font-medium text-text-heading">No activity in {periodLabel}</h2>
        <p class="text-sm text-text">No transactions were recorded for this year.</p>
      </div>
    {/if}
  {/if}
</section>
