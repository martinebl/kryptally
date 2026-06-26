<script lang="ts">
  import type { Transaction } from '$lib/types';
  import type { CountryConfig } from '$lib/types/tax-rules';
  import { setCryptoConverter, setCurrentPriceFetcher, setPersistPriceEntry } from '$lib/context';
  import { createCoinGeckoCryptoToFiatConverter, preflightResolve, setUserResolutions, type CoinListEntry } from '$lib/converters/coingecko';
  import { createCsvCryptoToFiatConverter, loadCsvPrices } from '$lib/converters/csv-prices';
  import { createLayeredCryptoToFiatConverter } from '$lib/converters/layered';
  import { createFrankfurterFiatConverter } from '$lib/converters/frankfurter';
  import { createCoinGeckoCurrentPriceFetcher } from '$lib/converters/current-prices';
  import LandingPage from '$lib/components/LandingPage.svelte'
  import ImportPage from '$lib/components/ImportPage.svelte'
  import ResultsPage from '$lib/components/ResultsPage.svelte'
  import TestResultsPage from '$lib/components/TestResultsPage.svelte'
  import CoinDisambiguator from '$lib/components/CoinDisambiguator.svelte'
  import { availableCountries, findCountry } from '$lib/rules';
  import { createLocalStorageStorage, createPriceRepository, createTransactionRepository } from '$lib/storage';
  import { version } from '../version.json';

  const storage = createLocalStorageStorage();

  let countryConfig = $state<CountryConfig | null>(null);
  storage.get('kryptax-country').then((saved) => {
    if (saved && !countryConfig) countryConfig = findCountry(saved) ?? null;
  });

  const selectCountry = (countryCode: string) => {
    const found = findCountry(countryCode);
    if (!found) return;

    if (transactions.length > 0) {
      const ok = confirm(
        `Switching country will clear your imported transactions, as they were enriched in ${countryConfig?.currency}. Continue?`
      );
      if (!ok) return;
      transactions = [];
      txRepo.clear().catch((e) => console.error('Failed to clear stored transactions', e));
    }

    countryConfig = found;
    storage.set('kryptax-country', countryCode).catch((e) => console.error('Failed to save country selection', e));
  };

  const priceRepo = createPriceRepository(storage);

  let pricesByAsset = $state(loadCsvPrices());

  // Merge user-uploaded prices (stored) over bundled defaults
  priceRepo.mergeInto(pricesByAsset).catch((e) => console.error('Failed to load stored prices', e));

  setPersistPriceEntry(priceRepo.save);

  setCryptoConverter(createLayeredCryptoToFiatConverter([
    createCsvCryptoToFiatConverter(pricesByAsset, createFrankfurterFiatConverter()),
    createCoinGeckoCryptoToFiatConverter(),
  ]));

  // Batched current-price lookup for "value today" / unrealized figures.
  setCurrentPriceFetcher(createCoinGeckoCurrentPriceFetcher(createFrankfurterFiatConverter()));

  let currentPage = $state('home');
  let transactions = $state<Transaction[]>([]);
  let pendingTransactions = $state<Transaction[]>([]);

  const txRepo = createTransactionRepository(storage);
  // An import that beats this load already holds the full store via merge()
  txRepo.load().then((stored) => {
    if (transactions.length === 0) transactions = stored;
  }).catch((e) => console.error('Failed to load stored transactions', e));
  let ambiguousCoins = $state<Record<string, CoinListEntry[]>>({});

  const navigate = (page: string) => {
    currentPage = page;
    window.scrollTo(0, 0);
  };

  const handleImport = async (imported: Transaction[]): Promise<{ newCount: number; dupCount: number }> => {
    const allTickers = [
      ...imported.map((t) => t.toAsset),
      ...imported.map((t) => t.fromAsset),
      ...imported.map((t) => t.feeAsset),
    ].filter((t): t is string => !!t);
    const uniqueTickers = [...new Set(allTickers)];

    const ambiguous = await preflightResolve(uniqueTickers);
    pendingTransactions = imported;
    ambiguousCoins = ambiguous;

    const result = await txRepo.merge(imported);
    transactions = result.transactions;
    pendingTransactions = [];
    return { newCount: result.newCount, dupCount: result.dupCount };
  };

  const handleDisambiguate = async (resolutions: Record<string, string>) => {
    setUserResolutions(resolutions);
    const result = await txRepo.merge(pendingTransactions);
    transactions = result.transactions;
    pendingTransactions = [];
    ambiguousCoins = {};
    navigate('results');
  };

  const clearTransactions = () => {
    const ok = confirm('This will remove all imported transactions stored in your browser. Continue?');
    if (!ok) return;
    transactions = [];
    txRepo.clear().catch((e) => console.error('Failed to clear stored transactions', e));
  };
