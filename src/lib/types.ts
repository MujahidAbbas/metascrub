/** Shared metadata types for the MetaScrub engine. */

/** The standard PDF Info-dictionary fields, plus the XMP-only CreatorTool. */
export interface Metadata {
  title?: string;
  author?: string;
  subject?: string;
  /** Comma-or-space separated in the Info dict; modeled as an array here. */
  keywords?: string[];
  creator?: string;
  producer?: string;
  /** XMP xmp:CreatorTool — often the real software fingerprint. */
  creatorTool?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

/** What read() surfaces: the merged view plus where each source had data. */
export interface ReadResult {
  /** Merged best-effort view for the form (XMP wins where both exist). */
  metadata: Metadata;
  /** Raw Info-dict view, for diffing/scrub reporting. */
  info: Metadata;
  /** Parsed XMP view (empty object if no XMP packet present). */
  xmp: Metadata;
  hasXmp: boolean;
}

/** One field removed by a scrub, with the value that was there. */
export interface ScrubRemoval {
  field: string;
  source: 'info' | 'xmp';
  value: string;
}

export interface ScrubResult {
  bytes: Uint8Array;
  removed: ScrubRemoval[];
}

export class EncryptedPdfError extends Error {
  constructor() {
    super('This PDF is password-protected. Unlock it first, then try again.');
    this.name = 'EncryptedPdfError';
  }
}

export class InvalidPdfError extends Error {
  constructor(detail?: string) {
    super(`This file does not look like a valid PDF.${detail ? ` (${detail})` : ''}`);
    this.name = 'InvalidPdfError';
  }
}
