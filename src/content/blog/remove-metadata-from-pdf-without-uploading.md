---
title: How to remove metadata from a PDF (without uploading it)
description: Strip the author, software fingerprints, and timestamps out of a PDF entirely in your browser — no upload, no account, no trace left behind.
pubDate: 2026-05-12
---

Most "remove PDF metadata online" tools have a catch buried in their privacy policy: to process your file, they upload it to a server first. For a holiday flyer that's fine. For a résumé, a legal filing, or a document you'd rather not hand to a third party, it's the whole problem.

There's a better way, and it doesn't require installing anything.

## Why PDF metadata is worth removing

Every PDF carries a hidden layer of data about *who* made it and *how*. Open any PDF's "Document Properties" and you'll usually find:

- **Author** — often your real name or work email
- **Producer / Creator** — the exact software, e.g. "Microsoft® Word 2021"
- **Creation and modification dates** — down to the second
- Sometimes a **company name** baked into the original template

None of that is visible on the page, so it's easy to forget it's there. But anyone who receives the file can read it in seconds.

## Remove it in your browser

[MetaScrub's scrub tool](/scrub) does this without uploading anything. The entire process runs as JavaScript inside your own browser tab:

1. Drop your PDF onto the page.
2. It shows you every field that's hiding inside — including the XMP packet most tools ignore.
3. Click **Scrub all metadata**. It wipes the lot and shows you exactly what was removed.
4. Download the clean copy.

Your file never leaves your device, because there's no server to send it to. You can even disconnect from the internet after the page loads and it still works.

## What stays the same

Scrubbing only touches metadata. The visible content — text, images, layout, page count — is untouched. You get the same document, minus the hidden trail.

## Doing several at once

If you have a folder of files to clean, drop them all in. They're scrubbed locally and handed back as a single zip. Same privacy guarantee, no per-file clicking.

Ready? [Scrub a PDF now →](/scrub)
