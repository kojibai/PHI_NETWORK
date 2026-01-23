import { decodeCbor } from "./cbor";
import { base64UrlDecode, base64UrlEncode, sha256Bytes } from "./sha256";

const CANONICAL_RP_ID = "phi.network";
const APP_NAME = "Phi Network";
const UPGRADE_MARKER_PREFIX = "phikey:upgraded:";

export type RpMode = "canonical" | "legacy";

export type PhiRegistrationResult = {
  credentialId: string;
  publicKeyJwk?: JsonWebKey;
  clientDataJSON: string;
  attestationObject: string;
  rpId: string;
};

export type PhiAssertionPayload = {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  userHandle: string | null;
};

export type PhiAssertionResult = {
  mode: RpMode;
  rpId: string;
  glyphHash: string;
  nonce: string;
  requestingOrigin: string;
  challenge: string;
  assertion: PhiAssertionPayload;
};

type AuthData = {
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
};

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function resolveCanonicalRpId(): string {
  if (typeof window === "undefined") return CANONICAL_RP_ID;
  const hostname = window.location.hostname;
  return isLocalhostHost(hostname) ? hostname : CANONICAL_RP_ID;
}

export function resolveRequestingOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function randomNonceB64u(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64UrlEncode(bytes);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

function toBufferSource(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  return value instanceof ArrayBuffer ? value : bytesToArrayBuffer(value);
}

function getCoseValue(key: unknown, label: number): unknown {
  if (key instanceof Map) return key.get(label);
  if (typeof key === "object" && key !== null) {
    const obj = key as Record<string, unknown>;
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

function parseAuthData(authData: Uint8Array): AuthData {
  if (authData.length < 37) {
    throw new Error("AuthData too short to contain attested credential data.");
  }

  const view = new DataView(authData.buffer, authData.byteOffset, authData.byteLength);
  const flags = authData[32];
  const hasAttestedCredData = (flags & 0x40) !== 0;
  if (!hasAttestedCredData) {
    throw new Error("Attestation missing credential data (AT flag not set).");
  }

  let offset = 37;
  offset += 16;

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
  if (!credentialPublicKey.length) {
    throw new Error("Credential public key missing from attestation data.");
  }

  return { credentialId, credentialPublicKey };
}

export async function deriveGlyphChallenge(args: {
  glyphHash: string;
  requestingOrigin?: string;
  nonce?: string;
}): Promise<{ nonce: string; requestingOrigin: string; challengeBytes: Uint8Array; challengeB64: string }>
{
  const nonce = args.nonce ?? randomNonceB64u();
  const requestingOrigin = args.requestingOrigin ?? resolveRequestingOrigin();
  const payload = `PHI_GLYPH_AUTH_V1|${args.glyphHash}|${requestingOrigin}|${nonce}`;
  const challengeBytes = await sha256Bytes(payload);
  return {
    nonce,
    requestingOrigin,
    challengeBytes,
    challengeB64: base64UrlEncode(challengeBytes),
  };
}

function canAttemptLegacyRpId(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  if (!hostname || isLocalhostHost(hostname)) return false;
  return resolveCanonicalRpId() !== hostname;
}

export async function tryLegacyAssertionIfNeeded(args: {
  challenge: Uint8Array;
  allowCredentials?: PublicKeyCredentialDescriptor[];
  userVerification?: UserVerificationRequirement;
  timeout?: number;
}): Promise<{ credential: PublicKeyCredential; mode: RpMode; rpId: string }>
{
  if (typeof navigator === "undefined" || !navigator.credentials?.get) {
    throw new Error("WebAuthn is not available in this environment.");
  }

  const rpId = resolveCanonicalRpId();
  const request = {
    challenge: toBufferSource(args.challenge),
    allowCredentials: args.allowCredentials,
    userVerification: args.userVerification,
    timeout: args.timeout,
    rpId,
  } satisfies PublicKeyCredentialRequestOptions;

  try {
    const assertion = (await navigator.credentials.get({ publicKey: request })) as PublicKeyCredential | null;
    if (!assertion) throw new Error("Signature request was canceled or failed.");
    return { credential: assertion, mode: "canonical", rpId };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if ((name === "SecurityError" || name === "NotAllowedError") && canAttemptLegacyRpId()) {
      const legacyRpId = window.location.hostname;
      const legacyRequest = { ...request, rpId: legacyRpId };
      const assertion = (await navigator.credentials.get({ publicKey: legacyRequest })) as PublicKeyCredential | null;
      if (!assertion) throw new Error("Signature request was canceled or failed.");
      return { credential: assertion, mode: "legacy", rpId: legacyRpId };
    }
    throw err;
  }
}

export async function getPhiAssertionForGlyph(args: {
  glyphHash: string;
  allowCredIds?: string[];
}): Promise<PhiAssertionResult> {
  const { challengeBytes, challengeB64, nonce, requestingOrigin } = await deriveGlyphChallenge({
    glyphHash: args.glyphHash,
  });

  const allowCredentials = args.allowCredIds?.length
    ? args.allowCredIds.map((id) => ({
        id: toBufferSource(base64UrlDecode(id)),
        type: "public-key" as const,
      }))
    : undefined;

  const { credential, mode, rpId } = await tryLegacyAssertionIfNeeded({
    challenge: challengeBytes,
    allowCredentials,
    userVerification: "required",
    timeout: 60_000,
  });

  const response = credential.response as AuthenticatorAssertionResponse;
  const userHandleBytes = response.userHandle ? new Uint8Array(response.userHandle) : null;

  return {
    mode,
    rpId,
    glyphHash: args.glyphHash,
    nonce,
    requestingOrigin,
    challenge: challengeB64,
    assertion: {
      credentialId: base64UrlEncode(new Uint8Array(credential.rawId)),
      authenticatorData: base64UrlEncode(new Uint8Array(response.authenticatorData)),
      clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
      signature: base64UrlEncode(new Uint8Array(response.signature)),
      userHandle: userHandleBytes ? base64UrlEncode(userHandleBytes) : null,
    },
  };
}

export async function registerPhiKey(args: {
  userId: string | Uint8Array;
  userName: string;
  displayName: string;
}): Promise<PhiRegistrationResult> {
  if (typeof navigator === "undefined" || !navigator.credentials?.create) {
    throw new Error("WebAuthn is not available in this environment.");
  }

  const userIdBytes = typeof args.userId === "string" ? new TextEncoder().encode(args.userId) : args.userId;
  const rpId = resolveCanonicalRpId();
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const created = (await navigator.credentials.create({
    publicKey: {
      challenge: toBufferSource(challenge),
      rp: {
        id: rpId,
        name: APP_NAME,
      },
      user: {
        id: toBufferSource(userIdBytes),
        name: args.userName,
        displayName: args.displayName,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "required",
        requireResidentKey: true,
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!created) {
    throw new Error("Passkey creation was canceled or failed.");
  }

  const response = created.response as AuthenticatorAttestationResponse;
  const attestationObjectBytes = new Uint8Array(response.attestationObject);
  const decoded = decodeCbor(attestationObjectBytes);
  const authData = readAuthDataFromAttestation(decoded);
  const parsed = parseAuthData(authData);
  const coseKeyDecoded = decodeCbor(parsed.credentialPublicKey);
  const publicKeyJwk = coseEc2ToJwk(coseKeyDecoded);

  return {
    credentialId: base64UrlEncode(new Uint8Array(created.rawId)),
    publicKeyJwk,
    clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
    attestationObject: base64UrlEncode(attestationObjectBytes),
    rpId,
  };
}

export function shouldPromptUpgrade(userStableId: string, mode: RpMode): boolean {
  if (mode !== "legacy") return false;
  if (typeof window === "undefined") return false;
  return !window.localStorage.getItem(`${UPGRADE_MARKER_PREFIX}${userStableId}`);
}

export function markUpgraded(userStableId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${UPGRADE_MARKER_PREFIX}${userStableId}`, "1");
}
