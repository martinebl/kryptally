<script lang="ts">
  import { DateInput } from 'date-picker-svelte';

  interface Props {
    /** Date value as an ISO `YYYY-MM-DD` string, or `''` when empty. */
    value: string;
    /** Latest selectable date as an ISO `YYYY-MM-DD` string. */
    max?: string;
    id?: string;
  }

  let { value = $bindable(''), max, id }: Props = $props();

  const toISO = (d: Date | null): string =>
    d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : '';

  const fromISO = (s: string): Date | null => {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const maxDate = $derived(max ? (fromISO(max) ?? undefined) : undefined);
</script>

<div class="date-field">
  <DateInput
    bind:value={() => fromISO(value), (d) => (value = toISO(d))}
    {id}
    max={maxDate}
    format="dd-MM-yyyy"
    placeholder="dd-mm-yyyy"
    closeOnSelection
  />
</div>

<style>
  /* Match the surrounding form inputs and theme the calendar with app tokens.
     The background must be fully opaque — the calendar popup floats over content. */
  .date-field {
    --date-input-width: 100%;
    --date-picker-background: var(--color-bg);
    --date-picker-foreground: var(--color-text-heading);
    --date-picker-highlight-border: var(--color-accent);
    --date-picker-highlight-shadow: var(--color-accent-bg);
    --date-picker-selected-background: var(--color-accent);
    --date-picker-selected-color: #ffffff;
    --date-picker-today-border: var(--color-accent-border);
  }

  .date-field :global(input) {
    border-radius: 0.5rem;
    border: 1px solid var(--color-border);
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  .date-field :global(input:focus) {
    border-color: var(--color-accent);
    outline: none;
  }
</style>
