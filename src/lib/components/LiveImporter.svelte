<script lang="ts">
  import { onMount } from 'svelte';
  import type { ILiveSource, SourceState, Transaction } from '$lib/types';
  import { createLastFetchRepository, createPairRepository, type IStorage } from '$lib/storage';
  import LiveSourceCard from '$lib/components/LiveSourceCard.svelte';
  import AddExchangeSelector from '$lib/components/AddExchangeSelector.svelte';
  import { createRateLimitTimers } from '$lib/components/rate-limit-timers';

  interface Props {
    liveSources: ILiveSource[];
    onConfirm: (transactions: Transaction[], sourceName: string) => Promise<{ newCount: number; dupCount: number }>;
    onNavigate: (page: string) => void;
    storage: IStorage;
  }

  const { liveSources, onConfirm, onNavigate, storage }: Props = $props();

  const today = new Date().toISOString().slice(0, 10);

  const lastFetchRepo = createLastFetchRepository(storage);
  const pairRepo = createPairRepository(storage);

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
    lastFetch: null,
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
    symbols: [],
    autoDetectedSymbols: [],
    symbolInput: '',
    discovering: false,
    availableSymbols: [],
    catalogLoading: false,
  });

  let states = $state<Record<string, SourceState>>(
    Object.fromEntries(liveSources.map((s) => [s.exchangeName, defaultState(s.exchangeName)]))
  );

  // The exchange name the user just picked from the "Add exchange" dropdown,
  // for which the credential form is currently shown inline (not yet connected).
  let pendingAdd = $state<string | null>(null);

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

  const rateLimitTimers = createRateLimitTimers(states);

  onMount(() => {
    liveSources.forEach(async (s) => {
      if (s.isAvailable() && states[s.exchangeName].hasCreds === undefined) {
        states[s.exchangeName].hasCreds = await s.hasCredentials();
      }
      const loaded = await lastFetchRepo.get(s.exchangeName);
      // A fetch completed while this load was in flight already set a fresher
      // value — don't clobber it with the stale one this read started with.
      if (states[s.exchangeName].lastFetch === null) {
        states[s.exchangeName].lastFetch = loaded;
      }
    });
    liveSources.forEach(async (s) => {
      const stored = await pairRepo.load(s.exchangeName);
      states[s.exchangeName].symbols = stored.symbols;
      states[s.exchangeName].autoDetectedSymbols = stored.autoDetectedSymbols;
    });
  });

  const toggleOpen = (source: ILiveSource) => {
    const st = states[source.exchangeName];
    st.open = !st.open;
    st.error = '';
    if (st.open && st.hasCreds && source.discoverSymbols && st.symbols.length === 0) {
      discoverSymbols(source);
    }
    if (st.open && st.hasCreds) {
      ensureSymbolCatalog(source);
    }
  };

  const ensureSymbolCatalog = async (source: ILiveSource) => {
    if (!source.listSymbols) return;
    const st = states[source.exchangeName];
    if (st.catalogLoading || st.availableSymbols.length > 0) return;
    st.catalogLoading = true;
    try {
      st.availableSymbols = await source.listSymbols();
    } catch {
      // Suggestions are a convenience; fail silently and leave the
      // (already working) manual pair-entry flow untouched.
    } finally {
      st.catalogLoading = false;
    }
  };

  const discoverSymbols = async (source: ILiveSource) => {
    if (!source.discoverSymbols) return;
    const st = states[source.exchangeName];
    st.discovering = true;
    st.error = '';
    try {
      const detected = await source.discoverSymbols();
      st.symbols = [...new Set([...st.symbols, ...detected])];
      st.autoDetectedSymbols = [...new Set([...st.autoDetectedSymbols, ...detected])];
      await pairRepo.save(source.exchangeName, { symbols: st.symbols, autoDetectedSymbols: st.autoDetectedSymbols });
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
    } finally {
      st.discovering = false;
    }
  };

  const handlePairsChange = (source: ILiveSource, symbols: string[], autoDetectedSymbols: string[]) =>
    pairRepo.save(source.exchangeName, { symbols, autoDetectedSymbols });

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
      if (source.discoverSymbols) discoverSymbols(source);
      ensureSymbolCatalog(source);
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
      st.symbols = [];
      st.autoDetectedSymbols = [];
      st.symbolInput = '';
      st.availableSymbols = [];
      st.catalogLoading = false;
      st.newCount = 0;
      st.dupCount = 0;
      st.fetchedTotal = 0;
      st.info = '';
      await pairRepo.clear(source.exchangeName);
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
    }
  };

  const handleAddExchange = (exchangeName: string) => {
    if (!liveSources.some((s) => s.exchangeName === exchangeName)) return;
    // Defensive guard: the onMount keychain probe may resolve between the user
    // picking an exchange and clicking Add, flipping hasCreds to true. In that
    // case the source is already connected and shouldn't enter the add flow.
    if (states[exchangeName].hasCreds === true) return;
    pendingAdd = exchangeName;
    states[exchangeName].open = true;
    states[exchangeName].error = '';
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
      const symbols = st.symbols;

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
        onRateLimit: ({ waitMs }) => rateLimitTimers.start(name, waitMs),
      });

      rateLimitTimers.stop(name);

      if (fetched.length === 0) {
        st.phase = 'idle';
        st.info = symbols.length > 0
          ? `No transactions found for: ${symbols.join(', ')}. Check the trading pairs and date range.`
          : `No ${name} exchange activity found in the selected date range.`;
        return;
      }

      const counts = await onConfirm(fetched, name);
      const fetchedAt = new Date();
      st.lastFetch = fetchedAt;
      lastFetchRepo.set(name, fetchedAt);
      st.fetchedTotal = fetched.length;
      st.newCount = counts.newCount;
      st.dupCount = counts.dupCount;
      st.phase = 'done';
    } catch (e) {
      rateLimitTimers.stop(name);
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

  {#if !pendingAdd}
    <AddExchangeSelector {addableSources} onAdd={handleAddExchange} />
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
        onPairsChange={(symbols, autoDetectedSymbols) => handlePairsChange(addSource, symbols, autoDetectedSymbols)}
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
      onPairsChange={(symbols, autoDetectedSymbols) => handlePairsChange(source, symbols, autoDetectedSymbols)}
    />
  {/each}
</div>
