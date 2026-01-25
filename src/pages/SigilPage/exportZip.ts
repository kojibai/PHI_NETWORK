// src/pages/SigilPage/exportZip.ts
"use client";

import { pngBlobFromSvg } from "../../utils/qrExport";
import { makeProvenanceEntry } from "../../utils/provenance";
import { retagSvgIdsForStep, ensureCanonicalMetadataFirst } from "./svgOps";
import { loadJSZip, signal } from "./utils";
import { makeSigilUrl, type SigilSharePayload } from "../../utils/sigilUrl";
import { rewriteUrlPayload } from "../../utils/shareUrl";
import {
  sha256HexCanon,
  derivePhiKeyFromSigCanon,
  verifierSigmaString,
  readIntentionSigil,
} from "./verifierCanon";
import type { SigilPayload } from "../../types/sigil";
import { extractEmbeddedMetaFromSvg } from "../../utils/sigilMetadata";
import { embedProofMetadata } from "../../utils/svgProof";
import { buildProofHints, generateZkProofFromPoseidonHash } from "../../utils/zkProof";
import { computeZkPoseidonHash } from "../../utils/kai";
import { ensureTitleAndDesc, ensureViewBoxOnClone, ensureXmlns } from "../../utils/svgMeta";
import {
  buildBundleUnsigned,
  buildVerifierUrl,
  hashBundle,
  hashProofCapsuleV1,
  hashSvgText,
  normalizeChakraDay,
  PROOF_CANON,
  PROOF_HASH_ALG,
  type ProofCapsuleV1,
} from "../../components/KaiVoh/verifierProof";
import type { SigilProofHints } from "../../types/sigil";

/**
 * We export at the largest possible px that the *current device* can actually rasterize.
 * iOS Safari is the most sensitive; we'll try big -> smaller until it succeeds.
 */
// Desktop can handle 4096 reliably
const EXPORT_PX_CANDIDATES_DESKTOP: readonly number[] = [4096];

// ✅ Mobile hard-cap (iOS + generic mobile): 2048 max for reliability
const EXPORT_PX_CANDIDATES_IOS: readonly number[] = [2048, 1536, 1024];
const EXPORT_PX_CANDIDATES_MOBILE_GENERIC: readonly number[] = [2048, 1536, 1024];

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = (navigator as unknown as { platform?: string }).platform || "";
  const maxTouchPoints = (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0;

  // iPadOS sometimes reports MacIntel but has touch points.
  const iOSUA = /iPad|iPhone|iPod/i.test(ua) || /iPad|iPhone|iPod/i.test(platform);
  const iPadOS = platform === "MacIntel" && maxTouchPoints > 1;
  return iOSUA || iPadOS;
}

function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
}

