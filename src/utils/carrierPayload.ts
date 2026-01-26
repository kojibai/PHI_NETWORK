import { base64UrlDecode, base64UrlEncode, sha256Hex } from "./sha256";
import { jcsCanonicalize } from "./jcs";
import { readPngTextChunk } from "./pngChunks";

export const CARRIER_PNG_KEY = "phi.kvb";

export type CarrierPayload = Readonly<{
  v: "KVCAR-1";
  slug: string;
  receiptHash: string;
  bundleHash: string;
  artifactHash: string;
}>;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const textDecoder = new TextDecoder("utf-8");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHashHex(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value.trim());
}

export function isCarrierPayload(value: unknown): value is CarrierPayload {
  if (!isRecord(value)) return false;
  return (
    value.v === "KVCAR-1" &&
    typeof value.slug === "string" &&
    value.slug.trim().length > 0 &&
    typeof value.receiptHash === "string" &&
    isHashHex(value.receiptHash) &&
    typeof value.bundleHash === "string" &&
    isHashHex(value.bundleHash) &&
    typeof value.artifactHash === "string" &&
    isHashHex(value.artifactHash)
  );
}

export function encodeCarrierPayload(payload: CarrierPayload): string {
  const canon = jcsCanonicalize(payload as Parameters<typeof jcsCanonicalize>[0]);
  const bytes = new TextEncoder().encode(canon);
  return base64UrlEncode(bytes);
}

export function decodeCarrierPayload(encoded: string): CarrierPayload | null {
  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(encoded));
    const parsed = JSON.parse(decoded) as unknown;
    return isCarrierPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function extractCarrierPayloadFromPng(
  pngBytes: Uint8Array,
  keyword: string = CARRIER_PNG_KEY,
): CarrierPayload | null {
  const raw = readPngTextChunk(pngBytes, keyword);
  if (!raw) return null;
  return decodeCarrierPayload(raw);
}

function assertPngSignature(bytes: Uint8Array): void {
  if (bytes.length < PNG_SIGNATURE.length) {
    throw new Error("Invalid PNG: missing signature");
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error("Invalid PNG: bad signature");
    }
  }
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function parseITXtKeyword(data: Uint8Array): string | null {
  const nullIdx = data.indexOf(0);
  if (nullIdx <= 0) return null;
  return textDecoder.decode(data.slice(0, nullIdx));
}

export function stripCarrierPayloadChunk(
  pngBytes: Uint8Array,
  keyword: string = CARRIER_PNG_KEY,
): Uint8Array {
  assertPngSignature(pngBytes);
  const kept: Uint8Array[] = [];
  kept.push(pngBytes.slice(0, 8));
  let offset = 8;
  while (offset + 8 <= pngBytes.length) {
    const length = readUint32BE(pngBytes, offset);
    const type = chunkType(pngBytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > pngBytes.length) break;

    let skip = false;
    if (type === "iTXt") {
      const keywordValue = parseITXtKeyword(pngBytes.slice(dataStart, dataEnd));
      if (keywordValue === keyword) {
        skip = true;
      }
    }

    if (!skip) {
      kept.push(pngBytes.slice(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  const total = kept.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of kept) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

export async function computeCarrierArtifactHash(
  pngBytes: Uint8Array,
  keyword: string = CARRIER_PNG_KEY,
): Promise<string> {
  const normalized = stripCarrierPayloadChunk(pngBytes, keyword);
  return (await sha256Hex(normalized)).toLowerCase();
}
