---
title: What hidden metadata is in your PDF?
description: A field-by-field tour of the data quietly stored in every PDF — the Info dictionary, the XMP packet, and the software fingerprints you didn't know you were sharing.
pubDate: 2026-05-22
---

A PDF looks like a flat, finished document. Under the surface it's a structured file with several places to stash information about itself — and most of that information was written automatically, without you ever seeing it.

Here's what's actually in there.

## The Info dictionary

This is the classic metadata block, the one that shows up under "Document Properties" in almost every reader:

- **Title** — frequently the original filename, which can be more revealing than you'd expect
- **Author** — your name, username, or email, pulled from your OS or office suite
- **Subject** — a description, if one was set
- **Keywords** — tags for search and indexing
- **Creator** — the application the document was *authored* in
- **Producer** — the application that *wrote the PDF* (often a converter or print driver)
- **CreationDate / ModDate** — timestamps, usually accurate to the second

## The XMP packet

Newer PDFs also embed an **XMP** block — an XML chunk using standards like Dublin Core. It often duplicates the Info dictionary, but not always, and the two can disagree. A tool that only clears the Info dictionary will leave the XMP copy of your name sitting right there. This is why thorough scrubbing has to handle both, and it's a common gap in cheaper tools.

XMP is also where you'll find `xmp:CreatorTool` — frequently the most specific software fingerprint in the whole file.

## Why it's there at all

None of this is malicious. Word, Acrobat, Google Docs, and export pipelines all write metadata to make documents searchable and to track provenance. The issue is simply that it's invisible by default, so it tends to travel further than intended.

## See it for yourself

The fastest way to understand your own files is to look. [Open a PDF in MetaScrub](/scrub) and it lists every field it finds, Info dictionary and XMP alike — all in your browser, nothing uploaded. From there you can [edit the fields](/edit) or wipe them entirely.
