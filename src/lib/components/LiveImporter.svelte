<script lang="ts">
  import { onMount } from 'svelte';
  import type { ILiveSource, SourceState, Transaction } from '$lib/types';
  import LiveSourceCard from '$lib/components/LiveSourceCard.svelte';

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

  // The exchange name the user just picked from the "Add exchange" dropdown,
  // for which the credential form is currently shown inline (not yet connected).
  let pendingAdd = $state<string | null>(null);
  // Currently selected option in the "Add exchange" <select>.
  let selectedToAdd = $state<string>('');

  // Sources whose credentials are already on file — rendered as connected cards.
  const connectedSources = $derived(
    liveSources.filter((s) => states[s.exchangeName].hasCreds === true)
  );
  // Sources not yet connected and available in this runtime — offered in the
  // "Add exchange" dropdown. Excludes the one currently being added so it
  // doesn't show up as an option mid-add.
  const addableSources = $derived(
    liveSources.filter(
      (s) => s.isAvailable() && states[s.exchangeName].hasCreds !== true && s.exchangeName !== pendingAdd
    )
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

  onMount(() => {
    liveSources.forEach(async (s) => {
      if (s.isAvailable() && states[s.exchangeName].hasCreds === undefined) {
        states[s.exchangeName].hasCreds = await s.hasCredentials();
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
      st.open = true;
      st.credsKey = '';
      st.credsSecret = '';
      st.error = '';
      pendingAdd = null;
      selectedToAdd = '';
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
      st.open = false;
      st.phase = 'idle';
      st.error = '';
      st.credsKey = '';
      st.credsSecret = '';
      st.symbols = '';
      st.newCount = 0;
      st.dupCount = 0;
      st.fetchedTotal = 0;
      st.info = '';
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
    }
  };

  const onAdd = () => {
    if (!selectedToAdd) return;
    if (!liveSources.some((s) => s.exchangeName === selectedToAdd)) return;
    // Defensive guard: the onMount keychain probe may resolve between the user
    // picking an exchange and clicking Add, flipping hasCreds to true. In that
    // case the source is already connected and shouldn't enter the add flow.
    if (states[selectedToAdd].hasCreds === true) {
      selectedToAdd = '';
      return;
    }
    pendingAdd = selectedToAdd;
    states[selectedToAdd].open = true;
    states[selectedToAdd].error = '';
    selectedToAdd = '';
  };

  const cancelAdd = () => {
    if (!pendingAdd) return;
    const st = states[pendingAdd];
    st.open = false;
    st.credsKey = '';
    st.credsSecret = '';
    st.error = '';
    pendingAdd = null;
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

<div class="flex flex-col gap-5">
  <p class="flex items-start gap-2.5 text-sm leading-relaxed text-text">
    <span class="mt-px shrink-0 text-text">⌗</span>
    <span>
      Pull transactions straight from the exchange API instead of uploading a CSV. API keys are encrypted in your operating
      system's <strong class="font-semibold text-text-heading">keychain</strong> — never written directly to disk or transmitted.
    </span>
  </p>

  {#if connectedSources.length === 0 && !pendingAdd}
    <div class="rounded-xl border border-dashed border-border bg-bg-card px-7 py-8 text-center">
      <p class="text-sm font-semibold text-text-heading">No exchanges connected yet</p>
      <p class="mt-1.5 text-sm text-text">
        Add an exchange below to pull trades straight from its API.
      </p>
    </div>
  {/if}

  {#if addableSources.length > 0 && !pendingAdd}
    <div class="flex flex-wrap items-center gap-3">
      <select
        class="min-w-43 cursor-pointer appearance-none rounded-lg border border-border bg-white px-4 py-2 pr-9 text-sm text-text-heading focus:border-accent focus:outline-none"
        value={selectedToAdd}
        onchange={(e) => { selectedToAdd = (e.currentTarget as HTMLSelectElement).value; }}
      >
        <option value="" disabled>Add an exchange…</option>
        {#each addableSources as s}
          <option value={s.exchangeName}>{s.exchangeName}</option>
        {/each}
      </select>
      <button
        type="button"
        class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!selectedToAdd}
        onclick={onAdd}
      >
        Add
      </button>
    </div>
  {/if}

  {#if pendingAdd}
    {@const addSource = liveSources.find((s) => s.exchangeName === pendingAdd)}
    {#if addSource && states[addSource.exchangeName].hasCreds !== true}
      <LiveSourceCard
        source={addSource}
        state={states[addSource.exchangeName]}
        connected={false}
        {today}
        {formatLastFetch}
        {onNavigate}
        onToggleOpen={toggleOpen}
        onDiscoverSymbols={discoverSymbols}
        onSaveCredentials={handleSaveCredentials}
        onDisconnect={handleDisconnect}
        onFetch={handleFetch}
        onCancel={cancelAdd}
      />
    {/if}
  {/if}

  {#each connectedSources as source (source.exchangeName)}
    <LiveSourceCard
      {source}
      state={states[source.exchangeName]}
      connected={true}
      {today}
      {formatLastFetch}
      {onNavigate}
      onToggleOpen={toggleOpen}
      onDiscoverSymbols={discoverSymbols}
      onSaveCredentials={handleSaveCredentials}
      onDisconnect={handleDisconnect}
      onFetch={handleFetch}
    />
  {/each}
</div>
