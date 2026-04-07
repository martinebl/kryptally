<script lang="ts">
  import type { Transaction } from '$lib/types';
  import type { TaxRules } from '$lib/types/tax-rules';
  import { setCryptoConverter } from '$lib/context';
  import { createCoinGeckoCryptoToFiatConverter, preflightResolve, setUserResolutions, type CoinListEntry } from '$lib/converters/coingecko';
  import { createCsvCryptoToFiatConverter, loadCsvPrices } from '$lib/converters/csv-prices';
  import { createLayeredCryptoToFiatConverter } from '$lib/converters/layered';
  import { createFrankfurterFiatConverter } from '$lib/converters/frankfurter';
  import LandingPage from '$lib/components/LandingPage.svelte'
  import ImportPage from '$lib/components/ImportPage.svelte'
  import ResultsPage from '$lib/components/ResultsPage.svelte'
  import TestResultsPage from '$lib/components/TestResultsPage.svelte'
  import CoinDisambiguator from '$lib/components/CoinDisambiguator.svelte'
  import dkRules from '$lib/rules/dk/dk-2024.json';
  import logoUrl from '/kryptax.png'

  const taxRules: TaxRules = dkRules as TaxRules;

  let pricesByAsset = $state(loadCsvPrices());

  setCryptoConverter(createLayeredCryptoToFiatConverter([
    createCsvCryptoToFiatConverter(pricesByAsset, createFrankfurterFiatConverter()),
    createCoinGeckoCryptoToFiatConverter(),
  ]));

  let currentPage = $state('home');
  let transactions = $state<Transaction[]>([]);
  let pendingTransactions = $state<Transaction[]>([]);
  let ambiguousCoins = $state<Record<string, CoinListEntry[]>>({});

  const navigate = (page: string) => {
    currentPage = page;
    window.scrollTo(0, 0);
  };

  const handleImport = async (imported: Transaction[]) => {
    const allTickers = [
      ...imported.map((t) => t.toAsset),
      ...imported.map((t) => t.fromAsset),
      ...imported.map((t) => t.feeAsset),
    ].filter((t): t is string => !!t);
    const uniqueTickers = [...new Set(allTickers)];

    const ambiguous = await preflightResolve(uniqueTickers);
    pendingTransactions = imported;
    ambiguousCoins = ambiguous;

    transactions = [...transactions, ...imported];
    pendingTransactions = [];
  };

  const handleDisambiguate = (resolutions: Record<string, string>) => {
    setUserResolutions(resolutions);
    transactions = [...transactions, ...pendingTransactions];
    pendingTransactions = [];
    ambiguousCoins = {};
    navigate('results');
  };
</script>

<div class="flex min-h-svh flex-col">
  <!-- Nav -->
  <header class="border-b border-border">
    <nav class="mx-auto flex max-w-5xl items-center justify-between px-8 py-4">
      <button
        class="flex cursor-pointer items-center gap-2.5 border-none bg-transparent text-xl font-semibold text-text-heading"
        onclick={() => navigate('home')}
      >
        <img src={logoUrl} alt="Kryptax logo" class="size-7 rounded-full" />
        <span>Kryptax</span>
      </button>
      <div class="flex gap-6 max-md:hidden">
        <button
          class="cursor-pointer border-none bg-transparent text-sm transition-colors hover:text-text-heading
            {currentPage === 'home' ? 'text-text' : 'text-text'}"
          onclick={() => navigate('home')}
        >
          Home
        </button>
        <button
          class="cursor-pointer border-none bg-transparent text-sm transition-colors hover:text-text-heading
            {currentPage === 'import' ? 'text-accent' : 'text-text'}"
          onclick={() => navigate('import')}
        >
          Import
        </button>
        <button
          class="cursor-pointer border-none bg-transparent text-sm transition-colors hover:text-text-heading
            {currentPage === 'results' ? 'text-accent' : 'text-text'}"
          onclick={() => navigate('results')}
        >
          Results
        </button>
        <button
          class="cursor-pointer border-none bg-transparent text-sm transition-colors hover:text-text-heading
            {currentPage === 'test-results' ? 'text-accent' : 'text-text'}"
          onclick={() => navigate('test-results')}
        >
          Test Results
        </button>
      </div>
    </nav>
  </header>

  <main class="mx-auto w-full max-w-5xl px-8">
    {#if currentPage === 'home'}
      <LandingPage onNavigate={navigate} />
    {:else if currentPage === 'import'}
      <ImportPage onImport={handleImport} {pricesByAsset} {taxRules} />
    {:else if currentPage === 'results'}
      <ResultsPage {transactions} />
    {:else if currentPage === 'test-results'}
      <TestResultsPage />
    {/if}

    <CoinDisambiguator
      ambiguous={ambiguousCoins}
      onConfirm={handleDisambiguate}
      onClose={() => { pendingTransactions = []; ambiguousCoins = {}; }}
    />
  </main>

  <!-- Footer -->
  <footer class="mt-auto border-t border-border px-8 py-6 text-center text-sm text-text">
    <p>Kryptax — open-source crypto tax calculator</p>
  </footer>
</div>