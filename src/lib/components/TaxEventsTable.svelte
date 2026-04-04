<script lang="ts">
  import BigNumber from 'bignumber.js';
  import type { TaxableEvent } from '$lib/types/results';

  interface Props {
    events: TaxableEvent[];
  }

  const { events }: Props = $props();

  const sortedEvents = $derived(
    [...events].sort((a, b) => b.date.getTime() - a.date.getTime())
  );

  const fmt = (v: BigNumber) => v.toFormat(2);

  const gainColor = (v: BigNumber) =>
    v.gt(0) ? 'text-green-600' : v.lt(0) ? 'text-red-500' : 'text-text';

  const eventTypeLabel = (e: TaxableEvent) =>
    e.type === 'income' ? 'Income' : 'Disposal';
</script>

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
      {#each sortedEvents as event}
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
