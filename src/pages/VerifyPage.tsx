// src/pages/VerifyPage.tsx
"use client";

import React, { useCallback, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import "./VerifyPage.css";

import VerifierFrame from "../components/KaiVoh/VerifierFrame";
import { parseSlug, verifySigilSvg, type VerifyResult } from "../utils/verifySigil";
import { DEFAULT_ISSUANCE_POLICY, quotePhiForUsd } from "../utils/phi-issuance";
import { currency as fmtPhi, usd as fmtUsd } from "../components/valuation/display";
import {
  buildVerifierSlug,
  buildVerifierUrl,
  buildBundleUnsigned,
  hashBundle,
  hashProofCapsuleV1,
  hashSvgText,
  normalizeChakraDay,
  PROOF_CANON,
  PROOF_HASH_ALG,
  type ProofCapsuleV1,
} from "../components/KaiVoh/verifierProof";
import { extractProofBundleMetaFromSvg, type ProofBundleMeta } from "../utils/sigilMetadata";
import { derivePhiKeyFromSig } from "../components/VerifierStamper/sigilUtils";
import { tryVerifyGroth16 } from "../components/VerifierStamper/zk";
import { isKASAuthorSig, type KASAuthorSig } from "../utils/authorSig";
import { isWebAuthnAvailable, verifyBundleAuthorSig } from "../utils/webauthnKAS";
import {
  buildKasChallenge,
  getWebAuthnAssertionJson,
  isReceiveSig,
  verifyWebAuthnAssertion,
  type ReceiveSig,
} from "../utils/webauthnReceive";
import { base64UrlDecode, base64UrlEncode, sha256Hex } from "../utils/sha256";
import { getKaiPulseEternalInt } from "../SovereignSolar";
import { useKaiTicker } from "../hooks/useKaiTicker";
import { useValuation } from "./SigilPage/useValuation";
import type { SigilMetadataLite } from "../utils/valuation";
import { jcsCanonicalize } from "../utils/jcs";
import { svgCanonicalForHash } from "../utils/svgProof";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type DebitLoose = {
  amount?: number;
};

type EmbeddedPhiSource = "balance" | "embedded" | "live";

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
  bundleHash?: string;
  verifierUrl?: string;
  shareUrl?: string;
  authorSig?: ProofBundleMeta["authorSig"];
  zkPoseidonHash?: string;
  zkProof?: ProofBundleMeta["zkProof"];
  proofHints?: ProofBundleMeta["proofHints"];
  zkPublicInputs?: ProofBundleMeta["zkPublicInputs"];
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
  return {
    proofCapsule,
    capsuleHash: typeof raw.capsuleHash === "string" ? raw.capsuleHash : undefined,
    svgHash: typeof raw.svgHash === "string" ? raw.svgHash : undefined,
    bundleHash: typeof raw.bundleHash === "string" ? raw.bundleHash : undefined,
    verifierUrl: typeof raw.verifierUrl === "string" ? raw.verifierUrl : undefined,
    shareUrl: typeof raw.shareUrl === "string" ? raw.shareUrl : undefined,
    authorSig: raw.authorSig as ProofBundleMeta["authorSig"],
    zkPoseidonHash: typeof raw.zkPoseidonHash === "string" ? raw.zkPoseidonHash : undefined,
    zkProof: "zkProof" in raw ? raw.zkProof : undefined,
    proofHints: "proofHints" in raw ? raw.proofHints : undefined,
    zkPublicInputs: "zkPublicInputs" in raw ? raw.zkPublicInputs : undefined,
  };
}

