/**
 * XMP packet read/write. pdf-lib has no first-class XMP API, so we operate on
 * the catalog's /Metadata stream directly (proven in the Phase 0 spike).
 */
import { PDFDocument, PDFName, decodePDFRawStream, type PDFObject, type PDFRef } from 'pdf-lib';
import type { Metadata } from './types';

const XMP_NS = {
  dc: 'http://purl.org/dc/elements/1.1/',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  pdf: 'http://ns.adobe.com/pdf/1.3/',
} as const;

const CONFORMANCE_NS = {
  pdfaid: 'http://www.aiim.org/pdfa/ns/id/',
  pdfuaid: 'http://www.aiim.org/pdfua/ns/id/',
} as const;

/** A PDF/A or PDF/UA identification property, e.g. pdfaid:part = 2. */
export interface ConformanceProp {
  prefix: keyof typeof CONFORMANCE_NS;
  name: string;
  value: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const validDate = (d: Date | undefined): d is Date => !!d && !isNaN(d.getTime());

/**
 * Build a full XMP packet from metadata fields. Omits empty fields. `keep`
 * carries PDF/A / PDF/UA identification over from the packet being replaced,
 * so an edited file still declares its conformance.
 */
export function buildXmp(m: Metadata, keep: ConformanceProp[] = []): string {
  const lines: string[] = [];
  if (m.title) {
    lines.push(`      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(m.title)}</rdf:li></rdf:Alt></dc:title>`);
  }
  if (m.author) {
    lines.push(`      <dc:creator><rdf:Seq><rdf:li>${esc(m.author)}</rdf:li></rdf:Seq></dc:creator>`);
  }
  if (m.subject) {
    lines.push(`      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(m.subject)}</rdf:li></rdf:Alt></dc:description>`);
  }
  if (m.keywords && m.keywords.length) {
    const items = m.keywords.map((k) => `<rdf:li>${esc(k)}</rdf:li>`).join('');
    lines.push(`      <dc:subject><rdf:Bag>${items}</rdf:Bag></dc:subject>`);
  }
  if (m.creatorTool) {
    lines.push(`      <xmp:CreatorTool>${esc(m.creatorTool)}</xmp:CreatorTool>`);
  }
  if (m.producer) {
    lines.push(`      <pdf:Producer>${esc(m.producer)}</pdf:Producer>`);
  }
  // XMP counterparts of the Info dict's Keywords and dates (ISO 32000-1 §14.3.2).
  // pdf-lib writes Info Keywords space-joined, so mirror that exactly.
  if (m.keywords && m.keywords.length) {
    lines.push(`      <pdf:Keywords>${esc(m.keywords.join(' '))}</pdf:Keywords>`);
  }
  if (validDate(m.creationDate)) {
    lines.push(`      <xmp:CreateDate>${m.creationDate.toISOString()}</xmp:CreateDate>`);
  }
  if (validDate(m.modificationDate)) {
    lines.push(`      <xmp:ModifyDate>${m.modificationDate.toISOString()}</xmp:ModifyDate>`);
  }
  for (const p of keep) {
    lines.push(`      <${p.prefix}:${p.name}>${esc(p.value)}</${p.prefix}:${p.name}>`);
  }
  const extraNs = [...new Set(keep.map((p) => p.prefix))]
    .map((prefix) => `\n        xmlns:${prefix}="${CONFORMANCE_NS[prefix]}"`)
    .join('');

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="${XMP_NS.dc}"
        xmlns:xmp="${XMP_NS.xmp}"
        xmlns:pdf="${XMP_NS.pdf}"${extraNs}>
${lines.join('\n')}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** A stream's decoded contents as UTF-8 text, or null if it can't be read. */
export function streamText(stream: PDFObject | undefined): string | null {
  if (!stream) return null;
  const decoder = new TextDecoder('utf-8');
  try {
    return decoder.decode(decodePDFRawStream(stream as any).decode());
  } catch {
    try {
      return decoder.decode((stream as any).getContents());
    } catch {
      return null;
    }
  }
}

/** Read the raw XMP XML string from a document, or null if absent. */
export function getXmpString(doc: PDFDocument): string | null {
  const ref = doc.catalog.get(PDFName.of('Metadata'));
  if (!ref) return null;
  return streamText(doc.context.lookup(ref));
}

const firstMatch = (xml: string, re: RegExp): string | undefined => {
  const m = re.exec(xml);
  return m?.[1]?.trim() || undefined;
};

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

/** Decode XML entity and character references in one pass, so "&amp;lt;" stays "&lt;". */
const unesc = (s: string): string =>
  s.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(lt|gt|quot|apos|amp));/g, (ref, hex, dec, name) => {
    if (name) return ENTITIES[name]!;
    const cp = hex ? parseInt(hex, 16) : Number(dec);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : ref;
  });

/** Parse the fields we care about out of an XMP XML string. */
export function parseXmp(xml: string): Metadata {
  const out: Metadata = {};
  const title = firstMatch(xml, /<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
  const author = firstMatch(xml, /<dc:creator>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
  const subject = firstMatch(xml, /<dc:description>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
  const creatorTool = firstMatch(xml, /<xmp:CreatorTool>([\s\S]*?)<\/xmp:CreatorTool>/);
  const producer = firstMatch(xml, /<pdf:Producer>([\s\S]*?)<\/pdf:Producer>/);

  if (title) out.title = unesc(title);
  if (author) out.author = unesc(author);
  if (subject) out.subject = unesc(subject);
  if (creatorTool) out.creatorTool = unesc(creatorTool);
  if (producer) out.producer = unesc(producer);

  const subjectBlock = /<dc:subject>([\s\S]*?)<\/dc:subject>/.exec(xml)?.[1];
  if (subjectBlock) {
    const kws = [...subjectBlock.matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g)]
      .map((m) => unesc((m[1] ?? '').trim()))
      .filter(Boolean);
    if (kws.length) out.keywords = kws;
  }
  return out;
}

/** PDF/A and PDF/UA identification in a packet, in element or attribute form. */
export function conformanceProps(xml: string): ConformanceProp[] {
  const out = new Map<string, ConformanceProp>();
  const re = /<(pdfaid|pdfuaid):(\w+)>([^<]*)<\/\1:\2>|\s(pdfaid|pdfuaid):(\w+)="([^"]*)"/g;
  for (const m of xml.matchAll(re)) {
    const prefix = (m[1] ?? m[4]) as ConformanceProp['prefix'];
    const name = (m[2] ?? m[5])!;
    const value = unesc((m[3] ?? m[6] ?? '').trim());
    if (value) out.set(`${prefix}:${name}`, { prefix, name, value });
  }
  return [...out.values()];
}

/** Write/replace the XMP packet, deleting any orphaned prior stream (R2). */
export function setXmp(doc: PDFDocument, xml: string): void {
  const oldRef = doc.catalog.get(PDFName.of('Metadata')) as PDFRef | undefined;
  if (oldRef) doc.context.delete(oldRef);
  // Encode as UTF-8 here: given a string, pdf-lib keeps one byte per char, which mangles non-ASCII text.
  const stream = doc.context.stream(new TextEncoder().encode(xml), { Type: 'Metadata', Subtype: 'XML' });
  const ref = doc.context.register(stream);
  doc.catalog.set(PDFName.of('Metadata'), ref);
}
