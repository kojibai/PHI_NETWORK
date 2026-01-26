import { downloadBlob } from "../lib/download";
import type { VerifiedCardData } from "./types";
import { buildVerifiedCardSvg } from "./buildVerifiedCardSvg";
import { svgToPngBlob } from "./svgToPng";

function fileNameForCapsule(hash: string, verifiedAtPulse: number): string {
  const safe = hash.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "verified";
  return `verified-${safe}-${verifiedAtPulse}.png`;
}

export async function downloadVerifiedCardPng(data: VerifiedCardData): Promise<void> {
  const filename = fileNameForCapsule(data.capsuleHash, data.verifiedAtPulse);
  const ogUrl = `/og/v/verified/${encodeURIComponent(data.capsuleHash)}/${encodeURIComponent(String(data.verifiedAtPulse))}.png`;

  try {
    const res = await fetch(ogUrl, { method: "GET" });
    const contentType = res.headers.get("content-type") || "";
    const notFoundHeader = res.headers.get("x-og-not-found");
    if (res.ok && !notFoundHeader && contentType.toLowerCase().startsWith("image/png")) {
      const blob = await res.blob();
      downloadBlob(blob, filename);
      return;
    }
  } catch {
    // Fall back to client render
  }

  const svg = buildVerifiedCardSvg(data);
  const pngBlob = await svgToPngBlob(svg, 1200, 630);
  downloadBlob(pngBlob, filename);
}
