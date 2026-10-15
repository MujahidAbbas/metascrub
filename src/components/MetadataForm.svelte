<script lang="ts">
  import { untrack } from 'svelte';
  import type { Metadata } from '../lib/types';

  interface Props {
    value: Metadata;
    /** Optional hint shown under the heading (e.g. "applied to all 3 files"). */
    scope?: string;
  }
  let { value = $bindable(), scope }: Props = $props();

  const fields: { key: keyof Metadata; label: string; placeholder: string }[] = [
    { key: 'title', label: 'Title', placeholder: 'Document title' },
    { key: 'author', label: 'Author', placeholder: 'Author name' },
    { key: 'subject', label: 'Subject', placeholder: 'What it’s about' },
    { key: 'creator', label: 'Creator', placeholder: 'Creating application' },
    { key: 'producer', label: 'Producer', placeholder: 'Producing application' },
  ];

  function strVal(k: keyof Metadata): string {
    const v = value[k];
    return typeof v === 'string' ? v : '';
  }

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
  function setKeywords(text: string) {
    keywordText = text;
    value.keywords = parse(text);
  }
</script>

<div class="space-y-5">
  <div>
    <h3 class="font-mono text-sm font-semibold text-fg">Metadata</h3>
    {#if scope}<p class="mt-1 font-mono text-xs text-muted">{scope}</p>{/if}
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    {#each fields as f (f.key)}
      <label class="block">
        <span class="font-mono text-xs uppercase tracking-wider text-faint">{f.label}</span>
        <input
          type="text"
          placeholder={f.placeholder}
          value={strVal(f.key)}
          oninput={(e) => ((value as Record<string, unknown>)[f.key] = (e.currentTarget as HTMLInputElement).value)}
          class="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
      </label>
    {/each}
  </div>

  <label class="block">
    <span class="font-mono text-xs uppercase tracking-wider text-faint">Keywords</span>
    <input
      type="text"
      placeholder="comma, separated, keywords"
      value={keywordText}
      oninput={(e) => setKeywords((e.currentTarget as HTMLInputElement).value)}
      class="mt-1.5 w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg outline-none transition-colors placeholder:text-faint focus:border-accent"
    />
  </label>
</div>
