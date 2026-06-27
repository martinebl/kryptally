<script lang="ts">
  import type { ILiveSource, SourceState } from '$lib/types';
  import DateField from '$lib/components/DateField.svelte';
  import Badge from '$lib/components/Badge.svelte';

  interface Props {
    source: ILiveSource;
    state: SourceState;
    connected: boolean;
    today: string;
    formatLastFetch: (date: Date | null) => string;
    onToggleOpen: (source: ILiveSource) => void;
    onDiscoverSymbols: (source: ILiveSource) => void;
    onSaveCredentials: (source: ILiveSource) => void;
    onDisconnect: (source: ILiveSource) => void;
    onFetch: (source: ILiveSource) => void;
    onNavigate: (page: string) => void;
    /**
     * Optional close affordance for the pending-add form. When provided and the
     * card is not yet connected, the header's Connect toggle is replaced by an
     * ✕ button that calls this. Connected cards omit it and use the Manage
     * toggle as usual.
     */
    onCancel?: () => void;
  }

  let {
    source,
    state: st,
    connected,
    today,
    formatLastFetch,
    onToggleOpen,
    onDiscoverSymbols,
    onSaveCredentials,
    onDisconnect,
    onFetch,
    onNavigate,
    onCancel,
  }: Props = $props();
</script>

