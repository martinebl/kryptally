<script lang="ts">
  import type { IExchangeImporter, Transaction } from '$lib/types';
  import PreprocessorReview from '$lib/components/PreprocessorReview.svelte';

  interface Props {
    importers: IExchangeImporter[];
    onConfirm: (transactions: Transaction[], sourceName: string) => Promise<unknown>;
  }

  const { importers, onConfirm }: Props = $props();

  let selectedImporter = $state<IExchangeImporter>(importers[0]);
  let enabledPreprocessors = $state<Set<string>>(new Set());
  let files: FileList | null = $state(null);
  let dragOver = $state(false);
  let error = $state('');
  let rawTransactions = $state<Transaction[]>([]);
  let reviewing = $state(false);

  const selectImporter = (name: string) => {
    const found = importers.find((i) => i.exchangeName === name);
    if (found) {
      selectedImporter = found;
      enabledPreprocessors = new Set();
      resetReview();
    }
  };

  const togglePreprocessor = (id: string) => {
    const next = new Set(enabledPreprocessors);
    next.has(id) ? next.delete(id) : next.add(id);
    enabledPreprocessors = next;
  };

  const resetReview = () => {
    rawTransactions = [];
    reviewing = false;
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragOver = false;
    files = e.dataTransfer?.files ?? null;
    error = '';
    resetReview();
  };

  const handleFileInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    files = input.files;
    error = '';
    resetReview();
  };

  const hasEligibleTransactions = (): boolean =>
    selectedImporter.preprocessors
      .filter((p) => enabledPreprocessors.has(p.id))
      .some((p) => rawTransactions.some((tx) => p.isEligible(tx)));

  const handleParse = async () => {
    if (!files || files.length === 0) return;
    try {
      const text = await files[0].text();
      rawTransactions = selectedImporter.parse(text);
      error = '';
      if (hasEligibleTransactions()) {
        reviewing = true;
      } else {
        await handleConfirm(new Map());
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to parse CSV';
    }
  };

  const handleConfirm = async (selectedTxIds: Map<string, Set<string>>) => {
    const preprocessed = selectedImporter.preprocessors
      .filter((p) => enabledPreprocessors.has(p.id))
      .reduce((txs, p) => p.apply(txs, selectedTxIds.get(p.id)), rawTransactions);
    reviewing = false;
    await onConfirm(preprocessed, selectedImporter.exchangeName);
  };
</script>

<!-- Importer selector -->
<div class="mb-6">
  <label for="importer-select" class="mb-2 block text-sm font-medium text-text-heading">
    Exchange format
  </label>
  <select
    id="importer-select"
    class="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-heading focus:border-accent focus:outline-none"
    onchange={(e) => selectImporter((e.target as HTMLSelectElement).value)}
  >
    {#each importers as importer}
      <option value={importer.exchangeName} selected={importer === selectedImporter}>
        {importer.exchangeName}
      </option>
    {/each}
  </select>
</div>

<!-- Preprocessor toggles -->
{#if selectedImporter.preprocessors.length > 0}
  <div class="mb-6 rounded-lg border border-border bg-bg-card p-4">
    <p class="mb-3 text-sm font-medium text-text-heading">Options</p>
    {#each selectedImporter.preprocessors as preprocessor}
      <label class="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-bg-card/80">
        <input
          type="checkbox"
          checked={enabledPreprocessors.has(preprocessor.id)}
          onchange={() => togglePreprocessor(preprocessor.id)}
          class="mt-0.5 accent-accent"
        />
        <div>
          <p class="text-sm font-medium text-text-heading">{preprocessor.label}</p>
          <p class="text-xs text-text">{preprocessor.description}</p>
        </div>
      </label>
    {/each}
  </div>
{/if}

<!-- Drop zone (hidden during review) -->
{#if !reviewing}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors
      {dragOver ? 'border-accent bg-accent-bg' : 'border-border bg-bg-card hover:border-accent-border'}"
    ondragover={(e) => { e.preventDefault(); dragOver = true; }}
    ondragleave={() => { dragOver = false; }}
    ondrop={handleDrop}
    onclick={() => document.getElementById('csv-input')?.click()}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('csv-input')?.click(); }}
    role="button"
    tabindex="0"
  >
    <svg class="mx-auto mb-4 size-10 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
    <p class="mb-1 text-sm font-medium text-text-heading">
      Drop your CSV here or click to browse
    </p>
    <p class="text-xs text-text">Supports: {importers.map((i) => i.exchangeName).join(', ')}</p>
    <input
      id="csv-input"
      type="file"
      accept=".csv"
      class="hidden"
      onchange={handleFileInput}
    />
  </div>

  <!-- File info + parse button -->
  {#if files && files.length > 0}
    <div class="mt-6 rounded-lg border border-border bg-bg-card p-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-text-heading">
          <span class="font-medium">{files[0].name}</span>
          <span class="text-text"> ({(files[0].size / 1024).toFixed(1)} KB)</span>
        </p>
        <button
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          onclick={handleParse}
        >
          Import
        </button>
      </div>
    </div>
  {/if}
{/if}

<!-- Review step -->
{#if reviewing}
  <PreprocessorReview
    {rawTransactions}
    preprocessors={selectedImporter.preprocessors}
    {enabledPreprocessors}
    fileName={files?.[0]?.name ?? ''}
    onConfirm={handleConfirm}
    onBack={resetReview}
  />
{/if}

<!-- CSV parse error -->
{#if error}
  <div class="mt-4 rounded-lg border border-red-300 bg-red-50 p-4">
    <p class="text-sm text-red-700">{error}</p>
  </div>
{/if}
