<script lang="ts">
  import { readCsvHeaders, detectColumns, parsePriceCSV, type ColumnMapping } from '$lib/converters/price-csv-parser';
  import { resolveCoinId, GECKO_COIN_IDS } from '$lib/converters/coin-ids';
  import { getPersistPriceEntry } from '$lib/context';
  import type { PricesByAsset, PriceData } from '$lib/converters/csv-prices';

  interface Props {
    pricesByAsset: PricesByAsset;
  }

  const { pricesByAsset }: Props = $props();

  const persistPriceEntry = getPersistPriceEntry();

  const KNOWN_TICKERS = Object.keys(GECKO_COIN_IDS);
  // Map from uppercase primary coin name to ticker (e.g. "BITCOIN" → "BTC", "MATIC" from "matic-network" → "MATIC")
  const COIN_NAME_TO_TICKER: Array<[string, string]> = Object.entries(GECKO_COIN_IDS).map(
    ([ticker, coinId]) => [coinId.split('-')[0].toUpperCase(), ticker]
  );

  const FIAT_CURRENCIES = [
    'USD', 'EUR', 'GBP', 'DKK', 'SEK', 'NOK', 'CHF', 'JPY',
    'AUD', 'CAD', 'HKD', 'SGD', 'PLN', 'CZK', 'HUF',
  ];

  interface LoadedEntry { coinId: string; count: number; currency: string; }

  // --- state ---
  let csvText = $state('');
  let headers = $state<string[]>([]);
  let dateColIndex = $state(0);
  let priceColIndex = $state(4);
  let detectionConfident = $state(false);
  let asset = $state('');
  let currency = $state('USD');
  let fileName = $state('');
  let successMessage = $state('');
  let error = $state('');
  let loadedEntries = $state<LoadedEntry[]>(
    [...pricesByAsset.entries()].map(([coinId, data]) => ({
      coinId,
      count: data.prices.size,
      currency: data.currency,
    }))
  );

  const handleFile = async (file: File) => {
    successMessage = '';
    error = '';
    asset = '';
    fileName = file.name;

    csvText = await file.text();
    headers = readCsvHeaders(csvText);

    if (headers.length === 0) {
      error = 'Could not read headers from this file.';
      return;
    }

    const detected = detectColumns(headers);
    dateColIndex = detected.mapping.dateCol;
    priceColIndex = detected.mapping.priceCol;
    detectionConfident = detected.confident;

    // Try to infer asset from filename, e.g. "bitcoin_usd.csv" or "BTC-USD.csv"
    const base = file.name.replace(/\.[^.]+$/, '').toUpperCase();
    const tickerMatch = KNOWN_TICKERS.find(t => base.startsWith(t) || base.includes(`-${t}`) || base.includes(`_${t}`));
    if (tickerMatch) {
      asset = tickerMatch;
    } else {
      const nameMatch = COIN_NAME_TO_TICKER.find(([name]) => base.startsWith(name));
      if (nameMatch) asset = nameMatch[1];
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFile(file);
  };

  const handleLoad = async () => {
    error = '';
    successMessage = '';

    if (!asset.trim()) {
      error = 'Please specify the asset ticker (e.g. BTC).';
      return;
    }

    const mapping: ColumnMapping = { dateCol: dateColIndex, priceCol: priceColIndex };
    const prices = parsePriceCSV(csvText, mapping);

    if (prices.size === 0) {
      error = 'No price rows could be parsed. Check your column selection.';
      return;
    }

    const coinId = resolveCoinId(asset.trim());
    const priceData: PriceData = { prices, currency };
    pricesByAsset.set(coinId, priceData);
    loadedEntries = [...loadedEntries.filter(e => e.coinId !== coinId), { coinId, count: prices.size, currency }];

    try {
      await persistPriceEntry(coinId, priceData);
      successMessage = `Loaded ${prices.size} dates for ${asset.toUpperCase()} (${coinId}) in ${currency}.`;
    } catch (e) {
      error = `Prices loaded for this session, but saving them for future sessions failed: ${e instanceof Error ? e.message : e}`;
    }

    // Reset file state so another file can be loaded
    csvText = '';
    headers = [];
    fileName = '';
    asset = '';
  };
</script>

<div class="rounded-lg border border-border bg-bg-card p-4">
  <p class="mb-3 text-xs text-text">Supports Yahoo Finance, ISO (YYYY-MM-DD), and most common date formats.</p>

  {#if headers.length === 0}
    <!-- Drop zone -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="cursor-pointer rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-accent-border"
      ondragover={(e) => e.preventDefault()}
      ondrop={handleDrop}
      onclick={() => document.getElementById('price-csv-input')?.click()}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('price-csv-input')?.click(); }}
      role="button"
      tabindex="0"
    >
      <p class="text-sm text-text-heading">Drop a price CSV here or click to browse</p>
      <input
        id="price-csv-input"
        type="file"
        accept=".csv"
        class="hidden"
        onchange={handleFileInput}
      />
    </div>
  {:else}
    <!-- Column mapping + metadata -->
    <div class="space-y-3">
      <p class="text-xs text-text">
        File: <span class="font-medium text-text-heading">{fileName}</span>
        {#if !detectionConfident}
          <span class="ml-2 text-warning">— columns could not be auto-detected, please verify</span>
        {/if}
      </p>

      <div class="grid grid-cols-2 gap-3">
        <!-- Date column -->
        <div>
          <label class="mb-1 block text-xs font-medium text-text-heading" for="date-col-select">
            Date column
          </label>
          <select
            id="date-col-select"
            class="w-full rounded-md border border-border bg-bg-card px-2 py-1.5 text-xs text-text-heading focus:border-accent focus:outline-none"
            bind:value={dateColIndex}
          >
            {#each headers as header, i}
              <option value={i}>{i}: {header}</option>
            {/each}
          </select>
        </div>

        <!-- Price column -->
        <div>
          <label class="mb-1 block text-xs font-medium text-text-heading" for="price-col-select">
            Price column
          </label>
          <select
            id="price-col-select"
            class="w-full rounded-md border border-border bg-bg-card px-2 py-1.5 text-xs text-text-heading focus:border-accent focus:outline-none"
            bind:value={priceColIndex}
          >
            {#each headers as header, i}
              <option value={i}>{i}: {header}</option>
            {/each}
          </select>
        </div>

        <!-- Asset ticker -->
        <div>
          <label class="mb-1 block text-xs font-medium text-text-heading" for="asset-input">
            Asset ticker
          </label>
          <input
            id="asset-input"
            type="text"
            list="known-tickers"
            placeholder="e.g. BTC"
            class="w-full rounded-md border border-border bg-bg-card px-2 py-1.5 text-xs text-text-heading placeholder:text-text focus:border-accent focus:outline-none"
            bind:value={asset}
          />
          <datalist id="known-tickers">
            {#each KNOWN_TICKERS as ticker}
              <option value={ticker}></option>
            {/each}
          </datalist>
        </div>

        <!-- Price currency -->
        <div>
          <label class="mb-1 block text-xs font-medium text-text-heading" for="currency-select">
            Price currency
          </label>
          <select
            id="currency-select"
            class="w-full rounded-md border border-border bg-bg-card px-2 py-1.5 text-xs text-text-heading focus:border-accent focus:outline-none"
            bind:value={currency}
          >
            {#each FIAT_CURRENCIES as c}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="flex gap-2">
        <button
          class="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent/90"
          onclick={handleLoad}
        >
          Load prices
        </button>
        <button
          class="rounded-md border border-border px-3 py-1.5 text-xs text-text transition-colors hover:text-text-heading"
          onclick={() => { csvText = ''; headers = []; fileName = ''; error = ''; successMessage = ''; }}
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}

  {#if error}
    <p class="mt-3 text-xs text-danger">{error}</p>
  {/if}

  {#if successMessage}
    <p class="mt-3 text-xs text-positive">{successMessage}</p>
  {/if}

  {#if loadedEntries.length > 0}
    <div class="mt-4 border-t border-border pt-3">
      <p class="mb-2 text-xs font-medium text-text-heading">Loaded price data</p>
      <ul class="space-y-1">
        {#each loadedEntries as entry}
          <li class="flex items-center justify-between text-xs text-text">
            <span class="font-medium text-text-heading capitalize">{entry.coinId}</span>
            <span>{entry.count} prices · {entry.currency}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
