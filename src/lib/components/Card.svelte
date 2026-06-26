<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<div class="rounded-xl bg-bg-card p-6 text-left">
  <h3 class="mb-2 font-heading text-card-heading font-semibold text-text-heading">{title}</h3>
  {@render children()}
</div>
