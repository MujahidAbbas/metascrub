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
- `trailingSlash: 'never'`: sitemap, canonicals and links agree. `vercel.json` `"trailingSlash": false`
  308s `/scrub/` to `/scrub` (it served 200 on both, a duplicate URL).

## Production — 2026-10-15

- `upgrade-2026-10` fast-forwarded into `main` (0be1bb4 → d58c153); Vercel deployed it to Production.
  Before the merge the branch preview (behind Vercel login) showed: CSP meta served, same-origin fetch
  blocked, page hydrates, the PDFKit fixture scrub reports the same 8 removals as locally, `/scrub/`
  and `/edit/` land on the slash-less URL.
- Live check after deploy (curl): `/scrub/`, `/edit/`, `/blog/` 308 to the slash-less URL; `/scrub`
  200 with canonical `/scrub`; `sitemap-0.xml` has no trailing slashes; CSP meta with
  `connect-src 'none'` served; island chunk 22.9 KB.

- Repo made public 2026-10-15, after a check of all history (both branches): no secrets or env files,
  fixtures carry only made-up names, commit email already public on 5 other repos.
- Header and footer "GitHub" links now point at the repo, not the profile, so "Open source" links to
  the source. README's link stays on the profile (it is under "Author").
- Search Console: URL-prefix property `https://metascrub.vercel.app/` added and verified by HTML tag
  (`Head.astro`; removing the tag unverifies). Same Google account as the mujahidabbas.dev property.
  A Domain property isn't possible without DNS on a vercel.app subdomain.
  `sitemap-index.xml` submitted; GSC showed "Couldn't fetch" with no "Last read" right after.
  Both sitemaps return 200 `application/xml` to a Googlebot UA, valid XML, no X-Robots-Tag.

## Done — full test pass 2026-10-15 (branch `fix/test-pass-2026-10`)

Engine probed in node (outputs checked with poppler `pdfinfo`/`pdftotext`/`pdftoppm`), UI driven in Chrome
against `astro preview`, live site checked with curl (it served the same asset hashes as `main`).
Scrub held up everywhere: no metadata left, text and render identical, comment text kept, re-scrub finds nothing.
Bugs found and fixed:

- Batch edit stamped the first file's Title/Creator/Producer onto every file (form was prefilled from file 1
  under "blank fields are left untouched"). The form now starts blank for a batch; adding files to a single-file
  session clears the prefilled values and keeps anything typed.
- Non-ASCII edits corrupted the XMP: pdf-lib's `context.stream(string)` keeps one byte per char, so "José"
  became Latin-1 bytes and Urdu/CJK text was lost (BOM too). `setXmp` now encodes UTF-8.
- Header overflowed every phone width (needed 433 px): the GitHub button is now `hidden sm:block` (the footer
  keeps the link). Fits from 360 px up.
- Edit mode showed no error for an encrypted or invalid file (blank form, disabled button). It now shows it.
- Keywords field rewrote itself while typing ("tax return, " snapped to "tax return"). Raw text is kept now.
- XMP character/entity references (`&#xE9;`, `&quot;`) are decoded; non-PDFs are reported as skipped on both
  inputs; list errors show inline (they were hover-only); error messages no longer carry pdf-lib parser detail.

3 new engine tests (23 total), each failing before its fix. The Svelte fixes have no unit tests (no component
test setup; adding one is a new dependency); they were checked in the browser before and after.

Production 2026-10-15: `main` fast-forwarded b050720 → ed36795 and pushed; Vercel deployed in ~30 s. Live check
(curl): all 7 pages 200, `/scrub/` 308s to `/scrub`, live asset hashes equal the local build of ed36795, every
chunk 200, CSP `connect-src 'none'` served, header GitHub button carries `hidden sm:block`.

## Done — design overhaul 2026-10-15 (branch `design-overhaul-2026-10`, not merged)

Research and spec: Claude Doc "MetaScrub UI/UX Research and Design Overhaul"
(https://claude.ai/code/artifact/cf650454-4523-4a1a-b5c1-2062ffe579d4): audit, 12 Mobbin searches, token spec,
before/after screenshots. Decisions, all taken as recommended:
- Live tool on the home page (home now hydrates the island; engine still loads at idle).
- One workspace with a Scrub/Edit switch; `/scrub` and `/edit` stay as landing pages, files survive a switch.
- A scrub runs on load, so Review lists everything a scrub removes (8 items for the PDFKit fixture, was 6), and
  the Download hands out those bytes. A scrub failure there is non-fatal: Edit still works on the file.

What changed: tokens (faint/muted lifted, text on red is near-black, new `on-redact` and `warn`); shared `.btn`
and `.tag` classes; risk tags (Identifies you / Software / Timeline); Load-Review-Download rail; result state
"Clean" with Download in lime; batch rows expand to per-file reports, "Download .zip again"; Edit shows a
struck "was" value per changed field and "Save N changes"; native `<details>` FAQ (`Faq.astro`); blog reading
time and an in-post tool card; header GitHub icon, nav fits at 320 px; four-column footer.
Checked: 23 tests, build, typecheck; downloads read back with `pdfinfo`; 44 token pairs all >= 4.5:1 (lowest 4.68);
no horizontal scroll at 320/360/390 px. No new dependencies; engine (`src/lib`) untouched.

Production 2026-10-15: approved after a local review; `main` fast-forwarded 7a8717e → e191705 and pushed; Vercel
live in ~25 s. Live check (curl): all 7 pages 200, `/scrub/` 308s to `/scrub`, CSP `connect-src 'none'` served,
home asset hashes equal the local build of e191705, all 3 chunks 200.

## Waiting on Mujahid


- Recheck GSC Sitemaps after 2026-10-17: status should be "Success" with 7 discovered pages.
  Still "Couldn't fetch" with a "Last read" date means a real fetch failure to dig into.

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
- A failed batch zip resets the button, but the error is an unhandled rejection: nothing is shown to the user.
- CSP is a meta tag, so `frame-ancestors` (header-only) is unset; add it under `headers` in `vercel.json` if wanted.
  The full CSP stays in the meta: a header copy would hand-repeat Astro's build-time hashes.
- Engine still fetches at idle on /scrub and /edit (~190 KB gz) for visitors who never drop a file.
  Kept: drop-time loading would add that fetch to every first use and break the tool offline.
- Batch runs on the main thread (R5); a Web Worker if large batches freeze the UI.
- Encrypted PDFs rejected; `@cantoo/pdf-lib` (maintained fork, 2.11.1) reads them but is a new dependency.
  pdf-lib 1.17.1 last published 2022-05.
- No analytics. Custom domain undecided; moving to one means a new GSC property and 301s from vercel.app.
- `astro check` needs `@astrojs/check` (not installed); Svelte files are not type-checked.
- No branded 404: Vercel serves its default page. An `src/pages/404.astro` would cover it.
- No component tests for the Svelte island; UI behaviour is verified by hand in the browser.
- `npm approve-scripts` has `fsevents` pending (optional macOS watcher).
- An invalid PDF shows the raw parser error ("Cannot read properties of undefined (reading 'get')"), not the
  friendly InvalidPdfError text. Pre-existing; the redesign shows it on load instead of on Scrub.
- Created/Modified dates are not editable in Edit (engine supports them; no UI yet).
- `public/og.png` (social card, also the README image) still shows the old red redaction bars; the site now
  uses struck values and risk tags. Headline, logo and colors still match.
- Real-phone check: the dropzone shows "Choose PDFs to check" on touch devices via `(pointer: coarse)`; the
  headless pass emulates width, not pointer type, so this copy was not seen rendered.
