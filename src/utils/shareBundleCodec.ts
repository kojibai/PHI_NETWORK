import { deflateRawSync, inflateRawSync } from "fflate";
import { base64UrlDecode, base64UrlEncode } from "./sha256";
import { jcsCanonicalize } from "./jcs";

const SHARE_PREFIX = "c1:";

export function encodeSharePayload(bundle: unknown): string {
  const json = jcsCanonicalize(bundle as Parameters<typeof jcsCanonicalize>[0]);
  const bytes = new TextEncoder().encode(json);
  const compressed = deflateRawSync(bytes, { level: 9 });
  return `${SHARE_PREFIX}${base64UrlEncode(compressed)}`;
}

export function decodeSharePayload(payload: string): unknown {
  if (!payload) throw new Error("Missing share payload.");
  if (!payload.startsWith(SHARE_PREFIX)) {
    throw new Error("Unsupported share payload version.");
  }
  const encoded = payload.slice(SHARE_PREFIX.length);
  const compressed = base64UrlDecode(encoded);
  const inflated = inflateRawSync(compressed);
  const json = new TextDecoder().decode(inflated);
  return JSON.parse(json);
}
