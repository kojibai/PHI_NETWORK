import { deflateSync, Inflate } from "fflate";
import { base64UrlDecode, base64UrlEncode } from "./sha256";
import { jcsCanonicalize } from "./jcs";

const SHARE_PREFIX = "c1:";
const MAX_COMPRESSED_BYTES = 64 * 1024;
const MAX_INFLATED_BYTES = 1024 * 1024;

function inflateRawLimited(data: Uint8Array, maxOutputBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflator = new Inflate((chunk) => {
    total += chunk.length;
    if (total > maxOutputBytes) {
      throw new Error("Share payload too large.");
    }
    chunks.push(chunk);
  });

  inflator.push(data, true);
  if (inflator.err) {
    throw new Error(inflator.msg || "Invalid share payload.");
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function encodeSharePayload(bundle: unknown): string {
  const json = jcsCanonicalize(bundle as Parameters<typeof jcsCanonicalize>[0]);
  const bytes = new TextEncoder().encode(json);
  const compressed = deflateSync(bytes, { level: 9 });
  return `${SHARE_PREFIX}${base64UrlEncode(compressed)}`;
}

export function decodeSharePayload(payload: string): unknown {
  if (!payload) throw new Error("Missing share payload.");
  if (!payload.startsWith(SHARE_PREFIX)) {
    throw new Error("Unsupported share payload version.");
  }
  const encoded = payload.slice(SHARE_PREFIX.length);
  const compressed = base64UrlDecode(encoded);
  if (compressed.length > MAX_COMPRESSED_BYTES) {
    throw new Error("Share payload too large.");
  }
  const inflated = inflateRawLimited(compressed, MAX_INFLATED_BYTES);
  const json = new TextDecoder().decode(inflated);
  return JSON.parse(json);
}
