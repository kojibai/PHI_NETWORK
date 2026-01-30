// src/components/KaiVoh/KaiVohApp.tsx
"use client";

/**
 * KaiVohApp — Kai-Sigil Posting OS
 * v5.2 — KPV-1 Proof Hash (payload-bound verification)
 *
 * FIX (v5.2.2 - no cascading effect setState):
 * - Live pulse ticker is networkless + NEVER calls setState synchronously inside an effect body.
 * - Removes "derive step from session" effect; step routing is derived via activeStep (no cascading renders).
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import "./styles/KaiVohApp.css";

/* UI flow */
import SigilLogin from "./SigilLogin";
import { SessionProvider } from "../session/SessionProvider";
import { useSession } from "../session/useSession";

import KaiVoh from "./KaiVoh";
import PostComposer from "./PostComposer";
import type { ComposedPost } from "./PostComposer";
import BreathSealer from "./BreathSealer";
import type { SealedPost } from "./BreathSealer";
import { embedKaiSignature } from "./SignatureEmbedder";
import type { EmbeddedMediaResult } from "./SignatureEmbedder";
import MultiShareDispatcher from "./MultiShareDispatcher";
import { buildNextSigilSvg, downloadSigil } from "./SigilMemoryBuilder";
import { embedProofMetadata } from "../../utils/svgProof";
import { isReloadDebugEnabled } from "../../utils/reloadDetective";

/* Verifier UI + proof helpers */
import VerifierFrame from "./VerifierFrame";
import {
  buildVerifierSlug,
  buildVerifierUrl,
  buildBundleRoot,
  buildZkPublicInputs,
  computeBundleHash,
  hashProofCapsuleV1,
  hashSvgText,
  normalizeProofBundleZkCurves,
  normalizeChakraDay,
  PROOF_CANON,
  PROOF_BINDINGS,
  PROOF_HASH_ALG,
  ZK_PUBLIC_INPUTS_CONTRACT,
  ZK_STATEMENT_BINDING,
  ZK_STATEMENT_ENCODING,
  ZK_STATEMENT_DOMAIN,
  type ProofCapsuleV1,
} from "./verifierProof";

/* Canonical crypto parity (match VerifierStamper): derive Φ-Key FROM SIGNATURE */
import { derivePhiKeyFromSig } from "../VerifierStamper/sigilUtils";

/* Kai-Klok φ-engine (KKS v1) */
import { epochMsFromPulse, type ChakraDay } from "../../utils/kai_pulse";
import type { AuthorSig } from "../../utils/authorSig";
import { registerSigilAuth } from "../../utils/sigilRegistry";
import { ensurePasskey, signBundleHash } from "../../utils/webauthnKAS";
import { computeZkPoseidonHash } from "../../utils/kai";
import { buildProofHints, generateZkProofFromPoseidonHash } from "../../utils/zkProof";
import type { SigilProofHints } from "../../types/sigil";

/* Aligned ticker (KaiStatus source) */
import { useAlignedKaiTicker } from "../../pages/sigilstream/core/ticker";

/* Types */
import type { PostEntry, SessionData } from "../session/sessionTypes";

/* -------------------------------------------------------------------------- */
/*                               Helper Types                                 */
/* -------------------------------------------------------------------------- */

type FlowStep = "login" | "connect" | "compose" | "seal" | "embed" | "share" | "verify";

interface SigilMeta {
  kaiSignature: string;
  pulse: number;
  chakraDay?: string;
  userPhiKey?: string;
  connectedAccounts?: Record<string, string>;
  postLedger?: PostEntry[];
}

type KaiSigKksMetadataShape = EmbeddedMediaResult["metadata"];

type ExtendedKksMetadata = KaiSigKksMetadataShape & {
  originPulse?: number;
  sigilPulse?: number;
  exhalePulse?: number;

  shareUrl?: string;
  verifierUrl?: string;
  verifierSlug?: string;

  proofHash?: string;
  capsuleHash?: string;
  svgHash?: string;
  bundleHash?: string;
  hashAlg?: string;
  canon?: string;
  authorSig?: AuthorSig | null;

  proofCapsule?: ProofCapsuleV1;
};

