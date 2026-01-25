import { jcsCanonicalize } from "./jcs";
import { base64UrlDecode, base64UrlEncode, hexToBytes, sha256Bytes, sha256Hex } from "./sha256";

export type VerificationReceipt = Readonly<{
  v: "KVR-1";
  bundleHash: string;
  zkPoseidonHash: string;
  verifiedAtPulse: number;
  verifier: string;
  verificationVersion: string;
}>;

export type VerificationSig = Readonly<{
  v: "KAS-1";
  scope: "verification-receipt";
  alg: "webauthn-es256";
  credId: string;
  pubKeyJwk: JsonWebKey;
  challenge: string;
  signature: string;
  authenticatorData: string;
  clientDataJSON: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isVerificationReceipt(value: unknown): value is VerificationReceipt {
  if (!isRecord(value)) return false;
  return (
    value.v === "KVR-1" &&
    typeof value.bundleHash === "string" &&
    typeof value.zkPoseidonHash === "string" &&
    typeof value.verifiedAtPulse === "number" &&
    Number.isFinite(value.verifiedAtPulse) &&
    typeof value.verifier === "string" &&
    typeof value.verificationVersion === "string"
  );
}

export function isVerificationSig(value: unknown): value is VerificationSig {
  if (!isRecord(value)) return false;
  return (
    value.v === "KAS-1" &&
    value.scope === "verification-receipt" &&
    value.alg === "webauthn-es256" &&
    typeof value.credId === "string" &&
    isRecord(value.pubKeyJwk) &&
    typeof value.challenge === "string" &&
    typeof value.signature === "string" &&
    typeof value.authenticatorData === "string" &&
    typeof value.clientDataJSON === "string"
  );
}

export function buildVerificationReceipt(params: {
  bundleHash: string;
  zkPoseidonHash: string;
  verifiedAtPulse: number;
  verifier: string;
  verificationVersion: string;
}): VerificationReceipt {
  return {
    v: "KVR-1",
    bundleHash: params.bundleHash,
    zkPoseidonHash: params.zkPoseidonHash,
    verifiedAtPulse: params.verifiedAtPulse,
    verifier: params.verifier,
    verificationVersion: params.verificationVersion,
  };
}

export async function hashVerificationReceipt(receipt: VerificationReceipt): Promise<string> {
  return await sha256Hex(jcsCanonicalize(receipt));
}

// Challenge derivation: base64url(bytes(receiptHash hex))
export function verificationReceiptChallenge(receiptHash: string): { challengeBytes: Uint8Array; challengeB64: string } {
  const challengeBytes = hexToBytes(receiptHash);
  return { challengeBytes, challengeB64: base64UrlEncode(challengeBytes) };
}

export async function assertReceiptHashMatch(receipt: unknown, receiptHash: string): Promise<void> {
  if (!receiptHash) return;
  if (!isVerificationReceipt(receipt)) {
    throw new Error("verification receipt mismatch");
  }
  const expected = await hashVerificationReceipt(receipt);
  if (expected !== receiptHash) {
    throw new Error("verification receipt mismatch");
  }
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function derToRawSignature(signature: Uint8Array, size: number): Uint8Array | null {
  if (signature.length < 8 || signature[0] !== 0x30) return null;
  const totalLength = signature[1];
  if (totalLength + 2 !== signature.length) return null;
  let offset = 2;
  if (signature[offset] !== 0x02) return null;
  const rLen = signature[offset + 1];
  offset += 2;
  const r = signature.slice(offset, offset + rLen);
  offset += rLen;
  if (signature[offset] !== 0x02) return null;
  const sLen = signature[offset + 1];
  offset += 2;
  const s = signature.slice(offset, offset + sLen);

  const rTrim = r[0] === 0x00 ? r.slice(1) : r;
  const sTrim = s[0] === 0x00 ? s.slice(1) : s;
  if (rTrim.length > size || sTrim.length > size) return null;

  const raw = new Uint8Array(size * 2);
  raw.set(rTrim, size - rTrim.length);
  raw.set(sTrim, size * 2 - sTrim.length);
  return raw;
}

async function importP256Jwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

export async function verifyVerificationSig(receiptHash: string, sig: VerificationSig): Promise<boolean> {
  try {
    const { challengeBytes, challengeB64 } = verificationReceiptChallenge(receiptHash);
    if (sig.challenge !== challengeB64) return false;

    const clientDataBytes = base64UrlDecode(sig.clientDataJSON);
    const clientDataText = new TextDecoder().decode(clientDataBytes);
    const parsed = JSON.parse(clientDataText) as { challenge?: string };
    if (parsed.challenge !== challengeB64) return false;

    const authenticatorData = base64UrlDecode(sig.authenticatorData);
    const clientDataHash = await sha256Bytes(clientDataBytes);
    const signedPayload = concatBytes(authenticatorData, clientDataHash);
    const signatureBytes = base64UrlDecode(sig.signature);

    const pubKey = await importP256Jwk(sig.pubKeyJwk);
    const derOk = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      toArrayBuffer(signatureBytes),
      toArrayBuffer(signedPayload)
    );
    if (derOk) return true;

    const rawSig = derToRawSignature(signatureBytes, 32);
    if (!rawSig) return false;
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      toArrayBuffer(rawSig),
      toArrayBuffer(signedPayload)
    );
  } catch {
    return false;
  }
}

export function verificationSigFromKas(sig: {
  v: "KAS-1";
  alg: "webauthn-es256";
  credId: string;
  pubKeyJwk: JsonWebKey;
  challenge: string;
  signature: string;
  authenticatorData: string;
  clientDataJSON: string;
}): VerificationSig {
  return {
    v: "KAS-1",
    scope: "verification-receipt",
    alg: sig.alg,
    credId: sig.credId,
    pubKeyJwk: sig.pubKeyJwk,
    challenge: sig.challenge,
    signature: sig.signature,
    authenticatorData: sig.authenticatorData,
    clientDataJSON: sig.clientDataJSON,
  };
}

export function kasSigFromVerification(sig: VerificationSig): {
  v: "KAS-1";
  alg: "webauthn-es256";
  credId: string;
  pubKeyJwk: JsonWebKey;
  challenge: string;
  signature: string;
  authenticatorData: string;
  clientDataJSON: string;
} {
  return {
    v: sig.v,
    alg: sig.alg,
    credId: sig.credId,
    pubKeyJwk: sig.pubKeyJwk,
    challenge: sig.challenge,
    signature: sig.signature,
    authenticatorData: sig.authenticatorData,
    clientDataJSON: sig.clientDataJSON,
  };
}
