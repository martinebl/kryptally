<script lang="ts">
  import type { ColumnMapping, CustomImporterConfig } from '$lib/types';
  import { INPUT, LABEL, HINT, SECTION, SECTION_TITLE } from '$lib/components/importers/styles';

  interface Props {
    draft: CustomImporterConfig;
    /** Header row of the loaded sample; empty when no sample is loaded. */
    headers: string[];
  }

  let { draft = $bindable(), headers }: Props = $props();

  const ROLES: { key: keyof ColumnMapping; label: string; hint: string; required?: boolean }[] = [
    { key: 'date', label: 'Date', hint: 'When the activity happened', required: true },
    { key: 'asset', label: 'Asset', hint: 'Ticker of the crypto, e.g. BTC', required: true },
    { key: 'amount', label: 'Amount', hint: 'Quantity of the asset; the sign is ignored unless the type is "transfer by sign"', required: true },
    { key: 'total', label: 'Total value', hint: 'Value in the quote currency (wins over price)' },
    { key: 'price', label: 'Unit price', hint: 'Value = amount × price' },
    { key: 'fee', label: 'Fee', hint: 'Fee amount' },
    { key: 'txId', label: 'Transaction id', hint: 'Optional reference' },
    { key: 'notes', label: 'Notes', hint: 'Copied onto the transaction' },
  ];

  const allColumns = $derived([...new Set([...headers, ...draft.requiredColumns])]);

  const toggleRequired = (column: string) => {
    draft.requiredColumns = draft.requiredColumns.includes(column)
      ? draft.requiredColumns.filter((c) => c !== column)
      : [...draft.requiredColumns, column];
  };
</script>

<datalist id="sample-headers">
  {#each headers as h (h)}
    <option value={h}></option>
  {/each}
</datalist>

<div class={SECTION}>
  <h3 class={SECTION_TITLE}>Columns</h3>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    {#each ROLES as role (role.key)}
      <div>
        <label for="col-{role.key}" class={LABEL}>
          {role.label}{#if role.required}<span class="text-accent"> *</span>{/if}
        </label>
        <input
          id="col-{role.key}"
          class={INPUT}
          list="sample-headers"
          placeholder={headers.length > 0 ? 'Pick or type a column' : 'Column header'}
          bind:value={draft.columns[role.key]}
        />
        <p class={HINT}>{role.hint}</p>
      </div>
    {/each}
  </div>

  <fieldset class="mt-5">
    <legend class={LABEL}>Required columns</legend>
    <p class="{HINT} mb-2">A file is recognised as this format when it contains all of these.</p>
    {#if allColumns.length === 0}
      <p class="text-sm text-text-muted">Load a sample file to pick from its columns.</p>
    {:else}
      <div class="flex flex-wrap gap-2">
        {#each allColumns as column (column)}
          <label class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-text-heading">
            <input type="checkbox" checked={draft.requiredColumns.includes(column)} onchange={() => toggleRequired(column)} />
            {column}
          </label>
        {/each}
      </div>
    {/if}
  </fieldset>
</div>
