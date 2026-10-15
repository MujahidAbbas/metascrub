import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { readMetadata, writeMetadata } from '../src/lib/pdf-meta';
import { scrub } from '../src/lib/scrub';
import { batchEdit, batchScrub } from '../src/lib/batch';
import { buildXmp, parseXmp, setXmp } from '../src/lib/xmp';
import {
  makePdfWithMeta, makeBarePdf, makeIncrementalPdf, makeClutteredPdf, defaultMeta, deepText,
} from './helpers';

/** Real-generator output: Chrome's Skia writer, and macOS PDFKit (Preview) with a sticky note. */
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe('readMetadata', () => {
  it('reads Info dict fields', async () => {
    const r = await readMetadata(await makePdfWithMeta());
    expect(r.info.title).toBe('Confidential Q3 Report');
    expect(r.info.author).toBe('John Doe');
    expect(r.info.producer).toBe('Microsoft Word 365');
    // Keywords have no standard delimiter in the Info dict; the authoritative
    // array comes from the XMP dc:subject Bag, surfaced via the merged view.
    expect(r.metadata.keywords).toEqual(['secret', 'finance', 'draft']);
  });

  it('reads the XMP packet', async () => {
    const r = await readMetadata(await makePdfWithMeta());
    expect(r.hasXmp).toBe(true);
    expect(r.xmp.author).toBe('John Doe');
    expect(r.xmp.creatorTool).toBe('Microsoft Word 365');
  });

  it('handles a bare PDF with no metadata', async () => {
    const r = await readMetadata(await makeBarePdf());
    expect(r.hasXmp).toBe(false);
    expect(r.info.title).toBeUndefined();
    expect(r.metadata.author).toBeUndefined();
  });

  it('surfaces non-standard Info keys', async () => {
    const r = await readMetadata(await makeClutteredPdf());
    expect(r.infoExtra).toContainEqual({ key: 'Company', value: 'Acme Holdings Inc.' });
  });
});

describe('writeMetadata', () => {
  it('persists edits to both Info dict and XMP', async () => {
    const edited = await writeMetadata(await makePdfWithMeta(), {
      title: 'Public Whitepaper',
      author: 'Jane Smith',
    });
    const r = await readMetadata(edited);
    expect(r.info.title).toBe('Public Whitepaper');
    expect(r.info.author).toBe('Jane Smith');
    expect(r.xmp.author).toBe('Jane Smith');
    // Old author must not survive anywhere in the file.
    expect(await deepText(edited)).not.toContain('John Doe');
  });

  it('leaves untouched fields intact', async () => {
    const edited = await writeMetadata(await makePdfWithMeta(), { title: 'New Title' });
    const r = await readMetadata(edited);
    expect(r.info.author).toBe('John Doe');
    expect(r.info.subject).toBe('Internal financials');
  });

  it('keeps XMP CreatorTool in step with an edited Creator', async () => {
    const edited = await writeMetadata(await makePdfWithMeta(), { creator: 'Neutral' });
    const r = await readMetadata(edited);
    expect(r.info.creator).toBe('Neutral');
    expect(r.xmp.creatorTool).toBe('Neutral');
    expect(await deepText(edited)).not.toContain('Acme Template');
  });

  it('keeps PDF/A identification and mirrors Keywords and dates into XMP', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setKeywords(['alpha', 'beta']);
    doc.setCreationDate(new Date('2024-01-15T09:30:00Z'));
    setXmp(doc, buildXmp({ title: 'T' }).replace('<rdf:Description rdf:about=""',
      '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="2" pdfaid:conformance="B"'));
    const edited = await writeMetadata(await doc.save(), { title: 'New' });
    const xml = await deepText(edited);
    expect(xml).toContain('<pdfaid:part>2</pdfaid:part>');
    expect(xml).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(xml).toContain('<pdf:Keywords>alpha beta</pdf:Keywords>');
    expect(xml).toContain('<xmp:CreateDate>2024-01-15T09:30:00.000Z</xmp:CreateDate>');
  });

  it('writes non-ASCII text to XMP as UTF-8', async () => {
    const m = { title: 'Résumé – José Müller', author: 'مجاہد عباس', subject: '日本語 🚀', keywords: ['café', 'naïve'] };
    const out = await writeMetadata(await makeBarePdf(), m);
    expect((await readMetadata(out)).xmp).toMatchObject(m);
  });

  it('drops an earlier save\'s Info dict', async () => {
    const edited = await writeMetadata(await makeIncrementalPdf(), { title: 'X' });
    expect(await deepText(edited)).not.toContain('John Doe');
  });
});

