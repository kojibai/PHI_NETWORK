// /components/KaiVoh/verifierProof.ts
"use client";

/**
 * verifierProof — shared helpers for VerifierFrame + KaiVoh embedding
 * v3.0 — Proof Capsule Hash (KPV-1) + deterministic canonicalization
 *
 * What’s new:
 * ✅ Adds KPV-1 proof capsule + sha256 proofHash helpers
 * ✅ Hash binds: pulse + chakraDay + kaiSignature + phiKey + verifierSlug (domain-stable)
 * ✅ verifierUrl is still produced, but NOT part of the hash (so localhost vs kai.ac doesn’t break proof)
 * ✅ Keeps all prior exports stable
 */

import type { ChakraDay } from "../../utils/kai_pulse";
import { jcsCanonicalize } from "../../utils/jcs";
import { base64UrlEncode, hexToBytes, sha256Hex } from "../../utils/sha256";
import { svgCanonicalForHash } from "../../utils/svgProof";
import type { AuthorSig } from "../../utils/authorSig";

export const PROOF_HASH_ALG = "sha256" as const;
export const PROOF_CANON = "JCS" as const;
export const PROOF_METADATA_ID = "kai-voh-proof" as const;
export const VERIFICATION_BUNDLE_VERSION = "KVB-1.2" as const;
export const PROOF_BINDINGS = {
  capsuleHashOf: "JCS(proofCapsule)",
  bundleHashOf: "sha256(JCS(bundleRoot))",
  authorChallengeOf: "base64url(bytes(bundleHash))",
} as const;
export const ZK_STATEMENT_BINDING = "Poseidon(capsuleHash|svgHash|domainTag)" as const;
export const ZK_STATEMENT_DOMAIN = "kairos.sigil.zk.v1" as const;
export const ZK_PUBLIC_INPUTS_CONTRACT = {
  arity: 2,
  invariant: "publicInputs[0] == publicInputs[1]",
  meaning: "Both entries equal H where H = Poseidon(capsuleHash|svgHash|domainTag)",
} as const;

export type VerificationSource = "local" | "pbi";
export type ProofBundleBindings = typeof PROOF_BINDINGS;
export type ZkPublicInputsContract = typeof ZK_PUBLIC_INPUTS_CONTRACT;
export type ZkStatement = {
  publicInputOf: typeof ZK_STATEMENT_BINDING;
  domainTag: string;
  publicInputsContract?: ZkPublicInputsContract;
};
export type ZkMeta = Readonly<{
  protocol?: string;
  curve?: string;
  scheme?: string;
  circuitId?: string;
  vkHash?: string;
}>;
export type VerificationCache = Readonly<{
  zkVerifiedCached?: boolean;
}>;
export type ProofBundleTransport = Readonly<{
  shareUrl?: string;
  verifierBaseUrl?: string;
  verifierUrl?: string; // legacy: retained for backwards compatibility
  verifiedAtPulse?: number;
  verifier?: VerificationSource;
  proofHints?: unknown;
}>;

/* -------------------------------------------------------------------------- */
/*                                 Base URL                                   */
/* -------------------------------------------------------------------------- */

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

type ViteImportMeta = { env?: { BASE_URL?: unknown } };

function safeBasePath(): string {
  try {
    const baseUrl = (import.meta as unknown as ViteImportMeta).env?.BASE_URL;
    if (typeof baseUrl === "string" && baseUrl.trim().length > 0) return baseUrl;
  } catch {
    // ignore
  }
  return "/";
}

/** Default verifier base is ALWAYS current app origin (+ Vite BASE_URL) + "/verify" */
export function defaultHostedVerifierBaseUrl(): string {
  if (typeof window === "undefined") return "/verify";

  const origin = window.location.origin;
  const base = safeBasePath(); // "/" or "/subpath/"
  const baseClean = trimSlashes(base);
  const prefix = baseClean.length > 0 ? `/${baseClean}` : "";

  return `${origin}${prefix}/verify`;
}

/* -------------------------------------------------------------------------- */
/*                                Slug helpers                                */
/* -------------------------------------------------------------------------- */

/** Shorten signature to a stable slug fragment (no hashing; deterministic + human-readable). */
export function shortKaiSig10(sig: string): string {
  const s = typeof sig === "string" ? sig.trim() : "";
  const safe = s.length > 0 ? s : "unknown-signature";
  return safe.length > 10 ? safe.slice(0, 10) : safe;
}

