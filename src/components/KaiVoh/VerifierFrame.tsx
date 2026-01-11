// /components/KaiVoh/VerifierFrame.tsx
"use client";

/**
 * VerifierFrame — Kai-Sigil Verification Panel
 * v3.3 — Effect-safe async derivations (no sync setState inside effects)
 *
 * ✅ Mobile-first, never cramped
 * ✅ QR fallback never prints URL
 * ✅ 💠 Remember Proof exports KVPF-1 payload (hashAlg/canon + KPV-1 capsule + capsuleHash)
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import "./styles/VerifierFrame.css";

import type { ChakraDay } from "../../utils/kai_pulse";
import { qrDataURL } from "../../lib/qr";
import {
  buildVerifierSlug,
  buildVerifierUrl,
  defaultHostedVerifierBaseUrl,
  hashProofCapsuleV1,
  normalizeChakraDay,
  shortKaiSig10,
  PROOF_CANON,
  PROOF_HASH_ALG,
  type ProofCapsuleV1,
} from "./verifierProof";

export interface VerifierFrameProps {
  pulse: number;
  kaiSignature: string;
  phiKey: string;
  caption?: string;
  chakraDay?: ChakraDay | string;
  compact?: boolean;
  verifierBaseUrl?: string;
}

function truncateMiddle(value: string, head = 10, tail = 10): string {
  if (!value) return "";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function truncateHash(h: string, head = 10, tail = 10): string {
  if (!h) return "";
  if (h.length <= head + tail + 3) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

async function safeClipboardWrite(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ExternalIcon(): ReactElement {
  return (
    <svg className="kv-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14 19 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 14v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RememberIcon(): ReactElement {
  return (
    <span className="kv-remember" aria-hidden="true">
      💠
    </span>
  );
}

export type ProofCopy = Readonly<{
  v: "KVPF-1";
  hashAlg: string;
  canon: string;

  verifierUrl: string;
  verifierBaseUrl: string;
  verifierSlug: string;

  pulse: number;
  chakraDay?: ChakraDay;

  kaiSignature: string;
  kaiSignatureShort: string;
  phiKey: string;

  proofCapsule: ProofCapsuleV1 | null;
  capsuleHash?: string;
}>;

type CapsuleHashState = Readonly<{ key: string; hash: string }>;
type QrState = Readonly<{ key: string; dataUrl: string }>;

export default function VerifierFrame({
  pulse,
  kaiSignature,
  phiKey,
  caption,
  chakraDay,
  compact = false,
  verifierBaseUrl,
}: VerifierFrameProps): ReactElement {
  const [copyLinkStatus, setCopyLinkStatus] = useState<"idle" | "ok" | "error">("idle");
  const [copyProofStatus, setCopyProofStatus] = useState<"idle" | "ok" | "error">("idle");

  // keyed async derivations (avoid sync clearing inside effects)
  const [capsuleHashState, setCapsuleHashState] = useState<CapsuleHashState | null>(null);
  const [qrState, setQrState] = useState<QrState | null>(null);

  const qrSize = compact ? 92 : 128;
  const rootClass = compact ? "kv-verifier kv-verifier--compact" : "kv-verifier";
  const qrStyle = useMemo(() => ({ "--qr-size": `${qrSize}px` }) as CSSProperties, [qrSize]);

  const proof = useMemo<ProofCopy>(() => {
    const baseRaw = verifierBaseUrl ?? defaultHostedVerifierBaseUrl();
    const base = String(baseRaw).replace(/\/+$/, "") || "/verify";

    const sigFull = typeof kaiSignature === "string" ? kaiSignature.trim() : "";
    const sigShort = shortKaiSig10(sigFull);

    const slug = buildVerifierSlug(pulse, sigFull);
    const url = buildVerifierUrl(pulse, sigFull, base);

    const chakraNorm =
      typeof chakraDay === "string" ? normalizeChakraDay(chakraDay) : normalizeChakraDay(String(chakraDay ?? ""));

    const phiKeyClean = typeof phiKey === "string" ? phiKey.trim() : "";

    const capsule: ProofCapsuleV1 | null =
      pulse > 0 && sigFull.length > 0 && phiKeyClean.length > 0 && chakraNorm
        ? { v: "KPV-1", pulse, chakraDay: chakraNorm, kaiSignature: sigFull, phiKey: phiKeyClean, verifierSlug: slug }
        : null;

    return {
      v: "KVPF-1",
      hashAlg: PROOF_HASH_ALG,
      canon: PROOF_CANON,
      verifierUrl: url,
      verifierBaseUrl: base,
      verifierSlug: slug,
      pulse,
      chakraDay: chakraNorm ?? undefined,
      kaiSignature: sigFull,
      kaiSignatureShort: sigShort,
      phiKey: phiKeyClean,
      proofCapsule: capsule,
      capsuleHash: undefined,
    };
  }, [chakraDay, kaiSignature, phiKey, pulse, verifierBaseUrl]);

  const capsuleKey = proof.proofCapsule ? proof.verifierSlug : null;
  const capsuleHash = capsuleKey && capsuleHashState?.key === capsuleKey ? capsuleHashState.hash : null;

  const qrKey = proof.verifierUrl ? `${proof.verifierUrl}::${qrSize}` : null;
  const qrDataUrl = qrKey && qrState?.key === qrKey ? qrState.dataUrl : null;

  useEffect(() => {
    let cancelled = false;

    const capsule = proof.proofCapsule;
    if (!capsule) return undefined;

    const slug = proof.verifierSlug;

    (async (): Promise<void> => {
      try {
        const h = await hashProofCapsuleV1(capsule);
        if (!cancelled) setCapsuleHashState({ key: slug, hash: h });
      } catch {
        if (!cancelled) setCapsuleHashState(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [proof.proofCapsule, proof.verifierSlug]);

  useEffect(() => {
    let cancelled = false;

    const url = proof.verifierUrl;
    if (!url) return undefined;

    const key = `${url}::${qrSize}`;

    (async (): Promise<void> => {
      try {
        const dataUrl = await qrDataURL(url, { size: qrSize, margin: 2, ecc: "M" });
        if (!cancelled) setQrState({ key, dataUrl });
      } catch {
        if (!cancelled) setQrState(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [proof.verifierUrl, qrSize]);

  const pulseLabel = Number.isFinite(pulse) && pulse > 0 ? String(pulse) : "—";
  const captionClean = typeof caption === "string" ? caption.trim() : "";

  const phiKeyDisplay = truncateMiddle(proof.phiKey, compact ? 10 : 12, compact ? 10 : 12);
  const hashDisplay = capsuleHash ? truncateHash(capsuleHash, compact ? 10 : 12, compact ? 10 : 12) : "—";
  const sealOk = Boolean(proof.proofCapsule) && Boolean(capsuleHash);

  const handleCopyLink = async (): Promise<void> => {
    const ok = await safeClipboardWrite(proof.verifierUrl);
    setCopyLinkStatus(ok ? "ok" : "error");
    window.setTimeout(() => setCopyLinkStatus("idle"), 1600);
  };

  const handleCopyProof = async (): Promise<void> => {
    try {
      let h: string | undefined = capsuleHash ?? undefined;

      const capsule = proof.proofCapsule;
      if (!h && capsule) {
        h = await hashProofCapsuleV1(capsule);
        setCapsuleHashState({ key: proof.verifierSlug, hash: h });
      }

      const payload: ProofCopy = { ...proof, capsuleHash: h };
      const ok = await safeClipboardWrite(JSON.stringify(payload, null, 2));
      setCopyProofStatus(ok ? "ok" : "error");
      window.setTimeout(() => setCopyProofStatus("idle"), 1600);
    } catch {
      setCopyProofStatus("error");
      window.setTimeout(() => setCopyProofStatus("idle"), 1600);
    }
  };

  return (
    <section
      className={rootClass}
      aria-label="Kai-Sigil verification frame"
      data-role="verifier-frame"
      data-seal={sealOk ? "ok" : "off"}
    >
      <div className="kv-topline" aria-hidden="true" />

      <div className="kv-wrap">
        {/* TOP BAR: QR + chip rail (never cramped) */}
        <div className="kv-topbar" aria-label="Verifier top bar">
          <div
            className="kv-qr-shell"
            role="img"
            aria-label={`QR code for verifier pulse ${pulseLabel}`}
            title="Scan to open verifier"
            style={qrStyle}
          >
            <div className="kv-qr-inner">
              {qrDataUrl ? (
                <img
                  className="kv-qr-image"
                  src={qrDataUrl}
                  width={qrSize}
                  height={qrSize}
                  alt={`QR code for verifier pulse ${pulseLabel}`}
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="kv-qr-fallback" aria-label="QR unavailable">
                  <div className="kv-qr-fallback__mark">QR</div>
                  <div className="kv-qr-fallback__sub">Open link</div>
                </div>
              )}
            </div>
          </div>

          <div className="kv-chipbar" aria-label="Seal chips">
            <div className={sealOk ? "kv-chip kv-chip--ok" : "kv-chip"} title="KPV-1 capsule binding">
              <span className="kv-chip__dot" aria-hidden="true" />
              <span className="kv-chip__txt">KPV-1</span>
            </div>

            <div className="kv-chip" title="Hash algorithm">
              <span className="kv-chip__txt">{PROOF_HASH_ALG.toUpperCase()}</span>
            </div>

            <div className="kv-chip" title="Canonicalization">
              <span className="kv-chip__txt">{PROOF_CANON}</span>
            </div>

            <div
              className={sealOk ? "kv-chip kv-chip--status kv-chip--ok" : "kv-chip kv-chip--status"}
              title="Seal status"
            >
              <span className="kv-chip__txt">{sealOk ? "OFFICIAL SEAL" : "INCOMPLETE"}</span>
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="kv-body">
          <header className="kv-head">
            <h3 className="kv-title">☤Kai Sigil-Glyph Verifier</h3>
            <p className="kv-sub">Payload-bound proof vessel (capsule). Inhale to affirm this Φ-Key sealed this moment.</p>
          </header>

          <dl className="kv-meta" aria-label="Verification fields">
            <div className="kv-row">
              <dt className="kv-k">☤Kai (Pulse)</dt>
              <dd className="kv-v">{pulseLabel}</dd>
            </div>

            <div className="kv-row">
              <dt className="kv-k">☤Kai-Sig</dt>
              <dd className="kv-v kv-mono">{proof.kaiSignatureShort || "—"}</dd>
            </div>

            <div className="kv-row">
              <dt className="kv-k">Φ-Key</dt>
              <dd className="kv-v kv-mono" title={proof.phiKey}>
                {phiKeyDisplay || "—"}
              </dd>
            </div>

            <div className="kv-row">
              <dt className="kv-k">Spiral (Chakra)</dt>
              <dd className="kv-v">{proof.chakraDay ?? "—"}</dd>
            </div>

            <div className="kv-row kv-row--wide">
              <dt className="kv-k">Vessel Hash</dt>
              <dd className="kv-v kv-mono" title={capsuleHash ?? ""}>
                {hashDisplay}
              </dd>
            </div>
          </dl>

          {captionClean ? <p className="kv-caption">“{captionClean}”</p> : null}

          <div className="kv-actions" aria-label="Actions">
            <a href={proof.verifierUrl} target="_blank" rel="noopener noreferrer" className="kv-btn kv-btn--primary">
              <ExternalIcon />
              <span className="kv-btn__txt">Open</span>
            </a>

            <button type="button" onClick={() => void handleCopyLink()} className="kv-btn kv-btn--ghost" title="💠 Remember Path">
              <RememberIcon />
              <span className="kv-btn__txt">{copyLinkStatus === "ok" ? "Remembered" : "Path"}</span>
            </button>

            <button type="button" onClick={() => void handleCopyProof()} className="kv-btn kv-btn--ghost" title="💠 Remember Proof">
              <RememberIcon />
              <span className="kv-btn__txt">{copyProofStatus === "ok" ? "Remembered" : "Proof"}</span>
            </button>

            <div className="kv-toast" aria-live="polite">
              {copyProofStatus === "error" || copyLinkStatus === "error"
                ? "Remember failed"
                : copyProofStatus === "ok"
                  ? "Proof remembered"
                  : copyLinkStatus === "ok"
                    ? "Link remembered"
                    : ""}
            </div>
          </div>

          <div className="kv-url" aria-label="Verifier URL">
            <span className="kv-url__k">Verifier:</span>
            <span className="kv-url__v">{proof.verifierUrl}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
