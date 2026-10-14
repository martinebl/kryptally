<script lang="ts">
  import type { CustomImporterConfig } from '$lib/types';
  import { distinctColumnValues, guessDelimiter, readHeaders, readTable, validateConfig } from '$lib/importers/custom';
  import FormatFields from '$lib/components/importers/FormatFields.svelte';
  import ColumnFields from '$lib/components/importers/ColumnFields.svelte';
  import TypeFields from '$lib/components/importers/TypeFields.svelte';
  import CurrencyFields from '$lib/components/importers/CurrencyFields.svelte';
  import ImporterPreview from '$lib/components/importers/ImporterPreview.svelte';
  import { HINT, PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION, SECTION_TITLE } from '$lib/components/importers/styles';

  interface Props {
    initial: CustomImporterConfig;
    /** Names the draft may not use (built-ins and other user importers). */
    takenNames: string[];
    onSave: (config: CustomImporterConfig) => Promise<void>;
    onCancel: () => void;
  }

  const { initial, takenNames, onSave, onCancel }: Props = $props();

  // The editor works on its own copy of the initial value; nothing is persisted
  // until Save. The parent remounts the editor (keyed by id) to edit another config.
  // svelte-ignore state_referenced_locally
  let draft = $state<CustomImporterConfig>($state.snapshot(initial));
  let sample = $state('');
  let sampleName = $state('');
  let saving = $state(false);
  let saveError = $state('');

  const headers = $derived(sample ? readHeaders(sample, draft) : []);
  const typeValues = $derived(
    sample && draft.type.mode === 'column' ? distinctColumnValues(readTable(sample, draft).rows, draft.columns.type) : [],
  );
  const errors = $derived(validateConfig(draft, takenNames));

  const loadSample = async (file: File | undefined) => {
    if (!file) return;
    sample = await file.text();
    sampleName = file.name;
    // A fresh draft takes its delimiter and detection columns from the first
    // sample; the user can adjust both afterwards.
    if (draft.requiredColumns.length === 0) {
      draft.delimiter = guessDelimiter(sample);
      draft.requiredColumns = readHeaders(sample, draft);
    }
  };

  const save = async () => {
    saving = true;
    saveError = '';
    try {
      await onSave($state.snapshot(draft));
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Failed to save importer';
    } finally {
      saving = false;
    }
  };
</script>

<div class="space-y-5">
  <div class={SECTION}>
    <h3 class={SECTION_TITLE}>Sample file</h3>
    <label class="{SECONDARY_BUTTON} inline-block">
      {sampleName ? 'Choose another file' : 'Choose a CSV export'}
      <input type="file" accept=".csv,text/csv" class="hidden" onchange={(e) => loadSample(e.currentTarget.files?.[0])} />
    </label>
    {#if sampleName}<span class="ml-3 text-sm text-text-heading">{sampleName}</span>{/if}
    <p class={HINT}>Used only to fill in the column pickers and the preview below. It is not imported or stored.</p>
  </div>

  <FormatFields bind:draft />
  <ColumnFields bind:draft {headers} />
  <TypeFields bind:draft sampleValues={typeValues} />
  <CurrencyFields bind:draft />
  <ImporterPreview config={draft} {sample} />

  {#if errors.length > 0}
    <ul class="list-inside list-disc rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning">
      {#each errors as error (error)}
        <li>{error}</li>
      {/each}
    </ul>
  {/if}
  {#if saveError}
    <p class="text-sm text-danger">{saveError}</p>
  {/if}

  <div class="flex justify-end gap-3">
    <button type="button" class={SECONDARY_BUTTON} onclick={onCancel}>Cancel</button>
    <button type="button" class={PRIMARY_BUTTON} disabled={errors.length > 0 || saving} onclick={save}>
      {saving ? 'Saving…' : 'Save importer'}
    </button>
  </div>
</div>
