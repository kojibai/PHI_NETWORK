import { downloadBlob } from "../lib/download";
import { qrDataURL } from "../lib/qr";
import { POSTER_PX } from "../utils/qrExport";
import { insertPngTextChunks } from "../utils/pngChunks";
import type { VerifiedCardData } from "./types";
import { buildVerifiedCardSvg, VERIFIED_CARD_H, VERIFIED_CARD_W } from "./buildVerifiedCardSvg";
import { svgToPngBlob } from "./svgToPng";

function fileNameForCapsule(hash: string, verifiedAtPulse: number): string {
  const safe = hash.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "verified";
  return `verified-${safe}-${verifiedAtPulse}.png`;
}

function buildPointerPayload(data: VerifiedCardData): string {
  const payload = {
    v: "KVB-PTR-1",
    verifierUrl: data.shareReceiptUrl ?? data.verifierUrl ?? "",
    bundleHash: data.bundleHash ?? "",
    receiptHash: data.receiptHash ?? "",
    verifiedAtPulse: data.verifiedAtPulse,
    capsuleHash: data.capsuleHash,
    svgHash: data.svgHash ?? "",
  } as const;
  return JSON.stringify(payload);
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
  const qrPayload = data.shareReceiptUrl ?? data.verifierUrl ?? buildPointerPayload(data);
  const qrDataUrl = await qrDataURL(qrPayload, { size: 360, margin: 1, ecc: "M" });

  const svg = buildVerifiedCardSvg({ ...data, qrDataUrl });
  const pngBlob = await svgToPngBlob(svg, exportWidthPx(), exportHeightPx());

  const proofBundleJson = data.proofBundleJson ?? "";
  const entries = [
    proofBundleJson ? { keyword: "phi_proof_bundle", text: proofBundleJson } : null,
    data.bundleHash ? { keyword: "phi_bundle_hash", text: data.bundleHash } : null,
    data.receiptHash ? { keyword: "phi_receipt_hash", text: data.receiptHash } : null,
  ].filter((entry): entry is { keyword: string; text: string } => Boolean(entry));

  if (entries.length === 0) {
    downloadBlob(pngBlob, filename);
    return;
  }

  const bytes = new Uint8Array(await pngBlob.arrayBuffer());
  const enriched = insertPngTextChunks(bytes, entries);
  const finalBlob = new Blob([enriched as BlobPart], { type: "image/png" });
  downloadBlob(finalBlob, filename);
}
