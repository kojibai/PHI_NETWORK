// src/pages/ShareVerifyPage.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import "./VerifyPage.css";

import {
  buildBundleUnsigned,
  hashBundle,
  hashProofCapsuleV1,
  hashSvgText,
  PROOF_CANON,
  PROOF_HASH_ALG,
  type ProofCapsuleV1,
  type ProofFrameV1,
} from "../components/KaiVoh/verifierProof";
import { tryVerifyGroth16 } from "../components/VerifierStamper/zk";
import { isKASAuthorSig, parseAuthorSig, type AuthorSig } from "../utils/authorSig";
import { verifyBundleAuthorSig } from "../utils/webauthnKAS";

type FetchState = "idle" | "loading" | "error" | "ok";
type SealState = "off" | "busy" | "valid" | "invalid" | "na";
type SvgBindState = "idle" | "loading" | "match" | "mismatch" | "unavailable" | "error";

type ProofFrameShareV1 = ProofFrameV1 & {
  proofCapsule: ProofCapsuleV1;
  capsuleHash: string;
  svgHash: string;
  bundleHash: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProofCapsule(value: unknown): value is ProofCapsuleV1 {
  if (!isRecord(value)) return false;
  return (
    value.v === "KPV-1" &&
    typeof value.pulse === "number" &&
    typeof value.chakraDay === "string" &&
    typeof value.kaiSignature === "string" &&
    typeof value.phiKey === "string" &&
    typeof value.verifierSlug === "string"
  );
}

function isProofFrameShare(value: unknown): value is ProofFrameShareV1 {
  if (!isRecord(value)) return false;
  return (
    value.v === "KVPF-1" &&
    typeof value.hashAlg === "string" &&
    typeof value.canon === "string" &&
    typeof value.verifierUrl === "string" &&
    typeof value.verifierBaseUrl === "string" &&
    typeof value.verifierSlug === "string" &&
    typeof value.pulse === "number" &&
    typeof value.kaiSignature === "string" &&
    typeof value.kaiSignatureShort === "string" &&
    typeof value.phiKey === "string" &&
    isProofCapsule(value.proofCapsule) &&
    typeof value.capsuleHash === "string" &&
    typeof value.svgHash === "string" &&
    typeof value.bundleHash === "string"
  );
}

function ellipsizeMiddle(s: string, head = 16, tail = 12): string {
  const t = (s || "").trim();
  if (!t) return "—";
  if (t.length <= head + tail + 3) return t;
  return `${t.slice(0, head)}…${t.slice(t.length - tail)}`;
}

function shortHash(s: string): string {
  return ellipsizeMiddle(s, 10, 8);
}

function buildShareUrl(bundleHash: string): string {
  if (typeof window === "undefined") return "";
  const base = typeof import.meta !== "undefined" && typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "/";
  const trimmed = base.replace(/\/+$/, "");
  const prefix = trimmed.length > 0 ? trimmed : "";
  const path = `${prefix}/s/${encodeURIComponent(bundleHash)}`;
  return new URL(path, window.location.origin).toString();
}

function buildShareFetchUrl(bundleHash: string, suffix: string): string {
  if (typeof window === "undefined") return "";
  const base = typeof import.meta !== "undefined" && typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "/";
  const trimmed = base.replace(/\/+$/, "");
  const prefix = trimmed.length > 0 ? trimmed : "";
  const path = `${prefix}/s/${encodeURIComponent(bundleHash)}${suffix}`;
  return new URL(path, window.location.origin).toString();
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

async function readFileText(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

export default function ShareVerifyPage(): ReactElement {
  const { hash = "" } = useParams<{ hash: string }>();
  const bundleHash = hash.trim().toLowerCase();

  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [frame, setFrame] = useState<ProofFrameShareV1 | null>(null);
  const [frameError, setFrameError] = useState<string>("");

  const [capsuleHashOk, setCapsuleHashOk] = useState<boolean | null>(null);
  const [bundleHashOk, setBundleHashOk] = useState<boolean | null>(null);
  const [bundleHashComputed, setBundleHashComputed] = useState<string>("");
  const [authorSig, setAuthorSig] = useState<AuthorSig | null>(null);
  const [kasVerified, setKasVerified] = useState<boolean | null>(null);

  const [zkVerify, setZkVerify] = useState<boolean | null>(null);
  const [zkVkey, setZkVkey] = useState<unknown>(null);

  const [svgBindState, setSvgBindState] = useState<SvgBindState>("idle");
  const [svgFetchedHash, setSvgFetchedHash] = useState<string>("");

  const [fileCompareHash, setFileCompareHash] = useState<string>("");
  const [fileCompareMatch, setFileCompareMatch] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const shareUrl = useMemo(() => (bundleHash ? buildShareUrl(bundleHash) : ""), [bundleHash]);

  useEffect(() => {
    let active = true;
    if (!bundleHash) {
      setFetchState("idle");
      setFrame(null);
      setFrameError("");
      return;
    }

    const run = async (): Promise<void> => {
      setFetchState("loading");
      setFrame(null);
      setFrameError("");
      try {
        const url = buildShareFetchUrl(bundleHash, ".json");
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          if (!active) return;
          setFetchState("error");
          setFrameError(`Share proof unavailable (${res.status}).`);
          return;
        }
        const json = (await res.json()) as unknown;
        if (!active) return;
        if (!isProofFrameShare(json)) {
          setFetchState("error");
          setFrameError("Invalid share payload (KVPF-1).");
          return;
        }
        setFrame(json);
        setAuthorSig(parseAuthorSig(json.authorSig));
        setFetchState("ok");
      } catch (err) {
        if (!active) return;
        setFetchState("error");
        const msg = err instanceof Error ? err.message : "Share fetch failed.";
        setFrameError(msg);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [bundleHash]);

  useEffect(() => {
    let active = true;
    if (!frame) {
      setCapsuleHashOk(null);
      setBundleHashOk(null);
      setBundleHashComputed("");
      return;
    }

    (async () => {
      const capsuleHash = await hashProofCapsuleV1(frame.proofCapsule);
      if (!active) return;
      setCapsuleHashOk(capsuleHash === frame.capsuleHash);

      const bundleSeed = {
        hashAlg: frame.hashAlg || PROOF_HASH_ALG,
        canon: frame.canon || PROOF_CANON,
        proofCapsule: frame.proofCapsule,
        capsuleHash: frame.capsuleHash,
        svgHash: frame.svgHash,
        shareUrl: frame.shareUrl ?? undefined,
        verifierUrl: frame.verifierUrl ?? undefined,
        zkPoseidonHash: frame.zkPoseidonHash,
        zkProof: frame.zkProof,
        proofHints: frame.proofHints,
        zkPublicInputs: frame.zkPublicInputs,
        authorSig: frame.authorSig ?? null,
      };
      const unsigned = buildBundleUnsigned(bundleSeed);
      const computed = await hashBundle(unsigned);
      if (!active) return;
      setBundleHashComputed(computed);
      setBundleHashOk(computed === frame.bundleHash);
    })();

    return () => {
      active = false;
    };
  }, [frame]);

  useEffect(() => {
    let active = true;
    if (!frame || !bundleHashComputed) {
      setKasVerified(null);
      return;
    }

    (async () => {
      if (!authorSig || !isKASAuthorSig(authorSig)) {
        if (active) setKasVerified(false);
        return;
      }
      const ok = await verifyBundleAuthorSig(bundleHashComputed || frame.bundleHash, authorSig);
      if (!active) return;
      setKasVerified(ok);
    })();

    return () => {
      active = false;
    };
  }, [authorSig, bundleHashComputed, frame]);

  useEffect(() => {
    let active = true;
    if (!frame?.zkProof || !frame.zkPublicInputs) {
      setZkVerify(null);
      return;
    }

    (async () => {
      if (!zkVkey) {
        try {
          const res = await fetch("/zk/verification_key.json", { cache: "no-store" });
          if (!res.ok) return;
          const vkey = (await res.json()) as unknown;
          if (!active) return;
          setZkVkey(vkey);
        } catch {
          return;
        }
      }

      const inputs =
        typeof frame.zkPublicInputs === "string"
          ? (() => {
              try {
                return JSON.parse(frame.zkPublicInputs);
              } catch {
                return [frame.zkPublicInputs];
              }
            })()
          : frame.zkPublicInputs;

      const verified = await tryVerifyGroth16({
        proof: frame.zkProof,
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
  }, [frame, zkVkey]);

  useEffect(() => {
    let active = true;
    if (!bundleHash || !frame) {
      setSvgBindState("idle");
      setSvgFetchedHash("");
      return;
    }

    (async () => {
      setSvgBindState("loading");
      setSvgFetchedHash("");
      try {
        const svgUrl = buildShareFetchUrl(bundleHash, ".svg");
        const res = await fetch(svgUrl, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404 && active) {
            setSvgBindState("unavailable");
            return;
          }
          if (active) setSvgBindState("error");
          return;
        }
        const svgText = await res.text();
        const hash = await hashSvgText(svgText);
        if (!active) return;
        setSvgFetchedHash(hash);
        setSvgBindState(hash === frame.svgHash ? "match" : "mismatch");
      } catch {
        if (active) setSvgBindState("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [bundleHash, frame]);

  const onCompareFile = useCallback(async (file: File | null): Promise<void> => {
    if (!file || !frame) return;
    try {
      const text = await readFileText(file);
      const hash = await hashSvgText(text);
      setFileCompareHash(hash);
      setFileCompareMatch(hash === frame.svgHash);
    } catch {
      setFileCompareHash("");
      setFileCompareMatch(false);
    }
  }, [frame]);

  const proofVerified = Boolean(
    frame &&
      capsuleHashOk &&
      bundleHashOk &&
      kasVerified === true &&
      zkVerify === true
  );

  const kasState: SealState = useMemo(() => {
    if (!frame?.authorSig) return "off";
    if (kasVerified === null) return "na";
    return kasVerified ? "valid" : "invalid";
  }, [frame?.authorSig, kasVerified]);

  const g16State: SealState = useMemo(() => {
    if (!frame?.zkPoseidonHash) return "off";
    if (zkVerify === null) return "na";
    return zkVerify ? "valid" : "invalid";
  }, [frame?.zkPoseidonHash, zkVerify]);

  const svgStateLabel = useMemo(() => {
    if (svgBindState === "match") return "SVG BOUND ✅";
    if (svgBindState === "mismatch") return "SVG MISMATCH ❌";
    if (svgBindState === "unavailable") return "SVG unavailable — upload to compare";
    if (svgBindState === "error") return "SVG unavailable";
    if (svgBindState === "loading") return "SVG checking…";
    return "SVG idle";
  }, [svgBindState]);

  const badgeTitle = useMemo(() => {
    if (fetchState === "loading") return "CHECKING";
    if (fetchState === "error") return "UNVERIFIED";
    return proofVerified ? "VERIFIED" : "UNVERIFIED";
  }, [fetchState, proofVerified]);

  const receiptText = useMemo(() => {
    if (!frame || !shareUrl || !proofVerified) return "";
    const lines = [
      "Proof of Breath™ — VERIFIED",
      shareUrl,
      `Pulse ${frame.pulse}`,
      `ΦKey ${shortHash(frame.phiKey)}`,
      `bundleHash ${shortHash(frame.bundleHash)}`,
      `svgHash ${shortHash(frame.svgHash)}`,
      `KAS ✅ • G16 ✅ • SVG ${svgBindState === "match" ? "✅" : "❌"}`,
    ];
    return lines.join("\n");
  }, [frame, proofVerified, shareUrl, svgBindState]);

  const handleCopyReceipt = useCallback(async () => {
    if (!receiptText) return;
    await copyTextToClipboard(receiptText);
  }, [receiptText]);

  const handleCopyField = useCallback(async (value: string) => {
    if (!value) return;
    await copyTextToClipboard(value);
  }, []);

  return (
    <div className="vapp" role="application" aria-label="Share verifier">
      <header className="vhead">
        <div className="vhead-left">
          <div className="vbrand">
            <div className="vtitle">Share Verifier</div>
            <div className="vsub">Bundle-bound proof verification (share mode).</div>
          </div>

          <div className="vlink">
            <span className="vlink-k">Path</span>
            <code className="vlink-v mono">/s/{bundleHash || "—"}</code>
          </div>
        </div>

        <div className="vhead-right">
          <div className="vhead-top" aria-label="Verification status">
            <div className="official" data-kind={proofVerified ? "ok" : fetchState === "loading" ? "busy" : fetchState === "error" ? "fail" : "idle"} aria-live="polite">
              <div className="official-top">
                <div className="official-ring" aria-hidden="true">
                  {proofVerified ? <span className="official-check">✓</span> : null}
                </div>
                <div className="official-title">{badgeTitle}</div>
              </div>
              <div className="official-sub">
                {fetchState === "error" ? frameError || "Share proof unavailable." : proofVerified ? "Cryptographic checks passed." : "Awaiting proof checks."}
              </div>
            </div>
          </div>

          <div className="vseals" aria-label="Proof seals">
            <div className="seal" data-state={kasState}>
              <span className="seal-ic" aria-hidden="true">
                {kasState === "valid" ? "✓" : kasState === "invalid" ? "✕" : kasState === "busy" ? "⟡" : kasState === "na" ? "—" : "·"}
              </span>
              <span className="seal-lbl">KAS</span>
              <span className="seal-txt">{kasState === "valid" ? "VERIFIED" : kasState === "invalid" ? "INVALID" : kasState === "busy" ? "CHECKING" : kasState === "na" ? "N/A" : "ABSENT"}</span>
            </div>
            <div className="seal" data-state={g16State}>
              <span className="seal-ic" aria-hidden="true">
                {g16State === "valid" ? "✓" : g16State === "invalid" ? "✕" : g16State === "busy" ? "⟡" : g16State === "na" ? "—" : "·"}
              </span>
              <span className="seal-lbl">G16</span>
              <span className="seal-txt">{g16State === "valid" ? "VERIFIED" : g16State === "invalid" ? "INVALID" : g16State === "busy" ? "CHECKING" : g16State === "na" ? "N/A" : "ABSENT"}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="vbody">
        <section className="vpanel" role="tabpanel" aria-label="Share verification">
          <div className="vcard" data-panel="share">
            <div className="vcard-head">
              <div className="vcard-title">Proof capsule</div>
              <div className="vcard-sub">This view only trusts cryptographic checks (KAS + G16 + capsule hash).</div>
            </div>

            <div className="vcard-body">
              <div className="vrow">
                <div className="vk">Share link</div>
                <div className="vv mono">{shareUrl || "—"}</div>
                <div className="vrow-actions">
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => void handleCopyField(shareUrl)}>
                    💠
                  </button>
                </div>
              </div>

              <div className="vrow">
                <div className="vk">pulse</div>
                <div className="vv mono">{frame ? String(frame.pulse) : "—"}</div>
              </div>

              <div className="vrow">
                <div className="vk">phiKey</div>
                <div className="vv mono" title={frame?.phiKey || ""}>
                  {frame?.phiKey ? ellipsizeMiddle(frame.phiKey, 12, 10) : "—"}
                </div>
                <div className="vrow-actions">
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => void handleCopyField(frame?.phiKey ?? "")} disabled={!frame?.phiKey}>
                    💠
                  </button>
                </div>
              </div>

              <div className="vrow">
                <div className="vk">kaiSignature</div>
                <div className="vv mono" title={frame?.kaiSignature || ""}>
                  {frame?.kaiSignature ? ellipsizeMiddle(frame.kaiSignature, 12, 10) : "—"}
                </div>
                <div className="vrow-actions">
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => void handleCopyField(frame?.kaiSignature ?? "")} disabled={!frame?.kaiSignature}>
                    💠
                  </button>
                </div>
              </div>

              <div className="vrow">
                <div className="vk">capsuleHash</div>
                <div className="vv mono" title={frame?.capsuleHash || ""}>
                  {frame?.capsuleHash ? ellipsizeMiddle(frame.capsuleHash, 22, 16) : "—"}
                </div>
                <div className="vrow-actions">
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => void handleCopyField(frame?.capsuleHash ?? "")} disabled={!frame?.capsuleHash}>
                    💠
                  </button>
                </div>
              </div>

              <div className="vrow">
                <div className="vk">bundleHash</div>
                <div className="vv mono" title={frame?.bundleHash || ""}>
                  {frame?.bundleHash ? ellipsizeMiddle(frame.bundleHash, 22, 16) : "—"}
                </div>
                <div className="vrow-actions">
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => void handleCopyField(frame?.bundleHash ?? "")} disabled={!frame?.bundleHash}>
                    💠
                  </button>
                </div>
              </div>

              <div className="vrow">
                <div className="vk">svgHash</div>
                <div className="vv mono" title={frame?.svgHash || ""}>
                  {frame?.svgHash ? ellipsizeMiddle(frame.svgHash, 22, 16) : "—"}
                </div>
                <div className="vrow-actions">
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => void handleCopyField(frame?.svgHash ?? "")} disabled={!frame?.svgHash}>
                    💠
                  </button>
                </div>
              </div>

              <div className="vrow">
                <div className="vk">Capsule hash</div>
                <div className="vv mono">{capsuleHashOk == null ? "—" : capsuleHashOk ? "✅ match" : "❌ mismatch"}</div>
              </div>

              <div className="vrow">
                <div className="vk">Bundle hash</div>
                <div className="vv mono">{bundleHashOk == null ? "—" : bundleHashOk ? "✅ match" : "❌ mismatch"}</div>
              </div>

              <div className="vrow">
                <div className="vk">SVG binding</div>
                <div className="vv mono">{svgStateLabel}</div>
              </div>

              {svgFetchedHash ? (
                <div className="vrow">
                  <div className="vk">Fetched svgHash</div>
                  <div className="vv mono">{ellipsizeMiddle(svgFetchedHash, 22, 16)}</div>
                  <div className="vrow-actions">
                    <button type="button" className="vbtn vbtn--ghost" onClick={() => void handleCopyField(svgFetchedHash)}>
                      💠
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="vrow">
                <div className="vk">Compare SVG</div>
                <div className="vv">
                  <button type="button" className="vbtn vbtn--ghost" onClick={() => fileInputRef.current?.click()}>
                    Upload SVG
                  </button>
                  <input
                    ref={fileInputRef}
                    className="vfile"
                    type="file"
                    accept=".svg,image/svg+xml"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0] ?? null;
                      void onCompareFile(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
              </div>

              {fileCompareMatch != null ? (
                <div className="vrow">
                  <div className="vk">File compare</div>
                  <div className="vv mono">{fileCompareMatch ? "FILE MATCH ✅" : "FILE MISMATCH ❌"}</div>
                </div>
              ) : null}

              {fileCompareHash ? (
                <div className="vrow">
                  <div className="vk">File svgHash</div>
                  <div className="vv mono">{ellipsizeMiddle(fileCompareHash, 22, 16)}</div>
                  <div className="vrow-actions">
                    <button type="button" className="vbtn vbtn--ghost" onClick={() => void handleCopyField(fileCompareHash)}>
                      💠
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="vconsole-foot">
              <div className="vactions">
                <button type="button" className="vbtn vbtn--primary" onClick={() => void handleCopyReceipt()} disabled={!receiptText}>
                  Copy Verified Receipt
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