</script>

<div class="flex min-h-svh flex-col">
  <!-- Nav -->
  <header class="border-b border-border bg-surface">
    <nav class="mx-auto flex h-16 max-w-page items-center justify-between px-6">
      <button
        class="flex cursor-pointer items-center gap-2.5 border-none bg-transparent"
        onclick={() => navigate('home')}
      >
        <span class="flex size-[30px] items-center justify-center rounded-full bg-text-heading text-nav font-bold text-accent">K</span>
        <span class="text-[19px] font-bold tracking-tight text-text-heading">Kryptax</span>
      </button>
      <div class="flex items-center gap-7 text-nav max-md:gap-5">
        <button
          class="cursor-pointer border-none bg-transparent transition-colors
            {currentPage === 'home' ? 'font-semibold text-accent' : 'text-text-muted hover:text-text-heading'}"
          onclick={() => navigate('home')}
        >
          Home
        </button>
        <button
          class="border-none bg-transparent transition-colors
            {countryConfig ? 'cursor-pointer hover:text-text-heading' : 'cursor-not-allowed opacity-40'}
            {currentPage === 'import' ? 'font-semibold text-accent' : 'text-text-muted'}"
          disabled={!countryConfig}
          onclick={() => navigate('import')}
        >
          Import
        </button>
        <button
          class="border-none bg-transparent transition-colors
            {countryConfig ? 'cursor-pointer hover:text-text-heading' : 'cursor-not-allowed opacity-40'}
            {currentPage === 'results' ? 'font-semibold text-accent' : 'text-text-muted'}"
          disabled={!countryConfig}
          onclick={() => navigate('results')}
        >
          Results
        </button>
      </div>
    </nav>
  </header>

  <main class="mx-auto w-full max-w-page px-6">
    {#if currentPage === 'home'}
      <LandingPage onNavigate={navigate} {availableCountries} selectedCountry={countryConfig} onSelectCountry={selectCountry} />
    {:else if currentPage === 'import' && countryConfig}
      <ImportPage
        onImport={handleImport}
        onNavigate={navigate}
        {pricesByAsset}
        {countryConfig}
        storedTransactionCount={transactions.length}
        onClearHistory={clearTransactions}
      />
    {:else if currentPage === 'results' && countryConfig}
      <ResultsPage {transactions} {countryConfig} />
    <!-- {:else if currentPage === 'test-results'}
      <TestResultsPage /> -->
    {/if}

    <CoinDisambiguator
      ambiguous={ambiguousCoins}
      onConfirm={handleDisambiguate}
      onClose={() => { pendingTransactions = []; ambiguousCoins = {}; }}
    />
  </main>

  <!-- Footer -->
  <footer class="mt-auto border-t border-border bg-surface">
    <div class="mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 px-6 py-7 text-meta text-text-muted">
      <span>Kryptax</span>
      <span class="font-mono text-text-faint">v{version} · Apache-2.0 licensed</span>
    </div>
  </footer>
</div>