async function pngBlobFromSvgBestFit(
  svgBlob: Blob,
  candidates: readonly number[]
): Promise<{ pngBlob: Blob; usedPxMax: number }> {
  let lastErr: unknown = null;

  for (const px of candidates) {
    try {
      const pngBlob = await pngBlobFromSvg(svgBlob, px);
      return { pngBlob, usedPxMax: px };
    } catch (e) {
      lastErr = e;
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : "Unknown error while rasterizing PNG";
  throw new Error(`PNG export failed at all sizes: ${msg}`);
}

const readPublicInput0 = (inputs: unknown): string | null => {
  if (Array.isArray(inputs) && typeof inputs[0] === "string") {
    return inputs[0];
  }
  if (inputs && typeof inputs === "object") {
    const obj = inputs as Record<string, unknown>;
    if (typeof obj[0] === "string") return obj[0];
    if (typeof obj.publicInput === "string") return obj.publicInput;
    if (typeof obj[1] === "string") return obj[1];
  }
  return null;
};

/** Chakra day union required by SigilSharePayload */
type ChakraDay =
  | "Root"
  | "Sacral"
  | "Solar Plexus"
  | "Heart"
  | "Throat"
  | "Third Eye"
  | "Crown";

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
}

/** Narrow interface with only the fields we actually read/write in this module. */
export type ExportableSigilMeta = {
  pulse: number;
  beat: number;
  chakraDay?: string | null;

  /** canonical / evolving */
  stepsPerBeat?: number;
  stepIndex?: number | null;
  exportedAtPulse?: number | null;
  canonicalHash?: string | null;

  /** identity / signing */
  userPhiKey?: string | null;
  kaiSignature?: string | null;

  /** transfer / expiry (URL token is NOT part of SigilSharePayload) */
  transferNonce?: string | null; // token goes in URL only
  expiresAtPulse?: number | null;
  claimExtendUnit?: "breaths" | "steps";
  claimExtendAmount?: number | null;

  /** misc */
  attachment?: { name?: string | null } | null;
  provenance?: Array<Record<string, unknown>> | null;
};

/** Coerce any free-form value into a valid ChakraDay; default to "Root". */
function asChakraDay(v: unknown): ChakraDay {
  const s = String(v ?? "").trim().toLowerCase();
  switch (s) {
    case "root":
      return "Root";
    case "sacral":
      return "Sacral";
    case "solar plexus":
    case "solar_plexus":
    case "solar-plexus":
      return "Solar Plexus";
    case "heart":
      return "Heart";
    case "throat":
      return "Throat";
    case "third eye":
    case "third_eye":
    case "third-eye":
      return "Third Eye";
    case "crown":
      return "Crown";
    default:
      return "Root";
  }
}

/** Build a strict SigilPayload (no nulls, correct unions) from ExportableSigilMeta. */
function toSigilPayloadStrict(meta: ExportableSigilMeta, sealedStepIndex: number): SigilPayload {
  const out: Record<string, unknown> = {
    pulse: meta.pulse,
    beat: meta.beat,
    chakraDay: asChakraDay(meta.chakraDay),
    stepsPerBeat: meta.stepsPerBeat ?? undefined,
    stepIndex: sealedStepIndex, // MUST be a number for SigilPayload
    userPhiKey: meta.userPhiKey ?? undefined,
    kaiSignature: meta.kaiSignature ?? undefined,
    canonicalHash: meta.canonicalHash ?? undefined,
    transferNonce: meta.transferNonce ?? undefined, // allowed in SVG payload; not in SigilSharePayload
    expiresAtPulse: meta.expiresAtPulse ?? undefined,
    claimExtendUnit: meta.claimExtendUnit ?? undefined,
    claimExtendAmount: meta.claimExtendAmount ?? undefined,
    attachment: meta.attachment ?? undefined,
    provenance: meta.provenance ?? undefined,
  };

  // Strip undefineds to keep payload tidy
  Object.keys(out).forEach((k) => {
    if (out[k] === undefined) delete out[k];
  });

  return out as SigilPayload;
}

/** Helper for building the minimal SigilSharePayload (NO canonicalHash, NO token, NO expiry/claim fields). */
function toSharePayload(
  claimed: Required<Pick<ExportableSigilMeta, "pulse" | "beat">> &
    Pick<ExportableSigilMeta, "chakraDay" | "stepsPerBeat" | "userPhiKey" | "kaiSignature"> & {
      stepIndex: number;
    }
): SigilSharePayload {
  return {
    pulse: claimed.pulse,
    beat: claimed.beat,
    stepIndex: claimed.stepIndex,
    chakraDay: asChakraDay(claimed.chakraDay),
    stepsPerBeat: claimed.stepsPerBeat ?? undefined,
    userPhiKey: claimed.userPhiKey ?? undefined,
    kaiSignature: claimed.kaiSignature ?? undefined,
  };
}

/** Update every place inside the SVG that can carry the share URL. */
function updateSvgUrlSurfaces(svgEl: SVGSVGElement, fullUrl: string): void {
  // Root attribute (consumed by verifiers/exporters)
  svgEl.setAttribute("data-share-url", fullUrl);

  // Any <a> links (SVG 1.1 uses xlink:href; SVG 2 uses href)
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  svgEl.querySelectorAll("a").forEach((aEl) => {
    aEl.setAttribute("href", fullUrl);
    try {
      aEl.setAttributeNS(XLINK_NS, "xlink:href", fullUrl);
    } catch {
      /* noop */
    }
  });

  // Inner-ring text fragments like "u=<url> · b58=… · …"
  const tokenRe = /\bu=([^·\n\r]+?)(?=\s*·|$)/;
  svgEl.querySelectorAll("text").forEach((t) => {
    const s = t.textContent || "";
    if (tokenRe.test(s)) {
      t.textContent = s.replace(tokenRe, `u=${fullUrl}`);
    }
  });
}

/**
 * iOS-safe blob download:
 * - Always use the same "anchor click" behavior you already had.
 * - Never revoke immediately (iOS reads blobs late via Files/Share pipeline).
 */
function downloadBlobAsFile(blob: Blob, filename: string): void {
  const dlUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();
  a.remove();

  // ✅ iOS: keep URL alive long enough for OS to fully read it
  window.setTimeout(() => URL.revokeObjectURL(dlUrl), 60_000);
}

export async function exportZIP(ctx: {
  expired: boolean;
  exporting: boolean;
  setExporting: (b: boolean) => void;
  svgEl: SVGSVGElement | null;
  payload: ExportableSigilMeta | null;
  isFutureSealed: boolean;
  linkStatus: "checking" | "active" | "archived";
  setToast: (s: string) => void;
  expiryUnit: "breaths" | "steps";
  expiryAmount: number;
  localHash: string | null;
  routeHash: string | null;
  transferToken: string | null;
  getKaiPulseEternalInt: (d: Date) => number;
  stepIndexFromPulse: (p: number, steps: number) => number;
  STEPS_PER_BEAT: number;
}) {
  const {
    expired,
    exporting,
    setExporting,
    svgEl,
    payload,
    isFutureSealed,
    linkStatus,
    setToast,
    expiryUnit,
    expiryAmount,
    localHash,
    routeHash,
    transferToken,
    getKaiPulseEternalInt,
    stepIndexFromPulse,
    STEPS_PER_BEAT,
  } = ctx;

  if (expired) return signal(setToast, "Seal window closed");
  if (exporting) return;
  if (!svgEl) return signal(setToast, "No SVG found");
  if (!payload) return signal(setToast, "No payload");
  if (isFutureSealed) return signal(setToast, "Opens after the moment—claim unlocks then");
  if (linkStatus !== "active") return signal(setToast, "Archived link — cannot claim from here");

  try {
    setExporting(true);

    const base = `☤KAI-Sigil_Glyph_v1${(localHash || routeHash || "mint").slice(0, 16)}_${payload.pulse}`;
    const stepsNum = (payload.stepsPerBeat ?? STEPS_PER_BEAT) as number;

    // KKS: sealed step is derived strictly from the sealed pulse and steps/beat
    const sealedStepIndex = stepIndexFromPulse(payload.pulse, stepsNum);

    // KKS: claim step is derived from "now" (for manifest bookkeeping only)
    const nowPulse = getKaiPulseEternalInt(new Date());
    const claimStepIndex = stepIndexFromPulse(nowPulse, stepsNum);

    // Build a strict SigilPayload for provenance computation
    const payloadForProv = toSigilPayloadStrict(payload, sealedStepIndex);

    const provEntry = {
      ...makeProvenanceEntry(
        payload.userPhiKey || "",
        payload.kaiSignature ?? undefined,
        payloadForProv,
        "claim",
        payload.attachment?.name ?? undefined,
        nowPulse
      ),
      stepIndex: sealedStepIndex,
      atStepIndex: claimStepIndex,
    };

    const claimedMeta: ExportableSigilMeta = {
      ...payload,
      exportedAtPulse: nowPulse,
      stepIndex: sealedStepIndex,
      stepsPerBeat: stepsNum, // ensure explicit in metadata
      provenance: [...(payload.provenance ?? []), provEntry],
      claimExtendUnit: payload.claimExtendUnit ?? expiryUnit,
      claimExtendAmount: payload.claimExtendAmount ?? expiryAmount,
      canonicalHash: (localHash || payload.canonicalHash || routeHash || null)?.toString() ?? null,
    };

    // canonical Σ and Φ (0-based stepIndex)
    const canonicalSig = await sha256HexCanon(
      verifierSigmaString(
        claimedMeta.pulse,
        claimedMeta.beat,
        sealedStepIndex,
        String(claimedMeta.chakraDay ?? ""),
        readIntentionSigil(toSigilPayloadStrict(claimedMeta, sealedStepIndex))
      )
    );
    const phiKeyCanon = await derivePhiKeyFromSigCanon(canonicalSig);

    const claimedMetaCanon: ExportableSigilMeta = {
      ...claimedMeta,
      kaiSignature: canonicalSig,
      userPhiKey: claimedMeta.userPhiKey || phiKeyCanon,
    };

    // Build the canonical share URL for manifest — canonical is in the path, NOT the payload
    const canonicalLower = (localHash || routeHash || "").toLowerCase();
    const sharePayloadForManifest = toSharePayload({
      pulse: claimedMetaCanon.pulse,
      beat: claimedMetaCanon.beat,
      stepIndex: sealedStepIndex,
      chakraDay: claimedMetaCanon.chakraDay ?? null,
      stepsPerBeat: stepsNum,
      userPhiKey: claimedMetaCanon.userPhiKey ?? null,
      kaiSignature: claimedMetaCanon.kaiSignature ?? null,
    });

    const baseUrlForManifest = makeSigilUrl(canonicalLower, sharePayloadForManifest);
    const tokenForManifest: string | undefined =
      claimedMetaCanon.transferNonce ?? transferToken ?? undefined;

    const fullUrlForManifest = rewriteUrlPayload(
      baseUrlForManifest,
      sharePayloadForManifest,
      tokenForManifest
    );

    // Canonical payload write only (single call) — include URL hints for readers
    const { putMetadata } = await import("../../utils/svgMeta");
    const metaForSvg: Record<string, unknown> = {
      ...claimedMetaCanon,
      stepsPerBeat: stepsNum,
      shareUrl: fullUrlForManifest, // hint for consumers
      fullUrl: fullUrlForManifest, // alias
    };
    putMetadata(svgEl, metaForSvg);

    // Display-only exposure (non-canonical marker)
    try {
      svgEl.setAttribute("data-step-index", String(sealedStepIndex));
      const NS_SVG = "http://www.w3.org/2000/svg";
      let dispMeta = svgEl.querySelector("metadata#sigil-display");
      if (!dispMeta) {
        dispMeta = document.createElementNS(NS_SVG, "metadata");
        dispMeta.setAttribute("id", "sigil-display");
        dispMeta.setAttribute("data-noncanonical", "1");
        svgEl.appendChild(dispMeta);
      }
      dispMeta.textContent = JSON.stringify({
        stepIndex: sealedStepIndex,
        stepsPerBeat: stepsNum,
      });
    } catch {
      // eslint-disable-next-line no-console
      console.debug("Display metadata write failed");
    }

    // Retag + canonicalize metadata order
    retagSvgIdsForStep(svgEl, claimedMetaCanon.pulse, claimedMetaCanon.beat, sealedStepIndex);
    ensureCanonicalMetadataFirst(svgEl);

    // Update ALL URL surfaces inside the SVG to the canonical manifest URL.
    updateSvgUrlSurfaces(svgEl, fullUrlForManifest);

    // Extract URL bits for the manifest file
    let pValue: string | null = null;
    let tValue: string | null = null;
    try {
      const u = new URL(fullUrlForManifest);
      pValue = u.searchParams.get("p");
      tValue = u.searchParams.get("t");
    } catch {
      // eslint-disable-next-line no-console
      console.debug("URL parse failed");
    }

    // Create artifacts
    const chakraNormalized = normalizeChakraDay(String(claimedMetaCanon.chakraDay ?? ""));
    if (!chakraNormalized) throw new Error("Chakra day missing from SVG.");

    const payloadHashHex = canonicalLower;
    if (!payloadHashHex) throw new Error("Payload hash missing from SVG.");

    const sharePayload: SigilSharePayload = {
      pulse: claimedMetaCanon.pulse,
      beat: claimedMetaCanon.beat,
      stepIndex: sealedStepIndex,
      chakraDay: chakraNormalized,
      stepsPerBeat: stepsNum,
      kaiSignature: claimedMetaCanon.kaiSignature ?? undefined,
      userPhiKey: claimedMetaCanon.userPhiKey ?? undefined,
    };
    const shareUrl = fullUrlForManifest || makeSigilUrl(payloadHashHex, sharePayload);
    const verifierUrl = buildVerifierUrl(claimedMetaCanon.pulse, claimedMetaCanon.kaiSignature ?? "");
    const kaiSignature = claimedMetaCanon.kaiSignature ?? "";
    const phiKey = claimedMetaCanon.userPhiKey ?? "";
    if (!kaiSignature) throw new Error("Export failed: kaiSignature missing from SVG.");
    if (!phiKey) throw new Error("Export failed: Φ-Key missing from SVG.");

    const kaiSignatureShort = kaiSignature.slice(0, 10);
    const proofCapsule: ProofCapsuleV1 = {
      v: "KPV-1",
      pulse: claimedMetaCanon.pulse,
      chakraDay: chakraNormalized,
      kaiSignature,
      phiKey,
      verifierSlug: `${claimedMetaCanon.pulse}-${kaiSignatureShort}`,
    };

    const capsuleHash = await hashProofCapsuleV1(proofCapsule);

    const pxCandidates: readonly number[] = isIOS()
      ? EXPORT_PX_CANDIDATES_IOS
      : isLikelyMobile()
        ? EXPORT_PX_CANDIDATES_MOBILE_GENERIC
        : EXPORT_PX_CANDIDATES_DESKTOP;

    const svgClone = svgEl.cloneNode(true) as SVGElement;
    ensureViewBoxOnClone(svgClone as SVGSVGElement, pxCandidates[0] ?? 4096);
    ensureXmlns(svgClone as SVGSVGElement);
    ensureTitleAndDesc(
      svgClone as SVGSVGElement,
      "Kairos Sigil-Glyph — Sealed KairosMoment",
      "Deterministic sigil-glyph with sovereign metadata. Exported as archived key."
    );

    svgClone.setAttribute("data-pulse", String(claimedMetaCanon.pulse));
    svgClone.setAttribute("data-beat", String(claimedMetaCanon.beat));
    svgClone.setAttribute("data-step-index", String(sealedStepIndex));
    svgClone.setAttribute("data-chakra-day", chakraNormalized);
    svgClone.setAttribute("data-steps-per-beat", String(stepsNum));
    svgClone.setAttribute("data-kai-signature", kaiSignature);
    svgClone.setAttribute("data-phi-key", phiKey);
    svgClone.setAttribute("data-payload-hash", payloadHashHex);

    const svgString = new XMLSerializer().serializeToString(svgClone);

    const embeddedMeta = extractEmbeddedMetaFromSvg(svgString);
    let zkPoseidonHash =
      typeof embeddedMeta.zkPoseidonHash === "string" && embeddedMeta.zkPoseidonHash.trim().length > 0
        ? embeddedMeta.zkPoseidonHash.trim()
        : undefined;
    let zkProof = embeddedMeta.zkProof;
    let proofHints = embeddedMeta.proofHints;
    let zkPublicInputs: unknown = embeddedMeta.zkPublicInputs;

    const allowMissingProof = typeof navigator !== "undefined" && navigator.onLine === false;

    if (!zkPoseidonHash && payloadHashHex) {
      const computed = await computeZkPoseidonHash(payloadHashHex);
      zkPoseidonHash = computed.hash;
    }

    if (zkPoseidonHash) {
      const proofObj =
        zkProof && typeof zkProof === "object" ? (zkProof as Record<string, unknown>) : null;

      const hasProof =
        typeof zkProof === "string"
          ? zkProof.trim().length > 0
          : Array.isArray(zkProof)
            ? zkProof.length > 0
            : proofObj
              ? Object.keys(proofObj).length > 0
              : false;

      let secretForProof: string | undefined;
      if (payloadHashHex) {
        const computed = await computeZkPoseidonHash(payloadHashHex);
        if (computed.hash === zkPoseidonHash) {
          secretForProof = computed.secret;
        }
      }

      if (!hasProof && !secretForProof) {
        if (!allowMissingProof) throw new Error("ZK secret missing for proof generation");
      }

      if (!hasProof && secretForProof) {
        const generated = await generateZkProofFromPoseidonHash({
          poseidonHash: zkPoseidonHash,
          secret: secretForProof,
          proofHints:
            typeof proofHints === "object" && proofHints !== null
              ? (proofHints as SigilProofHints)
              : undefined,
        });
        if (!generated) {
          if (!allowMissingProof) throw new Error("ZK proof generation failed");
        } else {
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
    if (zkPoseidonHash && (!zkProof || typeof zkProof !== "object")) {
      if (!allowMissingProof) throw new Error("ZK proof missing");
    }

    if (zkPublicInputs) {
      svgClone.setAttribute("data-zk-public-inputs", JSON.stringify(zkPublicInputs));
    }
    if (zkPoseidonHash) {
      svgClone.setAttribute("data-zk-scheme", "groth16-poseidon");
      svgClone.setAttribute("data-zk-poseidon-hash", zkPoseidonHash);
      if (zkProof) svgClone.setAttribute("data-zk-proof", "present");
    }

    if (
      svgClone.getAttribute("data-pulse") !== String(claimedMetaCanon.pulse) ||
      svgClone.getAttribute("data-kai-signature") !== kaiSignature ||
      svgClone.getAttribute("data-phi-key") !== phiKey
    ) {
      throw new Error("SVG data attributes do not match proof capsule");
    }

    const svgHash = await hashSvgText(svgString);

    const proofBundleBase = {
      hashAlg: PROOF_HASH_ALG,
      canon: PROOF_CANON,
      proofCapsule,
      capsuleHash,
      svgHash,
      shareUrl,
      verifierUrl,
      authorSig: null,
      zkPoseidonHash,
      zkProof,
      proofHints,
      zkPublicInputs,
    };

    const bundleUnsigned = buildBundleUnsigned(proofBundleBase);
    const computedBundleHash = await hashBundle(bundleUnsigned);

    const proofBundle = {
      ...proofBundleBase,
      bundleHash: computedBundleHash,
      authorSig: null,
    };

    const sealedSvg = embedProofMetadata(svgString, proofBundle);
    const svgBlob = new Blob([sealedSvg], { type: "image/svg+xml;charset=utf-8" });

    const svgAssetHash = await sha256HexCanon(new Uint8Array(await svgBlob.arrayBuffer()));

    // ✅ PNG export: try biggest -> shrink until iOS can render reliably
    const { pngBlob, usedPxMax } = await pngBlobFromSvgBestFit(svgBlob, pxCandidates);
    const pngHash = await sha256HexCanon(new Uint8Array(await pngBlob.arrayBuffer()));

    // Build ZIP
    const JSZip = await loadJSZip();
    const zip = new JSZip();

    // PNG first (harmless, sometimes helps unzip apps)
    zip.file(`${base}.png`, pngBlob);
    zip.file(`${base}.svg`, svgBlob);

    zip.file(`${base}.payload.json`, JSON.stringify(metaForSvg, null, 2));
    zip.file(`${base}.url.txt`, fullUrlForManifest);

    zip.file(`${base}.proof_bundle.json`, JSON.stringify(proofBundle, null, 2));

    const manifestPayload = {
      hashAlg: "sha256",
      canon: "sorted keys + UTF-8 + no whitespace",

      hash: localHash || routeHash || "",
      canonicalHash: claimedMetaCanon.canonicalHash ?? null,

      pulse: claimedMetaCanon.pulse,
      beat: claimedMetaCanon.beat,
      stepIndex: sealedStepIndex,
      atStepIndex: claimStepIndex,
      chakraDay: claimedMetaCanon.chakraDay ?? null,

      userPhiKey: claimedMetaCanon.userPhiKey ?? null,
      kaiSignature: claimedMetaCanon.kaiSignature ?? null,
      transferNonce: claimedMetaCanon.transferNonce ?? null,

      expiresAtPulse: claimedMetaCanon.expiresAtPulse ?? null,
      exportedAtPulse: claimedMetaCanon.exportedAtPulse ?? null,
      claimedAtPulse: nowPulse,

      overlays: { qr: false, eternalPulseBar: false },
      assets: {
        [`${base}.svg`]: svgAssetHash,
        [`${base}.png`]: pngHash,
      },

      pngPxMax: usedPxMax,

      claimExtendUnit: claimedMetaCanon.claimExtendUnit ?? null,
      claimExtendAmount: claimedMetaCanon.claimExtendAmount ?? null,

      fullUrl: fullUrlForManifest,
      p: pValue,
      urlQuery: { p: pValue, t: tValue },

      proofBundleHash: computedBundleHash,
      proofBundle,
    };

    const manifestHash = await sha256HexCanon(stableStringify(manifestPayload));
    const manifest = { ...manifestPayload, manifestHash };
    zip.file(`${base}.manifest.json`, JSON.stringify(manifest, null, 2));

    const zipBlob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/zip",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      streamFiles: true,
    });

    // ✅ Keep the same UX: direct download via <a>, but iOS-safe (no immediate revoke)
    downloadBlobAsFile(zipBlob, `${base}.zip`);

    signal(setToast, "Access key generated");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Claim failed";
    // eslint-disable-next-line no-console
    console.error(e);
    signal(setToast, `Claim failed: ${msg}`);
  } finally {
    setExporting(false);
  }
}