describe('scrub', () => {
  it('removes every field and leaves no fingerprint anywhere in the file', async () => {
    const { bytes, removed } = await scrub(await makePdfWithMeta());
    const r = await readMetadata(bytes);
    expect(r.info.title).toBeUndefined();
    expect(r.info.author).toBeUndefined();
    expect(r.info.producer).toBeUndefined();
    expect(r.hasXmp).toBe(false);

    const all = await deepText(bytes);
    expect(all).not.toContain('John Doe');
    expect(all).not.toContain('Microsoft Word');
    expect(all).not.toContain('Acme Template');
    expect(all).not.toContain('Confidential Q3');

    // Report should list what was there.
    const fields = removed.map((x) => x.field);
    expect(fields).toContain('Author');
    expect(fields).toContain('Producer');
    expect(removed.find((x) => x.field === 'Author')?.value).toBe('John Doe');
  });

  it('is a no-op-safe on a bare PDF', async () => {
    const { removed } = await scrub(await makeBarePdf());
    expect(removed).toEqual([]);
  });

  it('removes and reports non-standard Info keys', async () => {
    const { bytes, removed } = await scrub(await makeClutteredPdf());
    expect(await deepText(bytes)).not.toContain('Acme Holdings');
    expect(removed).toContainEqual({ field: 'Company', source: 'info', value: 'Acme Holdings Inc.' });
  });

  it('removes an earlier save\'s Info dict and names what was in it', async () => {
    const { bytes, removed } = await scrub(await makeIncrementalPdf());
    expect(await deepText(bytes)).not.toContain('John Doe');
    expect(removed).toContainEqual({ field: 'Author', source: 'info', value: 'Jane Public' });
    expect(removed).toContainEqual({ field: 'Author', source: 'revision', value: 'John Doe' });
  });

  it('strips comment authors and timestamps but keeps form field names', async () => {
    const { bytes, removed } = await scrub(await makeClutteredPdf());
    const all = await deepText(bytes);
    expect(all).not.toContain('Jane Reviewer');
    expect(all).not.toContain('D:20240115093000Z');
    expect(all).toContain('applicant_name');
    expect(all).toContain('fix this'); // the comment itself is content, not metadata
    expect(removed).toContainEqual({ field: 'Comment author', source: 'comment', value: 'Jane Reviewer' });
  });

  it('removes XMP and app-private data on pages', async () => {
    const { bytes, removed } = await scrub(await makeClutteredPdf());
    const all = await deepText(bytes);
    expect(all).not.toContain('Page Owner');
    expect(all).not.toContain('Illustrator 28.1');
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPage(0).node as PDFDict;
    expect(page.has(PDFName.of('Metadata'))).toBe(false);
    expect(page.has(PDFName.of('PieceInfo'))).toBe(false);
    expect(removed.map((r) => r.source)).toContain('embedded');
  });

  it('cleans a real Chrome-printed PDF', async () => {
    const { bytes } = await scrub(fixture('chrome.pdf'));
    const all = await deepText(bytes);
    for (const s of ['HeadlessChrome', 'Skia/PDF', 'Fixture Quarterly Report']) expect(all).not.toContain(s);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('cleans a real PDF annotated with macOS PDFKit (Preview)', async () => {
    const { bytes, removed } = await scrub(fixture('preview-annotated.pdf'));
    const all = await deepText(bytes);
    for (const s of ['Jane Fixture', 'Jane Reviewer', 'Quartz PDFContext', 'Fixture Writer']) expect(all).not.toContain(s);
    expect(all).toContain('Please fix this number');
    expect(removed).toContainEqual({ field: 'Comment author', source: 'comment', value: 'Jane Reviewer' });
  });
});

describe('batch', () => {
  it('edits multiple files, isolating failures', async () => {
    const files = [
      { name: 'a.pdf', bytes: await makePdfWithMeta() },
      { name: 'b.pdf', bytes: await makePdfWithMeta({ ...defaultMeta(), author: 'Bob' }) },
      { name: 'bad.pdf', bytes: new Uint8Array([1, 2, 3]) }, // not a PDF
    ];
    const out = await batchEdit(files, { author: 'Redacted' });
    expect(out.find((r) => r.name === 'a.pdf')?.ok).toBe(true);
    expect(out.find((r) => r.name === 'bad.pdf')?.ok).toBe(false);

    const a = out.find((r) => r.name === 'a.pdf')!;
    const r = await readMetadata(a.bytes!);
    expect(r.info.author).toBe('Redacted');
  });

  it('scrubs multiple files', async () => {
    const files = [
      { name: 'a.pdf', bytes: await makePdfWithMeta() },
      { name: 'b.pdf', bytes: await makePdfWithMeta() },
    ];
    const out = await batchScrub(files);
    expect(out.every((r) => r.ok)).toBe(true);
    for (const r of out) {
      expect(await deepText(r.bytes!)).not.toContain('John Doe');
    }
  });
});

describe('xmp helpers', () => {
  it('round-trips fields through build + parse with escaping', async () => {
    const xml = buildXmp({ title: 'A & B <ok>', author: 'O’Hara', keywords: ['x', 'y'] });
    const parsed = parseXmp(xml);
    expect(parsed.title).toBe('A & B <ok>');
    expect(parsed.author).toBe('O’Hara');
    expect(parsed.keywords).toEqual(['x', 'y']);
  });

  it('decodes character and entity references in XMP values', () => {
    const xml = '<dc:creator><rdf:Seq><rdf:li>Jos&#xE9; &quot;Pepe&quot; O&#8217;Hara &apos;x&apos; &amp;lt;</rdf:li></rdf:Seq></dc:creator>';
    expect(parseXmp(xml).author).toBe('José "Pepe" O’Hara \'x\' &lt;');
  });
});

describe('errors', () => {
  it('rejects a non-PDF with a plain message, no parser detail', async () => {
    await expect(readMetadata(new TextEncoder().encode('not a pdf'))).rejects.toThrow(/^This file does not look like a valid PDF\.$/);
  });
});
