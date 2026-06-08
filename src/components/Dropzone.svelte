<script lang="ts">
  interface Props {
    onfiles: (files: File[]) => void;
    multiple?: boolean;
    busy?: boolean;
    accent?: 'accent' | 'redact';
  }
  let { onfiles, multiple = true, busy = false, accent = 'accent' }: Props = $props();

  let dragging = $state(false);
  let input: HTMLInputElement;

  function pick(list: FileList | null) {
    if (!list) return;
    const pdfs = Array.from(list).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (pdfs.length) onfiles(multiple ? pdfs : pdfs.slice(0, 1));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    pick(e.dataTransfer?.files ?? null);
  }
</script>

<button
  type="button"
  class="group relative block w-full overflow-hidden rounded-xl border border-dashed bg-surface px-6 py-16 text-center transition-colors
    {dragging ? (accent === 'redact' ? 'border-redact bg-redact/5' : 'border-accent bg-accent/5') : 'border-border-bright hover:border-faint'}"
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
  onclick={() => input.click()}
  disabled={busy}
>
  <input
    bind:this={input}
    type="file"
    accept="application/pdf,.pdf"
    {multiple}
    class="hidden"
    onchange={(e) => pick((e.currentTarget as HTMLInputElement).files)}
  />
  <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface-2 font-mono text-lg
    {accent === 'redact' ? 'text-redact' : 'text-accent'}">▮</div>
  <p class="mt-5 font-mono text-sm font-semibold text-fg">
    {dragging ? 'Drop to load' : `Drop PDF${multiple ? '(s)' : ''} here`}
  </p>
  <p class="mt-1.5 text-sm text-muted">
    or <span class="{accent === 'redact' ? 'text-redact' : 'text-accent'}">browse your files</span>
    · processed locally, never uploaded
  </p>
</button>
