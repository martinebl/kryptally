<script lang="ts">
  import type { MissingPrice } from '$lib/engine/enrich-fiat-values';
  import { groupMissingPrices } from '$lib/engine/missing-prices';
  import Badge from '$lib/components/Badge.svelte';

  interface Props {
    missingPrices: MissingPrice[];
    currency: string;
    onClose: () => void;
    onGoToUploader: () => void;
  }

  const { missingPrices, currency, onClose, onGoToUploader }: Props = $props();

  const groups = $derived(groupMissingPrices(missingPrices));

  const downloadCSV = () => {
    const rows = groups.flatMap((g) => g.dates.map((d) => `${g.asset},${d},${currency}`));
    const csv = ['ticker,date,currency', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kryptax-missing-prices.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
  onclick={onClose}
  role="presentation"
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
      <div>
        <h2 class="text-lg font-bold text-text-heading">{missingPrices.length} price{missingPrices.length === 1 ? '' : 's'} still needed</h2>
        <p class="mt-1.5 max-w-sm text-sm leading-relaxed text-text">
          CoinGecko's free tier didn't cover these dates. Download the list, fetch the prices anywhere
          — Yahoo Finance, your exchange — and upload the filled CSV back.
        </p>
      </div>
      <button
        class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-card text-sm text-text hover:text-text-heading"
        onclick={onClose}
        aria-label="Close"
      >✕</button>
    </div>

    <!-- Asset list -->
    <div class="flex-1 overflow-y-auto px-6 py-1">
      {#each groups as group}
        <div class="flex items-center justify-between gap-3 border-b border-border py-3.5">
          <div>
            <p class="text-sm font-semibold text-text-heading">{group.asset}</p>
            <p class="mt-0.5 font-mono text-xs text-text">{group.range}</p>
          </div>
          <Badge variant="outlined" color="amber">
            {group.count} date{group.count === 1 ? '' : 's'}
          </Badge>
        </div>
      {/each}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
      <button
        class="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-text-heading transition-colors hover:bg-bg-card"
        onclick={downloadCSV}
      >
        Download list (CSV)
      </button>
      <button
        class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
        onclick={onGoToUploader}
      >
        Go to uploader →
      </button>
    </div>
  </div>
</div>
