<script lang="ts">
  import type { ILiveSource, Transaction } from '$lib/types';
  import DateField from '$lib/components/DateField.svelte';

  interface Props {
    liveSources: ILiveSource[];
    onConfirm: (transactions: Transaction[], sourceName: string) => Promise<{ newCount: number; dupCount: number }>;
    onNavigate: (page: string) => void;
  }

  const { liveSources, onConfirm, onNavigate }: Props = $props();

  const today = new Date().toISOString().slice(0, 10);

  const lastFetchKey = (name: string) => `kryptax-last-fetch-${name}`;

  const loadLastFetch = (name: string): Date | null => {
    try {
      const raw = localStorage.getItem(lastFetchKey(name));
      return raw ? new Date(raw) : null;
    } catch {
      return null;
    }
  };

  const saveLastFetch = (name: string, date: Date) => {
    try {
      localStorage.setItem(lastFetchKey(name), date.toISOString());
    } catch {}
  };

  const formatLastFetch = (date: Date | null): string => {
    if (!date) return 'Never fetched';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Last fetched today';
    if (diffDays === 1) return 'Last fetched yesterday';
    if (diffDays < 7) {
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });
      return `Last fetched ${day}`;
    }
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Last fetched ${dateStr}`;
  };

  // Per-source UI state, keyed by exchangeName
  type SourceState = {
    open: boolean;
    hasCreds: boolean | undefined; // undefined = not yet checked
    lastFetch: Date | null;
    credsKey: string;
    credsSecret: string;
    fromDate: string;
    toDate: string;
    phase: 'idle' | 'fetching' | 'done';
    fetchedTotal: number;
    newCount: number;
    dupCount: number;
    progDone: number;
    progTotal: number;
    rateLimitSeconds: number;
    error: string;
    info: string;
    // Binance-specific
    symbols: string;
    discovering: boolean;
  };

  const defaultState = (name: string): SourceState => ({
    open: false,
    hasCreds: undefined,
    lastFetch: loadLastFetch(name),
    credsKey: '',
    credsSecret: '',
    fromDate: '',
    toDate: today,
    phase: 'idle',
    fetchedTotal: 0,
    newCount: 0,
    dupCount: 0,
    progDone: 0,
    progTotal: 0,
    rateLimitSeconds: 0,
    error: '',
    info: '',
    symbols: '',
    discovering: false,
  });

  let states = $state<Record<string, SourceState>>(
    Object.fromEntries(liveSources.map((s) => [s.exchangeName, defaultState(s.exchangeName)]))
  );

  const rateLimitTimers: Record<string, ReturnType<typeof setInterval>> = {};

  const stopRateLimit = (name: string) => {
    if (rateLimitTimers[name]) {
      clearInterval(rateLimitTimers[name]);
      delete rateLimitTimers[name];
    }
    states[name].rateLimitSeconds = 0;
  };

  const startRateLimit = (name: string, waitMs: number) => {
    stopRateLimit(name);
    states[name].rateLimitSeconds = Math.max(1, Math.ceil(waitMs / 1000));
    rateLimitTimers[name] = setInterval(() => {
      states[name].rateLimitSeconds -= 1;
      if (states[name].rateLimitSeconds <= 0) stopRateLimit(name);
    }, 1000);
  };

  // Check credentials on mount for available sources
  $effect(() => {
    liveSources.forEach(async (s) => {
      if (s.isAvailable() && states[s.exchangeName].hasCreds === undefined) {
        const has = await s.hasCredentials();
        states[s.exchangeName].hasCreds = has;
        // Auto-expand connected sources that have never been opened
        if (has && !states[s.exchangeName].open) {
          states[s.exchangeName].open = true;
          if (s.discoverSymbols) discoverSymbols(s);
        }
      }
    });
  });

  const toggleOpen = (source: ILiveSource) => {
    const st = states[source.exchangeName];
    st.open = !st.open;
    st.error = '';
    if (st.open && st.hasCreds && source.discoverSymbols && !st.symbols) {
      discoverSymbols(source);
    }
  };

  const discoverSymbols = async (source: ILiveSource) => {
    if (!source.discoverSymbols) return;
    const st = states[source.exchangeName];
    st.discovering = true;
    st.error = '';
    try {
      st.symbols = (await source.discoverSymbols()).join(', ');
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
    } finally {
      st.discovering = false;
    }
  };

  const handleSaveCredentials = async (source: ILiveSource) => {
    const st = states[source.exchangeName];
    try {
      await source.saveCredentials(st.credsKey.trim(), st.credsSecret.trim());
      st.hasCreds = true;
      st.credsKey = '';
      st.credsSecret = '';
      st.error = '';
      if (source.discoverSymbols) discoverSymbols(source);
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
    }
  };

  const handleDisconnect = async (source: ILiveSource) => {
    if (!confirm(`Forget the saved ${source.exchangeName} API key? You'll need to re-enter it to import again.`)) return;
    const st = states[source.exchangeName];
    try {
      await source.clearCredentials();
      st.hasCreds = false;
      st.phase = 'idle';
      st.error = '';
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
    }
  };

  const handleFetch = async (source: ILiveSource) => {
    const st = states[source.exchangeName];
    const name = source.exchangeName;

    st.phase = 'fetching';
    st.error = '';
    st.info = '';
    st.progDone = 0;
    st.progTotal = 0;

    try {
      const symbols = st.symbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);

      if ((source.requiresSymbols ?? true) && symbols.length === 0) {
        st.phase = 'idle';
        st.error = 'No pair symbols to fetch. Enter at least one pair or use Re-detect pairs.';
        return;
      }
      if (source.requiresDateRange && (!st.fromDate || !st.toDate)) {
        st.phase = 'idle';
        st.error = `Select a start and end date — ${name} only serves bounded ranges.`;
        return;
      }

      const toDate = st.toDate > today ? today : st.toDate;
      const fetched = await source.fetch({
        symbols,
        from: st.fromDate ? new Date(st.fromDate) : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59Z`) : undefined,
        onProgress: ({ completed, total }) => {
          st.progDone = completed;
          st.progTotal = total;
        },
        onRateLimit: ({ waitMs }) => startRateLimit(name, waitMs),
      });

      stopRateLimit(name);

      if (fetched.length === 0) {
        st.phase = 'idle';
        st.info = (source.requiresSymbols ?? true)
          ? `No transactions found for: ${symbols.join(', ')}. Check the pair symbols and date range.`
          : `No ${name} exchange activity found in the selected date range.`;
        return;
      }

      const counts = await onConfirm(fetched, name);
      const fetchedAt = new Date();
      saveLastFetch(name, fetchedAt);
      st.lastFetch = fetchedAt;
      st.fetchedTotal = fetched.length;
      st.newCount = counts.newCount;
      st.dupCount = counts.dupCount;
      st.phase = 'done';
    } catch (e) {
      stopRateLimit(name);
      st.phase = 'idle';
      st.error = e instanceof Error ? e.message : String(e);
    }
  };
</script>

<p class="mb-5 flex items-start gap-2.5 text-sm leading-relaxed text-text">
  <span class="mt-px shrink-0 text-text">⌗</span>
  <span>
    Pull transactions straight from the exchange API instead of uploading a CSV. API keys are encrypted in your operating
    system's <strong class="font-semibold text-text-heading">keychain</strong> — never written to disk or transmitted.
  </span>
</p>

<div class="flex flex-col gap-3">
  {#each liveSources as source}
    {@const available = source.isAvailable()}
    {@const st = states[source.exchangeName]}
    {@const connected = st.hasCreds === true}

    <div
      class="overflow-hidden rounded-xl border bg-white transition-colors
        {st.open && connected ? 'border-border' : 'border-border'}"
    >
      <!-- Card header -->
      <div class="flex items-center justify-between gap-4 px-5 py-4">
        <div>
          <div class="flex items-center gap-2.5">
            <span class="text-base font-bold text-text-heading">{source.exchangeName}</span>
            {#if !available}
              <span class="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-card px-2.5 py-0.5 text-xs font-semibold text-text">
                <span class="inline-block size-1.5 rounded-full bg-border"></span>
                Desktop only
              </span>
            {:else if connected}
              <span class="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                <span class="inline-block size-1.5 rounded-full bg-green-500"></span>
                Connected
              </span>
            {:else}
              <span class="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-card px-2.5 py-0.5 text-xs font-semibold text-text">
                <span class="inline-block size-1.5 rounded-full bg-border"></span>
                Not connected
              </span>
            {/if}
          </div>
          <p class="mt-1 text-sm text-text">
            {#if !available}
              Available in the desktop app.
            {:else if connected}
              <span class="mr-1.5 text-text/60">🔒</span>Credentials in keychain · {formatLastFetch(st.lastFetch)}
            {:else}
              Add your API keys to pull trades with a single click.
            {/if}
          </p>
        </div>

        {#if available}
          <button
            class="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-text-heading transition-colors hover:bg-bg-card"
            onclick={() => toggleOpen(source)}
          >
            {#if connected}
              {st.open ? 'Close' : 'Manage'}
              <span
                class="text-[10px] text-text transition-transform duration-200"
                class:rotate-180={st.open}
              >▼</span>
            {:else}
              Connect
            {/if}
          </button>
        {/if}
      </div>

      <!-- Expanded panel -->
      {#if available && st.open}
        <div class="border-t border-border bg-bg-card/50 px-5 py-5">

          {#if !connected}
            <!-- Credential entry form -->
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
                onclick={() => handleSaveCredentials(source)}
              >
                Save credentials
              </button>
            </div>

          {:else}
            <!-- Connected: what it fetches -->
            {#if source.whatFetches}
              <div class="mb-4">
                <p class="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-text/70">What this fetches</p>
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

            <!-- Binance: symbols input -->
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
                      onclick={() => discoverSymbols(source)}
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

            <!-- Date range -->
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

            <!-- Fetch / progress / done -->
            <div class="border-t border-border pt-4">
              {#if st.phase === 'idle'}
                {@const datesOk = !source.requiresDateRange || (!!st.fromDate && !!st.toDate)}
                {@const symbolsOk = !(source.requiresSymbols ?? true) || st.symbols.trim().length > 0}
                <div class="flex items-center gap-3.5">
                  <button
                    class="shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors
                      {datesOk && symbolsOk ? 'bg-accent hover:bg-accent/90 cursor-pointer' : 'bg-border cursor-not-allowed'}"
                    disabled={!datesOk || !symbolsOk}
                    onclick={() => handleFetch(source)}
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
                <!-- Done state -->
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
                  onclick={() => { states[source.exchangeName].phase = 'idle'; }}
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

            <!-- Disconnect -->
            <div class="mt-4 border-t border-border pt-4">
              <button
                type="button"
                class="text-xs font-medium text-text/60 hover:text-red-600 transition-colors"
                onclick={() => handleDisconnect(source)}
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
  {/each}
</div>
