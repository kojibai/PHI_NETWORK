/* utils/webauthnKAS.ts
 *
 * KAS-1 Passkey Manager (WebAuthn ES256)
 * - Creates (or loads) a resident passkey bound to a ΦKey
 * - Signs a deterministic glyph challenge (glyphHash + origin + nonce)
 * - Verifies the signature offline using WebCrypto
 *
 * ✅ Fixes TS2322: ArrayBuffer | SharedArrayBuffer not assignable to BufferSource
 *    by *always* copying into a real ArrayBuffer for WebAuthn fields that require BufferSource.
 */

import { base64UrlDecode, base64UrlEncode, hexToBytes, sha256Bytes } from "./sha256";
import {
  deriveGlyphChallenge,
  getPhiAssertionForGlyph,
  registerPhiKey,
} from "./phiKey";
import type { KASAuthorSig } from "./authorSig";

export type StoredPasskey = {
  credId: string; // base64url(rawId)
  pubKeyJwk: JsonWebKey; // P-256 EC public key
  rpId?: string;
};

const STORE_PREFIX = "kai:kas1:passkey:";

function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

async function tryRequestPersistentStorage(): Promise<void> {
  try {
    if (!navigator.storage?.persist) return;
    const alreadyPersisted = await navigator.storage.persisted?.();
    if (alreadyPersisted) return;
    await navigator.storage.persist();
  } catch {
    // best-effort only
  }
}

function loadStored(phiKey: string): StoredPasskey | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${STORE_PREFIX}${phiKey}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const rec = parsed as { credId?: unknown; pubKeyJwk?: unknown; rpId?: unknown };
    if (typeof rec.credId !== "string") return null;
    if (!rec.pubKeyJwk || typeof rec.pubKeyJwk !== "object") return null;

    const rpId = typeof rec.rpId === "string" ? rec.rpId : undefined;
    return { credId: rec.credId, pubKeyJwk: rec.pubKeyJwk as JsonWebKey, rpId };
  } catch (err) {
    throw new Error(`Failed to read passkey cache: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function saveStored(phiKey: string, record: StoredPasskey): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORE_PREFIX}${phiKey}`, JSON.stringify(record));
}

