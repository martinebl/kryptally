<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'solid' | 'outlined';
  type Color = 'default' | 'success' | 'danger' | 'accent' | 'purple' | 'blue' | 'amber';

  interface Props {
    variant?: Variant;
    color?: Color;
    dot?: boolean;
    children: Snippet;
  }

  let { variant = 'solid', color = 'default', dot = false, children }: Props = $props();

  const solidBg: Record<Color, string> = {
    default: 'bg-badge-default-bg text-badge-default',
    success: 'bg-badge-success-bg text-badge-success',
    danger:  'bg-badge-danger-bg text-badge-danger',
    accent:  'bg-accent text-on-accent',
    purple:  'bg-badge-purple-bg text-badge-purple',
    blue:    'bg-badge-blue-bg text-badge-blue',
    amber:   'bg-badge-amber-bg text-badge-amber',
  };

  const outlinedBg: Record<Color, string> = {
    default: 'border border-badge-default-border bg-badge-default-bg text-badge-default',
    success: 'border border-badge-success-border bg-badge-success-bg text-badge-success',
    danger:  'border border-badge-danger-border bg-badge-danger-bg text-badge-danger',
    accent:  'border border-accent-border bg-accent-bg text-accent',
    purple:  'border border-badge-purple-border bg-badge-purple-bg text-badge-purple',
    blue:    'border border-badge-blue-border bg-badge-blue-bg text-badge-blue',
    amber:   'border border-badge-amber-border bg-badge-amber-bg text-badge-amber',
  };

  const dotColor: Record<Color, string> = {
    default: 'bg-badge-default',
    success: 'bg-badge-success',
    danger:  'bg-badge-danger',
    accent:  'bg-accent',
    purple:  'bg-badge-purple',
    blue:    'bg-badge-blue',
    amber:   'bg-badge-amber',
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
