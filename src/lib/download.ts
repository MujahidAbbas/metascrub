/** Browser-only download helpers (kept out of the testable engine core). */
import { downloadZip } from 'client-zip';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPdf(name: string, bytes: Uint8Array): void {
  triggerDownload(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name);
}

export async function downloadZipped(
  entries: { name: string; bytes: Uint8Array }[],
  zipName = 'metascrub.zip',
): Promise<void> {
  const blob = await downloadZip(
    entries.map((e) => ({ name: e.name, input: e.bytes })),
  ).blob();
  triggerDownload(blob, zipName);
}

/** "resume.pdf" + "scrubbed" -> "resume.scrubbed.pdf" */
export function suggestName(original: string, suffix: string): string {
  const dot = original.toLowerCase().endsWith('.pdf') ? original.slice(0, -4) : original;
  return `${dot}.${suffix}.pdf`;
}
