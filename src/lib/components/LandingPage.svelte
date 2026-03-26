<script lang="ts">
  import svelteLogo from '../../assets/svelte.svg'
  import viteLogo from '../../assets/vite.svg'
  import Card from '$lib/components/Card.svelte'

  interface Props {
    onNavigate: (page: string) => void;
  }

  const { onNavigate }: Props = $props();
</script>

<!-- Hero -->
<section class="py-20 text-center max-md:py-12">
  <div class="mb-6 flex items-center justify-center gap-3">
    <img src={svelteLogo} alt="Svelte" class="size-9" />
    <span class="text-xl font-light text-text">+</span>
    <img src={viteLogo} alt="Vite" class="size-9" />
  </div>
  <h1 class="mb-4 font-heading text-6xl font-medium tracking-tight text-text-heading max-md:text-4xl">
    Cryptax
  </h1>
  <p class="mx-auto mb-10 max-w-lg text-lg leading-relaxed text-text">
    Local-first cryptocurrency tax calculator.<br />
    Your keys, your data, your taxes — computed entirely in your browser.
  </p>
  <div class="flex justify-center gap-3">
    <button
      class="cursor-pointer rounded-lg bg-accent px-6 py-2.5 text-sm text-white transition-shadow hover:shadow-lg"
      onclick={() => onNavigate('import')}
    >
      Get started
    </button>
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
  <div class="grid grid-cols-2 gap-5 max-md:grid-cols-1">
    <Card title="Privacy first">
      <p class="text-sm leading-relaxed text-text">All calculations run locally in your browser. Your transaction data never leaves your device.</p>
    </Card>
    <Card title="Multi-jurisdiction">
      <p class="text-sm leading-relaxed text-text">Country-specific tax rules with support for different income types, brackets, and loss deductions.</p>
    </Card>
    <Card title="Exchange imports">
      <p class="text-sm leading-relaxed text-text">Import transaction history from major exchanges. Custom importers handle each format automatically.</p>
    </Card>
    <Card title="Precise calculations">
      <p class="text-sm leading-relaxed text-text">Arbitrary-precision arithmetic ensures your tax figures are accurate down to the last satoshi.</p>
    </Card>
  </div>
</section>

<!-- How it works -->
<section id="how-it-works" class="border-t border-border py-16">
  <h2 class="mb-10 text-center font-heading text-2xl font-medium text-text-heading">How it works</h2>
  <div class="flex gap-6 max-md:flex-col">
    {#each [
      { num: '1', title: 'Import', desc: 'Upload your exchange CSV exports or enter transactions manually.' },
      { num: '2', title: 'Configure', desc: 'Select your country and tax year. Rules are applied automatically.' },
      { num: '3', title: 'Calculate', desc: 'Get a full breakdown of gains, losses, and estimated tax per income type.' },
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