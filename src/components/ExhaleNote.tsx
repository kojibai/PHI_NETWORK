// src/components/ExhaleNote.tsx
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/**
 * ExhaleNote — Exhale Note Composer
 * v26.2 — GUIDED STEP COMPOSER (same function, premium header + correct flow)
 * - Same valuation/lock/print/save logic
 * - Guided mode is truly step-by-step:
 *   - Answer box is TOP (next to Send Amount)
 *   - Chat shows past Q/A + current question only (no future questions)
 *   - No bottom composer
 * - Premium Atlantean-glass header: one-row crystalline icon pills (mobile-first)
 * - Fix: `disabled` always receives boolean (no `locked` object leaks)
 * - Terminology: UI says “note” (not “bill”)
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import type { ValueSeal } from "../utils/valuation";
import { computeIntrinsicUnsigned } from "../utils/valuation";
import { DEFAULT_ISSUANCE_POLICY, quotePhiForUsd } from "../utils/phi-issuance";

/* ---- modular pieces ---- */
import { NOTE_TITLE } from "./exhale-note/titles";
import { momentFromUTC, epochMsFromPulse, PULSE_MS as KAI_PULSE_MS } from "../utils/kai_pulse";
import { renderPreview } from "./exhale-note/dom";
import { buildBanknoteSVG } from "./exhale-note/banknoteSvg";
import buildProofPagesHTML from "./exhale-note/proofPages";
import { printWithTempTitle, renderIntoPrintRoot } from "./exhale-note/printer";
import { fUsd, fTiny } from "./exhale-note/format";
import { fetchFromVerifierBridge } from "./exhale-note/bridge";
import { svgStringToPngBlob, triggerDownload } from "./exhale-note/svgToPng";
import { insertPngTextChunks } from "../utils/pngChunks";
import { buildVerifierUrl } from "./KaiVoh/verifierProof";
import { derivePhiKeyFromSig } from "./VerifierStamper/sigilUtils";

import type {
  NoteProps,
  BanknoteInputs,
  IntrinsicUnsigned,
  MaybeUnsignedSeal,
  ExhaleNoteRenderPayload,
  NoteSendPayload,
  NoteSendResult,
} from "./exhale-note/types";

/* External stylesheet */
import "./ExhaleNote.css";

/* -----------------------
   Helpers
   ----------------------- */

/**
 * IMPORTANT:
 * In browser builds, setTimeout/setInterval return a number.
 * Never type these as NodeJS.Timeout in React/Vite apps.
 */
type TimerId = number;

function materializeStampedSeal(input: MaybeUnsignedSeal): ValueSeal {
  if (typeof (input as ValueSeal).stamp === "string") return input as ValueSeal;
  return { ...(input as Omit<ValueSeal, "stamp">), stamp: "LOCKED-NO-STAMP" };
}

function fPulse(n: number): string {
  const v = Number.isFinite(n) ? Math.trunc(n) : 0;
  return v.toLocaleString("en-US");
}

/** Create a safe-ish filename for exports */
function makeFileTitle(kaiSig: string, pulse: string, stamp: string): string {
  const serialCore = (kaiSig ? kaiSig.slice(0, 12).toUpperCase() : "SIGIL").replace(/[^0-9A-Z]/g, "Φ");
  const safe = (s: string) =>
    (s || "")
      .replace(/[^\w\-–—\u0394\u03A6\u03C6]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 180);

  return `KAI-${safe(pulse)}-SIGIL-${safe(serialCore)}—VAL-${safe(stamp)}`;
}

function formatPhiParts(val: number): { int: string; frac: string } {
  const s = fTiny(val);
  const [i, f] = s.includes(".") ? s.split(".") : [s, ""];
  return { int: i, frac: f ? `.${f}` : "" };
}

function parsePhiInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, ".").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Number(num.toFixed(6));
}

function generateNonce(): string {
  if (typeof crypto === "undefined" || !("getRandomValues" in crypto)) {
    return `${Date.now()}${Math.random().toString(16).slice(2)}`;
  }
  return crypto.getRandomValues(new Uint32Array(3)).join("");
}

function toScaledPhi18(amountPhi: number): string {
  const safe = Number.isFinite(amountPhi) ? amountPhi : 0;
  return safe.toFixed(18).replace(".", "");
}

/** Wait two animation frames to guarantee paint before print */
function afterTwoFrames(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Verify URL normalizer:
 * - Prefers explicit form.verifyUrl if present; otherwise uses fallbackAbs
 * - Returns ABSOLUTE URL when possible (QR scanners behave best)
 * - Preserves /stream#t=... payloads exactly (hash included)
 */
function resolveVerifyUrl(raw: string | undefined, fallbackAbs: string): string {
  const rawTrim = String(raw ?? "").trim();
  const fbTrim = String(fallbackAbs ?? "").trim();

  const candidate = rawTrim && rawTrim !== "/" ? rawTrim : fbTrim || "/";

  // SSR best effort
  if (typeof window === "undefined") return candidate;

  // If already absolute http(s), keep it
  if (/^https?:\/\//i.test(candidate)) return candidate;

  // If some other absolute scheme (e.g., kai:, phi:, etc.), keep it as-is
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) return candidate;

  try {
    const base = String(window.location.href || "").trim();
    if (base && /^https?:\/\//i.test(base)) {
      return new URL(candidate, base).toString();
    }
  } catch {
    /* ignore */
  }

  return candidate;
}

type NoteProofBundleFields = {
  verifierUrl?: string;
  bundleHash?: string;
  receiptHash?: string;
  verifiedAtPulse?: number;
  capsuleHash?: string;
  svgHash?: string;
  proofCapsule?: {
    pulse?: number;
    kaiSignature?: string;
  };
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function parseProofBundleJson(raw: string | undefined): NoteProofBundleFields {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainRecord(parsed)) return {};
    let proofCapsule: NoteProofBundleFields["proofCapsule"];
    const capsuleRaw = parsed.proofCapsule;
    if (isPlainRecord(capsuleRaw)) {
      const pulse = readOptionalNumber(capsuleRaw.pulse);
      const kaiSignature = readOptionalString(capsuleRaw.kaiSignature);
      if (pulse != null || kaiSignature) proofCapsule = { pulse: pulse ?? undefined, kaiSignature };
    }
    return {
      verifierUrl: readOptionalString(parsed.verifierUrl),
      bundleHash: readOptionalString(parsed.bundleHash),
      receiptHash: readOptionalString(parsed.receiptHash),
      verifiedAtPulse: readOptionalNumber(parsed.verifiedAtPulse),
      capsuleHash: readOptionalString(parsed.capsuleHash),
      svgHash: readOptionalString(parsed.svgHash),
      proofCapsule,
    };
  } catch {
    return {};
  }
}

function buildQrPayload(
  input: {
    verifyUrl?: string;
    proofBundleJson?: string;
    kaiSignature?: string;
    pulse?: number;
    verifiedAtPulse?: number;
  },
  fallbackAbs: string
): string {
  return resolveNoteVerifyUrl(input, fallbackAbs);
}

