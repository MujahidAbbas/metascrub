import { describe, it, expect } from 'vitest';
import { readMetadata, writeMetadata } from '../src/lib/pdf-meta';
import { scrub } from '../src/lib/scrub';
import { batchEdit, batchScrub } from '../src/lib/batch';
import { buildXmp, parseXmp } from '../src/lib/xmp';
import { makePdfWithMeta, makeBarePdf, defaultMeta, asLatin1 } from './helpers';

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
    // Old author must not survive anywhere in the bytes.
    expect(asLatin1(edited)).not.toContain('John Doe');
  });

  it('leaves untouched fields intact', async () => {
    const edited = await writeMetadata(await makePdfWithMeta(), { title: 'New Title' });
    const r = await readMetadata(edited);
    expect(r.info.author).toBe('John Doe');
    expect(r.info.subject).toBe('Internal financials');
  });
});

describe('scrub', () => {
  it('removes every field and leaves no fingerprint in raw bytes', async () => {
    const { bytes, removed } = await scrub(await makePdfWithMeta());
    const r = await readMetadata(bytes);
    expect(r.info.title).toBeUndefined();
    expect(r.info.author).toBeUndefined();
    expect(r.info.producer).toBeUndefined();
    expect(r.hasXmp).toBe(false);

    const raw = asLatin1(bytes);
    expect(raw).not.toContain('John Doe');
    expect(raw).not.toContain('Microsoft Word');
    expect(raw).not.toContain('Acme Template');

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
      expect(asLatin1(r.bytes!)).not.toContain('John Doe');
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
});
