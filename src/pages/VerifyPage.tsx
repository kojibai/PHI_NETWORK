// src/pages/VerifyPage.tsx
"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import "./VerifyPage.css";

import VerifierFrame from "../components/KaiVoh/VerifierFrame";
import { parseSlug, verifySigilSvg, type VerifyResult } from "../utils/verifySigil";
import { DEFAULT_ISSUANCE_POLICY, quotePhiForUsd } from "../utils/phi-issuance";
import { currency as fmtPhi, usd as fmtUsd } from "../components/valuation/display";
import LiveChart from "../components/valuation/chart/LiveChart";
import {
  assertZkCurveConsistency,
  assertZkPublicInputsContract,
  buildVerifierSlug,
  buildVerifierUrl,
  buildBundleRoot,
  buildBundleUnsigned,
  computeBundleHash,
  hashBundle,
  hashProofCapsuleV1,
  hashSvgText,
  normalizeChakraDay,
  normalizeBundle,
  PROOF_CANON,
  PROOF_BINDINGS,
  PROOF_HASH_ALG,
  ZK_PUBLIC_INPUTS_CONTRACT,
  VERIFICATION_BUNDLE_VERSION,
  ZK_STATEMENT_BINDING,
  ZK_STATEMENT_ENCODING,
  ZK_STATEMENT_DOMAIN,
  type VerificationSource,
  type ProofCapsuleV1,
  type NormalizedBundle,
  type ProofBundleLike,
} from "../components/KaiVoh/verifierProof";
import { extractProofBundleMetaFromSvg, type ProofBundleMeta } from "../utils/sigilMetadata";
import { derivePhiKeyFromSig, genNonce } from "../components/VerifierStamper/sigilUtils";
import { tryVerifyGroth16 } from "../components/VerifierStamper/zk";
import { isKASAuthorSig, type KASAuthorSig } from "../utils/authorSig";
import {
  derivePhiKeyFromPubKeyJwk,
  isWebAuthnAvailable,
  signBundleHash,
  storePasskey,
  verifyBundleAuthorSig,
} from "../utils/webauthnKAS";
import {
  buildKasChallenge,
  isReceiveSig,
  verifyWebAuthnAssertion,
  type ReceiveSig,
} from "../utils/webauthnReceive";
import { assertionToJson, verifyOwnerWebAuthnAssertion } from "../utils/webauthnOwner";
import { deriveOwnerPhiKeyFromReceive, type OwnerKeyDerivation } from "../utils/ownerPhiKey";
import { base64UrlDecode, sha256Hex } from "../utils/sha256";
import { insertPngTextChunks, readPngTextChunk } from "../utils/pngChunks";
import { getKaiPulseEternalInt } from "../SovereignSolar";
import { getSendRecordByNonce, listen, markConfirmedByNonce } from "../utils/sendLedger";
import { recordSigilTransferMovement } from "../utils/sigilTransferRegistry";
import {
  getNoteClaimInfo,
  getNoteClaimLeader,
  hydrateNoteClaimFromIndex,
  isNoteClaimed,
  listenRegistry,
  markNoteClaimed,
} from "../components/SigilExplorer/registryStore";
import { buildNoteId, hasClaim } from "../state/claimIndex";
import { pullAndImportRemoteUrls } from "../components/SigilExplorer/remotePull";
import { useKaiTicker } from "../hooks/useKaiTicker";
import { useValuation } from "./SigilPage/useValuation";
import type { SigilMetadataLite } from "../utils/valuation";
import { downloadVerifiedCardPng } from "../og/downloadVerifiedCard";
import type { VerifiedCardData } from "../og/types";
import { jcsCanonicalize } from "../utils/jcs";
import { svgCanonicalForHash } from "../utils/svgProof";
import { svgStringToPngBlob, triggerDownload } from "../components/exhale-note/svgToPng";
import NotePrinter from "../components/ExhaleNote";
import { buildNotePayload } from "../components/verifier/utils/notePayload";
import { buildBanknoteSVG } from "../components/exhale-note/banknoteSvg";
import type { BanknoteInputs as NoteBanknoteInputs, NoteSendPayload, NoteSendResult } from "../components/exhale-note/types";
import { safeShowDialog } from "../components/verifier/utils/modal";
import type { SigilMetadata } from "../components/verifier/types/local";
import useRollingChartSeries from "../components/VerifierStamper/hooks/useRollingChartSeries";
import { BREATH_MS } from "../components/valuation/constants";
import {
  assertReceiptHashMatch,
  buildVerificationReceipt,
  hashValuationSnapshot,
  hashVerificationReceipt,
  verificationSigFromKas,
  verifyVerificationSig,
  type VerificationReceipt,
  type VerificationSig,
} from "../utils/verificationReceipt";
import { buildReceiveBundleRoot, hashReceiveBundleRoot } from "../utils/receiveBundle";
import {
  buildVerificationCacheKey,
  buildVerificationCacheRecord,
  readVerificationCache,
  type VerificationCache,
  writeVerificationCache,
} from "../utils/verificationCache";
import {
  buildValuationSnapshotKey,
  getOrCreateValuationSnapshot,
  type ValuationSnapshotInput,
  type ValuationSnapshotState,
} from "../utils/valuationSnapshot";
import { decodeSharePayload, encodeSharePayload } from "../utils/shareBundleCodec";

/* ────────────────────────────────────────────────────────────────
   Utilities
─────────────────────────────────────────────────────────────── */

function formatProofValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeClaimPulse(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (value > 100_000_000_000) return getKaiPulseEternalInt(new Date(value));
  return Math.trunc(value);
}

function formatClaimPulse(value: number | null): string {
  const normalized = normalizeClaimPulse(value);
  if (!normalized || !Number.isFinite(normalized)) return "—";
  return String(normalized);
}

async function sha256Bytes(data: Uint8Array): Promise<string> {
  return (await sha256Hex(data)).toLowerCase();
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeCanonicalHash(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

async function resolveNoteParentCanonical(meta: SigilMetadata | null, payload?: NoteSendPayload): Promise<string> {
  const fromPayload = normalizeCanonicalHash(payload?.parentCanonical);
  if (fromPayload) return fromPayload;
  const fromMeta = normalizeCanonicalHash(meta?.canonicalHash);
  if (fromMeta) return fromMeta;
  if (!meta) return "";
  const pulse = Number.isFinite(meta.pulse ?? NaN) ? meta.pulse : meta.kaiPulse;
  const beat = Number.isFinite(meta.beat ?? NaN) ? meta.beat : undefined;
  const stepIndex = Number.isFinite(meta.stepIndex ?? NaN) ? meta.stepIndex : undefined;
  const chakraDay = typeof meta.chakraDay === "string" ? meta.chakraDay : "";
  const seed = `${pulse ?? ""}|${beat ?? ""}|${stepIndex ?? ""}|${chakraDay ?? ""}`;
  if (seed === "|||") return "";
  return (await sha256Hex(seed)).toLowerCase();
}

type NoteSendMeta = {
  parentCanonical: string;
  transferNonce: string;
  amountPhi?: number;
  amountUsd?: number;
  childCanonical?: string;
  transferLeafHashSend?: string;
};

function buildNoteSendMetaFromObject(value: unknown): NoteSendMeta | null {
  if (!isRecord(value)) return null;
  const parentCanonical = typeof value.parentCanonical === "string" ? value.parentCanonical.trim() : "";
  const transferNonce = typeof value.transferNonce === "string" ? value.transferNonce.trim() : "";
  const amountPhi = typeof value.amountPhi === "number" && Number.isFinite(value.amountPhi) ? value.amountPhi : undefined;
  const amountUsd = typeof value.amountUsd === "number" && Number.isFinite(value.amountUsd) ? value.amountUsd : undefined;
  const childCanonical = typeof value.childCanonical === "string" ? value.childCanonical.trim() : undefined;
  const transferLeafHashSend = typeof value.transferLeafHashSend === "string" ? value.transferLeafHashSend.trim() : undefined;
  if (!parentCanonical || !transferNonce) return null;
  return { parentCanonical, transferNonce, amountPhi, amountUsd, childCanonical, transferLeafHashSend };
}
function readLooseString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  return "";
}

function readLooseNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function buildNoteSendMetaFromObjectLoose(value: unknown): NoteSendMeta | null {
  if (!isRecord(value)) return null;

  const parentCanonical = readLooseString(value, "parentCanonical", "parentHash", "parent");
  const transferNonce = readLooseString(value, "transferNonce", "nonce", "n");

  if (!parentCanonical || !transferNonce) return null;

  const amountPhi = readLooseNumber(value, "amountPhi", "phi", "valuePhi");
  const amountUsd = readLooseNumber(value, "amountUsd", "usd", "valueUsd");

  const childCanonical = readLooseString(value, "childCanonical", "childHash", "canonicalHash", "hash") || undefined;

  const transferLeafHashSend =
    readLooseString(value, "transferLeafHashSend", "transferLeafHash", "leafHash", "l") || undefined;

  return { parentCanonical, transferNonce, amountPhi, amountUsd, childCanonical, transferLeafHashSend };
}

function parseNoteSendMeta(raw: string | null): NoteSendMeta | null {
  if (!raw) return null;
  try {
    return buildNoteSendMetaFromObjectLoose(JSON.parse(raw));
  } catch {
    return null;
  }
}


function parseNoteSendPayload(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRecordString(value: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!value) return null;
  const raw = value[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

function normalizeRawDeclaredPhiKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("φK-") || value.startsWith("ΦK-") || value.startsWith("phiK-")) return null;
  return value;
}

function hasRequiredKasAuthorSig(authorSig: unknown): authorSig is KASAuthorSig {
  if (!authorSig) return false;
  if (!isKASAuthorSig(authorSig)) return false;
  const credId = authorSig.credId || (authorSig as { rawId?: string }).rawId;
  return Boolean(credId && authorSig.pubKeyJwk);
}


function isChildGlyph(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  return Boolean(
    raw.childOfHash ||
      raw.childClaim ||
      raw.childAllocationPhi ||
      raw.branchBasePhi ||
      raw.childIssuedPulse
  );
}

type DebitLoose = {
  amount?: number;
};

type EmbeddedPhiSource = "balance" | "embedded" | "live" | "note";

type AttestationState = boolean | "missing";

function readLedgerBalance(raw: unknown): { originalAmount: number; remaining: number } | null {
  if (!isRecord(raw)) return null;
  const originalAmount = typeof raw.originalAmount === "number" && Number.isFinite(raw.originalAmount) ? raw.originalAmount : null;
  if (originalAmount == null) return null;
  const debits = Array.isArray(raw.debits) ? raw.debits : [];
  const totalDebited = debits.reduce((sum, entry) => {
    if (!isRecord(entry)) return sum;
    const amount = (entry as DebitLoose).amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return sum;
    return sum + amount;
  }, 0);
  return { originalAmount, remaining: Math.max(0, originalAmount - totalDebited) };
}

function readPhiAmount(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    if (Math.abs(raw) < 1e-12) return null;
    return Math.abs(raw);
  }
  if (typeof raw === "string") {
    const n = Number(raw);
    if (!Number.isNaN(n) && Math.abs(n) >= 1e-12) return Math.abs(n);
  }
  return null;
}

function readEmbeddedPhiAmount(raw: unknown): number | null {
  if (!isRecord(raw)) return null;
  const candidates: Array<Record<string, unknown>> = [raw];
  const maybeFeed = raw.feed;
  const maybePreview = raw.preview;
  const maybeMeta = raw.meta;

  if (isRecord(maybeFeed)) candidates.push(maybeFeed);
  if (isRecord(maybePreview)) candidates.push(maybePreview);
  if (isRecord(maybeMeta)) candidates.push(maybeMeta);

  for (const source of candidates) {
    const amount =
      readPhiAmount(source.transferAmountPhi) ??
      readPhiAmount(source.transferPhi) ??
      readPhiAmount(source.amountPhi) ??
      readPhiAmount(source.phiAmount) ??
      readPhiAmount(source.childAllocationPhi) ??
      readPhiAmount(source.branchBasePhi) ??
      readPhiAmount(source.valuePhi) ??
      readPhiAmount(source.value);
    if (amount != null) return amount;
  }

  return null;
}

function readReceiveSigFromBundle(raw: unknown): ReceiveSig | null {
  if (!isRecord(raw)) return null;
  const candidate = raw.receiveSig;
  return isReceiveSig(candidate) ? candidate : null;
}

function readSlugFromLocation(): string {
  if (typeof window === "undefined") return "";
  const path = window.location.pathname || "";
  const hash = window.location.hash || "";

  const m1 = path.match(/\/verify\/([^/?#]+)/);
  if (m1?.[1]) return m1[1];

  const m2 = hash.match(/\/verify\/([^/?#]+)/);
  if (m2?.[1]) return m2[1];

  return "";
}

type SharedReceipt = {
  proofCapsule: ProofCapsuleV1;
  capsuleHash?: string;
  svgHash?: string;
  bundleRoot?: ProofBundleMeta["bundleRoot"];
  bundleHash?: string;
  mode?: "origin" | "receive";
  originBundleHash?: string;
  receiveBundleHash?: string;
  originAuthorSig?: ProofBundleMeta["authorSig"];
  receiveSig?: ReceiveSig | null;
  receivePulse?: number;
  ownerPhiKey?: string;
  ownerKeyDerivation?: OwnerKeyDerivation;
  verifierUrl?: string;
  shareUrl?: string;
  verifier?: VerificationSource;
  verificationVersion?: string;
  cacheKey?: string;
  receipt?: VerificationReceipt;
  receiptHash?: string;
  verificationSig?: VerificationSig;
  authorSig?: ProofBundleMeta["authorSig"];
  bindings?: ProofBundleMeta["bindings"];
  zkStatement?: ProofBundleMeta["zkStatement"];
  zkMeta?: ProofBundleMeta["zkMeta"];
  verificationCache?: ProofBundleMeta["verificationCache"];
  transport?: ProofBundleMeta["transport"];
  zkPoseidonHash?: string;
  zkProof?: ProofBundleMeta["zkProof"];
  proofHints?: ProofBundleMeta["proofHints"];
  zkPublicInputs?: ProofBundleMeta["zkPublicInputs"];
  verifiedAtPulse?: number;
};

type AuditBundlePayload = NormalizedBundle & {
  verifiedAtPulse?: number;
  zkVerified?: boolean;
};

function parseProofCapsule(raw: unknown): ProofCapsuleV1 | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== "KPV-1") return null;
  if (typeof raw.pulse !== "number" || !Number.isFinite(raw.pulse)) return null;
  if (typeof raw.chakraDay !== "string") return null;
  if (typeof raw.kaiSignature !== "string") return null;
  if (typeof raw.phiKey !== "string") return null;
  if (typeof raw.verifierSlug !== "string") return null;
  return raw as ProofCapsuleV1;
}

function buildSharedReceiptFromObject(raw: unknown): SharedReceipt | null {
  if (!isRecord(raw)) return null;
  const proofCapsule = parseProofCapsule(raw.proofCapsule);
  if (!proofCapsule) return null;
  const verifiedAtPulse =
    typeof raw.verifiedAtPulse === "number" && Number.isFinite(raw.verifiedAtPulse)
      ? raw.verifiedAtPulse
      : typeof raw.verifiedAtPulse === "string" && Number.isFinite(Number(raw.verifiedAtPulse))
        ? Number(raw.verifiedAtPulse)
        : undefined;
  return {
    proofCapsule,
    capsuleHash: typeof raw.capsuleHash === "string" ? raw.capsuleHash : undefined,
    svgHash: typeof raw.svgHash === "string" ? raw.svgHash : undefined,
    bundleRoot: isRecord(raw.bundleRoot) ? (raw.bundleRoot as ProofBundleMeta["bundleRoot"]) : undefined,
    bundleHash: typeof raw.bundleHash === "string" ? raw.bundleHash : undefined,
    mode: raw.mode === "receive" || raw.mode === "origin" ? raw.mode : undefined,
    originBundleHash: typeof raw.originBundleHash === "string" ? raw.originBundleHash : undefined,
    receiveBundleHash: typeof raw.receiveBundleHash === "string" ? raw.receiveBundleHash : undefined,
    originAuthorSig: raw.originAuthorSig as ProofBundleMeta["authorSig"],
    receiveSig: isReceiveSig(raw.receiveSig) ? raw.receiveSig : null,
    receivePulse:
      typeof raw.receivePulse === "number" && Number.isFinite(raw.receivePulse)
        ? raw.receivePulse
        : typeof raw.receivePulse === "string" && Number.isFinite(Number(raw.receivePulse))
          ? Number(raw.receivePulse)
          : undefined,
    ownerPhiKey: typeof raw.ownerPhiKey === "string" ? raw.ownerPhiKey : undefined,
    ownerKeyDerivation: isRecord(raw.ownerKeyDerivation) ? (raw.ownerKeyDerivation as OwnerKeyDerivation) : undefined,
    verifierUrl: typeof raw.verifierUrl === "string" ? raw.verifierUrl : undefined,
    verifier: raw.verifier === "local" || raw.verifier === "pbi" ? (raw.verifier as VerificationSource) : undefined,
    verificationVersion: typeof raw.verificationVersion === "string" ? raw.verificationVersion : undefined,
    shareUrl: typeof raw.shareUrl === "string" ? raw.shareUrl : undefined,
    cacheKey: typeof raw.cacheKey === "string" ? raw.cacheKey : undefined,
    receipt: isRecord(raw.receipt) ? (raw.receipt as VerificationReceipt) : undefined,
    receiptHash: typeof raw.receiptHash === "string" ? raw.receiptHash : undefined,
    verificationSig: isRecord(raw.verificationSig) ? (raw.verificationSig as VerificationSig) : undefined,
    authorSig: raw.authorSig as ProofBundleMeta["authorSig"],
    bindings: isRecord(raw.bindings) ? (raw.bindings as ProofBundleMeta["bindings"]) : undefined,
    zkStatement: isRecord(raw.zkStatement) ? (raw.zkStatement as ProofBundleMeta["zkStatement"]) : undefined,
    zkMeta: isRecord(raw.zkMeta) ? (raw.zkMeta as ProofBundleMeta["zkMeta"]) : undefined,
    verificationCache: isRecord(raw.verificationCache) ? (raw.verificationCache as ProofBundleMeta["verificationCache"]) : undefined,
    transport: isRecord(raw.transport) ? (raw.transport as ProofBundleMeta["transport"]) : undefined,
    zkPoseidonHash: typeof raw.zkPoseidonHash === "string" ? raw.zkPoseidonHash : undefined,
    zkProof: "zkProof" in raw ? raw.zkProof : undefined,
    proofHints: "proofHints" in raw ? raw.proofHints : undefined,
    zkPublicInputs: "zkPublicInputs" in raw ? raw.zkPublicInputs : undefined,
    verifiedAtPulse,
  };
}

function readSharedReceiptFromLocation(): { receipt: SharedReceipt | null; error?: string } {
  if (typeof window === "undefined") return { receipt: null };
  const params = new URLSearchParams(window.location.search);
  const payload = params.get("p");
  if (payload) {
    try {
      const raw = decodeSharePayload(payload);
      const receipt = buildSharedReceiptFromObject(raw);
      if (!receipt) return { receipt: null, error: "Invalid share payload." };
      return { receipt };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to decode share payload.";
      return { receipt: null, error: message };
    }
  }

  const encoded = params.get("r") ?? params.get("receipt");
  if (!encoded) return { receipt: null };
  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(encoded));
    const raw = JSON.parse(decoded);
    return { receipt: buildSharedReceiptFromObject(raw) };
  } catch {
    return { receipt: null };
  }
}

function parseSharedReceiptFromText(text: string): SharedReceipt | null {
  if (!text.trim().startsWith("{")) return null;
  try {
    const raw = JSON.parse(text);
    return buildSharedReceiptFromObject(raw);
  } catch {
    return null;
  }
}

function buildReceiptShareUrl(baseUrl: string, receipt: Record<string, unknown>): string {
  const base = baseUrl || "/verify";
  const url = new URL(base, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("p", encodeSharePayload(receipt));
  return url.toString();
}

async function readFileText(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

async function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error("Failed to read file."));
    };
    reader.readAsArrayBuffer(file);
  });
}

