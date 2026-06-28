<script lang="ts">
    import BigNumber from 'bignumber.js';
    import type { TaxableEvent } from '$lib/types/results';
    import type { CostBasisMethod } from '$lib/types/tax-rules';
    import Table from '$lib/components/Table.svelte';
    import Badge from '$lib/components/Badge.svelte';

    interface Props {
        events: TaxableEvent[];
        periodLabel?: string;
        method: CostBasisMethod;
    }

    const { events, periodLabel, method }: Props = $props();

    const subtitle = $derived(`Every disposal and income event, with the ${method.toUpperCase()} lots it was matched against.`);

    const sortedEvents = $derived(
        [...events].sort((a, b) => b.date.getTime() - a.date.getTime())
    );

    const fmt = (v: BigNumber) => v.toFormat(2);
    const signed = (v: BigNumber) =>
        `${v.gt(0) ? '+' : v.lt(0) ? '−' : ''}${v.abs().toFormat(2)}`;

    const gainColor = (v: BigNumber) =>
        v.gt(0) ? 'text-green-600' : v.lt(0) ? 'text-red-500' : 'text-text';

    const eventTypeLabel = (e: TaxableEvent) =>
        e.type === 'income' ? 'Income' : 'Disposal';

    const filterFn = (e: TaxableEvent, q: string) =>
        e.asset.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        e.date.toISOString().slice(0, 10).includes(q);
</script>

<div class="mb-10">
    {#if sortedEvents.length > 0}
    <Table rows={sortedEvents} {filterFn} title="Tax Events"
        {subtitle}>
        {#snippet headers()}
            <th class="px-4 py-3">Date</th>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Asset</th>
            <th class="px-4 py-3 text-right">Amount</th>
            <th class="px-4 py-3 text-right">Proceeds</th>
            <th class="px-4 py-3 text-right">Cost Basis</th>
            <th class="px-4 py-3 text-right">Gain / Loss</th>
        {/snippet}
        {#snippet row(event)}
            <td class="px-4 py-3 font-mono text-text-heading">
                {event.date.toISOString().slice(0, 10)}
            </td>
            <td class="px-4 py-3">
                <Badge color={event.type === 'income' ? 'blue' : 'amber'}>
                    {eventTypeLabel(event)}
                </Badge>
            </td>
            <td class="px-4 py-3 font-medium text-text-heading">{event.asset}</td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">{event.amount.toFormat(6)}</td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">{fmt(event.proceeds)}</td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">{fmt(event.costBasis)}</td>
            <td class="px-4 py-3 text-right font-mono font-medium {gainColor(event.gainLoss)}">
                {signed(event.gainLoss)}
            </td>
        {/snippet}
    </Table>
    {:else}
    <div class="mb-4">
        <h3 class="font-heading text-xl font-semibold tracking-tight text-text-heading">Tax Events</h3>
        <p class="mt-0.5 text-meta text-text/80">{subtitle}</p>
    </div>
    <div class="rounded-xl border border-border p-8 text-center text-sm text-text">
        No tax events for {periodLabel ?? 'this period'}
    </div>
    {/if}
</div>
