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
  import ImportStatus from '$lib/components/ImportStatus.svelte';
  import MissingPricesModal from '$lib/components/MissingPricesModal.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import { getCryptoConverter } from '$lib/context';
  import { enrichFiatValues, type MissingPrice } from '$lib/engine/enrich-fiat-values';
  import type { PricesByAsset } from '$lib/converters/csv-prices';
  import { isTauri } from '$lib/runtime';

  interface Props {
    onImport: (transactions: Transaction[]) => Promise<{ newCount: number; dupCount: number }>;
    onNavigate: (page: string) => void;
    pricesByAsset: PricesByAsset;
    countryConfig: CountryConfig;
    storedTransactionCount: number;
    onClearHistory: () => void;
  }

  const { onImport, onNavigate, pricesByAsset, countryConfig, storedTransactionCount, onClearHistory }: Props = $props();

  const importers = [
    new LedgerImporter(),
    new BinanceImporter(),
    new RevolutXImporter(),
  ];

  const liveSources = [new BinanceLiveSource(), new RevolutXLiveSource()];

  let activeTab = $state<'csv' | 'live'>('csv');
  let importSourceName = $state('');
  let parsedCount = $state(0);
  let newCount = $state(0);
  let dupCount = $state(0);
  let enriching = $state(false);
  let enrichProgress = $state(0);
  let enrichTotal = $state(0);
  let enrichFailed = $state(0);
  let missingPrices = $state<MissingPrice[]>([]);
  let showMissingModal = $state(false);
  let highlightPricePanel = $state(false);
  let pricePanel: HTMLElement | null = null;
  let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

  const converter = getCryptoConverter();

  const handleEnrich = async (transactions: Transaction[], sourceName: string): Promise<{ newCount: number; dupCount: number }> => {
    importSourceName = sourceName;
    enriching = true;
    enrichProgress = 0;
    enrichTotal = transactions.length;
    enrichFailed = 0;
    parsedCount = 0;
    missingPrices = [];

    const result = await enrichFiatValues(transactions, converter, countryConfig.currency, (progress) => {
      enrichProgress = progress.completed;
      enrichTotal = progress.total;
      enrichFailed = progress.failed;
    });

    enriching = false;
    enrichFailed = result.failed;
    parsedCount = result.transactions.length;
    missingPrices = result.missingPrices;
    const counts = await onImport(result.transactions);
    newCount = counts.newCount;
    dupCount = counts.dupCount;
    return counts;
  };

  const handleCsvFileSelected = () => {
    importSourceName = '';
    parsedCount = 0;
    newCount = 0;
    dupCount = 0;
    enriching = false;
    enrichProgress = 0;
    enrichTotal = 0;
    enrichFailed = 0;
    missingPrices = [];
  };

  const scrollToPricePanel = () => {
    if (pricePanel) {
      const y = pricePanel.getBoundingClientRect().top + window.scrollY - 28;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
    if (highlightTimeout) clearTimeout(highlightTimeout);
    highlightPricePanel = true;
    highlightTimeout = setTimeout(() => { highlightPricePanel = false; }, 2800);
  };
</script>

<section class="py-16">
  <div class="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-3 lg:items-start">

    <!-- ===== LEFT: IMPORT ===== -->
    <div class="lg:col-span-2">
      <h2 class="mb-2 font-heading text-2xl font-medium text-text-heading">Import transactions</h2>
      <p class="mb-4 text-sm leading-relaxed text-text">
        Upload a CSV export or connect directly to your exchange. Your data stays in your browser and is never sent anywhere.
      </p>

      <!-- Stored transactions -->
      {#if storedTransactionCount > 0}
        <div class="mb-5 flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2">
          <p class="text-sm text-text">
            {storedTransactionCount} transaction{storedTransactionCount === 1 ? '' : 's'} stored in your browser
          </p>
          <button
            class="cursor-pointer rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-text transition-colors hover:border-danger-border hover:text-danger"
            onclick={onClearHistory}
          >
            Clear history
          </button>
        </div>
      {/if}

      <!-- Tabs -->
      <div class="mb-6 flex gap-6 border-b border-border">
        <button
          class="-mb-px border-b-2 py-3 text-sm font-semibold transition-colors focus:outline-none
            {activeTab === 'csv' ? 'border-accent text-accent' : 'border-transparent text-text hover:text-text-heading'}"
          onclick={() => { activeTab = 'csv'; }}
        >
          CSV import
        </button>
        <button
          class="-mb-px border-b-2 py-3 text-sm font-semibold transition-colors focus:outline-none
            {activeTab === 'live' ? 'border-accent text-accent' : 'border-transparent text-text hover:text-text-heading'}"
          onclick={() => { activeTab = 'live'; }}
        >
          Live exchange
        </button>
      </div>

      {#if activeTab === 'csv'}
        <CsvImporter {importers} onConfirm={handleEnrich} onFileSelected={handleCsvFileSelected} />
      {:else}
        <!-- Live exchange tab -->
        {#if isTauri()}
          <LiveImporter {liveSources} onConfirm={handleEnrich} {onNavigate} />
        {:else}
          <!-- Browser: desktop-only notice -->
          <div class="mt-2 rounded-xl border border-border bg-bg-card px-7 py-6">
            <Badge variant="outlined" color="accent">Desktop app only</Badge>
            <h3 class="mt-4 text-lg font-bold tracking-tight text-text-heading">Connect an exchange directly</h3>
            <p class="mt-2.5 max-w-lg text-sm leading-relaxed text-text">
              Browsers block the cross-origin requests needed to reach exchange APIs, so live import isn't available on the web.
              The Kryptax desktop app stores your API keys in your operating system's keychain and pulls trades straight from
              Binance, Revolut X and others — nothing leaves your machine.
            </p>
            <p class="mt-3 text-sm leading-relaxed text-text">
              On the web, export a CSV from your exchange and use the
              <button
                class="font-semibold text-text-heading underline underline-offset-2 hover:text-accent"
                onclick={() => { activeTab = 'csv'; }}
              >CSV import</button> tab.
            </p>
            <a
              href="https://github.com/martinebl/kryptax/releases"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent/90"
            >
              Get the desktop app →
            </a>
          </div>
        {/if}
      {/if}

      <!-- Enrichment status (progress + warning shared by both tabs; success is CSV-only) -->
      <ImportStatus
        {enriching}
        {enrichProgress}
        {enrichTotal}
        {enrichFailed}
        {parsedCount}
        {newCount}
        {dupCount}
        sourceName={importSourceName}
        showSuccess={activeTab === 'csv'}
        onViewResults={() => onNavigate('results')}
        onReviewMissing={() => { showMissingModal = true; }}
      />

    </div>

    <!-- ===== RIGHT: PRICE DATA ===== -->
    <div
      bind:this={pricePanel}
      class="rounded-2xl border bg-surface p-6 transition-all duration-300 lg:sticky lg:top-8
        {highlightPricePanel ? 'border-accent ring-4 ring-accent/20' : 'border-border'}"
    >
      <h2 class="mb-2 font-heading text-xl font-semibold text-text-heading">Price data</h2>
      <p class="mb-4 text-sm leading-relaxed text-text">
        Upload a CSV with historical prices for assets or periods not covered by CoinGecko's free API.
      </p>
      <CsvPriceUploader {pricesByAsset} />
    </div>

  </div>
</section>

<!-- Missing prices modal -->
{#if showMissingModal}
  <MissingPricesModal
    {missingPrices}
    currency={countryConfig.currency}
    onClose={() => { showMissingModal = false; }}
    onGoToUploader={() => { showMissingModal = false; scrollToPricePanel(); }}
  />
{/if}
