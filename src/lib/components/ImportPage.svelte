<script lang="ts">
  import type { Transaction, IExchangeImporter } from '$lib/types';
  import { LedgerImporter } from '$lib/importers/ledger';

  interface Props {
    onImport: (transactions: Transaction[]) => void;
  }

  const { onImport }: Props = $props();

  const importers: IExchangeImporter[] = [
    new LedgerImporter(),
  ];

  let selectedImporter = $state<IExchangeImporter>(importers[0]);
  let files: FileList | null = $state(null);
  let dragOver = $state(false);
  let error = $state('');
  let parsedCount = $state(0);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragOver = false;
    files = e.dataTransfer?.files ?? null;
    error = '';
  };

  const handleFileInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    files = input.files;
    error = '';
  };

  const handleImport = async () => {
    if (!files || files.length === 0) return;

    try {
      const text = await files[0].text();
      const transactions = selectedImporter.parse(text);
      parsedCount = transactions.length;
      error = '';
      onImport(transactions);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to parse CSV';
      parsedCount = 0;
    }
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
      onchange={(e) => {
        const target = e.target as HTMLSelectElement;
        const found = importers.find((i) => i.exchangeName === target.value);
        if (found) selectedImporter = found;
      }}
    >
      {#each importers as importer}
        <option value={importer.exchangeName} selected={importer === selectedImporter}>
          {importer.exchangeName}
        </option>
      {/each}
    </select>
  </div>

  <!-- Drop zone -->
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

  <!-- File info + import button -->
  {#if files && files.length > 0}
    <div class="mx-auto mt-6 max-w-lg rounded-lg border border-border bg-bg-card p-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-text-heading">
          <span class="font-medium">{files[0].name}</span>
          <span class="text-text"> ({(files[0].size / 1024).toFixed(1)} KB)</span>
        </p>
        <button
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          onclick={handleImport}
        >
          Import
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
  {#if parsedCount > 0 && !error}
    <div class="mx-auto mt-4 max-w-lg rounded-lg border border-green-300 bg-green-50 p-4">
      <p class="text-sm text-green-700">
        Parsed {parsedCount} transactions from {selectedImporter.exchangeName}. View your results on the Results page.
      </p>
    </div>
  {/if}
</section>