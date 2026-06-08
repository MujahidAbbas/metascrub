import { PDFDocument, PDFName } from 'pdf-lib';
import { buildXmp, setXmp } from '../src/lib/xmp';
import type { Metadata } from '../src/lib/types';

/** A PDF carrying both Info-dict metadata and a matching XMP packet. */
export async function makePdfWithMeta(m: Metadata = defaultMeta()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]).drawText('sample', { x: 20, y: 260, size: 14 });
  if (m.title) doc.setTitle(m.title);
  if (m.author) doc.setAuthor(m.author);
  if (m.subject) doc.setSubject(m.subject);
  if (m.keywords) doc.setKeywords(m.keywords);
  if (m.creator) doc.setCreator(m.creator);
  if (m.producer) doc.setProducer(m.producer);
  if (m.creationDate) doc.setCreationDate(m.creationDate);
  setXmp(doc, buildXmp(m));
  return doc.save();
}

/**
 * A PDF with no metadata at all. Note: pdf-lib's create() auto-stamps its own
 * Producer/Creator/dates, so we strip them to get a genuinely bare fixture.
 */
export async function makeBarePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const infoRef = doc.context.trailerInfo.Info;
  if (infoRef) {
    const info = doc.context.lookup(infoRef) as any;
    ['Title', 'Author', 'Subject', 'Keywords', 'Producer', 'Creator', 'CreationDate', 'ModDate']
      .forEach((k) => info?.delete?.(PDFName.of(k)));
  }
  return doc.save();
}

export function defaultMeta(): Metadata {
  return {
    title: 'Confidential Q3 Report',
    author: 'John Doe',
    subject: 'Internal financials',
    keywords: ['secret', 'finance', 'draft'],
    creator: 'Acme Template v2',
    producer: 'Microsoft Word 365',
    creatorTool: 'Microsoft Word 365',
    creationDate: new Date('2024-01-15T09:30:00Z'),
  };
}

/** Raw bytes as a latin1 string, for "no fingerprint survives" assertions. */
export function asLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}