export function buildVerifierSlug(pulse: number, kaiSignature: string, verifiedAtPulse?: number): string {
  const shortSig = shortKaiSig10(kaiSignature);
  if (verifiedAtPulse != null && Number.isFinite(verifiedAtPulse)) {
    return `${pulse}-${shortSig}-${verifiedAtPulse}`;
  }
  return `${pulse}-${shortSig}`;
}

export function buildVerifierUrl(pulse: number, kaiSignature: string, verifierBaseUrl?: string, verifiedAtPulse?: number): string {
  const base = (verifierBaseUrl ?? defaultHostedVerifierBaseUrl()).replace(/\/+$/, "");
  const slug = encodeURIComponent(buildVerifierSlug(pulse, kaiSignature, verifiedAtPulse));
  return `${base}/${slug}`;
}

/* -------------------------------------------------------------------------- */
/*                           Chakra day normalization                          */
/* -------------------------------------------------------------------------- */

/**
 * ChakraDay normalizer → returns exact ChakraDay literals (from utils/kai_pulse)
 * Expected canon:
 * - "Third Eye" (not "ThirdEye")
 * - "Solar Plexus" (not "Solar")
 */
const CHAKRA_MAP: Readonly<Partial<Record<string, ChakraDay>>> = {
  root: "Root",
  sacral: "Sacral",

  // Solar variants
  solar: "Solar Plexus",
  solarp: "Solar Plexus",
  solarplexus: "Solar Plexus",

  heart: "Heart",
  throat: "Throat",

  // Third Eye variants
  thirdeye: "Third Eye",

  crown: "Crown",
  krown: "Crown",
};

export function normalizeChakraDay(v?: string): ChakraDay | undefined {
  if (typeof v !== "string") return undefined;
  const raw = v.trim();
  if (!raw) return undefined;

  // normalize incoming forms: "Third Eye", "third_eye", "third-eye" -> "thirdeye"
  const k = raw.toLowerCase().replace(/[\s_-]/g, "");
  return CHAKRA_MAP[k];
}

/* -------------------------------------------------------------------------- */
/*                        Proof Capsule Hash (KPV-1)                           */
/* -------------------------------------------------------------------------- */

/**
 * KPV-1: Canonical proof capsule (domain-stable).
 * NOTE: verifierUrl is intentionally excluded (host can change).
 * We bind verifierSlug instead.
 */
export type ProofCapsuleV1 = Readonly<{
  v: "KPV-1";
  pulse: number;
  chakraDay: ChakraDay;
  kaiSignature: string;
  phiKey: string;
  verifierSlug: string;
}>;

/**
 * Deterministic canonical JSON (sorted keys; UTF-8; no whitespace).
 * This prevents “same data, different JSON order” from changing the hash.
 */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
}

export function canonicalizeProofCapsuleV1(c: ProofCapsuleV1): string {
  return jcsCanonicalize({
    v: c.v,
    pulse: c.pulse,
    chakraDay: c.chakraDay,
    kaiSignature: c.kaiSignature,
    phiKey: c.phiKey,
    verifierSlug: c.verifierSlug,
  });
}

/** Compute the integrity hash for the proof capsule. */
export async function hashProofCapsuleV1(c: ProofCapsuleV1): Promise<string> {
  return await sha256Hex(canonicalizeProofCapsuleV1(c));
}

export async function hashSvgText(svgText: string): Promise<string> {
  return await sha256Hex(svgCanonicalForHash(svgText));
}

export type ProofBundleLike = {
  hashAlg?: string;
  canon?: string;
  bindings?: ProofBundleBindings;
  zkStatement?: ZkStatement;
  proofCapsule?: ProofCapsuleV1;
  capsuleHash?: string;
  svgHash?: string;
  shareUrl?: string;
  verifierUrl?: string;
  verifier?: VerificationSource;
  verificationVersion?: string;
  verifiedAtPulse?: number;
  zkPoseidonHash?: string;
  zkProof?: unknown;
  proofHints?: unknown;
  zkPublicInputs?: unknown;
  zkMeta?: ZkMeta;
  verificationCache?: VerificationCache;
  transport?: ProofBundleTransport;
  bundleRoot?: BundleRoot;
  authorSig?: AuthorSig | null;
  bundleHash?: string;
  zkVerified?: boolean;
  receiveSig?: unknown;
  v?: string;
  [key: string]: unknown;
};

