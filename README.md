# MetaScrub

**Edit & strip PDF metadata — 100% in your browser. Nothing uploaded, ever.**

[![Astro](https://img.shields.io/badge/Astro-6-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)
[![Zero uploads](https://img.shields.io/badge/uploads-zero-success)](#why-it-exists)

MetaScrub reads, edits, and removes the hidden metadata inside PDF files — Author, Title, software fingerprints, timestamps, and the embedded XMP packet. Every byte is processed locally in the browser tab. There is no server, no upload, and no account.

![MetaScrub](public/og.png)

---

## Why it exists

Most "online PDF tool" sites upload your file to a server to process it — even the ones marketed as private. That's a non-starter for a résumé, a legal filing, or any confidential document. MetaScrub's architecture removes the problem entirely: the PDF engine runs as client-side JavaScript, so the file never leaves your device. You can disconnect from the internet after the page loads and it still works. Even the web fonts are self-hosted, so the site makes **zero third-party network calls**.

## Features

- **Inspect** — see every Info-dictionary *and* XMP field hiding in a PDF.
- **Edit** — rewrite Title, Author, Subject, Keywords, Creator, Producer; changes are written to both the Info dictionary and XMP, kept in sync.
- **Scrub** — wipe all metadata in one click, with a report of exactly what was removed.
- **Batch** — drop many files; edit or scrub them all and download as a zip.
- **Private by construction** — no uploads, no tracking, no accounts. Works offline.

## How it works

```
Static content site (zero JS)  ─┬─→  /  /edit  /scrub  /blog/*   →  fast, SEO-friendly, Lighthouse-100
                                └─→  one Svelte island (client:load)  →  all PDF work runs in-browser
```

The marketing and blog pages ship no JavaScript. The tool itself is a single hydrated [Svelte](https://svelte.dev) island that calls a small, framework-agnostic engine built on [`pdf-lib`](https://pdf-lib.js.org).

### Engineering notes

A few PDF-specific problems this handles that off-the-shelf tools often get wrong:

- **XMP, not just the Info dictionary.** `pdf-lib` has no first-class XMP API, so the engine reads/writes the catalog's `/Metadata` stream directly. Tools that only clear the Info dictionary leave a second copy of your name in the XMP packet.
- **A scrub that actually scrubs.** Loading with `{ updateMetadata: false }` stops `pdf-lib` re-stamping Producer/ModDate on save, and removing the XMP stream also deletes the orphaned indirect object — otherwise the fingerprint survives in the raw bytes. This is verified at the byte level in the test suite.
- **The keywords delimiter problem.** PDF's `Keywords` field has no standard separator; the authoritative keyword list is taken from the XMP `dc:subject` bag where available.

## Tech stack

| | |
|---|---|
| Framework | Astro 6 (islands + content collections) |
| Tool UI | Svelte 5 |
| Styling | Tailwind CSS 4 |
| PDF engine | pdf-lib |
| Zip (batch) | client-zip |
| Tests | Vitest |
| Hosting | Static — any CDN (Cloudflare Pages / Netlify) |

## Local development

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output to dist/
npm run preview    # serve the built site
npm test           # engine unit tests
npm run typecheck  # tsc --noEmit
```

## Project structure

```
src/
  lib/            # framework-agnostic engine (pure, unit-tested)
    pdf-meta.ts   #   read/write Info dictionary + XMP
    xmp.ts        #   XMP packet build/parse/read/write
    scrub.ts      #   wipe + removal report
    batch.ts      #   apply edit/scrub across many files
    download.ts   #   browser download + zip helpers
  components/     # Svelte island + Astro UI
  pages/          # /, /edit, /scrub, /blog
  content/blog/   # markdown posts
tests/            # Vitest engine suite
docs/             # implementation plan + progress
```

## Author

Built by **Mujahid Abbas**

- Website — [mujahidabbas.dev](https://mujahidabbas.dev/)
- GitHub — [@MujahidAbbas](https://github.com/MujahidAbbas)

If MetaScrub saved you a bit of hassle, you can [buy me a coffee ☕](https://ko-fi.com/mujahiddev).

## License

[MIT](LICENSE) © Mujahid Abbas
