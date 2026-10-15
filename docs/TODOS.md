# MetaScrub — TODOs

## Done — upgrade 2026-10 (branch `upgrade-2026-10`)

- Astro 6.4.4 → 7.3.8, `@astrojs/svelte` 9, in-range bumps; `npm audit` 13 → 0.
  `compressHTML: true` keeps v6 whitespace (the v7 'jsx' default printed "out of yourPDFs").
  Built HTML of all 7 pages diffed before/after: only `&#x26;`→`&amp;` and Astro's hydration script changed.
- Scrub now removes: the whole Info dict (custom keys like Company), XMP on pages/images, PieceInfo,
  comment authors + timestamps on every annotation (PDFKit's hidden duplicate note included), and
  objects left unreferenced by earlier saves. The report lists each with its source.
- Edit: Creator and XMP CreatorTool kept in step; PDF/A + PDF/UA ids kept; pdf:Keywords and
  xmp:Create/ModifyDate written; earlier-save Info dropped.
- Tests: `deepText` helper (decodes UTF-16 hex + compressed object streams); real Chrome and
  macOS PDFKit fixtures in `tests/fixtures/`. 20 tests; the 9 new engine tests fail on the old engine.
- CSP via Astro `security.csp`, `connect-src 'none'`; theme script hashed at build time.
- Engine (pdf-lib) loads at idle, not during hydration: island chunk 446 KB → 23 KB.
- Batch: results matched by position, not filename; zip names de-duplicated; button no longer
  sticks on "Working…" if zipping throws.
- `trailingSlash: 'never'`: sitemap, canonicals and links agree.

## Waiting on Mujahid

- Make `MujahidAbbas/metascrub` public. Until then the site's "Open source" claim is false.
- Merge/push `upgrade-2026-10`. Vercel's GitHub app deploys `main` straight to Production (both
  June commits show `vercel[bot]` Production deployments). Push the branch first: should get a preview URL (preview settings not checked).
- On the deployed site: confirm the CSP meta tag is served and the tool works (only checked on `astro preview`).

## Follow-ups (not done, deliberately)

- Real Word, Acrobat and Google Docs PDFs as fixtures (needs files; Word automation skipped).
- Trailer `/ID` is kept: it can link a scrubbed copy to the original. Regenerate on scrub?
- Edit keeps only PDF/A/UA ids from the old XMP; other namespaces (xmpMM ids, extension schemas)
  are dropped. Not validated with veraPDF.
- XMP parser misses attribute-form properties and reads only the first `dc:creator`; scrub still
  removes the whole packet, but the report can under-list.
- pdf-lib writes Info Keywords space-joined, so multi-word keywords lose boundaries in Info (XMP keeps them).
- Embedded file attachments, form field values and document JavaScript are content, not touched.
  Attachments carry their own metadata.
- `/scrub/` still serves 200 on Vercel; a `vercel.json` `"trailingSlash": false` would 308 it.
- Batch runs on the main thread (R5); a Web Worker if large batches freeze the UI.
- Encrypted PDFs rejected; `@cantoo/pdf-lib` (maintained fork, 2.11.1) reads them but is a new dependency.
  pdf-lib 1.17.1 last published 2022-05.
- No analytics; Search Console access for metascrub.vercel.app not confirmed. Custom domain undecided.
- `astro check` needs `@astrojs/check` (not installed); Svelte files are not type-checked.
- `npm approve-scripts` has `fsevents` pending (optional macOS watcher).