type JcsValue = string | number | boolean | null | JcsValue[] | { [k: string]: JcsValue };

export type BundleRoot = Readonly<{
  v?: string;
  hashAlg?: string;
  canon?: string;
  bindings?: ProofBundleBindings;
  zkStatement?: ZkStatement;
  proofCapsule?: ProofCapsuleV1;
  capsuleHash?: string;
  svgHash?: string;
  zkPoseidonHash?: string;
  zkProof?: unknown;
  zkPublicInputs?: unknown;
  zkMeta?: ZkMeta;
}>;

export type NormalizedBundle = Readonly<{
  proofCapsule?: ProofCapsuleV1;
  capsuleHash?: string;
  svgHash?: string;
  bundleRoot?: BundleRoot;
  bundleHash?: string;
  authorSig?: AuthorSig | null;
  zkProof?: unknown;
  zkPublicInputs?: unknown;
  bindings?: ProofBundleBindings;
  zkStatement?: ZkStatement;
  zkMeta?: ZkMeta;
  verificationCache?: VerificationCache;
  transport?: ProofBundleTransport;
  zkPoseidonHash?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
  return Object.fromEntries(entries) as T;
}

function withZkPublicInputsContract(statement: ZkStatement): ZkStatement {
  if (statement.publicInputsContract) return statement;
  return { ...statement, publicInputsContract: ZK_PUBLIC_INPUTS_CONTRACT };
}

function normalizeBundleRoot(root: Record<string, unknown>): BundleRoot {
  const bindings = isRecord(root.bindings) ? (root.bindings as ProofBundleBindings) : undefined;
  const zkStatement = isRecord(root.zkStatement)
    ? withZkPublicInputsContract(root.zkStatement as ZkStatement)
    : undefined;
  const zkMeta = isRecord(root.zkMeta) ? (root.zkMeta as ZkMeta) : undefined;
  return dropUndefined({
    v: typeof root.v === "string" ? root.v : undefined,
    hashAlg: typeof root.hashAlg === "string" ? root.hashAlg : undefined,
    canon: typeof root.canon === "string" ? root.canon : undefined,
    bindings,
    zkStatement,
    proofCapsule: isRecord(root.proofCapsule) ? (root.proofCapsule as ProofCapsuleV1) : undefined,
    capsuleHash: typeof root.capsuleHash === "string" ? root.capsuleHash : undefined,
    svgHash: typeof root.svgHash === "string" ? root.svgHash : undefined,
    zkPoseidonHash: typeof root.zkPoseidonHash === "string" ? root.zkPoseidonHash : undefined,
    zkProof: "zkProof" in root ? root.zkProof : undefined,
    zkPublicInputs: "zkPublicInputs" in root ? root.zkPublicInputs : undefined,
    zkMeta,
  });
}

/**
 * Build an unsigned version of the bundle for hashing:
 * - strips any existing bundleHash / authorSig / receiveSig
 * - forces authorSig to null to produce a stable canonical hash input
 */
export function buildBundleUnsigned(bundle: ProofBundleLike): Record<string, unknown> {
  const { ...rest } = bundle;

  // delete keys we must NOT include in the hash input
  delete (rest as Record<string, unknown>).bundleHash;
  delete (rest as Record<string, unknown>).authorSig;
  delete (rest as Record<string, unknown>).receiveSig;

  // force stable unsigned form
  return { ...rest, authorSig: null };
}

export async function hashBundle(bundleUnsigned: Record<string, unknown>): Promise<string> {
  return await sha256Hex(jcsCanonicalize(bundleUnsigned as JcsValue));
}

