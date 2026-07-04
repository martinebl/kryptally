<script lang="ts">
    import BigNumber from 'bignumber.js';
    import type { LotTracker } from '$lib/engine/lot-tracker';
    import Table from '$lib/components/Table.svelte';
    import { valueColor } from '$lib/components/valueColor';

    type Holding = ReturnType<LotTracker['getHoldings']>[number];

    interface Props {
        visibleHoldings: Holding[];
        dustHoldings: Holding[];
        hideDust: boolean;
        dustThresholdInput: string;
        valueByAsset: Map<string, BigNumber>;
        pricesLoading: boolean;
        currency: string;
    }

    let {
        visibleHoldings,
        dustHoldings,
        hideDust = $bindable(),
        dustThresholdInput = $bindable(),
        valueByAsset,
        pricesLoading,
        currency,
    }: Props = $props();

    const fmt = (v: BigNumber) => v.toFormat(2);
    // Small per-unit prices (e.g. SHIB) need more precision than 2 dp.
    const fmtUnit = (v: BigNumber) =>
        v.abs().lt(1) ? v.toFormat(8) : v.toFormat(2);
    const signed = (v: BigNumber) =>
        `${v.gt(0) ? '+' : v.lt(0) ? '−' : ''}${v.abs().toFormat(2)}`;

    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const filterFn = (h: Holding, q: string) => h.asset.toLowerCase().includes(q);
</script>

<div>
    <div class="mb-2 flex flex-wrap items-center justify-between gap-4">
        <h3 class="font-heading text-xl font-semibold tracking-tight text-text-heading">Current Holdings</h3>
        <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 text-sm text-text">
                <input type="checkbox" bind:checked={hideDust}
                    class="h-4 w-4 rounded border-border accent-text" />
                Hide dust below
                <input type="text" bind:value={dustThresholdInput}
                    class="w-14 rounded-md border border-border bg-bg px-2 py-1 text-right font-mono text-sm text-text-heading
                        {hideDust ? '' : 'opacity-50'}"
                    disabled={!hideDust} />
                <span class="text-xs text-text">{currency}</span>
            </label>
            {#if hideDust && dustHoldings.length > 0}
                <span class="text-xs text-text">({dustHoldings.length} hidden)</span>
            {/if}
        </div>
    </div>
    <p class="mb-3 text-xs text-text/60">
        {pricesLoading ? 'Fetching current prices…' : `Prices as of ${today}`}
    </p>
    <Table rows={visibleHoldings} {filterFn}>
        {#snippet headers()}
            <th class="px-4 py-3">Asset</th>
            <th class="px-4 py-3 text-right">Amount</th>
            <th class="px-4 py-3 text-right">Total Cost Basis</th>
            <th class="px-4 py-3 text-right">Avg Cost / Unit</th>
            <th class="px-4 py-3 text-right">Value Today</th>
            <th class="px-4 py-3 text-right">Unrealized</th>
        {/snippet}
        {#snippet row(holding)}
            {@const avgCost = holding.totalCostBasis.div(holding.totalAmount)}
            {@const value = valueByAsset.get(holding.asset)}
            <td class="px-4 py-3 font-medium text-text-heading">{holding.asset}</td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">{holding.totalAmount.toFormat(8)}</td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">{fmt(holding.totalCostBasis)} <span class="text-text/50">{currency}</span></td>
            <td class="px-4 py-3 text-right font-mono text-text">{fmtUnit(avgCost)} <span class="text-text/50">{currency}</span></td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">
                {#if pricesLoading}<span class="inline-block h-4 w-24 animate-pulse rounded bg-text/10 align-middle"></span>
                {:else if value}{fmt(value)} <span class="text-text/50">{currency}</span>
                {:else}<span class="text-text/40">—</span>{/if}
            </td>
            <td class="px-4 py-3 text-right font-mono font-medium {!pricesLoading && value ? valueColor(value.minus(holding.totalCostBasis)) : 'text-text/40'}">
                {#if pricesLoading}<span class="inline-block h-4 w-16 animate-pulse rounded bg-text/10 align-middle"></span>
                {:else if value}{signed(value.minus(holding.totalCostBasis))}
                {:else}—{/if}
            </td>
        {/snippet}
    </Table>
</div>
