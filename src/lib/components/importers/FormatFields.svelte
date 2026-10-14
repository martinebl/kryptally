<script lang="ts">
  import type { CustomImporterConfig, DateFormatId } from '$lib/types';
  import { DATE_FORMAT_IDS } from '$lib/types';
  import { INPUT, LABEL, HINT, SECTION, SECTION_TITLE } from '$lib/components/importers/styles';

  interface Props {
    draft: CustomImporterConfig;
  }

  let { draft = $bindable() }: Props = $props();

  const DELIMITERS: { value: CustomImporterConfig['delimiter']; label: string }[] = [
    { value: ',', label: 'Comma ( , )' },
    { value: ';', label: 'Semicolon ( ; )' },
    { value: '\t', label: 'Tab' },
  ];

  const setHeaderMode = (mode: string) => {
    draft.header = mode === 'skip' ? { mode: 'skip', rows: 0 } : { mode: 'auto' };
  };

  const toggleDateFormat = (format: DateFormatId) => {
    draft.dateFormats = draft.dateFormats.includes(format)
      ? draft.dateFormats.filter((f) => f !== format)
      : [...draft.dateFormats, format];
  };
</script>

<div class={SECTION}>
  <h3 class={SECTION_TITLE}>File format</h3>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div class="md:col-span-2">
      <label for="importer-name" class={LABEL}>Name</label>
      <input id="importer-name" class={INPUT} bind:value={draft.name} placeholder="e.g. My Exchange" />
      <p class={HINT}>Shown as the exchange on imported transactions. Renaming later won't relabel past imports.</p>
    </div>

    <div>
      <label for="header-mode" class={LABEL}>Header row</label>
      <select id="header-mode" class={INPUT} value={draft.header.mode} onchange={(e) => setHeaderMode(e.currentTarget.value)}>
        <option value="auto">Find automatically</option>
        <option value="skip">Skip a fixed number of rows</option>
      </select>
    </div>

    {#if draft.header.mode === 'skip'}
      <div>
        <label for="skip-rows" class={LABEL}>Rows to skip before the header</label>
        <input id="skip-rows" type="number" min="0" step="1" class={INPUT} bind:value={draft.header.rows} />
      </div>
    {:else}
      <p class="{HINT} self-end">Uses the first line containing all required columns.</p>
    {/if}

    <div>
      <label for="delimiter" class={LABEL}>Delimiter</label>
      <select id="delimiter" class={INPUT} bind:value={draft.delimiter}>
        {#each DELIMITERS as d (d.value)}
          <option value={d.value}>{d.label}</option>
        {/each}
      </select>
    </div>

    <div>
      <label for="decimal" class={LABEL}>Decimal separator</label>
      <select id="decimal" class={INPUT} bind:value={draft.decimalSeparator}>
        <option value=".">Dot (1,234.56)</option>
        <option value=",">Comma (1.234,56)</option>
      </select>
    </div>

    <fieldset class="md:col-span-2">
      <legend class={LABEL}>Date formats <span class="font-normal text-text">(tried in the order selected)</span></legend>
      <div class="flex flex-wrap gap-2">
        {#each DATE_FORMAT_IDS as format (format)}
          {@const position = draft.dateFormats.indexOf(format)}
          <button
            type="button"
            class="cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors
              {position >= 0 ? 'border-accent bg-accent-bg text-text-heading' : 'border-border text-text hover:border-accent'}"
            onclick={() => toggleDateFormat(format)}
          >
            {#if position >= 0}<span class="mr-1 font-semibold text-accent">{position + 1}</span>{/if}{format}
          </button>
        {/each}
      </div>
    </fieldset>

    <div>
      <label for="timezone" class={LABEL}>Timezone</label>
      <select id="timezone" class={INPUT} bind:value={draft.timezone}>
        <option value="utc">UTC</option>
        <option value="local">My local time</option>
      </select>
      <p class={HINT}>Only used for dates without an explicit offset.</p>
    </div>
  </div>
</div>
