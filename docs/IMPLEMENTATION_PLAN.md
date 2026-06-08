# MetaScrub — Implementation Plan

> **Provisional name:** MetaScrub *(find-and-replace later — see [Naming](#naming))*
> **One-liner:** Edit & strip PDF metadata, 100% in your browser. Nothing uploaded, ever.
> **Goals:** Portfolio showcase **and** SEO traffic asset (equal weight).
> **Stack:** Astro 5 + Svelte island + pdf-lib + Tailwind. Static, no backend.

---

## 1. Core thesis

The entire product hangs on one claim: **your file never leaves your browser.** Smallpdf, iLovePDF, and Sejda all upload to a server — they structurally cannot make this promise. Our static, client-side architecture *is* the privacy guarantee: there is no server to upload to.

Two use cases, one engine:
- **Edit** — set Title / Author / Subject / Keywords / dates (writers, publishers, SEO).
- **Scrub** — remove author names, software fingerprints, and timestamps before sharing (privacy, legal, journalists, job-seekers anonymizing résumés). **This is the sharpest hook.**

---

## 2. Architecture

```
Static content site (zero JS)  ─┬─→  /  /edit  /scrub  /blog/*     → SEO + Lighthouse 100
                                └─→  ONE Svelte island (client:load) → all PDF work runs in-browser
```

- Marketing/content pages ship **zero JavaScript** (Astro default) → fast, ranks well, perfect Lighthouse score (great portfolio screenshot).
- The tool is a single hydrated Svelte component; all `pdf-lib` processing is local.
- No backend / API / database. Deploys as static files to Cloudflare Pages or Netlify.

**Stack decisions (locked):**

| Layer | Choice | Notes |
|---|---|---|
| Framework | Astro 5 | Content collections for blog, islands for tool |
| Tool UI | **Svelte** (`@astrojs/svelte`) | Tiny bundle — reinforces the "fast" story |
| PDF engine | `pdf-lib` | Info dict read/write + save |
| XMP | manual (via `pdf-lib` metadata stream) | No first-class API — see [Risk](#5-risk-register) |
| Zip (batch) | `client-zip` | Bundle multiple outputs for download |
| Styling | Tailwind CSS | |
| Hosting | Cloudflare Pages / Netlify | Free, static, custom domain |
| Analytics | Plausible or Cloudflare Web Analytics | Privacy-friendly = on-brand |

---

## 3. Project structure

```
metascrub/
├─ src/
│  ├─ pages/
│  │  ├─ index.astro            # landing — privacy hero, Edit + Scrub CTAs
│  │  ├─ edit.astro             # mounts the island in "edit" mode
│  │  ├─ scrub.astro            # mounts the island in "scrub" mode (own URL = own SEO target)
│  │  └─ blog/[...slug].astro   # content collection renderer
│  ├─ components/
│  │  ├─ PdfTool.svelte         # THE island — files, batch, download, mode switch
│  │  ├─ MetadataForm.svelte    # edit fields
│  │  ├─ ScrubReport.svelte     # before/after "removed X, Y, Z" diff
│  │  └─ Dropzone.svelte        # drag-drop / file picker
│  ├─ lib/
│  │  ├─ pdf-meta.ts            # read/write Info dictionary (pdf-lib)
│  │  ├─ xmp.ts                 # parse + build XMP packet  ← highest-risk module
│  │  ├─ scrub.ts               # wipe logic + diff generation
│  │  └─ batch.ts               # apply-to-all + client-zip
│  ├─ content/blog/             # markdown posts (SEO)
│  ├─ layouts/BaseLayout.astro
│  └─ components/Head.astro     # SEO meta, OG tags, canonical, sitemap link
├─ public/                      # og-image, favicon, sample.pdf (demo)
├─ astro.config.mjs             # @astrojs/svelte, tailwind, @astrojs/sitemap
└─ docs/IMPLEMENTATION_PLAN.md  # this file
```

---

## 4. Feature scope

### v1.0 (all four agreed)
1. **Edit core metadata** — read & edit Info dict: Title, Author, Subject, Keywords, Creator, Producer, CreationDate, ModDate. Drop/pick → form pre-filled with current values → edit → download.
2. **Scrub mode** — one click wipes Info dict + removes XMP packet. `ScrubReport` shows exactly what was removed so the privacy value is *visible*.
3. **XMP support** — read embedded XMP XML (Dublin Core etc.), surface in form, write back. Reconcile with Info dict (two copies of "Author" can disagree).
4. **Batch / multi-file** — drop several PDFs, apply same edit/scrub to all, download as zip.

### Explicitly skipped in v1 (future content fodder)
Page-1 preview thumbnail (`pdf.js`), save/load presets, accounts, OCR, any server feature.

---

## 5. Risk register

| # | Risk | Mitigation |
|---|---|---|
| R1 | **XMP write has no first-class `pdf-lib` API** — must manipulate the catalog Metadata stream directly. Could be the make-or-break. | ✅ **RESOLVED (Phase 0).** `context.stream(xmp,{Type:'Metadata',Subtype:'XML'})` + `register` + `catalog.set`. Full XMP read/write works → stays in v1. |
| R2 | `pdf-lib` `save()` may re-stamp `Producer` / `ModDate` — a "scrub" that re-adds a fingerprint isn't a scrub. | ✅ **RESOLVED (Phase 0).** Load with `{ updateMetadata: false }`. **Gotcha:** removing/replacing XMP must `context.delete(oldRef)` the orphaned stream, else fingerprints leak in raw bytes. Verified at byte level. |
| R3 | XMP and Info dict disagree on the same field. | `xmp.ts` reconciles; UI writes both. |
| R4 | Encrypted / password-protected PDFs crash `pdf-lib`. | Detect on load, show friendly error, skip in batch. |
| R5 | Very large / many files freeze the UI thread. | Process sequentially with progress; consider a Web Worker if needed (v1.1). |

---

## 6. Build phases

| Phase | Scope | Done when |
|---|---|---|
| **0 — Spike** | Bare HTML + pdf-lib + test PDFs. Prove read Info dict, write it, **write XMP back**, and that scrub leaves no fingerprint (R1, R2). | Go/no-go on full XMP; gotchas resolved |
| **1 — Engine** | `pdf-meta.ts`, `xmp.ts`, `scrub.ts`, `batch.ts` as pure, unit-tested functions (no UI). | Core funcs pass tests on a corpus of sample PDFs |
| **2 — Astro shell** | Astro project, Svelte + Tailwind + sitemap integrations, BaseLayout, Head/SEO, landing page. | Site deploys static, Lighthouse ≥95 |
| **3 — Tool island** | `PdfTool.svelte`: dropzone → form → edit/scrub → download. Wire to engine. Edit + Scrub modes. | Single-file tool works end-to-end |
| **4 — Batch** | Multi-file list, apply-to-all, `ScrubReport`, zip download. | Multiple PDFs processed + zipped |
| **5 — Polish & SEO** | Empty/error states (R4), mobile, OG image, sitemap, 2–3 launch blog posts, meta tags per page. | Launch-ready, all routes have SEO meta |
| **6 — Launch** | Deploy, LinkedIn build-story post, GitHub README w/ Lighthouse + architecture diagram, directory submissions. | Live + first traffic |

**Estimate:** ~1.5–2 focused weeks.

---

## 7. SEO content plan

| Route | Target intent |
|---|---|
| `/edit` | "edit pdf metadata online", "change pdf author", "edit pdf title" |
| `/scrub` | "remove pdf metadata", "remove author from pdf", "anonymize pdf" |
| Blog | "How to remove metadata from a PDF (without uploading it)" |
| Blog | "What hidden metadata is in your PDF?" |
| Blog | "How to change the Author of a PDF" |

The privacy angle earns **backlinks** from security/privacy blogs — the ranking moat vs. incumbents' domain authority.

---

## 8. Distribution

- **LinkedIn launch post:** the build story — "I built a PDF tool that processes everything in your browser, zero uploads. Here's how Astro islands made it possible." Lead with architecture, not feature list.
- **GitHub:** public repo, clean README, Lighthouse badge, architecture diagram.
- **Directories:** Product Hunt + privacy-tool lists (run `directory-submissions` skill at launch).

---

## 9. Naming

Provisional: **MetaScrub**. Shortlist to decide later (domain check deferred):

| Name | Angle |
|---|---|
| MetaScrub ⭐ | edit + strip, privacy hook |
| PaperTrail | erase your paper trail |
| BareMeta | strip it bare |
| MetaWipe | blunt privacy |
| Cloak PDF | anonymize |

---

## 10. Progress

Status key: ⬜ Not started · 🟡 In progress · ✅ Done · 🚫 Blocked

| Phase | Task | Status | Notes |
|---|---|---|---|
| 0 | Spike: read Info dict | ✅ | 18/18 spike pass |
| 0 | Spike: write Info dict | ✅ | `updateMetadata:false` on load |
| 0 | Spike: write XMP packet (R1) | ✅ | **Feasible** — `context.stream`+`catalog.set`; full XMP stays in v1 |
| 0 | Spike: verify no fingerprint after scrub (R2) | ✅ | Byte-level verified; must `context.delete` orphaned XMP stream |
| 1 | `pdf-meta.ts` read/write | ✅ | Friendly errors for encrypted/invalid (R4); XMP+Info kept in sync (R3) |
| 1 | `xmp.ts` parse/build | ✅ | Browser-safe (TextDecoder, no Buffer); HTML-escaped |
| 1 | `scrub.ts` wipe + diff | ✅ | Returns removal report (field/source/value) |
| 1 | `batch.ts` apply-all + zip | ✅ | Per-file failure isolation; zip wrapper deferred to Phase 4 (browser) |
| 1 | Unit tests on sample corpus | ✅ | 10/10 vitest pass; `tsc --noEmit` clean |
| 2 | Astro project + integrations | ✅ | Astro 6 + Svelte 5 + Tailwind 4 + sitemap; builds static |
| 2 | BaseLayout + Head/SEO | ✅ | Per-page SEO/OG; self-hosted fonts (no 3rd-party calls) |
| 2 | Landing page | ✅ | Dark "declassification lab" theme; redaction-bar motif |
| 3 | `Dropzone.svelte` | ✅ | Drag-drop + picker; per-mode accent |
| 3 | `MetadataForm.svelte` | ✅ | Prefills from PDF; fixed keyword-clobber bug (browser-caught) |
| 3 | `PdfTool.svelte` (edit + scrub) | ✅ | Orchestrates single + batch, both modes |
| 3 | Wire island to engine | ✅ | `client:load`; verified in Chrome, no console errors |
| 4 | Multi-file list UI | ✅ | Status chips, per-file remove, add-more |
| 4 | `ScrubReport.svelte` | ✅ | Redaction-styled removal report w/ XMP badges |
| 4 | Zip download | ✅ | `client-zip` for batch edit/scrub |
| 5 | Error/empty states (R4) | ✅ | Friendly errors in UI; dropzone empty state; per-file errors in batch |
| 5 | Mobile responsive | ✅ | Verified at 400px; nav collapses, hero stacks, no overflow |
| 5 | OG image + sitemap | ✅ | og.png (sharp), sitemap, robots.txt, FAQ JSON-LD on /scrub + /edit |
| 5 | 3 launch blog posts | ✅ | Content collection + 3 SEO posts + blog index/post pages + prose theme |
| 5+ | Dark/light theme toggle | ✅ | Header sun/moon toggle; CSS-var token swap; localStorage + system default; no-flash inline script; verified both modes |
| 6 | Deploy to Cloudflare/Netlify | ⬜ | |
| 6 | GitHub README + diagram | ✅ | README.md w/ architecture diagram, engineering notes, .gitignore added |
| 6 | LinkedIn launch post | ⬜ | |
| 6 | Directory submissions | ⬜ | |

---

## 11. Open decisions

- [ ] Final name (provisional: MetaScrub)
- [ ] Domain (deferred)
- [ ] Host: Cloudflare Pages vs Netlify (lean Cloudflare)
- [ ] Analytics: Plausible (paid) vs Cloudflare Web Analytics (free)
