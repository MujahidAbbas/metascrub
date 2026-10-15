<script lang="ts">
  import { onMount } from 'svelte';
  import Dropzone from './Dropzone.svelte';
  import MetadataForm, { changedKeys, EDIT_KEYS, type EditKey } from './MetadataForm.svelte';
  import ScrubReport, { countRisk } from './ScrubReport.svelte';
  import type { Metadata, ReadResult, ScrubRemoval } from '../lib/types';
  import { downloadPdf, downloadZipped, suggestName } from '../lib/download';

  // The PDF engine (pdf-lib, ~190 KB gzipped) loads once the page is idle
  // rather than during hydration. It is still fetched right after load, so the
  // tool keeps working if the connection drops before a file is dropped.
  let enginePromise: ReturnType<typeof loadEngine> | undefined;
  function loadEngine() {
    return Promise.all([import('../lib/pdf-meta'), import('../lib/scrub'), import('../lib/batch')])
      .then(([meta, s, batch]) => ({ ...meta, ...s, ...batch }));
  }
  const engine = () => (enginePromise ??= loadEngine());
  onMount(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
    idle(() => engine());
  });

  interface Props {
    mode: 'edit' | 'scrub';
    /** Home page: show the redaction demo in the empty state. */
    demo?: boolean;
  }
  let { mode: startMode, demo = false }: Props = $props();
  // Scrub and Edit share one workspace; switching keeps the loaded files.
  let mode = $state(startMode);

  type Status = 'reading' | 'ready' | 'error';
  interface Entry {
    id: number;
    name: string;
    size: number;
    bytes: Uint8Array;
    status: Status;
    meta?: ReadResult;
    /** A scrub run on load: its report is what Review shows, its bytes are the clean copy. */
    plan?: { bytes: Uint8Array; removed: ScrubRemoval[] };
    /** The file reads but the scrub failed: Edit still works on it. */
    planError?: string;
    error?: string;
    scrubbed?: boolean;
    /** Bytes of the last saved edit. */
    edited?: Uint8Array;
  }

  const SCRUB_ZIP = 'metascrub-scrubbed.zip';
  const EDIT_ZIP = 'metascrub-edited.zip';

  let entries = $state<Entry[]>([]);
  let editForm = $state<Metadata>({});
  // editForm as it was at the last save; typing again takes the "saved" state away.
  let savedForm = $state('');
  let busy = $state(false);
  let skipped = $state<string[]>([]);
  // The last zip handed out, so it can be downloaded again.
  let zip = $state<{ name: string; files: { name: string; bytes: Uint8Array }[] } | null>(null);
  let prefilled = false;
  // Values copied into the form from a lone file. A batch edit must not stamp
  // one file's values onto the rest, so they are cleared once a second file
  // arrives; anything the user typed stays.
  let prefill: Metadata = {};
  let nextId = 0;

  const ready = $derived(entries.filter((e) => e.status === 'ready'));
  const reading = $derived(entries.some((e) => e.status === 'reading'));
  const single = $derived(entries.length === 1 ? entries[0] : undefined);
  const totalSize = $derived(entries.reduce((n, e) => n + e.size, 0));
  const scrubbable = $derived(ready.filter((e) => e.plan));
  const found = $derived(scrubbable.flatMap((e) => e.plan!.removed));
  const identity = $derived(countRisk(found, 'identity'));
  const formNow = $derived(JSON.stringify(editForm));
  const editChanges = $derived(
    single?.meta ? changedKeys(editForm, pickEdit(single.meta.metadata)).length : Object.keys(cleanMeta(editForm)).length,
  );
  const scrubDone = $derived(single ? !!single.scrubbed : zip?.name === SCRUB_ZIP && scrubbable.every((e) => e.scrubbed));
  const editDone = $derived(
    savedForm === formNow && (single ? !!single.edited : zip?.name === EDIT_ZIP),
  );
  const done = $derived(mode === 'scrub' ? scrubDone : editDone);
  const step = $derived(entries.length === 0 ? 1 : done ? 3 : 2);

  function patch(id: number, p: Partial<Entry>) {
    entries = entries.map((e) => (e.id === id ? { ...e, ...p } : e));
  }

  const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const fmtSize = (n: number) =>
    n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

  function pickEdit(m: Metadata): Metadata {
    const out: Metadata = {};
    for (const k of EDIT_KEYS) if (m[k] !== undefined) (out as Record<EditKey, unknown>)[k] = m[k];
    return out;
  }

  function clearPrefill() {
    const next = { ...editForm };
    for (const k of Object.keys(prefill) as (keyof Metadata)[]) {
      if (JSON.stringify(next[k]) === JSON.stringify(prefill[k])) delete next[k];
    }
    editForm = next;
    prefill = {};
  }

  function prefillFrom(meta: ReadResult) {
    if (prefilled) return;
    prefilled = true;
    prefill = pickEdit(meta.metadata);
    editForm = { ...prefill };
  }

  function setMode(next: 'edit' | 'scrub') {
    mode = next;
    if (next === 'edit' && single?.meta) prefillFrom(single.meta);
  }

  async function addFiles(picked: File[]) {
    skipped = picked.filter((f) => !isPdf(f)).map((f) => f.name);
    const files = picked.filter(isPdf);
    if (!files.length) return;
    const batch = entries.length + files.length > 1;
    if (batch) clearPrefill();
    // New files reopen the review: everything is checked and downloaded together again.
    zip = null;
    entries = entries.map((e) => ({ ...e, scrubbed: false }));
    for (const file of files) {
      const id = nextId++;
      entries = [...entries, { id, name: file.name, size: file.size, bytes: new Uint8Array(), status: 'reading' }];
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const eng = await engine();
        const meta = await eng.readMetadata(bytes);
        // Scrub now, so Review lists everything a scrub removes (comment
        // authors, earlier saves, page XMP), not only the Info/XMP fields.
        let plan: Entry['plan'];
        let planError: string | undefined;
        try {
          plan = await eng.scrub(bytes);
        } catch (e) {
          planError = (e as Error).message;
        }
        patch(id, { bytes, meta, plan, planError, status: 'ready' });
        // entries is re-checked after the await: "Add files" may have added a file meanwhile.
        if (mode === 'edit' && !batch && entries.length === 1) prefillFrom(meta);
      } catch (e) {
        patch(id, { status: 'error', error: (e as Error).message });
      }
    }
  }

  function reset() {
    entries = [];
    editForm = {};
    prefill = {};
    skipped = [];
    prefilled = false;
    savedForm = '';
    zip = null;
  }

  function remove(id: number) {
    entries = entries.filter((e) => e.id !== id);
    zip = null;
    if (entries.length === 0) reset();
  }

  function cleanMeta(m: Metadata): Metadata {
    const out: Metadata = {};
    for (const [k, v] of Object.entries(m) as [keyof Metadata, unknown][]) {
      if (v == null) continue;
      if (typeof v === 'string' && !v.trim()) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      (out as Record<string, unknown>)[k] = v;
    }
    return out;
  }

  /** A file's current properties, shaped like report rows so they get the same tags. */
  function currentRows(r: ReadResult | undefined): ScrubRemoval[] {
    if (!r) return [];
    const m = r.metadata;
    const rows: ScrubRemoval[] = [];
    const add = (field: string, v: unknown) => {
      if (v == null) return;
      const s = Array.isArray(v) ? v.join(', ') : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      if (s.trim()) rows.push({ field, source: 'info', value: s });
    };
    add('Title', m.title); add('Author', m.author); add('Subject', m.subject);
    add('Keywords', m.keywords); add('Creator', m.creator); add('Producer', m.producer);
    add('Creator tool', m.creatorTool); add('Created', m.creationDate); add('Modified', m.modificationDate);
    for (const e of r.infoExtra) add(e.key, e.value);
    return rows;
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  async function saveEdit() {
    if (!single) return;
    busy = true;
    try {
      const out = await (await engine()).writeMetadata(single.bytes, editForm);
      downloadPdf(suggestName(single.name, 'edited'), out);
      patch(single.id, { edited: out });
      savedForm = formNow;
    } catch (e) {
      patch(single.id, { status: 'error', error: (e as Error).message });
    } finally {
      busy = false;
    }
  }

  // Batch results come back in input order; match by position, not filename,
  // since two files from different folders can share a name.
  async function applyAll() {
    busy = true;
    try {
      const targets = ready;
      const results = await (await engine()).batchEdit(targets.map((e) => ({ name: e.name, bytes: e.bytes })), cleanMeta(editForm));
      results.forEach((r, i) => patch(targets[i]!.id, r.ok ? { edited: r.bytes } : { status: 'error', error: r.error }));
      const ok = results.filter((r) => r.ok && r.bytes).map((r) => ({ name: suggestName(r.name, 'edited'), bytes: r.bytes! }));
      if (ok.length) {
        zip = { name: EDIT_ZIP, files: ok };
        savedForm = formNow;
        await downloadZipped(ok, EDIT_ZIP);
      }
    } finally {
      busy = false;
    }
  }

  function scrubSingle() {
    if (single?.plan) patch(single.id, { scrubbed: true });
  }

  async function scrubAll() {
    busy = true;
    try {
      const targets = scrubbable;
      entries = entries.map((e) => (e.status === 'ready' && e.plan ? { ...e, scrubbed: true } : e));
      const files = targets.map((e) => ({ name: suggestName(e.name, 'scrubbed'), bytes: e.plan!.bytes }));
      zip = { name: SCRUB_ZIP, files };
      await downloadZipped(files, SCRUB_ZIP);
    } finally {
      busy = false;
    }
  }

  function zipAgain() {
    if (zip) downloadZipped(zip.files, zip.name);
  }
</script>

{#snippet check(size: string)}
  <span class="grid {size} shrink-0 place-items-center rounded-full bg-accent text-bg" aria-hidden="true">
    <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>
  </span>
{/snippet}

{#snippet fileRow(e: Entry)}
  {@const rows = mode === 'scrub' ? (e.plan?.removed ?? []) : currentRows(e.meta)}
  {@const who = countRisk(rows, 'identity')}
  <li class="relative bg-surface">
    {#if e.status === 'ready'}
      <details class="group/file">
        <summary class="flex cursor-pointer list-none items-center justify-between gap-3 py-3 pl-4 pr-12 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
          <span class="flex min-w-0 items-center gap-2.5">
            <span class="font-mono text-faint transition-transform group-open/file:rotate-90" aria-hidden="true">›</span>
            <span class="truncate font-mono text-sm text-fg">{e.name}</span>
          </span>
          <span class="flex shrink-0 items-center gap-2.5 font-mono text-xs">
            {#if mode === 'scrub' && e.planError}
              <span class="text-redact">couldn’t scrub</span>
            {:else if mode === 'scrub' && e.scrubbed}
              <span class="text-accent">✓ {rows.length} removed</span>
            {:else if mode === 'scrub'}
              <span class="text-muted">{rows.length} found</span>
              {#if who}<span class="tag tag-identity max-sm:hidden">{who} identify you</span>{/if}
            {:else}
              <span class="text-muted">{plural(rows.length, 'field')}</span>
            {/if}
          </span>
        </summary>
        <div class="px-4 pb-4">
          {#if mode === 'scrub' && e.planError}
            <p class="text-sm text-redact">{e.planError}</p>
          {:else if rows.length}
            <ScrubReport {rows} state={mode === 'scrub' && e.scrubbed ? 'removed' : 'found'} />
          {:else}
            <p class="text-sm text-muted">No hidden metadata in this file.</p>
          {/if}
        </div>
      </details>
    {:else}
      <div class="flex items-center justify-between gap-3 py-3 pl-4 pr-12">
        <span class="flex min-w-0 items-center gap-2.5">
          <span class="w-2" aria-hidden="true"></span>
          <span class="truncate font-mono text-sm text-fg">{e.name}</span>
        </span>
        <span class="shrink-0 font-mono text-xs {e.status === 'error' ? 'text-redact' : 'text-muted'}">
          {e.status === 'error' ? 'couldn’t open' : 'reading…'}
        </span>
      </div>
      {#if e.error}<p class="-mt-1 pb-3 pl-9 pr-4 text-xs text-redact">{e.error}</p>{/if}
    {/if}
    <button
      type="button"
      onclick={() => remove(e.id)}
      aria-label="Remove {e.name}"
      class="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-redact"
    >✕</button>
  </li>
{/snippet}

<!-- Once files are loaded, the whole workspace takes more files by drop. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="space-y-4"
  ondragover={(e) => { if (entries.length) e.preventDefault(); }}
  ondrop={(e) => {
    if (!entries.length) return;
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer?.files ?? []));
  }}
>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="inline-flex rounded-lg border border-border bg-surface p-1" role="group" aria-label="What to do with your PDFs">
      {#each [['scrub', 'Scrub'], ['edit', 'Edit']] as [m, label] (m)}
        <button
          type="button"
          aria-pressed={mode === m}
          disabled={busy}
          onclick={() => setMode(m as 'scrub' | 'edit')}
          class="rounded-md px-4 py-1.5 text-sm font-semibold transition-colors
            {mode === m ? 'bg-surface-2 text-fg ring-1 ring-border-bright' : 'text-muted hover:text-fg'}"
        >{label}</button>
      {/each}
    </div>
    <ol class="hidden items-center gap-2 font-mono text-xs sm:flex" aria-label="Progress">
      {#each ['Load', 'Review', 'Download'] as s, i (s)}
        <li class="flex items-center gap-2 {i + 1 === step ? 'text-fg' : i + 1 < step ? 'text-accent' : 'text-faint'}" aria-current={i + 1 === step ? 'step' : undefined}>
          <span class="grid h-5 w-5 place-items-center rounded-full border text-[10px]
            {i + 1 === step ? 'border-fg' : i + 1 < step ? 'border-accent bg-accent text-bg' : 'border-border-bright'}">{i + 1 < step ? '✓' : i + 1}</span>
          {s}
          {#if i < 2}<span class="ml-1 h-px w-5 bg-border-bright" aria-hidden="true"></span>{/if}
        </li>
      {/each}
    </ol>
  </div>

  {#if skipped.length}
    <div class="flex items-start justify-between gap-3 rounded-[10px] border border-warn/40 bg-warn/5 px-4 py-2.5 text-sm" role="status">
      <p class="text-muted"><span class="font-semibold text-warn">Skipped</span> <span class="font-mono text-fg">{skipped.join(', ')}</span>: not a PDF.</p>
      <button type="button" class="text-faint hover:text-fg" aria-label="Dismiss" onclick={() => (skipped = [])}>✕</button>
    </div>
  {/if}

  {#if entries.length === 0}
    <Dropzone onfiles={addFiles} {busy} demo={demo && mode === 'scrub'} />
  {:else}
    <div class="overflow-hidden rounded-[14px] border border-border bg-surface">
      <!-- File header -->
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-surface-2/50 px-4 py-3 sm:px-5">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-bg text-faint" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
          </span>
          <div class="min-w-0">
            <p class="truncate font-mono text-sm text-fg">{single ? single.name : `${entries.length} files`}</p>
            <p class="font-mono text-xs text-faint">{fmtSize(totalSize)} · stays on this device</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <label class="btn btn-ghost btn-sm cursor-pointer focus-within:outline-2 focus-within:outline-accent">
            + Add files
            <input type="file" accept="application/pdf,.pdf" multiple class="sr-only"
              onchange={(e) => addFiles(Array.from((e.currentTarget as HTMLInputElement).files ?? []))} />
          </label>
          <button type="button" class="btn btn-ghost btn-sm" onclick={reset}>Start over</button>
        </div>
      </div>

      <div class="p-4 sm:p-6">
        {#if single && single.status === 'reading'}
          <p class="py-8 text-center font-mono text-sm text-muted">Reading {single.name}…</p>

        {:else if single && single.status === 'error'}
          <div class="rounded-[10px] border border-redact/40 bg-redact/5 p-5">
            <p class="font-semibold text-fg">Couldn’t open this file</p>
            <p class="mt-1 text-sm text-muted">{single.error}</p>
            <button type="button" class="btn btn-secondary btn-sm mt-4" onclick={reset}>Choose another file</button>
          </div>

        <!-- ── SCRUB, one file ── -->
        {:else if mode === 'scrub' && single}
          {@const rows = single.plan?.removed ?? []}
          {#if single.planError}
            <div class="rounded-[10px] border border-redact/40 bg-redact/5 p-5">
              <p class="font-semibold text-fg">Couldn’t scrub this file</p>
              <p class="mt-1 text-sm text-muted">{single.planError}</p>
              <button type="button" class="btn btn-secondary btn-sm mt-4" onclick={reset}>Choose another file</button>
            </div>
          {:else if single.scrubbed}
            <div class="flex items-start gap-4">
              {@render check('h-11 w-11')}
              <div>
                <h3 class="text-2xl font-semibold tracking-tight text-fg">Clean</h3>
                <p class="mt-1 text-muted">
                  <span class="font-mono text-fg">{rows.length}</span> {rows.length === 1 ? 'item' : 'items'} removed. Pages, text and comment text are untouched.
                </p>
              </div>
            </div>
            <div class="mt-6 flex flex-wrap gap-3">
              <button type="button" class="btn btn-primary btn-lg max-sm:w-full"
                onclick={() => single.plan && downloadPdf(suggestName(single.name, 'scrubbed'), single.plan.bytes)}>
                ↓ Download clean PDF
              </button>
              <button type="button" class="btn btn-secondary btn-lg max-sm:w-full" onclick={reset}>Scrub another</button>
            </div>
            <div class="mt-6"><ScrubReport {rows} state="removed" /></div>
          {:else if rows.length === 0}
            <div class="flex items-start gap-4">
              {@render check('h-10 w-10')}
              <div>
                <h3 class="text-xl font-semibold tracking-tight text-fg">Already clean</h3>
                <p class="mt-1 text-muted">No hidden metadata in this PDF, so there is nothing to remove.</p>
              </div>
            </div>
            <button type="button" class="btn btn-secondary mt-6" onclick={reset}>Check another</button>
          {:else}
            {@const who = countRisk(rows, 'identity')}
            <h3 class="text-xl font-semibold tracking-tight text-fg">{plural(rows.length, 'item')} of hidden metadata</h3>
            <p class="mt-1 text-sm text-muted">
              {#if who}<span class="font-semibold text-redact">{who} can identify you.</span>{/if}
              A scrub removes all of them. Pages and text stay as they are.
            </p>
            <div class="mt-5"><ScrubReport {rows} state="found" /></div>
            <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
              <button type="button" class="btn btn-redact btn-lg max-sm:w-full" onclick={scrubSingle}>Scrub {plural(rows.length, 'item')}</button>
              <span class="text-xs text-faint">Your original file is not changed.</span>
            </div>
          {/if}

        <!-- ── SCRUB, many files ── -->
        {:else if mode === 'scrub'}
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            {#if scrubDone}
              <h3 class="text-xl font-semibold tracking-tight text-fg">{plural(scrubbable.length, 'file')} clean</h3>
              <p class="text-sm text-muted"><span class="font-mono text-fg">{found.length}</span> items removed</p>
            {:else}
              <h3 class="text-xl font-semibold tracking-tight text-fg">{plural(found.length, 'item')} across {plural(scrubbable.length, 'file')}</h3>
              {#if identity}<p class="text-sm font-semibold text-redact">{identity} can identify you</p>{/if}
            {/if}
          </div>
          <ul class="mt-4 divide-y divide-border overflow-hidden rounded-[10px] border border-border">
            {#each entries as e (e.id)}{@render fileRow(e)}{/each}
          </ul>
          <div class="mt-6 flex flex-wrap items-center gap-3">
            {#if scrubDone}
              <button type="button" class="btn btn-primary btn-lg max-sm:w-full" onclick={zipAgain}>↓ Download .zip again</button>
              <button type="button" class="btn btn-secondary btn-lg max-sm:w-full" onclick={reset}>Scrub more files</button>
            {:else}
              <button type="button" class="btn btn-redact btn-lg max-sm:w-full max-sm:whitespace-normal" disabled={busy || reading || scrubbable.length === 0} onclick={scrubAll}>
                {busy ? 'Zipping…' : `Scrub ${plural(scrubbable.length, 'file')} & download .zip`}
              </button>
            {/if}
          </div>

        <!-- ── EDIT, one file ── -->
        {:else if single?.meta}
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 class="text-xl font-semibold tracking-tight text-fg">Document properties</h3>
            <p class="font-mono text-xs text-faint">written to the Info dictionary and XMP</p>
          </div>
          <div class="mt-4"><MetadataForm bind:value={editForm} original={pickEdit(single.meta.metadata)} /></div>
          <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            {#if editDone && single.edited}
              {@const saved = single.edited}
              {@render check('h-8 w-8')}
              <p class="text-sm text-muted">Saved <span class="font-mono text-fg">{suggestName(single.name, 'edited')}</span></p>
              <button type="button" class="btn btn-secondary btn-sm" onclick={() => downloadPdf(suggestName(single.name, 'edited'), saved)}>↓ Download again</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick={reset}>Edit another</button>
            {:else}
              <button type="button" class="btn btn-primary btn-lg max-sm:w-full" disabled={busy || editChanges === 0} onclick={saveEdit}>
                {busy ? 'Saving…' : editChanges ? `Save ${plural(editChanges, 'change')} & download` : 'No changes yet'}
              </button>
              <span class="text-xs text-faint">A new copy downloads. The original is not changed.</span>
            {/if}
          </div>

        <!-- ── EDIT, many files ── -->
        {:else}
          <h3 class="text-xl font-semibold tracking-tight text-fg">Edit {plural(ready.length, 'file')}</h3>
          <p class="mt-1 text-sm text-muted">Fields you fill in are written to every file. Blank fields are left as they are.</p>
          <ul class="mt-4 divide-y divide-border overflow-hidden rounded-[10px] border border-border">
            {#each entries as e (e.id)}{@render fileRow(e)}{/each}
          </ul>
          <div class="mt-6"><MetadataForm bind:value={editForm} /></div>
          <div class="mt-6 flex flex-wrap items-center gap-3">
            {#if editDone}
              <button type="button" class="btn btn-primary btn-lg max-sm:w-full" onclick={zipAgain}>↓ Download .zip again</button>
              <button type="button" class="btn btn-secondary btn-lg max-sm:w-full" onclick={reset}>Edit more files</button>
            {:else}
              <button type="button" class="btn btn-primary btn-lg max-sm:w-full max-sm:whitespace-normal" disabled={busy || reading || ready.length === 0 || editChanges === 0} onclick={applyAll}>
                {busy ? 'Saving…' : editChanges ? `Apply ${plural(editChanges, 'field')} to ${plural(ready.length, 'file')} & download .zip` : 'Fill in a field to apply it'}
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
