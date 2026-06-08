/** Read and write PDF metadata (Info dictionary + XMP) via pdf-lib. */
import { PDFDocument } from 'pdf-lib';
import type { Metadata, ReadResult } from './types';
import { EncryptedPdfError, InvalidPdfError } from './types';
import { buildXmp, getXmpString, parseXmp, setXmp } from './xmp';

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

/** XMP takes precedence over the Info dict for overlapping text fields. */
function merge(info: Metadata, xmp: Metadata): Metadata {
  return {
    ...info,
    ...Object.fromEntries(Object.entries(xmp).filter(([, v]) => v !== undefined)),
  };
}

export async function readMetadata(bytes: Uint8Array): Promise<ReadResult> {
  const doc = await loadPdf(bytes);
  const info = readInfo(doc);
  const xmpString = getXmpString(doc);
  const xmp = xmpString ? parseXmp(xmpString) : {};
  return { info, xmp, metadata: merge(info, xmp), hasXmp: !!xmpString };
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
  applyInfo(doc, m);
  // Rebuild XMP from the merged current view so both sources agree.
  const current = await readMetadata(bytes);
  setXmp(doc, buildXmp({ ...current.metadata, ...m }));
  return doc.save();
}
