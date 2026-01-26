import { downloadBlob } from "../lib/download";
import { qrDataURL } from "../lib/qr";
import { POSTER_PX } from "../utils/qrExport";
import { insertPngTextChunks } from "../utils/pngChunks";
import { CARRIER_PNG_KEY, computeCarrierArtifactHash, encodeCarrierPayload } from "../utils/carrierPayload";
import type { VerifiedCardData } from "./types";
import { buildVerifiedCardSvg, VERIFIED_CARD_H, VERIFIED_CARD_W } from "./buildVerifiedCardSvg";
import { svgToPngBlob } from "./svgToPng";

function fileNameForCapsule(hash: string, verifiedAtPulse: number): string {
  const safe = hash.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "verified";
  return `verified-${safe}-${verifiedAtPulse}.png`;
}

function defaultVerifyBase(): string {
  if (typeof window !== "undefined") return `${window.location.origin}/verify`;
  return "https://phi.network/verify";
}

function resolveVerifierUrl(data: VerifiedCardData): string {
  const provided = data.verifierUrl?.trim();
  if (provided) {
    const slug = slugFromVerifierUrl(provided);
    if (slug) return `${defaultVerifyBase()}/${encodeURIComponent(slug)}`;
    return provided;
  }
  const slug = data.verifierSlug?.trim();
  if (slug) return `${defaultVerifyBase()}/${encodeURIComponent(slug)}`;
  return "";
}

function slugFromVerifierUrl(url: string): string | null {
  if (!url) return null;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://phi.network";
    const parsed = new URL(url, base);
    const match = parsed.pathname.match(/\/verify\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function exportWidthPx(): number {
  return POSTER_PX;
}

function exportHeightPx(): number {
  const width = exportWidthPx();
  const sourceRatio = VERIFIED_CARD_H / VERIFIED_CARD_W;
  return Math.round(width * sourceRatio);
}

export async function downloadVerifiedCardPng(data: VerifiedCardData): Promise<void> {
  const filename = fileNameForCapsule(data.capsuleHash, data.verifiedAtPulse);
  const verifierUrl = resolveVerifierUrl(data);
  const qrDataUrl = await qrDataURL(verifierUrl || "https://phi.network/verify", { size: 360, margin: 1, ecc: "M" });

  const svg = buildVerifiedCardSvg({ ...data, verifierUrl, qrDataUrl });
  const pngBlob = await svgToPngBlob(svg, exportWidthPx(), exportHeightPx());

  const proofBundleJson = data.proofBundleJson ?? "";
  const entries = [
    proofBundleJson ? { keyword: "phi_proof_bundle", text: proofBundleJson } : null,
    data.bundleHash ? { keyword: "phi_bundle_hash", text: data.bundleHash } : null,
    data.receiptHash ? { keyword: "phi_receipt_hash", text: data.receiptHash } : null,
  ].filter((entry): entry is { keyword: string; text: string } => Boolean(entry));

  const baseBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const enriched = entries.length > 0 ? insertPngTextChunks(baseBytes, entries) : baseBytes;

  const slug = data.verifierSlug?.trim() || slugFromVerifierUrl(verifierUrl) || "";
  const bundleHash = data.bundleHash?.trim() || "";
  const receiptHash = data.receiptHash?.trim() || "";

  if (slug && bundleHash && receiptHash) {
    const artifactHash = await computeCarrierArtifactHash(enriched);
    const carrierPayload = encodeCarrierPayload({
      v: "KVCAR-1",
      slug,
      bundleHash,
      receiptHash,
      artifactHash,
    });
    const sealed = insertPngTextChunks(enriched, [{ keyword: CARRIER_PNG_KEY, text: carrierPayload }]);
    const finalBlob = new Blob([sealed as BlobPart], { type: "image/png" });
    downloadBlob(finalBlob, filename);
    return;
  }

  const finalBlob = new Blob([enriched as BlobPart], { type: "image/png" });
  downloadBlob(finalBlob, filename);
}
