<script lang="ts">
  import type { RemovalSource, ScrubRemoval } from '../lib/types';

  interface Props {
    removed: ScrubRemoval[];
  }
  let { removed }: Props = $props();

  const badge: Partial<Record<RemovalSource, string>> = {
    xmp: 'xmp',
    comment: 'comment',
    revision: 'old save',
    embedded: 'embedded',
  };
</script>

{#if removed.length === 0}
  <p class="font-mono text-sm text-muted">Nothing to remove — this PDF was already clean.</p>
{:else}
  <div class="space-y-px overflow-hidden rounded-lg border border-border bg-border font-mono text-sm">
    {#each removed as r (r.field + r.source + r.value)}
      <div class="flex items-center justify-between gap-4 bg-surface px-4 py-2.5">
        <span class="flex items-center gap-2.5">
          <span class="text-redact">▮</span>
          <span class="text-faint">{r.field}</span>
          {#if badge[r.source]}<span class="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">{badge[r.source]}</span>{/if}
        </span>
        <span class="truncate text-muted line-through decoration-redact/70">{r.value}</span>
      </div>
    {/each}
  </div>
  <p class="mt-3 font-mono text-xs text-accent">{removed.length} field{removed.length === 1 ? '' : 's'} removed · file is clean</p>
{/if}
