<script lang="ts">
  import type { ILiveSource, Transaction } from '$lib/types';
  import DateField from '$lib/components/DateField.svelte';

  interface Props {
    liveSources: ILiveSource[];
    onConfirm: (transactions: Transaction[], sourceName: string) => Promise<void>;
  }

  const { liveSources, onConfirm }: Props = $props();

  let liveSourceOpen = $state<string | null>(null);
  let liveCredsKey = $state('');
  let liveCredsSecret = $state('');
  let liveCredsSaved = $state<Record<string, boolean>>({});
  const today = new Date().toISOString().slice(0, 10);
  let liveSymbols = $state('');
  let liveFromDate = $state('');
  let liveToDate = $state(today);
  let liveFetching = $state(false);
  let liveFetchProgress = $state(0);
  let liveFetchTotal = $state(0);
  let liveDiscovering = $state(false);
  let liveError = $state('');
  let liveInfo = $state('');
  let liveRateLimitSeconds = $state(0);
  let rateLimitTimer: ReturnType<typeof setInterval> | undefined;

  const stopRateLimitCountdown = () => {
    if (rateLimitTimer) clearInterval(rateLimitTimer);
    rateLimitTimer = undefined;
    liveRateLimitSeconds = 0;
  };

  // The backend hit a rate limit and is waiting `waitMs` before retrying; count
  // down so the wait looks intentional rather than frozen.
  const startRateLimitCountdown = (waitMs: number) => {
    stopRateLimitCountdown();
    liveRateLimitSeconds = Math.max(1, Math.ceil(waitMs / 1000));
    rateLimitTimer = setInterval(() => {
      liveRateLimitSeconds -= 1;
      if (liveRateLimitSeconds <= 0) stopRateLimitCountdown();
    }, 1000);
  };

  $effect(() => {
    liveSources.forEach(async (s) => {
      if (s.isAvailable() && liveCredsSaved[s.exchangeName] === undefined) {
        const has = await s.hasCredentials();
        liveCredsSaved = { ...liveCredsSaved, [s.exchangeName]: has };
      }
    });
  });

  const openLiveSource = (name: string) => {
    liveSourceOpen = liveSourceOpen === name ? null : name;
    liveCredsKey = '';
    liveCredsSecret = '';
    liveError = '';

    const source = liveSources.find((s) => s.exchangeName === name);
    if (liveSourceOpen === name && source && liveCredsSaved[name] && source.discoverSymbols) {
      discoverSymbols(source);
    }
  };

  const discoverSymbols = async (source: ILiveSource) => {
    if (!source.discoverSymbols) return;
    liveDiscovering = true;
    liveError = '';
    try {
      liveSymbols = (await source.discoverSymbols()).join(', ');
    } catch (e) {
      liveError = e instanceof Error ? e.message : String(e);
    } finally {
      liveDiscovering = false;
    }
  };

  const handleSaveCredentials = async (source: ILiveSource) => {
    try {
      await source.saveCredentials(liveCredsKey.trim(), liveCredsSecret.trim());
      liveCredsSaved = { ...liveCredsSaved, [source.exchangeName]: true };
      liveCredsKey = '';
      liveCredsSecret = '';
      liveError = '';
      if (source.discoverSymbols) discoverSymbols(source);
    } catch (e) {
      liveError = e instanceof Error ? e.message : String(e);
    }
  };

  const handleClearCredentials = async (source: ILiveSource) => {
    if (!confirm(`Forget the saved ${source.exchangeName} API key? You'll need to re-enter it to import again.`)) return;
    try {
      await source.clearCredentials();
      liveCredsSaved = { ...liveCredsSaved, [source.exchangeName]: false };
    } catch (e) {
      liveError = e instanceof Error ? e.message : String(e);
    }
  };

  const handleFetch = async (source: ILiveSource) => {
    liveFetching = true;
    liveError = '';
    liveInfo = '';
    liveFetchProgress = 0;
    liveFetchTotal = 0;
    try {
      const symbols = liveSymbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      if ((source.requiresSymbols ?? true) && symbols.length === 0) {
        liveFetching = false;
        liveError = 'No pair symbols to fetch. Enter at least one pair (e.g. BTC-USD) or use Re-detect pairs.';
        return;
      }
      if (source.requiresDateRange && (!liveFromDate || !liveToDate)) {
        liveFetching = false;
        liveError = `Select a start and end date — ${source.exchangeName} only serves bounded ranges.`;
        return;
      }
      // Clamp the end of the window to today (the API's maximum).
      if (liveToDate > today) liveToDate = today;
      const fetched = await source.fetch({
        symbols,
        from: liveFromDate ? new Date(liveFromDate) : undefined,
        to: liveToDate ? new Date(`${liveToDate}T23:59:59Z`) : undefined,
        onProgress: ({ completed, total }) => {
          liveFetchProgress = completed;
          liveFetchTotal = total;
        },
        onRateLimit: ({ waitMs }) => startRateLimitCountdown(waitMs),
      });
      stopRateLimitCountdown();
      liveFetching = false;
      if (fetched.length === 0) {
        liveInfo = (source.requiresSymbols ?? true)
          ? `No transactions found for: ${symbols.join(', ')}. Check the pair symbols and date range.`
          : `No ${source.exchangeName} exchange activity found. If you bought or sold via the main app rather than the exchange order book, that isn't exposed by the API — export a CSV and import it below instead.`;
        return;
      }
      await onConfirm(fetched, source.exchangeName);
    } catch (e) {
      stopRateLimitCountdown();
      liveFetching = false;
      liveError = e instanceof Error ? e.message : String(e);
    }
  };
