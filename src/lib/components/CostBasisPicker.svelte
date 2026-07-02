<script lang="ts">
  import type { CostBasisMethod, CountryConfig } from '$lib/types/tax-rules';
  import { costBasisMethodDescriptions } from '$lib/rules';

  interface Props {
    country: CountryConfig;
    allowedMethods: CostBasisMethod[];
    selectedMethod: CostBasisMethod;
    onSelect: (method: CostBasisMethod) => void;
  }

  const { country, allowedMethods, selectedMethod, onSelect }: Props = $props();

  const pillClass = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1 text-tag font-semibold transition-colors
      ${active ? 'border-accent bg-accent text-white' : 'border-border bg-surface text-text hover:text-text-heading'}`;
</script>

{#if allowedMethods.length > 0}
  <div class="max-w-[420px] rounded-btn border border-border bg-bg-card px-card-x py-3.5">
    <div class="mb-2.5 font-mono text-tag font-semibold tracking-[0.06em] text-text-faint uppercase">
      Cost-basis method · {country.countryCode}
    </div>
    <div class="mb-2.5 flex flex-wrap gap-1.5">
      {#each allowedMethods as method}
        <button class={pillClass(method === selectedMethod)} onclick={() => onSelect(method)}>
          {method.toUpperCase()}
        </button>
      {/each}
    </div>
    <div class="text-sm leading-relaxed text-text-muted">
      {costBasisMethodDescriptions[selectedMethod]}
    </div>
  </div>
{/if}
