<script lang="ts">
  import type { CustomImporterConfig } from '$lib/types';
  import type { ICustomImporterRepository } from '$lib/storage';
  import { BUILTIN_CONFIGS, BUILTIN_IMPORTER_NAMES } from '$lib/importers';
  import { duplicateConfig, emptyConfig } from '$lib/importers/custom';
  import ImporterEditor from '$lib/components/importers/ImporterEditor.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import { DANGER_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from '$lib/components/importers/styles';

  interface Props {
    configs: CustomImporterConfig[];
    repo: ICustomImporterRepository;
    onConfigsChange: (configs: CustomImporterConfig[]) => void;
  }

  const { configs, repo, onConfigsChange }: Props = $props();

  let editing = $state<CustomImporterConfig | null>(null);
  let pendingDelete = $state<CustomImporterConfig | null>(null);
  let deleteError = $state('');

  const allNames = $derived([...BUILTIN_IMPORTER_NAMES, ...configs.map((c) => c.name)]);
  const takenNamesFor = (id: string) => [...BUILTIN_IMPORTER_NAMES, ...configs.filter((c) => c.id !== id).map((c) => c.name)];

  const startNew = () => { editing = emptyConfig(crypto.randomUUID()); };
  const startDuplicate = (source: CustomImporterConfig) => {
    editing = duplicateConfig($state.snapshot(source), crypto.randomUUID(), allNames);
  };

  const save = async (config: CustomImporterConfig) => {
    onConfigsChange(await repo.save(config));
    editing = null;
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      onConfigsChange(await repo.remove(pendingDelete.id));
      pendingDelete = null;
    } catch (e) {
      deleteError = e instanceof Error ? e.message : 'Failed to delete importer';
    }
  };
</script>

{#snippet importerRow(config: CustomImporterConfig, builtin: boolean)}
  <li class="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft py-3 first:border-t-0">
    <div>
      <p class="text-sm font-semibold text-text-heading">{config.name}</p>
      <p class="text-xs text-text">{config.requiredColumns.length} required column{config.requiredColumns.length === 1 ? '' : 's'}</p>
    </div>
    <div class="flex gap-2">
      <button type="button" class={SECONDARY_BUTTON} onclick={() => startDuplicate(config)}>
        {builtin ? 'Duplicate to edit' : 'Duplicate'}
      </button>
      {#if !builtin}
        <button type="button" class={SECONDARY_BUTTON} onclick={() => { editing = $state.snapshot(config); }}>Edit</button>
        <button type="button" class={DANGER_BUTTON} onclick={() => { pendingDelete = config; deleteError = ''; }}>Delete</button>
      {/if}
    </div>
  </li>
{/snippet}

<section class="py-16">
  {#if editing}
    <h2 class="mb-2 font-heading text-2xl font-medium text-text-heading">
      {configs.some((c) => c.id === editing?.id) ? 'Edit importer' : 'New importer'}
    </h2>
    <p class="mb-6 text-sm leading-relaxed text-text">
      Describe a CSV export where each row is one transaction. Load a sample file to check the result as you go.
    </p>
    {#key editing.id}
      <ImporterEditor initial={editing} takenNames={takenNamesFor(editing.id)} onSave={save} onCancel={() => { editing = null; }} />
    {/key}
  {:else}
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="mb-2 font-heading text-2xl font-medium text-text-heading">CSV importers</h2>
        <p class="max-w-2xl text-sm leading-relaxed text-text">
          Teach Kryptally a new CSV format by mapping its columns. Importers are stored in your browser and show up on the
          Import page alongside the built-in ones.
        </p>
      </div>
      <button type="button" class={PRIMARY_BUTTON} onclick={startNew}>New importer</button>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="rounded-xl border border-border bg-surface p-5">
        <h3 class="mb-3 font-heading text-lg font-medium text-text-heading">Your importers</h3>
        {#if configs.length === 0}
          <p class="text-sm text-text-muted">None yet. Create one, or duplicate a built-in importer as a starting point.</p>
        {:else}
          <ul>
            {#each configs as config (config.id)}
              {@render importerRow(config, false)}
            {/each}
          </ul>
        {/if}
      </div>

      <div class="rounded-xl border border-border bg-surface p-5">
        <h3 class="mb-3 flex items-center gap-2 font-heading text-lg font-medium text-text-heading">
          Built-in <Badge variant="outlined" color="accent">Read-only</Badge>
        </h3>
        <ul>
          {#each BUILTIN_CONFIGS as config (config.id)}
            {@render importerRow(config, true)}
          {/each}
        </ul>
        <p class="mt-3 text-xs text-text">Binance is also built in, but combines several rows per transaction, so it can't be edited here.</p>
      </div>
    </div>
  {/if}
</section>

<Modal open={pendingDelete !== null} title="Delete importer?" onClose={() => { pendingDelete = null; }}>
  <p class="text-sm text-text">
    Delete <span class="font-semibold text-text-heading">{pendingDelete?.name}</span>? Transactions you already imported with it are kept.
  </p>
  {#if deleteError}<p class="mt-2 text-sm text-danger">{deleteError}</p>{/if}
  <div class="mt-5 flex justify-end gap-3">
    <button type="button" class={SECONDARY_BUTTON} onclick={() => { pendingDelete = null; }}>Cancel</button>
    <button type="button" class={DANGER_BUTTON} onclick={confirmDelete}>Delete</button>
  </div>
</Modal>
