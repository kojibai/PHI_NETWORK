import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { Inflate } from "fflate";

const MAX_R_CHARS = 30_000;
const MAX_COMPRESSED_BYTES = 64 * 1024;
const MAX_INFLATED_BYTES = 1024 * 1024;

const TD = new TextDecoder();

type InflateWithErr = Inflate & { err?: number; msg?: string };

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const buffer = Buffer.from(`${base64}${pad}`, "base64");
  return new Uint8Array(buffer);
}

function inflateRawLimited(data: Uint8Array, maxOutputBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;

  const inflator = new Inflate((chunk) => {
    total += chunk.length;
    if (total > maxOutputBytes) {
      throw new Error("Share payload too large.");
    }
    chunks.push(chunk);
  }) as InflateWithErr;

  inflator.push(data, true);

  if (inflator.err && inflator.err !== 0) {
    throw new Error(inflator.msg || "Invalid share payload.");
  }

  if (total === 0) return new Uint8Array(0);

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function decodeVerifyShareR_SSR(rRaw: string): unknown | null {
  if (!rRaw) return null;
  const trimmed = String(rRaw).trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith("c:")) {
      const encoded = trimmed.slice(2);
      if (!encoded) return null;
      if (encoded.length > MAX_R_CHARS) return null;
      const compressed = base64UrlDecode(encoded);
      if (compressed.length > MAX_COMPRESSED_BYTES) return null;
      const inflated = inflateRawLimited(compressed, MAX_INFLATED_BYTES);
      const json = TD.decode(inflated);
      return JSON.parse(json);
    }

    if (trimmed.length > MAX_R_CHARS) return null;
    const decoded = base64UrlDecode(trimmed);
    if (decoded.length > MAX_INFLATED_BYTES) return null;
    const json = TD.decode(decoded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
