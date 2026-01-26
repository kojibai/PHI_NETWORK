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
import type { ReceiveSig } from "../../utils/webauthnReceive";
import type { OwnerKeyDerivation } from "../../utils/ownerPhiKey";
import type { VerificationCache } from "../../utils/verificationCache";
import type { VerificationReceipt, VerificationSig } from "../../utils/verificationReceipt";
import { VERIFICATION_BUNDLE_VERSION } from "../../utils/verificationVersion";

export type { VerificationCache } from "../../utils/verificationCache";

export const PROOF_HASH_ALG = "sha256" as const;
// JCS = RFC 8785 canonical JSON.
export const PROOF_CANON = "JCS" as const;
export const PROOF_METADATA_ID = "kai-voh-proof" as const;
export { VERIFICATION_BUNDLE_VERSION };
export const PROOF_BINDINGS = {
  capsuleHashOf: "JCS(proofCapsule)",
  bundleHashOf: "sha256(JCS(bundleRoot))",
  authorChallengeOf: "base64url(bytes(bundleHash))",
} as const;
export const ZK_STATEMENT_BINDING = "Poseidon(capsuleHash|svgHash|domainTag)" as const;
export const ZK_STATEMENT_DOMAIN = "kairos.sigil.zk.v1" as const;
/**
 * h2f mapping for Poseidon statement (documentation only):
 * - capsuleHash/svgHash (hex sha256, 32 bytes): BigInt("0x" + hex) mod FIELD_PRIME
 * - domainTag (UTF-8 string): BigInt("0x" + sha256(utf8(tag))) mod FIELD_PRIME
 */
export const ZK_STATEMENT_ENCODING = {
  arity: 3,
  inputs: ["capsuleHash", "svgHash", "domainTag"],
  interpretation: "field_elements",
  fieldMap: "h2f",
  poseidon: "Poseidon([h2f(capsuleHash), h2f(svgHash), h2f(domainTag)])",
} as const;
export const ZK_PUBLIC_INPUTS_CONTRACT = {
  arity: 2,
  invariant: "publicInputs[0] == publicInputs[1]",
  meaning: "Both entries equal H where H = Poseidon(capsuleHash|svgHash|domainTag)",
} as const;

