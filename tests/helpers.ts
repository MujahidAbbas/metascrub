import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFStream, PDFString,
  decodePDFRawStream, type PDFObject,
} from 'pdf-lib';
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

/**
 * Simulates an incremental save that wrote a *new* Info object: the file's
 * current Info says "Jane Public", but the earlier one, still in the bytes,
 * says "John Doe".
 */
export async function makeIncrementalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const info = doc.context.lookup(doc.context.trailerInfo.Info) as PDFDict;
  info.set(PDFName.of('Author'), PDFString.of('John Doe'));
  const original = await doc.save({ useObjectStreams: false });
  const root = /\/Root (\d+ 0 R)/.exec(asLatin1(original))![1];
  const n = doc.context.largestObjectNumber + 1;
  const update = `\n${n} 0 obj\n<< /Author (Jane Public) >>\nendobj\n`
    + `trailer\n<< /Size ${n + 1} /Root ${root} /Info ${n} 0 R >>\nstartxref\n0\n%%EOF\n`;
  return new Uint8Array([...original, ...new TextEncoder().encode(update)]);
}

/**
 * A PDF carrying what a scrub must reach beyond the document Info/XMP: a
 * custom Info key, a comment with an author, a form field (whose /T is a
 * name, not an author), and XMP + PieceInfo on the page.
 */
export async function makeClutteredPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  doc.setAuthor('John Doe');
  const info = doc.context.lookup(doc.context.trailerInfo.Info) as PDFDict;
  info.set(PDFName.of('Company'), PDFString.of('Acme Holdings Inc.'));
  const ctx = doc.context;
  const note = ctx.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30],
    T: PDFString.of('Jane Reviewer'), Contents: PDFString.of('fix this'),
    M: PDFString.of('D:20240115093000Z'),
  });
  const field = ctx.obj({
    Type: 'Annot', Subtype: 'Widget', FT: 'Tx', Rect: [40, 40, 140, 60], T: PDFString.of('applicant_name'),
  });
  const fieldRef = ctx.register(field);
  page.node.set(PDFName.of('Annots'), ctx.obj([ctx.register(note), fieldRef]));
  doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [fieldRef] }));
  const pageXmp = ctx.register(ctx.stream(buildXmp({ author: 'Page Owner' }), { Type: 'Metadata', Subtype: 'XML' }));
  page.node.set(PDFName.of('Metadata'), pageXmp);
  page.node.set(PDFName.of('PieceInfo'), ctx.obj({ Illustrator: { Private: PDFString.of('Illustrator 28.1') } }));
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

/** Raw bytes as a latin1 string. */
export function asLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

/**
 * Every string a PDF holds, decoded, for "no fingerprint survives" assertions.
 * A raw-byte search is not enough: pdf-lib writes Info values as UTF-16 hex
 * and packs dictionaries into compressed object streams. This re-parses the
 * file and walks every object, unreferenced ones included.
 */
export async function deepText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const utf8 = new TextDecoder('utf-8');
  const out: string[] = [asLatin1(bytes)];
  const visit = (o: PDFObject | undefined): void => {
    if (o instanceof PDFString || o instanceof PDFHexString || o instanceof PDFName) out.push(o.decodeText());
    else if (o instanceof PDFDict) for (const [k, v] of o.entries()) { visit(k); visit(v); }
    else if (o instanceof PDFArray) o.asArray().forEach(visit);
    else if (o instanceof PDFStream) {
      visit(o.dict);
      let data = o.getContents();
      if (o instanceof PDFRawStream) try { data = decodePDFRawStream(o).decode(); } catch { /* keep raw */ }
      out.push(asLatin1(data), utf8.decode(data));
    }
  };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) visit(obj);
  visit(doc.context.trailerInfo.ID);
  return out.join('\n');
}
