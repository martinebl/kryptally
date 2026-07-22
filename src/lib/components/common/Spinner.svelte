<script lang="ts">
  interface Props {
    size?: 'sm' | 'md';
    class?: string;
  }

  const { size = 'md', class: className = '' }: Props = $props();
</script>

<svg class="inline animate-spin {size === 'sm' ? 'size-3' : 'size-4'} {className}" fill="none" viewBox="0 0 24 24">
  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
</svg>