export type VerificationSource = "local" | "pbi";
export type ProofBundleBindings = typeof PROOF_BINDINGS;
export type ZkPublicInputsContract = typeof ZK_PUBLIC_INPUTS_CONTRACT;
export type ZkStatementEncoding = typeof ZK_STATEMENT_ENCODING;
export type ZkStatement = {
  publicInputOf: typeof ZK_STATEMENT_BINDING;
  domainTag: string;
  publicInputsContract?: ZkPublicInputsContract;
  encoding?: ZkStatementEncoding;
};
export type ZkCurve = "bn128" | "BLS12-381";
export type ZkMeta = Readonly<{
  protocol?: string;
  curve?: ZkCurve;
  curveAliases?: string[];
  scheme?: string;
  circuitId?: string;
  vkHash?: string;
  warnings?: string[];
}>;
export type ProofBundleTransport = Readonly<{
  shareUrl?: string;
  verifierUrl?: string;
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

export function buildVerifierUrl(
  pulse: number,
  kaiSignature: string,
  verifierBaseUrl?: string,
  verifiedAtPulse?: number,
): string {
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
/*                           ZK curve normalization                           */
/* -------------------------------------------------------------------------- */

export function normalizeZkCurve(curve: unknown): ZkCurve | undefined {
  if (curve == null || typeof curve !== "string") return undefined;
  const trimmed = curve.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  if (normalized === "bn128" || normalized === "altbn128" || normalized === "bn254") {
    return "bn128";
  }
  if (normalized === "bls12-381") {
    return "BLS12-381";
  }
  return undefined;
}

export function inferZkCurveFromContext(params: { protocol?: string; scheme?: string; circuitId?: string }): ZkCurve | undefined {
  if (params.protocol === "groth16" && params.scheme === "groth16-poseidon" && params.circuitId === "sigil_proof") {
    return "bn128";
  }
  return undefined;
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
  mode?: "origin" | "receive";
  originBundleHash?: string;
  receiveBundleHash?: string;
  originAuthorSig?: AuthorSig | null;
  receiveSig?: ReceiveSig | null;
  receivePulse?: number;
  ownerPhiKey?: string;
  ownerKeyDerivation?: OwnerKeyDerivation;
  hashAlg?: string;
  canon?: string;
  bindings?: ProofBundleBindings;
  zkStatement?: ZkStatement;
  zkScheme?: string;
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
  cacheKey?: string;
  receipt?: VerificationReceipt;
  receiptHash?: string;
  verificationSig?: VerificationSig;
  transport?: ProofBundleTransport;
  bundleRoot?: BundleRoot;
  authorSig?: AuthorSig | null;
  bundleHash?: string;
  zkVerified?: boolean;
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
  mode?: "origin" | "receive";
  originBundleHash?: string;
  receiveBundleHash?: string;
  originAuthorSig?: AuthorSig | null;
  receiveSig?: ReceiveSig | null;
  receivePulse?: number;
  ownerPhiKey?: string;
  ownerKeyDerivation?: OwnerKeyDerivation;
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
  cacheKey?: string;
  receipt?: VerificationReceipt;
  receiptHash?: string;
  verificationSig?: VerificationSig;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * IMPORTANT:
 * When we "parse" verificationCache from unknown bundles, we treat it as a record
 * to safely read properties without TS inferring {}.
 */
type VerificationCacheRecord = Partial<VerificationCache> & Record<string, unknown>;

type ZkProofWithCurve = Readonly<Record<string, unknown> & { curve?: ZkCurve }>;

export function normalizeProofBundleZkCurves(input: {
  zkProof?: unknown;
  zkMeta?: ZkMeta;
  bundleRoot?: BundleRoot;
  proofHints?: unknown;
  zkScheme?: string;
}): { zkProof?: unknown; zkMeta?: ZkMeta; bundleRoot?: BundleRoot; curve?: ZkCurve } {
  const { zkProof, zkMeta, bundleRoot } = input;
  const proofRecord = isRecord(zkProof) ? zkProof : undefined;
  const rootRecord = isRecord(bundleRoot) ? bundleRoot : undefined;
  const rootProofRecord = rootRecord && isRecord(rootRecord.zkProof) ? rootRecord.zkProof : undefined;

  const proofCurve = normalizeZkCurve(proofRecord?.curve);
  const metaCurveRaw = typeof zkMeta?.curve === "string" ? zkMeta.curve.trim() : undefined;
  const metaCurve = normalizeZkCurve(metaCurveRaw);
  const rootProofCurve = normalizeZkCurve(rootProofRecord?.curve);
  const rootMetaRaw =
    rootRecord && isRecord(rootRecord.zkMeta) && typeof (rootRecord.zkMeta as Record<string, unknown>).curve === "string"
      ? String((rootRecord.zkMeta as Record<string, unknown>).curve).trim()
      : undefined;
  const rootMetaCurve = normalizeZkCurve(rootMetaRaw);

  const proofPoints = hasProofPoints(proofRecord) || hasProofPoints(rootProofRecord);
  const protocol =
    typeof proofRecord?.protocol === "string"
      ? (proofRecord.protocol as string)
      : typeof zkMeta?.protocol === "string"
        ? zkMeta.protocol
        : proofPoints
          ? "groth16"
          : undefined;
  const scheme =
    typeof zkMeta?.scheme === "string"
      ? zkMeta.scheme
      : typeof input.zkScheme === "string"
        ? input.zkScheme
        : isRecord(input.proofHints) && typeof input.proofHints.scheme === "string"
          ? (input.proofHints.scheme as string)
          : undefined;
  const circuitId = typeof zkMeta?.circuitId === "string" ? zkMeta.circuitId : undefined;
  const inferredCurve = inferZkCurveFromContext({ protocol, scheme, circuitId });

  const effectiveProofCurve = proofCurve ?? rootProofCurve;

  const normalizeProof = (proof: Record<string, unknown>, curve?: ZkCurve): ZkProofWithCurve => {
    const normalized: Record<string, unknown> = { ...proof };
    if (curve) {
      normalized.curve = curve;
    } else if ("curve" in normalized) {
      delete normalized.curve;
    }
    return normalized as ZkProofWithCurve;
  };

  const applyCurveAliases = (curve?: ZkCurve): string[] | undefined => {
    if (curve === "bn128") return ["bn254", "altbn128"];
    return undefined;
  };

  const normalizeMeta = (meta: ZkMeta, curve: ZkCurve, warning?: string): ZkMeta => {
    const warnings = warning
      ? Array.isArray(meta.warnings)
        ? [...meta.warnings, warning]
        : [warning]
      : meta.warnings;
    const curveAliases = applyCurveAliases(curve) ?? meta.curveAliases;
    return {
      ...meta,
      curve,
      curveAliases,
      warnings: warnings && warnings.length ? warnings : undefined,
    };
  };

  let normalizedProof = proofRecord ? normalizeProof(proofRecord, effectiveProofCurve) : zkProof;
  let normalizedMeta = zkMeta;
  let normalizedRoot = rootRecord;

  if (effectiveProofCurve) {
    if (zkMeta) {
      const warning =
        metaCurveRaw && metaCurve !== effectiveProofCurve
          ? `curve_mismatch_corrected meta=${metaCurveRaw} proof=${effectiveProofCurve}`
          : undefined;
      normalizedMeta = normalizeMeta(zkMeta, effectiveProofCurve, warning);
    }
    if (rootRecord) {
      const rootMeta =
        isRecord(rootRecord.zkMeta) && rootRecord.zkMeta ? (rootRecord.zkMeta as ZkMeta) : undefined;
      const rootWarning =
        rootMetaRaw && rootMetaCurve !== effectiveProofCurve
          ? `curve_mismatch_corrected meta=${rootMetaRaw} proof=${effectiveProofCurve}`
          : undefined;
      const normalizedRootMeta = rootMeta ? normalizeMeta(rootMeta, effectiveProofCurve, rootWarning) : rootMeta;
      normalizedRoot = {
        ...rootRecord,
        zkProof: rootProofRecord ? normalizeProof(rootProofRecord, effectiveProofCurve) : rootRecord.zkProof,
        zkMeta: normalizedRootMeta,
      };
    }
  } else if (proofPoints) {
    if (metaCurve) {
      if (zkMeta) normalizedMeta = normalizeMeta(zkMeta, metaCurve);
      if (rootRecord) {
        const rootMeta =
          isRecord(rootRecord.zkMeta) && rootRecord.zkMeta ? (rootRecord.zkMeta as ZkMeta) : undefined;
        normalizedRoot = {
          ...rootRecord,
          zkMeta: rootMeta ? normalizeMeta(rootMeta, metaCurve) : rootMeta,
          zkProof: rootProofRecord ? normalizeProof(rootProofRecord, rootProofCurve) : rootRecord.zkProof,
        };
      }
      if (proofRecord) normalizedProof = normalizeProof(proofRecord, undefined);
    } else if (inferredCurve) {
      if (proofRecord) normalizedProof = normalizeProof(proofRecord, inferredCurve);
      if (zkMeta) {
        normalizedMeta = normalizeMeta(zkMeta, inferredCurve);
      } else {
        normalizedMeta = { curve: inferredCurve, curveAliases: applyCurveAliases(inferredCurve) };
      }
      if (rootRecord) {
        const rootMeta =
          isRecord(rootRecord.zkMeta) && rootRecord.zkMeta ? (rootRecord.zkMeta as ZkMeta) : undefined;
        const normalizedRootMeta = rootMeta ? normalizeMeta(rootMeta, inferredCurve) : rootMeta;
        normalizedRoot = {
          ...rootRecord,
          zkProof: rootProofRecord ? normalizeProof(rootProofRecord, inferredCurve) : rootRecord.zkProof,
          zkMeta: normalizedRootMeta,
        };
      }
    } else if (proofRecord) {
      normalizedProof = normalizeProof(proofRecord, undefined);
    }
  } else {
    if (zkMeta && metaCurve) normalizedMeta = normalizeMeta(zkMeta, metaCurve);
    if (rootRecord && metaCurve) {
      const rootMeta =
        isRecord(rootRecord.zkMeta) && rootRecord.zkMeta ? (rootRecord.zkMeta as ZkMeta) : undefined;
      normalizedRoot = {
        ...rootRecord,
        zkMeta: rootMeta ? normalizeMeta(rootMeta, metaCurve) : rootMeta,
        zkProof: rootProofRecord ? normalizeProof(rootProofRecord, rootProofCurve) : rootRecord.zkProof,
      };
    }
    if (proofRecord) normalizedProof = normalizeProof(proofRecord, undefined);
  }

  return {
    zkProof: normalizedProof,
    zkMeta: normalizedMeta,
    bundleRoot: normalizedRoot,
    curve: effectiveProofCurve ?? metaCurve ?? inferredCurve,
  };
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
  return Object.fromEntries(entries) as T;
}

function withZkStatementDefaults(statement: ZkStatement): ZkStatement {
  let next = statement;
  if (!next.publicInputsContract) {
    next = { ...next, publicInputsContract: ZK_PUBLIC_INPUTS_CONTRACT };
  }
  if (!next.encoding) {
    next = { ...next, encoding: ZK_STATEMENT_ENCODING };
  }
  return next;
}

function normalizeCanonLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "jcs") return PROOF_CANON;
  if (/sorted keys|utf-8|no whitespace/i.test(trimmed)) return PROOF_CANON;
  return trimmed;
}

export function buildZkPublicInputs(poseidonHash?: string): string[] | undefined {
  if (typeof poseidonHash !== "string") return undefined;
  const trimmed = poseidonHash.trim();
  if (!trimmed) return undefined;
  return [trimmed, trimmed];
}

function normalizeBundleRoot(root: Record<string, unknown>): BundleRoot {
  const bindings = isRecord(root.bindings) ? (root.bindings as ProofBundleBindings) : undefined;
  const zkStatement = isRecord(root.zkStatement) ? withZkStatementDefaults(root.zkStatement as ZkStatement) : undefined;
  const zkMeta = isRecord(root.zkMeta) ? (root.zkMeta as ZkMeta) : undefined;
  return dropUndefined({
    v: typeof root.v === "string" ? root.v : undefined,
    hashAlg: typeof root.hashAlg === "string" ? root.hashAlg : undefined,
    canon: normalizeCanonLabel(root.canon),
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
 * - strips any existing bundleHash / authorSig / receiveSig / receiveBundleHash / ownerPhiKey / ownerKeyDerivation
 * - forces authorSig to null to produce a stable canonical hash input
 */
export function buildBundleUnsigned(bundle: ProofBundleLike): Record<string, unknown> {
  const { ...rest } = bundle;

  // delete keys we must NOT include in the hash input
  delete (rest as Record<string, unknown>).bundleHash;
  delete (rest as Record<string, unknown>).authorSig;
  delete (rest as Record<string, unknown>).receiveSig;
  delete (rest as Record<string, unknown>).receiveBundleHash;
  delete (rest as Record<string, unknown>).ownerPhiKey;
  delete (rest as Record<string, unknown>).ownerKeyDerivation;

  // force stable unsigned form
  return { ...rest, authorSig: null };
}

export async function hashBundle(bundleUnsigned: Record<string, unknown>): Promise<string> {
  return await sha256Hex(jcsCanonicalize(bundleUnsigned as JcsValue));
}

export function buildBundleRoot(bundle: ProofBundleLike): BundleRoot {
  const bindings = bundle.bindings ?? PROOF_BINDINGS;
  const hashAlg = typeof bundle.hashAlg === "string" ? bundle.hashAlg : PROOF_HASH_ALG;
  const canon = normalizeCanonLabel(bundle.canon) ?? PROOF_CANON;
  const zkStatementBase =
    bundle.zkStatement ??
    (bundle.zkPoseidonHash
      ? {
          publicInputOf: ZK_STATEMENT_BINDING,
          domainTag: ZK_STATEMENT_DOMAIN,
          encoding: ZK_STATEMENT_ENCODING,
        }
      : undefined);
  const zkStatement = zkStatementBase ? withZkStatementDefaults(zkStatementBase) : undefined;

  const normalizedZk = normalizeProofBundleZkCurves({
    zkProof: bundle.zkProof,
    zkMeta: bundle.zkMeta,
    proofHints: bundle.proofHints,
    zkScheme: bundle.zkScheme,
  });

  const zkProof = normalizedZk.zkProof ?? bundle.zkProof;
  const zkMeta = normalizedZk.zkMeta ?? bundle.zkMeta;
  const zkPublicInputs = buildZkPublicInputs(bundle.zkPoseidonHash) ?? (bundle.zkPublicInputs as unknown);

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
    zkProof,
    zkPublicInputs,
    zkMeta,
  });
}

export async function computeBundleHash(bundleRoot: BundleRoot): Promise<string> {
  return await sha256Hex(jcsCanonicalize(bundleRoot as JcsValue));
}

export function challengeFromBundleHash(bundleHash: string): string {
  return base64UrlEncode(hexToBytes(bundleHash));
}

export function normalizeBundle(bundle: ProofBundleLike): NormalizedBundle {
  const normalizedZk = normalizeProofBundleZkCurves({
    zkProof: bundle.zkProof,
    zkMeta: bundle.zkMeta,
    bundleRoot: isRecord(bundle.bundleRoot) ? (bundle.bundleRoot as BundleRoot) : undefined,
    proofHints: bundle.proofHints,
    zkScheme: bundle.zkScheme,
  });

  const bundleRootBase = normalizedZk.bundleRoot ?? (isRecord(bundle.bundleRoot) ? bundle.bundleRoot : undefined);
  const normalizedZkProof = normalizedZk.zkProof ?? bundle.zkProof;
  const normalizedZkMeta = normalizedZk.zkMeta ?? bundle.zkMeta;

  const bundleRoot = bundleRootBase
    ? normalizeBundleRoot(bundleRootBase as Record<string, unknown>)
    : buildBundleRoot({
        ...bundle,
        zkProof: normalizedZkProof,
        zkMeta: normalizedZkMeta,
      });

  const bindings = bundleRoot.bindings ?? bundle.bindings ?? PROOF_BINDINGS;
  const zkStatement = bundleRoot.zkStatement ?? bundle.zkStatement;

  const transportBase: Record<string, unknown> = isRecord(bundle.transport) ? (bundle.transport as Record<string, unknown>) : {};
  const transport = dropUndefined({
    shareUrl:
      typeof bundle.shareUrl === "string"
        ? bundle.shareUrl
        : typeof transportBase.shareUrl === "string"
          ? (transportBase.shareUrl as string)
          : undefined,
    verifierUrl:
      typeof bundle.verifierUrl === "string"
        ? bundle.verifierUrl
        : typeof transportBase.verifierUrl === "string"
          ? (transportBase.verifierUrl as string)
          : undefined,
    verifiedAtPulse:
      typeof bundle.verifiedAtPulse === "number" && Number.isFinite(bundle.verifiedAtPulse)
        ? bundle.verifiedAtPulse
        : typeof transportBase.verifiedAtPulse === "number" && Number.isFinite(transportBase.verifiedAtPulse as number)
          ? (transportBase.verifiedAtPulse as number)
          : undefined,
    verifier: bundle.verifier ?? (transportBase.verifier as VerificationSource | undefined),
    proofHints: "proofHints" in bundle ? bundle.proofHints : transportBase.proofHints,
  });

  // ✅ FIX: ensure verificationCacheBase is record-shaped (not {}), so property reads are type-safe.
  const verificationCacheBase: VerificationCacheRecord = isRecord(bundle.verificationCache)
    ? (bundle.verificationCache as VerificationCacheRecord)
    : ({} as VerificationCacheRecord);

  const zkVerifiedCached =
    typeof bundle.zkVerified === "boolean"
      ? bundle.zkVerified
      : typeof verificationCacheBase.zkVerifiedCached === "boolean"
        ? verificationCacheBase.zkVerifiedCached
        : undefined;

  const verificationCacheObj = dropUndefined({
    v: verificationCacheBase.v === "KVC-1" ? verificationCacheBase.v : undefined,
    cacheKey: typeof verificationCacheBase.cacheKey === "string" ? verificationCacheBase.cacheKey : undefined,
    bundleHash: typeof verificationCacheBase.bundleHash === "string" ? verificationCacheBase.bundleHash : undefined,
    zkPoseidonHash: typeof verificationCacheBase.zkPoseidonHash === "string" ? verificationCacheBase.zkPoseidonHash : undefined,
    verificationVersion:
      typeof verificationCacheBase.verificationVersion === "string" ? verificationCacheBase.verificationVersion : undefined,
    verifiedAtPulse:
      typeof verificationCacheBase.verifiedAtPulse === "number" && Number.isFinite(verificationCacheBase.verifiedAtPulse)
        ? verificationCacheBase.verifiedAtPulse
        : undefined,
    verifier: typeof verificationCacheBase.verifier === "string" ? verificationCacheBase.verifier : undefined,
    createdAtMs:
      typeof verificationCacheBase.createdAtMs === "number" && Number.isFinite(verificationCacheBase.createdAtMs)
        ? verificationCacheBase.createdAtMs
        : undefined,
    expiresAtPulse:
      typeof verificationCacheBase.expiresAtPulse === "number" && Number.isFinite(verificationCacheBase.expiresAtPulse)
        ? verificationCacheBase.expiresAtPulse
        : verificationCacheBase.expiresAtPulse === null
          ? null
          : undefined,
    zkVerifiedCached,
  });

  const verificationCache =
    Object.keys(verificationCacheObj).length > 0 ? (verificationCacheObj as unknown as VerificationCache) : undefined;

  return {
    mode: bundle.mode === "receive" || bundle.mode === "origin" ? bundle.mode : undefined,
    originBundleHash: typeof bundle.originBundleHash === "string" ? bundle.originBundleHash : undefined,
    receiveBundleHash: typeof bundle.receiveBundleHash === "string" ? bundle.receiveBundleHash : undefined,
    originAuthorSig: bundle.originAuthorSig ?? null,
    receiveSig: bundle.receiveSig ?? null,
    receivePulse:
      typeof bundle.receivePulse === "number" && Number.isFinite(bundle.receivePulse) ? bundle.receivePulse : undefined,
    ownerPhiKey: typeof bundle.ownerPhiKey === "string" ? bundle.ownerPhiKey : undefined,
    ownerKeyDerivation: bundle.ownerKeyDerivation,
    proofCapsule: bundleRoot.proofCapsule ?? bundle.proofCapsule,
    capsuleHash: bundleRoot.capsuleHash ?? bundle.capsuleHash,
    svgHash: bundleRoot.svgHash ?? bundle.svgHash,
    bundleRoot,
    bundleHash: typeof bundle.bundleHash === "string" ? bundle.bundleHash : undefined,
    authorSig: bundle.authorSig ?? null,
    zkProof: bundleRoot.zkProof ?? normalizedZkProof,
    zkPublicInputs: bundleRoot.zkPublicInputs ?? bundle.zkPublicInputs,
    bindings,
    zkStatement,
    zkMeta: bundleRoot.zkMeta ?? normalizedZkMeta,
    verificationCache,
    transport: Object.keys(transport).length ? (transport as ProofBundleTransport) : undefined,
    zkPoseidonHash: bundleRoot.zkPoseidonHash ?? bundle.zkPoseidonHash,
    cacheKey: typeof bundle.cacheKey === "string" ? bundle.cacheKey : undefined,
    receipt: bundle.receipt,
    receiptHash: typeof bundle.receiptHash === "string" ? bundle.receiptHash : undefined,
    verificationSig: bundle.verificationSig,
  };
}

function hasProofPoints(proof: unknown): boolean {
  if (!isRecord(proof)) return false;
  return ["pi_a", "pi_b", "pi_c"].some((key) => proof[key] != null);
}

export function assertZkCurveConsistency(params: { zkProof?: unknown; zkMeta?: ZkMeta }): void {
  const proofRecord = isRecord(params.zkProof) ? params.zkProof : undefined;
  const proofCurve = normalizeZkCurve(proofRecord?.curve);
  const metaCurve = normalizeZkCurve(params.zkMeta?.curve);
  const proofPoints = hasProofPoints(params.zkProof);

  const protocol =
    typeof proofRecord?.protocol === "string"
      ? (proofRecord.protocol as string)
      : typeof params.zkMeta?.protocol === "string"
        ? params.zkMeta.protocol
        : proofPoints
          ? "groth16"
          : undefined;
  const scheme = typeof params.zkMeta?.scheme === "string" ? params.zkMeta.scheme : undefined;
  const circuitId = typeof params.zkMeta?.circuitId === "string" ? params.zkMeta.circuitId : undefined;

  const inferredCurve = !proofCurve && !metaCurve ? inferZkCurveFromContext({ protocol, scheme, circuitId }) : undefined;

  if (proofCurve && metaCurve && proofCurve !== metaCurve) {
    throw new Error("zk curve mismatch (meta vs proof)");
  }

  // Legacy/omitted curve metadata is acceptable; only fail on explicit mismatch.
  // If both are missing but we can infer and proof points exist, allow.
  if (!proofCurve && !metaCurve && inferredCurve && proofPoints) {
    return;
  }
}

export function assertZkPublicInputsContract(params: { zkPublicInputs?: unknown; zkPoseidonHash?: string }): void {
  if (params.zkPublicInputs == null && params.zkPoseidonHash == null) return;
  if (typeof params.zkPoseidonHash !== "string" || !params.zkPoseidonHash.trim()) {
    throw new Error("zk public inputs contract violated");
  }
  if (!Array.isArray(params.zkPublicInputs)) {
    throw new Error("zk public inputs contract violated");
  }
  const inputs = params.zkPublicInputs.map((entry) => String(entry));
  if (inputs.length !== 2) {
    throw new Error("zk public inputs contract violated");
  }
  if (inputs[0] !== inputs[1]) {
    throw new Error("zk public inputs contract violated");
  }
  if (String(inputs[0]) !== String(params.zkPoseidonHash)) {
    throw new Error("zk public inputs contract violated");
  }
}

/** Convenience short display for hashes. */
export function shortHash10(h: string): string {
  const s = typeof h === "string" ? h.trim() : "";
  return s.length > 10 ? s.slice(0, 10) : s;
}