</script>

<p class="mb-4 text-xs text-text">
  Pull transactions straight from the exchange API instead of uploading a CSV. Credentials are stored in your OS keychain.
</p>

{#each liveSources as source}
  {@const available = source.isAvailable()}
  {@const open = liveSourceOpen === source.exchangeName}
  {@const saved = liveCredsSaved[source.exchangeName] ?? false}
  <div class="mb-3 rounded-lg border border-border bg-bg-card p-4">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-text-heading">{source.exchangeName}</p>
        {#if !available}
          <p class="text-xs text-text">Available in the desktop app — see the project README for the download link.</p>
        {:else if saved}
          <p class="text-xs text-text">Credentials saved in OS keychain.</p>
        {:else}
          <p class="text-xs text-text">No credentials saved yet.</p>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if available && saved}
          <button
            class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-heading transition-colors hover:border-red-300 hover:text-red-600"
            onclick={() => handleClearCredentials(source)}
          >
            Forget API key
          </button>
        {/if}
        <button
          class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-heading transition-colors hover:bg-bg-card disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!available}
          onclick={() => openLiveSource(source.exchangeName)}
        >
          {open ? 'Close' : saved ? 'Manage' : 'Connect'}
        </button>
      </div>
    </div>

    {#if available && open}
      <div class="mt-4 space-y-3 border-t border-border pt-4">
        {#if !saved}
          <div>
            <label for="live-key-{source.exchangeName}" class="mb-1 block text-xs font-medium text-text-heading">{source.keyLabel ?? 'API key'}</label>
            <input
              id="live-key-{source.exchangeName}"
              type="password"
              bind:value={liveCredsKey}
              class="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-heading focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label for="live-secret-{source.exchangeName}" class="mb-1 block text-xs font-medium text-text-heading">{source.secretLabel ?? 'API secret'}</label>
            <textarea
              id="live-secret-{source.exchangeName}"
              rows="3"
              bind:value={liveCredsSecret}
              class="w-full rounded-lg border border-border bg-bg-card px-3 py-2 font-mono text-xs text-text-heading focus:border-accent focus:outline-none"
            ></textarea>
          </div>
          <button
            class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            disabled={!liveCredsKey || !liveCredsSecret}
            onclick={() => handleSaveCredentials(source)}
          >
            Save credentials
          </button>
        {:else}
          {#if source.requiresSymbols ?? true}
            <div>
              <div class="mb-1 flex items-center justify-between">
                <label for="live-symbols-{source.exchangeName}" class="block text-xs font-medium text-text-heading">Pair symbols (comma-separated)</label>
                {#if source.discoverSymbols}
                  <button
                    type="button"
                    class="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                    disabled={liveDiscovering}
                    onclick={() => discoverSymbols(source)}
                  >
                    {liveDiscovering ? 'Detecting…' : 'Re-detect pairs'}
                  </button>
                {/if}
              </div>
              <input
                id="live-symbols-{source.exchangeName}"
                type="text"
                placeholder={source.symbolPlaceholder ?? ''}
                bind:value={liveSymbols}
                class="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-heading focus:border-accent focus:outline-none"
              />
            </div>
          {/if}
          {#if source.symbolsNote}
            <p class="text-xs text-text">{source.symbolsNote}</p>
          {/if}
          <div>
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs font-medium text-text-heading">Date range{source.requiresDateRange ? '' : ' (optional)'}</span>
              {#if liveFromDate || liveToDate}
                <button
                  type="button"
                  class="text-xs font-medium text-accent hover:underline"
                  onclick={() => { liveFromDate = ''; liveToDate = ''; }}
                >
                  Clear dates
                </button>
              {/if}
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="live-from-{source.exchangeName}" class="mb-1 block text-xs text-text">From</label>
                <DateField id="live-from-{source.exchangeName}" max={today} bind:value={liveFromDate} />
              </div>
              <div>
                <label for="live-to-{source.exchangeName}" class="mb-1 block text-xs text-text">To</label>
                <DateField id="live-to-{source.exchangeName}" max={today} bind:value={liveToDate} />
              </div>
            </div>
          </div>
          <button
            class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            disabled={liveFetching}
            onclick={() => handleFetch(source)}
          >
            {liveFetching ? 'Fetching…' : 'Fetch transactions'}
          </button>
          {#if liveRateLimitSeconds > 0}
            <div class="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p class="text-xs text-amber-800">
                Hit {source.exchangeName}'s rate limit — waiting {liveRateLimitSeconds}s before retrying…
              </p>
            </div>
          {/if}
          {#if liveFetching && liveFetchTotal > 0}
            <div class="rounded-lg border border-border bg-bg-card p-4">
              <div class="mb-2 flex items-center justify-between text-sm">
                <span class="text-text-heading">Fetching transactions…</span>
                <span class="text-text">{liveFetchProgress} / {liveFetchTotal} periods</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-border">
                <div
                  class="h-full rounded-full bg-accent transition-[width] duration-100 ease-linear"
                  style="width: {liveFetchTotal > 0 ? (liveFetchProgress / liveFetchTotal) * 100 : 0}%"
                ></div>
              </div>
            </div>
          {/if}
        {/if}

        {#if liveError}
          <div class="rounded-lg border border-red-300 bg-red-50 p-3">
            <p class="text-xs text-red-700">{liveError}</p>
          </div>
        {/if}
        {#if liveInfo}
          <div class="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p class="text-xs text-amber-800">{liveInfo}</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/each}
