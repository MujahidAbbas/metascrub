/**
 * Batch processing: apply an edit or a scrub across many files.
 * Pure over an array of named byte buffers so it is fully unit-testable;
 * zipping the results for download is a thin browser-only wrapper (see note).
 */
import type { Metadata, ScrubRemoval } from './types';
import { writeMetadata } from './pdf-meta';
import { scrub } from './scrub';

export interface NamedPdf {
  name: string;
  bytes: Uint8Array;
}

export interface BatchItemResult {
  name: string;
  ok: boolean;
  bytes?: Uint8Array;
  removed?: ScrubRemoval[];
  error?: string;
}

async function runOne<T>(name: string, fn: () => Promise<T>): Promise<{ name: string } & ({ ok: true; value: T } | { ok: false; error: string })> {
  try {
    return { name, ok: true, value: await fn() };
  } catch (e) {
    return { name, ok: false, error: (e as Error).message };
  }
}

/** Apply the same metadata edit to every file. Failures are isolated per-file. */
export async function batchEdit(files: NamedPdf[], meta: Metadata): Promise<BatchItemResult[]> {
  const results = await Promise.all(
    files.map((f) => runOne(f.name, () => writeMetadata(f.bytes, meta)))
  );
  return results.map((r) =>
    r.ok ? { name: r.name, ok: true, bytes: r.value } : { name: r.name, ok: false, error: r.error }
  );
}

/** Scrub every file. Failures are isolated per-file. */
export async function batchScrub(files: NamedPdf[]): Promise<BatchItemResult[]> {
  const results = await Promise.all(files.map((f) => runOne(f.name, () => scrub(f.bytes))));
  return results.map((r) =>
    r.ok
      ? { name: r.name, ok: true, bytes: r.value.bytes, removed: r.value.removed }
      : { name: r.name, ok: false, error: r.error }
  );
}

/**
 * Browser-only: zip successful results for a single download.
 * Uses `client-zip` (added in Phase 4). Kept out of the testable core because
 * it depends on browser streaming APIs.
 *
 * import { downloadZip } from 'client-zip';
 * export async function zipResults(results: BatchItemResult[]): Promise<Blob> {
 *   const entries = results.filter(r => r.ok && r.bytes)
 *     .map(r => ({ name: r.name, input: r.bytes! }));
 *   return downloadZip(entries).blob();
 * }
 */