function clearStored(phiKey: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${STORE_PREFIX}${phiKey}`);
}

/** Always return a *real* ArrayBuffer (never SharedArrayBuffer) by copying bytes. */
function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function derToRawSignature(signature: Uint8Array, size: number): Uint8Array | null {
  // Convert ASN.1/DER ECDSA signature into raw (r||s), size bytes each.
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

export async function derivePhiKeyUserId(phiKey: string): Promise<Uint8Array> {
  const userIdFull = await sha256Bytes(`KAS-1|phiKey|${phiKey}`);
  return userIdFull.slice(0, 16);
}

export function saveStoredPasskey(phiKey: string, record: StoredPasskey): void {
  saveStored(phiKey, record);
}

export function clearStoredPasskey(phiKey: string): void {
  clearStored(phiKey);
}

export async function ensurePasskey(phiKey: string): Promise<StoredPasskey> {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not available in this browser.");
  }

  await tryRequestPersistentStorage();

  const existing = loadStored(phiKey);
  if (existing) return existing;

  const userId = await derivePhiKeyUserId(phiKey);
  const created = await registerPhiKey({
    userId,
    userName: phiKey,
    displayName: phiKey,
  });
  if (!created.publicKeyJwk) {
    throw new Error("Passkey creation did not return a public key.");
  }

  const record: StoredPasskey = {
    credId: created.credentialId,
    pubKeyJwk: created.publicKeyJwk,
    rpId: created.rpId,
  };

  saveStored(phiKey, record);
  return record;
}

export async function signBundleHash(phiKey: string, bundleHash: string, glyphHash?: string): Promise<KASAuthorSig> {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not available in this browser.");
  }

  const stored = await ensurePasskey(phiKey);

  const glyphHashValue = glyphHash?.trim() || bundleHash;

  const signWithPasskey = async (active: StoredPasskey): Promise<KASAuthorSig> => {
    const assertionResult = await getPhiAssertionForGlyph({
      glyphHash: glyphHashValue,
      allowCredIds: [active.credId],
    });

    return {
      v: "KAS-1",
      alg: "webauthn-es256",
      credId: active.credId,
      pubKeyJwk: active.pubKeyJwk,
      challenge: assertionResult.challenge,
      signature: assertionResult.assertion.signature,
      authenticatorData: assertionResult.assertion.authenticatorData,
      clientDataJSON: assertionResult.assertion.clientDataJSON,
      glyphHash: assertionResult.glyphHash,
      requestingOrigin: assertionResult.requestingOrigin,
      nonce: assertionResult.nonce,
      assertion: assertionResult.assertion,
      rpMode: assertionResult.mode,
      rpId: assertionResult.rpId,
    };
  };

  try {
    return await signWithPasskey(stored);
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    // If the cached credId is stale (e.g., cleared by browser), refresh and retry once.
    // NOTE: NotAllowedError commonly indicates cancel/timeout; do not clear cached passkey.
    if (name === "NotFoundError" || name === "InvalidStateError") {
      clearStored(phiKey);
      const refreshed = await ensurePasskey(phiKey);
      return await signWithPasskey(refreshed);
    }
    throw err;
  }
}

export async function verifyBundleAuthorSig(bundleHash: string, authorSig: KASAuthorSig): Promise<boolean> {
  try {
    // 1) Challenge must match the expected derivation
    let expectedChallenge: Uint8Array;
    if (authorSig.glyphHash && authorSig.requestingOrigin && authorSig.nonce) {
      const derived = await deriveGlyphChallenge({
        glyphHash: authorSig.glyphHash,
        requestingOrigin: authorSig.requestingOrigin,
        nonce: authorSig.nonce,
      });
      if (authorSig.challenge !== derived.challengeB64) return false;
      expectedChallenge = derived.challengeBytes;
    } else {
      expectedChallenge = hexToBytes(bundleHash);
      const expectedChallengeB64 = base64UrlEncode(expectedChallenge);
      if (authorSig.challenge !== expectedChallengeB64) return false;
    }

    // 2) clientDataJSON.challenge must match expected challenge
    const clientDataBytes = base64UrlDecode(authorSig.clientDataJSON);
    const clientDataText = new TextDecoder().decode(clientDataBytes);

    const parsed = JSON.parse(clientDataText) as unknown;
    if (!parsed || typeof parsed !== "object") return false;
    const obj = parsed as { challenge?: unknown };
    if (typeof obj.challenge !== "string") return false;
    if (obj.challenge !== expectedChallengeB64) return false;

    // 3) Signed payload per WebAuthn: authenticatorData || SHA256(clientDataJSON)
    const authenticatorData = base64UrlDecode(authorSig.authenticatorData);
    const clientDataHash = await sha256Bytes(clientDataBytes);
    const signedPayload = concatBytes(authenticatorData, clientDataHash);

    const signatureBytes = base64UrlDecode(authorSig.signature);
    const pubKey = await importP256Jwk(authorSig.pubKeyJwk);

    // WebCrypto verify expects DER for ECDSA in most browsers.
    const derOk = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      bytesToArrayBuffer(signatureBytes),
      bytesToArrayBuffer(signedPayload)
    );
    if (derOk) return true;

    // Some environments might hand us DER but verifier expects raw, or vice versa.
    // Try raw (r||s) as fallback.
    const rawSig = derToRawSignature(signatureBytes, 32);
    if (!rawSig) return false;

    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      bytesToArrayBuffer(rawSig),
      bytesToArrayBuffer(signedPayload)
    );
  } catch {
    return false;
  }
}

export function isWebAuthnAvailable(): boolean {
  return isWebAuthnSupported();
}
