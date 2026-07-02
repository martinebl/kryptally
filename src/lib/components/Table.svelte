<script lang="ts" generics="T">
    import type { Snippet } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';

    interface Props {
        rows: T[];
        filterFn?: (row: T, query: string) => boolean;
        headers: Snippet;
        row: Snippet<[T]>;
        expandedRow?: Snippet<[T]>;
        canExpand?: (row: T) => boolean;
        title?: string;
        subtitle?: string;
    }

    let { rows, filterFn, headers, row, expandedRow, canExpand, title, subtitle }: Props = $props();
    let query = $state('');
    let expanded = new SvelteSet<T>();

    const visibleRows = $derived(
        query && filterFn
            ? rows.filter(r => filterFn(r, query.toLowerCase()))
            : rows
    );

    function toggle(r: T) {
        if (expanded.has(r)) expanded.delete(r);
        else expanded.add(r);
    }

    function onKeydown(e: KeyboardEvent, r: T) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle(r);
        }
    }
</script>

{#if title || filterFn}
<div class="mb-4 flex items-end {title ? 'justify-between' : 'justify-end'} gap-4">
    {#if title}
        <div>
            <h3 class="font-heading text-xl font-semibold tracking-tight text-text-heading">{title}</h3>
            {#if subtitle}
                <p class="mt-0.5 text-meta text-text/80">{subtitle}</p>
            {/if}
        </div>
    {/if}
    {#if filterFn}
        <input
            type="search"
            bind:value={query}
            placeholder="Search..."
            class="rounded border border-border bg-bg-card px-3 py-1 text-sm text-text-heading placeholder:text-text focus:outline-none"
        />
    {/if}
</div>
{/if}
<div class="overflow-x-auto rounded-xl border border-border">
    <table class="w-full text-left text-sm">
        <thead>
            <tr class="border-b border-border bg-bg-card text-xs uppercase tracking-wide text-text">
                {@render headers()}
                {#if expandedRow}
                    <th class="w-8 px-2 py-3" aria-hidden="true"></th>
                {/if}
            </tr>
        </thead>
        <tbody>
            {#each visibleRows as r}
            {@const expandable = !!expandedRow && (!canExpand || canExpand(r))}
            <tr
                class="border-b border-border last:border-none {expandable ? 'cursor-pointer hover:bg-bg-card/70' : 'hover:bg-bg-card/50'}"
                tabindex={expandable ? 0 : undefined}
                aria-expanded={expandable ? expanded.has(r) : undefined}
                onclick={expandable ? () => toggle(r) : undefined}
                onkeydown={expandable ? (e: KeyboardEvent) => onKeydown(e, r) : undefined}
            >
                {@render row(r)}
                {#if expandedRow}
                    <td class="px-2 py-3 text-text/60" aria-hidden="true">
                        {#if expandable}
                            <svg class="size-4 transition-transform {expanded.has(r) ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                        {/if}
                    </td>
                {/if}
            </tr>
            {#if expandable && expanded.has(r)}
                <tr class="border-b border-border">
                    {@render expandedRow(r)}
                </tr>
            {/if}
            {/each}
        </tbody>
    </table>
</div>
