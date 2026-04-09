<script lang="ts">
  import Card from '$lib/components/Card.svelte'
  import type { CountryConfig } from '$lib/types/tax-rules';
  import logoUrl from '/kryptax.png'

  interface Props {
    onNavigate: (page: string) => void;
    availableCountries: CountryConfig[];
    selectedCountry: CountryConfig | null;
    onSelectCountry: (countryCode: string) => void;
  }

  const { onNavigate, availableCountries, selectedCountry, onSelectCountry }: Props = $props();
</script>

<!-- Hero -->
<section class="py-20 text-center max-md:py-12">
  <div class="mb-6 flex items-center justify-center">
    <img src={logoUrl} alt="Kryptax logo" class="size-16 rounded-full" />
  </div>
  <h1 class="mb-4 font-heading text-6xl font-medium tracking-tight text-text-heading max-md:text-4xl">
    Kryptax
  </h1>
  <p class="mx-auto mb-10 max-w-lg text-lg leading-relaxed text-text">
    Local-first cryptocurrency tax calculator.<br />
    Your keys, your data, your taxes — computed entirely in your browser.
  </p>
  <div class="flex flex-col items-center gap-4">
    <div class="flex items-center gap-3">
      <select
        value={selectedCountry?.countryCode ?? ''}
        class="rounded-lg border border-border bg-bg-card px-3 py-2.5 text-sm text-text-heading focus:border-accent focus:outline-none"
        onchange={(e) => onSelectCountry((e.target as HTMLSelectElement).value)}
      >
        <option value="" disabled>Select your country…</option>
        {#each availableCountries as c}
          <option value={c.countryCode}>{c.country}</option>
        {/each}
      </select>
      <button
        class="rounded-lg bg-accent px-6 py-2.5 text-sm text-white transition-shadow
          {selectedCountry ? 'cursor-pointer hover:shadow-lg' : 'cursor-not-allowed opacity-50'}"
        disabled={!selectedCountry}
        onclick={() => onNavigate('import')}
      >
        Get started
      </button>
    </div>
    <a
      href="#features"
      class="cursor-pointer rounded-lg border border-border bg-transparent px-6 py-2.5 text-sm text-text-heading transition-colors hover:bg-bg-card"
    >
      Learn more
    </a>
  </div>
</section>

<!-- Features -->
<section id="features" class="border-t border-border py-16">
  <h2 class="mb-10 text-center font-heading text-2xl font-medium text-text-heading">Features</h2>
  <div class="grid grid-cols-3 gap-5 max-md:grid-cols-1">
    <Card title="Your data stays local">
      <p class="text-sm leading-relaxed text-text">
        All calculations run in your browser. Your transaction data never leaves your device.
        The only network requests are to fetch historical exchange rates for the days you traded.
      </p>
    </Card>
    <Card title="Exchange imports">
      <p class="text-sm leading-relaxed text-text">Import transaction history from major exchanges. Custom importers handle each format automatically.</p>
    </Card>
    <Card title="Offline crypto prices">
      <p class="text-sm leading-relaxed text-text">
        Upload daily crypto price CSVs to resolve historical crypto prices offline.
        For any asset not covered, Kryptax falls back to the CoinGecko API.
        Fiat exchange rates are always fetched from Frankfurter.
      </p>
    </Card>
  </div>
</section>

<!-- How it works -->
<section id="how-it-works" class="border-t border-border py-16">
  <h2 class="mb-10 text-center font-heading text-2xl font-medium text-text-heading">How it works</h2>
  <div class="flex gap-6 max-md:flex-col">
    {#each [
      { num: '1', title: 'Import', desc: 'Upload your exchange CSV exports. Optionally add price CSVs to keep crypto price lookups offline.' },
      { num: '2', title: 'Configure', desc: 'Select your country.' },
      { num: '3', title: 'Calculate', desc: 'Get a breakdown of gains and losses.' },
    ] as step}
      <div class="flex-1 p-6 text-center">
        <span class="mb-4 inline-flex size-9 items-center justify-center rounded-full border border-accent-border bg-accent-bg text-sm font-semibold text-accent">
          {step.num}
        </span>
        <h3 class="mb-2 font-heading text-[17px] font-semibold text-text-heading">{step.title}</h3>
        <p class="text-sm leading-relaxed text-text">{step.desc}</p>
      </div>
    {/each}
  </div>
</section>