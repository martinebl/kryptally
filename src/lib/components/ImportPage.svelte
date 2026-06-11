<script lang="ts">
  import type { Transaction, IExchangeImporter } from '$lib/types';
  import type { CountryConfig } from '$lib/types/tax-rules';
  import { LedgerImporter } from '$lib/importers/ledger';
  import { BinanceImporter } from '$lib/importers/binance';
  import { RevolutXImporter } from '$lib/importers/revolut-x';
  import PreprocessorReview from '$lib/components/PreprocessorReview.svelte';
  import CsvPriceUploader from '$lib/components/CsvPriceUploader.svelte';
  import { getCryptoConverter } from '$lib/context';
  import { enrichFiatValues } from '$lib/engine/enrich-fiat-values';
  import type { PricesByAsset } from '$lib/converters/csv-prices';

  interface Props {
    onImport: (transactions: Transaction[]) => void;
    pricesByAsset: PricesByAsset;
    countryConfig: CountryConfig;
    storedTransactionCount: number;
    onClearHistory: () => void;
  }

  const { onImport, pricesByAsset, countryConfig, storedTransactionCount, onClearHistory }: Props = $props();

  const importers: IExchangeImporter[] = [
    new LedgerImporter(),
    new BinanceImporter(),
    new RevolutXImporter(),
  ];

  let selectedImporter = $state<IExchangeImporter>(importers[0]);
  let enabledPreprocessors = $state<Set<string>>(new Set());
  let files: FileList | null = $state(null);
  let dragOver = $state(false);
  let error = $state('');
  let parsedCount = $state(0);

  let rawTransactions = $state<Transaction[]>([]);
  let reviewing = $state(false);
  let enriching = $state(false);
  let enrichProgress = $state(0);
  let enrichTotal = $state(0);
  let enrichFailed = $state(0);

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
        handleConfirm(new Map());
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to parse CSV';
      parsedCount = 0;
    }
  };

  const converter = getCryptoConverter();

  const handleConfirm = async (selectedTxIds: Map<string, Set<string>>) => {
    const preprocessed = selectedImporter.preprocessors
      .filter((p) => enabledPreprocessors.has(p.id))
      .reduce((txs, p) => p.apply(txs, selectedTxIds.get(p.id)), rawTransactions);

    reviewing = false;
    enriching = true;
    enrichProgress = 0;
    enrichTotal = preprocessed.length;
    enrichFailed = 0;

    const result = await enrichFiatValues(preprocessed, converter, countryConfig.currency, (progress) => {
      enrichProgress = progress.completed;
      enrichTotal = progress.total;
      enrichFailed = progress.failed;
    });

    enriching = false;
    enrichFailed = result.failed;
    parsedCount = result.transactions.length;
    onImport(result.transactions);
  };
</script>

<section class="py-16">
  <div class="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-3 lg:items-start">

    <!-- Transactions column -->
    <div class="lg:col-span-2">
      <h2 class="mb-2 font-heading text-2xl font-medium text-text-heading">Import transactions</h2>
      <p class="mb-4 text-sm leading-relaxed text-text">
        Upload a CSV export from your exchange. Your data stays in your browser and is never sent anywhere.
      </p>
      <p class="mb-8 rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text">
        {countryConfig.country} · {countryConfig.currency} · {countryConfig.defaultCostBasisMethod.toUpperCase()}
      </p>

      <!-- Stored transaction history -->
      {#if storedTransactionCount > 0}
        <div class="mb-6 flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2">
          <p class="text-sm text-text">
            {storedTransactionCount} transaction{storedTransactionCount === 1 ? '' : 's'} stored in your browser
          </p>
          <button
            class="cursor-pointer rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-text transition-colors hover:border-red-300 hover:text-red-600"
            onclick={onClearHistory}
          >
            Clear history
          </button>
        </div>
      {/if}

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

      <!-- Enrichment progress -->
      {#if enriching}
        <div class="mt-4 rounded-lg border border-border bg-bg-card p-4">
          <div class="mb-2 flex items-center justify-between text-sm">
            <span class="text-text-heading">Fetching market prices...</span>
            <span class="text-text">
              {enrichProgress} / {enrichTotal}{#if enrichFailed > 0}<span class="text-amber-600"> ({enrichFailed} failed)</span>{/if}
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-border">
            <div
              class="h-full rounded-full bg-accent transition-[width] duration-100 ease-linear"
              style="width: {enrichTotal > 0 ? (enrichProgress / enrichTotal) * 100 : 0}%"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Enrichment warning -->
      {#if !enriching && enrichFailed > 0 && parsedCount > 0}
        <div class="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p class="text-sm text-amber-800">
            Could not fetch market prices for {enrichFailed} of {parsedCount} transactions.
            These will show a cost basis of 0. This typically happens for transactions older than 1 year
            (CoinGecko free tier limitation) or for unrecognized assets.
          </p>
        </div>
      {/if}

      <!-- Error message -->
      {#if error}
        <div class="mt-4 rounded-lg border border-red-300 bg-red-50 p-4">
          <p class="text-sm text-red-700">{error}</p>
        </div>
      {/if}

      <!-- Success message -->
      {#if parsedCount > 0 && !error && !reviewing}
        <div class="mt-4 rounded-lg border border-green-300 bg-green-50 p-4">
          <p class="text-sm text-green-700">
            Parsed {parsedCount} transactions from {selectedImporter.exchangeName}. View your results on the Results page.
          </p>
        </div>
      {/if}
    </div>

    <!-- Price data column -->
    <div>
      <h2 class="mb-2 font-heading text-2xl font-medium text-text-heading">Price data</h2>
      <p class="mb-4 text-sm leading-relaxed text-text">
        Upload a CSV with historical prices for assets or periods not covered by CoinGecko's free API.
      </p>
      <CsvPriceUploader {pricesByAsset} />
    </div>

  </div>
</section>
