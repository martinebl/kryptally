<script lang="ts">
  import type { Transaction } from '$lib/types';
  import type { CountryConfig } from '$lib/types/tax-rules';
  import { LedgerImporter } from '$lib/importers/ledger';
  import { BinanceImporter } from '$lib/importers/binance';
  import { RevolutXImporter } from '$lib/importers/revolut-x';
  import { BinanceLiveSource, RevolutXLiveSource } from '$lib/sources';
  import CsvImporter from '$lib/components/CsvImporter.svelte';
  import LiveImporter from '$lib/components/LiveImporter.svelte';
  import CsvPriceUploader from '$lib/components/CsvPriceUploader.svelte';
  import { getCryptoConverter } from '$lib/context';
  import { enrichFiatValues } from '$lib/engine/enrich-fiat-values';
  import type { PricesByAsset } from '$lib/converters/csv-prices';
  import { isTauri } from '$lib/runtime';

  interface Props {
    onImport: (transactions: Transaction[]) => void;
    pricesByAsset: PricesByAsset;
    countryConfig: CountryConfig;
    storedTransactionCount: number;
    onClearHistory: () => void;
  }

  const { onImport, pricesByAsset, countryConfig, storedTransactionCount, onClearHistory }: Props = $props();

  const importers = [
    new LedgerImporter(),
    new BinanceImporter(),
    new RevolutXImporter(),
  ];

  const liveSources = [new BinanceLiveSource(), new RevolutXLiveSource()];

  let activeTab = $state<'csv' | 'live'>('csv');
  let importSourceName = $state('');
  let parsedCount = $state(0);
  let enriching = $state(false);
  let enrichProgress = $state(0);
  let enrichTotal = $state(0);
  let enrichFailed = $state(0);

  const converter = getCryptoConverter();

  const handleEnrich = async (transactions: Transaction[], sourceName: string) => {
    importSourceName = sourceName;
    enriching = true;
    enrichProgress = 0;
    enrichTotal = transactions.length;
    enrichFailed = 0;
    parsedCount = 0;

    const result = await enrichFiatValues(transactions, converter, countryConfig.currency, (progress) => {
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

      {#if isTauri()}
        <!-- Tauri: tabbed block combining CSV and Live -->
        <div class="flex border-b border-border">
          <button
            class="px-5 py-3 text-sm font-medium transition-colors focus:outline-none
              {activeTab === 'csv'
                ? 'border-b-2 border-accent text-accent -mb-px'
                : 'text-text hover:text-text-heading'}"
            onclick={() => { activeTab = 'csv'; }}
          >
            CSV import
          </button>
          <button
            class="px-5 py-3 text-sm font-medium transition-colors focus:outline-none
              {activeTab === 'live'
                ? 'border-b-2 border-accent text-accent -mb-px'
                : 'text-text hover:text-text-heading'}"
            onclick={() => { activeTab = 'live'; }}
          >
            Live exchange
          </button>
        </div>

        <div class="pt-6">
          {#if activeTab === 'csv'}
            <CsvImporter {importers} onConfirm={handleEnrich} />
          {:else}
            <LiveImporter {liveSources} onConfirm={handleEnrich} />
          {/if}
        </div>

      {:else}
        <!-- Browser: teaser for desktop-only live sources, then CSV import -->
        <div class="mb-8">
          <h3 class="mb-2 text-sm font-medium text-text-heading">Connect an exchange directly</h3>
          <p class="mb-3 text-xs text-text">
            Pull transactions straight from the exchange API instead of uploading a CSV. Requires the
            desktop app so credentials can be stored in your OS keychain and requests can bypass browser CORS.
          </p>
        </div>

        <CsvImporter {importers} onConfirm={handleEnrich} />
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

      <!-- Success message -->
      {#if parsedCount > 0}
        <div class="mt-4 rounded-lg border border-green-300 bg-green-50 p-4">
          <p class="text-sm text-green-700">
            Imported {parsedCount} transactions from {importSourceName}. View your results on the Results page.
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
