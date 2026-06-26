<script lang="ts">
  import type { CountryConfig } from '$lib/types/tax-rules';

  interface Props {
    onNavigate: (page: string) => void;
    availableCountries: CountryConfig[];
    selectedCountry: CountryConfig | null;
    onSelectCountry: (countryCode: string) => void;
  }

  const { onNavigate, availableCountries, selectedCountry, onSelectCountry }: Props = $props();

  let howSection: HTMLElement | undefined = $state();

  const seeHow = () => {
    howSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const local = { tag: 'On your device', cls: 'text-[#2f7d4a] bg-[#f0f8f1] border-[#cce6d3]' };
  const net = { tag: 'Looked up', cls: 'text-[#9a6a12] bg-[#fdf8e6] border-[#ecd98f]' };

  const residency = [
    { label: 'Your transaction history', ...local },
    { label: 'Exchange API keys', ...local },
    { label: 'Gain/loss & cost-basis math', ...local },
    { label: 'Historical fiat (FX) rates', ...net },
    { label: 'Prices for missing cost basis', ...net },
    { label: 'Spot prices for held tickers', ...net },
  ];

  const features = [
    { no: '01', title: 'Your data stays local', body: 'Every calculation runs in your browser. Transaction data never leaves your device — only anonymous historical rate lookups touch the network.' },
    { no: '02', title: 'Exchange imports', body: 'Import history from major exchanges. Choose the exchange and upload a csv file (or connect directly via an API key in the desktop version).' },
    { no: '03', title: 'Offline crypto prices', body: 'Drop in daily price CSVs to resolve prices offline. Anything not covered falls back to the CoinGecko API.' },
  ];

  const steps = [
    { no: '1', title: 'Import', body: 'Upload your exchange CSV exports. Optionally add price CSVs to keep lookups fully offline.' },
    { no: '2', title: 'Configure', body: 'Select your country. Kryptax applies the local rules.' },
    { no: '3', title: 'Calculate', body: 'Get a clear breakdown of realised gains, losses and taxable events — ready to file.' },
  ];
</script>

<!-- ================= HERO ================= -->
<section class="grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center gap-16 pt-16 pb-hero-bottom max-md:grid-cols-1 max-md:gap-10">
  <!-- left -->
  <div>
    <div class="inline-flex items-center gap-2.5 rounded-full border border-[#f1e2bf] bg-[#fdf4e3] px-3 py-[5px] font-mono text-tag font-medium tracking-[0.08em] text-[#9a6a12]">
      <span class="size-1.5 rounded-full bg-accent"></span>LOCAL-FIRST · OPEN SOURCE
    </div>

    <h1 class="mt-5 max-w-[13ch] text-hero font-bold leading-[1.06] tracking-[-0.03em] text-text-heading text-balance max-md:text-4xl">
      Crypto taxes, computed on your device.
    </h1>

    <p class="mt-5 max-w-[46ch] text-base leading-relaxed text-text">
      Your keys, your data, your taxes. Kryptax never sends your transactions to a server — every calculation runs on your own machine.
    </p>

    <!-- controls -->
    <div class="mt-[30px] flex flex-wrap items-center gap-3">
      <div class="relative">
        <select
          value={selectedCountry?.countryCode ?? ''}
              class="min-w-[172px] cursor-pointer appearance-none rounded-btn border border-[#ddd8cf] bg-surface py-btn-y pr-[42px] pl-4 text-nav text-text-heading focus:border-accent focus:outline-none"
          onchange={(e) => onSelectCountry((e.target as HTMLSelectElement).value)}
        >
          <option value="" disabled>Select your country…</option>
              {#each availableCountries as c}
                <option value={c.countryCode}>{c.country}</option>
              {/each}
            </select>
            <span class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[11px] text-text-muted">▼</span>
          </div>
          <button
            class="inline-flex items-center rounded-btn bg-accent px-btn-x py-btn-y text-nav font-semibold text-white transition-shadow
              {selectedCountry ? 'cursor-pointer hover:shadow-lg' : 'cursor-not-allowed opacity-50'}"
            disabled={!selectedCountry}
            onclick={() => onNavigate('import')}
          >
            Get started
          </button>
        </div>

        <div class="mt-section-sm">
          <button
            class="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-sm font-medium text-text-muted"
            onclick={seeHow}
          >
            How it works <span class="text-xs">↓</span>
          </button>
        </div>

        <div class="mt-section-lg flex flex-wrap gap-section-sm font-mono text-xs text-text-faint">
          <span>No account</span><span>No tracking</span>
        </div>
  </div>

  <!-- right: data-residency proof panel -->
      <div class="overflow-hidden rounded-[18px] border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div class="flex items-center justify-between border-b border-border-soft px-card-x py-section-sm">
      <span class="font-mono text-[11px] font-medium tracking-[0.07em] text-text-faint">WHAT LEAVES YOUR DEVICE</span>
    </div>
        <div class="px-card-x pt-1.5 pb-2.5">
          {#each residency as r}
            <div class="flex items-center justify-between gap-3.5 border-t border-border-soft py-btn-y first:border-t-0">
              <span class="text-sm text-[#3f3c36]">{r.label}</span>
          <span class="flex-none rounded-full border px-tag-x py-1 text-tag font-semibold whitespace-nowrap {r.cls}">{r.tag}</span>
        </div>
      {/each}
    </div>
        <div class="flex items-center gap-2 border-t border-border-soft bg-[#f7f9f7] px-card-x py-3.5 font-mono text-xs text-[#2f7d4a]">
      <span>✓</span>Your personal data never leaves this device
    </div>
  </div>
</section>

<div class="border-t border-border"></div>

<!-- ================= FEATURES ================= -->
<section class="pt-16 pb-2">
  <div class="font-mono text-xs font-medium tracking-[0.07em] text-accent">WHY KRYPTAX</div>
      <h2 class="mt-3 max-w-[20ch] text-section-heading font-bold tracking-[-0.02em] text-text-heading">
        Built for people who'd rather not hand their trade history to anyone else.
      </h2>

      <div class="mt-section-lg grid grid-cols-3 gap-5 max-md:grid-cols-1">
        {#each features as f}
          <div class="rounded-[14px] border border-border bg-bg-card px-card-x py-6">
            <div class="font-mono text-meta font-semibold text-accent">{f.no}</div>
            <h3 class="mt-3.5 text-card-heading font-bold tracking-[-0.01em] text-text-heading">{f.title}</h3>
            <p class="mt-[9px] text-sm leading-relaxed text-[#6b675f]">{f.body}</p>
      </div>
    {/each}
  </div>
</section>

<!-- ================= HOW IT WORKS ================= -->
<section bind:this={howSection} class="pt-16 pb-20">
  <div class="font-mono text-xs font-medium tracking-[0.07em] text-accent">HOW IT WORKS</div>
      <h2 class="mt-3 text-section-heading font-bold tracking-[-0.02em] text-text-heading">Three steps, start to filing.</h2>

  <div class="relative mt-10 grid grid-cols-3 gap-7 max-md:grid-cols-1">
    <!-- connecting line -->
    <div class="absolute top-[21px] left-[21px] right-[calc((100%_-_56px)/3_-_21px)] z-0 h-px bg-[#e6ddcd] max-md:hidden"></div>
    {#each steps as st}
      <div class="relative z-[1]">
          <div class="flex size-[42px] items-center justify-center rounded-full border-[1.5px] border-accent bg-surface font-mono text-nav font-semibold text-accent">{st.no}</div>
            <h3 class="mt-4 text-card-heading font-bold text-text-heading">{st.title}</h3>
        <p class="mt-2 max-w-[30ch] text-sm leading-relaxed text-[#6b675f]">{st.body}</p>
      </div>
    {/each}
  </div>

  <div class="mt-12 flex flex-wrap items-center gap-3.5">
        <button
          class="inline-flex items-center rounded-btn bg-accent px-btn-x py-btn-y text-nav font-semibold text-white transition-shadow
            {selectedCountry ? 'cursor-pointer hover:shadow-lg' : 'cursor-not-allowed opacity-50'}"
          disabled={!selectedCountry}
          onclick={() => onNavigate('import')}
        >
          Import your first CSV
        </button>
    <span class="text-sm text-text-muted">
      {selectedCountry ? 'Takes about two minutes.' : 'Select your country above to begin.'}
    </span>
  </div>
</section>
