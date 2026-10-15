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

/** A non-standard Info-dict entry, e.g. Company or SourceModified from Office/Acrobat. */
export interface InfoEntry {
  key: string;
  value: string;
}

/** What read() surfaces: the merged view plus where each source had data. */
export interface ReadResult {
  /** Merged best-effort view for the form (XMP wins where both exist). */
  metadata: Metadata;
  /** Raw Info-dict view, for diffing/scrub reporting. */
  info: Metadata;
  /** Info-dict keys beyond the standard eight. */
  infoExtra: InfoEntry[];
  /** Parsed XMP view (empty object if no XMP packet present). */
  xmp: Metadata;
  hasXmp: boolean;
}

/**
 * Where a removed value lived: the Info dict, the document XMP packet, a
 * comment, data left over from an earlier save, or XMP/app data embedded on
 * pages, images and fonts.
 */
export type RemovalSource = 'info' | 'xmp' | 'comment' | 'revision' | 'embedded';

/** One field removed by a scrub, with the value that was there. */
export interface ScrubRemoval {
  field: string;
  source: RemovalSource;
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
  constructor() {
    super('This file does not look like a valid PDF.');
    this.name = 'InvalidPdfError';
  }
}