export function buildBundleRoot(bundle: ProofBundleLike): BundleRoot {
  const bindings = bundle.bindings ?? PROOF_BINDINGS;
  const hashAlg = typeof bundle.hashAlg === "string" ? bundle.hashAlg : PROOF_HASH_ALG;
  const canon = typeof bundle.canon === "string" ? bundle.canon : PROOF_CANON;
  const zkStatementBase =
    bundle.zkStatement ??
    (bundle.zkPoseidonHash
      ? {
          publicInputOf: ZK_STATEMENT_BINDING,
          domainTag: ZK_STATEMENT_DOMAIN,
        }
      : undefined);
  const zkStatement = zkStatementBase ? withZkPublicInputsContract(zkStatementBase) : undefined;
  return dropUndefined({
    v: typeof bundle.v === "string" ? bundle.v : undefined,
    hashAlg,
    canon,
    bindings,
    zkStatement,
    proofCapsule: bundle.proofCapsule,
    capsuleHash: bundle.capsuleHash,
    svgHash: bundle.svgHash,
    zkPoseidonHash: bundle.zkPoseidonHash,
    zkProof: bundle.zkProof,
    zkPublicInputs: bundle.zkPublicInputs,
    zkMeta: bundle.zkMeta,
  });
}

export async function computeBundleHash(bundleRoot: BundleRoot): Promise<string> {
  return await sha256Hex(jcsCanonicalize(bundleRoot as JcsValue));
}

export function challengeFromBundleHash(bundleHash: string): string {
  return base64UrlEncode(hexToBytes(bundleHash));
}

export function normalizeBundle(bundle: ProofBundleLike): NormalizedBundle {
  const bundleRoot = isRecord(bundle.bundleRoot)
    ? normalizeBundleRoot(bundle.bundleRoot)
    : buildBundleRoot(bundle);
  const bindings = bundleRoot.bindings ?? bundle.bindings ?? PROOF_BINDINGS;
  const zkStatement = bundleRoot.zkStatement ?? bundle.zkStatement;
  const transportBase = isRecord(bundle.transport) ? bundle.transport : {};
  const transport = dropUndefined({
    shareUrl:
      typeof bundle.shareUrl === "string"
        ? bundle.shareUrl
        : typeof transportBase.shareUrl === "string"
          ? transportBase.shareUrl
          : undefined,
    verifierBaseUrl:
      typeof transportBase.verifierBaseUrl === "string"
        ? transportBase.verifierBaseUrl
        : typeof transportBase.verifierUrl === "string"
          ? transportBase.verifierUrl
          : undefined,
    verifiedAtPulse:
      typeof bundle.verifiedAtPulse === "number" && Number.isFinite(bundle.verifiedAtPulse)
        ? bundle.verifiedAtPulse
        : typeof transportBase.verifiedAtPulse === "number" && Number.isFinite(transportBase.verifiedAtPulse)
          ? transportBase.verifiedAtPulse
          : undefined,
    verifier:
      bundle.verifier ?? (transportBase.verifier as VerificationSource | undefined),
    proofHints:
      "proofHints" in bundle ? bundle.proofHints : transportBase.proofHints,
  });
  const verificationCacheBase = isRecord(bundle.verificationCache) ? bundle.verificationCache : {};
  const zkVerifiedCached =
    typeof bundle.zkVerified === "boolean"
      ? bundle.zkVerified
      : typeof verificationCacheBase.zkVerifiedCached === "boolean"
        ? verificationCacheBase.zkVerifiedCached
        : undefined;
  const verificationCache = dropUndefined({
    zkVerifiedCached,
  });

  return {
    proofCapsule: bundleRoot.proofCapsule ?? bundle.proofCapsule,
    capsuleHash: bundleRoot.capsuleHash ?? bundle.capsuleHash,
    svgHash: bundleRoot.svgHash ?? bundle.svgHash,
    bundleRoot,
    bundleHash: typeof bundle.bundleHash === "string" ? bundle.bundleHash : undefined,
    authorSig: bundle.authorSig ?? null,
    zkProof: bundleRoot.zkProof ?? bundle.zkProof,
    zkPublicInputs: bundleRoot.zkPublicInputs ?? bundle.zkPublicInputs,
    bindings,
    zkStatement,
    zkMeta: bundleRoot.zkMeta ?? bundle.zkMeta,
    verificationCache: Object.keys(verificationCache).length ? verificationCache : undefined,
    transport: Object.keys(transport).length ? transport : undefined,
    zkPoseidonHash: bundleRoot.zkPoseidonHash ?? bundle.zkPoseidonHash,
  };
}

/** Convenience short display for hashes. */
export function shortHash10(h: string): string {
  const s = typeof h === "string" ? h.trim() : "";
  return s.length > 10 ? s.slice(0, 10) : s;
}
