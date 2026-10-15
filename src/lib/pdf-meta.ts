/** Read and write PDF metadata (Info dictionary + XMP) via pdf-lib. */
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFStream, PDFString,
  type PDFObject,
} from 'pdf-lib';
import type { InfoEntry, Metadata, ReadResult } from './types';
import { EncryptedPdfError, InvalidPdfError } from './types';
import { buildXmp, conformanceProps, getXmpString, parseXmp, setXmp } from './xmp';

/** The standard Info-dictionary keys; anything else is reported as an extra. */
export const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];

/** Load a PDF, mapping pdf-lib failures to friendly typed errors (R4). */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    // updateMetadata:false stops pdf-lib re-stamping Producer/ModDate on save.
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    const name = (err as Error)?.name ?? '';
    const msg = (err as Error)?.message ?? '';
    if (name.includes('Encrypted') || /encrypt/i.test(msg)) throw new EncryptedPdfError();
    throw new InvalidPdfError(msg);
  }
}

/** Human-readable text for a PDF value: strings decoded, names unescaped. */
export function textOf(o: PDFObject | undefined): string {
  if (o instanceof PDFString || o instanceof PDFHexString || o instanceof PDFName) return o.decodeText();
  return o ? o.toString() : '';
}

function readInfo(doc: PDFDocument): Metadata {
  const out: Metadata = {};
  const title = doc.getTitle();
  const author = doc.getAuthor();
  const subject = doc.getSubject();
  const keywords = doc.getKeywords();
  const creator = doc.getCreator();
  const producer = doc.getProducer();
  const creationDate = doc.getCreationDate();
  const modificationDate = doc.getModificationDate();

  if (title) out.title = title;
  if (author) out.author = author;
  if (subject) out.subject = subject;
  if (keywords) {
    const list = keywords.split(/[,;]\s*|\s{2,}/).map((k) => k.trim()).filter(Boolean);
    if (list.length) out.keywords = list;
  }
  if (creator) out.creator = creator;
  if (producer) out.producer = producer;
  if (creationDate) out.creationDate = creationDate;
  if (modificationDate) out.modificationDate = modificationDate;
  return out;
}

function readInfoExtra(doc: PDFDocument): InfoEntry[] {
  const ref = doc.context.trailerInfo.Info;
  const info = ref ? doc.context.lookup(ref) : undefined;
  if (!(info instanceof PDFDict)) return [];
  const out: InfoEntry[] = [];
  for (const [k, v] of info.entries()) {
    const key = k.decodeText();
    if (INFO_KEYS.includes(key)) continue;
    const value = textOf(doc.context.lookup(v)).trim();
    if (value) out.push({ key, value });
  }
  return out;
}

/** XMP takes precedence over the Info dict for overlapping text fields. */
function merge(info: Metadata, xmp: Metadata): Metadata {
  return {
    ...info,
    ...Object.fromEntries(Object.entries(xmp).filter(([, v]) => v !== undefined)),
  };
}

export function readDoc(doc: PDFDocument): ReadResult {
  const info = readInfo(doc);
  const xmpString = getXmpString(doc);
  const xmp = xmpString ? parseXmp(xmpString) : {};
  return { info, infoExtra: readInfoExtra(doc), xmp, metadata: merge(info, xmp), hasXmp: !!xmpString };
}

export async function readMetadata(bytes: Uint8Array): Promise<ReadResult> {
  return readDoc(await loadPdf(bytes));
}

/**
 * Indirect objects nothing in the document points to any more. pdf-lib keeps
 * and re-saves them, so an Info dict or XMP packet from an earlier save
 * survives in the output unless it is dropped.
 */
export function unreachableRefs(doc: PDFDocument): PDFRef[] {
  const { context } = doc;
  const seen = new Set<PDFRef>();
  const stack: (PDFObject | undefined)[] = [
    context.trailerInfo.Root, context.trailerInfo.Info, context.trailerInfo.Encrypt,
  ];
  while (stack.length) {
    const o = stack.pop();
    if (o instanceof PDFRef) {
      if (!seen.has(o)) { seen.add(o); stack.push(context.lookup(o)); }
    } else if (o instanceof PDFDict) {
      for (const v of o.values()) stack.push(v);
    } else if (o instanceof PDFArray) {
      for (const v of o.asArray()) stack.push(v);
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }
  return context.enumerateIndirectObjects().map(([ref]) => ref).filter((ref) => !seen.has(ref));
}

export function dropUnreachable(doc: PDFDocument): void {
  for (const ref of unreachableRefs(doc)) doc.context.delete(ref);
}

function applyInfo(doc: PDFDocument, m: Metadata): void {
  if (m.title !== undefined) doc.setTitle(m.title);
  if (m.author !== undefined) doc.setAuthor(m.author);
  if (m.subject !== undefined) doc.setSubject(m.subject);
  if (m.keywords !== undefined) doc.setKeywords(m.keywords);
  if (m.creator !== undefined) doc.setCreator(m.creator);
  if (m.producer !== undefined) doc.setProducer(m.producer);
  if (m.creationDate !== undefined) doc.setCreationDate(m.creationDate);
  if (m.modificationDate !== undefined) doc.setModificationDate(m.modificationDate);
}

/**
 * Write metadata to both the Info dict and XMP (kept in sync, R3), returning
 * new PDF bytes. Only provided fields are touched.
 */
export async function writeMetadata(bytes: Uint8Array, m: Metadata): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  // Snapshot before editing so the rebuilt XMP starts from the file's current view.
  const current = readDoc(doc);
  const keep = conformanceProps(getXmpString(doc) ?? '');
  applyInfo(doc, m);
  const next: Metadata = { ...current.metadata, ...m };
  // Info /Creator and XMP CreatorTool are one field (ISO 32000-1 §14.3.2).
  if (m.creator !== undefined) next.creatorTool = m.creator;
  setXmp(doc, buildXmp(next, keep));
  // An earlier save's Info dict would otherwise still carry the old values.
  dropUnreachable(doc);
  return doc.save();
}
