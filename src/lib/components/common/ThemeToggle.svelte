<script lang="ts">
  import { getStoredMode, setTheme, type ThemeMode } from '$lib/theme';

  let mode = $state<ThemeMode>(getStoredMode());

  const select = (next: ThemeMode) => {
    mode = next;
    setTheme(next);
  };

  const segments: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
    { value: 'dark', label: 'Dark' },
  ];
</script>

<div class="flex items-center rounded-full border border-border p-0.5" role="group" aria-label="Theme">
  {#each segments as segment (segment.value)}
    <button
      type="button"
      class="flex size-6.5 cursor-pointer items-center justify-center rounded-full border-none transition-colors
        {mode === segment.value ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text-heading'}"
      aria-label={segment.label}
      aria-pressed={mode === segment.value}
      onclick={() => select(segment.value)}
    >
      {#if segment.value === 'light'}
        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="4" />
          <path
            stroke-linecap="round"
            d="M12 2.5v2M12 19.5v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2.5 12h2M19.5 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
          />
        </svg>
      {:else if segment.value === 'system'}
        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
          <path stroke-linecap="round" d="M9 19.5h6M12 16.5v3" />
        </svg>
      {:else}
        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path
            stroke-linejoin="round"
            d="M20.25 14.15A8.25 8.25 0 0 1 9.85 3.75a8.25 8.25 0 1 0 10.4 10.4Z"
          />
        </svg>
      {/if}
    </button>
  {/each}
</div>
