<script lang="ts">
  import type { Transaction, IExchangeImporter, IImportPreprocessor } from '$lib/types';
  import { LedgerImporter } from '$lib/importers/ledger';

  interface Props {
    onImport: (transactions: Transaction[]) => void;
  }

  const { onImport }: Props = $props();

  const importers: IExchangeImporter[] = [
    new LedgerImporter(),
  ];

  let selectedImporter = $state<IExchangeImporter>(importers[0]);
  let enabledPreprocessors = $state<Set<string>>(new Set());
  let files: FileList | null = $state(null);
  let dragOver = $state(false);
  let error = $state('');
  let parsedCount = $state(0);

  // Review step state
  let rawTransactions = $state<Transaction[]>([]);
  let reviewing = $state(false);
  let selectedTxIds = $state<Map<string, Set<string>>>(new Map());

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

    if (reviewing) {
      updateSelections();
    }
  };

  const resetReview = () => {
    rawTransactions = [];
    reviewing = false;
    selectedTxIds = new Map();
  };

  const updateSelections = () => {
    const next = new Map<string, Set<string>>();
    for (const p of selectedImporter.preprocessors) {
      if (!enabledPreprocessors.has(p.id)) continue;
      const existing = selectedTxIds.get(p.id);
      if (existing) {
        next.set(p.id, existing);
      } else {
        const eligible = rawTransactions.filter((tx) => p.isEligible(tx)).map((tx) => tx.id);
        next.set(p.id, new Set(eligible));
      }
    }
    selectedTxIds = next;
  };

  const toggleTxForPreprocessor = (preprocessorId: string, txId: string) => {
    const current = selectedTxIds.get(preprocessorId);
    if (!current) return;
    const next = new Set(current);
    next.has(txId) ? next.delete(txId) : next.add(txId);
    selectedTxIds = new Map(selectedTxIds).set(preprocessorId, next);
  };

  const eligibleTransactions = (preprocessor: IImportPreprocessor): Transaction[] =>
    rawTransactions.filter((tx) => preprocessor.isEligible(tx));

  const applyPreprocessors = (transactions: Transaction[]): Transaction[] =>
    selectedImporter.preprocessors
      .filter((p) => enabledPreprocessors.has(p.id))
      .reduce((txs, p) => p.apply(txs, selectedTxIds.get(p.id)), transactions);

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
        updateSelections();
        reviewing = true;
      } else {
        finishImport();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to parse CSV';
      parsedCount = 0;
    }
  };

  const finishImport = () => {
    const transactions = applyPreprocessors(rawTransactions);
    parsedCount = transactions.length;
    reviewing = false;
    onImport(transactions);
  };

  const formatTxSummary = (tx: Transaction): string => {
    const asset = tx.toAsset ?? tx.fromAsset ?? tx.feeAsset ?? '?';
    const amount = tx.toAmount ?? tx.fromAmount ?? tx.feeAmount;
    const amountStr = amount ? amount.toFixed(6).replace(/\.?0+$/, '') : '?';
    return `${amountStr} ${asset}`;
  };
</script>

<section class="py-16">
  <h2 class="mb-4 text-center font-heading text-2xl font-medium text-text-heading">Import transactions</h2>
  <p class="mx-auto mb-10 max-w-lg text-center text-sm leading-relaxed text-text">
    Upload a CSV export from your exchange. Your data stays in your browser and is never sent anywhere.
  </p>

  <!-- Importer selector -->
  <div class="mx-auto mb-6 max-w-lg">
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
    <div class="mx-auto mb-6 max-w-lg rounded-lg border border-border bg-bg-card p-4">
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
      class="mx-auto max-w-lg cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors
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
      <div class="mx-auto mt-6 max-w-lg rounded-lg border border-border bg-bg-card p-4">
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
    <div class="mx-auto max-w-2xl">
      <div class="mb-4 rounded-lg border border-border bg-bg-card p-4">
        <p class="text-sm text-text-heading">
          Parsed <span class="font-medium">{rawTransactions.length}</span> transactions from
          <span class="font-medium">{files?.[0]?.name}</span>
        </p>
      </div>

      {#each selectedImporter.preprocessors.filter((p) => enabledPreprocessors.has(p.id)) as preprocessor}
        {@const eligible = eligibleTransactions(preprocessor)}
        {@const selected = selectedTxIds.get(preprocessor.id) ?? new Set()}
        {#if eligible.length > 0}
          <div class="mb-6 rounded-lg border border-border bg-bg-card p-4">
            <div class="mb-3 flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-text-heading">{preprocessor.label}</p>
                <p class="text-xs text-text">
                  {selected.size} of {eligible.length} eligible transactions selected
                </p>
              </div>
              <div class="flex gap-2">
                <button
                  class="rounded px-2 py-1 text-xs text-accent hover:bg-accent/10"
                  onclick={() => {
                    selectedTxIds = new Map(selectedTxIds).set(
                      preprocessor.id,
                      new Set(eligible.map((tx) => tx.id)),
                    );
                  }}
                >
                  Select all
                </button>
                <button
                  class="rounded px-2 py-1 text-xs text-accent hover:bg-accent/10"
                  onclick={() => {
                    selectedTxIds = new Map(selectedTxIds).set(preprocessor.id, new Set());
                  }}
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div class="max-h-64 space-y-1 overflow-y-auto">
              {#each eligible as tx}
                <label class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-bg-card/80">
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onchange={() => toggleTxForPreprocessor(preprocessor.id, tx.id)}
                    class="accent-accent"
                  />
                  <div class="flex flex-1 items-center justify-between text-xs">
                    <span class="font-medium text-text-heading">{formatTxSummary(tx)}</span>
                    <span class="text-text">{tx.date.slice(0, 10)}</span>
                  </div>
                  {#if tx.fiatCurrency && tx.fiatValue.gt(0)}
                    <span class="text-xs text-text">
                      {tx.fiatValue.toFixed(2)} {tx.fiatCurrency}
                    </span>
                  {/if}
                </label>
              {/each}
            </div>
          </div>
        {/if}
      {/each}

      <div class="flex justify-end gap-3">
        <button
          class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-heading transition-colors hover:bg-bg-card"
          onclick={resetReview}
        >
          Back
        </button>
        <button
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          onclick={finishImport}
        >
          Confirm import
        </button>
      </div>
    </div>
  {/if}

  <!-- Error message -->
  {#if error}
    <div class="mx-auto mt-4 max-w-lg rounded-lg border border-red-300 bg-red-50 p-4">
      <p class="text-sm text-red-700">{error}</p>
    </div>
  {/if}

  <!-- Success message -->
  {#if parsedCount > 0 && !error && !reviewing}
    <div class="mx-auto mt-4 max-w-lg rounded-lg border border-green-300 bg-green-50 p-4">
      <p class="text-sm text-green-700">
        Parsed {parsedCount} transactions from {selectedImporter.exchangeName}. View your results on the Results page.
      </p>
    </div>
  {/if}
</section>