<div class="overflow-hidden rounded-xl border bg-white transition-colors border-border">
  <div class="flex items-center justify-between gap-4 px-5 py-4">
    <div>
      <div class="flex items-center gap-2.5">
        <span class="text-base font-bold text-text-heading">{source.exchangeName}</span>
        {#if connected}
          <Badge variant="outlined" color="success" dot>Connected</Badge>
        {:else}
          <Badge variant="outlined" color="default" dot>Not connected</Badge>
        {/if}
      </div>
      <p class="mt-1 text-sm text-text">
        {#if connected}
          <span class="mr-1.5 text-text/60">🔒</span>Credentials in keychain · {formatLastFetch(st.lastFetch)}
        {:else}
          Add your API keys to pull trades with a single click.
        {/if}
      </p>
    </div>

    {#if onCancel && !connected}
      <button
        class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-card text-sm text-text transition-colors hover:text-text-heading"
        onclick={onCancel}
        aria-label="Cancel"
      >✕</button>
    {:else}
      <button
        class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-text-heading transition-colors hover:bg-bg-card"
        onclick={() => onToggleOpen(source)}
      >
        {#if connected}
          {st.open ? 'Close' : 'Manage'}
          <span class="text-xs text-text transition-transform duration-200" class:rotate-180={st.open}>▼</span>
        {:else}
          Connect
        {/if}
      </button>
    {/if}
  </div>

  {#if st.open}
    <div class="border-t border-border bg-bg-card/50 px-5 py-5">

      {#if !connected}
        <div class="space-y-3">
          <div>
            <label for="live-key-{source.exchangeName}" class="mb-1 block text-xs font-semibold text-text-heading">
              {source.keyLabel ?? 'API key'}
            </label>
            <input
              id="live-key-{source.exchangeName}"
              type="password"
              bind:value={st.credsKey}
              class="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-heading focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label for="live-secret-{source.exchangeName}" class="mb-1 block text-xs font-semibold text-text-heading">
              {source.secretLabel ?? 'API secret'}
            </label>
            <textarea
              id="live-secret-{source.exchangeName}"
              rows="3"
              bind:value={st.credsSecret}
              class="w-full rounded-lg border border-border bg-white px-3 py-2.5 font-mono text-xs text-text-heading focus:border-accent focus:outline-none"
            ></textarea>
          </div>
          <button
            class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!st.credsKey || !st.credsSecret}
            onclick={() => onSaveCredentials(source)}
          >
            Save credentials
          </button>
        </div>

      {:else}
        {#if source.whatFetches}
          <div class="mb-4">
            <p class="mb-2.5 text-xs font-semibold uppercase tracking-widest text-text/70">What this fetches</p>
            <div class="space-y-2">
              {#each source.whatFetches as item}
                <div class="flex gap-2.5 text-sm leading-relaxed">
                  <span class={item.included ? 'text-green-600' : 'text-border'}>{item.included ? '✓' : '✕'}</span>
                  <span class={item.included ? 'text-text-heading' : 'text-text'}>{item.label}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if source.requiresSymbols ?? true}
          <div class="mb-4">
            <div class="mb-1 flex items-center justify-between">
              <label for="live-symbols-{source.exchangeName}" class="text-sm font-semibold text-text-heading">
                Pair symbols
              </label>
              {#if source.discoverSymbols}
                <button
                  type="button"
                  class="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                  disabled={st.discovering}
                  onclick={() => onDiscoverSymbols(source)}
                >
                  {st.discovering ? 'Detecting…' : 'Re-detect pairs'}
                </button>
              {/if}
            </div>
            <input
              id="live-symbols-{source.exchangeName}"
              type="text"
              placeholder={source.symbolPlaceholder ?? ''}
              bind:value={st.symbols}
              class="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-heading focus:border-accent focus:outline-none"
            />
          </div>
        {/if}

        <div class="mb-4">
          <div class="mb-2 flex items-baseline justify-between">
            <p class="text-sm font-semibold text-text-heading">
              Date range{#if source.requiresDateRange}
                <span class="ml-0.5 text-amber-500">*</span>
              {:else}
                <span class="ml-1 text-xs font-normal text-text">(optional)</span>
              {/if}
            </p>
            {#if st.fromDate || st.toDate}
              <button
                type="button"
                class="text-xs font-medium text-text hover:text-text-heading"
                onclick={() => { st.fromDate = ''; st.toDate = ''; }}
              >
                Clear dates
              </button>
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="live-from-{source.exchangeName}" class="mb-1 block text-xs text-text">From</label>
              <DateField
                id="live-from-{source.exchangeName}"
                max={today}
                bind:value={st.fromDate}
              />
            </div>
            <div>
              <label for="live-to-{source.exchangeName}" class="mb-1 block text-xs text-text">To</label>
              <DateField
                id="live-to-{source.exchangeName}"
                max={today}
                bind:value={st.toDate}
              />
            </div>
          </div>
          {#if source.requiresDateRange}
            <p class="mt-2 text-xs {!st.fromDate || !st.toDate ? 'text-amber-600' : 'text-text'}">
              {!st.fromDate || !st.toDate
                ? 'Both From and To are required by the Revolut API.'
                : 'Both dates are required by the Revolut API.'}
            </p>
          {/if}
        </div>

        <div class="border-t border-border pt-4">
          {#if st.phase === 'idle'}
            {@const datesOk = !source.requiresDateRange || (!!st.fromDate && !!st.toDate)}
            {@const symbolsOk = !(source.requiresSymbols ?? true) || st.symbols.trim().length > 0}
            <div class="flex items-center gap-3.5">
              <button
                class="shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors
                  {datesOk && symbolsOk ? 'bg-accent hover:bg-accent/90 cursor-pointer' : 'bg-border cursor-not-allowed'}"
                disabled={!datesOk || !symbolsOk}
                onclick={() => onFetch(source)}
              >
                Fetch transactions
              </button>
              <p class="text-xs leading-relaxed text-text">
                New transactions merge with your stored history — duplicates are skipped.
              </p>
            </div>

          {:else if st.phase === 'fetching'}
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium text-text-heading">Fetching from {source.exchangeName}…</span>
              {#if st.progTotal > 0}
                <span class="font-mono text-text">{st.progDone} / {st.progTotal}</span>
              {/if}
            </div>
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-border">
              <div
                class="h-full rounded-full bg-accent transition-[width] duration-100 ease-linear"
                style="width: {st.progTotal > 0 ? (st.progDone / st.progTotal) * 100 : 0}%"
              ></div>
            </div>
            {#if st.rateLimitSeconds > 0}
              <p class="mt-2 text-xs text-amber-600">
                Rate limited — waiting {st.rateLimitSeconds}s before retrying…
              </p>
            {/if}

          {:else}
            <div class="flex items-start justify-between gap-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3.5">
              <div class="flex gap-2.5">
                <span class="mt-px text-green-600">✓</span>
                <div>
                  <p class="text-sm font-semibold text-green-700">
                    Fetched {st.fetchedTotal} transactions from {source.exchangeName}
                  </p>
                  <p class="mt-0.5 text-sm text-green-600">
                    {st.newCount} new · {st.dupCount} duplicate{st.dupCount === 1 ? '' : 's'} skipped
                  </p>
                </div>
              </div>
              <button
                class="shrink-0 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50"
                onclick={() => onNavigate('results')}
              >
                View results →
              </button>
            </div>
            <button
              type="button"
              class="mt-3 text-xs text-text hover:text-text-heading"
              onclick={() => { st.phase = 'idle'; }}
            >
              Fetch again
            </button>
          {/if}
        </div>

        {#if st.info}
          <div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p class="text-xs text-amber-700">{st.info}</p>
          </div>
        {/if}

        <div class="mt-4 border-t border-border pt-4">
          <button
            type="button"
            class="text-xs font-medium text-text/60 hover:text-red-600 transition-colors"
            onclick={() => onDisconnect(source)}
          >
            Forget API key &amp; disconnect
          </button>
        </div>
      {/if}

      {#if st.error}
        <div class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p class="text-xs text-red-700">{st.error}</p>
        </div>
      {/if}
    </div>
  {/if}
</div>
