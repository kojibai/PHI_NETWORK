// src/utils/shareBundleCodec.ts
//
// Share-bundle URL codec (offline, self-contained).
// - Legacy: ?r=<base64url(JCS(JSON))>
// - Compact: ?p=c1:<base64url(deflateRaw(JCS(JSON)))>
//
// SECURITY: attacker-controlled ?p= must be size-bounded to prevent deflate bombs / main-thread DoS.

import { deflateSync, Inflate } from "fflate";
import { base64UrlDecode, base64UrlEncode } from "./sha256";
import { jcsCanonicalize } from "./jcs";

const SHARE_PREFIX = "c1:" as const;

// Bounds (tuned for “full KAS + zk proof bundle” while preventing DoS)
const MAX_P_CHARS = 18_000; // fast-fail on absurd URLs before base64 decode
const MAX_R_CHARS = 30_000; // legacy r can be bigger; still cap
const MAX_COMPRESSED_BYTES = 64 * 1024; // base64-decoded compressed payload max
const MAX_INFLATED_BYTES = 1024 * 1024; // decompressed JSON bytes max (1 MiB)
const MAX_RAW_JSON_BYTES_TO_COMPRESS = 2 * 1024 * 1024; // safety if caller passes something huge

const TE = new TextEncoder();
const TD = new TextDecoder();

type InflateWithErr = Inflate & { err?: number; msg?: string };

function fail(msg: string): never {
  throw new Error(msg);
}

function inflateRawLimited(data: Uint8Array, maxOutputBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;

  const inflator = new Inflate((chunk) => {
    total += chunk.length;
    if (total > maxOutputBytes) {
      // Throw inside ondata to abort inflation ASAP (prevents deflate bombs).
      throw new Error("Share payload too large.");
    }
    chunks.push(chunk);
  }) as InflateWithErr;

  try {
    inflator.push(data, true);
  } catch (e) {
    // Includes our own size-limit throw and any inflate parse errors.
    if (e instanceof Error && e.message === "Share payload too large.") throw e;
    fail("Invalid share payload.");
  }

  if (inflator.err && inflator.err !== 0) {
    fail(inflator.msg || "Invalid share payload.");
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

/** Legacy encoder for ?r= (kept for backward compatibility). */
export function encodeLegacyRParam(bundle: unknown): string {
  const json = jcsCanonicalize(bundle as Parameters<typeof jcsCanonicalize>[0]);
  const bytes = TE.encode(json);
  // Legacy path is bounded by URL length; still protect against accidental huge inputs.
  if (bytes.length > MAX_INFLATED_BYTES) {
    fail("Legacy share payload too large.");
  }
  return base64UrlEncode(bytes);
}

/** Legacy decoder for ?r= (kept for backward compatibility). */
export function decodeLegacyRParam(r: string): unknown {
  if (!r) fail("Missing legacy share payload.");
  if (r.length > MAX_R_CHARS) fail("Legacy share payload too large.");
  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(r);
  } catch {
    fail("Invalid legacy share payload.");
  }
  if (bytes.length > MAX_INFLATED_BYTES) fail("Legacy share payload too large.");
  const json = TD.decode(bytes);
  try {
    return JSON.parse(json);
  } catch {
    fail("Invalid legacy share payload.");
  }
}

/** Compact encoder for ?p= (preferred). Produces: c1:<base64url(deflateRaw(JCS(JSON)))> */
export function encodeSharePayload(bundle: unknown): string {
  const json = jcsCanonicalize(bundle as Parameters<typeof jcsCanonicalize>[0]);
  const raw = TE.encode(json);

  if (raw.length > MAX_RAW_JSON_BYTES_TO_COMPRESS) {
    fail("Share bundle too large to encode.");
  }

  // Raw DEFLATE (smallest) at max compression.
  const compressed = deflateSync(raw, { level: 9 });

  // Hard cap so we never generate massive URLs.
  if (compressed.length > MAX_COMPRESSED_BYTES) {
    fail("Share payload too large.");
  }

  // Prefix kept ultra-short for URL length minimization.
  return `${SHARE_PREFIX}${base64UrlEncode(compressed)}`;
}

/** Compact decoder for ?p= (preferred). Enforces strict limits to prevent deflate bombs. */
export function decodeSharePayload(p: string): unknown {
  if (!p) fail("Missing share payload.");
  if (p.length > MAX_P_CHARS) fail("Share payload too large.");
  if (!p.startsWith(SHARE_PREFIX)) fail("Unsupported share payload version.");

  const encoded = p.slice(SHARE_PREFIX.length);
  if (!encoded) fail("Missing share payload.");

  let compressed: Uint8Array;
  try {
    compressed = base64UrlDecode(encoded);
  } catch {
    fail("Invalid share payload.");
  }

  if (compressed.length > MAX_COMPRESSED_BYTES) {
    fail("Share payload too large.");
  }

  const inflated = inflateRawLimited(compressed, MAX_INFLATED_BYTES);
  const json = TD.decode(inflated);

  try {
    return JSON.parse(json);
  } catch {
    fail("Invalid share payload.");
  }
}
