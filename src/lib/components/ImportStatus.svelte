<script lang="ts">
  interface Props {
    enriching: boolean;
    enrichProgress: number;
    enrichTotal: number;
    enrichFailed: number;
    parsedCount: number;
    sourceName: string;
    newCount: number;
    dupCount: number;
    /** The green success banner is gated to CSV imports — LiveImporter has its own done state. */
    showSuccess: boolean;
    onViewResults: () => void;
    onReviewMissing: () => void;
  }

  const {
    enriching,
    enrichProgress,
    enrichTotal,
    enrichFailed,
    parsedCount,
    sourceName,
    newCount,
    dupCount,
    showSuccess,
    onViewResults,
    onReviewMissing,
  }: Props = $props();

  const pricedCount = $derived(parsedCount - enrichFailed);
  const pricedPct = $derived(parsedCount > 0 ? Math.round((pricedCount / parsedCount) * 100) : 0);
  const progressPct = $derived(enrichTotal > 0 ? (enrichProgress / enrichTotal) * 100 : 0);
</script>

<!-- Price fetch progress -->
{#if enriching}
  <div class="mt-4 rounded-lg border border-border bg-white p-4">
    <div class="mb-2 flex items-center justify-between text-sm">
      <span class="font-medium text-text-heading">Fetching market prices…</span>
      <span class="font-mono text-text">
        {enrichProgress} / {enrichTotal}
        {#if enrichFailed > 0}<span class="text-amber-600"> ({enrichFailed} failed)</span>{/if}
      </span>
    </div>
    <div class="h-2 overflow-hidden rounded-full bg-border">
      <div
        class="h-full rounded-full bg-accent transition-[width] duration-100 ease-linear"
        style="width: {progressPct}%"
      ></div>
    </div>
  </div>
{/if}

<!-- Success: all priced -->
{#if !enriching && showSuccess && parsedCount > 0 && enrichFailed === 0}
  <div class="mt-4 flex items-start justify-between gap-4 rounded-lg border border-green-300 bg-green-50 p-4">
    <div class="flex gap-2.5">
      <span class="text-green-600">✓</span>
      <div>
        <p class="text-sm font-semibold text-green-700">Parsed {parsedCount} transactions from {sourceName}</p>
        <p class="mt-0.5 text-sm text-green-600">{newCount} new · {dupCount} duplicate{dupCount === 1 ? '' : 's'} skipped</p>
      </div>
    </div>
    <button
      class="shrink-0 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50"
      onclick={onViewResults}
    >
      View results →
    </button>
  </div>
{/if}

<!-- Pricing gaps warning -->
{#if !enriching && parsedCount > 0 && enrichFailed > 0}
  <div class="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
    <div class="flex gap-3">
      <span class="mt-0.5 shrink-0 text-amber-500">⚠</span>
      <div class="flex-1">
        <p class="text-sm font-semibold text-amber-800">Parsed {parsedCount} transactions from {sourceName}</p>

        <div class="mt-2.5 flex items-center gap-3">
          <div class="h-1.5 w-28 overflow-hidden rounded-full bg-amber-200">
            <div class="h-full bg-green-600" style="width: {pricedPct}%"></div>
          </div>
          <p class="text-xs text-amber-700">
            <strong class="font-semibold text-green-700">{pricedCount} priced</strong>
            · <strong class="font-semibold text-amber-800">{enrichFailed} need prices</strong>
          </p>
        </div>

        <p class="mt-2.5 text-sm leading-relaxed text-amber-700">
          The {enrichFailed} unpriced trade{enrichFailed === 1 ? '' : 's'} count as 0 cost basis, which may inflate
          your taxable gains. This typically affects transactions older than CoinGecko's free tier or unrecognized assets.
        </p>

        <button
          class="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
          onclick={onReviewMissing}
        >
          Review the {enrichFailed} missing →
        </button>
      </div>
    </div>
  </div>
{/if}