function resolveNoteVerifyUrl(
  input: {
    verifyUrl?: string;
    proofBundleJson?: string;
    kaiSignature?: string;
    pulse?: number;
    verifiedAtPulse?: number;
  },
  fallbackAbs: string
): string {
  const parsed = parseProofBundleJson(input.proofBundleJson);
  const preferred = parsed.verifierUrl ?? input.verifyUrl;
  const resolved = resolveVerifyUrl(preferred, fallbackAbs);
  const hasSlug = /\/verify\/[^/?#]+/i.test(resolved);
  if (hasSlug) return resolved;

  const pulse = parsed.proofCapsule?.pulse ?? input.pulse;
  const sig = parsed.proofCapsule?.kaiSignature ?? input.kaiSignature;
  const verifiedAtPulse = parsed.verifiedAtPulse ?? input.verifiedAtPulse;
  if (pulse != null && sig) {
    const base = /\/verify\/?$/i.test(resolved) ? resolved : undefined;
    const built = buildVerifierUrl(pulse, sig, base, verifiedAtPulse);
    return resolveVerifyUrl(built, fallbackAbs);
  }

  return resolved;
}

/** Inject preview CSS once so the SVG scales on mobile (kept defensive even if ExhaleNote.css exists). */
function ensurePreviewStylesInjected(): void {
  if (typeof document === "undefined") return;
  const id = "kk-preview-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .kk-note-preview { width: 100%; max-width: 980px; margin: 0 auto; }
    .kk-note-preview svg { display:block; width:100% !important; height:auto !important; }
  `;
  document.head.appendChild(style);
}

/** Inject print CSS overrides so #print-root never shows except in print. */
function ensurePrintStylesInjected(): void {
  if (typeof document === "undefined") return;
  const id = "kk-print-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    #print-root { display: none; }
    @media print {
      html, body { background: #fff !important; }
      #print-root[aria-hidden="false"] { display: block !important; }
      header, nav, .no-print { display: none !important; }
      .print-page { page-break-after: always; position: relative; padding: 24px; }
      .print-page:last-child { page-break-after: auto; }
      @page { size: auto; margin: 14mm; }
      .banknote-frame{ border:none; box-shadow:none; width:182mm; height:auto; aspect-ratio:1000/618; margin:0 auto; }
      .banknote-frame > svg{ width:182mm; height:auto; }
    }
  `;
  document.head.appendChild(style);
}

/** rAF throttle for heavy preview work */
function useRafThrottle(cb: () => void, fps = 8) {
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  }, [cb]);

  const lastRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const limit = 1000 / Math.max(1, fps);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return useCallback(() => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const run = () => {
      lastRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      rafRef.current = null;
      cbRef.current();
    };

    if (now - lastRef.current >= limit) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(run);
    } else if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(run);
    }
  }, [limit]);
}

/* === Valuation stamp (offline parity) === */
type MinimalValuationStamp = {
  algorithm: string;
  policy: string | null | undefined;
  policyChecksum: string;
  valuePhi: number;
  premium?: number | null;
  inputs?: unknown;
  minimalHead: {
    headHash: string | null;
    transfersWindowRoot: string | null;
    cumulativeTransfers: number;
  };
};

function bufToHex(buf: ArrayBuffer): string {
  const v = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < v.length; i++) s += v[i].toString(16).padStart(2, "0");
  return s;
}

/* robust SHA-256 (SubtleCrypto when available, JS fallback otherwise) */
function sha256HexJs(input: string): string {
  function rotr(n: number, x: number) {
    return (x >>> n) | (x << (32 - n));
  }
  function ch(x: number, y: number, z: number) {
    return (x & y) ^ (~x & z);
  }
  function maj(x: number, y: number, z: number) {
    return (x & y) ^ (x & z) ^ (y & z);
  }
  function s0(x: number) {
    return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
  }
  function s1(x: number) {
    return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);
  }
  function S0(x: number) {
    return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  }
  function S1(x: number) {
    return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  }

  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const enc = new TextEncoder().encode(input);
  const l = enc.length;
  const withOne = l + 1;
  const k = withOne % 64 <= 56 ? 56 - (withOne % 64) : 56 + 64 - (withOne % 64);
  const total = withOne + k + 8;
  const m = new Uint8Array(total);
  m.set(enc);
  m[l] = 0x80;

  const bitLen = l * 8;
  for (let i = 0; i < 8; i++) m[total - 1 - i] = (bitLen >>> (i * 8)) & 0xff;

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = (m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3];
    }
    for (let t = 16; t < 64; t++) w[t] = (s1(w[t - 2]) + w[t - 7] + s0(w[t - 15]) + w[t - 16]) >>> 0;

    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;

    for (let t = 0; t < 64; t++) {
      const T1 = (h + S1(e) + ch(e, f, g) + K[t] + w[t]) >>> 0;
      const T2 = (S0(a) + maj(a, b, c)) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + T1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const hx = (x: number) => x.toString(16).padStart(8, "0");
  return hx(h0) + hx(h1) + hx(h2) + hx(h3) + hx(h4) + hx(h5) + hx(h6) + hx(h7);
}

async function sha256HexCanon(s: string): Promise<string> {
  try {
    const cryptoObj: Crypto | undefined =
      (typeof crypto !== "undefined" ? crypto : undefined) ??
      ((globalThis as unknown as { crypto?: Crypto }).crypto);
    if (cryptoObj?.subtle) {
      const data = new TextEncoder().encode(s);
      const digest = await cryptoObj.subtle.digest("SHA-256", data);
      return bufToHex(digest);
    }
  } catch {
    /* fall through */
  }
  return sha256HexJs(s);
}

function safeJsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
  } catch {
    try {
      return JSON.stringify({ error: "unstringifiable", kind: typeof v });
    } catch {
      return '{"error":"unstringifiable"}';
    }
  }
}

function buildMinimalForStamp(u: IntrinsicUnsigned): MinimalValuationStamp {
  type HeadRefLike = {
    headRef?: { headHash?: string | null; transfersWindowRoot?: string | null; cumulativeTransfers?: number };
    policyId?: string | null | undefined;
    inputs?: unknown;
  };
  const like = u as unknown as HeadRefLike;
  return {
    algorithm: u.algorithm,
    policy: like.policyId ?? null,
    policyChecksum: u.policyChecksum,
    valuePhi: u.valuePhi,
    premium: u.premium ?? null,
    inputs: like.inputs,
    minimalHead: {
      headHash: like.headRef?.headHash ?? null,
      transfersWindowRoot: like.headRef?.transfersWindowRoot ?? null,
      cumulativeTransfers: like.headRef?.cumulativeTransfers ?? 0,
    },
  };
}

async function computeValuationStamp(u: IntrinsicUnsigned): Promise<string> {
  const minimal = buildMinimalForStamp(u);
  return sha256HexCanon(`val-stamp:${safeJsonStringify(minimal)}`);
}

/** Exact-ish ms until next pulse boundary using the φ-exact bridge (via epochMsFromPulse). */
function msUntilNextPulseBoundaryLocal(pulseNowInt: number): number {
  try {
    const nextPulseMs = epochMsFromPulse(pulseNowInt + 1);
    const nowMs = BigInt(Date.now());
    const delta = nextPulseMs - nowMs;
    if (delta <= 0n) return 0;
    return Number(delta);
  } catch {
    return Math.max(0, Math.floor(KAI_PULSE_MS));
  }
}

/* -----------------------
   Tiny inline icons (no deps)
   ----------------------- */

type IconProps = { title?: string; className?: string };

function IconSpark({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M12 2l1.6 6.2L20 10l-6.4 1.8L12 18l-1.6-6.2L4 10l6.4-1.8L12 2z"
      />
    </svg>
  );
}

function IconLock({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M17 9h-1V7a4 4 0 10-8 0v2H7a2 2 0 00-2 2v9a2 2 0 002 2h10a2 2 0 002-2v-9a2 2 0 00-2-2zm-7-2a2 2 0 114 0v2h-4V7z"
      />
    </svg>
  );
}

function IconWave({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M3 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-6 5-6 2.5 0 5 0v2c-2.5 0-2.5-6-5-6s-2.5 12-5 12-2.5-6-5-6-2.5 6-5 6V12z"
      />
    </svg>
  );
}

function IconChat({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z"
      />
    </svg>
  );
}

function IconList({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path fill="currentColor" d="M7 6h14v2H7V6zm0 5h14v2H7v-2zm0 5h14v2H7v-2zM3 6h2v2H3V6zm0 5h2v2H3v-2zm0 5h2v2H3v-2z" />
    </svg>
  );
}

function IconShield({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M12 2l8 4v6c0 5-3.4 9.7-8 10-4.6-.3-8-5-8-10V6l8-4z"
      />
    </svg>
  );
}

function IconBack({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path fill="currentColor" d="M14 7l-5 5 5 5V7z" />
    </svg>
  );
}

function IconSend({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path fill="currentColor" d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
    </svg>
  );
}

function IconSkip({ title, className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : "presentation"}>
      {title ? <title>{title}</title> : null}
      <path fill="currentColor" d="M5 5h2v14H5V5zm4 7l10-7v14L9 12z" />
    </svg>
  );
}

/* -----------------------
   Component
   ----------------------- */

