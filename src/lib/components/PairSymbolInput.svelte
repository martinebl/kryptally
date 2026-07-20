<script lang="ts">
  import type { ILiveSource, SourceState } from '$lib/types';
  import { suggestSymbols } from '$lib/sources';

  interface Props {
    source: ILiveSource;
    state: SourceState;
    onPairsChange?: (symbols: string[], autoDetectedSymbols: string[]) => void;
  }

  let { source, state: st, onPairsChange }: Props = $props();

  // Manually-added tickers are never added to autoDetectedSymbols, so they render
  // without the auto-detected dot (see removePair for the reverse case).
  const addPair = (raw: string) => {
    const ticker = raw.trim().toUpperCase();
    if (!ticker) return;
    if (!st.symbols.includes(ticker)) st.symbols = [...st.symbols, ticker];
    st.symbolInput = '';
    onPairsChange?.(st.symbols, st.autoDetectedSymbols);
  };

  const removePair = (ticker: string) => {
    st.symbols = st.symbols.filter((s) => s !== ticker);
    st.autoDetectedSymbols = st.autoDetectedSymbols.filter((s) => s !== ticker);
    onPairsChange?.(st.symbols, st.autoDetectedSymbols);
  };

  // Suggestion dropdown for the pair input. Dismissed on Escape or once a
  // pair is committed; re-armed as soon as the user types again.
  let highlightedIndex = $state(-1);
  let suggestionsDismissed = $state(false);
  const suggestions = $derived(
    suggestionsDismissed ? [] : suggestSymbols(st.availableSymbols, st.symbolInput, st.symbols),
  );

  const onSymbolInputInput = () => {
    suggestionsDismissed = false;
    highlightedIndex = -1;
  };

  const selectSuggestion = (ticker: string) => {
    addPair(ticker);
    suggestionsDismissed = true;
  };

  const onSymbolInputKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % suggestions.length;
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      // -1 means "nothing highlighted yet"; wrap straight to the last item
      // rather than falling through to the general decrement (which would
      // land one item short of the end).
      highlightedIndex =
        highlightedIndex === -1
          ? suggestions.length - 1
          : (highlightedIndex - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        selectSuggestion(suggestions[highlightedIndex]);
      } else {
        addPair(st.symbolInput);
      }
    } else if (e.key === 'Escape' && suggestions.length > 0) {
      suggestionsDismissed = true;
    } else if (e.key === 'Backspace' && !st.symbolInput && st.symbols.length > 0) {
      removePair(st.symbols[st.symbols.length - 1]);
    }
  };

  const onSymbolInputBlur = () => {
    if (st.symbolInput.trim()) addPair(st.symbolInput);
  };
</script>

<div class="relative">
  <div
    class="flex min-h-chip-input flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface p-1.5 focus-within:border-accent"
  >
    {#each st.symbols as ticker (ticker)}
      <span class="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-card py-1 pl-2.5 pr-1.5 text-xs">
        {#if st.autoDetectedSymbols.includes(ticker)}
          <span class="size-1.5 shrink-0 rounded-full bg-accent"></span>
        {/if}
        <span class="font-mono font-medium text-text-heading">{ticker}</span>
        <button
          type="button"
          onclick={() => removePair(ticker)}
          class="leading-none text-text hover:text-danger"
          aria-label="Remove {ticker}"
        >✕</button>
      </span>
    {/each}
    <input
      id="live-symbols-{source.exchangeName}"
      type="text"
      bind:value={st.symbolInput}
      oninput={onSymbolInputInput}
      onkeydown={onSymbolInputKeydown}
      onblur={onSymbolInputBlur}
      placeholder={source.symbolPlaceholder ?? ''}
      class="min-w-24 flex-1 border-none bg-transparent px-1 py-1 font-mono text-sm text-text-heading outline-none"
    />
  </div>
  {#if suggestions.length > 0}
    <ul
      role="listbox"
      class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
    >
      {#each suggestions as ticker, i (ticker)}
        <li role="option" aria-selected={i === highlightedIndex}>
          <button
            type="button"
            onmousedown={(e) => e.preventDefault()}
            onclick={() => selectSuggestion(ticker)}
            class="block w-full px-3 py-1.5 text-left font-mono text-sm text-text-heading hover:bg-bg-card {i === highlightedIndex ? 'bg-bg-card' : ''}"
          >
            {ticker}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
