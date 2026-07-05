<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    children: Snippet;
    onClose?: () => void;
  }

  let { open, title, children, onClose }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  onclose={() => onClose?.()}
  class="m-auto w-full max-w-2xl rounded-xl border border-border bg-modal p-0 shadow-2xl backdrop:bg-overlay"
>
  <div class="flex items-center justify-between border-b border-border px-6 py-4">
    <h2 class="font-heading text-lg font-medium text-text-heading">{title}</h2>
  </div>
  <div class="max-h-[70vh] overflow-y-auto px-6 py-5">
    {@render children()}
  </div>
</dialog>
