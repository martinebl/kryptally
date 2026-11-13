<script lang="ts">
  import type BigNumber from 'bignumber.js';
  import type { CustomImporterConfig } from '$lib/types';
  import { previewImport } from '$lib/importers/custom';
  import { SECTION, SECTION_TITLE } from '$lib/components/importers/styles';

  interface Props {
    config: CustomImporterConfig;
    sample: string;
  }

  const { config, sample }: Props = $props();

  const PREVIEW_ROWS = 10;

  const preview = $derived(sample ? previewImport(config, sample, PREVIEW_ROWS) : undefined);

  const leg = (asset?: string, amount?: BigNumber) => (asset && amount ? `${amount.toFixed()} ${asset}` : '—');
</script>

<div class={SECTION}>
  <h3 class={SECTION_TITLE}>Preview</h3>
  {#if !preview}
    <p class="text-sm text-text-muted">Load a sample file to see how it will be imported.</p>
  {:else if preview.error}
    <p class="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">{preview.error}</p>
  {:else if preview.total === 0}
    <p class="text-sm text-text-muted">No transactions found in the sample.</p>
  {:else}
    <p class="mb-3 text-sm text-text">
      {preview.total} transaction{preview.total === 1 ? '' : 's'} parsed{preview.total > PREVIEW_ROWS ? `, showing the first ${PREVIEW_ROWS}` : ''}.
    </p>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead class="text-text-muted">
          <tr>
            <th class="py-1.5 pr-3 font-medium">Date</th>
            <th class="py-1.5 pr-3 font-medium">Type</th>
            <th class="py-1.5 pr-3 font-medium">Sent</th>
            <th class="py-1.5 pr-3 font-medium">Received</th>
            <th class="py-1.5 pr-3 font-medium">Fee</th>
            <th class="py-1.5 font-medium">Value</th>
          </tr>
        </thead>
        <tbody class="font-mono text-text-heading">
          {#each preview.transactions as tx (tx.id)}
            <tr class="border-t border-border-soft">
              <td class="py-1.5 pr-3 whitespace-nowrap">{tx.date.toISOString().replace('T', ' ').slice(0, 19)}</td>
              <td class="py-1.5 pr-3">{tx.type}</td>
              <td class="py-1.5 pr-3">{leg(tx.fromAsset, tx.fromAmount)}</td>
              <td class="py-1.5 pr-3">{leg(tx.toAsset, tx.toAmount)}</td>
              <td class="py-1.5 pr-3">{leg(tx.feeAsset, tx.feeAmount)}</td>
              <td class="py-1.5">{leg(tx.fiatCurrency, tx.fiatValue)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
