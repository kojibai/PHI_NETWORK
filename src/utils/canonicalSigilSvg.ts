import { ensureTitleAndDesc, ensureViewBoxOnClone, ensureXmlns } from "./svgMeta";
import {
  ensureCanonicalMetadataFirst,
  retagSvgIdsForStep,
  rewriteCanonicalMetadata,
} from "../pages/SigilPage/svgOps";

export const CANONICAL_PNG_PX = 2048;

type CanonicalSigilSvgInput = {
  svgEl: SVGSVGElement;
  pulse: number;
  beat: number;
  stepIndex: number;
  stepsPerBeat: number;
  chakraDay: string;
  kaiSignature: string;
  phiKey: string;
  payloadHash: string;
  title?: string;
  desc?: string;
};

export function buildCanonicalSigilSvg({
  svgEl,
  pulse,
  beat,
  stepIndex,
  stepsPerBeat,
  chakraDay,
  kaiSignature,
  phiKey,
  payloadHash,
  title = "Kairos Sigil-Glyph — Sealed KairosMoment",
  desc = "Deterministic sigil-glyph with sovereign metadata. Canonical export.",
}: CanonicalSigilSvgInput): string {
  const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
  ensureViewBoxOnClone(svgClone, CANONICAL_PNG_PX);
  ensureXmlns(svgClone);
  ensureTitleAndDesc(svgClone, title, desc);

  svgClone.setAttribute("data-pulse", String(pulse));
  svgClone.setAttribute("data-beat", String(beat));
  svgClone.setAttribute("data-step-index", String(stepIndex));
  svgClone.setAttribute("data-chakra-day", chakraDay);
  svgClone.setAttribute("data-steps-per-beat", String(stepsPerBeat));
  svgClone.setAttribute("data-kai-signature", kaiSignature);
  svgClone.setAttribute("data-phi-key", phiKey);
  svgClone.setAttribute("data-payload-hash", payloadHash);

  svgClone.removeAttribute("data-share-url");
  svgClone.querySelectorAll("a").forEach((link) => {
    link.removeAttribute("href");
    link.removeAttribute("xlink:href");
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

  svgClone.querySelectorAll("text").forEach((t) => {
    const s = t.textContent || "";
    if (!s.includes("u=")) return;
    const next = s.replace(/\bu=[^·]+/g, `u=${payloadHash}`);
    if (next !== s) t.textContent = next;
  });

  retagSvgIdsForStep(svgClone, pulse, beat, stepIndex);
  rewriteCanonicalMetadata<Record<string, unknown>>(svgClone, (meta) => {
    const next = { ...meta } as Record<string, unknown>;
    const header = next.header;
    if (header && typeof header === "object" && !Array.isArray(header)) {
      const headerNext = { ...(header as Record<string, unknown>) };
      delete headerNext.shareUrl;
      next.header = headerNext;
    }
    return next;
  });
  ensureCanonicalMetadataFirst(svgClone);

  return new XMLSerializer().serializeToString(svgClone);
}
