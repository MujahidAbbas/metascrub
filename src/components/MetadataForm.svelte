<script lang="ts" module>
  import type { Metadata } from '../lib/types';

  export type EditKey = 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer';
  export const EDIT_KEYS: EditKey[] = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'];

  /** A field's value as the user sees it: keywords comma-joined, missing as ''. */
  export function shown(m: Metadata | undefined, k: EditKey): string {
    const v = m?.[k];
    return Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '';
  }

  /** Fields whose value differs from the file's own. */
  export function changedKeys(value: Metadata, original: Metadata): EditKey[] {
    return EDIT_KEYS.filter((k) => shown(value, k) !== shown(original, k));
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { riskOf, TAG } from './ScrubReport.svelte';

  interface Props {
    value: Metadata;
    /** The file's own values, for a single file: changed rows show what they were. */
    original?: Metadata;
  }
  let { value = $bindable(), original }: Props = $props();

  const fields: { key: EditKey; label: string; placeholder: string }[] = [
    { key: 'title', label: 'Title', placeholder: 'Document title' },
    { key: 'author', label: 'Author', placeholder: 'Author name' },
    { key: 'subject', label: 'Subject', placeholder: 'What it’s about' },
    { key: 'keywords', label: 'Keywords', placeholder: 'comma, separated, keywords' },
    { key: 'creator', label: 'Creator', placeholder: 'Creating application' },
    { key: 'producer', label: 'Producer', placeholder: 'Producing application' },
  ];

  // Keywords are an array internally; edit them as a comma-separated string.
  // The raw text is kept as typed, so "tax return, " keeps its trailing
  // separator; it is rebuilt from `value` only when the keywords change from
  // outside (prefill, start over).
  const parse = (text: string) => text.split(',').map((k) => k.trim()).filter(Boolean);
  let keywordText = $state('');
  $effect(() => {
    const kws = value.keywords ?? [];
    if (parse(untrack(() => keywordText)).join('\n') !== kws.join('\n')) keywordText = kws.join(', ');
  });

  function set(k: EditKey, text: string) {
    if (k === 'keywords') {
      keywordText = text;
      value.keywords = parse(text);
    } else {
      (value as Record<string, unknown>)[k] = text;
    }
  }
  const text = (k: EditKey) => (k === 'keywords' ? keywordText : shown(value, k));
  const changed = (k: EditKey) => !!original && shown(value, k) !== shown(original, k);
</script>

<ul class="divide-y divide-border overflow-hidden rounded-[10px] border border-border">
  {#each fields as f (f.key)}
    {@const tag = TAG[riskOf(f.label)]}
    {@const id = `meta-${f.key}`}
    <li class="relative grid gap-x-4 gap-y-2 bg-surface px-4 py-3 sm:grid-cols-[minmax(0,10rem)_1fr] sm:items-center">
      {#if changed(f.key)}<span class="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true"></span>{/if}
      <label for={id} class="flex flex-wrap items-center gap-2">
        <span class="font-mono text-[13px] text-muted">{f.label}</span>
        {#if tag}<span class={tag[1]}>{tag[0]}</span>{/if}
      </label>
      <div class="min-w-0">
        <div class="relative">
          <input
            {id}
            type="text"
            placeholder={original ? f.placeholder : 'Leave unchanged'}
            value={text(f.key)}
            oninput={(e) => set(f.key, (e.currentTarget as HTMLInputElement).value)}
            class="w-full rounded-md border border-border bg-bg py-2 pl-3 pr-9 font-mono text-sm text-fg outline-none transition-colors placeholder:text-faint focus:border-accent"
          />
          {#if text(f.key)}
            <button
              type="button"
              onclick={() => set(f.key, '')}
              aria-label="Clear {f.label}"
              title="Clear {f.label}"
              class="absolute inset-y-0 right-0 grid w-9 place-items-center text-faint transition-colors hover:text-redact"
            >✕</button>
          {/if}
        </div>
        {#if changed(f.key)}
          <p class="mt-1.5 font-mono text-xs text-faint">
            {#if shown(original, f.key)}
              was <span class="text-muted line-through decoration-redact">{shown(original, f.key)}</span>
            {:else}
              was empty
            {/if}
          </p>
        {/if}
      </div>
    </li>
  {/each}
</ul>
