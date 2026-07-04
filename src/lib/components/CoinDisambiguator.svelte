<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import type { CoinListEntry } from '$lib/converters/coingecko';

  interface Props {
    ambiguous: Record<string, CoinListEntry[]>;
    onConfirm: (resolutions: Record<string, string>) => void;
    onClose?: () => void;
  }

  const { ambiguous, onConfirm, onClose }: Props = $props();

  const tickers = Object.keys(ambiguous);
  let selections = $state<Record<string, string>>(
    Object.fromEntries(tickers.map((t) => [t, ambiguous[t][0].id])),
  );

  const allSelected = $derived(tickers.every((t) => selections[t]));
  const open = $derived(tickers.length > 0);
</script>

<Modal {open} title="Ambiguous coins" {onClose}>
  <p class="mb-5 text-sm text-text">
    Some tickers match multiple coins on CoinGecko. Pick the correct one for each so prices are
    fetched accurately.
  </p>

  <div class="space-y-4">
    {#each tickers as ticker}
      <div class="rounded-lg border border-border bg-bg p-4">
        <p class="mb-2 text-sm font-medium text-text-heading">
          <span class="font-mono">{ticker}</span>
        </p>
        <div class="space-y-1">
          {#each ambiguous[ticker] as coin}
            <label class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-bg-card transition-colors">
              <input
                type="radio"
                name={ticker}
                value={coin.id}
                checked={selections[ticker] === coin.id}
                onchange={() => (selections[ticker] = coin.id)}
                class="accent-accent"
              />
              <span class="flex-1 text-sm text-text-heading">{coin.name}</span>
              <span class="font-mono text-xs text-text">{coin.id}</span>
            </label>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="mt-5 flex justify-end">
    <button
      class="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-on-accent disabled:opacity-40 hover:opacity-90 transition-opacity"
      disabled={!allSelected}
      onclick={() => onConfirm(selections)}
    >
      Confirm and continue
    </button>
  </div>
</Modal>
