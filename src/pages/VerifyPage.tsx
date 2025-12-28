"use client";

import React, { useCallback, useMemo, useState, type ReactElement } from "react";
import "./VerifyPage.css";

import VerifierFrame from "../components/KaiVoh/VerifierFrame";
import { parseSlug, verifySigilSvg, type VerifyResult } from "../utils/verifySigil";
import {
  buildVerifierSlug,
  buildVerifierUrl,
  hashBundle,
  hashProofCapsuleV1,
  hashSvgText,
  normalizeChakraDay,
  PROOF_CANON,
  PROOF_HASH_ALG,
  type ProofCapsuleV1,
} from "../components/KaiVoh/verifierProof";
import { extractProofBundleMetaFromSvg, type ProofBundleMeta } from "../utils/sigilMetadata";

function readSlugFromLocation(): string {
  if (typeof window === "undefined") return "";

  // support both:
  // - /verify/<slug>
  // - /#/verify/<slug> (hash routers)
  const path = window.location.pathname || "";
  const hash = window.location.hash || "";

  const m1 = path.match(/\/verify\/([^/?#]+)/);
  if (m1 && m1[1]) return m1[1];

  const m2 = hash.match(/\/verify\/([^/?#]+)/);
  if (m2 && m2[1]) return m2[1];

  return "";
}


async function readFileText(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

export default function VerifyPage(): ReactElement {
  const slugRaw = useMemo(() => readSlugFromLocation(), []);
  const slug = useMemo(() => parseSlug(slugRaw), [slugRaw]);

  const [svgText, setSvgText] = useState<string>("");
  const [result, setResult] = useState<VerifyResult>({ status: "idle" });
  const [busy, setBusy] = useState<boolean>(false);
  const [proofCapsule, setProofCapsule] = useState<ProofCapsuleV1 | null>(null);
  const [capsuleHash, setCapsuleHash] = useState<string>("");
  const [svgHash, setSvgHash] = useState<string>("");
  const [bundleHash, setBundleHash] = useState<string>("");
  const [embeddedProof, setEmbeddedProof] = useState<ProofBundleMeta | null>(null);
  const [copyNotice, setCopyNotice] = useState<string>("");

  const verifierFrameProps = useMemo(() => {
    // If we only have the slug, we can still render the capsule.
    // The actual verification happens after user provides the sealed SVG text.
    const pulse = slug.pulse ?? 0;
    const kaiSignature = slug.shortSig ?? "unknown-signature";
    return { pulse, kaiSignature, phiKey: "—" };
  }, [slug.pulse, slug.shortSig]);

  const proofVerifierUrl = useMemo(() => {
    if (!proofCapsule) return "";
    return buildVerifierUrl(proofCapsule.pulse, proofCapsule.kaiSignature);
  }, [proofCapsule]);

  const runVerify = useCallback(async (): Promise<void> => {
    const raw = svgText.trim();
    if (!raw) {
      setResult({
        status: "error",
        message: "Paste the sealed SVG text or upload the sealed SVG file first.",
        slug,
      });
      return;
    }

    setBusy(true);
    try {
      const next = await verifySigilSvg(slug, raw);
      setResult(next);
    } finally {
      setBusy(false);
    }
  }, [slug, svgText]);

  const copyText = useCallback(async (text: string, label: string): Promise<void> => {
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) {
        setCopyNotice("Clipboard unavailable. Use manual copy.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopyNotice(`${label} copied.`);
    } catch (err) {
      setCopyNotice("Copy failed. Use manual copy.");
      console.error(err);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    const buildProof = async (): Promise<void> => {
      if (result.status !== "ok") {
        setProofCapsule(null);
        setCapsuleHash("");
        setSvgHash("");
        setBundleHash("");
        setEmbeddedProof(null);
        setCopyNotice("");
        return;
      }

      const kaiSignature = result.embedded.kaiSignature ?? "";
      const pulse = result.embedded.pulse ?? result.slug.pulse ?? 0;
      const chakraDay =
        normalizeChakraDay(result.embedded.chakraDay ?? "") ??
        "Crown";
      const phiKey = result.derivedPhiKey;
      const verifierSlug = buildVerifierSlug(pulse, kaiSignature);
      const fallbackCapsule: ProofCapsuleV1 = {
        v: "KPV-1",
        pulse,
        chakraDay,
        kaiSignature,
        phiKey,
        verifierSlug,
      };

      const svgHashNext = await hashSvgText(svgText);
      const embedded = extractProofBundleMetaFromSvg(svgText);
      const capsule = embedded?.proofCapsule ?? fallbackCapsule;
      const capsuleHashNext = await hashProofCapsuleV1(capsule);
      const bundleHashNext = await hashBundle(capsuleHashNext, svgHashNext);

      if (!active) return;
      setProofCapsule(capsule);
      setSvgHash(svgHashNext);
      setCapsuleHash(capsuleHashNext);
      setBundleHash(bundleHashNext);
      setEmbeddedProof(embedded);
    };
    void buildProof();
    return () => {
      active = false;
    };
  }, [result, slug.raw, svgText]);

  const onPickFile = useCallback(async (file: File): Promise<void> => {
    // We verify SVG text (offline). If user drops non-SVG, show error.
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setResult({
        status: "error",
        message: "Upload a sealed .svg (this verifier reads embedded <metadata> JSON).",
        slug,
      });
      return;
    }
    const text = await readFileText(file);
    setSvgText(text);
    setResult({ status: "idle" });
  }, [slug]);

  return (
    <div className="verify-page">
      <header className="verify-hero">
        <h1 className="verify-title">Kai-Sigil Verifier</h1>
        <p className="verify-subtitle">
          Open a sealed memory and verify its human origin by Kai Signature → Φ-Key.
        </p>

        <div className="verify-slug">
          <span className="verify-slug-label">Link:</span>
          <code className="verify-slug-value">/verify/{slug.raw || "—"}</code>
        </div>
      </header>

      <main className="verify-main">
        <section className="verify-card">
          <h2 className="verify-card-title">1) Provide the sealed post</h2>

          <div className="verify-upload-row">
            <label className="verify-upload">
              <input
                type="file"
                accept=".svg,image/svg+xml"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) void onPickFile(f);
                  e.currentTarget.value = "";
                }}
              />
              Upload sealed SVG
            </label>

            <button
              type="button"
              className="verify-btn"
              onClick={() => void runVerify()}
              disabled={busy}
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
          </div>

          <textarea
            className="verify-textarea"
            value={svgText}
            onChange={(e) => {
              setSvgText(e.currentTarget.value);
              setResult({ status: "idle" });
            }}
            placeholder="Or paste the sealed SVG text here (must include <metadata>{...}</metadata> with kaiSignature + pulse + userPhiKey/phiKey)."
            spellCheck={false}
          />
        </section>

        <section className="verify-card">
          <h2 className="verify-card-title">2) Proof capsule</h2>

          {result.status === "ok" ? (
        <VerifierFrame
  pulse={result.embedded.pulse ?? (slug.pulse ?? 0)}
  kaiSignature={result.embedded.kaiSignature ?? (slug.shortSig ?? "unknown")}
  phiKey={result.derivedPhiKey}
  chakraDay={result.embedded.chakraDay}
  compact={false}
/>

          ) : (
 <VerifierFrame
  pulse={verifierFrameProps.pulse}
  kaiSignature={verifierFrameProps.kaiSignature}
  phiKey={verifierFrameProps.phiKey}
  compact={false}
/>

          )}

          <div className="verify-status">
            {result.status === "idle" ? (
              <p className="verify-muted">Upload/paste a sealed SVG, then click Verify.</p>
            ) : result.status === "ok" ? (
              <div className="verify-ok">
                <div className="verify-badge verify-badge--ok">Verified</div>
                <p className="verify-line">
                  Sealed by Φ-Key: <code>{result.derivedPhiKey}</code>
                </p>
                <ul className="verify-checks">
                  <li>
                    slug pulse match:{" "}
                    <strong>{result.checks.slugPulseMatches === null ? "n/a" : String(result.checks.slugPulseMatches)}</strong>
                  </li>
                  <li>
                    slug shortSig match:{" "}
                    <strong>{result.checks.slugShortSigMatches === null ? "n/a" : String(result.checks.slugShortSigMatches)}</strong>
                  </li>
                  <li>
                    derived Φ-Key matches embedded:{" "}
                    <strong>
                      {result.checks.derivedPhiKeyMatchesEmbedded === null
                        ? "n/a (embed omitted phiKey)"
                        : String(result.checks.derivedPhiKeyMatchesEmbedded)}
                    </strong>
                  </li>
                </ul>

                {proofCapsule ? (
                  <div className="verify-proof">
                    <h3 className="verify-proof-title">3) Proof bundle (capsule + SVG)</h3>
                    <p className="verify-proof-note">
                      Deterministic capsule hash (capsuleHash) + SVG hash (svgHash) → bundleHash.
                    </p>
                    <div className="verify-proof-row">
                      <span className="verify-proof-label">Hash algorithm</span>
                      <code className="verify-proof-code">{PROOF_HASH_ALG}</code>
                      <button
                        type="button"
                        className="verify-copy-btn"
                        onClick={() => void copyText(PROOF_HASH_ALG, "Hash algorithm")}
                      >
                        Copy
                      </button>
                    </div>
                    <div className="verify-proof-row">
                      <span className="verify-proof-label">Canonicalization</span>
                      <code className="verify-proof-code">{PROOF_CANON}</code>
                      <button
                        type="button"
                        className="verify-copy-btn"
                        onClick={() => void copyText(PROOF_CANON, "Canonicalization")}
                      >
                        Copy
                      </button>
                    </div>
                    <div className="verify-proof-row">
                      <span className="verify-proof-label">Verifier URL</span>
                      <code className="verify-proof-code">{proofVerifierUrl || "—"}</code>
                      <button
                        type="button"
                        className="verify-copy-btn"
                        onClick={() => void copyText(proofVerifierUrl, "Verifier URL")}
                        disabled={!proofVerifierUrl}
                      >
                        Copy
                      </button>
                    </div>
                    <div className="verify-proof-row">
                      <span className="verify-proof-label">SVG hash</span>
                      <code className="verify-proof-code">{svgHash}</code>
                      <button
                        type="button"
                        className="verify-copy-btn"
                        onClick={() => void copyText(svgHash, "SVG hash")}
                      >
                        Copy
                      </button>
                    </div>
                    <div className="verify-proof-row">
                      <span className="verify-proof-label">Capsule hash</span>
                      <code className="verify-proof-code">{capsuleHash}</code>
                      <button
                        type="button"
                        className="verify-copy-btn"
                        onClick={() => void copyText(capsuleHash, "Capsule hash")}
                      >
                        Copy
                      </button>
                    </div>
                    <div className="verify-proof-row">
                      <span className="verify-proof-label">Bundle hash</span>
                      <code className="verify-proof-code">{bundleHash}</code>
                      <button
                        type="button"
                        className="verify-copy-btn"
                        onClick={() => void copyText(bundleHash, "Bundle hash")}
                      >
                        Copy
                      </button>
                    </div>
                    <textarea
                      className="verify-proof-textarea"
                      readOnly
                      value={JSON.stringify(
                        {
                          hashAlg: PROOF_HASH_ALG,
                          canon: PROOF_CANON,
                          proofCapsule,
                          capsuleHash,
                          svgHash,
                          bundleHash,
                          verifierUrl: proofVerifierUrl,
                          authorSig: embeddedProof?.authorSig ?? null,
                        },
                        null,
                        2,
                      )}
                    />
                    {embeddedProof ? (
                      <ul className="verify-checks">
                        <li>
                          embedded hashAlg match:{" "}
                          <strong>{embeddedProof.hashAlg ? String(embeddedProof.hashAlg === PROOF_HASH_ALG) : "n/a"}</strong>
                        </li>
                        <li>
                          embedded canon match:{" "}
                          <strong>{embeddedProof.canon ? String(embeddedProof.canon === PROOF_CANON) : "n/a"}</strong>
                        </li>
                        <li>
                          embedded svgHash match:{" "}
                          <strong>{embeddedProof.svgHash ? String(embeddedProof.svgHash === svgHash) : "n/a"}</strong>
                        </li>
                        <li>
                          embedded capsuleHash match:{" "}
                          <strong>{embeddedProof.capsuleHash ? String(embeddedProof.capsuleHash === capsuleHash) : "n/a"}</strong>
                        </li>
                        <li>
                          embedded bundleHash match:{" "}
                          <strong>{embeddedProof.bundleHash ? String(embeddedProof.bundleHash === bundleHash) : "n/a"}</strong>
                        </li>
                        <li>
                          author signature present:{" "}
                          <strong>{embeddedProof.authorSig ? "true" : "false"}</strong>
                        </li>
                      </ul>
                    ) : (
                      <p className="verify-proof-note">No embedded proof bundle detected in &lt;metadata id="kai-voh-proof"&gt;.</p>
                    )}
                    {copyNotice ? <p className="verify-proof-note">{copyNotice}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="verify-fail">
                <div className="verify-badge verify-badge--fail">Not verified</div>
                <p className="verify-line">{result.message}</p>

                {result.checks ? (
                  <ul className="verify-checks">
                    <li>
                      slug pulse match:{" "}
                      <strong>{result.checks.slugPulseMatches === null ? "n/a" : String(result.checks.slugPulseMatches)}</strong>
                    </li>
                    <li>
                      slug shortSig match:{" "}
                      <strong>{result.checks.slugShortSigMatches === null ? "n/a" : String(result.checks.slugShortSigMatches)}</strong>
                    </li>
                    <li>
                      derived Φ-Key matches embedded:{" "}
                      <strong>
                        {result.checks.derivedPhiKeyMatchesEmbedded === null
                          ? "n/a (embed omitted phiKey)"
                          : String(result.checks.derivedPhiKeyMatchesEmbedded)}
                      </strong>
                    </li>
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
