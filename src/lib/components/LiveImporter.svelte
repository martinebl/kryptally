<script lang="ts">
  import type { ILiveSource, Transaction } from '$lib/types';
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

  type SourceState = {
    open: boolean;
    hasCreds: boolean | undefined;
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

  $effect(() => {
    liveSources.forEach(async (s) => {
      if (s.isAvailable() && states[s.exchangeName].hasCreds === undefined) {
        const has = await s.hasCredentials();
        states[s.exchangeName].hasCreds = has;
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
    <LiveSourceCard
      {source}
      state={states[source.exchangeName]}
      available={source.isAvailable()}
      connected={states[source.exchangeName].hasCreds === true}
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
