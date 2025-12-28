import { decodeCbor } from "./cbor";
import { base64UrlDecode, base64UrlEncode, sha256Bytes } from "./sha256";

export type StoredPasskey = {
  credId: string;
  pubKeyJwk: JsonWebKey;
};

type AuthData = {
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
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

function loadStored(phiKey: string): StoredPasskey | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${STORE_PREFIX}${phiKey}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPasskey;
    if (typeof parsed?.credId !== "string" || !parsed.pubKeyJwk) return null;
    return parsed;
  } catch (err) {
    throw new Error(`Failed to read passkey cache: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function saveStored(phiKey: string, record: StoredPasskey): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORE_PREFIX}${phiKey}`, JSON.stringify(record));
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
  offset += 16; // AAGUID
  const credIdLen = view.getUint16(offset, false);
  offset += 2;
  const credentialId = authData.slice(offset, offset + credIdLen);
  offset += credIdLen;
  const credentialPublicKey = authData.slice(offset);
  if (!credentialPublicKey.length) {
    throw new Error("Credential public key missing from attestation data.");
  }
  return { credentialId, credentialPublicKey };
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

export async function ensurePasskey(phiKey: string): Promise<StoredPasskey> {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not available in this browser.");
  }

  const existing = loadStored(phiKey);
  if (existing) return existing;

  const userIdFull = await sha256Bytes(`KAS-1|phiKey|${phiKey}`);
  const userId = userIdFull.slice(0, 16);
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const credential = (await navigator.credentials.create({
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

  if (!credential) {
    throw new Error("Passkey creation was canceled or failed.");
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const attestationObject = new Uint8Array(response.attestationObject);
  const decoded = decodeCbor(attestationObject);
  const authDataRaw = decoded instanceof Map ? decoded.get("authData") : null;
  if (!authDataRaw) {
    throw new Error("Attestation missing authData.");
  }
  const authData =
    authDataRaw instanceof Uint8Array
      ? authDataRaw
      : authDataRaw instanceof ArrayBuffer
        ? new Uint8Array(authDataRaw)
        : (() => {
            throw new Error("Attestation authData is not a byte array.");
          })();
  const parsed = parseAuthData(authData);
  const coseKey = decodeCbor(parsed.credentialPublicKey);
  const pubKeyJwk = coseEc2ToJwk(coseKey);

  const record: StoredPasskey = {
    credId: base64UrlEncode(new Uint8Array(credential.rawId)),
    pubKeyJwk,
  };
  saveStored(phiKey, record);
  return record;
}

export async function signBundleHash(phiKey: string, bundleHash: string) {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not available in this browser.");
  }
  const stored = loadStored(phiKey);
  if (!stored) {
    throw new Error("No passkey found for this Φ-Key. Please register first.");
  }

  const credIdBytes = base64UrlDecode(stored.credId);
  const challengeBytes = await sha256Bytes(`KAS-1|bundleHash|${bundleHash}`);

  const challenge = challengeBytes.slice();
  const allowId = credIdBytes.slice();

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: allowId, type: "public-key" }],
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error("Signature request was canceled or failed.");
  }

  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    v: "KAS-1",
    alg: "webauthn-es256",
    credId: stored.credId,
    pubKeyJwk: stored.pubKeyJwk,
    challenge: base64UrlEncode(challengeBytes),
    signature: base64UrlEncode(new Uint8Array(response.signature)),
    authenticatorData: base64UrlEncode(new Uint8Array(response.authenticatorData)),
    clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
  };
}

export function isWebAuthnAvailable(): boolean {
  return isWebAuthnSupported();
}
