<script lang="ts">
  interface Props {
    onfiles: (files: File[]) => void;
    busy?: boolean;
    /** Show the redaction demo beside the drop target (home page, scrub mode). */
    demo?: boolean;
  }
  let { onfiles, busy = false, demo = false }: Props = $props();

  let dragging = $state(false);
  let input: HTMLInputElement;

  // Non-PDFs are passed on too: the parent filters them and says what it skipped.
  function pick(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length) onfiles(files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    pick(e.dataTransfer?.files ?? null);
  }

  function open() {
    if (!busy) input.click();
  }

  const sample = [
    { k: 'Author', v: 'Jane Doe', tag: ['Identifies you', 'tag tag-identity'] },
    { k: 'Company', v: 'Acme Holdings Inc.', tag: ['Identifies you', 'tag tag-identity'] },
    { k: 'Producer', v: 'Microsoft® Word 2021', tag: ['Software', 'tag tag-software'] },
    { k: 'Created', v: '2024-01-15 09:42', tag: ['Timeline', 'tag'] },
  ];
</script>

<!-- The whole area takes a drop or a click; the button is the keyboard and screen-reader control. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="group relative overflow-hidden rounded-[14px] border border-dashed transition-colors
    {dragging ? 'border-accent bg-accent/5' : 'border-border-bright bg-surface hover:border-faint'}
    {busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'}"
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
  onclick={open}
>
  <input
    bind:this={input}
    type="file"
    accept="application/pdf,.pdf"
    multiple
    class="hidden"
    onchange={(e) => pick((e.currentTarget as HTMLInputElement).files)}
  />
  <div class="grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-12 {demo ? 'md:grid-cols-[1fr_1.1fr]' : ''}">
    <div class="text-center {demo ? 'md:text-left' : ''}">
      <div class="mx-auto grid h-12 w-12 place-items-center rounded-[10px] border border-border bg-surface-2 text-accent {demo ? 'md:mx-0' : ''}" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5"/></svg>
      </div>
      <p class="mt-5 text-lg font-semibold text-fg">
        <span class="fine-only">{dragging ? 'Drop to load' : 'Drop PDFs here'}</span>
        <span class="coarse-only">Choose PDFs to check</span>
      </p>
      <p class="mt-1.5 text-sm text-muted">Read on this device. Nothing is uploaded.</p>
      <button type="button" class="btn btn-primary mt-6" disabled={busy} onclick={(e) => { e.stopPropagation(); open(); }}>
        Choose PDFs
      </button>
      <p class="mt-3 font-mono text-xs text-faint">PDF only · one or many</p>
    </div>

    {#if demo}
      <div class="hidden md:block" aria-hidden="true">
        <div class="overflow-hidden rounded-[10px] border border-border bg-bg/60 text-left shadow-2xl shadow-black/30">
          <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <span class="font-mono text-xs text-muted">resume_final.pdf</span>
            <span class="font-mono text-xs text-faint">example</span>
          </div>
          <ul class="divide-y divide-border">
            {#each sample as row, i (row.k)}
              <li class="flex items-center justify-between gap-3 px-4 py-2.5">
                <span class="flex items-center gap-2">
                  <span class="w-16 font-mono text-xs text-muted">{row.k}</span>
                  <span class={row.tag[1]}>{row.tag[0]}</span>
                </span>
                <span class="strike truncate font-mono text-xs text-fg" style={`animation-delay:${1.1 + i * 0.25}s`}>{row.v}</span>
              </li>
            {/each}
          </ul>
          <div class="flex items-center justify-between border-t border-border px-4 py-2.5 font-mono text-xs">
            <span class="text-muted">after a scrub</span>
            <span class="text-accent">4 items removed</span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
