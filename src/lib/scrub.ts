/** Strip all metadata from a PDF and report exactly what was removed. */
import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument, type PDFObject } from 'pdf-lib';
import type { Metadata, RemovalSource, ScrubRemoval, ScrubResult } from './types';
import { dropUnreachable, loadPdf, readDoc, textOf, unreachableRefs } from './pdf-meta';
import { parseXmp, streamText } from './xmp';

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

const N = {
  Metadata: PDFName.of('Metadata'),
  PieceInfo: PDFName.of('PieceInfo'),
  Type: PDFName.of('Type'),
  Subtype: PDFName.of('Subtype'),
  Annot: PDFName.of('Annot'),
  Rect: PDFName.of('Rect'),
  Widget: PDFName.of('Widget'),
  T: PDFName.of('T'),
  M: PDFName.of('M'),
  CreationDate: PDFName.of('CreationDate'),
};

function describe(m: Metadata, source: RemovalSource): ScrubRemoval[] {
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

/** Name what earlier saves left behind: old Info dicts and XMP packets. */
function describeOrphans(doc: PDFDocument, refs: PDFRef[]): ScrubRemoval[] {
  const out: ScrubRemoval[] = [];
  let other = 0;
  for (const ref of refs) {
    const o = doc.context.lookup(ref);
    if (o instanceof PDFStream && o.dict.lookup(N.Type) === N.Metadata) {
      const xml = streamText(o);
      const rows = describe(xml ? parseXmp(xml) : {}, 'revision');
      if (rows.length) { out.push(...rows); continue; }
    } else if (o instanceof PDFDict && !o.has(N.Type) && !o.has(N.Subtype)
      && ['Title', 'Author', 'Creator', 'Producer'].some((k) => o.has(PDFName.of(k)))) {
      for (const [k, v] of o.entries()) {
        const value = textOf(doc.context.lookup(v)).trim();
        if (value) out.push({ field: k.decodeText(), source: 'revision', value });
      }
      continue;
    }
    other++;
  }
  if (other) out.push({ field: 'Unused objects', source: 'revision', value: `${other} dropped` });
  return out;
}

/** Remove /Metadata and /PieceInfo from a dict and its direct children. */
function stripPrivate(o: PDFObject, counts: { xmp: number; piece: number }, catalog: PDFDict): void {
  if (o instanceof PDFArray) { o.asArray().forEach((v) => stripPrivate(v, counts, catalog)); return; }
  const dict = o instanceof PDFStream ? o.dict : o instanceof PDFDict ? o : undefined;
  if (!dict) return;
  // The catalog's packet is the document XMP, already reported field by field.
  if (dict.delete(N.Metadata) && dict !== catalog) counts.xmp++;
  if (dict.delete(N.PieceInfo)) counts.piece++;
  for (const v of dict.values()) stripPrivate(v, counts, catalog);
}

/**
 * Remove comment authors and timestamps from every annotation in the file,
 * not just those in a page's /Annots: macOS PDFKit writes a second copy of a
 * note that is reachable only through its popup's /Parent. A Widget's /T is
 * its form field's name, not an author, so widgets keep it.
 */
function stripAnnotations(doc: PDFDocument): ScrubRemoval[] {
  const authors = new Set<string>();
  let dates = 0;
  const visit = (o: PDFObject): void => {
    if (o instanceof PDFArray) { o.asArray().forEach(visit); return; }
    if (!(o instanceof PDFDict)) return;
    const isAnnot = o.lookup(N.Type) === N.Annot || (o.has(N.Subtype) && o.has(N.Rect));
    if (isAnnot) {
      if (o.lookup(N.Subtype) !== N.Widget && o.has(N.T)) {
        const author = textOf(o.lookup(N.T)).trim();
        if (author) authors.add(author);
        o.delete(N.T);
      }
      if (o.delete(N.M)) dates++;
      if (o.delete(N.CreationDate)) dates++;
    }
    for (const v of o.values()) visit(v);
  };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) visit(obj);
  const out: ScrubRemoval[] = [...authors].map((value) => ({ field: 'Comment author', source: 'comment', value }));
  if (dates) out.push({ field: 'Comment timestamps', source: 'comment', value: `${dates} removed` });
  return out;
}

/** Wipe every kind of metadata MetaScrub knows about; return clean bytes + a report. */
export async function scrub(bytes: Uint8Array): Promise<ScrubResult> {
  const doc = await loadPdf(bytes);
  const before = readDoc(doc);
  const removed: ScrubRemoval[] = [
    ...describe(before.info, 'info'),
    ...before.infoExtra.map((e): ScrubRemoval => ({ field: e.key, source: 'info', value: e.value })),
    // Only report XMP fields not already covered by the Info dict, to avoid dupes.
    ...describe(onlyNew(before.xmp, before.info), 'xmp'),
    // Measured before anything below detaches the current Info dict and XMP.
    ...describeOrphans(doc, unreachableRefs(doc)),
  ];

  // 1. The whole Info dictionary, standard keys and extras alike.
  const infoRef = doc.context.trailerInfo.Info;
  if (infoRef instanceof PDFRef) doc.context.delete(infoRef);
  doc.context.trailerInfo.Info = undefined;

  // 2. XMP and app-private data wherever they hang: catalog, pages, images, fonts.
  const counts = { xmp: 0, piece: 0 };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) stripPrivate(obj, counts, doc.catalog);
  if (counts.xmp) removed.push({ field: 'XMP on pages/images', source: 'embedded', value: `${counts.xmp} packet(s)` });
  if (counts.piece) removed.push({ field: 'App private data', source: 'embedded', value: `${counts.piece} block(s)` });

  // 3. Comment authors and timestamps.
  removed.push(...stripAnnotations(doc));

  // 4. Everything now unreferenced: the detached XMP streams and earlier-save leftovers.
  dropUnreachable(doc);

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