const ExhaleNote: React.FC<NoteProps> = ({
  meta,
  usdSample = 100,
  policy = DEFAULT_ISSUANCE_POLICY,
  getNowPulse,
  onRender,
  availablePhi,
  originCanonical,
  onSendNote,
  initial,
  className,
}) => {
  const uid = useId();
  const previewHostRef = useRef<HTMLDivElement>(null);
  const printRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensurePreviewStylesInjected();
    ensurePrintStylesInjected();
  }, []);

  /* Live Kai pulse (integer) + boundary timer */
  const readNowPulseInt = useCallback((): number => {
    const local = momentFromUTC(BigInt(Date.now())).pulse;
    const ext = getNowPulse?.();
    const extOk = typeof ext === "number" && Number.isFinite(ext) && Math.abs(Math.trunc(ext) - Math.trunc(local)) <= 2;
    return Math.trunc(extOk ? (ext as number) : local);
  }, [getNowPulse]);

  const [pulseInt, setPulseInt] = useState<number>(() => readNowPulseInt());
  const timeoutRef = useRef<TimerId | null>(null);
  const lastPulseRef = useRef<number>(pulseInt);

  const armTimers = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const scheduleNext = () => {
      const p0 = readNowPulseInt();
      lastPulseRef.current = p0;
      setPulseInt((prev) => (prev === p0 ? prev : p0));

      const wait = msUntilNextPulseBoundaryLocal(p0);
      timeoutRef.current = window.setTimeout(() => {
        const p1 = readNowPulseInt();
        if (p1 !== lastPulseRef.current) {
          lastPulseRef.current = p1;
          setPulseInt(p1);
        }
        scheduleNext();
      }, Math.max(0, wait));
    };

    scheduleNext();
  }, [readNowPulseInt]);

  useEffect(() => {
    armTimers();
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [armTimers]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document !== "undefined" && !document.hidden) armTimers();
    };
    document.addEventListener("visibilitychange", onVis, { passive: true });
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [armTimers]);

  /**
   * Default verify URL must include the payload:
   * pathname + search + hash (e.g. /stream#t=...)
   */
  const defaultVerifyUrl = useMemo(() => {
    if (typeof window === "undefined") return "/";
    const href = String(window.location.href || "").trim();
    if (href && /^https?:\/\//i.test(href)) return href;

    const origin = window.location.origin;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (origin && origin !== "null") return `${origin}${path || "/"}`;
    return path || "/";
  }, []);

  /* Builder state */
  const [form, setForm] = useState<BanknoteInputs>(() => {
    const base: BanknoteInputs = {
      purpose: "",
      to: "",
      from: "",
      location: "",
      witnesses: "",
      reference: "",
      remark: "In Yahuah We Trust — Secured by Φ, not man-made law",
      valuePhi: "",
      premiumPhi: "",
      computedPulse: "",
      nowPulse: "",
      kaiSignature: "",
      userPhiKey: "",
      sigmaCanon: "",
      shaHex: "",
      phiDerived: "",
      valuationAlg: "",
      valuationStamp: "",
      provenance: [],
      zk: undefined,
      sigilSvg: "",
      verifyUrl: defaultVerifyUrl,
      proofBundleJson: "",
      bundleHash: "",
      receiptHash: "",
      verifiedAtPulse: undefined,
      capsuleHash: "",
      svgHash: "",
      ...(initial ?? {}),
    };

    return {
      ...base,
      verifyUrl: resolveVerifyUrl(base.verifyUrl, defaultVerifyUrl),
    };
  });

  /* Lock state */
  const [locked, setLocked] = useState<ExhaleNoteRenderPayload | null>(null);
  const isLocked = locked !== null;

  const lockedRef = useRef(false);
  const [isRendering, setIsRendering] = useState(false);

  const [sendPhiInput, setSendPhiInput] = useState<string>("");
  const [sendNonce, setSendNonce] = useState<string>("");
  const sendNonceRef = useRef<string>("");

  const sendCommittedRef = useRef(false);
  const [noteSendResult, setNoteSendResult] = useState<NoteSendResult | null>(null);
  const lastSendPhiInputRef = useRef<string>("");

  const u =
    (k: keyof BanknoteInputs) =>
    (v: string): void =>
      setForm((prev) => ({ ...prev, [k]: v }));

  /* Live valuation (derived) */
  const nowFloor = pulseInt;

  const liveUnsigned = useMemo<IntrinsicUnsigned>(() => {
    const { unsigned } = computeIntrinsicUnsigned(meta, nowFloor) as { unsigned: IntrinsicUnsigned };
    return unsigned;
  }, [meta, nowFloor]);

  const liveAlgString = useMemo(() => `${liveUnsigned.algorithm} • ${liveUnsigned.policyChecksum}`, [
    liveUnsigned.algorithm,
    liveUnsigned.policyChecksum,
  ]);

  useEffect(() => {
    setForm((prev) => (prev.valuationAlg ? prev : { ...prev, valuationAlg: liveAlgString }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAlgString]);

  useEffect(() => {
    if (!isLocked) {
      lastSendPhiInputRef.current = sendPhiInput;
      return;
    }
    if (lastSendPhiInputRef.current === sendPhiInput) return;
    lastSendPhiInputRef.current = sendPhiInput;
    if (!sendCommittedRef.current) return;
    sendCommittedRef.current = false;
    setNoteSendResult(null);
    const nextNonce = generateNonce();
    setSendNonce(nextNonce);
    sendNonceRef.current = nextNonce;
  }, [sendPhiInput, isLocked]);

  const liveQuote = useMemo(
    () => quotePhiForUsd({ meta, nowPulse: nowFloor, usd: usdSample, currentStreakDays: 0, lifetimeUsdSoFar: 0 }, policy),
    [meta, nowFloor, usdSample, policy]
  );

  const liveValuePhi = liveUnsigned.valuePhi;
  const livePremium = liveUnsigned.premium ?? 0;
  const usdPerPhi = liveQuote.usdPerPhi;
  const phiPerUsd = liveQuote.phiPerUsd;
  const valueUsdIndicative = liveValuePhi * usdPerPhi;

  const cappedDefaultPhi = useMemo(() => {
    if (!isLocked || !locked) return liveValuePhi;
    if (typeof availablePhi === "number" && Number.isFinite(availablePhi)) {
      return Math.max(0, Math.min(locked.valuePhi, availablePhi));
    }
    return locked.valuePhi;
  }, [isLocked, locked, liveValuePhi, availablePhi]);

  const defaultSendPhi = isLocked ? cappedDefaultPhi : liveValuePhi;
  const parsedSendPhi = isLocked ? parsePhiInput(sendPhiInput) : null;
  const effectiveSendPhi = isLocked ? parsedSendPhi ?? defaultSendPhi : defaultSendPhi;

  const effectiveUsdPerPhi = isLocked && locked ? locked.usdPerPhi : usdPerPhi;
  const effectiveValueUsd = effectiveSendPhi * effectiveUsdPerPhi;

  const sendPhiOverBalance =
    typeof availablePhi === "number" && Number.isFinite(availablePhi) && effectiveSendPhi > availablePhi + 1e-9;

  /* Build SVG for preview */
  const buildCurrentSVG = useCallback((): string => {
    const usingLocked = isLocked && locked !== null;

    const valuePhiStr = usingLocked ? fTiny(effectiveSendPhi) : fTiny(liveValuePhi);
    const valueUsdStr = usingLocked ? fUsd(effectiveValueUsd) : fUsd(valueUsdIndicative);
    const premiumPhiStr = usingLocked ? fTiny(effectiveSendPhi) : fTiny(livePremium);

    const lockedPulseStr = usingLocked ? String(locked.lockedPulse) : "";
    const valuationStampStr = usingLocked ? form.valuationStamp || locked.seal.stamp : "";

    const verifyUrl = resolveNoteVerifyUrl(
      {
        verifyUrl: form.verifyUrl,
        proofBundleJson: form.proofBundleJson,
        kaiSignature: form.kaiSignature,
        pulse: usingLocked ? locked.lockedPulse : Number(form.computedPulse || nowFloor),
        verifiedAtPulse: form.verifiedAtPulse,
      },
      defaultVerifyUrl
    );

    const qrPayload = buildQrPayload(
      {
        verifyUrl: form.verifyUrl,
        proofBundleJson: form.proofBundleJson,
        kaiSignature: form.kaiSignature,
        pulse: usingLocked ? locked.lockedPulse : Number(form.computedPulse || nowFloor),
        verifiedAtPulse: form.verifiedAtPulse,
      },
      defaultVerifyUrl
    );

    return buildBanknoteSVG({
      purpose: form.purpose,
      to: form.to,
      from: form.from,
      location: form.location,
      witnesses: form.witnesses,
      reference: form.reference,
      remark: form.remark,

      valuePhi: valuePhiStr,
      valueUsd: valueUsdStr,
      premiumPhi: premiumPhiStr,

      computedPulse: lockedPulseStr,
      nowPulse: String(nowFloor),

      kaiSignature: form.kaiSignature || "",
      userPhiKey: form.userPhiKey || "",
      valuationAlg: form.valuationAlg || liveAlgString,
      valuationStamp: valuationStampStr,

      sigilSvg: form.sigilSvg || "",
      verifyUrl,
      qrPayload,
      provenance: form.provenance ?? [],
    });
  }, [
    form,
    isLocked,
    locked,
    liveValuePhi,
    livePremium,
    valueUsdIndicative,
    nowFloor,
    liveAlgString,
    defaultVerifyUrl,
    effectiveSendPhi,
    effectiveValueUsd,
  ]);

  const renderPreviewThrottled = useRafThrottle(() => {
    const host = previewHostRef.current;
    if (!host) return;
    try {
      renderPreview(host, buildCurrentSVG());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("preview render failed", e);
    }
  }, 8);

  useEffect(() => {
    renderPreviewThrottled();
  }, [renderPreviewThrottled, buildCurrentSVG]);

  /* Single final Render (locks pulse + valuation) */
  const handleRenderLock = useCallback(async () => {
    if (lockedRef.current || isRendering) return;
    setIsRendering(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const lockedPulse = nowFloor;
      const { unsigned: lockedUnsigned } = computeIntrinsicUnsigned(meta, lockedPulse) as { unsigned: IntrinsicUnsigned };

      const valuationStamp = await computeValuationStamp(lockedUnsigned);

      const quote = quotePhiForUsd({ meta, nowPulse: lockedPulse, usd: usdSample, currentStreakDays: 0, lifetimeUsdSoFar: 0 }, policy);

      const sealedBase: ValueSeal = materializeStampedSeal(lockedUnsigned as unknown as MaybeUnsignedSeal);
      const sealed: ValueSeal = { ...sealedBase, stamp: valuationStamp };

      const payload: ExhaleNoteRenderPayload = {
        lockedPulse,
        seal: sealed,
        usdPerPhi: quote.usdPerPhi,
        phiPerUsd: quote.phiPerUsd,
        valuePhi: sealed.valuePhi,
        valueUsdIndicative: sealed.valuePhi * quote.usdPerPhi,
        quote,
      };

      // Freeze LIVE timer (note is now pulse-locked)
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      lockedRef.current = true;
      setLocked(payload);

      const cap = typeof availablePhi === "number" && Number.isFinite(availablePhi) ? availablePhi : sealed.valuePhi;
      setSendPhiInput(fTiny(Math.max(0, Math.min(sealed.valuePhi, cap))));

      {
        const nextNonce = generateNonce();
        setSendNonce(nextNonce);
        sendNonceRef.current = nextNonce;
      }

      sendCommittedRef.current = false;
      setNoteSendResult(null);

      const proofFields = parseProofBundleJson(form.proofBundleJson);
      const sigmaCanon = (form.sigmaCanon || form.kaiSignature || "").trim();
      const shaHex = sigmaCanon ? sha256HexJs(sigmaCanon) : "";

      let phiDerived = form.phiDerived?.trim() || "";
      if (!phiDerived && sigmaCanon) {
        try {
          phiDerived = await derivePhiKeyFromSig(sigmaCanon);
        } catch {
          phiDerived = "";
        }
      }

      setForm((prev) => ({
        ...prev,
        computedPulse: String(lockedPulse),
        nowPulse: String(lockedPulse),
        valuationStamp,
        premiumPhi: lockedUnsigned.premium !== undefined ? fTiny(lockedUnsigned.premium) : prev.premiumPhi,
        valuationAlg: prev.valuationAlg || `${lockedUnsigned.algorithm} • ${lockedUnsigned.policyChecksum}`,
        valuePhi: fTiny(sealed.valuePhi),
        sigmaCanon: sigmaCanon || prev.sigmaCanon,
        shaHex: shaHex || prev.shaHex,
        phiDerived: phiDerived || prev.phiDerived,
        verifiedAtPulse: prev.verifiedAtPulse ?? proofFields.verifiedAtPulse ?? lockedPulse,
        receiptHash: prev.receiptHash || proofFields.receiptHash || "",
        verifyUrl: resolveVerifyUrl(prev.verifyUrl, defaultVerifyUrl),
      }));

      onRender?.(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Render/Lock failed", err);
      window.alert(`Render failed.\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRendering(false);
    }
  }, [nowFloor, meta, usdSample, policy, onRender, isRendering, defaultVerifyUrl, availablePhi, form]);

  /* Bridge hydration + updates */
  const lastBridgeJsonRef = useRef<string>("");

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const payload = await fetchFromVerifierBridge();
        if (!active || !payload) return;

        const merged = {
          ...payload,
          verifyUrl: payload.verifyUrl ? resolveVerifyUrl(payload.verifyUrl, defaultVerifyUrl) : undefined,
        };

        setForm((prev) => ({
          ...prev,
          ...merged,
          verifyUrl: resolveVerifyUrl(merged.verifyUrl ?? prev.verifyUrl, defaultVerifyUrl),
        }));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("bridge hydration failed", e);
      }
    })();

    const onEvt: EventListener = (evt: Event) => {
      try {
        const detail = (evt as CustomEvent<BanknoteInputs>).detail;
        if (!detail) return;

        const normalizeIncoming = (obj: Partial<BanknoteInputs>) => {
          if (typeof obj.verifyUrl === "string") obj.verifyUrl = resolveVerifyUrl(obj.verifyUrl, defaultVerifyUrl);
          return obj;
        };

        if (lockedRef.current) {
          const allow: Array<keyof BanknoteInputs> = [
            "kaiSignature",
            "userPhiKey",
            "sigmaCanon",
            "shaHex",
            "phiDerived",
            "zk",
            "provenance",
            "sigilSvg",
            "verifyUrl",
            "proofBundleJson",
            "bundleHash",
            "receiptHash",
            "verifiedAtPulse",
            "capsuleHash",
            "svgHash",
          ];

          const safe = normalizeIncoming(
            Object.fromEntries(Object.entries(detail).filter(([k]) => allow.includes(k as keyof BanknoteInputs))) as Partial<BanknoteInputs>
          );

          const json = JSON.stringify(safe);
          if (json === lastBridgeJsonRef.current) return;
          lastBridgeJsonRef.current = json;

          setForm((prev) => ({ ...prev, ...safe }));
          return;
        }

        const normalized = normalizeIncoming({ ...detail });

        const json = JSON.stringify(normalized);
        if (json === lastBridgeJsonRef.current) return;
        lastBridgeJsonRef.current = json;

        setForm((prev) => ({ ...prev, ...normalized }));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("bridge event failed", err);
      }
    };

    window.addEventListener("kk:note-data", onEvt, { passive: true });
    return () => {
      active = false;
      window.removeEventListener("kk:note-data", onEvt);
    };
  }, [defaultVerifyUrl]);

  const resolveSendNonce = useCallback((): string => {
    if (sendNonceRef.current) return sendNonceRef.current;
    const next = sendNonce || generateNonce();
    sendNonceRef.current = next;
    if (sendNonce !== next) setSendNonce(next);
    return next;
  }, [sendNonce]);

  const buildNoteSendPayload = useCallback((): NoteSendPayload | null => {
    if (!locked) return null;
    const amountPhi = effectiveSendPhi;
    if (!Number.isFinite(amountPhi) || amountPhi <= 0) return null;

    const verifyUrl = resolveNoteVerifyUrl(
      {
        verifyUrl: form.verifyUrl,
        proofBundleJson: form.proofBundleJson,
        kaiSignature: form.kaiSignature,
        pulse: locked.lockedPulse,
        verifiedAtPulse: form.verifiedAtPulse,
      },
      defaultVerifyUrl
    );

    const transferNonce = resolveSendNonce();
    const merged: Partial<NoteSendPayload> = noteSendResult ?? {};
    return {
      ...merged,
      amountPhi,
      amountPhiScaled: toScaledPhi18(amountPhi),
      amountUsd: amountPhi * effectiveUsdPerPhi,
      lockedPulse: locked.lockedPulse,
      valuationStamp: form.valuationStamp || locked.seal.stamp || "",
      transferNonce,
      verifyUrl,
      parentCanonical: originCanonical ?? merged.parentCanonical,
    };
  }, [
    locked,
    effectiveSendPhi,
    effectiveUsdPerPhi,
    form.verifyUrl,
    form.proofBundleJson,
    form.kaiSignature,
    form.verifiedAtPulse,
    form.valuationStamp,
    defaultVerifyUrl,
    originCanonical,
    resolveSendNonce,
    noteSendResult,
  ]);

  const ensureNoteSend = useCallback(async (): Promise<boolean> => {
    if (!locked) return false;
    if (sendCommittedRef.current) return true;
    if (sendPhiOverBalance) {
      window.alert("Send amount exceeds the available Φ balance.");
      return false;
    }
    const payload = buildNoteSendPayload();
    if (!payload) {
      window.alert("Enter a valid Φ amount to send.");
      return false;
    }
    try {
      const result = await onSendNote?.(payload);
      if (result) setNoteSendResult(result);
      sendCommittedRef.current = true;
      return true;
    } catch (err) {
      window.alert(`Send failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, [locked, sendPhiOverBalance, buildNoteSendPayload, onSendNote]);

  /* Print + exports (require lock) */
  const onPrint = useCallback(async () => {
    const root = printRootRef.current;
    if (!root) return;
    if (!lockedRef.current || !locked) {
      window.alert("Render to lock the note valuation before printing.");
      return;
    }
    if (!(await ensureNoteSend())) return;

    const verifyUrl = resolveNoteVerifyUrl(
      { verifyUrl: form.verifyUrl, proofBundleJson: form.proofBundleJson, kaiSignature: form.kaiSignature, pulse: locked.lockedPulse, verifiedAtPulse: form.verifiedAtPulse },
      defaultVerifyUrl
    );

    const qrPayload = buildQrPayload(
      { verifyUrl: form.verifyUrl, proofBundleJson: form.proofBundleJson, kaiSignature: form.kaiSignature, pulse: locked.lockedPulse, verifiedAtPulse: form.verifiedAtPulse },
      defaultVerifyUrl
    );

    const banknote = buildBanknoteSVG({
      ...form,
      valuePhi: fTiny(effectiveSendPhi),
      valueUsd: fUsd(effectiveValueUsd),
      premiumPhi: fTiny(effectiveSendPhi),
      computedPulse: String(locked.lockedPulse),
      nowPulse: String(locked.lockedPulse),
      kaiSignature: form.kaiSignature || "",
      userPhiKey: form.userPhiKey || "",
      valuationAlg: form.valuationAlg || liveAlgString,
      valuationStamp: form.valuationStamp || locked.seal.stamp,
      sigilSvg: form.sigilSvg || "",
      verifyUrl,
      qrPayload,
      provenance: form.provenance ?? [],
    });

    const noteSendPayload = buildNoteSendPayload();
    const noteSendJson = noteSendPayload ? JSON.stringify(noteSendPayload) : "";

    const proofPages = buildProofPagesHTML({
      frozenPulse: String(locked.lockedPulse),
      kaiSignature: form.kaiSignature || "",
      userPhiKey: form.userPhiKey || "",
      sigmaCanon: form.sigmaCanon || "",
      shaHex: form.shaHex || "",
      phiDerived: form.phiDerived || "",
      valuePhi: fTiny(effectiveSendPhi),
      valueUsd: fUsd(effectiveValueUsd),
      premiumPhi: fTiny(effectiveSendPhi),
      valuationAlg: form.valuationAlg || liveAlgString,
      valuationStamp: form.valuationStamp || locked.seal.stamp,
      zk: form.zk,
      provenance: form.provenance ?? [],
      sigilSvg: form.sigilSvg || "",
      verifyUrl,
      noteSendJson,
      proofBundleJson: form.proofBundleJson,
      bundleHash: form.bundleHash,
      receiptHash: form.receiptHash,
      verifiedAtPulse: form.verifiedAtPulse,
      capsuleHash: form.capsuleHash,
      svgHash: form.svgHash,
    });

    renderIntoPrintRoot(root, banknote, String(locked.lockedPulse), proofPages);
    root.setAttribute("aria-hidden", "false");
    await afterTwoFrames();

    const title = `☤KAI ${fPulse(locked.lockedPulse)} — ${NOTE_TITLE}`;
    await printWithTempTitle(title);

    root.setAttribute("aria-hidden", "true");
  }, [form, locked, liveAlgString, defaultVerifyUrl, effectiveSendPhi, effectiveValueUsd, ensureNoteSend, buildNoteSendPayload]);

  const onSaveSvg = useCallback(async () => {
    try {
      if (!lockedRef.current || !locked) {
        window.alert("Render to lock the note valuation before saving SVG.");
        return;
      }
      if (!(await ensureNoteSend())) return;

      const verifyUrl = resolveNoteVerifyUrl(
        { verifyUrl: form.verifyUrl, proofBundleJson: form.proofBundleJson, kaiSignature: form.kaiSignature, pulse: locked.lockedPulse, verifiedAtPulse: form.verifiedAtPulse },
        defaultVerifyUrl
      );

      const qrPayload = buildQrPayload(
        { verifyUrl: form.verifyUrl, proofBundleJson: form.proofBundleJson, kaiSignature: form.kaiSignature, pulse: locked.lockedPulse, verifiedAtPulse: form.verifiedAtPulse },
        defaultVerifyUrl
      );

      const banknote = buildBanknoteSVG({
        ...form,
        valuePhi: fTiny(effectiveSendPhi),
        valueUsd: fUsd(effectiveValueUsd),
        premiumPhi: fTiny(effectiveSendPhi),
        computedPulse: String(locked.lockedPulse),
        nowPulse: String(locked.lockedPulse),
        kaiSignature: form.kaiSignature || "",
        userPhiKey: form.userPhiKey || "",
        valuationAlg: form.valuationAlg || liveAlgString,
        valuationStamp: form.valuationStamp || locked.seal.stamp,
        sigilSvg: form.sigilSvg || "",
        verifyUrl,
        qrPayload,
        provenance: form.provenance ?? [],
      });

      const title = makeFileTitle(form.kaiSignature || "", String(locked.lockedPulse), form.valuationStamp || locked.seal.stamp || "");
      triggerDownload(`${title}.svg`, new Blob([banknote], { type: "image/svg+xml" }), "image/svg+xml");
    } catch (err) {
      window.alert("Save SVG failed: " + (err instanceof Error ? err.message : String(err)));
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, [form, locked, liveAlgString, defaultVerifyUrl, effectiveSendPhi, effectiveValueUsd, ensureNoteSend]);

  const onSavePng = useCallback(async () => {
    try {
      if (!lockedRef.current || !locked) {
        window.alert("Render to lock the note valuation before saving PNG.");
        return;
      }
      if (!(await ensureNoteSend())) return;

      const verifyUrl = resolveNoteVerifyUrl(
        { verifyUrl: form.verifyUrl, proofBundleJson: form.proofBundleJson, kaiSignature: form.kaiSignature, pulse: locked.lockedPulse, verifiedAtPulse: form.verifiedAtPulse },
        defaultVerifyUrl
      );

      const qrPayload = buildQrPayload(
        { verifyUrl: form.verifyUrl, proofBundleJson: form.proofBundleJson, kaiSignature: form.kaiSignature, pulse: locked.lockedPulse, verifiedAtPulse: form.verifiedAtPulse },
        defaultVerifyUrl
      );

      const banknote = buildBanknoteSVG({
        ...form,
        valuePhi: fTiny(effectiveSendPhi),
        valueUsd: fUsd(effectiveValueUsd),
        premiumPhi: fTiny(effectiveSendPhi),
        computedPulse: String(locked.lockedPulse),
        nowPulse: String(locked.lockedPulse),
        kaiSignature: form.kaiSignature || "",
        userPhiKey: form.userPhiKey || "",
        valuationAlg: form.valuationAlg || liveAlgString,
        valuationStamp: form.valuationStamp || locked.seal.stamp,
        sigilSvg: form.sigilSvg || "",
        verifyUrl,
        qrPayload,
        provenance: form.provenance ?? [],
      });

      const png = await svgStringToPngBlob(banknote, 2400);

      const proofBundleJson = form.proofBundleJson?.trim() || "";
      const proofFields = parseProofBundleJson(proofBundleJson);
      const bundleHash = form.bundleHash || proofFields.bundleHash;
      const receiptHash = form.receiptHash || proofFields.receiptHash;

      const title = makeFileTitle(form.kaiSignature || "", String(locked.lockedPulse), form.valuationStamp || locked.seal.stamp || "");
      const noteSendPayload = buildNoteSendPayload();
      const noteSendJson = noteSendPayload ? JSON.stringify(noteSendPayload) : "";

      const entries = [
        proofBundleJson ? { keyword: "phi_proof_bundle", text: proofBundleJson } : null,
        bundleHash ? { keyword: "phi_bundle_hash", text: bundleHash } : null,
        receiptHash ? { keyword: "phi_receipt_hash", text: receiptHash } : null,
        noteSendJson ? { keyword: "phi_note_send", text: noteSendJson } : null,
        { keyword: "phi_note_svg", text: banknote },
      ].filter((entry): entry is { keyword: string; text: string } => Boolean(entry));

      if (entries.length === 0) {
        triggerDownload(`${title}.png`, png, "image/png");
        return;
      }

      const bytes = new Uint8Array(await png.arrayBuffer());
      const enriched = insertPngTextChunks(bytes, entries);
      const finalBlob = new Blob([enriched as BlobPart], { type: "image/png" });
      triggerDownload(`${title}.png`, finalBlob, "image/png");
    } catch (err) {
      window.alert("Save PNG failed: " + (err instanceof Error ? err.message : String(err)));
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, [form, locked, liveAlgString, defaultVerifyUrl, effectiveSendPhi, effectiveValueUsd, ensureNoteSend, buildNoteSendPayload]);

  /* Derived display values */
  const displayPulse = isLocked && locked ? locked.lockedPulse : nowFloor;
  const displayPhi = isLocked ? effectiveSendPhi : liveValuePhi;
  const displayUsd = isLocked ? effectiveValueUsd : valueUsdIndicative;
  const displayUsdPerPhi = isLocked && locked ? locked.usdPerPhi : usdPerPhi;
  const displayPhiPerUsd = isLocked && locked ? locked.phiPerUsd : phiPerUsd;
  const displayPremium = isLocked ? effectiveSendPhi : livePremium;
  const phiParts = formatPhiParts(displayPhi);

  const noteTitle = useMemo(() => `☤KAI ${fPulse(displayPulse)}`, [displayPulse]);

  /* ────────────────────────────────────────────────────────────────────────────
     Guided Step Composer
     ──────────────────────────────────────────────────────────────────────────── */

  type UiMode = "guide" | "form";
  type GuideFieldKey = "to" | "from" | "purpose" | "location" | "witnesses" | "reference" | "remark";
  type GuideStep = {
    key: GuideFieldKey;
    label: string;
    prompt: string;
    placeholder: string;
    optional?: boolean;
    suggestions?: readonly string[];
  };

  const guideSteps = useMemo<readonly GuideStep[]>(
    () => [
      { key: "to", label: "To", prompt: "Who is this note going to?", placeholder: "Name / handle / organization" },
      { key: "from", label: "From", prompt: "Who is issuing it?", placeholder: "Your name / handle / organization" },
      {
        key: "purpose",
        label: "Purpose",
        prompt: "What is this note for?",
        placeholder: "Work, gift, exchange, settlement…",
        suggestions: ["work", "gift", "exchange", "settlement", "service", "receipt"],
      },
      { key: "location", label: "Location", prompt: "Where was it issued? (optional)", placeholder: "City / place", optional: true },
      { key: "witnesses", label: "Witnesses", prompt: "Any witnesses? (optional)", placeholder: "Names / handles", optional: true },
      { key: "reference", label: "Reference", prompt: "Any reference? (optional)", placeholder: "Invoice, order id, message id…", optional: true },
      { key: "remark", label: "Remark", prompt: "Final remark (optional)", placeholder: "Short line that prints on the note", optional: true },
    ],
    []
  );

  const [uiMode, setUiMode] = useState<UiMode>("guide");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [guideIdx, setGuideIdx] = useState<number>(0);
  const [draft, setDraft] = useState<string>("");

  const composerRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentGuide = guideSteps[Math.max(0, Math.min(guideIdx, guideSteps.length - 1))];
  const guideKey = currentGuide.key;

  const breathStyle = useMemo(() => {
    return ({ ["--kk-breath-ms"]: `${Math.max(500, Math.floor(KAI_PULSE_MS))}ms` } as unknown) as CSSProperties;
  }, []);

  const setGuideField = useCallback((key: GuideFieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const askedMaxIdx = useMemo(() => Math.max(0, Math.min(guideIdx, guideSteps.length - 1)), [guideIdx, guideSteps.length]);

  const jumpTo = useCallback(
    (idx: number) => {
      if (isLocked) return;
      const safe = Math.max(0, Math.min(idx, askedMaxIdx));
      setGuideIdx(safe);
    },
    [isLocked, askedMaxIdx]
  );

  useEffect(() => {
    if (uiMode !== "guide") return;
    if (isLocked) return;
    setDraft((form[guideKey] ?? "").toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMode, guideKey, isLocked]);

  useEffect(() => {
    if (uiMode !== "guide") return;
    if (isLocked) return;
    composerRef.current?.focus({ preventScroll: true });
  }, [uiMode, guideIdx, isLocked]);

  useEffect(() => {
    if (uiMode !== "guide") return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [uiMode, guideIdx, isLocked]);

  const answeredCount = useMemo(() => {
    let n = 0;
    for (const s of guideSteps) if ((form[s.key] ?? "").trim()) n += 1;
    return n;
  }, [form, guideSteps]);

  type TranscriptItem =
    | { id: string; side: "sys"; text: string; stepIdx?: number }
    | { id: string; side: "you"; text: string; stepIdx?: number };

  const transcript = useMemo<readonly TranscriptItem[]>(() => {
    const items: TranscriptItem[] = [];

    items.push({
      id: "intro",
      side: "sys",
      text: "Step mode: past answers stay visible. Only the current question is open.",
    });

    // Only show questions up to the current step (no future).
    for (let i = 0; i <= askedMaxIdx; i++) {
      const step = guideSteps[i];
      items.push({ id: `q:${step.key}`, side: "sys", text: step.prompt, stepIdx: i });

      const val = (form[step.key] ?? "").trim();

      // Only show answers for steps strictly before the current guideIdx.
      if (i < guideIdx) {
        if (val) items.push({ id: `a:${step.key}`, side: "you", text: val, stepIdx: i });
        else if (step.optional) items.push({ id: `a:${step.key}:empty`, side: "you", text: "—", stepIdx: i });
      }
    }

    if (!isLocked) {
      items.push({ id: "hint", side: "sys", text: "Answer above. Render locks the note valuation at the current Kai pulse." });
    } else if (locked) {
      items.push({
        id: "lockedhint",
        side: "sys",
        text: `Locked at ☤KAI ${fPulse(locked.lockedPulse)}. Send Amount is the only editable value now.`,
      });
    }

    return items;
  }, [guideSteps, form, guideIdx, askedMaxIdx, isLocked, locked]);

  const commitGuide = useCallback(() => {
    if (isLocked) return;

    const text = draft.trim();
    if (!text && !currentGuide.optional) return;

    setGuideField(guideKey, text);
    setDraft("");
    setGuideIdx((prev) => Math.min(prev + 1, guideSteps.length - 1));
  }, [isLocked, draft, currentGuide.optional, guideKey, guideSteps.length, setGuideField]);

  const skipGuide = useCallback(() => {
    if (isLocked) return;
    if (!currentGuide.optional) return;

    setGuideField(guideKey, "");
    setDraft("");
    setGuideIdx((prev) => Math.min(prev + 1, guideSteps.length - 1));
  }, [isLocked, currentGuide.optional, guideKey, guideSteps.length, setGuideField]);

  const backGuide = useCallback(() => {
    if (isLocked) return;
    setDraft("");
    setGuideIdx((prev) => Math.max(0, prev - 1));
  }, [isLocked]);

  const quickFill = useCallback(
    (val: string) => {
      if (isLocked) return;
      const v = val.trim();
      if (!v && !currentGuide.optional) return;
      setGuideField(guideKey, v);
      setDraft("");
      setGuideIdx((prev) => Math.min(prev + 1, guideSteps.length - 1));
    },
    [isLocked, currentGuide.optional, guideKey, guideSteps.length, setGuideField]
  );

  /* UI */
  return (
    <div data-kk-scope={uid} className={`kk-note kk-note--guide ${className ?? ""}`} style={breathStyle}>
      {/* ─────────────────────────────────────────────────────────────
          PREMIUM ONE-ROW HEADER (Atlantean glass icon pills)
         ───────────────────────────────────────────────────────────── */}
      <div className="kk-headbar" role="region" aria-label="note header">
        <div className="kk-headbar__left">
          <div className="kk-pill kk-pill--brand" title="Exhale Note">
            <span className="kk-brandMark" aria-hidden="true">
              Φ
            </span>
          </div>

          <div className={`kk-pill kk-pill--state ${isLocked ? "is-locked" : "is-live"}`} title={isLocked ? "Locked" : "Live"}>
            {isLocked ? <IconLock /> : <IconSpark />}
          </div>

          <div className="kk-pill kk-pill--pulse" title="Kai pulse">
            <IconWave />
            <span className="kk-mono">{fPulse(displayPulse)}</span>
          </div>

          <div className="kk-pill kk-pill--value" title="Value (Φ)">
            <span className="kk-pillPhi" aria-hidden="true">
              Φ
            </span>
            <span className="kk-mono">{fTiny(displayPhi)}</span>
          </div>

          <div className="kk-pill kk-pill--usd" title="Indicative USD">
            <span className="kk-mono">{fUsd(displayUsd)}</span>
          </div>

          <div className="kk-pill kk-pill--progress" title="Step progress">
            <span className="kk-mono">
              {answeredCount}/{guideSteps.length}
            </span>
          </div>
        </div>

        <div className="kk-headbar__right">
          <div className="kk-pill kk-pill--mode" role="group" aria-label="mode">
            <button
              type="button"
              className={`kk-iconBtn ${uiMode === "guide" ? "is-on" : ""}`}
              onClick={() => setUiMode("guide")}
              aria-pressed={uiMode === "guide"}
              title="Guided"
            >
              <IconChat />
            </button>
            <button
              type="button"
              className={`kk-iconBtn ${uiMode === "form" ? "is-on" : ""}`}
              onClick={() => setUiMode("form")}
              aria-pressed={uiMode === "form"}
              title="Form"
            >
              <IconList />
            </button>
          </div>

          <button
            type="button"
            className={`kk-pill kk-pill--shield ${showAdvanced ? "is-on" : ""}`}
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            title={showAdvanced ? "Hide proof panel" : "Show proof panel"}
          >
            <IconShield />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          HERO: value, lock, actions
         ───────────────────────────────────────────────────────────── */}
      <section className={`kk-hero2 ${isLocked ? "is-locked" : "is-live"}`} aria-label="valuation">
        <div className="kk-hero2__row">
          <div className="kk-hero2__value">
            <div className="kk-hero2__status">
              <span className={`kk-chip2 ${isLocked ? "chip-locked" : "chip-live"}`} title={isLocked ? "Locked" : "Live"}>
                {isLocked ? <IconLock /> : <IconSpark />}
              </span>
              <span className="kk-chip2 kk-chip2--pulse" title="Kai pulse">
                <IconWave />
                <span className="kk-mono">{fPulse(displayPulse)}</span>
              </span>
              <span className="kk-chip2" title="USD per Φ">
                <span className="kk-mono">{fTiny(displayUsdPerPhi)}</span>
              </span>
              <span className="kk-chip2" title="Φ per USD">
                <span className="kk-mono">{fTiny(displayPhiPerUsd)}</span>
              </span>
            </div>

            <div className="kk-hero2__big">
              <div className="kk-big__label">VALUE</div>
              <div className="kk-big__num" aria-label="value in phi">
                <span className="kk-big__phi">Φ</span>
                <span className="kk-big__int">{phiParts.int}</span>
                <span className="kk-big__frac">{phiParts.frac}</span>
              </div>
              <div className="kk-big__usd">≈ {fUsd(displayUsd)}</div>
            </div>
          </div>

          <div className="kk-hero2__actions">
            {!isLocked ? (
              <button
                className="kk-btn kk-btn-primary kk-btn-xl"
                onClick={handleRenderLock}
                disabled={isRendering}
                title="Lock valuation at the current Kai pulse"
              >
                {isRendering ? "Rendering…" : "Render — Lock Note"}
              </button>
            ) : (
              <div className="kk-lockcard" role="status" aria-live="polite">
                <div className="kk-lockcard__t">Locked</div>
                <div className="kk-lockcard__s">
                  ☤KAI <span className="kk-mono">{locked ? fPulse(locked.lockedPulse) : fPulse(displayPulse)}</span> · stamp{" "}
                  <span className="kk-mono">{form.valuationStamp || locked?.seal.stamp || "—"}</span>
                </div>
              </div>
            )}

            <div className="kk-hero2__cta">
              <button className="kk-btn" onClick={onPrint} disabled={!isLocked} title="Print / Save PDF">
                Print / PDF
              </button>
              <button className="kk-btn kk-btn-ghost" onClick={onSaveSvg} disabled={!isLocked} title="Save SVG">
                Save SVG
              </button>
              <button className="kk-btn kk-btn-ghost" onClick={onSavePng} disabled={!isLocked} title="Save PNG">
                Save PNG
              </button>
            </div>
          </div>
        </div>

        {/* TOP ANSWER BOX + SEND AMOUNT (side-by-side) */}
        <div className={`kk-dualbar ${uiMode === "guide" ? "is-guide" : ""}`} aria-label="answer and amount">
          {uiMode === "guide" ? (
            <div className="kk-qaCard" aria-label="current step">
              <div className="kk-qaHead">
                <div className="kk-qaMeta" title="Step">
                  <IconSpark />
                  <span className="kk-mono">
                    {isLocked ? "LOCKED" : `${guideIdx + 1}/${guideSteps.length}`}
                  </span>
                </div>
                <div className="kk-qaTag" title="Field">
                  {currentGuide.label}
                </div>
              </div>

              <div className="kk-qaPrompt">
                {isLocked ? "Locked — only Send Amount can change." : currentGuide.prompt}
              </div>

              <div className="kk-qaRow">
                <input
                  ref={composerRef}
                  className="kk-qaInput"
                  value={isLocked ? "" : draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={isLocked ? "Locked" : currentGuide.placeholder}
                  disabled={isLocked}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitGuide();
                    }
                  }}
                />

                <div className="kk-qaBtns" aria-label="step controls">
                  <button
                    type="button"
                    className="kk-btn kk-btn-ghost kk-iconOnly"
                    onClick={backGuide}
                    disabled={guideIdx <= 0 || isLocked}
                    title="Back"
                    aria-label="Back"
                  >
                    <IconBack />
                  </button>

                  {currentGuide.optional ? (
                    <button
                      type="button"
                      className="kk-btn kk-btn-ghost kk-iconOnly"
                      onClick={skipGuide}
                      disabled={isLocked}
                      title="Skip"
                      aria-label="Skip"
                    >
                      <IconSkip />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="kk-btn kk-btn-primary kk-iconOnly"
                    onClick={commitGuide}
                    disabled={isLocked}
                    title="Send"
                    aria-label="Send"
                  >
                    <IconSend />
                  </button>
                </div>
              </div>

              {currentGuide.suggestions && !isLocked ? (
                <div className="kk-suggest" aria-label="suggestions">
                  {currentGuide.suggestions.map((s) => (
                    <button key={s} type="button" className="kk-suggest__chip" onClick={() => quickFill(s)} title="Quick fill">
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Send Amount */}
          <div className="kk-sendbar" aria-label="send amount">
            <div className="kk-sendbar__left">
              <div className="kk-sendbar__label">Send Amount</div>
              <div className="kk-sendbar__sub">Committed when printing/saving exports.</div>
            </div>

            <div className="kk-sendbar__right">
              <div className="kk-sendbar__inputWrap">
                <span className="kk-sendbar__prefix">Φ</span>
                <input
                  value={sendPhiInput}
                  onChange={(e) => setSendPhiInput(e.target.value)}
                  placeholder={isLocked ? fTiny(defaultSendPhi) : "Render to set amount"}
                  disabled={!isLocked}
                  className={`kk-sendbar__input ${sendPhiOverBalance ? "is-error" : ""}`}
                  inputMode="decimal"
                  aria-invalid={sendPhiOverBalance || undefined}
                />
              </div>

              <div className="kk-sendbar__meta">
                <div className="kk-sendbar__usd">≈ {fUsd(effectiveValueUsd)}</div>
                {isLocked && typeof availablePhi === "number" && Number.isFinite(availablePhi) ? (
                  <div className="kk-sendbar__hint">
                    Available: <span className="kk-mono">{fTiny(availablePhi)}</span> {sendPhiOverBalance ? "· exceeds" : ""}
                  </div>
                ) : (
                  <div className="kk-sendbar__hint">Render locks valuation.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Guided vs Form */}
      {uiMode === "guide" ? (
        <section className="kk-chatpanel" aria-label="guided history">
          <div className="kk-chatpanel__head">
            <div className="kk-chatpanel__h">
              <span className="kk-mono">Guide</span> <span className="kk-chatpanel__badge">{isLocked ? "locked" : "live"}</span>
            </div>
            <div className="kk-chatpanel__hint">Only past Q/A + current question appear. Future steps stay hidden until reached.</div>
          </div>

          <div className="kk-chatpanel__body">
            {transcript.map((m) => {
              const canJump = typeof m.stepIdx === "number" && !isLocked && m.stepIdx < guideIdx;
              return (
                <div key={m.id} className={`kk-bubbleRow ${m.side === "you" ? "is-you" : "is-sys"}`}>
                  <div className={`kk-bubble ${m.side === "you" ? "kk-bubble--you" : "kk-bubble--sys"}`}>
                    <div className="kk-bubble__text">{m.text}</div>
                    {canJump && m.side === "sys" ? (
                      <button
                        type="button"
                        className="kk-bubble__jump"
                        onClick={() => jumpTo(m.stepIdx!)}
                        title="Edit this answered step"
                        aria-label="Edit"
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <div className="kk-previewCard" aria-label="live note preview">
              <div className="kk-previewCard__head">
                <div className="kk-previewCard__t">Live Note Preview</div>
                <div className="kk-previewCard__s">Updates as you answer · locks on Render</div>
              </div>
              <div ref={previewHostRef} id="note-preview" className="kk-note-preview kk-out" />
            </div>

            <div ref={chatEndRef} />
          </div>
        </section>
      ) : (
        <section className="kk-formpanel" aria-label="classic form">
          <div className="kk-row">
            <label>Title</label>
            <input value={`${noteTitle} — ${NOTE_TITLE}`} disabled className="kk-out" />
          </div>

          <div className="kk-grid">
            <div className="kk-stack">
              <div className="kk-row">
                <label>Purpose</label>
                <input value={form.purpose} onChange={(e) => u("purpose")(e.target.value)} placeholder="Work / gift / exchange" disabled={isLocked} />
              </div>
              <div className="kk-row">
                <label>To</label>
                <input value={form.to} onChange={(e) => u("to")(e.target.value)} placeholder="Recipient" disabled={isLocked} />
              </div>
              <div className="kk-row">
                <label>From</label>
                <input value={form.from} onChange={(e) => u("from")(e.target.value)} placeholder="Issuer" disabled={isLocked} />
              </div>
            </div>

            <div className="kk-stack">
              <div className="kk-row">
                <label>Location</label>
                <input value={form.location} onChange={(e) => u("location")(e.target.value)} placeholder="(optional)" disabled={isLocked} />
              </div>
              <div className="kk-row">
                <label>Witnesses</label>
                <input value={form.witnesses} onChange={(e) => u("witnesses")(e.target.value)} placeholder="(optional)" disabled={isLocked} />
              </div>
              <div className="kk-row">
                <label>Reference</label>
                <input value={form.reference} onChange={(e) => u("reference")(e.target.value)} placeholder="(optional)" disabled={isLocked} />
              </div>
            </div>
          </div>

          <div className="kk-row">
            <label>Remark</label>
            <input value={form.remark} onChange={(e) => u("remark")(e.target.value)} placeholder="Short line printed on the note" disabled={isLocked} />
          </div>

          <div className="kk-previewCard kk-previewCard--flat" aria-label="live note preview">
            <div className="kk-previewCard__head">
              <div className="kk-previewCard__t">Live Note Preview</div>
              <div className="kk-previewCard__s">Updates as you edit · locks on Render</div>
            </div>
            <div ref={previewHostRef} id="note-preview" className="kk-note-preview kk-out" />
          </div>
        </section>
      )}

      {/* Advanced proof panel (toggle in header) */}
      {showAdvanced ? (
        <section className="kk-advanced" aria-label="proof panel">
          <details className="kk-stack kk-advDetails" open style={{ marginTop: 10 }}>
            <summary>
              <strong>Identity &amp; Valuation</strong> <span className="kk-hint">— printed on the note + proof pages</span>
            </summary>

            <div className="kk-grid" style={{ marginTop: 8 }}>
              <div className="kk-stack">
                <div className="kk-row">
                  <label>Value Φ</label>
                  <input value={fTiny(displayPhi)} readOnly />
                </div>
                <div className="kk-row">
                  <label>Premium Φ</label>
                  <input value={fTiny(displayPremium)} readOnly />
                </div>
                <div className="kk-row">
                  <label>Valuation Alg</label>
                  <input value={form.valuationAlg || liveAlgString} readOnly />
                </div>
                <div className="kk-row">
                  <label>Valuation Stamp</label>
                  <input value={isLocked && locked ? form.valuationStamp || locked.seal.stamp || "—" : ""} readOnly />
                </div>
              </div>

              <div className="kk-stack">
                <div className="kk-row">
                  <label>Pulse (locked)</label>
                  <input value={isLocked && locked ? String(locked.lockedPulse) : ""} readOnly placeholder="set on Render" />
                </div>
                <div className="kk-row">
                  <label>Pulse (live)</label>
                  <input value={String(nowFloor)} readOnly />
                </div>
                <div className="kk-row">
                  <label>kaiSignature</label>
                  <input value={form.kaiSignature} onChange={(e) => u("kaiSignature")(e.target.value)} disabled={isLocked} />
                </div>
                <div className="kk-row">
                  <label>userΦkey</label>
                  <input value={form.userPhiKey} onChange={(e) => u("userPhiKey")(e.target.value)} disabled={isLocked} />
                </div>
                <div className="kk-row">
                  <label>Σ (canonical)</label>
                  <input value={form.sigmaCanon} onChange={(e) => u("sigmaCanon")(e.target.value)} disabled={isLocked} />
                </div>
                <div className="kk-row">
                  <label>sha256(Σ)</label>
                  <input value={form.shaHex} onChange={(e) => u("shaHex")(e.target.value)} disabled={isLocked} />
                </div>
                <div className="kk-row">
                  <label>Φ (derived)</label>
                  <input value={form.phiDerived} onChange={(e) => u("phiDerived")(e.target.value)} disabled={isLocked} />
                </div>
              </div>
            </div>

            <div className="kk-row">
              <label>Verify URL</label>
              <input value={form.verifyUrl} onChange={(e) => u("verifyUrl")(e.target.value)} placeholder="Used for QR & clickable sigil" disabled={isLocked} />
            </div>

            <div className="kk-row">
              <label>Sigil SVG (raw)</label>
              <textarea value={form.sigilSvg} onChange={(e) => u("sigilSvg")(e.target.value)} className="kk-out" disabled={isLocked} />
            </div>
          </details>
        </section>
      ) : null}

      {/* Print root (must remain) */}
      <div ref={printRootRef} id="print-root" aria-hidden="true" />
    </div>
  );
};

export default ExhaleNote;
