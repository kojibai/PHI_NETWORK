import { jcsCanonicalize, type JsonValue } from "./jcs";
import { sha256Hex } from "./sha256";
import { embedProofMetadata } from "./svgProof";
import { hashProofCapsuleV1, hashSvgText, type ProofCapsuleV1 } from "../components/KaiVoh/verifierProof";

export type CanonicalBundleObject = {
  v: "KPB-2";
  hashAlg: "sha256";
  canon: "JCS";
  proofCapsule: ProofCapsuleV1;
  capsuleHash: string;
  svgHash: string;
  zk: {
    scheme: "groth16-poseidon";
    curve: "bn128";
    poseidonPublic: string | null;
    publicInputs: unknown | null;
  };
};

export type CanonicalProofBundle = {
  hashAlg: "sha256";
  canon: "JCS";
  proofCapsule: ProofCapsuleV1;
  capsuleHash: string;
  svgHash: string;
  bundleHash: string;
  zk: {
    scheme: "groth16-poseidon";
    curve: "bn128";
    zkPoseidonHash: string | null;
    zkPublicInputs: unknown | null;
    zkProof: unknown | null;
    zkProofHash: string | null;
  };
};

export type CanonicalManifest = {
  v: "KGM-1";
  hashAlg: "sha256";
  canon: "JCS";
  bundleHash: string;
  capsuleHash: string;
  svgHash: string;
  assets: Record<string, string>;
};

export type CanonicalBundleInputs = {
  svgText: string;
  pngBytes: Uint8Array;
  proofCapsule: ProofCapsuleV1;
  zkPoseidonHash?: string | null;
  zkProof?: unknown | null;
  zkPublicInputs?: unknown | null;
};

export type CanonicalBundleOutput = {
  bundleHash: string;
  svgHash: string;
  capsuleHash: string;
  canonicalBundleObject: CanonicalBundleObject;
  canonicalBundleJcs: string;
  proofBundle: CanonicalProofBundle;
  manifest: CanonicalManifest;
  svgText: string;
  svgBytes: Uint8Array;
  pngBytes: Uint8Array;
  proofBundleJson: string;
  manifestJson: string;
  baseName: string;
  zkProofHash: string | null;
};

function normalizeOptional(value: unknown): unknown | null {
  return value === undefined ? null : value;
}

export function buildCanonicalBundleObject(args: {
  proofCapsule: ProofCapsuleV1;
  capsuleHash: string;
  svgHash: string;
  zkPoseidonHash?: string | null;
  zkPublicInputs?: unknown | null;
}): CanonicalBundleObject {
  return {
    v: "KPB-2",
    hashAlg: "sha256",
    canon: "JCS",
    proofCapsule: args.proofCapsule,
    capsuleHash: args.capsuleHash,
    svgHash: args.svgHash,
    zk: {
      scheme: "groth16-poseidon",
      curve: "bn128",
      poseidonPublic: (normalizeOptional(args.zkPoseidonHash) as string | null) ?? null,
      publicInputs: normalizeOptional(args.zkPublicInputs),
    },
  };
}

export async function hashCanonicalBundleObject(bundleObject: CanonicalBundleObject): Promise<{ jcs: string; hash: string }> {
  const jcs = jcsCanonicalize(bundleObject as unknown as JsonValue);
  const hash = await sha256Hex(jcs);
  return { jcs, hash: hash.toLowerCase() };
}

export async function computeZkProofHash(zkProof: unknown | null | undefined): Promise<string | null> {
  if (zkProof === undefined || zkProof === null) return null;
  const jcs = jcsCanonicalize(zkProof as JsonValue);
  const hash = await sha256Hex(jcs);
  return hash.toLowerCase();
}

export function buildCanonicalProofBundle(args: {
  proofCapsule: ProofCapsuleV1;
  capsuleHash: string;
  svgHash: string;
  zkPoseidonHash?: string | null;
  zkProof?: unknown | null;
  zkPublicInputs?: unknown | null;
  zkProofHash?: string | null;
  bundleHash: string;
}): CanonicalProofBundle {
  return {
    hashAlg: "sha256",
    canon: "JCS",
    proofCapsule: args.proofCapsule,
    capsuleHash: args.capsuleHash,
    svgHash: args.svgHash,
    bundleHash: args.bundleHash,
    zk: {
      scheme: "groth16-poseidon",
      curve: "bn128",
      zkPoseidonHash: (normalizeOptional(args.zkPoseidonHash) as string | null) ?? null,
      zkPublicInputs: normalizeOptional(args.zkPublicInputs),
      zkProof: normalizeOptional(args.zkProof),
      zkProofHash: (normalizeOptional(args.zkProofHash) as string | null) ?? null,
    },
  };
}

export function buildCanonicalManifest(args: {
  bundleHash: string;
  capsuleHash: string;
  svgHash: string;
  assets: Record<string, string>;
}): CanonicalManifest {
  return {
    v: "KGM-1",
    hashAlg: "sha256",
    canon: "JCS",
    bundleHash: args.bundleHash,
    capsuleHash: args.capsuleHash,
    svgHash: args.svgHash,
    assets: args.assets,
  };
}

export async function buildCanonicalGlyphBundle(inputs: CanonicalBundleInputs): Promise<CanonicalBundleOutput> {
  const svgHash = await hashSvgText(inputs.svgText);
  const capsuleHash = await hashProofCapsuleV1(inputs.proofCapsule);
  const zkProofHash = await computeZkProofHash(inputs.zkProof ?? null);

  const canonicalBundleObject = buildCanonicalBundleObject({
    proofCapsule: inputs.proofCapsule,
    capsuleHash,
    svgHash,
    zkPoseidonHash: inputs.zkPoseidonHash ?? null,
    zkPublicInputs: inputs.zkPublicInputs ?? null,
  });

  const { jcs, hash } = await hashCanonicalBundleObject(canonicalBundleObject);
  const bundleHash = hash;

  const proofBundle = buildCanonicalProofBundle({
    proofCapsule: inputs.proofCapsule,
    capsuleHash,
    svgHash,
    zkPoseidonHash: inputs.zkPoseidonHash ?? null,
    zkProof: inputs.zkProof ?? null,
    zkPublicInputs: inputs.zkPublicInputs ?? null,
    zkProofHash,
    bundleHash,
  });

  const sealedSvg = embedProofMetadata(inputs.svgText, proofBundle);
  const svgBytes = new TextEncoder().encode(sealedSvg);

  const baseName = `sigil_${bundleHash.slice(0, 12)}`;
  const svgAssetHash = await sha256Hex(svgBytes);
  const pngAssetHash = await sha256Hex(inputs.pngBytes);

  const manifest = buildCanonicalManifest({
    bundleHash,
    capsuleHash,
    svgHash,
    assets: {
      [`${baseName}.svg`]: svgAssetHash,
      [`${baseName}.png`]: pngAssetHash,
    },
  });

  return {
    bundleHash,
    svgHash,
    capsuleHash,
    canonicalBundleObject,
    canonicalBundleJcs: jcs,
    proofBundle,
    manifest,
    svgText: sealedSvg,
    svgBytes,
    pngBytes: inputs.pngBytes,
    proofBundleJson: JSON.stringify(proofBundle, null, 2),
    manifestJson: JSON.stringify(manifest, null, 2),
    baseName,
    zkProofHash,
  };
}
