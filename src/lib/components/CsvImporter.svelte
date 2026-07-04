<script lang="ts">
  import type { IExchangeImporter, Transaction } from '$lib/types';
  import { detectExchange } from '$lib/importers';
  import PreprocessorReview from '$lib/components/PreprocessorReview.svelte';
  import Modal from '$lib/components/Modal.svelte';

  const AUTO_DETECT = '__auto__';

  interface Props {
    importers: IExchangeImporter[];
    onConfirm: (transactions: Transaction[], sourceName: string) => Promise<unknown>;
    onFileSelected?: () => void;
  }

  const { importers, onConfirm, onFileSelected }: Props = $props();

  let selectedImporter = $state<IExchangeImporter | null>(null);
  const selectValue = $derived(selectedImporter?.exchangeName ?? AUTO_DETECT);
  let enabledPreprocessors = $state<Set<string>>(new Set());
  let files: FileList | null = $state(null);
  let dragOver = $state(false);
  let error = $state('');
  let rawTransactions = $state<Transaction[]>([]);
  let reviewing = $state(false);
  let ambiguous = $state<IExchangeImporter[]>([]);
  let fileText = $state('');
  let detecting = $state(false);

  const selectImporter = (value: string) => {
    if (value === AUTO_DETECT) {
      selectedImporter = null;
      ambiguous = [];
      enabledPreprocessors = new Set();
      resetReview();
      if (fileText) void detectFromCache();
    } else {
      const found = importers.find((i) => i.exchangeName === value);
      if (found) {
        selectedImporter = found;
        ambiguous = [];
        enabledPreprocessors = new Set();
        resetReview();
      }
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

  const detectFromCache = async () => {
    if (!fileText) return;
    detecting = true;
    error = '';
    ambiguous = [];
    try {
      const matched = detectExchange(fileText, importers);
      if (matched.length === 1) {
        selectedImporter = matched[0];
      } else if (matched.length > 1) {
        ambiguous = matched;
      } else {
        error = 'Could not auto-detect exchange format. Please select one manually.';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to read CSV for detection';
    } finally {
      detecting = false;
    }
  };

  const handleFiles = async (newFiles: FileList | null) => {
    files = newFiles;
    enabledPreprocessors = new Set();
    ambiguous = [];
    resetReview();
    onFileSelected?.();

    if (!files || files.length === 0) return;

    detecting = true;
    error = '';
    try {
      fileText = await files[0].text();
      const matched = detectExchange(fileText, importers);
      if (matched.length === 1) {
        selectedImporter = matched[0];
      } else if (matched.length > 1) {
        ambiguous = matched;
      } else {
        selectedImporter = null;
        error = 'Could not auto-detect exchange format. Please select one manually.';
      }
    } catch (e) {
      selectedImporter = null;
      error = e instanceof Error ? e.message : 'Failed to read CSV for detection';
    } finally {
      detecting = false;
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragOver = false;
    void handleFiles(e.dataTransfer?.files ?? null);
  };

  const handleFileInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    void handleFiles(input.files);
  };

  const chooseAmbiguous = (importer: IExchangeImporter) => {
    selectedImporter = importer;
    ambiguous = [];
    enabledPreprocessors = new Set();
    resetReview();
  };

  const closeAmbiguous = () => {
    ambiguous = [];
  };

  const hasEligibleTransactions = (): boolean => {
    if (!selectedImporter) return false;
    return selectedImporter.preprocessors
      .filter((p) => enabledPreprocessors.has(p.id))
      .some((p) => rawTransactions.some((tx) => p.isEligible(tx)));
  };

  const handleParse = async () => {
    if (!files || files.length === 0 || !selectedImporter) return;
    try {
      const text = fileText || (await files[0].text());
      fileText = text;
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
    if (!selectedImporter) return;
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
    value={selectValue}
    onchange={(e) => selectImporter((e.target as HTMLSelectElement).value)}
  >
    <option value={AUTO_DETECT}>Auto detect</option>
    {#each importers as importer}
      <option value={importer.exchangeName}>
        {importer.exchangeName}
      </option>
    {/each}
  </select>
  <p class="mt-1.5 text-xs text-text">
    Detected automatically when you upload a file. Pick manually only if detection fails.
  </p>
</div>

<!-- Preprocessor toggles -->
{#if selectedImporter && selectedImporter.preprocessors.length > 0}
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

  <!-- File info + Detecting indicator / Import button -->
  {#if files && files.length > 0}
    <div class="mt-6 rounded-lg border border-border bg-bg-card p-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-text-heading">
          <span class="font-medium">{files[0].name}</span>
          <span class="text-text"> ({(files[0].size / 1024).toFixed(1)} KB)</span>
        </p>
        {#if detecting}
          <span class="text-sm text-text">
            <svg class="mr-2 inline size-4 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
            </svg>
            Detecting…
          </span>
        {:else if selectedImporter !== null}
          <button
            class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90"
            onclick={handleParse}
          >
            Import
          </button>
        {/if}
      </div>
    </div>
  {/if}
{/if}

<!-- Ambiguity modal -->
<Modal open={ambiguous.length > 1} title="Choose exchange format" onClose={closeAmbiguous}>
  <p class="mb-4 text-sm text-text">
    More than one exchange format matches this CSV. Pick the correct one:
  </p>
  <div class="flex flex-col gap-2">
    {#each ambiguous as importer}
      <button
        class="rounded-lg border border-border bg-bg-card px-4 py-3 text-left text-sm font-medium text-text-heading transition-colors hover:border-accent hover:bg-bg-card/80"
        onclick={() => chooseAmbiguous(importer)}
      >
        {importer.exchangeName}
      </button>
    {/each}
  </div>
</Modal>

<!-- Review step -->
{#if reviewing && selectedImporter}
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
  <div class="mt-4 rounded-lg border border-danger-border bg-danger-bg p-4">
    <p class="text-sm text-danger">{error}</p>
  </div>
{/if}
