<script lang="ts">
    import BigNumber from 'bignumber.js';
    import type { TaxableEvent } from '$lib/types/results';
    import type { CostBasisMethod } from '$lib/types/tax-rules';
    import Table from '$lib/components/Table.svelte';
    import Badge from '$lib/components/Badge.svelte';
    import { valueColor } from '$lib/components/valueColor';

    interface Props {
        events: TaxableEvent[];
        periodLabel?: string;
        method: CostBasisMethod;
        currency: string;
    }

    const { events, periodLabel, method, currency }: Props = $props();

    const subtitle = $derived(`Every disposal and income event, with the ${method.toUpperCase()} lots it was matched against.`);

    const sortedEvents = $derived(
        [...events].sort((a, b) => b.date.getTime() - a.date.getTime())
    );

    const fmt = (v: BigNumber) => v.toFormat(2);
    const signed = (v: BigNumber) =>
        `${v.gt(0) ? '+' : v.lt(0) ? '−' : ''}${v.abs().toFormat(2)}`;

    const eventTypeLabel = (e: TaxableEvent) =>
        e.type === 'income' ? 'Income' : 'Disposal';

    const filterFn = (e: TaxableEvent, q: string) =>
        e.asset.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        e.date.toISOString().slice(0, 10).includes(q);

    const canExpand = (e: TaxableEvent) => e.type === 'disposal' && e.lots.length > 0;

    const heldDuration = (days: number): string => {
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        if (years > 0 && months > 0) return `${years} yr ${months} mo`;
        if (years > 0) return `${years} yr`;
        if (months > 0) return `${months} mo`;
        return `${days} d`;
    };
</script>

<div class="mb-10">
    {#if sortedEvents.length > 0}
    <Table rows={sortedEvents} {filterFn} title="Tax Events"
        {subtitle} {canExpand}>
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
            <td class="px-4 py-3 text-right font-mono text-text-heading">
                {fmt(event.proceeds)} <span class="text-text/40">{currency}</span>
            </td>
            <td class="px-4 py-3 text-right font-mono text-text-heading">
                {fmt(event.costBasis)} <span class="text-text/40">{currency}</span>
            </td>
            <td class="px-4 py-3 text-right font-mono font-medium {valueColor(event.gainLoss)}">
                {signed(event.gainLoss)} <span class="text-text/40">{currency}</span>
            </td>
        {/snippet}
        {#snippet expandedRow(event)}
            {@const totalConsumed = event.lots.reduce((s, u) => s.plus(u.amountUsed), new BigNumber(0))}
            {@const totalBasis = event.lots.reduce((s, u) => s.plus(u.amountUsed.times(u.lot.costBasisPerUnit)), new BigNumber(0))}
            <td colspan="8" class="p-0">
                <div class="border-t-2 border-accent">
                    <!-- Event summary header -->
                    <div class="flex items-center justify-between gap-6 border-b border-border bg-surface px-5 py-3.5">
                        <div>
                            <div class="font-mono text-sm font-semibold text-text-heading">{event.asset} Disposal</div>
                            <div class="font-mono text-xs text-text">{event.date.toISOString().slice(0, 10)}</div>
                        </div>
                        <div class="flex gap-9">
                            <div>
                                <div class="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">Proceeds</div>
                                <div class="font-mono text-sm text-text-heading">{fmt(event.proceeds)} <span class="text-text/40">{currency}</span></div>
                            </div>
                            <div>
                                <div class="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">Cost Basis</div>
                                <div class="font-mono text-sm text-text-heading">{fmt(event.costBasis)} <span class="text-text/40">{currency}</span></div>
                            </div>
                            <div>
                                <div class="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">Gain / Loss</div>
                                <div class="font-mono text-sm font-semibold {valueColor(event.gainLoss)}">{signed(event.gainLoss)} <span class="text-text/40">{currency}</span></div>
                            </div>
                        </div>
                    </div>
                    <!-- Lot table: column widths are determined by content + padding, no explicit sizes needed -->
                    <table class="w-full text-left text-sm">
                        <thead>
                            <tr class="border-b border-border bg-bg-card/50 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                <th class="px-5 py-2 font-semibold">Acquired</th>
                                <th class="px-5 py-2 font-semibold text-right">Lot Size</th>
                                <th class="px-5 py-2 font-semibold text-right">Consumed</th>
                                <th class="px-5 py-2 font-semibold text-right">Cost / Unit</th>
                                <th class="px-5 py-2 font-semibold text-right">Cost Basis</th>
                                <th class="px-5 py-2 font-semibold">Held</th>
                                <th class="px-5 py-2 font-semibold">Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each event.lots as usage, i}
                            <tr class="{i < event.lots.length - 1 ? 'border-b border-border-soft' : ''}">
                                <td class="px-5 py-3 font-mono text-xs text-text">
                                    {usage.lot.dateAcquired.toISOString().slice(0, 10)}
                                </td>
                                <td class="px-5 py-3 font-mono text-xs text-right text-text">
                                    {usage.lot.amount.toFormat(6)}
                                </td>
                                <td class="px-5 py-3 font-mono text-xs text-right text-text">
                                    {usage.amountUsed.toFormat(6)}
                                </td>
                                <td class="px-5 py-3 font-mono text-xs text-right text-text">
                                    {usage.lot.costBasisPerUnit.toFormat(2)}
                                </td>
                                <td class="px-5 py-3 font-mono text-xs text-right text-text">
                                    {usage.amountUsed.times(usage.lot.costBasisPerUnit).toFormat(2)}
                                </td>
                                <td class="px-5 py-3">
                                    <div class="flex items-center gap-1.5">
                                        <span class="font-mono text-xs {usage.isLongTerm ? 'text-positive' : 'text-text'}">
                                            {heldDuration(usage.holdingDays)}
                                        </span>
                                        {#if usage.isLongTerm}
                                            <Badge color="success" variant="outlined">LT</Badge>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-5 py-3 text-xs text-text" title={usage.lot.source}>
                                    {usage.lot.source}
                                </td>
                            </tr>
                            {/each}
                        </tbody>
                        <tfoot>
                            <tr class="border-t border-border bg-surface">
                                <td class="px-5 py-2 font-mono text-[11px] text-text-muted">
                                    {event.lots.length} lot{event.lots.length !== 1 ? 's' : ''}
                                </td>
                                <td></td>
                                <td class="px-5 py-2 font-mono text-xs font-semibold text-right text-text-heading">
                                    {totalConsumed.toFormat(6)}
                                </td>
                                <td></td>
                                <td class="px-5 py-2 font-mono text-xs font-bold text-right text-text-heading">
                                    {totalBasis.toFormat(2)}
                                </td>
                                <td></td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
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
