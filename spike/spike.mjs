// Phase 0 spike — prove the PDF engine before building any UI.
// Validates: read Info dict, write Info dict, read+write XMP packet,
// and that a scrub leaves NO fingerprint after reload.
import {
  PDFDocument,
  PDFName,
  decodePDFRawStream,
} from 'pdf-lib';

const XMP_NS = 'http://ns.adobe.com/xap/1.0/';

// ---- XMP helpers (the make-or-break R1 logic) ---------------------------

function buildXmp({ title = '', author = '', subject = '', creatorTool = '' }) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmp="${XMP_NS}">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${author}</rdf:li></rdf:Seq></dc:creator>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${subject}</rdf:li></rdf:Alt></dc:description>
      <xmp:CreatorTool>${creatorTool}</xmp:CreatorTool>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function setXmp(pdfDoc, xmp) {
  // Drop any existing Metadata stream object so it isn't left orphaned in the file.
  const oldRef = pdfDoc.catalog.get(PDFName.of('Metadata'));
  if (oldRef) pdfDoc.context.delete(oldRef);
  const stream = pdfDoc.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' });
  const ref = pdfDoc.context.register(stream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), ref);
}

function getXmp(pdfDoc) {
  const ref = pdfDoc.catalog.get(PDFName.of('Metadata'));
  if (!ref) return null;
  const stream = pdfDoc.context.lookup(ref);
  if (!stream) return null;
  try {
    const bytes = decodePDFRawStream(stream).decode();
    return Buffer.from(bytes).toString('utf8');
  } catch {
    // Uncompressed raw stream
    return Buffer.from(stream.getContents()).toString('utf8');
  }
}

function removeXmp(pdfDoc) {
  const ref = pdfDoc.catalog.get(PDFName.of('Metadata'));
  pdfDoc.catalog.delete(PDFName.of('Metadata'));
  // Deleting the reference isn't enough — the orphaned indirect object would
  // still be serialized (and still leak fingerprints). Remove it from context.
  if (ref) pdfDoc.context.delete(ref);
}

function clearInfoDict(pdfDoc) {
  const infoRef = pdfDoc.context.trailerInfo.Info;
  if (!infoRef) return;
  const info = pdfDoc.context.lookup(infoRef);
  if (!info || !info.delete) return;
  ['Title', 'Author', 'Subject', 'Keywords', 'Producer', 'Creator', 'CreationDate', 'ModDate']
    .forEach((k) => info.delete(PDFName.of(k)));
}

// ---- Test harness -------------------------------------------------------

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
}

async function makeSamplePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]).drawText('MetaScrub spike sample', { x: 40, y: 350, size: 18 });
  doc.setTitle('Confidential Q3 Report');
  doc.setAuthor('John Doe');
  doc.setSubject('Internal financials');
  doc.setKeywords(['secret', 'finance', 'draft']);
  doc.setProducer('Microsoft Word 365');
  doc.setCreator('Acme Corp Template v2');
  doc.setCreationDate(new Date('2024-01-15T09:30:00Z'));
  setXmp(doc, buildXmp({
    title: 'Confidential Q3 Report',
    author: 'John Doe',
    subject: 'Internal financials',
    creatorTool: 'Microsoft Word 365',
  }));
  return doc.save();
}

async function main() {
  console.log('\n=== Phase 0 Spike: pdf-lib metadata engine ===\n');

  // --- TEST 1: read Info dict ---
  console.log('TEST 1 — read Info dictionary');
  const sample = await makeSamplePdf();
  let doc = await PDFDocument.load(sample, { updateMetadata: false });
  check('Title reads back', doc.getTitle() === 'Confidential Q3 Report', `got "${doc.getTitle()}"`);
  check('Author reads back', doc.getAuthor() === 'John Doe', `got "${doc.getAuthor()}"`);
  check('Producer reads back', doc.getProducer() === 'Microsoft Word 365', `got "${doc.getProducer()}"`);
  check('Keywords read back', doc.getKeywords() === 'secret, finance, draft' || String(doc.getKeywords()).includes('secret'), `got "${doc.getKeywords()}"`);

  // --- TEST 2: read XMP (R1 read) ---
  console.log('\nTEST 2 — read XMP packet');
  const xmpIn = getXmp(doc);
  check('XMP packet present', !!xmpIn && xmpIn.includes('x:xmpmeta'));
  check('XMP contains author (dc:creator)', !!xmpIn && xmpIn.includes('John Doe'));
  check('XMP contains CreatorTool fingerprint', !!xmpIn && xmpIn.includes('Microsoft Word 365'));

  // --- TEST 3: write Info dict + write XMP (R1 write) ---
  console.log('\nTEST 3 — write Info dict + write XMP, round-trip');
  doc.setTitle('Public Whitepaper');
  doc.setAuthor('Jane Smith');
  setXmp(doc, buildXmp({ title: 'Public Whitepaper', author: 'Jane Smith', subject: 'Public', creatorTool: 'MetaScrub' }));
  const edited = await doc.save();
  let reDoc = await PDFDocument.load(edited, { updateMetadata: false });
  check('Edited Title persists', reDoc.getTitle() === 'Public Whitepaper', `got "${reDoc.getTitle()}"`);
  check('Edited Author persists', reDoc.getAuthor() === 'Jane Smith', `got "${reDoc.getAuthor()}"`);
  const xmpEdited = getXmp(reDoc);
  check('Edited XMP persists (new author)', !!xmpEdited && xmpEdited.includes('Jane Smith'));
  check('Edited XMP dropped old author', !!xmpEdited && !xmpEdited.includes('John Doe'));

  // --- TEST 4: SCRUB leaves no fingerprint (R1 + R2) ---
  console.log('\nTEST 4 — scrub leaves NO fingerprint after reload');
  let scrubDoc = await PDFDocument.load(sample, { updateMetadata: false });
  clearInfoDict(scrubDoc);
  removeXmp(scrubDoc);
  const scrubbed = await scrubDoc.save(); // updateMetadata not re-applied because loaded with false
  let checkDoc = await PDFDocument.load(scrubbed, { updateMetadata: false });
  check('Title gone', !checkDoc.getTitle(), `got "${checkDoc.getTitle()}"`);
  check('Author gone', !checkDoc.getAuthor(), `got "${checkDoc.getAuthor()}"`);
  check('Producer fingerprint gone', !checkDoc.getProducer(), `got "${checkDoc.getProducer()}"`);
  check('Creator fingerprint gone', !checkDoc.getCreator(), `got "${checkDoc.getCreator()}"`);
  check('XMP packet gone', getXmp(checkDoc) === null, '(XMP still present!)');
  // Belt-and-suspenders: no fingerprint strings anywhere in the raw bytes
  const raw = Buffer.from(scrubbed).toString('latin1');
  check('Raw bytes contain no "John Doe"', !raw.includes('John Doe'));
  check('Raw bytes contain no "Microsoft Word"', !raw.includes('Microsoft Word'));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('SPIKE ERROR:', e); process.exit(2); });