const readPublicInput0 = (inputs: unknown): string | null => {
  if (!inputs) return null;
  if (Array.isArray(inputs)) {
    const first = inputs[0];
    return first == null ? null : String(first);
  }
  if (typeof inputs === "string") {
    try {
      const parsed = JSON.parse(inputs) as unknown;
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        return first == null ? null : String(first);
      }
    } catch {
      return inputs;
    }
    return inputs;
  }
  return null;
};

type VerifierData = Readonly<{
  pulse: number;
  chakraDay: ChakraDay;
  kaiSignature: string;
  phiKey: string;

  verifierSlug: string;
  verifierUrl: string;

  hashAlg: string;
  canon: string;
  capsuleHash: string;
  svgHash: string;
  bundleHash: string;
  authorSig?: AuthorSig | null;
  proofHash: string;
}>;

/* -------------------------------------------------------------------------- */
/*                           Narrowing / Validation                            */
/* -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isPostEntry(v: unknown): v is PostEntry {
  return isRecord(v) && typeof v.pulse === "number" && typeof v.platform === "string" && typeof v.link === "string";
}

function toPostLedger(v: unknown): PostEntry[] {
  if (!Array.isArray(v)) return [];
  const out: PostEntry[] = [];
  for (const item of v) {
    if (isPostEntry(item)) out.push(item);
  }
  return out;
}

function toStringRecord(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function parseSigilMeta(v: unknown): SigilMeta | null {
  if (!isRecord(v)) return null;

  const kaiSignature = (v as { kaiSignature?: unknown }).kaiSignature;
  const pulse = (v as { pulse?: unknown }).pulse;
  if (typeof kaiSignature !== "string" || typeof pulse !== "number") return null;

  const chakraDay =
    typeof (v as { chakraDay?: unknown }).chakraDay === "string" ? (v as { chakraDay?: string }).chakraDay : undefined;
  const userPhiKey =
    typeof (v as { userPhiKey?: unknown }).userPhiKey === "string" ? (v as { userPhiKey?: string }).userPhiKey : undefined;
  const connectedAccounts = toStringRecord((v as { connectedAccounts?: unknown }).connectedAccounts);
  const postLedger = toPostLedger((v as { postLedger?: unknown }).postLedger);

  return { kaiSignature, pulse, chakraDay, userPhiKey, connectedAccounts, postLedger };
}

/** Light, sane Base58 (no case-folding, no hard 34-char lock) */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
function isValidPhiKeyShape(k: string): boolean {
  return BASE58_RE.test(k) && k.length >= 26 && k.length <= 64;
}

/* -------------------------------------------------------------------------- */
/*                          Presentation Helpers                              */
/* -------------------------------------------------------------------------- */

const FLOW_ORDER: FlowStep[] = ["connect", "compose", "seal", "embed", "share", "verify"];

const FLOW_LABEL: Record<FlowStep, string> = {
  login: "Login",
  connect: "KaiVoh",
  compose: "Compose",
  seal: "Seal Breath",
  embed: "Embed Signature",
  share: "Share",
  verify: "Verify",
};

function shortKey(k: string | undefined): string {
  if (!k) return "—";
  if (k.length <= 10) return k;
  return `${k.slice(0, 5)}…${k.slice(-4)}`;
}

function chakraClass(chakraDay?: string): string {
  const normalized = chakraDay || "Crown";
  const chakraKey =
    {
      Root: "root",
      Sacral: "sacral",
      "Solar Plexus": "solar",
      Heart: "heart",
      Throat: "throat",
      "Third Eye": "brow",
      Crown: "crown",
    }[normalized] ??
    normalized
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  return `kv-chakra-${chakraKey}`;
}

