<script lang="ts">
  import Dropzone from './Dropzone.svelte';
  import MetadataForm from './MetadataForm.svelte';
  import ScrubReport from './ScrubReport.svelte';
  import type { Metadata, ReadResult, ScrubRemoval } from '../lib/types';
  import { readMetadata, writeMetadata } from '../lib/pdf-meta';
  import { scrub } from '../lib/scrub';
  import { batchEdit, batchScrub } from '../lib/batch';
  import { downloadPdf, downloadZipped, suggestName } from '../lib/download';

  interface Props {
    mode: 'edit' | 'scrub';
  }
  let { mode }: Props = $props();
  const isScrub = mode === 'scrub';

  type Status = 'reading' | 'ready' | 'error' | 'done';
  interface Entry {
    id: number;
    name: string;
    bytes: Uint8Array;
    status: Status;
    meta?: ReadResult;
    error?: string;
    removed?: ScrubRemoval[];
    outBytes?: Uint8Array;
  }

  let entries = $state<Entry[]>([]);
  let editForm = $state<Metadata>({});
  let busy = $state(false);
  let prefilled = false;
  let nextId = 0;

  const ready = $derived(entries.filter((e) => e.status === 'ready' || e.status === 'done'));
  const isMulti = $derived(entries.length > 1);
  const single = $derived(entries.length === 1 ? entries[0] : undefined);

  function patch(id: number, p: Partial<Entry>) {
    entries = entries.map((e) => (e.id === id ? { ...e, ...p } : e));
  }

  async function addFiles(files: File[]) {
    for (const file of files) {
      const id = nextId++;
      entries = [...entries, { id, name: file.name, bytes: new Uint8Array(), status: 'reading' }];
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const meta = await readMetadata(bytes);
        patch(id, { bytes, meta, status: 'ready' });
        if (mode === 'edit' && !prefilled) {
          prefilled = true;
          const m = meta.metadata;
          editForm = {
            title: m.title, author: m.author, subject: m.subject,
            keywords: m.keywords, creator: m.creator, producer: m.producer,
          };
        }
      } catch (e) {
        patch(id, { status: 'error', error: (e as Error).message });
      }
    }
  }

  function reset() {
    entries = [];
    editForm = {};
    prefilled = false;
  }

  function remove(id: number) {
    entries = entries.filter((e) => e.id !== id);
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

  function displayRows(m: Metadata): [string, string][] {
    const rows: [string, string][] = [];
    const add = (label: string, v: unknown) => {
      if (v == null) return;
      const s = Array.isArray(v) ? v.join(', ') : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      if (s.trim()) rows.push([label, s]);
    };
    add('Title', m.title); add('Author', m.author); add('Subject', m.subject);
    add('Keywords', m.keywords); add('Creator', m.creator); add('Producer', m.producer);
    add('Creator tool', m.creatorTool); add('Created', m.creationDate); add('Modified', m.modificationDate);
    return rows;
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  async function runEditSingle() {
    if (!single) return;
    busy = true;
    try {
      const out = await writeMetadata(single.bytes, editForm);
      downloadPdf(suggestName(single.name, 'edited'), out);
      patch(single.id, { status: 'done', outBytes: out });
    } catch (e) {
      patch(single.id, { status: 'error', error: (e as Error).message });
    } finally {
      busy = false;
    }
  }

  async function runEditAll() {
    busy = true;
    const meta = cleanMeta(editForm);
    const results = await batchEdit(ready.map((e) => ({ name: e.name, bytes: e.bytes })), meta);
    const ok = results.filter((r) => r.ok && r.bytes).map((r) => ({ name: suggestName(r.name, 'edited'), bytes: r.bytes! }));
    if (ok.length) await downloadZipped(ok, 'metascrub-edited.zip');
    for (const r of results) {
      const ent = entries.find((e) => e.name === r.name);
      if (ent) patch(ent.id, r.ok ? { status: 'done' } : { status: 'error', error: r.error });
    }
    busy = false;
  }

  async function runScrubSingle() {
    if (!single) return;
    busy = true;
    try {
      const { bytes, removed } = await scrub(single.bytes);
      patch(single.id, { status: 'done', removed, outBytes: bytes });
    } catch (e) {
      patch(single.id, { status: 'error', error: (e as Error).message });
    } finally {
      busy = false;
    }
  }

  async function runScrubAll() {
    busy = true;
    const results = await batchScrub(ready.map((e) => ({ name: e.name, bytes: e.bytes })));
    const ok = results.filter((r) => r.ok && r.bytes).map((r) => ({ name: suggestName(r.name, 'scrubbed'), bytes: r.bytes! }));
    if (ok.length) await downloadZipped(ok, 'metascrub-scrubbed.zip');
    for (const r of results) {
      const ent = entries.find((e) => e.name === r.name);
      if (ent) patch(ent.id, r.ok ? { status: 'done', removed: r.removed, outBytes: r.bytes } : { status: 'error', error: r.error });
    }
    busy = false;
  }

  const accent = isScrub ? 'redact' : 'accent';
  function btn(primary: boolean): string {
    if (primary) return isScrub ? 'bg-redact text-white' : 'bg-accent text-bg';
    return 'border border-border-bright bg-surface text-fg hover:border-faint';
  }
</script>

<div class="space-y-6">
  {#if entries.length === 0}
    <Dropzone onfiles={addFiles} {busy} accent={accent} />
  {:else}
    <!-- File list (always shown when multi, or as a compact header when single) -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="font-mono text-sm text-muted">
        {entries.length} file{entries.length === 1 ? '' : 's'} loaded
      </div>
      <div class="flex gap-2">
        <label class="cursor-pointer rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-border-bright hover:text-fg">
          + add more
          <input type="file" accept="application/pdf,.pdf" multiple class="hidden"
            onchange={(e) => addFiles(Array.from((e.currentTarget as HTMLInputElement).files ?? []))} />
        </label>
        <button onclick={reset} class="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-redact hover:text-redact">
          start over
        </button>
      </div>
    </div>

    {#if isMulti}
      <ul class="space-y-px overflow-hidden rounded-lg border border-border bg-border">
        {#each entries as e (e.id)}
          <li class="flex items-center justify-between gap-3 bg-surface px-4 py-2.5 font-mono text-sm">
            <span class="flex min-w-0 items-center gap-2.5">
              <span class="text-faint">▮</span>
              <span class="truncate text-fg">{e.name}</span>
            </span>
            <span class="flex shrink-0 items-center gap-3">
              {#if e.status === 'reading'}<span class="text-muted">reading…</span>
              {:else if e.status === 'error'}<span class="text-redact" title={e.error}>error</span>
              {:else if e.status === 'done'}<span class="text-accent">{isScrub ? `−${e.removed?.length ?? 0}` : 'done'}</span>
              {:else}<span class="text-muted">{e.meta ? displayRows(e.meta.metadata).length : 0} fields</span>{/if}
              <button onclick={() => remove(e.id)} class="text-faint hover:text-redact">✕</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- ── EDIT MODE ── -->
    {#if mode === 'edit'}
      <div class="rounded-xl border border-border bg-surface p-6">
        <MetadataForm bind:value={editForm} scope={isMulti ? `Applied to all ${ready.length} files (blank fields are left untouched)` : undefined} />
        <div class="mt-6 flex items-center gap-3">
          <button
            onclick={isMulti ? runEditAll : runEditSingle}
            disabled={busy || ready.length === 0}
            class="rounded-md px-5 py-2.5 font-mono text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 {btn(true)}"
          >
            {busy ? 'Working…' : isMulti ? `Apply & download .zip` : 'Save & download'}
          </button>
          {#if single?.status === 'done'}<span class="font-mono text-xs text-accent">✓ downloaded</span>{/if}
        </div>
      </div>

    <!-- ── SCRUB MODE ── -->
    {:else if single}
      {#if single.status === 'done'}
        <div class="rounded-xl border border-border bg-surface p-6">
          <ScrubReport removed={single.removed ?? []} />
          <div class="mt-6 flex gap-3">
            <button onclick={() => single.outBytes && downloadPdf(suggestName(single.name, 'scrubbed'), single.outBytes)}
              class="rounded-md px-5 py-2.5 font-mono text-sm font-semibold transition-transform hover:-translate-y-0.5 {btn(true)}">
              ↓ Download clean PDF
            </button>
            <button onclick={reset} class="rounded-md px-5 py-2.5 font-mono text-sm {btn(false)}">Scrub another</button>
          </div>
        </div>
      {:else if single.status === 'error'}
        <div class="rounded-xl border border-redact/40 bg-redact/5 p-6 font-mono text-sm text-redact">{single.error}</div>
      {:else}
        <div class="rounded-xl border border-border bg-surface p-6">
          <h3 class="font-mono text-sm font-semibold">Found in <span class="text-fg">{single.name}</span></h3>
          <div class="mt-4 space-y-px overflow-hidden rounded-lg border border-border bg-border font-mono text-sm">
            {#each displayRows(single.meta?.metadata ?? {}) as [k, v] (k)}
              <div class="flex items-center justify-between gap-4 bg-surface px-4 py-2.5">
                <span class="text-faint">{k}</span><span class="truncate text-muted">{v}</span>
              </div>
            {:else}
              <div class="bg-surface px-4 py-2.5 text-muted">No metadata found — already clean.</div>
            {/each}
          </div>
          <button onclick={runScrubSingle} disabled={busy}
            class="mt-6 rounded-md px-5 py-2.5 font-mono text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 {btn(true)}">
            {busy ? 'Scrubbing…' : '▮ Scrub all metadata'}
          </button>
        </div>
      {/if}

    <!-- ── SCRUB MODE, multi ── -->
    {:else}
      <div class="rounded-xl border border-border bg-surface p-6">
        <p class="text-sm text-muted">Wipe every metadata field from all {ready.length} files and download them as a zip.</p>
        <button onclick={runScrubAll} disabled={busy || ready.length === 0}
          class="mt-5 rounded-md px-5 py-2.5 font-mono text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 {btn(true)}">
          {busy ? 'Scrubbing…' : `▮ Scrub ${ready.length} files & download .zip`}
        </button>
        {#if ready.some((e) => e.status === 'done')}<span class="ml-3 font-mono text-xs text-accent">✓ downloaded</span>{/if}
      </div>
    {/if}
  {/if}
</div>
