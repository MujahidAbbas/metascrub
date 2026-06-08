/** Strip all metadata from a PDF and report exactly what was removed. */
import { PDFName } from 'pdf-lib';
import type { Metadata, ScrubRemoval, ScrubResult } from './types';
import { loadPdf, readMetadata } from './pdf-meta';
import { removeXmp } from './xmp';

const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Producer', 'Creator', 'CreationDate', 'ModDate'];

const FIELD_LABELS: Record<keyof Metadata, string> = {
  title: 'Title',
  author: 'Author',
  subject: 'Subject',
  keywords: 'Keywords',
  creator: 'Creator',
  producer: 'Producer',
  creatorTool: 'Creator tool',
  creationDate: 'Created',
  modificationDate: 'Modified',
};

function describe(m: Metadata, source: 'info' | 'xmp'): ScrubRemoval[] {
  const out: ScrubRemoval[] = [];
  for (const [key, value] of Object.entries(m) as [keyof Metadata, unknown][]) {
    if (value === undefined || value === null) continue;
    let str: string;
    if (Array.isArray(value)) str = value.join(', ');
    else if (value instanceof Date) str = value.toISOString().slice(0, 10);
    else str = String(value);
    if (!str) continue;
    out.push({ field: FIELD_LABELS[key], source, value: str });
  }
  return out;
}

/** Wipe the Info dictionary and XMP packet; return clean bytes + a report. */
export async function scrub(bytes: Uint8Array): Promise<ScrubResult> {
  const before = await readMetadata(bytes);
  const removed: ScrubRemoval[] = [
    ...describe(before.info, 'info'),
    // Only report XMP fields not already covered by the Info dict, to avoid dupes.
    ...describe(onlyNew(before.xmp, before.info), 'xmp'),
  ];

  const doc = await loadPdf(bytes);
  const infoRef = doc.context.trailerInfo.Info;
  if (infoRef) {
    const info = doc.context.lookup(infoRef) as any;
    if (info?.delete) INFO_KEYS.forEach((k) => info.delete(PDFName.of(k)));
  }
  removeXmp(doc);

  return { bytes: await doc.save(), removed };
}

function onlyNew(xmp: Metadata, info: Metadata): Metadata {
  const out: Metadata = {};
  for (const [k, v] of Object.entries(xmp) as [keyof Metadata, any][]) {
    if (v === undefined) continue;
    if (info[k] !== undefined) continue;
    (out as any)[k] = v;
  }
  return out;
}
