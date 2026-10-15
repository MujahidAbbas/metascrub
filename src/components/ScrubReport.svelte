<script lang="ts" module>
  import type { ScrubRemoval } from '../lib/types';

  export type Risk = 'identity' | 'software' | 'time' | 'about' | 'other';

  // Report labels from the engine (scrub.ts), plus raw Info keys an earlier
  // save can leave behind. Anything unknown is shown without a tag.
  const RISK: Record<string, Risk> = {
    Author: 'identity', 'Comment author': 'identity', Company: 'identity', Manager: 'identity',
    Creator: 'software', Producer: 'software', 'Creator tool': 'software',
    'App private data': 'software', 'XMP on pages/images': 'software',
    Created: 'time', Modified: 'time', 'Comment timestamps': 'time',
    CreationDate: 'time', ModDate: 'time', SourceModified: 'time',
    Title: 'about', Subject: 'about', Keywords: 'about',
  };
  const ORDER: Risk[] = ['identity', 'software', 'time', 'about', 'other'];

  export const riskOf = (field: string): Risk => RISK[field] ?? 'other';
  export const countRisk = (rows: ScrubRemoval[], risk: Risk) => rows.filter((r) => riskOf(r.field) === risk).length;
  export const sortByRisk = (rows: ScrubRemoval[]) =>
    [...rows].sort((a, b) => ORDER.indexOf(riskOf(a.field)) - ORDER.indexOf(riskOf(b.field)));

  export const TAG: Partial<Record<Risk, [string, string]>> = {
    identity: ['Identifies you', 'tag tag-identity'],
    software: ['Software', 'tag tag-software'],
    time: ['Timeline', 'tag'],
  };
</script>

<script lang="ts">
  import type { RemovalSource } from '../lib/types';

  interface Props {
    rows: ScrubRemoval[];
    /** 'found': what a scrub will remove. 'removed': what it did remove. */
    state: 'found' | 'removed';
  }
  let { rows, state }: Props = $props();

  const where: Partial<Record<RemovalSource, string>> = {
    xmp: 'xmp',
    comment: 'comment',
    revision: 'old save',
    embedded: 'embedded',
  };
  const sorted = $derived(sortByRisk(rows));
</script>

<ul class="divide-y divide-border overflow-hidden rounded-[10px] border border-border">
  {#each sorted as r, i (r.field + r.source + r.value)}
    {@const tag = TAG[riskOf(r.field)]}
    <!-- Phone: field and tag on one line, value under them. Wider: field, value, tag. -->
    <li class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 bg-surface px-4 py-3 sm:grid-cols-[minmax(0,13rem)_1fr_auto]">
      <div class="flex flex-wrap items-baseline gap-x-2.5">
        <span class="font-mono text-[13px] text-muted">{r.field}</span>
        {#if where[r.source]}<span class="font-mono text-[11px] text-faint">{where[r.source]}</span>{/if}
      </div>
      <span class="justify-self-end sm:order-3">{#if tag}<span class={tag[1]}>{tag[0]}</span>{/if}</span>
      <span
        class="col-span-2 font-mono text-[13px] [overflow-wrap:anywhere] sm:order-2 sm:col-span-1 {state === 'removed' ? 'strike text-fg' : 'text-fg'}"
        style={state === 'removed' ? `animation-delay:${0.15 + i * 0.07}s` : undefined}
      >{r.value}</span>
    </li>
  {/each}
</ul>
