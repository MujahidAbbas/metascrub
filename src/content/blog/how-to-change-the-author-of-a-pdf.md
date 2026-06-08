---
title: How to change the Author of a PDF
description: Set or correct the Author field on a PDF in a few seconds, in your browser — and make sure the change sticks in both the Info dictionary and the XMP metadata.
pubDate: 2026-06-02
---

Maybe the Author on a PDF is a misspelling, an old username, or just blank. Changing it is quick — the only thing worth getting right is making the change *stick* everywhere it's stored.

## The catch: there are two copies

As covered in [what's hidden in your PDF](/blog/what-hidden-metadata-is-in-your-pdf), the author can live in two places:

1. The **Info dictionary** (`/Author`)
2. The **XMP packet** (`dc:creator`)

Update only the first and some readers — and a lot of search indexers — will keep showing the old value from the XMP copy. To change the author properly, you have to write both and keep them in sync.

## Change it in your browser

[MetaScrub's editor](/edit) does both at once:

1. Drop the PDF onto the [edit page](/edit).
2. The form pre-fills with the current values. Type the new name into **Author**.
3. Click **Save & download**.

The updated copy downloads to your device. Both the Info dictionary and the XMP packet are rewritten together, so every reader shows the same author. As always, the file is processed locally — nothing is uploaded.

## Changing the author on several PDFs

Drop in multiple files and the Author you enter is applied to all of them, then downloaded as a zip. Leave a field blank to leave it untouched across the batch — handy when you only want to change one thing.

## Want to remove it instead?

If the goal is to *erase* the author rather than replace it, use the [scrub tool](/scrub) — it clears the author along with every other metadata field in one click.