function readSharedReceiptFromLocation(): SharedReceipt | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("r") ?? params.get("receipt");
  if (!encoded) return null;
  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(encoded));
    const raw = JSON.parse(decoded);
    return buildSharedReceiptFromObject(raw);
  } catch {
    return null;
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

function encodeReceiptParam(receiptJson: string): string {
  const bytes = new TextEncoder().encode(receiptJson);
  return base64UrlEncode(bytes);
}

function buildReceiptShareUrl(baseUrl: string, receiptJson: string): string {
  const base = baseUrl || "/verify";
  const url = new URL(base, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("r", encodeReceiptParam(receiptJson));
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

function isSvgFile(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return name.endsWith(".svg") || type === "image/svg+xml";
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

function OfficialBadge(props: { kind: BadgeKind; title: string; subtitle?: string }): ReactElement {
  const data = props.kind === "ok" ? "ok" : props.kind === "fail" ? "fail" : props.kind === "busy" ? "busy" : "idle";
  const showCheck = props.kind === "ok";
  return (
    <div className="official" data-kind={data} aria-live="polite">
      <div className="official-top">
        <div className="official-ring" aria-hidden="true">
          {showCheck ? <span className="official-check">✓</span> : null}
        </div>
        <div className="official-title">{props.title}</div>
      </div>
      {props.subtitle ? <div className="official-sub">{props.subtitle}</div> : null}
    </div>
  );
}

function SealPill(props: { label: string; state: SealState; detail?: string }): ReactElement {
  const icon = props.state === "valid" ? "✓" : props.state === "invalid" ? "✕" : props.state === "busy" ? "⟡" : props.state === "na" ? "—" : "·";
  const text = props.state === "valid" ? "VERIFIED" : props.state === "invalid" ? "INVALID" : props.state === "busy" ? "CHECKING" : props.state === "na" ? "N/A" : "ABSENT";
  return (
    <div className="seal" data-state={props.state} title={props.detail ?? ""}>
      <span className="seal-ic" aria-hidden="true">
        {icon}
      </span>
      <span className="seal-lbl">{props.label}</span>
      <span className="seal-txt">{text}</span>
    </div>
  );
}

function MiniField(props: { label: string; value: string; title?: string }): ReactElement {
  return (
    <div className="mini">
      <div className="mini-k">{props.label}</div>
      <div className="mini-v mono" title={props.title ?? props.value}>
        {props.value || "—"}
      </div>
    </div>
  );
}

function LiveValuePill(props: { phiValue: number; usdValue: number | null; label: string; ariaLabel: string }): ReactElement {
  return (
    <div className="vseal-value" aria-label={props.ariaLabel}>
      <div className="vseal-value-label">{props.label}</div>
      <div className="vseal-value-phi">{fmtPhi(props.phiValue)}</div>
      <div className="vseal-value-usd">{props.usdValue == null ? "—" : fmtUsd(props.usdValue)}</div>
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

  const slugRaw = useMemo(() => readSlugFromLocation(), []);
  const slug = useMemo(() => parseSlug(slugRaw), [slugRaw]);
  const initialReceipt = useMemo(() => readSharedReceiptFromLocation(), []);

  const [panel, setPanel] = useState<PanelKey>("inhale");

  const [svgText, setSvgText] = useState<string>("");
  const [result, setResult] = useState<VerifyResult>({ status: "idle" });
  const [busy, setBusy] = useState<boolean>(false);
  const [sharedReceipt, setSharedReceipt] = useState<SharedReceipt | null>(initialReceipt);

  const [proofCapsule, setProofCapsule] = useState<ProofCapsuleV1 | null>(null);
  const [capsuleHash, setCapsuleHash] = useState<string>("");
  const [svgHash, setSvgHash] = useState<string>("");
  const [bundleHash, setBundleHash] = useState<string>("");
  const [svgBytesHash, setSvgBytesHash] = useState<string>("");

  const [embeddedProof, setEmbeddedProof] = useState<ProofBundleMeta | null>(null);
  const [notice, setNotice] = useState<string>("");

  const [authorSigVerified, setAuthorSigVerified] = useState<boolean | null>(null);
  const [receiveSigVerified, setReceiveSigVerified] = useState<boolean | null>(null);
  const [identityAttested, setIdentityAttested] = useState<AttestationState>("missing");
  const [identityScanRequested, setIdentityScanRequested] = useState<boolean>(false);
  const [identityScanBusy, setIdentityScanBusy] = useState<boolean>(false);
  const [artifactAttested, setArtifactAttested] = useState<AttestationState>("missing");

  const [zkVerify, setZkVerify] = useState<boolean | null>(null);
  const [zkVkey, setZkVkey] = useState<unknown>(null);

  const [receiveSig, setReceiveSig] = useState<ReceiveSig | null>(null);

  const [dragActive, setDragActive] = useState<boolean>(false);

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

  const displayPhi = ledgerBalance?.remaining ?? embeddedPhi ?? liveValuePhi;

  const displaySource: EmbeddedPhiSource = ledgerBalance ? "balance" : embeddedPhi != null ? "embedded" : "live";

  const displayUsd = useMemo(() => {
    if (displayPhi == null || !Number.isFinite(usdPerPhi) || usdPerPhi <= 0) return null;
    return displayPhi * usdPerPhi;
  }, [displayPhi, usdPerPhi]);

  const displayLabel = displaySource === "balance" ? "BALANCE" : displaySource === "embedded" ? "GLYPH" : "LIVE";
  const displayAriaLabel =
    displaySource === "balance"
      ? "Glyph balance"
      : displaySource === "embedded"
        ? "Glyph embedded value"
        : "Live glyph valuation";

  // Focus Views
  const [openSvgEditor, setOpenSvgEditor] = useState<boolean>(false);
  const [openAuditJson, setOpenAuditJson] = useState<boolean>(false);
  const [openZkProof, setOpenZkProof] = useState<boolean>(false);
  const [openZkInputs, setOpenZkInputs] = useState<boolean>(false);
  const [openZkHints, setOpenZkHints] = useState<boolean>(false);

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
      ogImageUrl.searchParams.set("phiKey", result.derivedPhiKey ?? "");
      if (result.embedded.chakraDay) ogImageUrl.searchParams.set("chakraDay", result.embedded.chakraDay);
      if (authorSigVerified != null) ogImageUrl.searchParams.set("kas", authorSigVerified ? "1" : "0");
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
  }, [authorSigVerified, result, slug.pulse, slug.raw, slugRaw, zkVerify]);

  const zkMeta = useMemo(() => {
    if (embeddedProof) return embeddedProof;
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

  const proofVerifierUrl = useMemo(() => (proofCapsule ? buildVerifierUrl(proofCapsule.pulse, proofCapsule.kaiSignature) : ""), [proofCapsule]);
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
        setResult({ status: "error", message: "Upload a sealed .svg (embedded <metadata> JSON).", slug });
        return;
      }
      const text = await readFileText(file);
      setSvgText(text);
      setResult({ status: "idle" });
      setNotice("");
    },
    [slug],
  );

  const handleFiles = useCallback(
    (files: FileList | null | undefined): void => {
      if (!files || files.length === 0) return;
      const arr = Array.from(files);
      const svg = arr.find(isSvgFile);
      if (!svg) {
        setResult({ status: "error", message: "Drop/select a sealed .svg file.", slug });
        return;
      }
      void onPickFile(svg);
    },
    [onPickFile, slug],
  );

  const runVerify = useCallback(async (): Promise<void> => {
    const raw = svgText.trim();
    if (!raw) {
      setResult({ status: "error", message: "Inhale or paste the sealed SVG (ΦKey).", slug });
      return;
    }
    const receipt = parseSharedReceiptFromText(raw);
    if (receipt) {
      setSharedReceipt(receipt);
      setSvgText("");
      setResult({ status: "idle" });
      setNotice("Receipt loaded.");
      return;
    }
    setBusy(true);
    try {
      const next = await verifySigilSvg(slug, raw);
      setResult(next);
      if (next.status === "ok") {
        setIdentityAttested("missing");
        setIdentityScanRequested(true);
      } else {
        setIdentityScanRequested(false);
      }
    } finally {
      setBusy(false);
    }
  }, [slug, svgText]);

  // Proof bundle construction (logic unchanged)
  React.useEffect(() => {
    let active = true;

    const buildProof = async (): Promise<void> => {
      if (result.status !== "ok") {
        setProofCapsule(null);
        setCapsuleHash("");
        setSvgHash("");
        setBundleHash("");
        setEmbeddedProof(null);
        setAuthorSigVerified(null);
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
          authorSig: sharedReceipt.authorSig,
          zkPoseidonHash: sharedReceipt.zkPoseidonHash,
          zkProof: sharedReceipt.zkProof,
          proofHints: sharedReceipt.proofHints,
          zkPublicInputs: sharedReceipt.zkPublicInputs,
        });
        setAuthorSigVerified(null);
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

      const bundleSeed =
        embedded?.raw && typeof embedded.raw === "object" && embedded.raw !== null
          ? { ...(embedded.raw as Record<string, unknown>), svgHash: svgHashNext, capsuleHash: capsuleHashNext, proofCapsule: capsule }
          : {
              hashAlg: embedded?.hashAlg ?? PROOF_HASH_ALG,
              canon: embedded?.canon ?? PROOF_CANON,
              proofCapsule: capsule,
              capsuleHash: capsuleHashNext,
              svgHash: svgHashNext,
              shareUrl: embedded?.shareUrl,
              verifierUrl: embedded?.verifierUrl,
              zkPoseidonHash: embedded?.zkPoseidonHash,
              zkProof: embedded?.zkProof,
              proofHints: embedded?.proofHints,
              zkPublicInputs: embedded?.zkPublicInputs,
              authorSig: embedded?.authorSig ?? null,
            };

      const bundleUnsigned = buildBundleUnsigned(bundleSeed);
      const bundleHashNext = await hashBundle(bundleUnsigned);

      const authorSigNext = embedded?.authorSig;
      let authorSigOk: boolean | null = null;
      if (authorSigNext) {
        if (isKASAuthorSig(authorSigNext)) {
          const authorBundleHash = bundleHashFromAuthorSig(authorSigNext);
          authorSigOk = await verifyBundleAuthorSig(authorBundleHash ?? bundleHashNext, authorSigNext);
        } else {
          authorSigOk = false;
        }
      }

      if (!active) return;
      setProofCapsule(capsule);
      setSvgHash(svgHashNext);
      setCapsuleHash(capsuleHashNext);
      setBundleHash(bundleHashNext);
      setEmbeddedProof(embedded);
      setAuthorSigVerified(authorSigOk);
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
      bundleHash: sharedReceipt.bundleHash,
      shareUrl: sharedReceipt.shareUrl,
      verifierUrl: sharedReceipt.verifierUrl,
      authorSig: sharedReceipt.authorSig,
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
            }
          : {
              status: "ok",
              slug,
              embedded: baseEmbedded,
              derivedPhiKey,
              checks,
            },
      );
      setEmbeddedProof(embed);
      setProofCapsule(capsule);
      setCapsuleHash(sharedReceipt.capsuleHash ?? "");
      setSvgHash(sharedReceipt.svgHash ?? "");
      setBundleHash(sharedReceipt.bundleHash ?? "");
    })();

    return () => {
      active = false;
    };
  }, [sharedReceipt, slug, svgText]);

  React.useEffect(() => {
    if (result.status !== "ok" || !bundleHash) {
      setReceiveSig(null);
      setReceiveSigVerified(null);
      return;
    }
    const embeddedReceive = readReceiveSigFromBundle(embeddedProof?.raw ?? result.embedded.raw);
    if (embeddedReceive) {
      setReceiveSig(embeddedReceive);
      return;
    }

    setReceiveSig(null);
    setReceiveSigVerified(null);
  }, [result.status, bundleHash, embeddedProof?.raw]);

  React.useEffect(() => {
    let active = true;
    if (!receiveSig || !bundleHash) {
      setReceiveSigVerified(null);
      return;
    }

    (async () => {
      const receiveBundleHash = receiveSig.binds.bundleHash;
      if (!receiveBundleHash) {
        if (active) setReceiveSigVerified(false);
        return;
      }
      const { challengeBytes } = await buildKasChallenge("receive", receiveBundleHash, receiveSig.nonce);
      const ok = await verifyWebAuthnAssertion({
        assertion: receiveSig.assertion,
        expectedChallenge: challengeBytes,
        pubKeyJwk: receiveSig.pubKeyJwk,
        expectedCredId: receiveSig.credId,
      });
      if (active) setReceiveSigVerified(ok);
    })();

    return () => {
      active = false;
    };
  }, [receiveSig, bundleHash]);

  React.useEffect(() => {
    let active = true;
    if (!embeddedProof?.authorSig || !bundleHash) return;
    if (authorSigVerified !== null) return;
    const authorSigNext = embeddedProof.authorSig;

    (async () => {
      if (!isKASAuthorSig(authorSigNext)) {
        if (active) setAuthorSigVerified(false);
        return;
      }
      const authorBundleHash = bundleHashFromAuthorSig(authorSigNext);
      const ok = await verifyBundleAuthorSig(authorBundleHash ?? bundleHash, authorSigNext);
      if (active) setAuthorSigVerified(ok);
    })();

    return () => {
      active = false;
    };
  }, [authorSigVerified, bundleHash, embeddedProof?.authorSig]);

  React.useEffect(() => {
    if (!svgText.trim()) {
      setIdentityAttested("missing");
      setIdentityScanRequested(false);
    }
  }, [svgText]);

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

  // Groth16 verify (logic unchanged)
  React.useEffect(() => {
    let active = true;

    (async () => {
      if (!zkMeta?.zkProof || !zkMeta?.zkPublicInputs) {
        if (active) setZkVerify(null);
        return;
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

      const parsedProof = parseJsonString(zkMeta.zkProof);
      const parsedInputs = parseJsonString(zkMeta.zkPublicInputs);
      const inputs = Array.isArray(parsedInputs) || typeof parsedInputs === "object" ? parsedInputs : [parsedInputs];

      const verified = await tryVerifyGroth16({
        proof: parsedProof,
        publicSignals: inputs,
        vkey: zkVkey ?? undefined,
        fallbackVkey: zkVkey ?? undefined,
      });

      if (!active) return;
      setZkVerify(verified);
    })();

    return () => {
      active = false;
    };
  }, [zkMeta, zkVkey]);

  const attemptIdentityScan = useCallback(
    async (authorSig: KASAuthorSig, bundleHashValue: string): Promise<void> => {
      if (identityScanBusy) return;
      setIdentityScanBusy(true);
      try {
        if (!isWebAuthnAvailable()) {
          setIdentityAttested(false);
          setNotice("WebAuthn is not available in this browser. Please verify on a device with passkeys enabled.");
          return;
        }
        const { challengeBytes } = await buildKasChallenge("unlock", bundleHashValue);
        let assertion: Awaited<ReturnType<typeof getWebAuthnAssertionJson>>;
        try {
          assertion = await getWebAuthnAssertionJson({
            challenge: challengeBytes,
            allowCredIds: [authorSig.credId],
            preferInternal: true,
          });
        } catch {
          assertion = await getWebAuthnAssertionJson({
            challenge: challengeBytes,
            preferInternal: true,
          });
        }
        const ok = await verifyWebAuthnAssertion({
          assertion,
          expectedChallenge: challengeBytes,
          pubKeyJwk: authorSig.pubKeyJwk,
          expectedCredId: authorSig.credId,
        });
        setIdentityAttested(ok);
        if (!ok) setNotice("Identity verification failed.");
      } catch {
        setIdentityAttested(false);
        setNotice("Identity verification canceled.");
      } finally {
        setIdentityScanBusy(false);
        setIdentityScanRequested(false);
      }
    },
    [identityScanBusy]
  );

  React.useEffect(() => {
    if (!identityScanRequested) return;
    if (!svgText.trim()) {
      setIdentityScanRequested(false);
      return;
    }
    const authorSig = embeddedProof?.authorSig;
    if (!authorSig || !isKASAuthorSig(authorSig)) {
      setIdentityAttested("missing");
      setIdentityScanRequested(false);
      return;
    }
    if (!bundleHash) return;
    void attemptIdentityScan(authorSig, bundleHash);
  }, [attemptIdentityScan, bundleHash, embeddedProof?.authorSig, identityScanRequested, svgText]);

  const badge: { kind: BadgeKind; title: string; subtitle?: string } = useMemo(() => {
    if (busy) return { kind: "busy", title: "SEALING", subtitle: "Deterministic proof rails executing." };
    if (result.status === "ok") return { kind: "ok", title: "PROOF OF BREATH™", subtitle: "Human-origin seal affirmed." };
    if (result.status === "error") return { kind: "fail", title: "REJECTED", subtitle: "Inhale a sealed ΦKey, then verify." };
    return { kind: "idle", title: "STANDBY", subtitle: "Inhale a ΦKey to begin." };
  }, [busy, result.status]);

  const kpiPulse = useMemo(
    () => (result.status === "ok" ? String(result.embedded.pulse ?? (slug.pulse ?? 0)) : String(slug.pulse ?? 0)),
    [result, slug.pulse],
  );
  const kpiPhiKey = useMemo(() => (result.status === "ok" ? result.derivedPhiKey || "—" : "—"), [result]);

  const sealKAS: SealState = useMemo(() => {
    if (busy) return "busy";
    if (!embeddedProof?.authorSig) return "off";
    if (authorSigVerified === null) return "na";
    return authorSigVerified ? "valid" : "invalid";
  }, [busy, embeddedProof?.authorSig, authorSigVerified]);

  const sealZK: SealState = useMemo(() => {
    if (busy) return "busy";
    if (!zkMeta?.zkPoseidonHash) return "off";
    if (zkVerify === null) return "na";
    return zkVerify ? "valid" : "invalid";
  }, [busy, zkMeta?.zkPoseidonHash, zkVerify]);

  const hasSvgBytes = Boolean(svgText.trim());
  const expectedSvgHash = sharedReceipt?.svgHash ?? embeddedProof?.svgHash ?? "";
  const hasKasIdentity = Boolean(embeddedProof?.authorSig && isKASAuthorSig(embeddedProof.authorSig));
  const identityStatusLabel =
    !hasSvgBytes || !hasKasIdentity
      ? "Not present"
      : identityScanBusy
        ? "Aligning…"
        : identityAttested === true
          ? "Present (Verified)"
          : identityAttested === false
            ? "Not verified"
            : "Alignment required";
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

  const receiveCredId = useMemo(() => (receiveSig ? receiveSig.credId : ""), [receiveSig]);
  const receiveNonce = useMemo(() => (receiveSig ? receiveSig.nonce : ""), [receiveSig]);
  const receiveBundleHash = useMemo(() => (receiveSig?.binds.bundleHash ? receiveSig.binds.bundleHash : bundleHash || ""), [receiveSig, bundleHash]);

  const auditBundleText = useMemo(() => {
    if (!proofCapsule) return "";
    return JSON.stringify(
      {
        hashAlg: PROOF_HASH_ALG,
        canon: PROOF_CANON,
        proofCapsule,
        capsuleHash,
        svgHash,
        bundleHash,
        shareUrl: embeddedProof?.shareUrl ?? null,
        verifierUrl: proofVerifierUrl,
        authorSig: embeddedProof?.authorSig ?? null,
        zkPoseidonHash: zkMeta?.zkPoseidonHash ?? null,
        zkProof: zkMeta?.zkProof ?? null,
        proofHints: zkMeta?.proofHints ?? null,
        zkPublicInputs: zkMeta?.zkPublicInputs ?? null,
      },
      null,
      2,
    );
  }, [proofCapsule, capsuleHash, svgHash, bundleHash, embeddedProof, proofVerifierUrl, zkMeta]);

  const svgPreview = useMemo(() => {
    const raw = svgText.trim();
    if (!raw) return "";
    const lines = raw.split("\n");
    return lines.slice(0, Math.min(lines.length, 8)).join("\n");
  }, [svgText]);

  const verifierPulse = result.status === "ok" ? (result.embedded.pulse ?? (slug.pulse ?? 0)) : slug.pulse ?? 0;
  const verifierSig = result.status === "ok" ? (result.embedded.kaiSignature ?? (slug.shortSig ?? "unknown")) : slug.shortSig ?? "unknown";
  const verifierPhi = result.status === "ok" ? result.derivedPhiKey : "—";
  const verifierChakra = result.status === "ok" ? result.embedded.chakraDay : undefined;

  const shareStatus = result.status === "ok" ? "VERIFIED" : result.status === "error" ? "FAILED" : "STANDBY";
  const sharePhiShort = verifierPhi && verifierPhi !== "—" ? ellipsizeMiddle(verifierPhi, 12, 10) : "—";
  const shareKas = sealKAS === "valid" ? "✅" : "❌";
  const shareG16 = sealZK === "valid" ? "✅" : "❌";

  const receiptJson = useMemo(() => {
    if (!proofCapsule) return "";
    const receipt = {
      hashAlg: PROOF_HASH_ALG,
      canon: PROOF_CANON,
      proofCapsule,
      capsuleHash,
      verifierUrl: proofVerifierUrl || currentVerifyUrl,
    } as const;

    const extended: Record<string, unknown> = { ...receipt };
    if (svgHash) extended.svgHash = svgHash;
    if (bundleHash) extended.bundleHash = bundleHash;
    if (embeddedProof?.shareUrl) extended.shareUrl = embeddedProof.shareUrl;
    if (embeddedProof?.authorSig) extended.authorSig = embeddedProof.authorSig;
    if (embeddedProof?.zkProof) extended.zkProof = embeddedProof.zkProof;
    if (embeddedProof?.proofHints) extended.proofHints = embeddedProof.proofHints;
    if (embeddedProof?.zkPublicInputs) extended.zkPublicInputs = embeddedProof.zkPublicInputs;
    if (zkMeta?.zkPoseidonHash) {
      extended.zkPoseidonHash = zkMeta.zkPoseidonHash;
      extended.zkVerified = Boolean(zkVerify);
      extended.zkScheme = "groth16-poseidon";
    }

    return jcsCanonicalize(extended as Parameters<typeof jcsCanonicalize>[0]);
  }, [bundleHash, capsuleHash, currentVerifyUrl, embeddedProof?.shareUrl, proofCapsule, proofVerifierUrl, svgHash, zkMeta?.zkPoseidonHash, zkVerify]);

  const shareReceiptUrl = useMemo(() => {
    if (!receiptJson) return "";
    const base = proofVerifierUrl || currentVerifyUrl;
    if (!base) return "";
    return buildReceiptShareUrl(base, receiptJson);
  }, [currentVerifyUrl, proofVerifierUrl, receiptJson]);

  const onShareReceipt = useCallback(async () => {
    const url = shareReceiptUrl || proofVerifierUrl || currentVerifyUrl;
    const title = `Proof of Breath™ — ${shareStatus}`;
    const text = `${shareStatus} • Pulse ${verifierPulse} • ΦKey ${sharePhiShort} • KAS ${shareKas} • G16 ${shareG16}`;

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

            <OfficialBadge kind={badge.kind} title={badge.title} subtitle={badge.subtitle} />
          </div>

          <div className="vseals" aria-label="Sovereign seals">
            <SealPill label="KAS" state={sealKAS} detail={embeddedProof?.authorSig ? "Author seal (WebAuthn KAS)" : "No author seal present"} />
            <SealPill label="G16" state={sealZK} detail={zkMeta?.zkPoseidonHash ? "Groth16 + Poseidon rail" : "No ZK rail present"} />
            {result.status === "ok" && displayPhi != null ? (
              <LiveValuePill
                phiValue={displayPhi}
                usdValue={displayUsd}
                label={displayLabel}
                ariaLabel={displayAriaLabel}
              />
            ) : null}
          </div>

          <div className="vkpis" aria-label="Primary identifiers">
            <MiniField label="Pulse" value={kpiPulse} />
            <MiniField label="Φ-Key" value={kpiPhiKey === "—" ? "—" : ellipsizeMiddle(kpiPhiKey, 12, 10)} title={kpiPhiKey} />
          </div>

          {proofCapsule ? (
            <div className="vreceipt-row" aria-label="Proof actions">
              <div className="vreceipt-label">Proof</div>
              <div className="vreceipt-actions">
                <button type="button" className="vbtn vbtn--ghost" onClick={() => void onShareReceipt()}>
                   ➦
                </button>
                <button type="button" className="vbtn vbtn--ghost" onClick={() => void onCopyReceipt()}>
                  💠
                </button>
              </div>
            </div>
          ) : null}
        </div>

      </header>

      {/* Body */}
      <div className="vbody">
        <section className="vpanel" role="tabpanel" aria-label="Active panel">
          {/* Inhale */}
          {panel === "inhale" ? (
            <div className="vcard" data-panel="inhale">
              <div className="vcard-head">
                <div className="vcard-title">Inhale ΦKey</div>
                <div className="vcard-sub">Tap to inhale a sealed ΦKey. Deep payloads open in Expanded Views.</div>
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

                  <div className="vgrid-2 vgrid-2--inhale">
                    {/* Control FIRST on mobile (CSS reorders) */}
                    <div className="vcontrol" aria-label="Inhale controls">
                      <button
                        type="button"
                        className="vdrop"
                        aria-label="Inhale sealed ΦKey (SVG)"
                        title="Inhale sealed ΦKey (.svg)"
                        onClick={() => fileRef.current?.click()}
                      >
                        <span className="vdrop-ic" aria-hidden="true">
                          <img className="vphi-ic" src="/phi.svg" alt="" aria-hidden="true" />
                        </span>
                        <span className="vdrop-txt">Inhale</span>
                        <span className="vdrop-mark" aria-label="PhiKey mark">
                          <img className="vphi" src="/phi.svg" alt="Φ" />
                          <span className="vdrop-mark-txt">ΦKey</span>
                        </span>
                      </button>

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
                          }}
                          disabled={!svgText.trim()}
                        />
                      </div>
                     <div className="vmini-grid vmini-grid--2" aria-label="Attestation status">
                <MiniField label="Identity" value={identityStatusLabel} />
                <MiniField label="Sigil-Glyph" value={artifactStatusLabel} />
              </div>
                      <div className="vmini-grid vmini-grid--2" aria-label="Quick readout">
                        <MiniField label="Inhaled" value={svgText.trim() ? "true" : "false"} />
                        <MiniField label="Attestation" value={embeddedProof ? "present" : "—"} />
                      </div>
                    </div>

                    <div className="vconsole" aria-label="ΦKey preview">
                      <pre className="vpre">
                        <code className="mono">{svgPreview || "inhale a sealed ΦKey (.SVG) to begin…"}</code>
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
                    Drag & drop ΦKey anywhere in this panel
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
                <div className="vcard-sub">vesselHash + sigilHash → bundleHash (offline integrity rail).</div>
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



              {result.status === "ok" && displayPhi != null ? (
                <div className="vmini-grid vmini-grid--2 vvaluation-dashboard" aria-label="Live valuation">
                  <MiniField
                    label={displaySource === "balance" ? "Glyph Φ balance" : displaySource === "embedded" ? "Glyph Φ value" : "Live Φ value"}
                    value={fmtPhi(displayPhi)}
                  />
                  <MiniField
                    label={displaySource === "balance" ? "Glyph USD balance" : displaySource === "embedded" ? "Glyph USD value" : "Live USD value"}
                    value={displayUsd == null ? "—" : fmtUsd(displayUsd)}
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
                  <MiniField label="Author signature" value={embeddedProof?.authorSig ? "present" : "—"} />
                  <MiniField label="Author verified" value={authorSigVerified === null ? "n/a" : authorSigVerified ? "true" : "false"} />
                  <MiniField label="Receive signature" value={receiveSig ? "present" : "—"} />
                  <MiniField label="Receive verified" value={receiveSigVerified === null ? "n/a" : receiveSigVerified ? "true" : "false"} />
                  <MiniField label="sigilHash parity" value={embeddedProof?.svgHash ? String(embeddedProof.svgHash === svgHash) : "n/a"} />
                  <MiniField label="vesselHash parity" value={embeddedProof?.capsuleHash ? String(embeddedProof.capsuleHash === capsuleHash) : "n/a"} />
                  <MiniField label="bundleHash parity" value={embeddedProof?.bundleHash ? String(embeddedProof.bundleHash === bundleHash) : "n/a"} />
                </div>

                <div className="vmini-grid vmini-grid--3" aria-label="Receive signature status">
                  <MiniField
                    label="Receive credId"
                    value={receiveCredId ? ellipsizeMiddle(receiveCredId, 12, 10) : "—"}
                    title={receiveCredId || "—"}
                  />
                </div>

                {receiveSig ? (
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
                      <SealPill label="KAS" state={sealKAS} />
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
          <button type="button" className="vcta" onClick={() => void runVerify()} disabled={busy} title={busy ? "Verifying…" : "Verify"}>
            ⟡ {busy ? "VERIFYING" : "VERIFY"}
          </button>
          <button type="button" className="vcta vcta--ghost" onClick={() => void remember(svgText, "SVG")} disabled={!svgText.trim()} title="💠 Remember">
            💠 REMEMBER
          </button>
        </div>
      </Modal>

      <Modal open={openAuditJson} title="Audit JSON" subtitle="Canonical audit payload (vesselHash + sigilHash → bundleHash)." onClose={() => setOpenAuditJson(false)}>
        <textarea className="vta vta--readonly" readOnly value={auditBundleText || "—"} />
        <div className="vmodal-actions">
          <button type="button" className="vcta" onClick={() => void remember(auditBundleText, "Audit JSON")} disabled={!auditBundleText} title="💠 Remember">
            💠 REMEMBER
          </button>
          <button type="button" className="vcta vcta--ghost" onClick={() => setOpenAuditJson(false)} title="Close">
            CLOSE
          </button>
        </div>
      </Modal>

      <Modal open={openZkProof} title="ZK Proof" subtitle="Full embedded Groth16 proof payload." onClose={() => setOpenZkProof(false)}>
        <textarea className="vta vta--readonly" readOnly value={embeddedZkProof || "—"} />
        <div className="vmodal-actions">
          <button type="button" className="vcta" onClick={() => void remember(embeddedZkProof, "ZK proof")} disabled={!embeddedZkProof} title="💠 Remember">
            💠 REMEMBER
          </button>
          <button type="button" className="vcta vcta--ghost" onClick={() => setOpenZkProof(false)} title="Close">
            CLOSE
          </button>
        </div>
      </Modal>

      <Modal open={openZkInputs} title="ZK Public Inputs" subtitle="Full embedded public inputs payload." onClose={() => setOpenZkInputs(false)}>
        <textarea className="vta vta--readonly" readOnly value={embeddedZkPublicInputs || "—"} />
        <div className="vmodal-actions">
          <button type="button" className="vcta" onClick={() => void remember(embeddedZkPublicInputs, "Public inputs")} disabled={!embeddedZkPublicInputs} title="💠 Remember">
            💠 REMEMBER
          </button>
          <button type="button" className="vcta vcta--ghost" onClick={() => setOpenZkInputs(false)} title="Close">
            CLOSE
          </button>
        </div>
      </Modal>

      <Modal open={openZkHints} title="Proof Hints" subtitle="Explorer/API hints embedded in the bundle." onClose={() => setOpenZkHints(false)}>
        <textarea className="vta vta--readonly" readOnly value={embeddedProofHints || "—"} />
        <div className="vmodal-actions">
          <button type="button" className="vcta" onClick={() => void remember(embeddedProofHints, "Proof hints")} disabled={!embeddedProofHints} title="💠 Remember">
            💠 REMEMBER
          </button>
          <button type="button" className="vcta vcta--ghost" onClick={() => setOpenZkHints(false)} title="Close">
            CLOSE
          </button>
        </div>
      </Modal>
    </div>
  );
}