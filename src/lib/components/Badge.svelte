<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'solid' | 'outlined';
  type Color = 'default' | 'success' | 'warning' | 'danger' | 'accent' | 'purple' | 'blue' | 'amber';

  interface Props {
    variant?: Variant;
    color?: Color;
    dot?: boolean;
    children: Snippet;
  }

  let { variant = 'solid', color = 'default', dot = false, children }: Props = $props();

  const solidBg: Record<Color, string> = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger:  'bg-red-100 text-red-700',
    accent:  'bg-accent text-white',
    purple:  'bg-purple-100 text-purple-700',
    blue:    'bg-blue-100 text-blue-700',
    amber:   'bg-amber-100 text-amber-700',
  };

  const outlinedBg: Record<Color, string> = {
    default: 'border border-border bg-bg-card text-text',
    success: 'border border-green-200 bg-green-50 text-green-700',
    warning: 'border border-amber-200 bg-amber-50 text-amber-700',
    danger:  'border border-red-200 bg-red-50 text-red-700',
    accent:  'border border-accent-border bg-accent-bg text-accent',
    purple:  'border border-purple-200 bg-purple-50 text-purple-700',
    blue:    'border border-blue-200 bg-blue-50 text-blue-700',
    amber:   'border border-amber-300 bg-amber-50 text-amber-700',
  };

  const dotColor: Record<Color, string> = {
    default: 'bg-border',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    danger:  'bg-red-500',
    accent:  'bg-accent',
    purple:  'bg-purple-500',
    blue:    'bg-blue-500',
    amber:   'bg-amber-500',
  };

  const styleClass = $derived(
    variant === 'solid' ? solidBg[color] : outlinedBg[color]
  );

  const sizeClass = $derived(
    variant === 'solid' ? 'px-2 py-0.5' : 'px-2.5 py-0.5'
  );
</script>

<span class="inline-flex items-center gap-1.5 rounded-full text-xs font-medium whitespace-nowrap {sizeClass} {styleClass}">
  {#if dot}
    <span class="size-1.5 rounded-full {dotColor[color]}"></span>
  {/if}
  {@render children()}
</span>
