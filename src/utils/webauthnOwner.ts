import { base64UrlDecode, base64UrlEncode, sha256Bytes } from "./sha256";

export type WebAuthnAssertionJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle: string | null;
  };
};

type ClientData = {
  type?: string;
  challenge?: string;
};

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

function parseClientData(clientDataJSON: string): ClientData | null {
  try {
    const parsed = JSON.parse(clientDataJSON) as ClientData;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function assertionToJson(credential: PublicKeyCredential): WebAuthnAssertionJSON {
  const response = credential.response as AuthenticatorAssertionResponse;
  const rawIdBytes = new Uint8Array(credential.rawId);
  const userHandleBytes = response.userHandle ? new Uint8Array(response.userHandle) : null;

  return {
    id: credential.id,
    rawId: base64UrlEncode(rawIdBytes),
    type: "public-key",
    response: {
      authenticatorData: base64UrlEncode(new Uint8Array(response.authenticatorData)),
      clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
      signature: base64UrlEncode(new Uint8Array(response.signature)),
      userHandle: userHandleBytes ? base64UrlEncode(userHandleBytes) : null,
    },
  };
}

export async function verifyOwnerWebAuthnAssertion(args: {
  assertion: WebAuthnAssertionJSON;
  expectedChallenge: Uint8Array;
  pubKeyJwk: JsonWebKey;
  expectedCredId: string;
}): Promise<boolean> {
  try {
    if (args.assertion.type !== "public-key") return false;
    if (args.expectedCredId && args.assertion.rawId !== args.expectedCredId) return false;

    const expectedChallengeB64 = base64UrlEncode(args.expectedChallenge);
    const clientDataBytes = base64UrlDecode(args.assertion.response.clientDataJSON);
    const clientDataText = new TextDecoder().decode(clientDataBytes);
    const clientData = parseClientData(clientDataText);
    if (!clientData) return false;
    if (clientData.type !== "webauthn.get") return false;
    if (clientData.challenge !== expectedChallengeB64) return false;

    const authenticatorData = base64UrlDecode(args.assertion.response.authenticatorData);
    const clientDataHash = await sha256Bytes(clientDataBytes);
    const signedPayload = concatBytes(authenticatorData, clientDataHash);
    const signatureBytes = base64UrlDecode(args.assertion.response.signature);

    const pubKey = await importP256Jwk(args.pubKeyJwk);
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      toArrayBuffer(signatureBytes),
      toArrayBuffer(signedPayload)
    );
    if (verified) return true;

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
