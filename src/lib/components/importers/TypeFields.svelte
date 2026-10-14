<script lang="ts">
  import type { CustomImporterConfig, RowKind, TypeRule } from '$lib/types';
  import { MATCH_MODES, ROW_KINDS } from '$lib/types';
  import { addRulesForValues } from '$lib/importers/custom';
  import { INPUT, SMALL_INPUT, LABEL, HINT, SECTION, SECTION_TITLE, SECONDARY_BUTTON, DANGER_BUTTON } from '$lib/components/importers/styles';
  import { KIND_LABELS, MATCH_LABELS } from '$lib/components/importers/labels';

  interface Props {
    draft: CustomImporterConfig;
    /** Distinct values of the type column in the loaded sample. */
    sampleValues: string[];
  }

  let { draft = $bindable(), sampleValues }: Props = $props();

  const setMode = (mode: string) => {
    draft.type = mode === 'fixed' ? { mode: 'fixed', kind: 'buy' } : { mode: 'column', rules: [] };
  };

  const updateRules = (fn: (rules: TypeRule[]) => TypeRule[]) => {
    if (draft.type.mode === 'column') draft.type.rules = fn(draft.type.rules);
  };

  const setFallback = (value: string) => {
    if (draft.type.mode === 'column') draft.type.fallback = value === '' ? undefined : (value as RowKind);
  };
</script>

<div class={SECTION}>
  <h3 class={SECTION_TITLE}>Transaction type</h3>

  <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
    <div>
      <label for="type-mode" class={LABEL}>Type comes from</label>
      <select id="type-mode" class={INPUT} value={draft.type.mode} onchange={(e) => setMode(e.currentTarget.value)}>
        <option value="column">A column, mapped by rules</option>
        <option value="fixed">Same type for every row</option>
      </select>
    </div>

    {#if draft.type.mode === 'fixed'}
      <div>
        <label for="fixed-kind" class={LABEL}>Type</label>
        <select id="fixed-kind" class={INPUT} bind:value={draft.type.kind}>
          {#each ROW_KINDS as kind (kind)}
            <option value={kind}>{KIND_LABELS[kind]}</option>
          {/each}
        </select>
      </div>
    {:else}
      <div>
        <label for="col-type" class={LABEL}>Type column</label>
        <input id="col-type" class={INPUT} list="sample-headers" bind:value={draft.columns.type} />
      </div>
    {/if}
  </div>

  {#if draft.type.mode === 'column'}
    <p class="{HINT} mb-3">Rules are checked top to bottom, case-insensitively; the first match wins.</p>

    <div class="space-y-2">
      {#each draft.type.rules as rule, i (i)}
        <div class="grid grid-cols-12 items-center gap-2">
          <select class="{SMALL_INPUT} col-span-3" aria-label="Match mode" bind:value={rule.match}>
            {#each MATCH_MODES as mode (mode)}
              <option value={mode}>{MATCH_LABELS[mode]}</option>
            {/each}
          </select>
          <input class="{SMALL_INPUT} col-span-4" aria-label="Value" placeholder="Value" bind:value={rule.value} />
          <select class="{SMALL_INPUT} col-span-4" aria-label="Becomes" bind:value={rule.kind}>
            {#each ROW_KINDS as kind (kind)}
              <option value={kind}>{KIND_LABELS[kind]}</option>
            {/each}
          </select>
          <button
            type="button"
            class="{DANGER_BUTTON} col-span-1"
            aria-label="Remove rule"
            onclick={() => updateRules((rules) => rules.filter((_, j) => j !== i))}
          >✕</button>
        </div>
      {/each}
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        class={SECONDARY_BUTTON}
        onclick={() => updateRules((rules) => [...rules, { match: 'equals', value: '', kind: 'buy' }])}
      >+ Add rule</button>
      {#if sampleValues.length > 0}
        <button type="button" class={SECONDARY_BUTTON} onclick={() => updateRules((rules) => addRulesForValues(rules, sampleValues))}>
          Add rules for values in the sample ({sampleValues.length})
        </button>
      {/if}
    </div>

    <div class="mt-4 max-w-sm">
      <label for="fallback" class={LABEL}>When no rule matches</label>
      <select id="fallback" class={INPUT} value={draft.type.fallback ?? ''} onchange={(e) => setFallback(e.currentTarget.value)}>
        <option value="">Stop with an error</option>
        {#each ROW_KINDS as kind (kind)}
          <option value={kind}>{KIND_LABELS[kind]}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>
