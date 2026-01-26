import { b64u, phiFromPublicKey } from "../components/VerifierStamper/crypto";
import { isKASAuthorSig, type KASAuthorSig } from "./authorSig";
import { base64UrlDecode, base64UrlEncode, sha256Bytes } from "./sha256";

type VerificationErrorCode =
  | "credential-unavailable"
  | "webauthn-unavailable"
  | "missing-owner-sig"
  | "phiKey-mismatch"
  | "credential-mismatch"
  | "client-data-mismatch"
  | "rpId-mismatch"
  | "signature-failed"
  | "assertion-invalid";

type VerificationResult =
  | { ok: true }
  | { ok: false; error: string; errorCode: VerificationErrorCode };

type NavigatorWithCredentials = Navigator & { credentials: CredentialsContainer };

function getNavigatorCredentials(): CredentialsContainer | null {
  if (typeof navigator === "undefined") return null;
  if ("credentials" in navigator) {
    const nav = navigator as NavigatorWithCredentials;
    return nav.credentials ?? null;
  }
  return null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
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

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
}

async function derivePhiKeyFromJwk(jwk: JsonWebKey): Promise<string> {
  const key = await importP256Jwk(jwk);
  const spki = await crypto.subtle.exportKey("spki", key);
  const spkiB64u = b64u.encode(new Uint8Array(spki));
  return phiFromPublicKey(spkiB64u);
}

function isCredentialUnavailableError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === "NotAllowedError" || err.name === "InvalidStateError" || err.name === "SecurityError";
}

export async function verifyOwnerViaEmbeddedWebAuthn(args: {
  ownerAuthorSig: KASAuthorSig | null | undefined;
  expectedPhiKey: string;
  rpId?: string;
}): Promise<VerificationResult> {
  if (!args.ownerAuthorSig || !isKASAuthorSig(args.ownerAuthorSig)) {
    return { ok: false, error: "Owner/Auth signer missing on glyph.", errorCode: "missing-owner-sig" };
  }

  const expectedPhiKey = args.expectedPhiKey.trim();
  if (!expectedPhiKey) {
    return { ok: false, error: "Glyph ΦKey missing.", errorCode: "phiKey-mismatch" };
  }

  try {
    const derivedPhiKey = await derivePhiKeyFromJwk(args.ownerAuthorSig.pubKeyJwk);
    if (derivedPhiKey !== expectedPhiKey) {
      return { ok: false, error: "Signer ΦKey does not match glyph ΦKey.", errorCode: "phiKey-mismatch" };
    }
  } catch {
    return { ok: false, error: "Signer ΦKey derivation failed.", errorCode: "phiKey-mismatch" };
  }

  const credentials = getNavigatorCredentials();
  if (!credentials?.get) {
    return { ok: false, error: "WebAuthn is not available in this environment.", errorCode: "webauthn-unavailable" };
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const allowCredId = base64UrlDecode(args.ownerAuthorSig.credId);

  let assertion: PublicKeyCredential | null = null;
  try {
    assertion = (await credentials.get({
      publicKey: {
        challenge: toArrayBuffer(challenge),
        allowCredentials: [{ type: "public-key", id: toArrayBuffer(allowCredId) }],
        userVerification: "required",
        timeout: 60_000,
        ...(args.rpId ? { rpId: args.rpId } : {}),
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    if (isCredentialUnavailableError(err)) {
      return {
        ok: false,
        error: "Signer credential not available on this device.",
        errorCode: "credential-unavailable",
      };
    }
    return { ok: false, error: "Signature request was canceled or failed.", errorCode: "assertion-invalid" };
  }

  if (!assertion || assertion.type !== "public-key") {
    return { ok: false, error: "Signature request was canceled or failed.", errorCode: "assertion-invalid" };
  }

  const response = assertion.response as AuthenticatorAssertionResponse;
  const rawIdBytes = new Uint8Array(assertion.rawId);
  if (!bytesEqual(rawIdBytes, allowCredId)) {
    return { ok: false, error: "Signer credential does not match glyph.", errorCode: "credential-mismatch" };
  }

  const clientDataBytes = new Uint8Array(response.clientDataJSON);
  let clientData: { type?: string; challenge?: string } | null = null;
  try {
    const clientText = new TextDecoder().decode(clientDataBytes);
    clientData = JSON.parse(clientText) as { type?: string; challenge?: string };
  } catch {
    return { ok: false, error: "Client data JSON invalid.", errorCode: "client-data-mismatch" };
  }

  const expectedChallenge = base64UrlEncode(challenge);
  if (clientData?.type !== "webauthn.get" || clientData.challenge !== expectedChallenge) {
    return { ok: false, error: "Client data mismatch.", errorCode: "client-data-mismatch" };
  }

  const authenticatorData = new Uint8Array(response.authenticatorData);
  if (args.rpId) {
    const expectedRpIdHash = await sha256Bytes(args.rpId);
    if (authenticatorData.length < 32 || !bytesEqual(authenticatorData.slice(0, 32), expectedRpIdHash)) {
      return { ok: false, error: "RPID hash mismatch.", errorCode: "rpId-mismatch" };
    }
  }

  const clientDataHash = await sha256Bytes(clientDataBytes);
  const signedPayload = concatBytes(authenticatorData, clientDataHash);
  const signatureBytes = new Uint8Array(response.signature);
  const pubKey = await importP256Jwk(args.ownerAuthorSig.pubKeyJwk);

  const derOk = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pubKey,
    toArrayBuffer(signatureBytes),
    toArrayBuffer(signedPayload)
  );
  if (derOk) return { ok: true };

  const rawSig = derToRawSignature(signatureBytes, 32);
  if (!rawSig) {
    return { ok: false, error: "Signature verification failed.", errorCode: "signature-failed" };
  }
  const rawOk = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pubKey,
    toArrayBuffer(rawSig),
    toArrayBuffer(signedPayload)
  );
  return rawOk ? { ok: true } : { ok: false, error: "Signature verification failed.", errorCode: "signature-failed" };
}
