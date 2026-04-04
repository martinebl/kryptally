<script lang="ts">
  import BigNumber from 'bignumber.js';
  import type { LotTracker } from '$lib/engine/lot-tracker';

  type Holding = ReturnType<LotTracker['getHoldings']>[number];

  interface Props {
    visibleHoldings: Holding[];
    dustHoldings: Holding[];
    hideDust: boolean;
    dustThresholdInput: string;
    currency: string;
  }

  let {
    visibleHoldings,
    dustHoldings,
    hideDust = $bindable(),
    dustThresholdInput = $bindable(),
    currency,
  }: Props = $props();

  const fmt = (v: BigNumber) => v.toFormat(2);
</script>

<div class="mb-4 flex items-center justify-between">
  <h3 class="font-heading text-lg font-medium text-text-heading">Current Holdings</h3>
  <div class="flex items-center gap-3">
    <label class="flex items-center gap-2 text-sm text-text">
      <input type="checkbox" bind:checked={hideDust}
        class="h-4 w-4 rounded border-border accent-purple-600" />
      Hide dust below
    </label>
    <div class="flex items-center gap-1">
      <input type="text" bind:value={dustThresholdInput}
        class="w-16 rounded border border-border bg-bg-card px-2 py-1 text-right font-mono text-sm text-text-heading
          {hideDust ? '' : 'opacity-50'}"
        disabled={!hideDust} />
      <span class="text-xs text-text">{currency}</span>
    </div>
    {#if hideDust && dustHoldings.length > 0}
      <span class="text-xs text-text">({dustHoldings.length} hidden)</span>
    {/if}
  </div>
</div>
<div class="mb-10 overflow-x-auto rounded-xl border border-border">
  <table class="w-full text-left text-sm">
    <thead>
      <tr class="border-b border-border bg-bg-card text-xs uppercase tracking-wide text-text">
        <th class="px-4 py-3">Asset</th>
        <th class="px-4 py-3 text-right">Amount</th>
        <th class="px-4 py-3 text-right">Total Cost Basis</th>
        <th class="px-4 py-3 text-right">Avg Cost / Unit</th>
      </tr>
    </thead>
    <tbody>
      {#each visibleHoldings as holding}
        {@const avgCost = holding.totalCostBasis.div(holding.totalAmount)}
        <tr class="border-b border-border last:border-none hover:bg-bg-card/50">
          <td class="px-4 py-3 font-medium text-text-heading">{holding.asset}</td>
          <td class="px-4 py-3 text-right font-mono text-text-heading">{holding.totalAmount.toFormat(8)}</td>
          <td class="px-4 py-3 text-right font-mono text-text-heading">{fmt(holding.totalCostBasis)} {currency}</td>
          <td class="px-4 py-3 text-right font-mono text-text">{fmt(avgCost)} {currency}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
