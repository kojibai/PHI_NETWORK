/* utils/webauthnKAS.ts
 *
 * KAS-1 Passkey Manager (WebAuthn ES256)
 * - Creates (or loads) a resident passkey bound to a ΦKey
 * - Signs a deterministic challenge (bundleHash bytes)
 * - Verifies the signature offline using WebCrypto
 *
 * ✅ Fixes TS2322: ArrayBuffer | SharedArrayBuffer not assignable to BufferSource
 *    by *always* copying into a real ArrayBuffer for WebAuthn fields that require BufferSource.
 */

import { decodeCbor } from "./cbor";
import { base64UrlDecode, base64UrlEncode, hexToBytes, sha256Bytes } from "./sha256";
import type { KASAuthorSig } from "./authorSig";

export type StoredPasskey = {
  credId: string; // base64url(rawId)
  pubKeyJwk: JsonWebKey; // P-256 EC public key
};

type AuthData = {
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array; // COSE_Key bytes
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

    const rec = parsed as { credId?: unknown; pubKeyJwk?: unknown };
    if (typeof rec.credId !== "string") return null;
    if (!rec.pubKeyJwk || typeof rec.pubKeyJwk !== "object") return null;

    return { credId: rec.credId, pubKeyJwk: rec.pubKeyJwk as JsonWebKey };
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

function parseAuthData(authData: Uint8Array): AuthData {
  // https://www.w3.org/TR/webauthn-2/#sctn-attested-credential-data
  // authData: 32 rpIdHash + 1 flags + 4 signCount + [attestedCredData if AT flag] + extensions?
  if (authData.length < 37) {
    throw new Error("AuthData too short to contain attested credential data.");
  }

  const view = new DataView(authData.buffer, authData.byteOffset, authData.byteLength);
  const flags = authData[32];
  const hasAttestedCredData = (flags & 0x40) !== 0; // AT flag

  if (!hasAttestedCredData) {
    throw new Error("Attestation missing credential data (AT flag not set).");
  }

  let offset = 37;
  offset += 16; // AAGUID

  if (offset + 2 > authData.length) {
    throw new Error("AuthData missing credentialId length.");
  }

  const credIdLen = view.getUint16(offset, false);
  offset += 2;

  if (offset + credIdLen > authData.length) {
    throw new Error("AuthData credentialId length out of bounds.");
  }

  const credentialId = authData.slice(offset, offset + credIdLen);
  offset += credIdLen;

  const credentialPublicKey = authData.slice(offset);
  if (credentialPublicKey.length === 0) {
    throw new Error("Credential public key missing from attestation data.");
  }

  return { credentialId, credentialPublicKey };
}

function getCoseValue(key: unknown, label: number): unknown {
  if (key instanceof Map) return key.get(label);
  if (typeof key === "object" && key !== null) {
    const obj = key as Record<string, unknown>;
    // some CBOR decoders may string-coerce numeric keys
    return obj[label] ?? obj[String(label)];
  }
  return undefined;
}

function bytesFromCose(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  throw new Error("Invalid COSE coordinate data.");
}

function coseEc2ToJwk(coseKey: unknown): JsonWebKey {
  const x = bytesFromCose(getCoseValue(coseKey, -2));
  const y = bytesFromCose(getCoseValue(coseKey, -3));

  return {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    ext: true,
  };
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

function readAuthDataFromAttestation(decoded: unknown): Uint8Array {
  const authDataRaw: unknown =
    decoded instanceof Map ? decoded.get("authData") : typeof decoded === "object" && decoded !== null
      ? (decoded as Record<string, unknown>)["authData"]
      : undefined;

  if (!authDataRaw) {
    throw new Error("Attestation missing authData.");
  }

  if (authDataRaw instanceof Uint8Array) return authDataRaw;
  if (authDataRaw instanceof ArrayBuffer) return new Uint8Array(authDataRaw);
  if (Array.isArray(authDataRaw)) return new Uint8Array(authDataRaw);

  throw new Error("Attestation authData is not a byte array.");
}

export async function ensurePasskey(phiKey: string): Promise<StoredPasskey> {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not available in this browser.");
  }

  await tryRequestPersistentStorage();

  const existing = loadStored(phiKey);
  if (existing) return existing;

  // Deterministic user.id from phiKey (resident passkey user handle)
  const userIdFull = await sha256Bytes(`KAS-1|phiKey|${phiKey}`);
  const userId = userIdFull.slice(0, 16);

  // Per-create challenge must be fresh random
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const created = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: "Kai-Voh",
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: phiKey,
        displayName: phiKey,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "required",
        requireResidentKey: true,
      },
      timeout: 60_000,
      attestation: "none",
    },
  });

  const credential = (created ?? null) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("Passkey creation was canceled or failed.");
  }

  const response = credential.response as AuthenticatorAttestationResponse;

  const attestationObjectBytes = new Uint8Array(response.attestationObject);
  const decoded = decodeCbor(attestationObjectBytes);

  const authData = readAuthDataFromAttestation(decoded);
  const parsed = parseAuthData(authData);

  const coseKeyDecoded = decodeCbor(parsed.credentialPublicKey);
  const pubKeyJwk = coseEc2ToJwk(coseKeyDecoded);

  const record: StoredPasskey = {
    credId: base64UrlEncode(new Uint8Array(credential.rawId)),
    pubKeyJwk,
  };

  saveStored(phiKey, record);
  return record;
}

export async function signBundleHash(phiKey: string, bundleHash: string): Promise<KASAuthorSig> {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not available in this browser.");
  }

  const stored = await ensurePasskey(phiKey);

  // Deterministic challenge: bundleHash hex -> bytes
  const challengeBytes = hexToBytes(bundleHash);
  const challenge = challengeBytes.slice(); // Uint8Array copy

  const signWithPasskey = async (active: StoredPasskey): Promise<KASAuthorSig> => {
    const allowIdBytes = base64UrlDecode(active.credId);

    // ✅ FIX: WebAuthn wants BufferSource; TS sees allowIdBytes.buffer as ArrayBuffer|SharedArrayBuffer.
    // Always pass a *real* ArrayBuffer by copying bytes.
    const allowId = bytesToArrayBuffer(allowIdBytes);

    const got = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: allowId, type: "public-key" }],
        userVerification: "required",
      },
    });

    const assertion = (got ?? null) as PublicKeyCredential | null;
    if (!assertion) {
      throw new Error("Signature request was canceled or failed.");
    }

    const response = assertion.response as AuthenticatorAssertionResponse;

    return {
      v: "KAS-1",
      alg: "webauthn-es256",
      credId: active.credId,
      pubKeyJwk: active.pubKeyJwk,
      challenge: base64UrlEncode(challengeBytes),
      signature: base64UrlEncode(new Uint8Array(response.signature)),
      authenticatorData: base64UrlEncode(new Uint8Array(response.authenticatorData)),
      clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
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
    // 1) Challenge must match bundleHash bytes (deterministic)
    const expectedChallenge = hexToBytes(bundleHash);
    const expectedChallengeB64 = base64UrlEncode(expectedChallenge);
    if (authorSig.challenge !== expectedChallengeB64) return false;

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