function formatCountdown(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "0.0s";
  const seconds = ms / 1000;
  if (seconds < 1) return `${seconds.toFixed(2)}s`;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${seconds.toFixed(0)}s`;
}

function safeFileExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i >= name.length - 1) return "";
  const ext = name.slice(i);
  if (ext.length > 12) return "";
  return ext;
}

const SVG_NS = "http://www.w3.org/2000/svg";

async function downloadSvgBlob(filename: string, blob: Blob): Promise<void> {
  const text = await blob.text();
  downloadSigil(filename, text);
}

async function embedMetadataIntoSvgBlob(svgBlob: Blob, metadata: unknown): Promise<Blob> {
  try {
    const rawText = await svgBlob.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawText, "image/svg+xml");

    if (doc.querySelector("parsererror")) return svgBlob;

    const root = doc.documentElement;
    if (!root || root.namespaceURI !== SVG_NS || root.tagName.toLowerCase() !== "svg") return svgBlob;

    const metas = doc.getElementsByTagName("metadata");
    const metaEl: SVGMetadataElement =
      metas.length > 0
        ? (metas.item(0) as SVGMetadataElement)
        : (doc.createElementNS(SVG_NS, "metadata") as SVGMetadataElement);

    if (metas.length === 0) root.appendChild(metaEl);

    metaEl.textContent = JSON.stringify(metadata, null, 2);

    const serializer = new XMLSerializer();
    const updatedSvg = serializer.serializeToString(doc);
    return new Blob([updatedSvg], { type: "image/svg+xml" });
  } catch {
    return svgBlob;
  }
}

async function embedProofMetadataIntoSvgBlob(svgBlob: Blob, metadata: unknown): Promise<Blob> {
  try {
    const rawText = await svgBlob.text();
    const updatedSvg = embedProofMetadata(rawText, metadata);
    return new Blob([updatedSvg], { type: "image/svg+xml" });
  } catch {
    return svgBlob;
  }
}

/* --------------------------- UI Subcomponents ----------------------------- */

interface StepIndicatorProps {
  current: FlowStep;
}

function StepIndicator({ current }: StepIndicatorProps): ReactElement {
  const currentIndex = FLOW_ORDER.indexOf(current);

  return (
    <div className="kv-steps">
      {FLOW_ORDER.map((step, index) => {
        const isCurrent = step === current;
        const isDone = currentIndex >= 0 && index < currentIndex;

        const chipClass = ["kv-step-chip", isDone ? "kv-step-chip--done" : "", isCurrent ? "kv-step-chip--active" : ""]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={step} className="kv-step">
            <div className={chipClass}>
              <span className="kv-step-index">{index + 1}</span>
              <span className="kv-step-label">{FLOW_LABEL[step]}</span>
            </div>
            {index < FLOW_ORDER.length - 1 ? <div className="kv-step-rail" aria-hidden="true" /> : null}
          </div>
        );
      })}
    </div>
  );
}

interface SessionHudProps {
  session: SessionData;
  step: FlowStep;
  hasConnectedAccounts: boolean;
  onLogout: () => void;
  onNewPost: () => void;
}

/* -------------------------------------------------------------------------- */
/*                      FIXED: networkless live pulse ticker                  */
/*                      (no synchronous setState in effect body)              */
/* -------------------------------------------------------------------------- */

function parsePulseLoose(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : typeof raw === "bigint"
          ? Number(raw)
          : Number.NaN;

  if (!Number.isFinite(n)) return null;
  const p = Math.floor(n);
  if (p < 0) return null;
  return p;
}

function readFiniteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function nowEpochMsApprox(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    const origin = typeof performance.timeOrigin === "number" ? performance.timeOrigin : 0;
    return origin + performance.now();
  }
  return Date.now();
}

function useLivePulseTicker(enabled: boolean): {
  livePulse: number | null;
  msToNextPulse: number | null;
} {
  const kaiNow = useAlignedKaiTicker() as unknown;

  const livePulse = useMemo(() => {
    if (!enabled) return null;
    if (!isRecord(kaiNow)) return null;
    return parsePulseLoose((kaiNow as Record<string, unknown>).pulse);
  }, [enabled, kaiNow]);

  const msFromTicker = useMemo(() => {
    if (!enabled) return null;
    if (!isRecord(kaiNow)) return null;
    const r = kaiNow as Record<string, unknown>;
    return readFiniteNumber(r.msToNextPulse) ?? readFiniteNumber(r.msToNext) ?? readFiniteNumber(r.msUntilNext) ?? null;
  }, [enabled, kaiNow]);

  // Only used when ticker does not provide msToNext
  const [msFallback, setMsFallback] = useState<number | null>(null);

  useEffect(() => {
    // IMPORTANT: no setState synchronously in the effect body.
    if (!enabled) return;
    if (livePulse == null) return;
    if (msFromTicker != null) return; // ticker provides countdown; no fallback loop

    let alive = true;

    const tick = () => {
      const nowMs = nowEpochMsApprox();
      const nextPulseMs = Number(epochMsFromPulse(livePulse + 1));
      let remaining = Math.floor(nextPulseMs - nowMs);
      if (!Number.isFinite(remaining) || remaining < 0) remaining = 0;
      if (alive) setMsFallback(remaining);
    };

    // schedule async (avoids synchronous setState in effect body)
    const t0 = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 250);

    return () => {
      alive = false;
      window.clearTimeout(t0);
      window.clearInterval(id);
    };
  }, [enabled, livePulse, msFromTicker]);

  const msToNextPulse = msFromTicker != null ? Math.max(0, msFromTicker) : msFallback;

  return { livePulse, msToNextPulse };
}

/* -------------------------------------------------------------------------- */

function SessionHud({ session, step, hasConnectedAccounts, onLogout, onNewPost }: SessionHudProps): ReactElement {
  const { livePulse, msToNextPulse } = useLivePulseTicker(Boolean(session));
  const ledgerCount = session.postLedger?.length ?? 0;
  const pulseDisplay = livePulse ?? session.pulse;
  const countdownLabel = formatCountdown(msToNextPulse);

  return (
    <header className={["kv-session-hud", chakraClass(session.chakraDay)].join(" ")}>
      <div className="kv-session-main">
        <div className="kv-session-header-row">
          <div className="kv-session-title-block">
            <div className="kv-session-kicker">KaiVoh · Glyph Session</div>

            <div className="kv-session-keyline">
              <span className="kv-meta-item kv-meta-phikey">
                <span className="kv-meta-label">Φ-Key</span>
                <span className="kv-meta-value">{shortKey(session.phiKey)}</span>
              </span>

              <span className="kv-meta-divider" />

              <span className="kv-meta-item">
                <span className="kv-meta-label">Sigil Pulse</span>
                <span className="kv-meta-value">{session.pulse}</span>
              </span>

              <span className="kv-meta-divider" />

              <span className="kv-meta-item">
                <span className="kv-meta-label">Chakra</span>
                <span className="kv-meta-value">{session.chakraDay ?? "Crown"}</span>
              </span>

              {ledgerCount > 0 ? (
                <>
                  <span className="kv-meta-divider" />
                  <span className="kv-meta-item kv-meta-activity">
                    <span className="kv-meta-label">Sealed</span>
                    <span className="kv-meta-value">
                      {ledgerCount} {ledgerCount === 1 ? "post" : "posts"}
                    </span>
                  </span>
                </>
              ) : null}
            </div>

            <div className="kv-session-live">
              <span className="kv-live-label">Live Kai Pulse</span>
              <span className="kv-live-value">
                {pulseDisplay}
                <span className="kv-live-countdown">· next breath in {countdownLabel}</span>
              </span>
            </div>
          </div>

          <div className="kv-session-status-block">
            <span className={["kv-accounts-pill", hasConnectedAccounts ? "kv-accounts-pill--ok" : "kv-accounts-pill--warn"].join(" ")}>
              {hasConnectedAccounts ? "Accounts linked" : "Connect accounts"}
            </span>
            <span className="kv-step-current-label">{FLOW_LABEL[step] ?? "Flow"}</span>
          </div>
        </div>

        <div className="kv-session-steps-row">
          <StepIndicator current={step} />
        </div>
      </div>

      <div className="kv-session-actions">
        <button type="button" onClick={onNewPost} className="kv-btn kv-btn-primary">
          + Exhale Memory
        </button>
        <button type="button" onClick={onLogout} className="kv-btn kv-btn-ghost">
          ⏻ Inhale Memories
        </button>
      </div>
    </header>
  );
}

interface ActivityStripProps {
  ledger: PostEntry[];
}

function ActivityStrip({ ledger }: ActivityStripProps): ReactElement | null {
  if (!ledger || ledger.length === 0) return null;

  const lastFew = [...ledger].sort((a, b) => b.pulse - a.pulse).slice(0, 4);

  return (
    <section className="kv-activity">
      <div className="kv-activity-header">
        <span className="kv-activity-title">Session Activity</span>
        <span className="kv-activity-count">{ledger.length} total</span>
      </div>

      <div className="kv-activity-list">
        {lastFew.map((entry) => (
          <div key={`${entry.platform}-${entry.pulse}-${entry.link}`} className="kv-activity-item">
            <div className="kv-activity-item-main">
              <span className="kv-activity-platform">{entry.platform}</span>
              <span className="kv-activity-pulse">
                Pulse <span>{entry.pulse}</span>
              </span>
            </div>

            {entry.link ? (
              <a href={entry.link} target="_blank" rel="noreferrer" className="kv-activity-link">
                {entry.link}
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Flow                                     */
/* -------------------------------------------------------------------------- */

function KaiVohFlow(): ReactElement {
  const { session, setSession, clearSession } = useSession();

  const [step, setStep] = useState<FlowStep>("login");
  const [post, setPost] = useState<ComposedPost | null>(null);
  const [sealed, setSealed] = useState<SealedPost | null>(null);
  const [finalMedia, setFinalMedia] = useState<EmbeddedMediaResult | null>(null);
  const [verifierData, setVerifierData] = useState<VerifierData | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);

  const hasConnectedAccounts = useMemo(() => {
    if (!session || !session.connectedAccounts) return false;
    return Object.keys(session.connectedAccounts).length > 0;
  }, [session]);

  // Derived step: eliminates "sync setStep inside effect" pattern
  const activeStep: FlowStep = useMemo(() => {
    if (!session) return "login";
    if (step !== "login") return step;
    return hasConnectedAccounts ? "compose" : "connect";
  }, [session, step, hasConnectedAccounts]);

  useEffect(() => {
    if (!isReloadDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log("[Reload Detective] KaiVohFlow mount");
    return () => {
      // eslint-disable-next-line no-console
      console.log("[Reload Detective] KaiVohFlow unmount");
    };
  }, []);

  const handleSigilVerified = async (_svgText: string, rawMeta: unknown): Promise<void> => {
    try {
      setFlowError(null);

      const meta = parseSigilMeta(rawMeta);
      if (!meta) throw new Error("Malformed sigil metadata from login.");

      const expectedPhiKey = await derivePhiKeyFromSig(meta.kaiSignature);

      if (meta.userPhiKey && meta.userPhiKey !== expectedPhiKey) {
        // eslint-disable-next-line no-console
        console.warn("[KaiVoh] Embedded userPhiKey differs from derived; preferring derived from signature.", {
          embedded: meta.userPhiKey,
          derived: expectedPhiKey,
        });
      }

      if (!isValidPhiKeyShape(expectedPhiKey)) {
        throw new Error("Invalid Φ-Key shape after derivation.");
      }

      const sessionChakra: ChakraDay = normalizeChakraDay(meta.chakraDay) ?? "Crown";

      const nextSession: SessionData = {
        phiKey: expectedPhiKey,
        kaiSignature: meta.kaiSignature,
        pulse: meta.pulse,
        chakraDay: sessionChakra,
        connectedAccounts: meta.connectedAccounts ?? {},
        postLedger: meta.postLedger ?? [],
      };

      setSession(nextSession);

      // Optional: align explicit step with derived step for clarity
      if (Object.keys(nextSession.connectedAccounts ?? {}).length > 0) setStep("compose");
      else setStep("connect");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid Φ-Key signature or metadata.";
      setFlowError(msg);
      setStep("login");
    }
  };

  const handleLogout = (): void => {
    if (!session) return;

    const nextSvg = buildNextSigilSvg(session);
    downloadSigil(`sigil-${session.pulse + 1}.svg`, nextSvg);

    clearSession();
    setPost(null);
    setSealed(null);
    setFinalMedia(null);
    setVerifierData(null);
    setFlowError(null);
    setStep("login");
  };

  const handleNewPost = (): void => {
    setPost(null);
    setSealed(null);
    setFinalMedia(null);
    setVerifierData(null);
    setFlowError(null);
    setStep("compose");
  };

  const handleDownloadSealedSvg = async (): Promise<void> => {
    if (!finalMedia) return;
    if (finalMedia.type !== "image" || !finalMedia.content.type.includes("svg")) return;
    await downloadSvgBlob(finalMedia.filename, finalMedia.content);
  };

  const appendBroadcastToLedger = (results: { platform: string; link: string }[], pulse: number): void => {
    if (!session || results.length === 0) return;

    const existing = session.postLedger ?? [];
    const appended: PostEntry[] = [
      ...existing,
      ...results.map((r) => ({ pulse, platform: r.platform, link: r.link })),
    ];

    setSession({ ...session, postLedger: appended });
  };

  /* ---------------------------------------------------------------------- */
  /*                          Embedding Kai Signature                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    (async (): Promise<void> => {
      if (activeStep !== "embed" || !sealed || !session) return;

      try {
        const mediaRaw = await embedKaiSignature(sealed);
        if (cancelled) return;

        const originPulse = session.pulse;
        const exhalePulse = sealed.pulse;

        const baseMeta: KaiSigKksMetadataShape = mediaRaw.metadata;

        const proofSig = (baseMeta.kaiSignature ?? sealed.kaiSignature ?? session.kaiSignature ?? "").trim();
        if (!proofSig) throw new Error("Missing kaiSignature for embedded proof.");

        const proofPhiKey = await derivePhiKeyFromSig(proofSig);

        if (session.phiKey && session.phiKey !== proofPhiKey) {
          throw new Error("Proof mismatch: embedded kaiSignature derives a different Φ-Key than session.");
        }

        const baseChakraRaw = typeof baseMeta.chakraDay === "string" ? baseMeta.chakraDay : undefined;

        const proofChakraDay: ChakraDay =
          normalizeChakraDay(sealed.chakraDay ?? undefined) ??
          normalizeChakraDay(baseChakraRaw) ??
          normalizeChakraDay(session.chakraDay ?? undefined) ??
          "Crown";

        const verifierSlug = buildVerifierSlug(exhalePulse, proofSig);
        const verifierUrl = buildVerifierUrl(exhalePulse, proofSig);

        const capsule: ProofCapsuleV1 = {
          v: "KPV-1",
          pulse: exhalePulse,
          chakraDay: proofChakraDay,
          kaiSignature: proofSig,
          phiKey: proofPhiKey,
          verifierSlug,
        };

        const capsuleHash = await hashProofCapsuleV1(capsule);

        const mergedMetadata: ExtendedKksMetadata = {
          ...baseMeta,
          pulse: exhalePulse,
          kaiPulse: exhalePulse,
          chakraDay: proofChakraDay,
          kaiSignature: proofSig,
          phiKey: proofPhiKey,
          userPhiKey: proofPhiKey,
          phiKeyShort: `φK-${proofPhiKey.slice(0, 8)}`,
          verifierUrl,
          verifierSlug,
          proofCapsule: capsule,
          proofHash: capsuleHash,
          capsuleHash,
          hashAlg: PROOF_HASH_ALG,
          canon: PROOF_CANON,
          originPulse,
          sigilPulse: originPulse,
          exhalePulse,
        };

        let content = mediaRaw.content;
        if (mediaRaw.type === "image" && content.type.includes("svg")) {
          content = await embedMetadataIntoSvgBlob(content, mergedMetadata);
        }

        let svgHash: string | undefined;
        let bundleHash: string | undefined;
        let authorSig: AuthorSig | null = null;

        if (mediaRaw.type === "image" && content.type.includes("svg")) {
          const svgText = await content.text();
          svgHash = await hashSvgText(svgText);

          const zkPoseidonHash =
            typeof (mergedMetadata as { zkPoseidonHash?: unknown }).zkPoseidonHash === "string"
              ? (mergedMetadata as { zkPoseidonHash?: string }).zkPoseidonHash
              : undefined;
          const zkPoseidonSecret =
            typeof (mergedMetadata as { zkPoseidonSecret?: unknown }).zkPoseidonSecret === "string"
              ? (mergedMetadata as { zkPoseidonSecret?: string }).zkPoseidonSecret
              : undefined;
          const payloadHashHex =
            typeof (mergedMetadata as { payloadHashHex?: unknown }).payloadHashHex === "string"
              ? (mergedMetadata as { payloadHashHex?: string }).payloadHashHex
              : undefined;

          let zkProof = (mergedMetadata as { zkProof?: unknown }).zkProof;
          let proofHints = (mergedMetadata as { proofHints?: unknown }).proofHints;
          let zkPublicInputs: unknown = (mergedMetadata as { zkPublicInputs?: unknown }).zkPublicInputs;

          if (zkPoseidonHash) {
            const proofObj = zkProof && typeof zkProof === "object" ? (zkProof as Record<string, unknown>) : null;
            const hasProof =
              typeof zkProof === "string"
                ? zkProof.trim().length > 0
                : Array.isArray(zkProof)
                  ? zkProof.length > 0
                  : proofObj
                    ? Object.keys(proofObj).length > 0
                    : false;

            let secretForProof =
              typeof zkPoseidonSecret === "string" && zkPoseidonSecret.trim().length > 0 ? zkPoseidonSecret.trim() : undefined;

            if (!secretForProof && payloadHashHex) {
              const computed = await computeZkPoseidonHash(payloadHashHex);
              if (computed.hash === zkPoseidonHash) {
                secretForProof = computed.secret;
              }
            }

            if (!hasProof && secretForProof) {
              const generated = await generateZkProofFromPoseidonHash({
                poseidonHash: zkPoseidonHash,
                secret: secretForProof,
                proofHints: typeof proofHints === "object" && proofHints !== null ? (proofHints as SigilProofHints) : undefined,
              });
              if (generated) {
                zkProof = generated.proof;
                proofHints = generated.proofHints;
                zkPublicInputs = generated.zkPublicInputs;
              }
            }

            if (typeof proofHints !== "object" || proofHints === null) {
              proofHints = buildProofHints(zkPoseidonHash);
            } else {
              proofHints = buildProofHints(zkPoseidonHash, proofHints as SigilProofHints);
            }
          }

          if (zkPoseidonHash && zkPublicInputs) {
            const publicInput0 = readPublicInput0(zkPublicInputs);
            if (publicInput0 && publicInput0 !== zkPoseidonHash) throw new Error("Embedded ZK mismatch");
          }

          const shareUrl =
            typeof (mergedMetadata as { shareUrl?: unknown }).shareUrl === "string"
              ? (mergedMetadata as { shareUrl?: string }).shareUrl
              : undefined;

          const zkStatement = zkPoseidonHash
            ? {
                publicInputOf: ZK_STATEMENT_BINDING,
                domainTag: ZK_STATEMENT_DOMAIN,
                publicInputsContract: ZK_PUBLIC_INPUTS_CONTRACT,
                encoding: ZK_STATEMENT_ENCODING,
              }
            : undefined;

          const zkMeta = zkPoseidonHash
            ? {
                protocol: "groth16",
                scheme: "groth16-poseidon",
                circuitId: "sigil_proof",
              }
            : undefined;

          const normalizedZk = normalizeProofBundleZkCurves({ zkProof, zkMeta, proofHints });
          zkProof = normalizedZk.zkProof;
          const zkMetaNormalized = normalizedZk.zkMeta;

          const proofBundleBase = {
            v: "KPB-1",
            hashAlg: PROOF_HASH_ALG,
            canon: PROOF_CANON,
            bindings: PROOF_BINDINGS,
            zkStatement,
            proofCapsule: capsule,
            capsuleHash,
            svgHash,
            zkPoseidonHash,
            zkProof,
            zkPublicInputs: zkPoseidonHash ? buildZkPublicInputs(zkPoseidonHash) : zkPublicInputs,
            zkMeta: zkMetaNormalized,
          };

          const transport = { shareUrl, verifierUrl, proofHints };
          const bundleRoot = buildBundleRoot(proofBundleBase);
          bundleHash = await computeBundleHash(bundleRoot);

          try {
            await ensurePasskey(proofPhiKey);
            authorSig = await signBundleHash(proofPhiKey, bundleHash);
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(
              `KAS signature failed. Please complete Face ID/Touch ID and ensure this PWA opens on the same hostname you registered. Details: ${reason}`
            );
          }

          const proofBundle = {
            ...proofBundleBase,
            bundleRoot,
            bundleHash,
            authorSig,
            transport,
            proofHints,
          };

          if (authorSig?.v === "KAS-1") {
            const authUrl = shareUrl || verifierUrl;
            if (authUrl) registerSigilAuth(authUrl, authorSig);
          }

          content = await embedProofMetadataIntoSvgBlob(content, proofBundle);
        }

        const ext =
          safeFileExt(mediaRaw.filename) || safeFileExt(sealed.post.file.name) || (mediaRaw.type === "video" ? ".mp4" : ".svg");
        const filename = `memory_p${originPulse}_p${exhalePulse}${ext}`;

        const media: EmbeddedMediaResult = {
          ...mediaRaw,
          content,
          filename,
          metadata: {
            ...mergedMetadata,
            svgHash,
            bundleHash,
            authorSig,
          },
        };

        setFinalMedia(media);

        setVerifierData({
          pulse: exhalePulse,
          chakraDay: proofChakraDay,
          kaiSignature: proofSig,
          phiKey: proofPhiKey,
          verifierSlug,
          verifierUrl,
          hashAlg: PROOF_HASH_ALG,
          canon: PROOF_CANON,
          capsuleHash,
          svgHash: svgHash ?? "",
          bundleHash: bundleHash ?? "",
          authorSig,
          proofHash: capsuleHash,
        });

        setStep("share");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to embed Kai Signature into media.";
        setFlowError(msg);
        setStep("compose");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeStep, sealed, session]);

  /* ---------------------------------------------------------------------- */
  /*                                Rendering                               */
  /* ---------------------------------------------------------------------- */

  if (!session) {
    return (
      <div className="kai-voh-login-shell">
        <main className="kv-main-card">
          <SigilLogin onVerified={handleSigilVerified} />
          {flowError ? <p className="kv-error">{flowError}</p> : null}
        </main>
      </div>
    );
  }

  const renderStep = (): ReactElement => {
    if (activeStep === "connect") {
      return (
        <div className="kv-connect-step">
          <KaiVoh />
          <button type="button" onClick={() => setStep("compose")} className="kv-btn kv-btn-primary kv-btn-wide">
            Continue to Compose
          </button>
        </div>
      );
    }

    if (activeStep === "compose" && !post) {
      return (
        <PostComposer
          onReady={(p: ComposedPost) => {
            setPost(p);
            setSealed(null);
            setFinalMedia(null);
            setVerifierData(null);
            setFlowError(null);
            setStep("seal");
          }}
        />
      );
    }

    if (activeStep === "seal" && post) {
      return (
        <BreathSealer
          post={post}
          identityKaiSignature={session.kaiSignature}
          userPhiKey={session.phiKey}
          onSealComplete={(sealedPost: SealedPost) => {
            setSealed(sealedPost);
            setStep("embed");
          }}
        />
      );
    }

    if (activeStep === "embed") {
      return <p className="kv-embed-status">Embedding Kai Signature into your media…</p>;
    }

    if (activeStep === "share" && finalMedia && sealed && verifierData) {
      return (
        <MultiShareDispatcher
          media={finalMedia}
          proof={verifierData}
          onComplete={(results) => {
            appendBroadcastToLedger(results, sealed.pulse);
            setStep("verify");
          }}
        />
      );
    }

    if (activeStep === "verify" && verifierData) {
      return (
        <div className="kv-verify-step">
          <VerifierFrame
            pulse={verifierData.pulse}
            kaiSignature={verifierData.kaiSignature}
            phiKey={verifierData.phiKey}
            chakraDay={verifierData.chakraDay}
            compact={false}
          />

          <p className="kv-verify-copy">
            Your memory is now verifiable as human-authored under this Φ-Key. Anyone can scan the QR or open the verifier link to confirm it was sealed at
            this pulse under your sigil.
          </p>

          <div className="kv-verify-actions">
            <button type="button" onClick={handleNewPost} className="kv-btn kv-btn-primary">
              + Exhale Memory
            </button>
            {finalMedia?.type === "image" && finalMedia.content.type.includes("svg") ? (
              <button type="button" onClick={() => void handleDownloadSealedSvg()} className="kv-btn kv-btn-ghost">
                Download sealed SVG
              </button>
            ) : null}
            <button type="button" onClick={handleLogout} className="kv-btn kv-btn-ghost">
              ⏻ Inhale Memories
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="kv-error-state">
        Something went sideways in the breath stream…
        <button type="button" onClick={handleNewPost} className="kv-error-reset">
          Reset step
        </button>
      </div>
    );
  };

  return (
    <div className="kai-voh-app-shell">
      <SessionHud
        session={session}
        step={activeStep}
        hasConnectedAccounts={hasConnectedAccounts}
        onLogout={handleLogout}
        onNewPost={handleNewPost}
      />

      <main className="kv-main-card">
        {renderStep()}
        {flowError ? <p className="kv-error">{flowError}</p> : null}
      </main>

      {session.postLedger && session.postLedger.length > 0 ? <ActivityStrip ledger={session.postLedger} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   App                                      */
/* -------------------------------------------------------------------------- */

export default function KaiVohApp(): ReactElement {
  return (
    <SessionProvider>
      <KaiVohFlow />
    </SessionProvider>
  );
}
