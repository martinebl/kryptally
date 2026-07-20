<script lang="ts">
  import type { ILiveSource } from '$lib/types';

  interface Props {
    addableSources: ILiveSource[];
    onAdd: (exchangeName: string) => void;
  }

  const { addableSources, onAdd }: Props = $props();

  let selectedToAdd = $state('');

  const handleAdd = () => {
    if (!selectedToAdd) return;
    onAdd(selectedToAdd);
    selectedToAdd = '';
  };
</script>

{#if addableSources.length > 0}
  <div class="flex flex-wrap items-center gap-3">
    <select
      class="min-w-43 cursor-pointer appearance-none rounded-lg border border-border bg-surface px-4 py-2 pr-9 text-sm text-text-heading focus:border-accent focus:outline-none"
      bind:value={selectedToAdd}
    >
      <option value="" disabled>Add an exchange…</option>
      {#each addableSources as s}
        <option value={s.exchangeName}>{s.exchangeName}</option>
      {/each}
    </select>
    <button
      type="button"
      class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!selectedToAdd}
      onclick={handleAdd}
    >
      Add
    </button>
  </div>
{/if}
