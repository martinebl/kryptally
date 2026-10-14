<script lang="ts">
  import type { CustomImporterConfig, FeeCurrencySource, QuoteCurrencySource } from '$lib/types';
  import { PREPROCESSORS } from '$lib/preprocessors';
  import { INPUT, LABEL, HINT, SECTION, SECTION_TITLE } from '$lib/components/importers/styles';

  interface Props {
    draft: CustomImporterConfig;
  }

  let { draft = $bindable() }: Props = $props();

  const QUOTE_MODES = [
    { value: '', label: 'Not in the file' },
    { value: 'fixed', label: 'Always the same currency' },
    { value: 'column', label: 'From a column' },
    { value: 'embedded', label: 'Inside the value cell ($12, 12 EUR)' },
  ];

  const FEE_MODES = [
    { value: '', label: 'Default (quote currency, else the asset)' },
    { value: 'quote', label: 'Quote currency' },
    { value: 'asset', label: 'The asset itself' },
    { value: 'fixed', label: 'Always the same currency' },
    { value: 'column', label: 'From a column' },
    { value: 'embedded', label: 'Inside the fee cell' },
  ];

  const sourceFor = (mode: string): FeeCurrencySource | undefined =>
    mode === 'fixed' ? { mode: 'fixed', value: '' }
    : mode === 'column' ? { mode: 'column', column: '' }
    : mode === 'embedded' || mode === 'quote' || mode === 'asset' ? { mode }
    : undefined;

  const togglePreprocessor = (id: string) => {
    draft.preprocessors = draft.preprocessors.includes(id)
      ? draft.preprocessors.filter((p) => p !== id)
      : [...draft.preprocessors, id];
  };
</script>

{#snippet sourceDetail(source: QuoteCurrencySource | FeeCurrencySource | undefined, idPrefix: string)}
  {#if source?.mode === 'fixed'}
    <input id="{idPrefix}-value" class="{INPUT} mt-2" aria-label="Currency code" placeholder="e.g. EUR" bind:value={source.value} />
  {:else if source?.mode === 'column'}
    <input id="{idPrefix}-column" class="{INPUT} mt-2" aria-label="Currency column" list="sample-headers" placeholder="Column" bind:value={source.column} />
  {/if}
{/snippet}

<div class={SECTION}>
  <h3 class={SECTION_TITLE}>Currencies & options</h3>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div>
      <label for="quote-mode" class={LABEL}>Quote currency</label>
      <select
        id="quote-mode"
        class={INPUT}
        value={draft.quoteCurrency?.mode ?? ''}
        onchange={(e) => { draft.quoteCurrency = sourceFor(e.currentTarget.value) as QuoteCurrencySource | undefined; }}
      >
        {#each QUOTE_MODES as m (m.value)}
          <option value={m.value}>{m.label}</option>
        {/each}
      </select>
      {@render sourceDetail(draft.quoteCurrency, 'quote')}
      <p class={HINT}>The currency the price/total is in. Any value the file provides is kept; a crypto quote turns buys/sells into trades.</p>
    </div>

    <div>
      <label for="fee-mode" class={LABEL}>Fee currency</label>
      <select
        id="fee-mode"
        class={INPUT}
        value={draft.feeCurrency?.mode ?? ''}
        onchange={(e) => { draft.feeCurrency = sourceFor(e.currentTarget.value); }}
      >
        {#each FEE_MODES as m (m.value)}
          <option value={m.value}>{m.label}</option>
        {/each}
      </select>
      {@render sourceDetail(draft.feeCurrency, 'fee')}
    </div>

    <div>
      <label for="notes-prefix" class={LABEL}>Notes prefix</label>
      <input id="notes-prefix" class={INPUT} placeholder="Optional, e.g. tx: " bind:value={draft.notesPrefix} />
    </div>

    <fieldset>
      <legend class={LABEL}>Import options</legend>
      {#each Object.values(PREPROCESSORS) as p (p.id)}
        <label class="flex cursor-pointer items-start gap-2 text-sm text-text-heading">
          <input type="checkbox" class="mt-1" checked={draft.preprocessors.includes(p.id)} onchange={() => togglePreprocessor(p.id)} />
          <span>{p.label}<span class="block text-xs text-text">{p.description}</span></span>
        </label>
      {/each}
    </fieldset>
  </div>
</div>
