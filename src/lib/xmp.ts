/**
 * XMP packet read/write. pdf-lib has no first-class XMP API, so we operate on
 * the catalog's /Metadata stream directly (proven in the Phase 0 spike).
 */
import { PDFDocument, PDFName, decodePDFRawStream, type PDFRef } from 'pdf-lib';
import type { Metadata } from './types';

const XMP_NS = {
  dc: 'http://purl.org/dc/elements/1.1/',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  pdf: 'http://ns.adobe.com/pdf/1.3/',
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Build a full XMP packet from metadata fields. Omits empty fields. */
export function buildXmp(m: Metadata): string {
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

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="${XMP_NS.dc}"
        xmlns:xmp="${XMP_NS.xmp}"
        xmlns:pdf="${XMP_NS.pdf}">
${lines.join('\n')}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Read the raw XMP XML string from a document, or null if absent. */
export function getXmpString(doc: PDFDocument): string | null {
  const ref = doc.catalog.get(PDFName.of('Metadata'));
  if (!ref) return null;
  const stream = doc.context.lookup(ref);
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

const firstMatch = (xml: string, re: RegExp): string | undefined => {
  const m = re.exec(xml);
  return m?.[1]?.trim() || undefined;
};

const unesc = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

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

/** Write/replace the XMP packet, deleting any orphaned prior stream (R2). */
export function setXmp(doc: PDFDocument, xml: string): void {
  const oldRef = doc.catalog.get(PDFName.of('Metadata')) as PDFRef | undefined;
  if (oldRef) doc.context.delete(oldRef);
  const stream = doc.context.stream(xml, { Type: 'Metadata', Subtype: 'XML' });
  const ref = doc.context.register(stream);
  doc.catalog.set(PDFName.of('Metadata'), ref);
}

/** Remove the XMP packet entirely, including the orphaned indirect object. */
export function removeXmp(doc: PDFDocument): void {
  const ref = doc.catalog.get(PDFName.of('Metadata')) as PDFRef | undefined;
  doc.catalog.delete(PDFName.of('Metadata'));
  if (ref) doc.context.delete(ref);
}
