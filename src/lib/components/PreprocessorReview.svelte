<script lang="ts">
  import type { Transaction, IImportPreprocessor } from '$lib/types';

  interface Props {
    rawTransactions: Transaction[];
    preprocessors: IImportPreprocessor[];
    enabledPreprocessors: Set<string>;
    fileName: string;
    onConfirm: (selectedTxIds: Map<string, Set<string>>) => void;
    onBack: () => void;
  }

  const { rawTransactions, preprocessors, enabledPreprocessors, fileName, onConfirm, onBack }: Props = $props();

  // Tracks only user deviations from the default (all eligible selected).
  // A missing entry means "use default"; a present entry means "user has customised this".
  let overrides = $state<Map<string, Set<string>>>(new Map());

  const eligibleTransactions = (preprocessor: IImportPreprocessor): Transaction[] =>
    rawTransactions.filter((tx) => preprocessor.isEligible(tx));

  // Merges defaults with overrides. Automatically stays in sync when enabledPreprocessors
  // changes — no effects needed.
  const selectedTxIds = $derived.by(() => {
    const result = new Map<string, Set<string>>();
    for (const p of preprocessors) {
      if (!enabledPreprocessors.has(p.id)) continue;
      const override = overrides.get(p.id);
      if (override !== undefined) {
        result.set(p.id, override);
      } else {
        const eligible = rawTransactions.filter((tx) => p.isEligible(tx)).map((tx) => tx.id);
        result.set(p.id, new Set(eligible));
      }
    }
    return result;
  });

  const toggleTx = (preprocessorId: string, txId: string) => {
    const current = selectedTxIds.get(preprocessorId);
    if (!current) return;
    const next = new Set(current);
    next.has(txId) ? next.delete(txId) : next.add(txId);
    overrides = new Map(overrides).set(preprocessorId, next);
  };

  const selectAll = (preprocessorId: string, eligible: Transaction[]) => {
    overrides = new Map(overrides).set(preprocessorId, new Set(eligible.map((tx) => tx.id)));
  };

  const deselectAll = (preprocessorId: string) => {
    overrides = new Map(overrides).set(preprocessorId, new Set());
  };

  const formatTxSummary = (tx: Transaction): string => {
    const asset = tx.toAsset ?? tx.fromAsset ?? tx.feeAsset ?? '?';
    const amount = tx.toAmount ?? tx.fromAmount ?? tx.feeAmount;
    const amountStr = amount ? amount.toFixed(6).replace(/\.?0+$/, '') : '?';
    return `${amountStr} ${asset}`;
  };
</script>

<div class="mx-auto max-w-2xl">
  <div class="mb-4 rounded-lg border border-border bg-bg-card p-4">
    <p class="text-sm text-text-heading">
      Parsed <span class="font-medium">{rawTransactions.length}</span> transactions from
      <span class="font-medium">{fileName}</span>
    </p>
  </div>

  {#each preprocessors.filter((p) => enabledPreprocessors.has(p.id)) as preprocessor}
    {@const eligible = eligibleTransactions(preprocessor)}
    {@const selected = selectedTxIds.get(preprocessor.id) ?? new Set()}
    {#if eligible.length > 0}
      <div class="mb-6 rounded-lg border border-border bg-bg-card p-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-text-heading">{preprocessor.label}</p>
            <p class="text-xs text-text">
              {selected.size} of {eligible.length} eligible transactions selected
            </p>
          </div>
          <div class="flex gap-2">
            <button
              class="rounded px-2 py-1 text-xs text-accent hover:bg-accent/10"
              onclick={() => selectAll(preprocessor.id, eligible)}
            >
              Select all
            </button>
            <button
              class="rounded px-2 py-1 text-xs text-accent hover:bg-accent/10"
              onclick={() => deselectAll(preprocessor.id)}
            >
              Deselect all
            </button>
          </div>
        </div>

        <div class="max-h-64 space-y-1 overflow-y-auto">
          {#each eligible as tx}
            <label class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-bg-card/80">
              <input
                type="checkbox"
                checked={selected.has(tx.id)}
                onchange={() => toggleTx(preprocessor.id, tx.id)}
                class="accent-accent"
              />
              <div class="flex flex-1 items-center justify-between text-xs">
                <span class="font-medium text-text-heading">{formatTxSummary(tx)}</span>
                <span class="text-text">{tx.date.toISOString().slice(0, 10)}</span>
              </div>
              {#if tx.fiatCurrency && tx.fiatValue?.gt(0)}
                <span class="text-xs text-text">
                  {tx.fiatValue.toFixed(2)} {tx.fiatCurrency}
                </span>
              {/if}
            </label>
          {/each}
        </div>
      </div>
    {/if}
  {/each}

  <div class="flex justify-end gap-3">
    <button
      class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-heading transition-colors hover:bg-bg-card"
      onclick={onBack}
    >
      Back
    </button>
    <button
      class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90"
      onclick={() => onConfirm(selectedTxIds)}
    >
      Confirm import
    </button>
  </div>
</div>
