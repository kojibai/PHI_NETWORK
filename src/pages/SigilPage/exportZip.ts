// src/pages/SigilPage/exportZip.ts
"use client";

import { pngBlobFromSvg } from "../../utils/qrExport";
import { loadJSZip, signal } from "./utils";
import {
  sha256HexCanon,
  derivePhiKeyFromSigCanon,
  verifierSigmaString,
  readIntentionSigil,
} from "./verifierCanon";
import { extractEmbeddedMetaFromSvg } from "../../utils/sigilMetadata";
import { generateZkProofFromPoseidonHash } from "../../utils/zkProof";
import { computeZkPoseidonHash } from "../../utils/kai";
import {
  buildVerifierSlug,
  normalizeChakraDay,
  type ProofCapsuleV1,
} from "../../components/KaiVoh/verifierProof";
import { buildCanonicalGlyphBundle } from "../../utils/canonicalGlyphBundle";
import { makeKasAttestationFilename, makeKasAttestationJson } from "../../utils/kasAttestation";
import { signBundleHash } from "../../utils/webauthnKAS";
import { buildCanonicalSigilSvg, CANONICAL_PNG_PX } from "../../utils/canonicalSigilSvg";

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
  localHash: string | null;
  routeHash: string | null;
  stepIndexFromPulse: (p: number, steps: number) => number;
  STEPS_PER_BEAT: number;
  withAttestation?: boolean;
  rpId?: string;
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
    localHash,
    routeHash,
    stepIndexFromPulse,
    STEPS_PER_BEAT,
    withAttestation = false,
    rpId,
  } = ctx;

  if (exporting) return;
  if (expired) return signal(setToast, "Seal window closed");
  if (!svgEl) return signal(setToast, "No SVG found");
  if (!payload) return signal(setToast, "No payload");
  if (isFutureSealed) return signal(setToast, "Opens after the moment—claim unlocks then");
  if (linkStatus !== "active") return signal(setToast, "Archived link — cannot claim from here");

  try {
    setExporting(true);

    const stepsNum = (payload.stepsPerBeat ?? STEPS_PER_BEAT) as number;
    const sealedStepIndex = stepIndexFromPulse(payload.pulse, stepsNum);

    const canonicalSig = await sha256HexCanon(
      verifierSigmaString(
        payload.pulse,
        payload.beat,
        sealedStepIndex,
        String(payload.chakraDay ?? ""),
        readIntentionSigil(payload)
      )
    );
    const phiKeyCanon = await derivePhiKeyFromSigCanon(canonicalSig);
    const kaiSignature = canonicalSig;
    const phiKey = payload.userPhiKey || phiKeyCanon;
    if (!kaiSignature) throw new Error("Export failed: kaiSignature missing from payload.");
    if (!phiKey) throw new Error("Export failed: Φ-Key missing from payload.");

    const chakraNormalized = normalizeChakraDay(String(payload.chakraDay ?? ""));
    if (!chakraNormalized) throw new Error("Chakra day missing from SVG.");

    const payloadHashHex = (localHash || payload.canonicalHash || routeHash || "").toLowerCase();
    if (!payloadHashHex) throw new Error("Payload hash missing from SVG.");

    const proofCapsule: ProofCapsuleV1 = {
      v: "KPV-1",
      pulse: payload.pulse,
      chakraDay: chakraNormalized,
      kaiSignature,
      phiKey,
      verifierSlug: buildVerifierSlug(payload.pulse, kaiSignature),
    };

    const svgString = buildCanonicalSigilSvg({
      svgEl,
      pulse: payload.pulse,
      beat: payload.beat,
      stepIndex: sealedStepIndex,
      stepsPerBeat: stepsNum,
      chakraDay: chakraNormalized,
      kaiSignature,
      phiKey,
      payloadHash: payloadHashHex,
    });

    const embeddedMeta = extractEmbeddedMetaFromSvg(svgString);
    let zkPoseidonHash =
      typeof embeddedMeta.zkPoseidonHash === "string" && embeddedMeta.zkPoseidonHash.trim().length > 0
        ? embeddedMeta.zkPoseidonHash.trim()
        : undefined;
    let zkProof = embeddedMeta.zkProof;
    let zkPublicInputs: unknown = embeddedMeta.zkPublicInputs;

    const allowMissingProof = typeof navigator !== "undefined" && navigator.onLine === false;

    let poseidonSecret: string | null = null;
    if (!zkPoseidonHash && payloadHashHex) {
      const computed = await computeZkPoseidonHash(payloadHashHex);
      zkPoseidonHash = computed.hash;
      poseidonSecret = computed.secret;
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

      if (!hasProof && payloadHashHex && !poseidonSecret) {
        const computed = await computeZkPoseidonHash(payloadHashHex);
        if (computed.hash === zkPoseidonHash) {
          poseidonSecret = computed.secret;
        }
      }

      if (!hasProof) {
        try {
          if (!poseidonSecret) throw new Error("ZK secret missing for proof generation");
          const generated = await generateZkProofFromPoseidonHash({
            poseidonHash: zkPoseidonHash,
            secret: poseidonSecret,
          });
          if (generated?.proof) {
            zkProof = generated.proof;
            zkPublicInputs = generated.zkPublicInputs;
          }
        } catch (err) {
          if (!allowMissingProof) throw err;
        }
      }
    }

    if (zkPoseidonHash && zkPublicInputs) {
      const publicInput0 = readPublicInput0(zkPublicInputs);
      if (publicInput0 && publicInput0 !== zkPoseidonHash) throw new Error("Embedded ZK mismatch");
    }
    if (zkPoseidonHash && (!zkProof || typeof zkProof !== "object")) {
      if (!allowMissingProof) throw new Error("ZK proof missing");
    }

    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const pngBlob = await pngBlobFromSvg(svgBlob, CANONICAL_PNG_PX);
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

    const bundle = await buildCanonicalGlyphBundle({
      svgText: svgString,
      pngBytes,
      proofCapsule,
      zkPoseidonHash,
      zkProof,
      zkPublicInputs,
    });

    const JSZip = await loadJSZip();
    const zip = new JSZip();

    zip.file(`${bundle.baseName}.png`, bundle.pngBytes);
    zip.file(`${bundle.baseName}.svg`, bundle.svgBytes);
    zip.file("manifest.json", bundle.manifestJson);
    zip.file("proofBundle.json", bundle.proofBundleJson);

    if (withAttestation) {
      const authorSig = await signBundleHash(phiKey, bundle.bundleHash);
      const rpIdFinal =
        rpId ??
        (typeof window !== "undefined" && window.location?.hostname
          ? window.location.hostname
          : "");
      if (!rpIdFinal) throw new Error("RP ID is required for attestation.");

      const attestation = await makeKasAttestationJson({
        bundleHash: bundle.bundleHash,
        canonicalBundleObject: bundle.canonicalBundleObject,
        proofCapsule,
        capsuleHash: bundle.capsuleHash,
        svgHash: bundle.svgHash,
        authorSig,
        rpId: rpIdFinal,
      });

      const existingNames = new Set(
        Object.keys(zip.files)
          .filter((name) => name.startsWith("attestations/"))
          .map((name) => name.replace(/^attestations\//, ""))
      );
      const attestationName = await makeKasAttestationFilename({
        verifierSlug: proofCapsule.verifierSlug,
        bundleHash: bundle.bundleHash,
        credId: authorSig.credId,
        pulse: proofCapsule.pulse,
        existingNames,
      });
      zip.file(`attestations/${attestationName}`, JSON.stringify(attestation, null, 2));
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/zip",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      streamFiles: true,
    });

    downloadBlobAsFile(zipBlob, `${bundle.baseName}.zip`);

    signal(setToast, withAttestation ? "Presence attestation added" : "Canonical bundle exported");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Claim failed";
    // eslint-disable-next-line no-console
    console.error(e);
    signal(setToast, `Claim failed: ${msg}`);
  } finally {
    setExporting(false);
  }
}
