import { jcsCanonicalize, type JsonValue } from "./jcs";
import { base64UrlDecode, base64UrlEncode, hexToBytes, sha256Bytes, sha256Hex } from "./sha256";
import type { KASAuthorSig } from "./authorSig";
import type { ProofCapsuleV1 } from "../components/KaiVoh/verifierProof";
import type { CanonicalBundleObject } from "./canonicalGlyphBundle";

export type KasAttestation = {
  v: "KAS-ATT-1";
  kind: "presence.attestation";
  ref: {
    bundleHash: string;
    bundleObjectHash: string;
    capsuleHash: string;
    svgHash: string;
    verifierSlug: string;
    pulse: number;
    chakraDay: string;
    phiKey: string;
    kaiSignature: string;
  };
  authorSig: KASAuthorSig;
  meta: {
    origin: string;
    rpId: string;
    createdAtPulse: number;
  };
};

function toBase64Url(bytes: Uint8Array): string {
  return base64UrlEncode(bytes);
}

function parseClientDataOrigin(authorSig: KASAuthorSig): string {
  const clientDataBytes = base64UrlDecode(authorSig.clientDataJSON);
  const clientDataText = new TextDecoder().decode(clientDataBytes);
  const parsed = JSON.parse(clientDataText) as { origin?: unknown };
  if (!parsed || typeof parsed.origin !== "string") {
    throw new Error("Invalid clientDataJSON origin.");
  }
  return parsed.origin;
}

export async function computeBundleObjectHash(bundleObject: CanonicalBundleObject): Promise<string> {
  const jcs = jcsCanonicalize(bundleObject as unknown as JsonValue);
  const hash = await sha256Hex(jcs);
  return hash.toLowerCase();
}

export async function computeCredId8(credId: string): Promise<string> {
  const credBytes = base64UrlDecode(credId);
  const hashBytes = await sha256Bytes(credBytes);
  const encoded = toBase64Url(hashBytes);
  return encoded.slice(0, 8);
}

export async function makeKasAttestationFilename(args: {
  verifierSlug: string;
  bundleHash: string;
  credId: string;
  pulse: number;
  existingNames?: Set<string> | string[];
}): Promise<string> {
  const bundleHash12 = args.bundleHash.slice(0, 12).toLowerCase();
  const credId8 = await computeCredId8(args.credId);
  const base = `kas_v1__${args.verifierSlug}__${bundleHash12}__${credId8}__p${args.pulse}`;
  const existingSet = Array.isArray(args.existingNames)
    ? new Set(args.existingNames)
    : args.existingNames ?? new Set();

  let candidate = `${base}.json`;
  if (!existingSet.has(candidate)) return candidate;

  let n = 2;
  while (existingSet.has(`${base}__n${n}.json`)) n += 1;
  return `${base}__n${n}.json`;
}

export async function makeKasAttestationJson(args: {
  bundleHash: string;
  canonicalBundleObject: CanonicalBundleObject;
  proofCapsule: ProofCapsuleV1;
  capsuleHash: string;
  svgHash: string;
  authorSig: KASAuthorSig;
  rpId: string;
}): Promise<KasAttestation> {
  const expectedChallenge = toBase64Url(hexToBytes(args.bundleHash));
  if (args.authorSig.challenge !== expectedChallenge) {
    throw new Error("authorSig.challenge does not match bundle hash.");
  }

  const bundleObjectHash = await computeBundleObjectHash(args.canonicalBundleObject);
  if (bundleObjectHash !== args.bundleHash.toLowerCase()) {
    throw new Error("bundleObjectHash does not match bundleHash.");
  }

  const origin = parseClientDataOrigin(args.authorSig);

  return {
    v: "KAS-ATT-1",
    kind: "presence.attestation",
    ref: {
      bundleHash: args.bundleHash.toLowerCase(),
      bundleObjectHash,
      capsuleHash: args.capsuleHash.toLowerCase(),
      svgHash: args.svgHash.toLowerCase(),
      verifierSlug: args.proofCapsule.verifierSlug,
      pulse: args.proofCapsule.pulse,
      chakraDay: args.proofCapsule.chakraDay,
      phiKey: args.proofCapsule.phiKey,
      kaiSignature: args.proofCapsule.kaiSignature,
    },
    authorSig: args.authorSig,
    meta: {
      origin,
      rpId: args.rpId,
      createdAtPulse: args.proofCapsule.pulse,
    },
  };
}