function ellipsizeMiddle(s: string, head = 18, tail = 14): string {
  const t = (s || "").trim();
  if (!t) return "—";
  if (t.length <= head + tail + 3) return t;
  return `${t.slice(0, head)}…${t.slice(t.length - tail)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bundleHashFromAuthorSig(authorSig: KASAuthorSig): string | null {
  try {
    return bytesToHex(base64UrlDecode(authorSig.challenge));
  } catch {
    return null;
  }
}

async function verifyAuthorSigWithFallback(authorSig: KASAuthorSig, bundleHashes: string[]): Promise<boolean> {
  for (const bundleHash of bundleHashes) {
    if (!bundleHash) continue;
    if (await verifyBundleAuthorSig(bundleHash, authorSig)) return true;
  }
  return false;
}

function isSvgFile(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return name.endsWith(".svg") || type === "image/svg+xml";
}

function isPngFile(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return name.endsWith(".png") || type === "image/png";
}

function isPdfFile(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return name.endsWith(".pdf") || type === "application/pdf";
}

function extractNearestJson(text: string, anchorIdx: number): unknown | null {
  let start = -1;
  let depth = 0;
  for (let i = anchorIdx; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === "}") depth += 1;
    if (ch === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start < 0) return null;

  let end = -1;
  depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parsePdfForSharedReceipt(buffer: ArrayBuffer): SharedReceipt | null {
  const decoder = new TextDecoder("latin1");
  const text = decoder.decode(new Uint8Array(buffer));
  const anchors = [
    "\"proofCapsule\"",
    "\"bundleHash\"",
    "\"receiptHash\"",
    "\"verifierUrl\"",
    "\"verifiedAtPulse\"",
    "\"ownerPhiKey\"",
  ];

  for (const anchor of anchors) {
    let idx = text.indexOf(anchor);
    while (idx >= 0) {
      const candidate = extractNearestJson(text, idx);
      const receipt = buildSharedReceiptFromObject(candidate);
      if (receipt) return receipt;
      idx = text.indexOf(anchor, idx + anchor.length);
    }
  }
  return null;
}

function parsePdfForNoteSendMeta(buffer: ArrayBuffer): NoteSendMeta | null {
  const decoder = new TextDecoder("latin1");
  const text = decoder.decode(new Uint8Array(buffer));
  const anchors = ["\"transferNonce\"", "\"parentCanonical\"", "\"amountPhi\"", "\"amountUsd\"", "\"childCanonical\""];

  for (const anchor of anchors) {
    let idx = text.indexOf(anchor);
    while (idx >= 0) {
      const candidate = extractNearestJson(text, idx);
      const meta = buildNoteSendMetaFromObject(candidate);
      if (meta) return meta;
      idx = text.indexOf(anchor, idx + anchor.length);
    }
  }
  return null;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function ensureMetaTag(attr: "name" | "property", key: string, content: string): void {
  if (typeof document === "undefined") return;
  if (!content) return;
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head?.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head?.appendChild(el);
  }
  el.setAttribute("content", content);
}

type BadgeKind = "idle" | "busy" | "ok" | "fail";
type PanelKey = "inhale" | "capsule" | "proof" | "zk" | "audit";
type SealState = "off" | "busy" | "valid" | "invalid" | "na";

/* ────────────────────────────────────────────────────────────────
   Icons
─────────────────────────────────────────────────────────────── */

function ZkMark(): ReactElement {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.25 20.25 7v10L12 21.75 3.75 17V7L12 2.25Z" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.95" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" opacity="0.95" />
      <path d="M7.2 12c0-2.65 2.15-4.8 4.8-4.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function ProofMark(): ReactElement {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9.5 7.5a2.5 2.5 0 0 1 4 0l.7 1a3.6 3.6 0 0 0 2.3 1.4l1.2.2a2.5 2.5 0 0 1 0 4.9l-1.2.2a3.6 3.6 0 0 0-2.3 1.4l-.7 1a2.5 2.5 0 0 1-4 0l-.7-1a3.6 3.6 0 0 0-2.3-1.4l-1.2-.2a2.5 2.5 0 0 1 0-4.9l1.2-.2a3.6 3.6 0 0 0 2.3-1.4l.7-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.95"
      />
      <path d="M8.7 12.2 11 14.4l4.6-4.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SignProofIcon(): ReactElement {
  const gradientId = useId();
  const fillId = `${gradientId}-fill`;
  return (
    <svg className="vicon-word" viewBox="0 0 32 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#24f5ff" />
          <stop offset="55%" stopColor="#7b5bff" />
          <stop offset="100%" stopColor="#ff46f6" />
        </linearGradient>
        <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#24f5ff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ff46f6" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="21" rx="6" fill={`url(#${fillId})`} stroke={`url(#${gradientId})`} strokeWidth="1.4" opacity="0.98" />
      <path d="M11.2 9.2 18.6 6.8c.7-.2 1.4.5 1.2 1.2l-2.3 7.4c-.1.4-.5.7-.9.7h-2.2l-2.2 2.2c-.5.5-1.3.2-1.3-.5V15.6l-1.8-1.8c-.5-.5-.2-1.3.5-1.3h2.6Z" fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.4" strokeLinejoin="round" opacity="0.95" />
      <path d="M7.2 16.6c2.2-1.6 4.2-1.6 6.4 0 2.2 1.6 4.2 1.6 6.4 0" fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function DownloadPngIcon(): ReactElement {
  const gradientId = useId();
  const fillId = `${gradientId}-fill`;
  return (
    <svg className="vicon-word" viewBox="0 0 32 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14ffb1" />
          <stop offset="55%" stopColor="#00a3ff" />
          <stop offset="100%" stopColor="#9a3bff" />
        </linearGradient>
        <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#14ffb1" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#9a3bff" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="21" rx="6" fill={`url(#${fillId})`} stroke={`url(#${gradientId})`} strokeWidth="1.4" opacity="0.98" />
      <path d="M16 6.6v6.2m0 0-3-3m3 3 3-3" fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.98" />
      <path d="M10.2 17.3h11.6" fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
      <path d="M21.3 17.3v-3.2h-10.6v3.2" fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
    </svg>
  );
}

function NoteDownloadIcon(): ReactElement {
  return (
    <svg className="vnote-download-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="3.5" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.75" />
      <path d="M12 6.2v7.6m0 0-3.4-3.4m3.4 3.4 3.4-3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 18.5h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────
   UI atoms
─────────────────────────────────────────────────────────────── */

function IconBtn(props: {
  icon: ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "ghost" | "primary";
  ariaLabel?: string;
}): ReactElement {
  const cls = props.kind === "primary" ? "vbtn vbtn--primary" : "vbtn";
  return (
    <button type="button" className={cls} title={props.title} aria-label={props.ariaLabel ?? props.title} onClick={props.onClick} disabled={props.disabled}>
      <span className="vbtn-ic" aria-hidden="true">
        {props.icon}
      </span>
    </button>
  );
}

function TabBtn(props: { active: boolean; title: string; text: string; icon: ReactNode; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      className={props.active ? "vtab active" : "vtab"}
      onClick={props.onClick}
      title={props.title}
      aria-label={props.title}
    >
      <span className="vtab-ic" aria-hidden="true">
        {props.icon}
      </span>
      <span className="vtab-txt">{props.text}</span>
    </button>
  );
}

function OfficialBadge(props: { kind: BadgeKind; title: string; subtitle?: string; onClick?: () => void; ariaLabel?: string }): ReactElement {
  const data = props.kind === "ok" ? "ok" : props.kind === "fail" ? "fail" : props.kind === "busy" ? "busy" : "idle";
  const showCheck = props.kind === "ok";
  const body = (
    <>
      <div className="official-top">
        <div className="official-ring" aria-hidden="true">
          {showCheck ? <span className="official-check">✓</span> : null}
        </div>
        <div className="official-title">{props.title}</div>
      </div>
      {props.subtitle ? <div className="official-sub">{props.subtitle}</div> : null}
    </>
  );
  if (props.onClick) {
    return (
      <button
        type="button"
        className="official official--button"
        data-kind={data}
        aria-live="polite"
        onClick={props.onClick}
        aria-label={props.ariaLabel ?? props.title}
      >
        {body}
      </button>
    );
  }
  return (
    <div className="official" data-kind={data} aria-live="polite">
      {body}
    </div>
  );
}

function SealPill(props: { label: string; state: SealState; detail?: string; onClick?: () => void; ariaLabel?: string }): ReactElement {
  const icon = props.state === "valid" ? "✓" : props.state === "invalid" ? "✕" : props.state === "busy" ? "⟡" : props.state === "na" ? "—" : "·";
  const text = props.state === "valid" ? "VERIFIED" : props.state === "invalid" ? "INVALID" : props.state === "busy" ? "CHECKING" : props.state === "na" ? "N/A" : "ABSENT";
  const body = (
    <>
      <span className="seal-ic" aria-hidden="true">
        {icon}
      </span>
      <span className="seal-lbl">{props.label}</span>
      <span className="seal-txt">{text}</span>
    </>
  );
  if (props.onClick) {
    return (
      <button
        type="button"
        className="seal seal--button"
        data-state={props.state}
        title={props.detail ?? ""}
        onClick={props.onClick}
        aria-label={props.ariaLabel ?? `${props.label} seal`}
      >
        {body}
      </button>
    );
  }
  return (
    <div className="seal" data-state={props.state} title={props.detail ?? ""}>
      {body}
    </div>
  );
}

function MiniField(props: { label: string; value: string; title?: string; onClick?: () => void; ariaLabel?: string }): ReactElement {
  const body = (
    <>
      <div className="mini-k">{props.label}</div>
      <div className="mini-v mono" title={props.title ?? props.value}>
        {props.value || "—"}
      </div>
    </>
  );
  if (props.onClick) {
    return (
      <button type="button" className="mini mini--button" onClick={props.onClick} aria-label={props.ariaLabel ?? props.label} title={props.title ?? props.value}>
        {body}
      </button>
    );
  }
  return <div className="mini">{body}</div>;
}

function LiveValuePill(props: {
  phiValue: number;
  usdValue: number | null;
  label: string;
  ariaLabel: string;
  onPhiClick?: () => void;
  onUsdClick?: () => void;
}): ReactElement {
  return (
    <div className="vseal-value" aria-label={props.ariaLabel}>
      <div className="vseal-value-label">{props.label}</div>
      {props.onPhiClick ? (
        <button type="button" className="vseal-value-btn vseal-value-phi" onClick={props.onPhiClick} aria-label="Open live chart for Φ value">
          {fmtPhi(props.phiValue)}
        </button>
      ) : (
        <div className="vseal-value-phi">{fmtPhi(props.phiValue)}</div>
      )}
      {props.onUsdClick ? (
        <button type="button" className="vseal-value-btn vseal-value-usd" onClick={props.onUsdClick} aria-label="Open live chart for USD value">
          {props.usdValue == null ? "—" : fmtUsd(props.usdValue)}
        </button>
      ) : (
        <div className="vseal-value-usd">{props.usdValue == null ? "—" : fmtUsd(props.usdValue)}</div>
      )}
    </div>
  );
}

function Modal(props: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }): ReactElement | null {
  if (!props.open) return null;
  return (
    <div className="vmodal-backdrop" role="dialog" aria-modal="true" aria-label={props.title} onMouseDown={props.onClose} onClick={props.onClose}>
      <div className="vmodal" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <div className="vmodal-head">
          <div className="vmodal-head-left">
            <div className="vmodal-title">{props.title}</div>
            {props.subtitle ? <div className="vmodal-sub">{props.subtitle}</div> : null}
          </div>
          <button type="button" className="vmodal-close" onClick={props.onClose} aria-label="Close" title="Close">
            ×
          </button>
        </div>
        <div className="vmodal-body">{props.children}</div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Page
─────────────────────────────────────────────────────────────── */

export default function VerifyPage(): ReactElement {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pngFileRef = useRef<HTMLInputElement | null>(null);
  const lastAutoScanKeyRef = useRef<string | null>(null);
  const noteSendConfirmedRef = useRef<string | null>(null);
  const noteClaimRemoteCheckedRef = useRef<string | null>(null);
  const noteDownloadBypassRef = useRef<boolean>(false);
  const noteDownloadInFlightRef = useRef<boolean>(false);

  const slugRaw = useMemo(() => readSlugFromLocation(), []);
  const slug = useMemo(() => parseSlug(slugRaw), [slugRaw]);
  const initialReceiptResult = useMemo(() => readSharedReceiptFromLocation(), []);

  const [panel, setPanel] = useState<PanelKey>("inhale");

  const [svgText, setSvgText] = useState<string>("");
  const [result, setResult] = useState<VerifyResult>({ status: "idle" });
  const [busy, setBusy] = useState<boolean>(false);
  const [sharedReceipt, setSharedReceipt] = useState<SharedReceipt | null>(initialReceiptResult.receipt);
  const [noteSendMeta, setNoteSendMeta] = useState<NoteSendMeta | null>(null);
  const [noteSendPayloadRaw, setNoteSendPayloadRaw] = useState<Record<string, unknown> | null>(null);
  const [noteClaimedImmediate, setNoteClaimedImmediate] = useState<boolean>(false);
  const [noteClaimedSticky, setNoteClaimedSticky] = useState<boolean>(false);
  const [noteSvgFromPng, setNoteSvgFromPng] = useState<string>("");
  const [noteProofBundleJson, setNoteProofBundleJson] = useState<string>("");

  const [proofCapsule, setProofCapsule] = useState<ProofCapsuleV1 | null>(null);
  const [capsuleHash, setCapsuleHash] = useState<string>("");
  const [svgHash, setSvgHash] = useState<string>("");
  const [bundleRoot, setBundleRoot] = useState<ProofBundleMeta["bundleRoot"] | null>(null);
  const [bundleHash, setBundleHash] = useState<string>("");
  const [svgBytesHash, setSvgBytesHash] = useState<string>("");

  const [embeddedProof, setEmbeddedProof] = useState<ProofBundleMeta | null>(null);
  const [notice, setNotice] = useState<string>(initialReceiptResult.error ?? "");

  const [ownerAuthVerified, setOwnerAuthVerified] = useState<boolean | null>(null);
  const [ownerAuthStatus, setOwnerAuthStatus] = useState<string>("Not present");
  const [ownerAuthBusy, setOwnerAuthBusy] = useState<boolean>(false);
  const [identityScanRequested, setIdentityScanRequested] = useState<boolean>(false);
  const [provenanceSigVerified, setProvenanceSigVerified] = useState<boolean | null>(null);
  const [receiveSigVerified, setReceiveSigVerified] = useState<boolean | null>(null);
  const [ownerPhiKeyVerified, setOwnerPhiKeyVerified] = useState<boolean | null>(null);
  const [ownershipAttested, setOwnershipAttested] = useState<AttestationState>("missing");
  const [artifactAttested, setArtifactAttested] = useState<AttestationState>("missing");

  const [zkVerify, setZkVerify] = useState<boolean | null>(null);
  const [zkVkey, setZkVkey] = useState<unknown>(null);
  const [zkVerifiedCached, setZkVerifiedCached] = useState<boolean>(false);
  const [verificationCacheEntry, setVerificationCacheEntry] = useState<VerificationCache | null>(null);
  const [cacheKey, setCacheKey] = useState<string>("");
  const [verificationSig, setVerificationSig] = useState<VerificationSig | null>(null);
  const [verificationSigVerified, setVerificationSigVerified] = useState<boolean | null>(null);
  const [verificationSigBusy, setVerificationSigBusy] = useState<boolean>(false);
  const [receiptHash, setReceiptHash] = useState<string>("");
  const [valuationSnapshotState, setValuationSnapshotState] = useState<ValuationSnapshotState | null>(null);
  const [valuationHash, setValuationHash] = useState<string>("");

  const [receiveSig, setReceiveSig] = useState<ReceiveSig | null>(null);

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [ledgerTick, setLedgerTick] = useState<number>(0);
  const [registryTick, setRegistryTick] = useState<number>(0);

  useEffect(() => {
    return listen(() => {
      setLedgerTick((prev) => prev + 1);
    });
  }, []);
useEffect(() => {
  return listenRegistry(() => {
    setRegistryTick((prev) => prev + 1);
  });
}, []);

  const { pulse: currentPulse } = useKaiTicker();
  const searchParams = useMemo(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""), []);

  const valuationPayload = useMemo<SigilMetadataLite | null>(() => {
    if (result.status !== "ok") return null;
    const embedded = result.embedded;
    const pulseValue = embedded.pulse ?? slug.pulse ?? undefined;
    return {
      pulse: pulseValue,
      kaiPulse: pulseValue,
      beat: embedded.beat,
      stepIndex: embedded.stepIndex,
      frequencyHz: embedded.frequencyHz,
      chakraDay: embedded.chakraDay,
      chakraGate: embedded.chakraGate,
      kaiSignature: embedded.kaiSignature,
      userPhiKey: embedded.phiKey,
    };
  }, [result, slug.pulse]);

  const { valSeal, livePrice } = useValuation({
    payload: valuationPayload,
    urlSearchParams: searchParams,
    currentPulse,
  });

  const { usdPerPhi } = useMemo(() => {
    if (!valuationPayload) return { usdPerPhi: 0 };
    try {
      const nowKai = currentPulse ?? getKaiPulseEternalInt(new Date());
      const q = quotePhiForUsd(
        {
          meta: valuationPayload,
          nowPulse: nowKai,
          usd: 100,
          currentStreakDays: 0,
          lifetimeUsdSoFar: 0,
        },
        DEFAULT_ISSUANCE_POLICY,
      );
      return { usdPerPhi: q.usdPerPhi ?? 0 };
    } catch {
      return { usdPerPhi: 0 };
    }
  }, [valuationPayload, currentPulse]);

  const liveValuePhi = useMemo(() => {
    if (!valuationPayload) return null;
    const candidate = livePrice ?? valSeal?.valuePhi ?? null;
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
  }, [valuationPayload, livePrice, valSeal]);

  const ledgerBalance = useMemo(() => {
    if (result.status !== "ok") return null;
    return readLedgerBalance(result.embedded.raw) ?? readLedgerBalance(embeddedProof?.raw);
  }, [embeddedProof?.raw, result]);

  const embeddedPhi = useMemo(() => {
    if (result.status !== "ok") return null;
    return readEmbeddedPhiAmount(result.embedded.raw) ?? readEmbeddedPhiAmount(embeddedProof?.raw);
  }, [embeddedProof?.raw, result]);

  const effectiveNoteMeta = useMemo(
    () => noteSendMeta ?? (noteSendPayloadRaw ? buildNoteSendMetaFromObjectLoose(noteSendPayloadRaw) : null),
    [noteSendMeta, noteSendPayloadRaw],
  );
  const noteClaimId = useMemo(
    () => (effectiveNoteMeta ? buildNoteId(effectiveNoteMeta.parentCanonical, effectiveNoteMeta.transferNonce) : null),
    [effectiveNoteMeta?.parentCanonical, effectiveNoteMeta?.transferNonce],
  );

  const noteValuePhi = noteSendMeta?.amountPhi ?? null;
  const noteValueUsd = noteSendMeta?.amountUsd ?? null;

  const displayPhi = noteValuePhi ?? ledgerBalance?.remaining ?? embeddedPhi ?? liveValuePhi;

  const displaySource: EmbeddedPhiSource = noteValuePhi != null ? "note" : ledgerBalance ? "balance" : embeddedPhi != null ? "embedded" : "live";

  const displayUsd = useMemo(() => {
    if (noteValueUsd != null && Number.isFinite(noteValueUsd)) return noteValueUsd;
    if (displayPhi == null || !Number.isFinite(usdPerPhi) || usdPerPhi <= 0) return null;
    return displayPhi * usdPerPhi;
  }, [displayPhi, noteValueUsd, usdPerPhi]);

  const displayLabel =
    displaySource === "note" ? "NOTE" : displaySource === "balance" ? "BALANCE" : displaySource === "embedded" ? "GLYPH" : "LIVE";
  const displayAriaLabel =
    displaySource === "note"
      ? "Exhale note value"
      : displaySource === "balance"
        ? "Glyph balance"
        : displaySource === "embedded"
          ? "Glyph embedded value"
          : "Live glyph valuation";

  const noteSendRecord = useMemo(
    () => (effectiveNoteMeta ? getSendRecordByNonce(effectiveNoteMeta.parentCanonical, effectiveNoteMeta.transferNonce) : null),
    [effectiveNoteMeta, ledgerTick, registryTick],
  );
  const noteClaimInfo = useMemo(
    () => (effectiveNoteMeta ? getNoteClaimInfo(effectiveNoteMeta.parentCanonical, effectiveNoteMeta.transferNonce) : null),
    [effectiveNoteMeta, registryTick],
  );
  const noteClaimLeader = useMemo(
    () => (effectiveNoteMeta ? getNoteClaimLeader(effectiveNoteMeta.parentCanonical) : null),
    [effectiveNoteMeta, registryTick],
  );
  const noteClaimedPulse = useMemo(() => {
    const registryPulse = normalizeClaimPulse(noteClaimInfo?.claimedPulse ?? null);
    if (registryPulse != null) return registryPulse;
    return normalizeClaimPulse(
      embeddedProof?.receivePulse ?? sharedReceipt?.receivePulse ?? receiveSig?.createdAtPulse ?? null,
    );
  }, [embeddedProof?.receivePulse, noteClaimInfo?.claimedPulse, receiveSig?.createdAtPulse, sharedReceipt?.receivePulse]);
  const noteClaimNonce = noteClaimInfo?.nonce ?? effectiveNoteMeta?.transferNonce ?? "";
  const noteClaimLeaderNonce = noteClaimLeader?.nonce ?? "";
  const noteClaimTransferHash =
    noteClaimInfo?.transferLeafHash ??
    effectiveNoteMeta?.transferLeafHashSend ??
    readRecordString(noteSendPayloadRaw, "transferLeafHashSend") ??
    noteSendRecord?.transferLeafHashSend ??
    "";
  const noteClaimedFinal =
    Boolean(noteSendRecord?.confirmed) ||
    (effectiveNoteMeta ? isNoteClaimed(effectiveNoteMeta.parentCanonical, effectiveNoteMeta.transferNonce) : false);
  useEffect(() => {
    let active = true;
    setNoteClaimedSticky(false);
    if (!effectiveNoteMeta || !noteClaimId) {
      return () => {
        active = false;
      };
    }

    (async () => {
      try {
        const claimed = await hasClaim(noteClaimId);
        if (!active) return;
        if (claimed) setNoteClaimedSticky(true);
        const hydrated = await hydrateNoteClaimFromIndex(
          effectiveNoteMeta.parentCanonical,
          effectiveNoteMeta.transferNonce,
        );
        if (active && hydrated) setRegistryTick((prev) => prev + 1);
      } catch {
        // ignore claim index failures
      }
    })();

    return () => {
      active = false;
    };
  }, [effectiveNoteMeta?.parentCanonical, effectiveNoteMeta?.transferNonce, noteClaimId]);

  const noteClaimed = noteClaimedImmediate || noteClaimedSticky || noteClaimedFinal;
  const noteClaimStatus = effectiveNoteMeta ? (noteClaimed ? "CLAIMED — SEAL Owned" : "UNCLAIMED — SEAL Available") : null;
  const noteClaimPulseLabel = useMemo(() => formatClaimPulse(noteClaimedPulse), [noteClaimedPulse]);
  const noteClaimNonceShort = noteClaimNonce ? ellipsizeMiddle(noteClaimNonce, 8, 6) : "—";
  const noteClaimLeaderShort = noteClaimLeaderNonce ? ellipsizeMiddle(noteClaimLeaderNonce, 8, 6) : "—";
  const noteClaimHashShort = noteClaimTransferHash ? ellipsizeMiddle(noteClaimTransferHash, 10, 8) : "—";
  const isNoteUpload = Boolean(noteSendMeta || noteSendPayloadRaw || noteSvgFromPng);
  const isExhaleNoteUpload = isNoteUpload;

  useEffect(() => {
    if (!effectiveNoteMeta || noteClaimedFinal) return;
    const key = `${effectiveNoteMeta.parentCanonical}|${effectiveNoteMeta.transferNonce}`;
    if (noteClaimRemoteCheckedRef.current === key) return;
    noteClaimRemoteCheckedRef.current = key;
    const ac = new AbortController();

    (async () => {
      try {
        const res = await pullAndImportRemoteUrls(ac.signal);
        if (ac.signal.aborted) return;
        if (res.imported > 0) setRegistryTick((prev) => prev + 1);
      } catch {
        // ignore remote registry failures
      }
    })();

    return () => {
      ac.abort();
    };
  }, [effectiveNoteMeta, noteClaimedFinal]);

  const isReceiveGlyph = useMemo(() => {
    const mode = embeddedProof?.mode ?? sharedReceipt?.mode;
    if (mode === "receive") return true;
    if (embeddedProof?.receiveSig || sharedReceipt?.receiveSig) return true;
    if (embeddedProof?.originBundleHash || sharedReceipt?.originBundleHash) return true;
    if (embeddedProof?.ownerPhiKey || sharedReceipt?.ownerPhiKey) return true;
    return false;
  }, [
    embeddedProof?.mode,
    embeddedProof?.originBundleHash,
    embeddedProof?.ownerPhiKey,
    embeddedProof?.receiveSig,
    sharedReceipt?.mode,
    sharedReceipt?.originBundleHash,
    sharedReceipt?.ownerPhiKey,
    sharedReceipt?.receiveSig,
  ]);
  const effectiveOriginBundleHash = useMemo(
    () =>
      embeddedProof?.originBundleHash ??
      sharedReceipt?.originBundleHash ??
      undefined,
    [embeddedProof?.originBundleHash, sharedReceipt?.originBundleHash],
  );
  const provenanceAuthorSig = useMemo(
    () =>
      embeddedProof?.originAuthorSig ??
      sharedReceipt?.originAuthorSig ??
      null,
    [embeddedProof?.originAuthorSig, sharedReceipt?.originAuthorSig],
  );
  const hasKASProvenanceSig = useMemo(
    () => hasRequiredKasAuthorSig(provenanceAuthorSig),
    [provenanceAuthorSig],
  );
  const ownerAuthorSig = useMemo(
    () => embeddedProof?.authorSig ?? (result.status === "ok" ? result.embedded.authorSig ?? null : null),
    [embeddedProof?.authorSig, result],
  );
  const hasKASOwnerSig = useMemo(
    () => hasRequiredKasAuthorSig(embeddedProof?.authorSig ?? (result.status === "ok" ? result.embedded.authorSig : null)),
    [embeddedProof?.authorSig, result],
  );
  const hasKASReceiveSig = useMemo(() => {
    if (!receiveSig) return false;
    return Boolean(receiveSig.credId && receiveSig.pubKeyJwk);
  }, [receiveSig]);
  const hasKASAuthSig = hasKASOwnerSig || hasKASReceiveSig;
  const effectiveOwnerSig = ownerAuthorSig;
  const isChildGlyphValue =
    isChildGlyph(result.status === "ok" ? result.embedded.raw : null) || isChildGlyph(embeddedProof?.raw);


  // Focus Views
  const [openSvgEditor, setOpenSvgEditor] = useState<boolean>(false);
  const [openAuditJson, setOpenAuditJson] = useState<boolean>(false);
  const [openZkProof, setOpenZkProof] = useState<boolean>(false);
  const [openZkInputs, setOpenZkInputs] = useState<boolean>(false);
  const [openZkHints, setOpenZkHints] = useState<boolean>(false);
  const noteDlgRef = useRef<HTMLDialogElement>(null);
  const [noteOpen, setNoteOpen] = useState<boolean>(false);

  // Live chart popover
  const [chartOpen, setChartOpen] = useState<boolean>(false);
  const [chartFocus, setChartFocus] = useState<"phi" | "usd">("phi");
  const [chartReflowKey, setChartReflowKey] = useState<number>(0);
  const chartMode = isReceiveGlyph ? "usd" : chartFocus;

  // Seal info popovers
  const [sealPopover, setSealPopover] = useState<"proof" | "kas" | "g16" | null>(null);

  // Header sigil preview (safe <img> object URL)
  const [sigilPreviewUrl, setSigilPreviewUrl] = useState<string>("");

  React.useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("verify-shell");
    body.classList.add("verify-shell");
    return () => {
      root.classList.remove("verify-shell");
      body.classList.remove("verify-shell");
    };
  }, []);

  React.useEffect(() => {
    const raw = svgText.trim();
    if (!raw) {
      setSigilPreviewUrl("");
      return;
    }
    try {
      const blob = new Blob([raw], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      setSigilPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch {
      setSigilPreviewUrl("");
      return;
    }
  }, [svgText]);

  React.useEffect(() => {
    let active = true;
    const raw = svgText.trim();
    if (!raw) {
      setSvgBytesHash("");
      return;
    }
    const bytes = new TextEncoder().encode(svgCanonicalForHash(raw));
    (async () => {
      const hash = await sha256Bytes(bytes);
      if (active) setSvgBytesHash(hash);
    })();
    return () => {
      active = false;
    };
  }, [svgText]);

  // Toast auto-dismiss (so it never lives forever)
  React.useEffect(() => {
    if (!notice) return;
    const ms = 2400;
    const t = window.setTimeout(() => setNotice(""), ms);
    return () => window.clearTimeout(t);
  }, [notice]);

  React.useEffect(() => {
    if (result.status === "ok") return;
    setOwnerAuthVerified(null);
    setOwnerAuthStatus("Not present");
    setOwnerAuthBusy(false);
  }, [result.status]);

  const openChartPopover = useCallback((focus: "phi" | "usd") => {
    const nextFocus = isReceiveGlyph ? "usd" : focus;
    setChartFocus(nextFocus);
    setChartOpen(true);
    setChartReflowKey((k) => k + 1);
  }, [isReceiveGlyph]);

  const closeChartPopover = useCallback(() => {
    setChartOpen(false);
  }, []);

  const closeSealPopover = useCallback(() => {
    setSealPopover(null);
  }, [setSealPopover]);

  const openProofPopover = useCallback(() => {
    setSealPopover("proof");
  }, [setSealPopover]);

  const openKasPopover = useCallback(() => {
    if (!hasKASAuthSig) return;
    setPanel("audit");
    setSealPopover("kas");
  }, [hasKASAuthSig, setPanel, setSealPopover]);

  const openG16Popover = useCallback(() => {
    setPanel("zk");
    setSealPopover("g16");
  }, [setPanel, setSealPopover]);

  React.useEffect(() => {
    if (chartOpen) setChartReflowKey((k) => k + 1);
  }, [chartMode, chartOpen, chartFocus]);

  React.useEffect(() => {
    if (!chartOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChartPopover();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chartOpen, closeChartPopover]);

  React.useEffect(() => {
    if (!sealPopover) return;
    if (sealPopover === "kas" && !hasKASAuthSig) {
      setSealPopover(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSealPopover();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSealPopover, hasKASAuthSig, sealPopover]);

  const chartPhi = useMemo(() => {
    const candidate = displayPhi ?? liveValuePhi ?? 0;
    return Number.isFinite(candidate) ? candidate : 0;
  }, [displayPhi, liveValuePhi]);

  const chartSeriesValue = useMemo(() => {
    if (!isReceiveGlyph) return chartPhi;
    const phiStatic = displayPhi ?? liveValuePhi ?? 0;
    if (!Number.isFinite(phiStatic)) return 0;
    if (!Number.isFinite(usdPerPhi) || usdPerPhi <= 0) return 0;
    return phiStatic * usdPerPhi;
  }, [chartPhi, displayPhi, isReceiveGlyph, liveValuePhi, usdPerPhi]);

  const seriesKey = useMemo(() => {
    if (result.status === "ok") {
      return `${result.embedded.pulse ?? slug.pulse ?? "x"}|${result.embedded.kaiSignature ?? ""}|${result.embedded.phiKey ?? ""}`;
    }
    return slug.raw ? `slug-${slug.raw}` : "verify";
  }, [result, slug.pulse, slug.raw]);

  const chartData = useRollingChartSeries({
    seriesKey,
    sampleMs: BREATH_MS,
    valuePhi: chartSeriesValue,
    usdPerPhi,
    maxPoints: 4096,
    snapKey: chartReflowKey,
  });

  const pvForChart = useMemo(() => (chartPhi > 0 ? chartPhi : 0), [chartPhi]);

  const zkMeta = useMemo(() => {
    if (embeddedProof) {
      return {
        zkPoseidonHash: embeddedProof.zkPoseidonHash,
        zkProof: embeddedProof.zkProof,
        zkPublicInputs: embeddedProof.zkPublicInputs,
        proofHints: embeddedProof.transport?.proofHints ?? embeddedProof.proofHints,
      } satisfies ProofBundleMeta;
    }
    if (result.status !== "ok") return null;
    if (!result.embedded.zkProof && !result.embedded.zkPublicInputs && !result.embedded.zkPoseidonHash && !result.embedded.proofHints) return null;

    return {
      zkPoseidonHash: result.embedded.zkPoseidonHash,
      zkProof: result.embedded.zkProof,
      zkPublicInputs: result.embedded.zkPublicInputs,
      proofHints: result.embedded.proofHints,
    } satisfies ProofBundleMeta;
  }, [embeddedProof, result]);

  const embeddedZkProof = useMemo(() => (zkMeta?.zkProof ? formatProofValue(zkMeta.zkProof) : ""), [zkMeta]);
  const embeddedZkPublicInputs = useMemo(() => (zkMeta?.zkPublicInputs ? formatProofValue(zkMeta.zkPublicInputs) : ""), [zkMeta]);
  const embeddedProofHints = useMemo(() => (zkMeta?.proofHints ? formatProofValue(zkMeta.proofHints) : ""), [zkMeta]);

  const currentVerifyUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, [slugRaw]);

  const remember = useCallback(async (text: string, label: string): Promise<void> => {
    const t = (text || "").trim();
    if (!t) return;

    try {
      if (!navigator.clipboard?.writeText) {
        setNotice("Clipboard unavailable. Use manual copy.");
        return;
      }
      await navigator.clipboard.writeText(t);
      setNotice(`${label} remembered.`);
    } catch (err) {
      setNotice("Remember failed. Use manual copy.");
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, []);

  const onPickFile = useCallback(
    async (file: File): Promise<void> => {
      if (!isSvgFile(file)) {
        setResult({ status: "error", message: "inhale a sealed .svg (embedded <metadata> JSON).", slug });
        return;
      }
      const text = await readFileText(file);
      setSvgText(text);
      setResult({ status: "idle" });
      setNotice("");
      setNoteSendMeta(null);
      setNoteSendPayloadRaw(null);
      setNoteClaimedImmediate(false);
      noteDownloadBypassRef.current = false;
      setNoteSvgFromPng("");
      setNoteProofBundleJson("");
    },
    [slug],
  );

  const onPickReceiptPng = useCallback(
    async (file: File): Promise<void> => {
      if (!isPngFile(file)) {
        setResult({ status: "error", message: "Select a receipt PNG with embedded proof metadata.", slug });
        return;
      }
      setNoteSendMeta(null);
      setNoteSendPayloadRaw(null);
      setNoteClaimedImmediate(false);
      noteDownloadBypassRef.current = false;
      setNoteSvgFromPng("");
      setNoteProofBundleJson("");
      try {
        const buffer = await readFileArrayBuffer(file);
        const bytes = new Uint8Array(buffer);
        const text = readPngTextChunk(bytes, "phi_proof_bundle");
        if (!text) {
          setResult({ status: "error", message: "Receipt PNG is missing embedded proof metadata.", slug });
          return;
        }
        const noteSendJson = readPngTextChunk(bytes, "phi_note_send");
        const noteSvg = readPngTextChunk(bytes, "phi_note_svg");
        const parsed = JSON.parse(text) as unknown;
        const receipt = buildSharedReceiptFromObject(parsed);
        if (!receipt) {
          setResult({ status: "error", message: "Receipt PNG contains an invalid proof bundle.", slug });
          return;
        }
        setSharedReceipt(receipt);
        setSvgText("");
        setResult({ status: "idle" });
        setNotice("Receipt PNG loaded.");
const payloadRaw = parseNoteSendPayload(noteSendJson);
const meta = parseNoteSendMeta(noteSendJson) ?? (payloadRaw ? buildNoteSendMetaFromObjectLoose(payloadRaw) : null);

setNoteSendMeta(meta);
setNoteSendPayloadRaw(payloadRaw);

        setNoteSvgFromPng(noteSvg ?? "");
        setNoteProofBundleJson(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to read receipt PNG.";
        setResult({ status: "error", message: msg, slug });
      }
    },
    [slug],
  );

  const onPickReceiptPdf = useCallback(
    async (file: File): Promise<void> => {
      if (!isPdfFile(file)) {
        setResult({ status: "error", message: "Select a receipt PDF with embedded proof metadata.", slug });
        return;
      }
      setNoteSendMeta(null);
      setNoteSendPayloadRaw(null);
      setNoteClaimedImmediate(false);
      noteDownloadBypassRef.current = false;
      setNoteSvgFromPng("");
      setNoteProofBundleJson("");
      try {
        const buffer = await readFileArrayBuffer(file);
        const receipt = parsePdfForSharedReceipt(buffer);
        const noteMeta = parsePdfForNoteSendMeta(buffer);
        if (!receipt) {
          setSharedReceipt(null);
          setResult({ status: "error", message: "Receipt PDF is missing embedded proof metadata.", slug });
          return;
        }
        setSharedReceipt(receipt);
        setSvgText("");
        setResult({ status: "idle" });
        setNotice("Receipt PDF loaded.");
        setNoteSendMeta(noteMeta);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to read receipt PDF.";
        setResult({ status: "error", message: msg, slug });
      }
    },
    [slug],
  );

  const handleFiles = useCallback(
    (files: FileList | null | undefined): void => {
      if (!files || files.length === 0) return;
      const arr = Array.from(files);
      const pdf = arr.find(isPdfFile);
      if (pdf) {
        void onPickReceiptPdf(pdf);
        return;
      }
      const png = arr.find(isPngFile);
      if (png) {
        void onPickReceiptPng(png);
        return;
      }
      const svg = arr.find(isSvgFile);
      if (!svg) {
        setResult({ status: "error", message: "Drop/select a sealed .svg file or receipt PNG.", slug });
        return;
      }
      void onPickFile(svg);
    },
    [onPickFile, onPickReceiptPng, onPickReceiptPdf, slug],
  );

const confirmNoteSend = useCallback(
  (override?: {
    meta?: NoteSendMeta;
    payloadRaw?: Record<string, unknown> | null;
    claimedPulse?: number;
  }) => {
    const overridePayload = override?.payloadRaw ?? null;
    // ✅ tolerate missing noteSendMeta (common on receipt PNGs)
    const effectiveMeta =
      override?.meta ??
      noteSendMeta ??
      (overridePayload ? buildNoteSendMetaFromObjectLoose(overridePayload) : null) ??
      (noteSendPayloadRaw ? buildNoteSendMetaFromObjectLoose(noteSendPayloadRaw) : null);

    if (!effectiveMeta) return;

    if (!noteSendMeta) {
      setNoteSendMeta(effectiveMeta);
    }
    setNoteClaimedImmediate(true);

    const key = `${effectiveMeta.parentCanonical}|${effectiveMeta.transferNonce}`;
    if (noteSendConfirmedRef.current === key) return;
    noteSendConfirmedRef.current = key;

    const claimedPulse = override?.claimedPulse ?? currentPulse ?? getKaiPulseEternalInt(new Date());

    // ✅ don’t rely on noteSendRecord memo (it’s tied to noteSendMeta); fetch directly
    const rec = getSendRecordByNonce(effectiveMeta.parentCanonical, effectiveMeta.transferNonce);

    const transferLeafHash =
      effectiveMeta.transferLeafHashSend ??
      readRecordString(overridePayload, "transferLeafHashSend") ??
      readRecordString(overridePayload, "transferLeafHash") ??
      readRecordString(overridePayload, "leafHash") ??
      readRecordString(noteSendPayloadRaw, "transferLeafHashSend") ??
      readRecordString(noteSendPayloadRaw, "transferLeafHash") ??
      readRecordString(noteSendPayloadRaw, "leafHash") ??
      rec?.transferLeafHashSend ??
      undefined;

    try {
      // Send ledger confirm (best-effort)
      markConfirmedByNonce(effectiveMeta.parentCanonical, effectiveMeta.transferNonce);

      // Note claim registry (this is what your UI uses to show CLAIMED)
      markNoteClaimed(effectiveMeta.parentCanonical, effectiveMeta.transferNonce, {
        childCanonical: effectiveMeta.childCanonical,
        transferLeafHash,
        claimedPulse,
      });

      // Optional movement trace
      if (effectiveMeta.childCanonical && effectiveMeta.amountPhi) {
        recordSigilTransferMovement({
          hash: effectiveMeta.childCanonical,
          direction: "receive",
          amountPhi: effectiveMeta.amountPhi,
          amountUsd: effectiveMeta.amountUsd != null ? effectiveMeta.amountUsd.toFixed(2) : undefined,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("note send confirm failed", err);
    } finally {
      // ✅ force re-render even if iOS storage/broadcast events don’t fire
      setLedgerTick((prev) => prev + 1);
      setRegistryTick((prev) => prev + 1);
    }
  },
  [currentPulse, noteSendMeta, noteSendPayloadRaw],
);

  const runOwnerAuthFlow = useCallback(
    async (args: {
      ownerAuthorSig: KASAuthorSig | null;
      glyphPhiKeyDeclared: string | null;
      glyphPhiKeyFallback: string | null;
    }): Promise<void> => {
      if (ownerAuthBusy) return;
      setOwnerAuthVerified(null);

      const ownerAuthorSig = args.ownerAuthorSig;
      if (!hasRequiredKasAuthorSig(ownerAuthorSig)) return;

      if (!isWebAuthnAvailable()) {
        setOwnerAuthStatus("Authentication not completed.");
        setNotice("WebAuthn is not available in this browser. Please verify on a device with passkeys enabled.");
        return;
      }

      const expectedCredId =
        ownerAuthorSig.credId || (ownerAuthorSig as { rawId?: string }).rawId || "";
      if (!expectedCredId) {
        setOwnerAuthVerified(false);
        setOwnerAuthStatus("Steward mismatch.");
        return;
      }

      setOwnerAuthBusy(true);
      setOwnerAuthStatus("Waiting for steward authentication…");
      const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
      const requestAssertion = async (
        allowCredentials?: PublicKeyCredentialDescriptor[]
      ): Promise<PublicKeyCredential | null> => {
        try {
          const got = await navigator.credentials.get({
            publicKey: {
              challenge: challengeBytes,
              userVerification: "required",
              timeout: 60_000,
              ...(allowCredentials ? { allowCredentials } : {}),
            },
          });
          return (got ?? null) as PublicKeyCredential | null;
        } catch {
          return null;
        }
      };

      let allowCredentials: PublicKeyCredentialDescriptor[] | undefined;
      if (expectedCredId) {
        try {
          const idBytes = base64UrlDecode(expectedCredId);
          allowCredentials = [{ type: "public-key" as const, id: toArrayBuffer(idBytes) }];
        } catch {
          allowCredentials = undefined;
        }
      }

      let assertion = await requestAssertion(allowCredentials);
      if (!assertion) {
        setOwnerAuthStatus("Searching for signer passkey…");
        assertion = await requestAssertion();
      }

      if (assertion) {
        const assertionJson = assertionToJson(assertion);
        const verified = await verifyOwnerWebAuthnAssertion({
          assertion: assertionJson,
          expectedChallenge: challengeBytes,
          pubKeyJwk: ownerAuthorSig.pubKeyJwk,
          expectedCredId,
        });

        if (!verified) {
          setOwnerAuthVerified(false);
          setOwnerAuthStatus("Signer mismatch.");
          setOwnerAuthBusy(false);
          return;
        }

        const declaredPhiKey = args.glyphPhiKeyDeclared;
        if (declaredPhiKey) {
          const signerPhiKey = await derivePhiKeyFromPubKeyJwk(ownerAuthorSig.pubKeyJwk);
          if (signerPhiKey !== declaredPhiKey) {
            setOwnerAuthVerified(false);
            setOwnerAuthStatus("Signer mismatch.");
            setOwnerAuthBusy(false);
            return;
          }
        }

        const storePhiKey = args.glyphPhiKeyDeclared ?? args.glyphPhiKeyFallback;
        if (storePhiKey) {
          storePasskey(storePhiKey, {
            credId: assertionJson.rawId,
            pubKeyJwk: ownerAuthorSig.pubKeyJwk,
          });
        }
        setOwnerAuthVerified(true);
        setOwnerAuthStatus("Steward verified");
        setOwnerAuthBusy(false);
        return;
      }

      setOwnerAuthVerified(false);
      setOwnerAuthStatus("Steward credential not found on this device.");
      setOwnerAuthBusy(false);
    },
    [ownerAuthBusy],
  );

  const stampAuditFields = useCallback(
    (params: {
      nextResult: VerifyResult;
      embeddedMeta?: ProofBundleMeta | null;
      bundleHashValue?: string;
    }): void => {
      const bundleHashValue = params.bundleHashValue ?? "";
      if (params.nextResult.status !== "ok" || !bundleHashValue) {
        setReceiveSig(null);
        setReceiveSigVerified(null);
        setOwnerPhiKeyVerified(null);
        setOwnershipAttested("missing");
        return;
      }

      const embeddedReceive =
        params.embeddedMeta?.receiveSig ??
        readReceiveSigFromBundle(params.embeddedMeta?.raw ?? params.nextResult.embedded.raw);
      if (embeddedReceive) {
        setReceiveSig(embeddedReceive);
        return;
      }

      setReceiveSig(null);
      setReceiveSigVerified(null);
      setOwnerPhiKeyVerified(null);
      setOwnershipAttested("missing");
    },
    [],
  );

  const runVerify = useCallback(async (): Promise<void> => {
    const raw = svgText.trim();
    if (!raw) {
      setResult({ status: "error", message: "Inhale or remember the sealed SVG (Sigil-Glyph).", slug });
      return;
    }
    const receipt = parseSharedReceiptFromText(raw);
    if (receipt) {
      try {
if (receipt.receiptHash) {
  if (!receipt.receipt) {
    throw new Error("verification receipt mismatch");
  }
  await assertReceiptHashMatch(receipt.receipt, receipt.receiptHash);
}

        setSharedReceipt(receipt);
        setSvgText("");
        setResult({ status: "idle" });
        setNotice("Receipt loaded.");
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "verification receipt mismatch";
        setResult({ status: "error", message: msg, slug });
        return;
      }
    }
    setBusy(true);
    try {
      const verifiedAtPulse = currentPulse ?? getKaiPulseEternalInt(new Date());
      const next = await verifySigilSvg(slug, raw, verifiedAtPulse);
      setResult(next);
      if (next.status === "ok") {
        const embeddedProofMeta = extractProofBundleMetaFromSvg(raw);
        const ownerAuthorSig = embeddedProofMeta?.authorSig ?? next.embedded.authorSig ?? null;
        const rawEmbeddedPhiKey = next.embeddedRawPhiKey ?? null;
        const glyphPhiKeyDeclared = normalizeRawDeclaredPhiKey(rawEmbeddedPhiKey);
        const glyphPhiKeyFallback = glyphPhiKeyDeclared ? null : next.derivedPhiKey ?? null;
        if (hasRequiredKasAuthorSig(ownerAuthorSig)) {
          await runOwnerAuthFlow({ ownerAuthorSig, glyphPhiKeyDeclared, glyphPhiKeyFallback });
        }
        stampAuditFields({
          nextResult: next,
          embeddedMeta: embeddedProofMeta,
          bundleHashValue: embeddedProofMeta?.bundleHash ?? "",
        });
        confirmNoteSend();
      } else {
        setOwnerAuthVerified(null);
        setOwnerAuthStatus("Not present");
      }
    } finally {
      setBusy(false);
    }
  }, [confirmNoteSend, currentPulse, runOwnerAuthFlow, slug, stampAuditFields, svgText]);

  const identityAttested: AttestationState = hasKASOwnerSig ? (ownerAuthVerified === null ? "missing" : ownerAuthVerified) : "missing";

  const autoScanContext = useMemo(() => {
    if (!sharedReceipt) return null;
    const authorSig = embeddedProof?.authorSig ?? sharedReceipt.authorSig ?? null;
    if (!hasRequiredKasAuthorSig(authorSig)) return null;
    const bundleHashValue = sharedReceipt.bundleHash ?? bundleHash;
    if (!bundleHashValue) return null;
    const expectedCredId = authorSig.credId || (authorSig as { rawId?: string }).rawId || "";
    if (!expectedCredId) return null;
    try {
      base64UrlDecode(expectedCredId);
    } catch {
      return null;
    }
    const authorSigBundleHash = bundleHashFromAuthorSig(authorSig) ?? "";
    return { authorSig, bundleHashValue, authorSigBundleHash, expectedCredId };
  }, [bundleHash, embeddedProof?.authorSig, sharedReceipt]);

  const autoScanFallbackPhiKey = useMemo(
    () => (sharedReceipt?.proofCapsule?.phiKey ? sharedReceipt.proofCapsule.phiKey : null),
    [sharedReceipt?.proofCapsule?.phiKey],
  );

  React.useEffect(() => {
    if (!hasKASOwnerSig) return;
    if (identityAttested !== "missing") return;
    if (!autoScanContext) return;
    const autoScanKey = `${autoScanContext.bundleHashValue}|${autoScanContext.authorSigBundleHash}|${autoScanContext.expectedCredId}`;
    if (lastAutoScanKeyRef.current === autoScanKey) return;
    lastAutoScanKeyRef.current = autoScanKey;
    setIdentityScanRequested(true);
  }, [autoScanContext, hasKASOwnerSig, identityAttested]);

  React.useEffect(() => {
    if (!hasKASOwnerSig) return;
    if (!identityScanRequested) return;
    if (!autoScanContext) return;
    void runOwnerAuthFlow({
      ownerAuthorSig: autoScanContext.authorSig,
      glyphPhiKeyDeclared: null,
      glyphPhiKeyFallback: autoScanFallbackPhiKey,
    });
    setIdentityScanRequested(false);
  }, [autoScanContext, autoScanFallbackPhiKey, hasKASOwnerSig, identityScanRequested, runOwnerAuthFlow]);

  React.useEffect(() => {
    if (!hasKASOwnerSig) {
      if (identityScanRequested) setIdentityScanRequested(false);
      return;
    }
    if (identityAttested !== "missing") {
      if (identityScanRequested) setIdentityScanRequested(false);
      return;
    }
    if (!autoScanContext && identityScanRequested) {
      setIdentityScanRequested(false);
    }
  }, [autoScanContext, hasKASOwnerSig, identityAttested, identityScanRequested]);

  // Proof bundle construction (logic unchanged)
  React.useEffect(() => {
    let active = true;

    const buildProof = async (): Promise<void> => {
      if (result.status !== "ok") {
        setProofCapsule(null);
        setCapsuleHash("");
        setSvgHash("");
        setBundleRoot(null);
        setBundleHash("");
        setEmbeddedProof(null);
        setProvenanceSigVerified(null);
        setVerificationCacheEntry(null);
        setZkVerifiedCached(false);
        setVerificationSig(null);
        setReceiptHash("");
        setNotice("");
        return;
      }

      if (sharedReceipt && !svgText.trim()) {
        setProofCapsule(sharedReceipt.proofCapsule);
        setSvgHash(sharedReceipt.svgHash ?? "");
        setCapsuleHash(sharedReceipt.capsuleHash ?? "");
        setBundleHash(sharedReceipt.bundleHash ?? "");
        setEmbeddedProof({
          proofCapsule: sharedReceipt.proofCapsule,
          svgHash: sharedReceipt.svgHash,
          capsuleHash: sharedReceipt.capsuleHash,
          bundleHash: sharedReceipt.bundleHash,
          shareUrl: sharedReceipt.shareUrl,
          verifierUrl: sharedReceipt.verifierUrl,
          verifier: sharedReceipt.verifier,
          verificationVersion: sharedReceipt.verificationVersion,
          cacheKey: sharedReceipt.cacheKey,
          receipt: sharedReceipt.receipt,
          receiptHash: sharedReceipt.receiptHash,
          verificationSig: sharedReceipt.verificationSig,
          verifiedAtPulse: sharedReceipt.verifiedAtPulse,
          authorSig: sharedReceipt.authorSig,
          zkPoseidonHash: sharedReceipt.zkPoseidonHash,
          zkProof: sharedReceipt.zkProof,
          proofHints: sharedReceipt.proofHints,
          zkPublicInputs: sharedReceipt.zkPublicInputs,
        });
        setProvenanceSigVerified(null);
        return;
      }

      const kaiSignature = result.embedded.kaiSignature ?? "";
      const pulse = result.embedded.pulse ?? result.slug.pulse ?? 0;
      const chakraDay = normalizeChakraDay(result.embedded.chakraDay ?? "") ?? "Crown";
      const phiKey = result.derivedPhiKey;
      const verifierSlug = buildVerifierSlug(pulse, kaiSignature);

      const fallbackCapsule: ProofCapsuleV1 = { v: "KPV-1", pulse, chakraDay, kaiSignature, phiKey, verifierSlug };

      const svgHashNext = await hashSvgText(svgText);
      const embedded = extractProofBundleMetaFromSvg(svgText);
      const capsule = embedded?.proofCapsule ?? fallbackCapsule;
      const capsuleHashNext = await hashProofCapsuleV1(capsule);
      const embeddedVerifiedAtPulse =
        typeof embedded?.verifiedAtPulse === "number" && Number.isFinite(embedded.verifiedAtPulse)
          ? embedded.verifiedAtPulse
          : undefined;
      const verifiedAtPulse =
        embeddedVerifiedAtPulse ??
        (embedded
          ? undefined
          : typeof result.verifiedAtPulse === "number" && Number.isFinite(result.verifiedAtPulse)
            ? result.verifiedAtPulse
            : undefined);

      const verifierValue = embedded?.verifier;
      const verificationVersionValue = embedded?.verificationVersion;
      const proofHintsValue = embedded?.transport?.proofHints ?? embedded?.proofHints;
      const embeddedMode = embedded?.mode;
      const provenanceAuthorSig = embedded?.originAuthorSig;

      const bundleSeed =
        embedded?.raw && typeof embedded.raw === "object" && embedded.raw !== null
          ? {
              ...(embedded.raw as Record<string, unknown>),
              svgHash: svgHashNext,
              capsuleHash: capsuleHashNext,
              proofCapsule: capsule,
              ...(verifierValue ? { verifier: verifierValue } : {}),
              ...(verificationVersionValue ? { verificationVersion: verificationVersionValue } : {}),
              ...(verifiedAtPulse != null ? { verifiedAtPulse } : {}),
            }
          : {
              hashAlg: embedded?.hashAlg ?? PROOF_HASH_ALG,
              canon: embedded?.canon ?? PROOF_CANON,
              bindings: embedded?.bindings ?? PROOF_BINDINGS,
              zkStatement: embedded?.zkStatement,
              bundleRoot: embedded?.bundleRoot,
              zkMeta: embedded?.zkMeta,
              proofCapsule: capsule,
              capsuleHash: capsuleHashNext,
              svgHash: svgHashNext,
              shareUrl: embedded?.shareUrl,
              verifierUrl: embedded?.verifierUrl,
              ...(verifierValue ? { verifier: verifierValue } : {}),
              ...(verificationVersionValue ? { verificationVersion: verificationVersionValue } : {}),
              ...(verifiedAtPulse != null ? { verifiedAtPulse } : {}),
              zkPoseidonHash: embedded?.zkPoseidonHash,
              zkProof: embedded?.zkProof,
              proofHints: proofHintsValue,
              zkPublicInputs: embedded?.zkPublicInputs,
              mode: embeddedMode,
              originBundleHash: embedded?.originBundleHash,
              receiveBundleHash: embedded?.receiveBundleHash,
              originAuthorSig: provenanceAuthorSig ?? null,
              receiveSig: embedded?.receiveSig ?? null,
              receivePulse: embedded?.receivePulse,
              ownerPhiKey: embedded?.ownerPhiKey,
              ownerKeyDerivation: embedded?.ownerKeyDerivation,
              authorSig: embedded?.authorSig ?? null,
            };

      const bundleRootNext = buildBundleRoot(bundleSeed);
      const rootHash = await computeBundleHash(bundleRootNext);
      const legacySeed = { ...bundleSeed } as Record<string, unknown>;
      delete legacySeed.bundleRoot;
      delete legacySeed.transport;
      delete legacySeed.verificationCache;
      delete legacySeed.cacheKey;
      delete legacySeed.receipt;
      delete legacySeed.receiptHash;
      delete legacySeed.verificationSig;
      delete legacySeed.zkMeta;
      const bundleUnsigned = buildBundleUnsigned(legacySeed);
      const legacyHash = await hashBundle(bundleUnsigned);
      const useRootHash =
        Boolean(embedded?.bundleRoot) ||
        embedded?.bindings?.bundleHashOf === PROOF_BINDINGS.bundleHashOf;
      const bundleHashNext = useRootHash ? rootHash : legacyHash;

      let provenanceSigOk: boolean | null = null;
      if (provenanceAuthorSig) {
        if (!embedded?.originBundleHash || !hasRequiredKasAuthorSig(provenanceAuthorSig)) {
          provenanceSigOk = null;
        } else {
          provenanceSigOk = await verifyBundleAuthorSig(embedded.originBundleHash, provenanceAuthorSig);
        }
      }

      if (!active) return;
      setProofCapsule(capsule);
      setSvgHash(svgHashNext);
      setCapsuleHash(capsuleHashNext);
      setBundleRoot(useRootHash ? bundleRootNext : embedded?.bundleRoot ?? null);
      setBundleHash(bundleHashNext);
      setEmbeddedProof(embedded);
      setProvenanceSigVerified(provenanceSigOk);
    };

    void buildProof();
    return () => {
      active = false;
    };
  }, [result, sharedReceipt, slug.raw, svgText]);

  React.useEffect(() => {
    let active = true;
    if (!sharedReceipt || svgText.trim()) return;
    const capsule = sharedReceipt.proofCapsule;
    const embed: ProofBundleMeta = {
      proofCapsule: capsule,
      svgHash: sharedReceipt.svgHash,
      capsuleHash: sharedReceipt.capsuleHash,
      bundleRoot: sharedReceipt.bundleRoot,
      bundleHash: sharedReceipt.bundleHash,
      shareUrl: sharedReceipt.shareUrl,
      verifierUrl: sharedReceipt.verifierUrl,
      verifier: sharedReceipt.verifier,
      verificationVersion: sharedReceipt.verificationVersion,
      cacheKey: sharedReceipt.cacheKey,
      receipt: sharedReceipt.receipt,
      receiptHash: sharedReceipt.receiptHash,
      verificationSig: sharedReceipt.verificationSig,
      verifiedAtPulse: sharedReceipt.verifiedAtPulse,
      authorSig: sharedReceipt.authorSig,
      mode: sharedReceipt.mode,
      originBundleHash: sharedReceipt.originBundleHash,
      receiveBundleHash: sharedReceipt.receiveBundleHash,
      originAuthorSig: sharedReceipt.originAuthorSig ?? null,
      receiveSig: sharedReceipt.receiveSig ?? null,
      receivePulse: sharedReceipt.receivePulse,
      ownerPhiKey: sharedReceipt.ownerPhiKey,
      ownerKeyDerivation: sharedReceipt.ownerKeyDerivation,
      bindings: sharedReceipt.bindings,
      zkStatement: sharedReceipt.zkStatement,
      zkMeta: sharedReceipt.zkMeta,
      verificationCache: sharedReceipt.verificationCache,
      transport: sharedReceipt.transport,
      zkPoseidonHash: sharedReceipt.zkPoseidonHash,
      zkProof: sharedReceipt.zkProof,
      proofHints: sharedReceipt.proofHints,
      zkPublicInputs: sharedReceipt.zkPublicInputs,
    };

    (async () => {
      const derivedPhiKey = await derivePhiKeyFromSig(capsule.kaiSignature);
      const slugPulseMatches = slug.pulse == null ? null : slug.pulse === capsule.pulse;
      const slugShortSigMatches =
        slug.shortSig == null ? null : slug.shortSig === capsule.kaiSignature.slice(0, slug.shortSig.length);
      const derivedPhiKeyMatchesEmbedded = capsule.phiKey ? derivedPhiKey === capsule.phiKey : null;
      const verifiedAtPulse = sharedReceipt.verifiedAtPulse ?? null;

      if (!active) return;
      const checks = {
        hasSignature: true,
        slugPulseMatches,
        slugShortSigMatches,
        derivedPhiKeyMatchesEmbedded,
      } as const;
      const hardFail =
        checks.slugPulseMatches === false ||
        checks.slugShortSigMatches === false ||
        checks.derivedPhiKeyMatchesEmbedded === false;
      const baseEmbedded = {
        pulse: capsule.pulse,
        chakraDay: capsule.chakraDay,
        kaiSignature: capsule.kaiSignature,
        phiKey: capsule.phiKey,
        proofCapsule: capsule,
      };

      setResult(
        hardFail
          ? {
              status: "error",
              message: "Verification failed: one or more checks did not match.",
              slug,
              embedded: baseEmbedded,
              derivedPhiKey,
              checks,
              embeddedRawPhiKey: capsule.phiKey,
            }
          : {
              status: "ok",
              slug,
              embedded: baseEmbedded,
              derivedPhiKey,
              checks,
              verifiedAtPulse,
              embeddedRawPhiKey: capsule.phiKey,
            },
      );
      setEmbeddedProof(embed);
      setProofCapsule(capsule);
      setCapsuleHash(sharedReceipt.capsuleHash ?? "");
      setSvgHash(sharedReceipt.svgHash ?? "");
      setBundleRoot(sharedReceipt.bundleRoot ?? null);
      setBundleHash(sharedReceipt.bundleHash ?? "");
    })();

    return () => {
      active = false;
    };
  }, [sharedReceipt, slug, svgText]);
React.useEffect(() => {
  let active = true;

  const rh = sharedReceipt?.receiptHash;
  if (typeof rh !== "string" || rh.trim().length === 0) return;

  (async () => {
    try {
      if (!sharedReceipt?.receipt) {
        throw new Error("verification receipt mismatch");
      }
      await assertReceiptHashMatch(sharedReceipt.receipt, rh);
    } catch (err) {
      if (!active) return;
      const msg = err instanceof Error ? err.message : "verification receipt mismatch";
      setResult({ status: "error", message: msg, slug });
      setSharedReceipt(null);
    }
  })();

  return () => {
    active = false;
  };
}, [sharedReceipt, slug]);

  React.useEffect(() => {
    const nextSig = embeddedProof?.verificationSig ?? sharedReceipt?.verificationSig ?? null;
    setVerificationSig(nextSig);
  }, [embeddedProof?.verificationSig, sharedReceipt?.verificationSig, bundleHash]);

  React.useEffect(() => {
    stampAuditFields({ nextResult: result, embeddedMeta: embeddedProof, bundleHashValue: bundleHash });
  }, [bundleHash, embeddedProof, result, stampAuditFields]);

  React.useEffect(() => {
    let active = true;
    if (!receiptHash || !verificationSig) {
      setVerificationSigVerified(null);
      return;
    }
    (async () => {
      const ok = await verifyVerificationSig(receiptHash, verificationSig);
      if (active) setVerificationSigVerified(ok);
    })();
    return () => {
      active = false;
    };
  }, [receiptHash, verificationSig]);

  React.useEffect(() => {
    const raw = svgText.trim();
    if (!raw) {
      setArtifactAttested("missing");
      return;
    }
    const expectedSvgHash = sharedReceipt?.svgHash ?? embeddedProof?.svgHash ?? "";
    if (!expectedSvgHash) {
      setArtifactAttested("missing");
      return;
    }
    if (!svgBytesHash) return;
    setArtifactAttested(svgBytesHash === expectedSvgHash);
  }, [embeddedProof?.svgHash, sharedReceipt?.svgHash, svgBytesHash, svgText]);

  const stewardVerifiedPulse = useMemo(() => {
    if (result.status === "ok") return result.verifiedAtPulse;
    return sharedReceipt?.verifiedAtPulse ?? null;
  }, [result, sharedReceipt?.verifiedAtPulse]);

  const valuationSnapshotKey = useMemo(() => {
    if (!bundleHash || stewardVerifiedPulse == null) return "";
    return buildValuationSnapshotKey(bundleHash, stewardVerifiedPulse);
  }, [bundleHash, stewardVerifiedPulse]);

  const valuationSnapshotInput = useMemo(() => {
    if (result.status !== "ok" || stewardVerifiedPulse == null) return null;
    if (displayPhi == null || !Number.isFinite(displayPhi)) return null;
    const usdPerPhiValue = Number.isFinite(usdPerPhi) && usdPerPhi > 0 ? usdPerPhi : null;
    const mode: ValuationSnapshotInput["mode"] = isReceiveGlyph ? "receive" : "origin";
    return {
      verifiedAtPulse: stewardVerifiedPulse,
      phiValue: displayPhi,
      usdPerPhi: usdPerPhiValue,
      source: displaySource ?? "unknown",
      mode,
    } satisfies ValuationSnapshotInput;
  }, [displayPhi, displaySource, isReceiveGlyph, result.status, stewardVerifiedPulse, usdPerPhi]);

  React.useEffect(() => {
    setValuationSnapshotState((prev) => {
      if (!valuationSnapshotKey) return null;
      if (prev?.key === valuationSnapshotKey) return prev;
      return getOrCreateValuationSnapshot(prev, valuationSnapshotKey, valuationSnapshotInput);
    });
  }, [valuationSnapshotInput, valuationSnapshotKey]);

  const valuationSnapshot = useMemo(() => valuationSnapshotState?.snapshot ?? null, [valuationSnapshotState]);

  React.useEffect(() => {
    let active = true;
    if (!valuationSnapshot) {
      setValuationHash("");
      return;
    }
    (async () => {
      const hash = await hashValuationSnapshot(valuationSnapshot);
      if (active) setValuationHash(hash);
    })();
    return () => {
      active = false;
    };
  }, [valuationSnapshot]);

  const verificationSource: VerificationSource = sharedReceipt?.verifier ?? "local";
  const verificationVersion = sharedReceipt?.verificationVersion ?? VERIFICATION_BUNDLE_VERSION;
  const cacheVerificationVersion = sharedReceipt?.verificationVersion ?? embeddedProof?.verificationVersion;

  // Groth16 verify (logic unchanged)
  React.useEffect(() => {
    let active = true;

    (async () => {
      if (!zkMeta?.zkProof || !zkMeta?.zkPublicInputs) {
        if (active) {
          setZkVerify(null);
          setZkVerifiedCached(false);
          setVerificationCacheEntry(null);
        }
        return;
      }
const cacheBundleHash = bundleHash;
const cachePoseidonHash =
  typeof zkMeta?.zkPoseidonHash === "string" && zkMeta.zkPoseidonHash.trim().length > 0
    ? zkMeta.zkPoseidonHash
    : undefined;

if (typeof cacheBundleHash === "string" && cacheBundleHash.trim().length > 0 && cachePoseidonHash) {
  const cached = await readVerificationCache({
    bundleHash: cacheBundleHash,
    zkPoseidonHash: cachePoseidonHash,
    verificationVersion: cacheVerificationVersion,
  });

  if (cached && active) {
    setZkVerify(true);
    setZkVerifiedCached(true);
    setVerificationCacheEntry({ ...cached, zkVerifiedCached: true });
    return;
  }
}


      if (!zkVkey) {
        try {
          const res = await fetch("/zk/verification_key.json", { cache: "no-store" });
          if (!res.ok) return;
          const vkey = (await res.json()) as unknown;
          if (!active) return;
          setZkVkey(vkey);
          return;
        } catch {
          return;
        }
      }

      const expectedVkHash = embeddedProof?.zkMeta?.vkHash;
      if (expectedVkHash && zkVkey && typeof zkVkey === "object") {
        try {
          const vkeyCanonical = jcsCanonicalize(zkVkey as Parameters<typeof jcsCanonicalize>[0]);
          const vkeyHash = await sha256Hex(vkeyCanonical);
          if (vkeyHash !== expectedVkHash) {
            if (active) {
              setZkVerify(false);
              setZkVerifiedCached(false);
            }
            return;
          }
        } catch {
          if (active) {
            setZkVerify(false);
            setZkVerifiedCached(false);
          }
          return;
        }
      }

      const parsedProof = parseJsonString(zkMeta.zkProof);
      const parsedInputs = parseJsonString(zkMeta.zkPublicInputs);
      const inputsArray = Array.isArray(parsedInputs)
        ? parsedInputs.map((entry) => String(entry))
        : parsedInputs && typeof parsedInputs === "object"
          ? Object.values(parsedInputs as Record<string, unknown>).map((entry) => String(entry))
          : [String(parsedInputs)];
      try {
        assertZkCurveConsistency({
          zkProof: parsedProof,
          zkMeta: embeddedProof?.zkMeta ?? embeddedProof?.bundleRoot?.zkMeta,
        });
        assertZkPublicInputsContract({
          zkPublicInputs: inputsArray,
          zkPoseidonHash: zkMeta?.zkPoseidonHash,
        });
      } catch {
        if (active) {
          setZkVerify(false);
          setZkVerifiedCached(false);
        }
        return;
      }

      const verified = await tryVerifyGroth16({
        proof: parsedProof,
        publicSignals: inputsArray,
        vkey: zkVkey ?? undefined,
        fallbackVkey: zkVkey ?? undefined,
      });

      if (!active) return;
      setZkVerify(verified);
      setZkVerifiedCached(false);
if (verified && typeof cacheBundleHash === "string" && cacheBundleHash.trim().length > 0 && cachePoseidonHash) {
  const entry = await buildVerificationCacheRecord({
    bundleHash: cacheBundleHash,
    zkPoseidonHash: cachePoseidonHash,
    verificationVersion: cacheVerificationVersion,
    verifiedAtPulse: stewardVerifiedPulse ?? undefined,
    verifier: verificationSource,
    createdAtMs: Date.now(),
    expiresAtPulse: null,
  });

  await writeVerificationCache(entry);
  if (active) setVerificationCacheEntry(entry);
} else {
  setVerificationCacheEntry(null);
}

    })();

    return () => {
      active = false;
    };
  }, [
    bundleHash,
    cacheVerificationVersion,
    embeddedProof?.bundleRoot?.zkMeta,
    embeddedProof?.zkMeta,
    verificationSource,
    stewardVerifiedPulse,
    zkMeta,
    zkVkey,
  ]);

  const verificationReceipt = useMemo<VerificationReceipt | null>(() => {
    if (!bundleHash || !zkMeta?.zkPoseidonHash || stewardVerifiedPulse == null) return null;
    const valuationPayload = valuationSnapshot && valuationHash ? { valuation: valuationSnapshot, valuationHash } : undefined;
    return buildVerificationReceipt({
      bundleHash,
      zkPoseidonHash: zkMeta.zkPoseidonHash,
      verifiedAtPulse: stewardVerifiedPulse,
      verifier: verificationSource,
      verificationVersion,
      ...(valuationPayload ?? {}),
    });
  }, [bundleHash, stewardVerifiedPulse, valuationHash, valuationSnapshot, verificationSource, verificationVersion, zkMeta?.zkPoseidonHash]);

  const effectiveReceiveSig = useMemo(() => receiveSig ?? null, [receiveSig]);
  const effectiveReceivePulse = useMemo(() => {
    if (embeddedProof?.receivePulse != null) return embeddedProof.receivePulse;
    if (sharedReceipt?.receivePulse != null) return sharedReceipt.receivePulse;
    return effectiveReceiveSig?.createdAtPulse ?? null;
  }, [
    embeddedProof?.receivePulse,
    sharedReceipt?.receivePulse,
    effectiveReceiveSig?.createdAtPulse,
  ]);

useEffect(() => {
  if (!effectiveNoteMeta) return;
  if (effectiveReceivePulse == null) return;

  const normalizedPulse = normalizeClaimPulse(effectiveReceivePulse);
  if (normalizedPulse == null) return;

  const transferLeafHash =
    effectiveNoteMeta.transferLeafHashSend ??
    readRecordString(noteSendPayloadRaw, "transferLeafHashSend") ??
    noteSendRecord?.transferLeafHashSend ??
    undefined;

  try {
    markNoteClaimed(effectiveNoteMeta.parentCanonical, effectiveNoteMeta.transferNonce, {
      childCanonical: effectiveNoteMeta.childCanonical,
      transferLeafHash,
      claimedPulse: normalizedPulse,
    });

    // ✅ force UI refresh on mobile
    setRegistryTick((prev) => prev + 1);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("note claim pulse hydrate failed", err);
  }
}, [effectiveNoteMeta, effectiveReceivePulse, noteSendPayloadRaw, noteSendRecord]);

  const effectiveReceiveBundleHash = useMemo(() => {
    if (embeddedProof?.receiveBundleHash) return embeddedProof.receiveBundleHash;
    if (sharedReceipt?.receiveBundleHash) return sharedReceipt.receiveBundleHash;
    if (effectiveReceiveSig?.binds.bundleHash) return effectiveReceiveSig.binds.bundleHash;
    return "";
  }, [
    embeddedProof?.receiveBundleHash,
    effectiveReceiveSig?.binds.bundleHash,
    sharedReceipt?.receiveBundleHash,
  ]);
  const effectiveReceiveMode = useMemo(() => {
    if (embeddedProof?.mode) return embeddedProof.mode;
    if (sharedReceipt?.mode) return sharedReceipt.mode;
    return effectiveReceiveSig ? "receive" : undefined;
  }, [embeddedProof?.mode, effectiveReceiveSig, sharedReceipt?.mode]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const statusLabel = result.status === "ok" ? "VERIFIED" : result.status === "error" ? "FAILED" : "STANDBY";
    const origin = window.location.origin;
    const slugValue = slug.raw || slugRaw || "";
    const ogUrl = new URL(`${origin}/verify/${encodeURIComponent(slugValue)}`);
    const ogImageUrl = new URL(`${origin}/api/og/verify`);
    ogImageUrl.searchParams.set("slug", slugValue);
    ogImageUrl.searchParams.set("status", statusLabel.toLowerCase());
    if (result.status === "ok") {
      ogImageUrl.searchParams.set("pulse", String(result.embedded.pulse ?? slug.pulse ?? ""));
      const ogPhiKey =
        embeddedProof?.ownerPhiKey ??
        sharedReceipt?.ownerPhiKey ??
        result.derivedPhiKey ??
        "";
      ogImageUrl.searchParams.set("phiKey", ogPhiKey);
      if (result.embedded.chakraDay) ogImageUrl.searchParams.set("chakraDay", result.embedded.chakraDay);
      const kasStatus = ownerAuthVerified;
      if (kasStatus != null) ogImageUrl.searchParams.set("kas", kasStatus ? "1" : "0");
      if (zkVerify != null) ogImageUrl.searchParams.set("g16", zkVerify ? "1" : "0");
    }

    document.title = `Proof of Breath™ — ${statusLabel}`;
    ensureMetaTag("property", "og:title", `Proof of Breath™ — ${statusLabel}`);
    ensureMetaTag("property", "og:description", `Proof of Breath™ • ${statusLabel} • Pulse ${slug.pulse ?? "—"}`);
    ensureMetaTag("property", "og:url", ogUrl.toString());
    ensureMetaTag("property", "og:image", ogImageUrl.toString());
    ensureMetaTag("name", "twitter:card", "summary_large_image");
    ensureMetaTag("name", "twitter:title", `Proof of Breath™ — ${statusLabel}`);
    ensureMetaTag("name", "twitter:description", `Proof of Breath™ • ${statusLabel} • Pulse ${slug.pulse ?? "—"}`);
    ensureMetaTag("name", "twitter:image", ogImageUrl.toString());
  }, [
    ownerAuthVerified,
    effectiveReceiveSig,
    embeddedProof?.ownerPhiKey,
    receiveSigVerified,
    result,
    sharedReceipt?.ownerPhiKey,
    slug.pulse,
    slug.raw,
    slugRaw,
    zkVerify,
  ]);
  React.useEffect(() => {
    if (!hasKASOwnerSig) {
      setOwnerAuthVerified(null);
      setOwnerAuthStatus("Not present");
      setOwnerAuthBusy(false);
    }
    if ((isReceiveGlyph || isChildGlyphValue) && effectiveOwnerSig && provenanceAuthorSig && effectiveOwnerSig === provenanceAuthorSig) {
      throw new Error("Invariant violation: provenance authorSig cannot be used as owner for receive/child glyphs.");
    }
  }, [effectiveOwnerSig, embeddedProof?.raw, hasKASOwnerSig, isChildGlyphValue, isReceiveGlyph, provenanceAuthorSig, result]);
  const effectiveOwnerPhiKey = useMemo(
    () =>
      embeddedProof?.ownerPhiKey ??
      sharedReceipt?.ownerPhiKey ??
      (effectiveReceiveSig ? undefined : result.status === "ok" ? result.derivedPhiKey : undefined),
    [
      embeddedProof?.ownerPhiKey,
      sharedReceipt?.ownerPhiKey,
      effectiveReceiveSig,
      result,
    ],
  );
  const effectiveOwnerKeyDerivation = useMemo(
    () =>
      embeddedProof?.ownerKeyDerivation ??
      sharedReceipt?.ownerKeyDerivation ??
      undefined,
    [embeddedProof?.ownerKeyDerivation, sharedReceipt?.ownerKeyDerivation],
  );

  const receiveBundleRoot = useMemo(() => {
    if (!proofCapsule || !capsuleHash || !svgHash) return null;
    const bundleSeed: ProofBundleLike = {
      hashAlg: embeddedProof?.hashAlg ?? PROOF_HASH_ALG,
      canon: embeddedProof?.canon ?? PROOF_CANON,
      bindings: embeddedProof?.bindings ?? PROOF_BINDINGS,
      zkStatement: embeddedProof?.zkStatement,
      bundleRoot: bundleRoot ?? embeddedProof?.bundleRoot,
      zkMeta: embeddedProof?.zkMeta,
      proofCapsule,
      capsuleHash,
      svgHash,
      zkPoseidonHash: zkMeta?.zkPoseidonHash ?? undefined,
      zkProof: zkMeta?.zkProof ?? undefined,
      zkPublicInputs: zkMeta?.zkPublicInputs ?? undefined,
    };
    return buildReceiveBundleRoot({
      bundleRoot: bundleRoot ?? embeddedProof?.bundleRoot ?? undefined,
      bundle: bundleSeed,
      originBundleHash: effectiveOriginBundleHash ?? bundleHash ?? undefined,
      originAuthorSig: provenanceAuthorSig ?? null,
      receivePulse: effectiveReceivePulse ?? undefined,
    });
  }, [
    bundleHash,
    bundleRoot,
    capsuleHash,
    embeddedProof?.bindings,
    embeddedProof?.bundleRoot,
    embeddedProof?.canon,
    embeddedProof?.hashAlg,
    embeddedProof?.zkMeta,
    embeddedProof?.zkStatement,
    provenanceAuthorSig,
    effectiveOriginBundleHash,
    effectiveReceivePulse,
    proofCapsule,
    svgHash,
    zkMeta?.zkPoseidonHash,
    zkMeta?.zkProof,
    zkMeta?.zkPublicInputs,
  ]);

  React.useEffect(() => {
    let active = true;
    if (!hasKASAuthSig) {
      setOwnerPhiKeyVerified(null);
      setOwnershipAttested("missing");
      return;
    }
    const receiveMode = effectiveReceiveMode === "receive";

    if (!receiveMode && !effectiveReceiveSig) {
      if (ownerAuthVerified === true) {
        setOwnerPhiKeyVerified(true);
        setOwnershipAttested(true);
        return;
      }
      if (ownerAuthVerified === false) {
        setOwnerPhiKeyVerified(false);
        setOwnershipAttested(false);
        return;
      }
      setOwnerPhiKeyVerified(null);
      setOwnershipAttested("missing");
      return;
    }

    if (!effectiveReceiveSig) {
      if (ownerAuthVerified === true) {
        setOwnerPhiKeyVerified(true);
        setOwnershipAttested(true);
        return;
      }
      if (ownerAuthVerified === false) {
        setOwnerPhiKeyVerified(false);
        setOwnershipAttested(false);
        return;
      }
      setOwnerPhiKeyVerified(null);
      setOwnershipAttested("missing");
      return;
    }

    const receiveBundleHashValue = effectiveReceiveBundleHash || effectiveReceiveSig.binds.bundleHash;
    if (!receiveBundleHashValue) {
      setOwnerPhiKeyVerified(false);
      setOwnershipAttested(false);
      return;
    }

    if (effectiveReceiveSig.binds.bundleHash !== receiveBundleHashValue) {
      setOwnerPhiKeyVerified(false);
      setOwnershipAttested(false);
      return;
    }

    if (effectiveReceivePulse == null) {
      setOwnerPhiKeyVerified(false);
      setOwnershipAttested(false);
      return;
    }

    if (
      typeof effectiveReceiveSig.createdAtPulse === "number" &&
      Number.isFinite(effectiveReceiveSig.createdAtPulse) &&
      effectiveReceiveSig.createdAtPulse !== effectiveReceivePulse
    ) {
      setOwnerPhiKeyVerified(false);
      setOwnershipAttested(false);
      return;
    }

    if (receiveSigVerified === null) {
      setOwnerPhiKeyVerified(null);
      setOwnershipAttested("missing");
      return;
    }

    if (receiveSigVerified === false) {
      setOwnerPhiKeyVerified(false);
      setOwnershipAttested(false);
      return;
    }

    if (!receiveBundleRoot) {
      setOwnerPhiKeyVerified(null);
      setOwnershipAttested("missing");
      return;
    }

    if (!effectiveOwnerPhiKey) {
      setOwnerPhiKeyVerified(null);
      setOwnershipAttested("missing");
      return;
    }

    (async () => {
      const expectedReceiveBundleHash = await hashReceiveBundleRoot(receiveBundleRoot);
      if (expectedReceiveBundleHash !== receiveBundleHashValue) {
        if (active) {
          setOwnerPhiKeyVerified(false);
          setOwnershipAttested(false);
        }
        return;
      }
      const expectedOwnerPhiKey = await deriveOwnerPhiKeyFromReceive({
        receiverPubKeyJwk: effectiveReceiveSig.pubKeyJwk,
        receivePulse: effectiveReceivePulse,
        receiveBundleHash: receiveBundleHashValue,
      });
      const ok = expectedOwnerPhiKey === effectiveOwnerPhiKey;
      if (active) {
        setOwnerPhiKeyVerified(ok);
        setOwnershipAttested(ok);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    effectiveOwnerPhiKey,
    effectiveReceiveBundleHash,
    effectiveReceiveMode,
    effectiveReceivePulse,
    effectiveReceiveSig,
    hasKASAuthSig,
    receiveBundleRoot,
    receiveSigVerified,
    ownerAuthVerified,
  ]);

  React.useEffect(() => {
    let active = true;
    if (!bundleHash) return;
    if (isReceiveGlyph) {
      setProvenanceSigVerified(null);
      return;
    }
    const originSig = provenanceAuthorSig;

    if (!originSig || !hasKASProvenanceSig) {
      setProvenanceSigVerified(null);
      return;
    }

    (async () => {
      if (!isKASAuthorSig(originSig)) {
        if (active) setProvenanceSigVerified(false);
        return;
      }
      const derivedHash = bundleHashFromAuthorSig(originSig);
      const originBundleHash =
        effectiveOriginBundleHash ?? (derivedHash && derivedHash === bundleHash ? derivedHash : null);
      const candidateHashes = originBundleHash ? [originBundleHash] : [];
      if (!candidateHashes.length) {
        if (active) setProvenanceSigVerified(false);
        return;
      }
      const ok = await verifyAuthorSigWithFallback(originSig, candidateHashes);
      if (active) setProvenanceSigVerified(ok);
    })();

    return () => {
      active = false;
    };
  }, [bundleHash, provenanceAuthorSig, effectiveOriginBundleHash, hasKASProvenanceSig, isReceiveGlyph]);

  const receiveCredId = useMemo(() => (effectiveReceiveSig ? effectiveReceiveSig.credId : ""), [effectiveReceiveSig]);
  const receiveNonce = useMemo(() => (effectiveReceiveSig?.nonce ? effectiveReceiveSig.nonce : ""), [effectiveReceiveSig?.nonce]);
  const receiveBundleHash = useMemo(() => effectiveReceiveBundleHash, [effectiveReceiveBundleHash]);

  const badge: { kind: BadgeKind; title: string; subtitle?: string } = useMemo(() => {
    if (busy) return { kind: "busy", title: "SEALING", subtitle: "Deterministic proof rails executing." };
    if (result.status === "ok") return { kind: "ok", title: "PROOF OF BREATH™", subtitle: "Human-origin seal affirmed." };
    if (result.status === "error") return { kind: "fail", title: "REJECTED", subtitle: "Inhale a sealed file, then verify." };
    return { kind: "idle", title: "STANDBY", subtitle: "Inhale a Sigil / Seal / Note to begin." };
  }, [busy, result.status]);

  const kpiPulse = useMemo(
    () => (result.status === "ok" ? String(result.embedded.pulse ?? (slug.pulse ?? 0)) : String(slug.pulse ?? 0)),
    [result, slug.pulse],
  );
  const effectivePhiKey = useMemo(() => {
    if (effectiveOwnerPhiKey) return effectiveOwnerPhiKey;
    return result.status === "ok" ? result.derivedPhiKey || "—" : "—";
  }, [effectiveOwnerPhiKey, result]);
  const kpiPhiKey = useMemo(() => effectivePhiKey, [effectivePhiKey]);

  const provenanceSig = hasKASProvenanceSig ? provenanceAuthorSig : null;
  const provenanceSigVerifiedValue = hasKASProvenanceSig ? provenanceSigVerified : null;

  const ownerAuthSignerPresent = hasKASAuthSig && Boolean(effectiveOwnerSig || effectiveReceiveSig);
  const ownerAuthVerifiedValue = useMemo(() => {
    if (!hasKASAuthSig) return null;
    if (effectiveOwnerSig) return ownerAuthVerified;
    if (effectiveReceiveSig) return receiveSigVerified;
    return null;
  }, [effectiveOwnerSig, effectiveReceiveSig, hasKASAuthSig, ownerAuthVerified, receiveSigVerified]);

  const sealKAS: SealState = useMemo(() => {
    if (!hasKASAuthSig) return "off";
    if (busy || ownerAuthBusy) return "busy";
    if (ownerAuthorSig) {
      if (ownerAuthVerified === null) return "na";
      return ownerAuthVerified ? "valid" : "invalid";
    }
    if (effectiveReceiveSig) {
      if (receiveSigVerified === null) return "na";
      return receiveSigVerified ? "valid" : "invalid";
    }
    return "off";
  }, [busy, hasKASAuthSig, ownerAuthBusy, ownerAuthVerified, ownerAuthorSig, effectiveReceiveSig, receiveSigVerified]);

  const sealZK: SealState = useMemo(() => {
    if (busy) return "busy";
    if (!zkMeta?.zkPoseidonHash) return "off";
    if (zkVerify === null) return "na";
    return zkVerify ? "valid" : "invalid";
  }, [busy, zkMeta?.zkPoseidonHash, zkVerify]);

  const proofVerifierUrl = useMemo(
    () => (proofCapsule ? buildVerifierUrl(proofCapsule.pulse, proofCapsule.kaiSignature, undefined, stewardVerifiedPulse ?? undefined) : ""),
    [proofCapsule, stewardVerifiedPulse],
  );

  const proofBindings = useMemo(() => embeddedProof?.bindings ?? PROOF_BINDINGS, [embeddedProof?.bindings]);
  const zkStatementValue = useMemo(() => {
    if (embeddedProof?.zkStatement) return embeddedProof.zkStatement;
    if (zkMeta?.zkPoseidonHash) {
      return {
        publicInputOf: ZK_STATEMENT_BINDING,
        domainTag: ZK_STATEMENT_DOMAIN,
        publicInputsContract: ZK_PUBLIC_INPUTS_CONTRACT,
        encoding: ZK_STATEMENT_ENCODING,
      };
    }
    return null;
  }, [embeddedProof?.zkStatement, zkMeta?.zkPoseidonHash]);
  const publicInputsContractLabel = useMemo(() => {
    if (!zkStatementValue?.publicInputsContract) return "—";
    return `${zkStatementValue.publicInputsContract.arity} • ${zkStatementValue.publicInputsContract.invariant}`;
  }, [zkStatementValue?.publicInputsContract]);

  const onSignVerification = useCallback(async () => {
    if (!proofCapsule || !receiptHash) return;
    if (verificationSigBusy) return;
    if (!isWebAuthnAvailable()) {
      setNotice("WebAuthn is not available in this browser. Please verify on a device with passkeys enabled.");
      return;
    }
    setVerificationSigBusy(true);
    try {
      const kasPhiKey = effectiveOwnerPhiKey ?? proofCapsule.phiKey;
      const kasSig = await signBundleHash(kasPhiKey, receiptHash);
      const nextSig = verificationSigFromKas(kasSig);
      const ok = await verifyVerificationSig(receiptHash, nextSig);
      setVerificationSig(nextSig);
      setVerificationSigVerified(ok);
      setNotice(ok ? "Verification receipt signed." : "Verification receipt signature failed.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification receipt signature failed.";
      setNotice(msg);
    } finally {
      setVerificationSigBusy(false);
    }
  }, [effectiveOwnerPhiKey, proofCapsule, receiptHash, verificationSigBusy]);

  const sealStateLabel = useCallback((state: SealState): string => {
    switch (state) {
      case "valid":
        return "VERIFIED";
      case "invalid":
        return "INVALID";
      case "busy":
        return "CHECKING";
      case "na":
        return "N/A";
      case "off":
      default:
        return "ABSENT";
    }
  }, []);

  const sealPopoverContent = useMemo(() => {
    if (!sealPopover) return null;
    if (sealPopover === "proof") {
      return {
        title: "Proof of Breath™",
        status: result.status === "ok" ? "VERIFIED" : result.status === "error" ? "FAILED" : "STANDBY",
body: [
  "Proof of Breath™ is the sovereign attestation that a ΦKey originates from a living human presence-seal and that its proof stream remains unbroken.",
  "This badge is issued only when the inhaled ΦKey, its vessel hash, sigil hash, and attestation bundle converge into a deterministic, recomputable proof capsule under canonical rules.",
  "No simulacra, no mutable links, no soft checks—only canonicalization, cryptographic determinism, and verifiable coherence.",
],


      };
    }
    if (sealPopover === "kas") {
      if (!hasKASAuthSig) return null;
      return {
        title: "KAS • Kai Author Signature",
        status: sealStateLabel(sealKAS),
body: [
  "KAS is the WebAuthn-authorized author seal binding a living human credential to the canonical bundle hash.",
  "Verification validates the signed challenge, credential ID, RPID/origin scope, and public key against the recomputed canonical bundle hash—proving the author’s custodial intent over this exact artifact.",
  "This is bank-grade identity attestation: phishing-resistant, tamper-evident, and replay-resistant by design—enforced through a fresh nonce/pulse challenge under strict verification policy.",
],


      };
    }
    return {
      title: "G16 • Groth16 Verification",
      status: sealStateLabel(sealZK),
      body: [
         "G16 is the zero-knowledge proof path for the ΦKey proof bundle, executed under Groth16 and Poseidon constraints.",
  "Verification proves the embedded proof and public inputs satisfy the circuit, without revealing private witness material.",
  "This seal represents cryptographic finality—provable integrity with privacy preserved."
      ],
    };
  }, [hasKASAuthSig, result.status, sealKAS, sealPopover, sealStateLabel, sealZK]);

  const noteMeta = useMemo(() => {
    if (result.status !== "ok") return null;
    const raw = result.embedded.raw;
    return isRecord(raw) ? (raw as SigilMetadata) : null;
  }, [result]);
  const noteOriginCanonical = useMemo(() => normalizeCanonicalHash(noteMeta?.canonicalHash), [noteMeta?.canonicalHash]);

  const notePulseNow = useMemo(() => currentPulse ?? getKaiPulseEternalInt(new Date()), [currentPulse]);
const noteInitial = useMemo<NoteBanknoteInputs>(() => {
  const rawSvg = svgText.trim() ? svgText.trim() : null;

  const base = buildNotePayload({
    meta: noteMeta,
    sigilSvgRaw: rawSvg,
    verifyUrl: currentVerifyUrl,
    pulseNow: notePulseNow,
  });

  // ✅ Extract proof bundle straight from the SVG text (first-render safe)
  const extracted = rawSvg ? extractProofBundleMetaFromSvg(rawSvg) : null;

  const rawBundle = extracted?.raw ?? embeddedProof?.raw;
  const rawRecord = isRecord(rawBundle) ? rawBundle : null;

  const proofBundleJson = rawRecord ? JSON.stringify(rawRecord) : "";

  const bundleHashValue =
    extracted?.bundleHash ??
    embeddedProof?.bundleHash ??
    sharedReceipt?.bundleHash ??
    (rawRecord && typeof rawRecord.bundleHash === "string" ? (rawRecord.bundleHash as string) : "");

  const receiptHashValue =
    (extracted as { receiptHash?: string } | null)?.receiptHash ??
    embeddedProof?.receiptHash ??
    sharedReceipt?.receiptHash ??
    (rawRecord && typeof rawRecord.receiptHash === "string" ? (rawRecord.receiptHash as string) : "");

  const verifiedAtPulseValue =
    typeof extracted?.verifiedAtPulse === "number"
      ? extracted.verifiedAtPulse
      : typeof embeddedProof?.verifiedAtPulse === "number"
        ? embeddedProof.verifiedAtPulse
        : typeof sharedReceipt?.verifiedAtPulse === "number"
          ? sharedReceipt.verifiedAtPulse
          : rawRecord && typeof rawRecord.verifiedAtPulse === "number"
            ? (rawRecord.verifiedAtPulse as number)
            : undefined;

  const capsuleHashValue =
    extracted?.capsuleHash ??
    embeddedProof?.capsuleHash ??
    sharedReceipt?.capsuleHash ??
    (rawRecord && typeof rawRecord.capsuleHash === "string" ? (rawRecord.capsuleHash as string) : "");

  const svgHashValue =
    extracted?.svgHash ??
    embeddedProof?.svgHash ??
    sharedReceipt?.svgHash ??
    (rawRecord && typeof rawRecord.svgHash === "string" ? (rawRecord.svgHash as string) : "");

  return {
    ...base,
    proofBundleJson,
    bundleHash: bundleHashValue,
    receiptHash: receiptHashValue,
    verifiedAtPulse: verifiedAtPulseValue,
    capsuleHash: capsuleHashValue,
    svgHash: svgHashValue,
  };
}, [currentVerifyUrl, embeddedProof, noteMeta, notePulseNow, sharedReceipt, svgText]);

  const canShowNotePreview = result.status === "ok" && Boolean(svgText.trim());
  const notePreviewSvg = useMemo(() => {
    if (!canShowNotePreview) return "";
    const valuePhi = displayPhi != null ? displayPhi.toFixed(4) : noteInitial.valuePhi ?? "";
    const valueUsd = displayUsd != null ? fmtUsd(displayUsd) : "";
    return buildBanknoteSVG({
      ...noteInitial,
      valuePhi,
      valueUsd,
      sigilSvg: svgText.trim(),
      verifyUrl: currentVerifyUrl,
    });
  }, [canShowNotePreview, currentVerifyUrl, displayPhi, displayUsd, noteInitial, svgText]);

  const handleNoteSend = useCallback(
    async (payload: NoteSendPayload): Promise<NoteSendResult | void> => {
      const parentCanonical = await resolveNoteParentCanonical(noteMeta, payload);
      const transferNonce = payload.transferNonce?.trim() ?? "";
      if (!parentCanonical || !transferNonce) return payload;
      setNoteSendMeta({
        parentCanonical,
        transferNonce,
        amountPhi: payload.amountPhi,
        amountUsd: payload.amountUsd,
        childCanonical: payload.childCanonical,
        transferLeafHashSend: payload.transferLeafHashSend,
      });
      setNoteSendPayloadRaw(payload as Record<string, unknown>);
      return parentCanonical === payload.parentCanonical ? payload : { ...payload, parentCanonical };
    },
    [noteMeta],
  );

  const openNote = useCallback(() => {
    if (!noteDlgRef.current) return;
    safeShowDialog(noteDlgRef.current);
    setNoteOpen(true);
  }, []);

  const closeNote = useCallback(() => {
    if (!noteDlgRef.current) return;
    noteDlgRef.current.close();
    noteDlgRef.current.setAttribute("data-open", "false");
    setNoteOpen(false);
  }, []);

  const hasSvgBytes = Boolean(svgText.trim());
  const expectedSvgHash = sharedReceipt?.svgHash ?? embeddedProof?.svgHash ?? "";
  const identityStatusLabel = hasKASOwnerSig ? ownerAuthStatus || "Not present" : "";
  const artifactStatusLabel =
    artifactAttested === true
      ? "Present (Verified)"
      : artifactAttested === false
        ? "Failed"
        : !hasSvgBytes
          ? "Not present"
          : expectedSvgHash
            ? "Not present"
            : "No reference hash";

  const svgPreview = useMemo(() => {
    const raw = svgText.trim();
    if (!raw) return "";
    const lines = raw.split("\n");
    return lines.slice(0, Math.min(lines.length, 8)).join("\n");
  }, [svgText]);

  const verifierPulse = result.status === "ok" ? (result.embedded.pulse ?? (slug.pulse ?? 0)) : slug.pulse ?? 0;
  const verifierSig = result.status === "ok" ? (result.embedded.kaiSignature ?? (slug.shortSig ?? "unknown")) : slug.shortSig ?? "unknown";
  const verifierPhi = effectivePhiKey;
  const verifierChakra = result.status === "ok" ? result.embedded.chakraDay : undefined;

  const shareStatus = result.status === "ok" ? "VERIFIED" : result.status === "error" ? "FAILED" : "STANDBY";
  const sharePhiShort = verifierPhi && verifierPhi !== "—" ? ellipsizeMiddle(verifierPhi, 12, 10) : "—";
  const shareKas = hasKASAuthSig ? (sealKAS === "valid" ? "✅" : "❌") : null;
  const shareG16 = sealZK === "valid" ? "✅" : "❌";
  const verificationSigLabel =
    verificationSigVerified === true ? "Verification signed" : verificationSigVerified === false ? "Verification signature invalid" : "Sign Verification";
  const canSignVerification = Boolean(receiptHash && proofCapsule);

  const stewardPulseLabel =
    stewardVerifiedPulse == null ? "Verified pulse unavailable (legacy bundle)" : `Steward Verified @ Pulse ${stewardVerifiedPulse}`;

  React.useEffect(() => {
    let active = true;
    if (!hasKASReceiveSig) {
      setReceiveSigVerified(null);
      return;
    }
    if (!effectiveReceiveSig) {
      setReceiveSigVerified(null);
      return;
    }

    (async () => {
      const receiveBundleHashValue = effectiveReceiveBundleHash || effectiveReceiveSig.binds.bundleHash;
      if (!receiveBundleHashValue) {
        if (active) setReceiveSigVerified(false);
        return;
      }
      const nonce = effectiveReceiveSig.nonce ?? "";
      const { challengeBytes } = await buildKasChallenge("receive", receiveBundleHashValue, nonce);
      const ok = await verifyWebAuthnAssertion({
        assertion: effectiveReceiveSig.assertion,
        expectedChallenge: challengeBytes,
        pubKeyJwk: effectiveReceiveSig.pubKeyJwk,
        expectedCredId: effectiveReceiveSig.credId,
      });
      if (active) setReceiveSigVerified(ok);
    })();

    return () => {
      active = false;
    };
  }, [effectiveReceiveBundleHash, effectiveReceiveSig, hasKASReceiveSig]);


  React.useEffect(() => {
    let active = true;
    if (!verificationReceipt) {
      setReceiptHash("");
      return;
    }
    (async () => {
      const hash = await hashVerificationReceipt(verificationReceipt);
      if (active) setReceiptHash(hash);
    })();
    return () => {
      active = false;
    };
  }, [verificationReceipt]);

React.useEffect(() => {
  let active = true;

  const poseidon =
    typeof zkMeta?.zkPoseidonHash === "string" && zkMeta.zkPoseidonHash.trim().length > 0
      ? zkMeta.zkPoseidonHash
      : undefined;

  if (!bundleHash || !poseidon) {
    setCacheKey("");
    return;
  }

  (async () => {
    const key = await buildVerificationCacheKey({
      bundleHash,
      zkPoseidonHash: poseidon,
      verificationVersion: cacheVerificationVersion,
    });
    if (active) setCacheKey(key);
  })();

  return () => {
    active = false;
  };
}, [bundleHash, cacheVerificationVersion, zkMeta?.zkPoseidonHash]);

  const auditBundlePayload = useMemo<AuditBundlePayload | null>(() => {
    if (!proofCapsule) return null;
    const transport = {
      shareUrl: embeddedProof?.transport?.shareUrl ?? embeddedProof?.shareUrl,
      verifierUrl: embeddedProof?.transport?.verifierUrl ?? proofVerifierUrl,
      verifier: embeddedProof?.transport?.verifier ?? embeddedProof?.verifier ?? verificationSource,
      verifiedAtPulse: embeddedProof?.transport?.verifiedAtPulse ?? stewardVerifiedPulse ?? undefined,
      proofHints: embeddedProof?.transport?.proofHints ?? embeddedProof?.proofHints ?? zkMeta?.proofHints ?? undefined,
    };
    const zkVerified = zkMeta?.zkPoseidonHash && typeof zkVerify === "boolean" ? zkVerify : undefined;
    const receiptValue = verificationReceipt ?? embeddedProof?.receipt ?? sharedReceipt?.receipt;
    const receiptHashValue = receiptHash || embeddedProof?.receiptHash || sharedReceipt?.receiptHash;
    const verificationSigValue = verificationSig ?? embeddedProof?.verificationSig ?? sharedReceipt?.verificationSig;
    const cacheKeyValue =
      verificationCacheEntry?.cacheKey ?? (cacheKey || embeddedProof?.cacheKey || sharedReceipt?.cacheKey);
    const verificationCacheValue = verificationCacheEntry
      ? {
          ...verificationCacheEntry,
          ...(zkVerifiedCached ? { zkVerifiedCached: true } : {}),
        }
      : embeddedProof?.verificationCache ?? sharedReceipt?.verificationCache;
    const authorSigForExport = embeddedProof?.authorSig ?? null;
    const normalized = normalizeBundle({
      hashAlg: PROOF_HASH_ALG,
      canon: PROOF_CANON,
      bindings: embeddedProof?.bindings ?? PROOF_BINDINGS,
      zkStatement:
        embeddedProof?.zkStatement ??
        (zkMeta?.zkPoseidonHash
          ? {
              publicInputOf: ZK_STATEMENT_BINDING,
              domainTag: ZK_STATEMENT_DOMAIN,
              publicInputsContract: ZK_PUBLIC_INPUTS_CONTRACT,
              encoding: ZK_STATEMENT_ENCODING,
            }
          : undefined),
      bundleRoot: bundleRoot ?? embeddedProof?.bundleRoot,
      proofCapsule,
      capsuleHash,
      svgHash,
      bundleHash,
      mode: effectiveReceiveMode,
      originBundleHash: effectiveOriginBundleHash,
      receiveBundleHash: effectiveReceiveBundleHash,
      originAuthorSig: provenanceAuthorSig ?? null,
      receiveSig: effectiveReceiveSig ?? null,
      receivePulse: effectiveReceivePulse ?? undefined,
      ownerPhiKey: effectiveOwnerPhiKey ?? undefined,
      ownerKeyDerivation: effectiveOwnerKeyDerivation,
      authorSig: authorSigForExport,
      zkPoseidonHash: zkMeta?.zkPoseidonHash ?? undefined,
      zkProof: zkMeta?.zkProof ?? undefined,
      zkPublicInputs: zkMeta?.zkPublicInputs ?? undefined,
      zkMeta: embeddedProof?.zkMeta,
      verificationCache: verificationCacheValue,
      cacheKey: cacheKeyValue,
      receipt: receiptValue ?? undefined,
      receiptHash: receiptHashValue || undefined,
      verificationSig: verificationSigValue ?? undefined,
      transport,
    });

    const verifiedAtPulseValue =
      typeof transport.verifiedAtPulse === "number" && Number.isFinite(transport.verifiedAtPulse)
        ? transport.verifiedAtPulse
        : stewardVerifiedPulse ?? undefined;
    const withPulse =
      typeof verifiedAtPulseValue === "number" ? { ...normalized, verifiedAtPulse: verifiedAtPulseValue } : normalized;
    return typeof zkVerified === "boolean" ? { ...withPulse, zkVerified } : withPulse;
  }, [
    proofCapsule,
    capsuleHash,
    svgHash,
    bundleHash,
    embeddedProof,
    provenanceAuthorSig,
    effectiveOriginBundleHash,
    effectiveOwnerKeyDerivation,
    effectiveOwnerPhiKey,
    effectiveReceiveBundleHash,
    effectiveReceiveMode,
    effectiveReceivePulse,
    effectiveReceiveSig,
    proofVerifierUrl,
    stewardVerifiedPulse,
    verificationSource,
    zkMeta,
    zkVerify,
    bundleRoot,
    cacheKey,
    receiptHash,
    sharedReceipt?.cacheKey,
    sharedReceipt?.receipt,
    sharedReceipt?.receiptHash,
    sharedReceipt?.verificationSig,
    verificationCacheEntry,
    verificationReceipt,
    verificationSig,
    zkVerifiedCached,
  ]);

  const auditBundleText = useMemo(() => {
    if (!auditBundlePayload) return "";
    return JSON.stringify(auditBundlePayload, null, 2);
  }, [auditBundlePayload]);

  const proofBundleJson = useMemo(() => {
    if (!auditBundlePayload) return "";
    return JSON.stringify(auditBundlePayload);
  }, [auditBundlePayload]);

  const verifiedCardData = useMemo<VerifiedCardData | null>(() => {
    if (result.status !== "ok" || !proofCapsule || !capsuleHash || stewardVerifiedPulse == null) return null;
    const receiptValue = verificationReceipt ?? embeddedProof?.receipt ?? sharedReceipt?.receipt;
    const receiptHashValue = receiptHash || embeddedProof?.receiptHash || sharedReceipt?.receiptHash;
    const verificationSigValue = verificationSig ?? embeddedProof?.verificationSig ?? sharedReceipt?.verificationSig;
    const valuationValue = valuationSnapshot && valuationHash ? { ...valuationSnapshot, valuationHash } : undefined;
    const ownerPhiKeyValue = effectiveOwnerPhiKey ?? effectivePhiKey;
    const verifierUrlValue = proofVerifierUrl || currentVerifyUrl;
    return {
      capsuleHash,
      svgHash: svgHash || undefined,
      pulse: proofCapsule.pulse,
      verifiedAtPulse: stewardVerifiedPulse,
      phikey: ownerPhiKeyValue && ownerPhiKeyValue !== "—" ? ownerPhiKeyValue : proofCapsule.phiKey,
      kasOk: hasKASAuthSig ? sealKAS === "valid" : undefined,
      g16Ok: sealZK === "valid",
      verifierSlug: proofCapsule.verifierSlug,
      verifierUrl: verifierUrlValue || undefined,
      verifier: verificationSource,
      verificationVersion,
      bundleHash: bundleHash || undefined,
      zkPoseidonHash: zkMeta?.zkPoseidonHash ?? undefined,
      receipt: receiptValue ?? undefined,
      receiptHash: receiptHashValue || undefined,
      verificationSig: verificationSigValue ?? undefined,
      sigilSvg: svgText.trim() ? svgText : undefined,
      valuation: valuationValue,
      proofBundleJson: proofBundleJson || undefined,
    };
  }, [
    bundleHash,
    capsuleHash,
    currentVerifyUrl,
    embeddedProof?.receipt,
    embeddedProof?.receiptHash,
    embeddedProof?.verificationSig,
    effectiveOwnerPhiKey,
    proofCapsule,
    proofBundleJson,
    proofVerifierUrl,
    receiptHash,
    result.status,
    effectivePhiKey,
    hasKASAuthSig,
    sealKAS,
    sealZK,
    sharedReceipt?.receipt,
    sharedReceipt?.receiptHash,
    sharedReceipt?.verificationSig,
    stewardVerifiedPulse,
    svgHash,
    svgText,
    valuationHash,
    valuationSnapshot,
    verificationReceipt,
    verificationSig,
    verificationSource,
    verificationVersion,
    zkMeta?.zkPoseidonHash,
  ]);

  const onDownloadNotePng = useCallback(async () => {
    if (noteDownloadInFlightRef.current) return;
    noteDownloadInFlightRef.current = true;
    noteDownloadBypassRef.current = true;
    if (!noteSvgFromPng || (noteClaimedFinal && !noteDownloadBypassRef.current)) {
      noteDownloadBypassRef.current = false;
      noteDownloadInFlightRef.current = false;
      return;
    }

    const parentMeta =
      noteSendMeta ?? (noteSendPayloadRaw ? buildNoteSendMetaFromObjectLoose(noteSendPayloadRaw) : null);
    const parentPayloadRaw = noteSendPayloadRaw ?? null;
    try {
      const payloadBase = noteSendPayloadRaw
        ? { ...noteSendPayloadRaw }
        : noteSendMeta
          ? {
              parentCanonical: noteSendMeta.parentCanonical,
              amountPhi: noteSendMeta.amountPhi,
              amountUsd: noteSendMeta.amountUsd,
              childCanonical: noteSendMeta.childCanonical,
            }
          : null;

      const nextNonce = genNonce();

      const noteSendPayload = payloadBase
        ? {
            ...payloadBase,
            parentCanonical: payloadBase.parentCanonical || noteSendMeta?.parentCanonical,
            amountPhi: noteSendMeta?.amountPhi ?? payloadBase.amountPhi,
            amountUsd: noteSendMeta?.amountUsd ?? payloadBase.amountUsd,
            transferNonce: nextNonce,
          }
        : null;

      if (noteSendPayload && "childCanonical" in noteSendPayload) {
        delete (noteSendPayload as { childCanonical?: unknown }).childCanonical;
      }

      const nonce = nextNonce ? `-${nextNonce.slice(0, 8)}` : "";
      const filename = `☤KAI-NOTE${nonce}.png`;

      const png = await svgStringToPngBlob(noteSvgFromPng, 2400);

      const noteSendJson = noteSendPayload ? JSON.stringify(noteSendPayload) : "";
      const entries = [
        noteProofBundleJson ? { keyword: "phi_proof_bundle", text: noteProofBundleJson } : null,
        sharedReceipt?.bundleHash ? { keyword: "phi_bundle_hash", text: sharedReceipt.bundleHash } : null,
        sharedReceipt?.receiptHash ? { keyword: "phi_receipt_hash", text: sharedReceipt.receiptHash } : null,
        noteSendJson ? { keyword: "phi_note_send", text: noteSendJson } : null,
        { keyword: "phi_note_svg", text: noteSvgFromPng },
      ].filter((entry): entry is { keyword: string; text: string } => Boolean(entry));

      if (entries.length === 0) {
        triggerDownload(filename, png, "image/png");
      } else {
        const bytes = new Uint8Array(await png.arrayBuffer());
        const enriched = insertPngTextChunks(bytes, entries);
        const finalBlob = new Blob([enriched as BlobPart], { type: "image/png" });
        triggerDownload(filename, finalBlob, "image/png");
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Note download failed.";
      setNotice(msg);
    } finally {
      noteDownloadBypassRef.current = false;
      noteDownloadInFlightRef.current = false;
      // ✅ ALWAYS flip claim + force UI refresh (mobile-safe)
      if (parentMeta) {
        confirmNoteSend({ meta: parentMeta, payloadRaw: parentPayloadRaw });
      } else {
        confirmNoteSend();
      }
    }
  }, [
    confirmNoteSend,
    noteClaimedFinal,
    noteProofBundleJson,
    noteSendMeta,
    noteSendPayloadRaw,
    noteSvgFromPng,
    sharedReceipt,
  ]);

  const onDownloadVerifiedCard = useCallback(async () => {
    if (!verifiedCardData) return;
    await downloadVerifiedCardPng(verifiedCardData);
  }, [verifiedCardData]);

  const receiptPayload = useMemo(() => {
    if (!proofCapsule) return null;
    const receipt = {
      hashAlg: PROOF_HASH_ALG,
      canon: PROOF_CANON,
      proofCapsule,
      capsuleHash,
      verifierUrl: proofVerifierUrl || currentVerifyUrl,
    } as const;

    const extended: Record<string, unknown> = { ...receipt };
    const receiptValue = verificationReceipt ?? embeddedProof?.receipt ?? sharedReceipt?.receipt;
    const receiptHashValue = receiptHash || embeddedProof?.receiptHash || sharedReceipt?.receiptHash;
    const verificationSigValue = verificationSig ?? embeddedProof?.verificationSig ?? sharedReceipt?.verificationSig;
    const cacheKeyValue =
      verificationCacheEntry?.cacheKey ?? (cacheKey || embeddedProof?.cacheKey || sharedReceipt?.cacheKey);
    const verificationCacheValue = verificationCacheEntry
      ? {
          ...verificationCacheEntry,
          ...(zkVerifiedCached ? { zkVerifiedCached: true } : {}),
        }
      : embeddedProof?.verificationCache ?? sharedReceipt?.verificationCache;
    extended.verifier = verificationSource;
    extended.verificationVersion = verificationVersion;
    if (typeof stewardVerifiedPulse === "number" && Number.isFinite(stewardVerifiedPulse)) {
      extended.verifiedAtPulse = stewardVerifiedPulse;
    }
    if (svgHash) extended.svgHash = svgHash;
    if (bundleHash) extended.bundleHash = bundleHash;
    if (effectiveReceiveMode) extended.mode = effectiveReceiveMode;
    if (effectiveOriginBundleHash) extended.originBundleHash = effectiveOriginBundleHash;
    if (effectiveReceiveBundleHash) extended.receiveBundleHash = effectiveReceiveBundleHash;
    const shareUrlValue = embeddedProof?.transport?.shareUrl ?? embeddedProof?.shareUrl;
    if (shareUrlValue) extended.shareUrl = shareUrlValue;
    if (provenanceAuthorSig) extended.originAuthorSig = provenanceAuthorSig;
    if (effectiveReceiveSig) extended.receiveSig = effectiveReceiveSig;
    if (effectiveReceivePulse != null) extended.receivePulse = effectiveReceivePulse;
    if (effectiveOwnerPhiKey) extended.ownerPhiKey = effectiveOwnerPhiKey;
    if (effectiveOwnerKeyDerivation) extended.ownerKeyDerivation = effectiveOwnerKeyDerivation;
    if (embeddedProof?.authorSig) {
      extended.authorSig = embeddedProof.authorSig;
    }
    if (embeddedProof?.zkProof) extended.zkProof = embeddedProof.zkProof;
    const proofHintsValue = embeddedProof?.transport?.proofHints ?? embeddedProof?.proofHints;
    if (proofHintsValue) extended.proofHints = proofHintsValue;
    if (embeddedProof?.zkPublicInputs) extended.zkPublicInputs = embeddedProof.zkPublicInputs;
    if (zkMeta?.zkPoseidonHash) {
      extended.zkPoseidonHash = zkMeta.zkPoseidonHash;
      extended.zkScheme = "groth16-poseidon";
      if (typeof zkVerify === "boolean") {
        extended.zkVerified = zkVerify;
      }
    }
    if (verificationCacheValue) {
      extended.verificationCache = verificationCacheValue;
    }
    if (cacheKeyValue) extended.cacheKey = cacheKeyValue;
    if (receiptValue) extended.receipt = receiptValue;
    if (receiptHashValue) extended.receiptHash = receiptHashValue;
    if (verificationSigValue) extended.verificationSig = verificationSigValue;

    return extended;
  }, [
    bundleHash,
    capsuleHash,
    currentVerifyUrl,
    embeddedProof?.shareUrl,
    embeddedProof?.transport?.shareUrl,
    embeddedProof?.proofHints,
    embeddedProof?.transport?.proofHints,
    embeddedProof?.authorSig,
    embeddedProof?.zkProof,
    embeddedProof?.zkPublicInputs,
    provenanceAuthorSig,
    effectiveOriginBundleHash,
    effectiveOwnerKeyDerivation,
    effectiveOwnerPhiKey,
    effectiveReceiveBundleHash,
    effectiveReceiveMode,
    effectiveReceivePulse,
    effectiveReceiveSig,
    proofCapsule,
    proofVerifierUrl,
    stewardVerifiedPulse,
    verificationSource,
    verificationVersion,
    svgHash,
    zkMeta?.zkPoseidonHash,
    zkVerify,
    cacheKey,
    receiptHash,
    sharedReceipt?.cacheKey,
    sharedReceipt?.receipt,
    sharedReceipt?.receiptHash,
    sharedReceipt?.verificationSig,
    verificationCacheEntry,
    verificationReceipt,
    verificationSig,
    zkVerifiedCached,
  ]);

  const receiptJson = useMemo(() => {
    if (!receiptPayload) return "";
    return jcsCanonicalize(receiptPayload as Parameters<typeof jcsCanonicalize>[0]);
  }, [receiptPayload]);

  const shareReceiptUrl = useMemo(() => {
    if (!receiptPayload) return "";
    const base = proofVerifierUrl || currentVerifyUrl;
    if (!base) return "";
    return buildReceiptShareUrl(base, receiptPayload);
  }, [currentVerifyUrl, proofVerifierUrl, receiptPayload]);

  const onShareReceipt = useCallback(async () => {
    const url = shareReceiptUrl || proofVerifierUrl || currentVerifyUrl;
    const title = `Proof of Breath™ — ${shareStatus}`;
    const kasSegment = shareKas ? ` • KAS ${shareKas}` : "";
    const text = `${shareStatus} • Pulse ${verifierPulse} • ΦKey ${sharePhiShort}${kasSegment} • G16 ${shareG16}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    const ok = await copyTextToClipboard(url);
    setNotice(ok ? "Link Remembered." : "Remember failed. Use manual remember.");
  }, [currentVerifyUrl, proofVerifierUrl, shareG16, shareKas, sharePhiShort, shareReceiptUrl, shareStatus, verifierPulse]);

  const onCopyReceipt = useCallback(async () => {
    if (!receiptJson) return;
    const ok = await copyTextToClipboard(receiptJson);
    setNotice(ok ? "Proof JSON remembered." : "Remember failed. Use manual remember.");
  }, [receiptJson]);

  const activePanelTitle =
    panel === "inhale" ? "Inhale" : panel === "capsule" ? "Vessel" : panel === "proof" ? "Proof" : panel === "zk" ? "ZK" : "Audit";
  const detectedStatus = svgText.trim()
    ? "Detected input: Sigil-Glyph (SVG) — Full attestation"
    : isNoteUpload
      ? "Detected input: Kai-Note (PNG) — Value note"
      : sharedReceipt
        ? "Detected input: Sigil-Seal (PNG) — Proof seal"
        : "";

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      handleFiles(e.dataTransfer?.files);
    },
    [handleFiles],
  );

  return (
    <div className="vapp" role="application" aria-label="☤Kai Sigil-Glyph Attestation">
      {/* Floating toast (always visible; auto-dismiss) */}
      {notice ? (
        <button type="button" className="vtoast vtoast-floating" onClick={() => setNotice("")} aria-label="Dismiss notice" title="Dismiss">
          {notice}
        </button>
      ) : null}

      {/* Header */}
      <header className="vhead">
        <div className="vhead-left">
          <div className="vbrand">
            <div className="vtitle">☤Kai Sigil-Glyph Attestation</div>
            <div className="vsub">Sovereign proof of human origin — ☤Kai-Signature → Φ-Key.</div>
          </div>

          <div className="vlink">
            <span className="vlink-k">Path</span>
            <code className="vlink-v mono">/verify/{slug.raw || "—"}</code>
          </div>
        </div>

        <div className="vhead-right">
          <div className="vhead-top" aria-label="Primary verification">
            {sigilPreviewUrl ? (
              <div className="vsigil-thumb" aria-label="Uploaded sigil preview" title="Uploaded sigil preview">
                <img className="vsigil-img" src={sigilPreviewUrl} alt="Uploaded sigil" />
              </div>
            ) : null}

            <OfficialBadge
              kind={badge.kind}
              title={badge.title}
              subtitle={badge.subtitle}
              onClick={openProofPopover}
              ariaLabel="Open Proof of Breath attestation details"
            />
          </div>

          <div className="vseals" aria-label="Sovereign seals">
            {hasKASAuthSig ? (
              <SealPill
                label="KAS"
                state={sealKAS}
                detail={
                  effectiveOwnerSig
                    ? "Owner/auth signer (WebAuthn KAS)"
                    : effectiveReceiveSig
                      ? "Owner receive signer (WebAuthn KAS)"
                      : "Owner/auth signer missing"
                }
                onClick={openKasPopover}
                ariaLabel="Open KAS attestation details"
              />
            ) : null}
            <SealPill
              label="G16"
              state={sealZK}
              detail={zkMeta?.zkPoseidonHash ? "Groth16 + Poseidon rail" : "No ZK rail present"}
              onClick={openG16Popover}
              ariaLabel="Open Groth16 attestation details"
            />
            {result.status === "ok" && displayPhi != null ? (
              <LiveValuePill
                phiValue={displayPhi}
                usdValue={displayUsd}
                label={displayLabel}
                ariaLabel={displayAriaLabel}
                onPhiClick={() => openChartPopover("phi")}
                onUsdClick={displayUsd == null ? undefined : () => openChartPopover("usd")}
              />
            ) : null}
          </div>

          <div className="vkpis" aria-label="Primary identifiers">
            <MiniField label="Pulse" value={kpiPulse} />
            <div className="vkpi-stack">
              <MiniField
                label="Φ-Key"
                value={kpiPhiKey === "—" ? "—" : ellipsizeMiddle(kpiPhiKey, 12, 10)}
                title={kpiPhiKey}
              />
              <div className="vkpi-whisper" aria-label="Φ-Key helper">
                Derived sovereign identifier
              </div>
            </div>
          </div>

          {proofCapsule ? (
            <div className="vreceipt-block" aria-label="Proof actions">
              <div className="vreceipt-row">
                <div className="vreceipt-label">Proof</div>
                <div className="vreceipt-actions">
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => void onShareReceipt()}>
                     ➦
                  </button>
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => void onCopyReceipt()}>
                    💠
                  </button>
                  {isExhaleNoteUpload ? null : (
                    <button
                      type="button"
                      className="vbtn vbtn--ghost"
                      onClick={() => void onSignVerification()}
                      title={verificationSigLabel}
                      aria-label={verificationSigLabel}
                      disabled={!canSignVerification || verificationSigBusy}
                    >
                      <span className="vbtn-ic" aria-hidden="true">
                        <SignProofIcon />
                      </span>
                    </button>
                  )}
                  {isExhaleNoteUpload ? null : (
                    <button
                      type="button"
                      className="vbtn vbtn--ghost"
                      onClick={() => void onDownloadVerifiedCard()}
                      title="Download proof PNG"
                      aria-label="Download proof PNG"
                    >
                      <span className="vbtn-ic" aria-hidden="true">
                        <DownloadPngIcon />
                      </span>
                    </button>
                  )}
                </div>
              </div>
              {canShowNotePreview || noteClaimStatus || (noteSvgFromPng && result.status === "ok" && !noteClaimed) ? (
                <div className="vreceipt-note" aria-label="Exhale note actions">
                  <div className="vreceipt-note-left">
                    <div className="vreceipt-label">☤Kai-Note (Legal Tender)</div>
                    {noteClaimStatus ? (
                      <div className="vnote-claim-wrap">
                        <div
                          className={`vnote-claim ${noteClaimed ? "vnote-claim--claimed" : "vnote-claim--unclaimed"}`}
                          title={
                            noteClaimed
                              ? `Rotation-Seal owned: ${noteClaimNonce || "—"}\nClaimed pulse: ${noteClaimPulseLabel}\nLeaf hash: ${noteClaimTransferHash || "—"}`
                              : "Rotation-Seal available: this note has not been claimed yet."
                          }
                        >
                          {noteClaimStatus}
                        </div>
                        {noteClaimed && noteClaimNonce ? (
                          <div className="vnote-claim-meta" aria-label="Note claim metadata">
                            <span className="mono">rotation-seal {noteClaimNonceShort}</span>
                            <span>claimed pulse {noteClaimPulseLabel}</span>
                            {noteClaimTransferHash ? <span className="mono">hash {noteClaimHashShort}</span> : null}
                            {noteClaimLeaderNonce && noteClaimLeaderNonce !== noteClaimNonce ? (
                              <span className="mono">leader {noteClaimLeaderShort}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="vreceipt-note-actions">
                    {canShowNotePreview ? (
                      <button
                        type="button"
                        className="vbtn vbtn--ghost vbtn--note"
                        onPointerDown={openNote}
                        onClick={openNote}
                        aria-label="Open note Exhaler"
                        title="Open note Exhaler"
                      >
                        <span className="vbtn-note-preview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: notePreviewSvg }} />
                      </button>
                    ) : null}
                    {noteSvgFromPng && result.status === "ok" && !noteClaimedFinal ? (
                      <button
                        type="button"
                        className="vbtn vbtn--ghost vbtn--note-download"
                        onClick={onDownloadNotePng}
                        title="Download fresh note PNG"
                        aria-label="Download fresh note PNG"
                      >
                        <span className="vbtn-ic vbtn-ic--note-download" aria-hidden="true">
                          <NoteDownloadIcon />
                          <img className="vnote-phi-mark" src="/phi.svg" alt="" aria-hidden="true" />
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

      </header>

      {chartOpen ? (
        <div
          className="chart-popover-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Live chart"
          onMouseDown={closeChartPopover}
          onClick={closeChartPopover}
        >
          <div className="chart-popover" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <div className="chart-popover-head">
              <div className="chart-popover-title">{chartMode === "phi" ? "Φ Resonance · Live" : "$ Price · Live"}</div>
              <button type="button" className="vmodal-close" onClick={closeChartPopover} aria-label="Close chart" title="Close chart">
                ×
              </button>
            </div>
            <div className="chart-popover-body">
              <React.Suspense fallback={<div style={{ padding: 16, color: "var(--inkDim)" }}>Loading chart…</div>}>
                <LiveChart
                  data={chartData}
                  live={chartPhi}
                  pv={pvForChart}
                  premiumX={1}
                  momentX={1}
                  colors={["rgba(167,255,244,1)"]}
                  usdPerPhi={usdPerPhi}
                  mode={chartMode === "usd" ? "usd" : "phi"}
                  dataUnit={isReceiveGlyph ? "usd" : "phi"}
                  reflowKey={chartReflowKey}
                />
              </React.Suspense>
            </div>
          </div>
        </div>
      ) : null}

      {sealPopoverContent ? (
        <div
          className="seal-popover-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${sealPopoverContent.title} details`}
          onMouseDown={closeSealPopover}
          onClick={closeSealPopover}
        >
          <div className="seal-popover" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <div className="seal-popover-head">
              <div>
                <div className="seal-popover-kicker">Official Attestation</div>
                <div className="seal-popover-title">{sealPopoverContent.title}</div>
              </div>
              <div className="seal-popover-status">{sealPopoverContent.status}</div>
              <button type="button" className="vmodal-close" onClick={closeSealPopover} aria-label="Close attestation details" title="Close">
                ×
              </button>
            </div>
            <div className="seal-popover-body">
              {sealPopoverContent.body.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <div className="seal-popover-footer">Breath-Sealed. Proof-Verified. Truth-Aligned.</div>
            </div>
          </div>
        </div>
      ) : null}

      <dialog
        ref={noteDlgRef}
        className="glass-modal fullscreen"
        id="verify-note-dialog"
        data-open={noteOpen ? "true" : "false"}
        aria-label="Exhale Note"
      >
        <div className="modal-viewport" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="modal-topbar" style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", padding: "8px 10px" }}>
            <div style={{ paddingInline: 12, fontSize: 12, color: "var(--dim)" }}>☤Kairos Note Exhaler</div>
            <button
              className="close-btn holo"
              data-aurora="true"
              aria-label="Close"
              title="Close"
              onClick={closeNote}
              style={{ justifySelf: "end", marginRight: 8 }}
            >
              ×
            </button>
          </div>

          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
            {valuationPayload && svgText.trim() ? (
              <NotePrinter
                meta={valuationPayload}
                availablePhi={ledgerBalance?.remaining}
                initial={noteInitial}
                originCanonical={noteOriginCanonical || undefined}
                onSendNote={handleNoteSend}
              />
            ) : (
              <div style={{ padding: 16, color: "var(--dim)" }}>Load and verify a sigil to render an exhale note.</div>
            )}
          </div>
        </div>
      </dialog>

      {/* Body */}
      <div className="vbody">
        <section className="vpanel" role="tabpanel" aria-label="Active panel">
          {/* Inhale */}
          {panel === "inhale" ? (
            <div className="vcard" data-panel="inhale">
              <div className="vcard-head">
                <div className="vcard-title">Inhale: Sigil • Seal • Note</div>
                <div className="vcard-sub">Drop Sigil-Glyph (SVG) or Sigil-Seal / Kai-Note (PNG) to derive Φ-Key.</div>
              </div>
 
              <div className="vcard-body vfit">
                <div className={dragActive ? "vdropzone is-drag" : "vdropzone"} onDragOver={onDragOver} onDragEnter={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
                  {/* hidden file input */}
                  <input
                    ref={fileRef}
                    className="vfile"
                    type="file"
                    accept=".svg,image/svg+xml"
                    onChange={(e) => {
                      handleFiles(e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={pngFileRef}
                    className="vfile"
                    type="file"
                    accept=".svg,image/svg+xml,.png,image/png,.pdf,application/pdf"
                    onChange={(e) => {
                      handleFiles(e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                  />

                  <div className="vgrid-2 vgrid-2--inhale">
                    {/* Control FIRST on mobile (CSS reorders) */}
                    <div className="vcontrol" aria-label="Inhale controls">
                      <button
                        type="button"
                        className={dragActive ? "vdrop vdrop--drag" : "vdrop"}
                        aria-label="Inhale Sigil"
                        title="Inhale Sigil"
                        onClick={() => pngFileRef.current?.click()}
                      >
                        <span className="vdrop-ic" aria-hidden="true">
                          <img className="vphi-ic" src="/phi.svg" alt="" aria-hidden="true" />
                        </span>
                        <span className="vdrop-copy">
                          <span className="vdrop-txt">Inhale</span>
                          <span className="vdrop-sub">{dragActive ? "Drop to Inhale" : "Sigil-Glyph (SVG) or Sigil-Seal / Kai-Note (PNG)"}</span>
                          <span className="vdrop-pills" aria-label="Supported formats">
                            <span className="vdrop-pill">SVG</span>
                            <span className="vdrop-pill">PNG</span>
                          </span>
                        </span>
                        <span className="vdrop-mark vdrop-mark--phi vdrop-keypill" aria-label="Derives key">
                          <img className="vdrop-keymark" src="/phi.svg" alt="" aria-hidden="true" />
                          <span className="vdrop-mark-label">-KEY</span>
                        </span>
                      </button>
                      <div className="vdrop-helper">Original minted files only — screenshots won’t verify.</div>
                      {detectedStatus ? <div className="vdrop-detect">{detectedStatus}</div> : null}

                      <div className="vcontrol-row" aria-label="Quick actions">
                        <IconBtn icon="⟡" title={busy ? "Verifying…" : "Verify"} ariaLabel="Verify" onClick={() => void runVerify()} disabled={busy} kind="primary" />
                        <IconBtn icon="⤢" title="Focus View (paste/edit)" ariaLabel="Focus View (paste/edit)" onClick={() => setOpenSvgEditor(true)} disabled={!svgText.trim()} />
                        <IconBtn icon="💠" title="Remember ΦKey" ariaLabel="Remember ΦKey" onClick={() => void remember(svgText, "ΦKey")} disabled={!svgText.trim()} />
                        <IconBtn
                          icon="⨯"
                          title="Clear"
                          ariaLabel="Clear"
                          onClick={() => {
                            setSvgText("");
                            setSharedReceipt(null);
                            setResult({ status: "idle" });
                            setNotice("");
                            setNoteClaimedImmediate(false);
                            noteDownloadBypassRef.current = false;
                          }}
                          disabled={!svgText.trim() && !sharedReceipt}
                        />
                      </div>
{hasKASOwnerSig ? (
  <div className="vmini-grid vmini-grid--3" aria-label="Attestation status">
    <MiniField label="Identity (Steward)" value={identityStatusLabel} />
    <MiniField label="Sigil-Glyph (Artifact)" value={artifactStatusLabel} />
    <MiniField label="Attestation" value={embeddedProof ? "present" : "—"} />
  </div>
) : (
  <div className="vmini-grid vmini-grid--2" aria-label="Attestation status">
    <MiniField label="Sigil-Glyph (Artifact)" value={artifactStatusLabel} />
    <MiniField label="Attestation" value={embeddedProof ? "present" : "—"} />
  </div>
)}

                    </div>

                    <div className="vconsole" aria-label="ΦKey preview">
                      <pre className="vpre">
                        <code className="mono">{svgPreview || "Inhale a Sigil-Glyph (SVG) or Sigil-Seal / Kai-Note (PNG) to begin…"}</code>
                      </pre>
                      <div className="vconsole-foot">
                        <div className="vchip" title="Sovereign verification rail">
                          Sovereign · {PROOF_HASH_ALG} · {PROOF_CANON}
                        </div>
                        <div className="vactions" aria-label="Console actions">
                          <IconBtn icon="⤢" title="Focus View" ariaLabel="Focus View" onClick={() => setOpenSvgEditor(true)} disabled={!svgText.trim()} />
                          <IconBtn icon="💠" title="Remember ΦKey" ariaLabel="Remember ΦKey" onClick={() => void remember(svgText, "ΦKey")} disabled={!svgText.trim()} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="vdropzone-hint" aria-hidden="true">
                    Drag & drop Sigil-Glyph (SVG) or Sigil-Seal / Kai-Note (PNG) anywhere in this panel
                  </div>
                </div>

                {result.status === "error" ? <div className="verror">{result.message ?? "Not verified."}</div> : null}
              </div>
            </div>
          ) : null}

          {/* Capsule (now labeled Vessel in tabs) */}
          {panel === "capsule" ? (
            <div className="vcard" data-panel="capsule">
              <div className="vcard-head">
                <div className="vcard-title">Proof Vessel</div>
                <div className="vcard-sub">Determinate identity seal: ☤Kai (pulse) + spiral (chakra) day + ☤Kai-Signature → Φ-Key.</div>
              </div>

              <div className="vcard-body vfit">
                <div className="vgrid-2 vgrid-2--capsule">
                  <div className="vframe-wrap">
                    <VerifierFrame pulse={verifierPulse} kaiSignature={verifierSig} phiKey={verifierPhi} chakraDay={verifierChakra} compact />
                  </div>

                  <div className="vstack">
                    <div className="vmini-grid vmini-grid--3" aria-label="Slug and embed checks">
                      <MiniField label="pathMark pulse" value={result.status === "ok" ? (result.checks.slugPulseMatches === null ? "n/a" : String(result.checks.slugPulseMatches)) : "—"} />
                      <MiniField label="pathMark sig" value={result.status === "ok" ? (result.checks.slugShortSigMatches === null ? "n/a" : String(result.checks.slugShortSigMatches)) : "—"} />
                      <MiniField label="Φ-Key seal" value={result.status === "ok" ? (result.checks.derivedPhiKeyMatchesEmbedded === null ? "n/a" : String(result.checks.derivedPhiKeyMatchesEmbedded)) : "—"} />
                    </div>

                    <div className="vrail-grid" aria-label="Capsule fields">
                      <div className="vrow">
                        <span className="vk">☤Kai (pulse)</span>
                        <code className="vv mono">{verifierPulse ? String(verifierPulse) : "—"}</code>
                        <IconBtn icon="💠" title="Remember pulse" ariaLabel="Remember pulse" onClick={() => void remember(String(verifierPulse), "Pulse")} disabled={!verifierPulse} />
                      </div>

                      <div className="vrow">
                        <span className="vk">Spiral (chakra)</span>
                        <code className="vv mono">{verifierChakra ?? "—"}</code>
                        <IconBtn icon="💠" title="Remember Spiral (chakra)" ariaLabel="Remember Spiral (chakra)" onClick={() => void remember(String(verifierChakra ?? ""), "Spiral (Chakra)")} disabled={!verifierChakra} />
                      </div>

                      <div className="vrow">
                        <span className="vk">☤kai-Signature</span>
                        <code className="vv mono" title={verifierSig}>
                          {ellipsizeMiddle(verifierSig, 16, 12)}
                        </code>
                        <IconBtn icon="💠" title="Remember ☤Kai-Signature" ariaLabel="Remember ☤Kai-Signature" onClick={() => void remember(verifierSig, "☤Kai-Signature")} disabled={!verifierSig} />
                      </div>

                      <div className="vrow">
                        <span className="vk">Φ-Key</span>
                        <code className="vv mono" title={verifierPhi}>
                          {verifierPhi === "—" ? "—" : ellipsizeMiddle(verifierPhi, 16, 12)}
                        </code>
                        <IconBtn icon="💠" title="Remember Φ-Key" ariaLabel="Remember Φ-Key" onClick={() => void remember(verifierPhi, "Φ-Key")} disabled={!verifierPhi || verifierPhi === "—"} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Proof */}
          {panel === "proof" ? (
            <div className="vcard" data-panel="proof">
              <div className="vcard-head">
                <div className="vcard-title">Attestation Spine</div>
                <div className="vcard-sub">bundleRoot → bundleHash (capsuleHash + sigilHash + ZK → integrity rail).</div>
              </div>

              <div className="vcard-body vfit">
                <div className="vrail-grid vrail-grid--2" aria-label="Proof hash rail">
                  <div className="vrow">
                    <span className="vk">hash</span>
                    <code className="vv mono">{PROOF_HASH_ALG}</code>
                    <IconBtn icon="💠" title="Remember hash algorithm" ariaLabel="Remember hash algorithm" onClick={() => void remember(PROOF_HASH_ALG, "Hash algorithm")} />
                  </div>

                  <div className="vrow">
                    <span className="vk">canon</span>
                    <code className="vv mono">{PROOF_CANON}</code>
                    <IconBtn icon="💠" title="Remember canonicalization" ariaLabel="Remember canonicalization" onClick={() => void remember(PROOF_CANON, "Canonicalization")} />
                  </div>

                  <div className="vrow">
                    <span className="vk">verifier</span>
                    <code className="vv mono" title={proofVerifierUrl || "—"}>
                      {proofVerifierUrl ? ellipsizeMiddle(proofVerifierUrl, 22, 16) : "—"}
                    </code>
                    <IconBtn icon="💠" title="Remember verifier URL" ariaLabel="Remember verifier URL" onClick={() => void remember(proofVerifierUrl, "Verifier URL")} disabled={!proofVerifierUrl} />
                  </div>

                  <div className="vrow">
                    <span className="vk">steward pulse</span>
                    <code className="vv mono">{stewardPulseLabel}</code>
                    <IconBtn
                      icon="💠"
                      title="Remember steward verification pulse"
                      ariaLabel="Remember steward verification pulse"
                      onClick={() => void remember(String(stewardVerifiedPulse ?? ""), "Steward verification pulse")}
                      disabled={stewardVerifiedPulse == null}
                    />
                  </div>

                  <div className="vrow">
                    <span className="vk">sigilHash</span>
                    <code className="vv mono" title={svgHash || "—"}>
                      {svgHash ? ellipsizeMiddle(svgHash, 22, 16) : "—"}
                    </code>
                    <IconBtn icon="💠" title="Remember ΦKey hash" ariaLabel="Remember SVG hash" onClick={() => void remember(svgHash, "SVG hash")} disabled={!svgHash} />
                  </div>

                  <div className="vrow">
                    <span className="vk">vesselHash</span>
                    <code className="vv mono" title={capsuleHash || "—"}>
                      {capsuleHash ? ellipsizeMiddle(capsuleHash, 22, 16) : "—"}
                    </code>
                    <IconBtn icon="💠" title="Remember vessel hash" ariaLabel="Remember vessel hash" onClick={() => void remember(capsuleHash, "Vessel hash")} disabled={!capsuleHash} />
                  </div>

                  <div className="vrow">
                    <span className="vk">bundleHash</span>
                    <code className="vv mono" title={bundleHash || "—"}>
                      {bundleHash ? ellipsizeMiddle(bundleHash, 22, 16) : "—"}
                    </code>
                    <IconBtn icon="💠" title="Remember bundle hash" ariaLabel="Remember bundle hash" onClick={() => void remember(bundleHash, "Bundle hash")} disabled={!bundleHash} />
                  </div>
                </div>

                <div className="vcard-sub">Advanced · Self-Describing Proof</div>
                <div className="vrail-grid vrail-grid--2" aria-label="Self-describing proof bindings">
                  <div className="vrow">
                    <span className="vk">capsuleHashOf</span>
                    <code className="vv mono">{proofBindings.capsuleHashOf}</code>
                    <IconBtn icon="💠" title="Remember capsule hash binding" ariaLabel="Remember capsule hash binding" onClick={() => void remember(proofBindings.capsuleHashOf, "capsuleHashOf")} />
                  </div>

                  <div className="vrow">
                    <span className="vk">bundleHashOf</span>
                    <code className="vv mono">{proofBindings.bundleHashOf}</code>
                    <IconBtn icon="💠" title="Remember bundle hash binding" ariaLabel="Remember bundle hash binding" onClick={() => void remember(proofBindings.bundleHashOf, "bundleHashOf")} />
                  </div>

                  <div className="vrow">
                    <span className="vk">authorChallengeOf</span>
                    <code className="vv mono">{proofBindings.authorChallengeOf}</code>
                    <IconBtn icon="💠" title="Remember author challenge binding" ariaLabel="Remember author challenge binding" onClick={() => void remember(proofBindings.authorChallengeOf, "authorChallengeOf")} />
                  </div>

                  <div className="vrow">
                    <span className="vk">publicInputOf</span>
                    <code className="vv mono">{zkStatementValue?.publicInputOf ?? "—"}</code>
                    <IconBtn icon="💠" title="Remember ZK public input binding" ariaLabel="Remember ZK public input binding" onClick={() => void remember(String(zkStatementValue?.publicInputOf ?? ""), "publicInputOf")} disabled={!zkStatementValue?.publicInputOf} />
                  </div>

                  <div className="vrow">
                    <span className="vk">domainTag</span>
                    <code className="vv mono">{zkStatementValue?.domainTag ?? "—"}</code>
                    <IconBtn icon="💠" title="Remember ZK domain tag" ariaLabel="Remember ZK domain tag" onClick={() => void remember(String(zkStatementValue?.domainTag ?? ""), "domainTag")} disabled={!zkStatementValue?.domainTag} />
                  </div>

                  <div className="vrow">
                    <span className="vk">publicInputsContract</span>
                    <code className="vv mono" title={zkStatementValue?.publicInputsContract?.meaning ?? ZK_PUBLIC_INPUTS_CONTRACT.meaning}>
                      {publicInputsContractLabel}
                    </code>
                    <IconBtn icon="💠" title="Remember ZK public input contract" ariaLabel="Remember ZK public input contract" onClick={() => void remember(publicInputsContractLabel, "publicInputsContract")} disabled={publicInputsContractLabel === "—"} />
                  </div>
                </div>

                {result.status === "ok" && displayPhi != null ? (
                  <div className="vmini-grid vmini-grid--2 vvaluation-dashboard" aria-label="Live valuation">
                    <MiniField
                      label={
                        displaySource === "note"
                          ? "Note Φ value"
                          : displaySource === "balance"
                            ? "Glyph Φ balance"
                            : displaySource === "embedded"
                              ? "Glyph Φ value"
                              : "Live Φ value"
                      }
                      value={fmtPhi(displayPhi)}
                      onClick={() => openChartPopover("phi")}
                      ariaLabel="Open live chart for Φ value"
                    />
                    <MiniField
                      label={
                        displaySource === "note"
                          ? "Note USD value"
                          : displaySource === "balance"
                            ? "Glyph USD balance"
                            : displaySource === "embedded"
                              ? "Glyph USD value"
                              : "Live USD value"
                      }
                      value={displayUsd == null ? "—" : fmtUsd(displayUsd)}
                      onClick={displayUsd == null ? undefined : () => openChartPopover("usd")}
                      ariaLabel="Open live chart for USD value"
                    />
                  </div>
                ) : null}

                <div className="vfoot" aria-label="Proof actions">
                  <div className="vfoot-left">
                    <div className="vchip" title="Canonical audit payload">
                      Audit JSON
                    </div>
                  </div>
                  <div className="vfoot-right">
                    <IconBtn icon="⤢" title="Focus View (Audit JSON)" ariaLabel="Focus View (Audit JSON)" onClick={() => setOpenAuditJson(true)} disabled={!auditBundleText} />
                    <IconBtn icon="💠" title="Remember Audit JSON" ariaLabel="Remember Audit JSON" onClick={() => void remember(auditBundleText, "Audit JSON")} disabled={!auditBundleText} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ZK */}
          {panel === "zk" ? (
            <div className="vcard" data-panel="zk">
              <div className="vcard-head">
                <div className="vcard-title">Zero Knowledge Proof</div>
                <div className="vcard-sub">Groth16 + Poseidon status; full payloads in Expanded Views.</div>
              </div>

              <div className="vcard-body vfit">
                <div className="vrail-grid vrail-grid--2" aria-label="ZK rail values">
                  <div className="vrow">
                    <span className="vk">poseidon</span>
                    <code className="vv mono" title={String(zkMeta?.zkPoseidonHash ?? "—")}>
                      {zkMeta?.zkPoseidonHash ? ellipsizeMiddle(String(zkMeta.zkPoseidonHash), 22, 16) : "—"}
                    </code>
                    <IconBtn icon="💠" title="Remember Poseidon hash" ariaLabel="Remember Poseidon hash" onClick={() => void remember(String(zkMeta?.zkPoseidonHash ?? ""), "Poseidon hash")} disabled={!zkMeta?.zkPoseidonHash} />
                  </div>

                  <div className="vrow">
                    <span className="vk">groth16</span>
                    <div className="vseal-inline">
                      <SealPill label="G16" state={sealZK} detail="Groth16 verification status" />
                    </div>
                    <span />
                  </div>

                  <div className="vrow">
                    <span className="vk">zkProof</span>
                    <code className="vv mono" title={embeddedZkProof || "—"}>
                      {embeddedZkProof ? ellipsizeMiddle(embeddedZkProof.replace(/\s+/g, " "), 22, 18) : "—"}
                    </code>
                    <div className="vrow-actions">
                      <IconBtn icon="⤢" title="Focus View (ZK proof)" ariaLabel="Focus View (ZK proof)" onClick={() => setOpenZkProof(true)} disabled={!embeddedZkProof} />
                      <IconBtn icon="💠" title="Remember ZK proof" ariaLabel="Remember ZK proof" onClick={() => void remember(embeddedZkProof, "ZK proof")} disabled={!embeddedZkProof} />
                    </div>
                  </div>

                  <div className="vrow">
                    <span className="vk">publicInputs</span>
                    <code className="vv mono" title={embeddedZkPublicInputs || "—"}>
                      {embeddedZkPublicInputs ? ellipsizeMiddle(embeddedZkPublicInputs.replace(/\s+/g, " "), 22, 18) : "—"}
                    </code>
                    <div className="vrow-actions">
                      <IconBtn icon="⤢" title="Focus View (public inputs)" ariaLabel="Focus View (public inputs)" onClick={() => setOpenZkInputs(true)} disabled={!embeddedZkPublicInputs} />
                      <IconBtn icon="💠" title="Remember public inputs" ariaLabel="Remember public inputs" onClick={() => void remember(embeddedZkPublicInputs, "Public inputs")} disabled={!embeddedZkPublicInputs} />
                    </div>
                  </div>

                  <div className="vrow">
                    <span className="vk">hints</span>
                    <code className="vv mono" title={embeddedProofHints || "—"}>
                      {embeddedProofHints ? ellipsizeMiddle(embeddedProofHints.replace(/\s+/g, " "), 22, 18) : "—"}
                    </code>
                    <div className="vrow-actions">
                      <IconBtn icon="⤢" title="Focus View (hints)" ariaLabel="Focus View (hints)" onClick={() => setOpenZkHints(true)} disabled={!embeddedProofHints} />
                      <IconBtn icon="💠" title="Remember hints" ariaLabel="Remember hints" onClick={() => void remember(embeddedProofHints, "Proof hints")} disabled={!embeddedProofHints} />
                    </div>
                  </div>

                  <div className="vrow">
                    <span className="vk">audit</span>
                    <code className="vv mono">bundle JSON</code>
                    <div className="vrow-actions">
                      <IconBtn icon="⤢" title="Focus View (Audit JSON)" ariaLabel="Focus View (Audit JSON)" onClick={() => setOpenAuditJson(true)} disabled={!auditBundleText} />
                      <IconBtn icon="💠" title="Remember Audit JSON" ariaLabel="Remember Audit JSON" onClick={() => void remember(auditBundleText, "Audit JSON")} disabled={!auditBundleText} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Audit */}
          {panel === "audit" ? (
            <div className="vcard" data-panel="audit">
              <div className="vcard-head">
                <div className="vcard-title">Audit</div>
                <div className="vcard-sub">Attestation bundle parity + author seal validity.</div>
              </div>

              <div className="vcard-body vfit">
                <div className="vmini-grid vmini-grid--6" aria-label="Audit checks">
                  <MiniField label="Attestation bundle" value={embeddedProof ? "present" : "—"} />
                  {hasKASOwnerSig ? (
                    <MiniField label="Owner/Auth signer" value={ownerAuthSignerPresent ? "present" : "—"} />
                  ) : null}
                  {hasKASOwnerSig ? (
                    <MiniField
                      label="Owner/Auth verified"
                      value={ownerAuthVerifiedValue === null ? "n/a" : ownerAuthVerifiedValue ? "true" : "false"}
                    />
                  ) : null}
                  {!isReceiveGlyph && hasKASProvenanceSig ? (
                    <MiniField label="Provenance/Origin signature" value={provenanceSig ? "present" : "—"} />
                  ) : null}
                  {!isReceiveGlyph && hasKASProvenanceSig ? (
                    <MiniField
                      label="Provenance/Origin verified"
                      value={provenanceSigVerifiedValue === null ? "n/a" : provenanceSigVerifiedValue ? "true" : "false"}
                    />
                  ) : null}
                  {hasKASReceiveSig && isReceiveGlyph ? (
                    <MiniField label="Owner receive signature" value={effectiveReceiveSig ? "present" : "—"} />
                  ) : null}
                  {hasKASReceiveSig && isReceiveGlyph ? (
                    <MiniField label="Owner receive verified" value={receiveSigVerified === null ? "n/a" : receiveSigVerified ? "true" : "false"} />
                  ) : null}
                  {hasKASAuthSig ? (
                    <MiniField label="Owner ΦKey" value={effectiveOwnerPhiKey ? "present" : "—"} />
                  ) : null}
                  {hasKASAuthSig ? (
                    <MiniField label="Owner ΦKey verified" value={ownerPhiKeyVerified === null ? "n/a" : ownerPhiKeyVerified ? "true" : "false"} />
                  ) : null}
                  {hasKASAuthSig ? (
                    <MiniField label="Ownership attested" value={ownershipAttested === "missing" ? "missing" : ownershipAttested ? "true" : "false"} />
                  ) : null}
                  <MiniField label="sigilHash parity" value={embeddedProof?.svgHash ? String(embeddedProof.svgHash === svgHash) : "n/a"} />
                  <MiniField label="vesselHash parity" value={embeddedProof?.capsuleHash ? String(embeddedProof.capsuleHash === capsuleHash) : "n/a"} />
                  <MiniField label="bundleHash parity" value={embeddedProof?.bundleHash ? String(embeddedProof.bundleHash === bundleHash) : "n/a"} />
                </div>

                {hasKASReceiveSig && isReceiveGlyph ? (
                  <div className="vmini-grid vmini-grid--3" aria-label="Receive signature status">
                    <MiniField
                      label="Receive credId"
                      value={receiveCredId ? ellipsizeMiddle(receiveCredId, 12, 10) : "—"}
                      title={receiveCredId || "—"}
                    />
                  </div>
                ) : null}

                {hasKASReceiveSig && isReceiveGlyph && effectiveReceiveSig ? (
                  <div className="vmini-grid vmini-grid--2" aria-label="Receive signature summary">
                    <MiniField
                      label="Receive nonce"
                      value={receiveNonce ? ellipsizeMiddle(receiveNonce, 14, 12) : "—"}
                      title={receiveNonce || "—"}
                    />
                    <MiniField label="Receive bundle" value={receiveBundleHash ? ellipsizeMiddle(receiveBundleHash, 14, 12) : "—"} title={receiveBundleHash || "—"} />
                  </div>
                ) : null}

                <div className="vfoot" aria-label="Audit actions">
                  <div className="vfoot-left">
                    <div className="vseals" aria-label="Seal summary">
                      {hasKASAuthSig ? <SealPill label="KAS" state={sealKAS} /> : null}
                      <SealPill label="G16" state={sealZK} />
                    </div>
                  </div>
                  <div className="vfoot-right">
                    <IconBtn icon="⤢" title="Focus View (Audit JSON)" ariaLabel="Focus View (Audit JSON)" onClick={() => setOpenAuditJson(true)} disabled={!auditBundleText} />
                    <IconBtn icon="💠" title="Remember Audit JSON" ariaLabel="Remember Audit JSON" onClick={() => void remember(auditBundleText, "Audit JSON")} disabled={!auditBundleText} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* Bottom tabs */}
        <nav className="vtabs" role="tablist" aria-label="Verifier views">
          <TabBtn active={panel === "inhale"} title="Inhale" text="Inhale" onClick={() => setPanel("inhale")} icon={<img className="vtab-phi" src="/phi.svg" alt="" aria-hidden="true" />} />
          <TabBtn active={panel === "capsule"} title="Vessel" text="Vessel" onClick={() => setPanel("capsule")} icon="◈" />
          <TabBtn active={panel === "proof"} title="Proof" text="Proof" onClick={() => setPanel("proof")} icon={<ProofMark />} />
          <TabBtn active={panel === "zk"} title="ZK" text="ZK" onClick={() => setPanel("zk")} icon={<ZkMark />} />
          <TabBtn active={panel === "audit"} title="Audit" text="Audit" onClick={() => setPanel("audit")} icon="▦" />

          <div className="vtabs-spacer" aria-hidden="true" />

          <button type="button" className="vverify" onClick={() => void runVerify()} disabled={busy} aria-label="Verify now" title={busy ? "Verifying…" : `Verify (${activePanelTitle})`}>
            <span className="vverify-ic" aria-hidden="true">
              ⟡
            </span>
            <span className="vverify-txt">{busy ? "VERIFYING" : "VERIFY"}</span>
          </button>
        </nav>
      </div>

      {/* Focus Views */}
      <Modal open={openSvgEditor} title="ΦKey Focus View" subtitle='Paste/edit sealed SVG (must include <metadata id="kai-voh-proof">{...}</metadata>).' onClose={() => setOpenSvgEditor(false)}>
        <textarea
          className="vta"
          value={svgText}
          onChange={(e) => {
            setSvgText(e.currentTarget.value);
            setResult({ status: "idle" });
          }}
          spellCheck={false}
        />
        <div className="vmodal-actions">
          <button
            type="button"
            className="vcta"
            data-perf-action="verify"
            onClick={() => void runVerify()}
            disabled={busy}
            title={busy ? "Verifying…" : "Verify"}
          >
            ⟡ {busy ? "VERIFYING" : "VERIFY"}
          </button>
          <button
            type="button"
            className="vcta vcta--ghost"
            data-perf-action="remember-svg"
            onClick={() => void remember(svgText, "SVG")}
            disabled={!svgText.trim()}
            title="💠 Remember"
          >
            💠 REMEMBER
          </button>
        </div>
      </Modal>

      <Modal open={openAuditJson} title="Audit JSON" subtitle="Canonical audit payload (bundleRoot → bundleHash)." onClose={() => setOpenAuditJson(false)}>
        <textarea className="vta vta--readonly" readOnly value={auditBundleText || "—"} />
        <div className="vmodal-actions">
          <button
            type="button"
            className="vcta"
            data-perf-action="remember-audit"
            onClick={() => void remember(auditBundleText, "Audit JSON")}
            disabled={!auditBundleText}
            title="💠 Remember"
          >
            💠 REMEMBER
          </button>
          <button
            type="button"
            className="vcta vcta--ghost"
            data-perf-action="close-audit"
            onClick={() => setOpenAuditJson(false)}
            title="Close"
          >
            CLOSE
          </button>
        </div>
      </Modal>

      <Modal open={openZkProof} title="ZK Proof" subtitle="Full embedded Groth16 proof payload." onClose={() => setOpenZkProof(false)}>
        <textarea className="vta vta--readonly" readOnly value={embeddedZkProof || "—"} />
        <div className="vmodal-actions">
          <button
            type="button"
            className="vcta"
            data-perf-action="remember-zk-proof"
            onClick={() => void remember(embeddedZkProof, "ZK proof")}
            disabled={!embeddedZkProof}
            title="💠 Remember"
          >
            💠 REMEMBER
          </button>
          <button
            type="button"
            className="vcta vcta--ghost"
            data-perf-action="close-zk-proof"
            onClick={() => setOpenZkProof(false)}
            title="Close"
          >
            CLOSE
          </button>
        </div>
      </Modal>

      <Modal open={openZkInputs} title="ZK Public Inputs" subtitle="Full embedded public inputs payload." onClose={() => setOpenZkInputs(false)}>
        <textarea className="vta vta--readonly" readOnly value={embeddedZkPublicInputs || "—"} />
        <div className="vmodal-actions">
          <button
            type="button"
            className="vcta"
            data-perf-action="remember-zk-inputs"
            onClick={() => void remember(embeddedZkPublicInputs, "Public inputs")}
            disabled={!embeddedZkPublicInputs}
            title="💠 Remember"
          >
            💠 REMEMBER
          </button>
          <button
            type="button"
            className="vcta vcta--ghost"
            data-perf-action="close-zk-inputs"
            onClick={() => setOpenZkInputs(false)}
            title="Close"
          >
            CLOSE
          </button>
        </div>
      </Modal>

      <Modal open={openZkHints} title="Proof Hints" subtitle="Explorer/API hints embedded in the bundle." onClose={() => setOpenZkHints(false)}>
        <textarea className="vta vta--readonly" readOnly value={embeddedProofHints || "—"} />
        <div className="vmodal-actions">
          <button
            type="button"
            className="vcta"
            data-perf-action="remember-proof-hints"
            onClick={() => void remember(embeddedProofHints, "Proof hints")}
            disabled={!embeddedProofHints}
            title="💠 Remember"
          >
            💠 REMEMBER
          </button>
          <button
            type="button"
            className="vcta vcta--ghost"
            data-perf-action="close-proof-hints"
            onClick={() => setOpenZkHints(false)}
            title="Close"
          >
            CLOSE
          </button>
        </div>
      </Modal>
    </div>
  );
}
