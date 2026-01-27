import phiSvg from "../assets/phi.svg?raw";
import type { VerifiedCardData } from "./types";
import { sanitizeSigilSvg, svgToDataUri } from "./sigilEmbed";
import { currency as fmtPhi, usd as fmtUsd } from "../components/valuation/display";
import { buildProofOfBreathSeal } from "./proofOfBreathSeal";

export const VERIFIED_CARD_W = 1200;
export const VERIFIED_CARD_H = 630;

const NOTE_TITLE_TEXT = "KAIROS KURRENCY";
const NOTE_SUBTITLE_TEXT = "ISSUED UNDER YAHUAH’S LAW OF ETERNAL LIGHT — Φ • KAI-TURAH";

const PHI = (1 + Math.sqrt(5)) / 2;

const phiLogoDataUri = svgToDataUri(phiSvg);

type UnknownRecord = Record<string, unknown>;
type CardKind = "proof" | "money";

function hashStringToInt(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function accentFromHash(capsuleHash: string): { accent: string; accentSoft: string; accentGlow: string } {
  const hash = hashStringToInt(capsuleHash);
  const hue = hash % 360;
  const accent = `hsl(${hue} 78% 62%)`;
  const accentSoft = `hsl(${hue} 78% 52%)`;
  const accentGlow = `hsla(${hue}, 90%, 70%, 0.75)`;
  return { accent, accentSoft, accentGlow };
}

function shortPhiKey(phiKey: string): string {
  const trimmed = phiKey.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function shortHash(value: string | undefined, head = 10, tail = 8): string {
  if (!value) return "—";
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function shortSerial(value: string, head = 10, tail = 10): string {
  const v = value.trim();
  if (v.length <= head + tail + 2) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}

function badgeMark(ok: boolean): string {
  if (ok) return "M18 32 L28 42 L46 18";
  return "M20 20 L44 44 M44 20 L20 44";
}

function escXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
  return Object.fromEntries(entries) as T;
}

function formatPhiValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return fmtPhi(value);
}

function formatUsdValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return fmtUsd(value);
}

function stripPhiPrefix(s: string): string {
  return s.replace(/^\s*Φ+\s*/u, "");
}

function truncText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function asRecord(v: unknown): UnknownRecord | null {
  return v && typeof v === "object" ? (v as UnknownRecord) : null;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function readNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length) return v.trim();
  }
  return undefined;
}

/**
 * STRICT: "receive" only when the glyph/proof/embedded metadata proves it.
 * Never infer receive from valuation flavor alone.
 */
function isReceiveGlyphStrict(data: VerifiedCardData, receiptPayload: unknown, valuationSnapshot: unknown): boolean {
  const d = asRecord(data);
  const r = asRecord(receiptPayload);
  const v = asRecord(valuationSnapshot);

  const explicitMode =
    readString(d?.["mode"]) ??
    readString(d?.["verifyMode"]) ??
    readString(d?.["verificationMode"]) ??
    readString(r?.["mode"]) ??
    readString(r?.["proofMode"]) ??
    readString(v?.["mode"]);

  if (explicitMode === "receive") return true;
  if (explicitMode === "origin") return false;

  const embedded =
    asRecord(d?.["embedded"]) ??
    asRecord(d?.["metadata"]) ??
    asRecord(d?.["sigilMeta"]) ??
    asRecord(d?.["sigilMetadata"]) ??
    asRecord(d?.["sigil"]);

  if (embedded) {
    if (typeof embedded["childOfHash"] === "string" && embedded["childOfHash"].length > 0) return true;
    if (readNumber(embedded["childIssuedPulse"]) !== undefined) return true;
    if (typeof embedded["childAllocationPhi"] === "string" && embedded["childAllocationPhi"].length > 0) return true;
    if (embedded["childClaim"] && typeof embedded["childClaim"] === "object") return true;
  }

  return false; // strict default
}

function rosettePath(seed: string): string {
  const h = hashStringToInt(seed);
  const cx = 600;
  const cy = 332;
  const R = 220;
  const turns = 120;

  const wobble = 0.16 + ((h >>> 5) % 45) / 300;
  const k1 = 3 + ((h >>> 9) % 4);
  const k2 = 4 + ((h >>> 13) % 4);
  const spinA = 5 + ((h >>> 17) % 5);

  let d = `M ${cx} ${cy - R}`;
  for (let i = 1; i <= turns; i += 1) {
    const t = (i / turns) * 2 * Math.PI;
    const r = R * (1 - wobble + wobble * Math.sin(spinA * t));
    const x = cx + r * Math.sin(k1 * t);
    const y = cy + r * Math.cos(k2 * t);
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d} Z`;
}

function sigilSlotMarkup(
  sigilSvg: string | undefined,
  slot: { x: number; y: number; w: number; h: number; r: number },
  clipId: string,
): string {
  const { x, y, w, h } = slot;

  if (!sigilSvg) {
    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${slot.r}" fill="#0a1013" stroke="#2ad6c7" stroke-opacity=".22"/>
        <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle"
          font-family="ui-monospace,monospace" font-size="18" fill="#81fff1" opacity=".8">SIGIL UNAVAILABLE</text>
      </g>
    `;
  }

  const sanitized = sanitizeSigilSvg(sigilSvg);
  const dataUri = svgToDataUri(sanitized);

  return `
    <image
      x="${x}" y="${y}"
      width="${w}" height="${h}"
      href="${dataUri}"
      preserveAspectRatio="xMidYMid meet"
      clip-path="url(#${clipId})"
    />
  `;
}

function qrBlockMarkup(qrDataUrl: string | undefined, x: number, y: number, clipId: string): string {
  if (!qrDataUrl) {
    return `
      <g transform="translate(${x} ${y})">
        <rect x="0" y="0" width="156" height="174" rx="12" fill="#0a1013" stroke="#2ad6c7" stroke-opacity=".22"/>
        <text x="78" y="98" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" fill="#81fff1" opacity=".8">QR UNAVAILABLE</text>
      </g>
    `;
  }
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="156" height="174" rx="12" fill="#0a1013" stroke="#2ad6c7" stroke-opacity=".22"/>
      <g clip-path="url(#${clipId})">
        <image x="16" y="16" width="124" height="124" href="${qrDataUrl}" preserveAspectRatio="xMidYMid meet" />
      </g>
      <text x="78" y="160" text-anchor="middle" font-family="ui-sans-serif" font-size="10" fill="#81fff1"
        style="letter-spacing:.10em" opacity=".95">SCAN • VERIFY</text>
    </g>
  `;
}

function kasG16BadgesMarkup(kasOk: boolean | null | undefined, g16Ok: boolean, x: number, y: number): string {
  const hasKas = typeof kasOk === "boolean";
  const kasStroke = kasOk ? "#37e6d4" : "#ff7d7d";
  const g16Stroke = g16Ok ? "#37e6d4" : "#ff7d7d";

  const badge = (label: string, ok: boolean, stroke: string, bx: number, by: number) => `
    <g transform="translate(${bx} ${by})">
      <rect x="0" y="0" width="140" height="54" rx="14" fill="#0a1013" stroke="${stroke}" stroke-opacity=".55"/>
      <text x="18" y="34" font-family="ui-sans-serif" font-size="16" fill="#cfe" style="letter-spacing:.14em" opacity=".92">${escXml(label)}</text>
      <g transform="translate(98 10)">
        <rect x="0" y="0" width="34" height="34" rx="10" fill="#091014" stroke="${stroke}" stroke-opacity=".9"/>
        <g transform="translate(1 1) scale(0.62)">
          <path d="${badgeMark(ok)}" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </g>
    </g>
  `;

  if (!hasKas) return badge("G16", g16Ok, g16Stroke, x, y);

  return `
    ${badge("KAS", Boolean(kasOk), kasStroke, x, y)}
    ${badge("G16", g16Ok, g16Stroke, x + 156, y)}
  `;
}

/**
 * Text measurement (best effort):
 * - Uses OffscreenCanvas/Canvas measureText when available
 * - Falls back to conservative estimate (overestimates width to prevent overflow)
 */
function measureTextWidthPx(text: string, font: string, fontPx: number, letterSpacingPx = 0): number {
  let width = text.length * (fontPx * 0.78) + Math.max(0, text.length - 1) * letterSpacingPx;

  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  if (typeof OffscreenCanvas !== "undefined") {
    ctx = new OffscreenCanvas(1, 1).getContext("2d");
  } else if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    ctx = c.getContext("2d");
  }

  if (ctx) {
    ctx.font = font;
    const m = ctx.measureText(text);
    width = m.width + Math.max(0, text.length - 1) * letterSpacingPx;
  }

  return width;
}

function wrapTextToWidth(text: string, maxWidthPx: number, font: string, fontPx: number, letterSpacingPx = 0): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [];

  const words = clean.split(" ");
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    const wpx = measureTextWidthPx(next, font, fontPx, letterSpacingPx);
    if (wpx <= maxWidthPx) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
  }

  if (cur) lines.push(cur);
  return lines;
}

export function buildVerifiedCardSvg(data: VerifiedCardData): string {
  return buildKvrSvg(data, "proof");
}

export function buildRedeemableNoteSvg(data: VerifiedCardData): string {
  return buildKvrSvg(data, "money");
}

function buildKvrSvg(data: VerifiedCardData, kind: CardKind): string {
  const { capsuleHash, verifiedAtPulse, phikey, kasOk, g16Ok, sigilSvg, qrDataUrl, svgHash, receiptHash } = data;

  const { accent, accentSoft, accentGlow } = accentFromHash(capsuleHash);

  const id = `kvr-${hashStringToInt(`${capsuleHash}|${verifiedAtPulse}|${kind}`).toString(16)}`;
  const sigilClipId = `${id}-sigil-clip`;
  const qrClipId = `${id}-qr-clip`;
  const legalClipId = `${id}-legal-clip`;

  const phiShort = shortPhiKey(phikey);

  const valuationSnapshot =
    data.valuation ? { ...data.valuation } : data.receipt?.valuation ? { ...data.receipt.valuation } : undefined;

  if (valuationSnapshot && "valuationHash" in valuationSnapshot) {
    delete (valuationSnapshot as { valuationHash?: string }).valuationHash;
  }

  const valuationHash = data.valuation?.valuationHash ?? data.receipt?.valuationHash;
  const valuationPhiRaw = formatPhiValue(valuationSnapshot?.phiValue);
  const valuationPhiText = stripPhiPrefix(valuationPhiRaw);
  const valuationUsd = formatUsdValue(valuationSnapshot?.usdValue);

  const vrec = asRecord(valuationSnapshot);
  const valuationPulse =
    readNumber(vrec?.["pulse"]) ??
    readNumber(vrec?.["valuationPulse"]) ??
    readNumber(vrec?.["atPulse"]) ??
    readNumber(vrec?.["computedPulse"]);

  const valuationAlg = firstString(vrec?.["valuationAlg"], vrec?.["alg"], vrec?.["algorithm"], vrec?.["policyAlg"], vrec?.["policy"]);
  const valuationStamp = firstString(
    vrec?.["valuationStamp"],
    vrec?.["stamp"],
    vrec?.["hash"],
    typeof valuationHash === "string" ? valuationHash : undefined,
  );

  const receiptPayload =
    data.receipt ??
    (data.bundleHash && data.zkPoseidonHash && data.verificationVersion && data.verifier
      ? {
          v: "KVR-1",
          bundleHash: data.bundleHash,
          zkPoseidonHash: data.zkPoseidonHash,
          verifiedAtPulse,
          verifier: data.verifier,
          verificationVersion: data.verificationVersion,
        }
      : undefined);

  const bundleHashValue = receiptPayload?.bundleHash ?? data.bundleHash;
  const zkPoseidonHash = receiptPayload?.zkPoseidonHash ?? data.zkPoseidonHash;
  const verifier = receiptPayload?.verifier ?? data.verifier;
  const verificationVersion = receiptPayload?.verificationVersion ?? data.verificationVersion;

  const isReceiveMode = isReceiveGlyphStrict(data, receiptPayload, valuationSnapshot);
  const verifiedStampText = isReceiveMode ? "VERIFIED RECEIVE" : "VERIFIED ORIGIN";

  const variantLine =
    kind === "money"
      ? isReceiveMode
        ? "RECEIVE MONEY"
        : "ORIGIN MONEY"
      : isReceiveMode
        ? "RECEIVE PROOF"
        : "ORIGIN PROOF";

  const receiptMeta: Record<string, unknown> = {};
  if (bundleHashValue) receiptMeta.bundleHash = bundleHashValue;
  if (zkPoseidonHash) receiptMeta.zkPoseidonHash = zkPoseidonHash;
  if (verifier) receiptMeta.verifier = verifier;
  if (verificationVersion) receiptMeta.verificationVersion = verificationVersion;
  receiptMeta.verifiedAtPulse = receiptPayload?.verifiedAtPulse ?? verifiedAtPulse;
  receiptMeta.assetMode = isReceiveMode ? "receive" : "origin";
  receiptMeta.artifactKind = kind;
  if (receiptPayload) receiptMeta.receipt = receiptPayload;
  if (data.receiptHash) receiptMeta.receiptHash = data.receiptHash;
  if (data.verificationSig) receiptMeta.verificationSig = data.verificationSig;
  const receiptJson = JSON.stringify(receiptMeta);

  const auditMeta = dropUndefined({
    receiptHash: data.receiptHash,
    valuation: valuationSnapshot,
    valuationHash,
    bundleHash: bundleHashValue,
    zkPoseidonHash,
    verifiedAtPulse: receiptPayload?.verifiedAtPulse ?? verifiedAtPulse,
    artifactKind: kind,
    assetMode: isReceiveMode ? "receive" : "origin",
  });
  const auditJson = JSON.stringify(auditMeta);

  const proofSeal = buildProofOfBreathSeal({
    bundleHash: bundleHashValue,
    capsuleHash,
    svgHash,
    receiptHash,
    pulse: verifiedAtPulse,
  });

  const slot = { x: 360, y: 198, w: 480, h: 300, r: 18 };
  const slotCenterX = slot.x + slot.w / 2;

  // Proof badge down slightly; QR moved left
  const proofSealSize = 168;
  const proofSealX = 960;
  const proofSealY = 144;
  const proofSealLabel = "PROOF OF BREATH™";
  const proofSealMicro = `${shortHash(capsuleHash, 6, 4)} · ${shortHash(bundleHashValue, 6, 4)}`;
  const proofSealMarkup = proofSeal.toSvg(proofSealX, proofSealY, proofSealSize, id, proofSealLabel, proofSealMicro);

  const qrX = 980;
  const qrY = 344;

  const rosette = rosettePath(`${capsuleHash}|${svgHash ?? ""}|${verifiedAtPulse}|${kind}`);

  const serialCore = (zkPoseidonHash ? zkPoseidonHash.slice(0, 12).toUpperCase() : capsuleHash.slice(0, 12).toUpperCase()).replace(
    /[^0-9A-F]/g,
    "Φ",
  );
  const serial = `KVR-${serialCore}-${String(verifiedAtPulse)}`;
  const serialDisplay = shortSerial(serial, 10, 10);

  const microLine = escXml(
    `KAIROS KURRENSY • LAWFUL UNDER YAHUAH • Φ • ${variantLine} • ${verifiedStampText} • STEWARD VERIFIED @ PULSE ${verifiedAtPulse} • SERIAL ${serial} • BUNDLE ${shortHash(bundleHashValue, 10, 8)} • RECEIPT ${shortHash(receiptHash, 10, 8)}`,
  );

  const drec = asRecord(data);
  const embedded =
    asRecord(drec?.["embedded"]) ??
    asRecord(drec?.["metadata"]) ??
    asRecord(drec?.["sigilMeta"]) ??
    asRecord(drec?.["sigilMetadata"]) ??
    asRecord(drec?.["sigil"]);

  const childOfHash = readString(embedded?.["childOfHash"]);
  const childClaim = asRecord(embedded?.["childClaim"]);
  const claimSteps = readNumber(childClaim?.["steps"]);
  const claimExpireAtPulse = readNumber(childClaim?.["expireAtPulse"]);

  const moneyRedeemTitle = isReceiveMode ? "REDEEMABLE CLAIM — RECEIVE NOTE" : "REDEEMABLE CLAIM — ORIGIN NOTE";
  const moneyRedeemPolicy = valuationHash ? `POLICY HASH ${shortHash(String(valuationHash))}` : "POLICY HASH —";
  const moneyRedeemLineage = childOfHash ? `LINEAGE ${shortHash(childOfHash, 10, 8)}` : "LINEAGE —";
  const moneyRedeemWindow =
    claimSteps !== undefined && claimExpireAtPulse !== undefined
      ? `CLAIM WINDOW ${claimSteps} STEPS • EXPIRES @ PULSE ${claimExpireAtPulse}`
      : "CLAIM WINDOW —";

  const headerY1 = 78;
  const headerY2 = 102;
  const stampY = 152;
  const stewardY = 178;
  const variantY = 202;

  const leftValueLabel = kind === "money" ? "VALUE" : "Φ VALUE";

  // Bottom panel + footer spacing fixes
  const belt1Y = 556;
  const belt2Y = 574;

  // Valuation + footer pushed up and spaced so nothing overlaps
  const valuation1Y = 548; // moved up a lot (kept on-card)
  const valuation2Y = 564; // spacing from valuation1Y

  const footerTopY = 588; // moved up
  const footerRow1Y = footerTopY;
  const footerRow2Y = footerTopY + 16; // enough separation

  // Caption + legal
  const slotBottom = slot.y + slot.h;
  const panelTop = slotBottom + Math.round(4 * PHI);
  const captionY = Math.round(panelTop + Math.round(7 * PHI));
  const captionGap = Math.round(4 * PHI);

  const legalFontCandidates: Array<{ fontPx: number; lineH: number }> = [
    { fontPx: 11, lineH: 13 },
    { fontPx: 10, lineH: 12 },
    { fontPx: 9, lineH: 11 },
    { fontPx: 8, lineH: 10 },
  ];

  const legalText =
    kind === "money"
      ? `This note is redeemable in Kairos under Yahuah’s Law by the stated policy and claim window. Redemption is steward-verified and bound to the ΦKey and proof bundle embedded in this note.`
      : `This Sigil-Seal is proof of stewardship in Kairos under Yahuah’s Law. It attests that the steward verified the embedded proof bundle at the stated pulse. It is a verification instrument, not a redeemable note.`;

  const legalOuterWMax = 640;
  const legalOuterWMin = 420;
  const legalPadX = Math.round(8 * PHI);
  const legalPadY = Math.round(3 * PHI);

  const legalLeftBound = 280;
  const legalRightBound = qrX - Math.round(2 * PHI);
  const maxPossibleW = Math.max(legalOuterWMin, Math.min(legalOuterWMax, legalRightBound - legalLeftBound));

  const legalOuterW = maxPossibleW;
  const legalOuterX = Math.round(Math.max(legalLeftBound, Math.min(legalRightBound - legalOuterW, slotCenterX - legalOuterW / 2)));

  const legalY = Math.round(Math.max(captionY + captionGap, panelTop + Math.round(8 * PHI)));
  const legalMaxH = Math.max(0, belt1Y - Math.round(4 * PHI) - legalY);

  const legalInnerW = Math.max(0, legalOuterW - legalPadX * 2);
  let chosenFontPx = 9;
  let chosenLineH = 11;
  let legalLinesRaw: string[] = [];

  for (const cand of legalFontCandidates) {
    const font = `600 ${cand.fontPx}px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial`;
    const lines = wrapTextToWidth(legalText, legalInnerW, font, cand.fontPx, 0);
    const neededH = legalPadY * 2 + lines.length * cand.lineH;
    if (neededH <= legalMaxH) {
      chosenFontPx = cand.fontPx;
      chosenLineH = cand.lineH;
      legalLinesRaw = lines;
      break;
    }
  }

  if (legalLinesRaw.length === 0) {
    const cand = legalFontCandidates[legalFontCandidates.length - 1];
    const font = `600 ${cand.fontPx}px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial`;
    chosenFontPx = cand.fontPx;
    chosenLineH = cand.lineH;
    legalLinesRaw = wrapTextToWidth(legalText, legalInnerW, font, cand.fontPx, 0);
  }

  const legalLines = legalLinesRaw.map(escXml);
  const legalH = Math.min(legalMaxH, legalPadY * 2 + legalLinesRaw.length * chosenLineH);
  const textBlockH = legalLinesRaw.length * chosenLineH;
  const textTopY = legalY + Math.max(legalPadY, Math.floor((legalH - textBlockH) / 2));
  const legalCenterX = legalOuterX + legalOuterW / 2;
  const slotCaptionY = Math.min(captionY, legalY - Math.round(2 * PHI));

  const showValuationMeta = valuationPulse !== undefined || Boolean(valuationAlg) || Boolean(valuationStamp);

  // Footer row x spacing (more space; no overlap)
  const fx1 = 72;
  const fx2 = 460;
  const fx3 = 860;

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${VERIFIED_CARD_W}" height="${VERIFIED_CARD_H}"
  viewBox="0 0 ${VERIFIED_CARD_W} ${VERIFIED_CARD_H}"
  preserveAspectRatio="xMidYMid meet"
  xml:space="preserve"
  role="img"
  aria-label="Kairos Kurrensy Verification Note"
  data-note="kairos-kurrency"
  data-artifact-kind="${escXml(kind)}"
  data-asset-mode="${escXml(isReceiveMode ? "receive" : "origin")}"
  data-verified-at-pulse="${escXml(String(verifiedAtPulse))}"
  data-phikey="${escXml(phikey)}"
  style="shape-rendering:geometricPrecision; text-rendering:geometricPrecision; image-rendering:optimizeQuality"
>
  <metadata id="kai-verified-receipt"><![CDATA[${receiptJson}]]></metadata>
  <metadata id="kai-verified-audit"><![CDATA[${auditJson}]]></metadata>

  <defs>
    <linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#37e6d4"/>
      <stop offset="1" stop-color="#81fff1"/>
    </linearGradient>

    <linearGradient id="${id}-frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity=".60"/>
      <stop offset="1" stop-color="${accentSoft}" stop-opacity=".32"/>
    </linearGradient>

    <radialGradient id="${id}-wave" cx="82%" cy="18%" r="88%">
      <stop offset="0%" stop-color="${accentGlow}" />
      <stop offset="100%" stop-color="rgba(0,0,0,0)" />
    </radialGradient>

    <pattern id="${id}-micro" width="520" height="14" patternUnits="userSpaceOnUse">
      <text x="0" y="11" font-size="10" font-family="ui-monospace,monospace" fill="#81fff1" opacity=".55" style="letter-spacing:.10em">
        ${microLine}
      </text>
    </pattern>

    <filter id="${id}-soft"><feGaussianBlur stdDeviation="1.2"/></filter>

    <filter id="${id}-frostGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.8  0 0 0 0 1  0 0 0 0 0.95  0 0 0 0.25 0" result="glow"/>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <filter id="${id}-badgeGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>

    <clipPath id="${sigilClipId}">
      <rect x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" rx="${slot.r}" />
    </clipPath>

    <clipPath id="${qrClipId}">
      <rect x="16" y="16" width="124" height="124" rx="10" />
    </clipPath>

    <clipPath id="${legalClipId}">
      <rect x="${legalOuterX}" y="${legalY}" width="${legalOuterW}" height="${legalH}" rx="14" />
    </clipPath>

    <style>
      .noteTitle { font: 700 20px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial; letter-spacing: .20em; }
      .noteSub { font: 600 13px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial; letter-spacing: .10em; fill: #cfe; opacity: .95; }

      .stamp { font: 800 44px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial; fill: #e7fbf7; letter-spacing: .14em; }
      .steward { font: 600 16px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial; fill: #cfe; letter-spacing: .10em; opacity: .95; }
      .variant { font: 800 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial; fill: #81fff1; letter-spacing: .26em; opacity: .92; }

      .lbl { font: 700 14px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial; fill: #bff; letter-spacing: .12em; opacity: .92; }
      .val { font: 700 24px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; fill: #e7fbf7; }
      .mono { font: 700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; fill: #bff; opacity: .94; }
      .micro { font: 600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; fill: #aee; opacity: .94; }

      .cap { font: 700 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial; fill: #81fff1; opacity: .92; letter-spacing: .14em; }
      .legal { font: 600 ${chosenFontPx}px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial; fill: #d9f5ff; opacity: .98; }
    </style>
  </defs>

  <g filter="url(#${id}-frostGlow)">
    <rect x="14" y="14" width="1172" height="602" rx="16" fill="#0b1417" stroke="url(#${id}-g)" stroke-opacity=".45" />
    <rect x="28" y="28" width="1144" height="574" rx="14" fill="#0a1013" stroke="url(#${id}-g)" stroke-opacity=".28" />
    <rect x="40" y="40" width="1120" height="550" rx="12" fill="url(#${id}-micro)" opacity=".14" />
  </g>

  <rect x="14" y="14" width="1172" height="602" rx="16" fill="url(#${id}-wave)" opacity=".16" />

  <text class="noteTitle" x="600" y="${headerY1}" text-anchor="middle" fill="url(#${id}-g)">${escXml(NOTE_TITLE_TEXT)}</text>
  <text class="noteSub" x="600" y="${headerY2}" text-anchor="middle">${escXml(NOTE_SUBTITLE_TEXT)}</text>

  <text class="stamp" x="600" y="${stampY}" text-anchor="middle">${escXml(verifiedStampText)}</text>
  <text class="steward" x="600" y="${stewardY}" text-anchor="middle">Steward Verified @ Pulse ${escXml(String(verifiedAtPulse))}</text>
  <text class="variant" x="600" y="${variantY}" text-anchor="middle">${escXml(variantLine)}</text>

  <path d="${rosette}" fill="none" stroke="#5ef5e6" stroke-opacity=".20" stroke-width="1" vector-effect="non-scaling-stroke"/>
  <path d="${rosette}" fill="none" stroke="#5ef5e6" stroke-opacity=".10" stroke-width="8" filter="url(#${id}-soft)" vector-effect="non-scaling-stroke"/>

  <!-- Left: values + identity -->
  <g transform="translate(56,202)">
    <g transform="translate(86,0)">
      <text class="lbl" x="0" y="24">${escXml(leftValueLabel)}</text>
      <image x="0" y="41" width="16" height="16" href="${phiLogoDataUri}" opacity="0.92" />
      <text class="val" x="22" y="56">${escXml(valuationPhiText)}</text>

      <text class="lbl" x="0" y="92">USD VALUE</text>
      <text class="val" x="0" y="124">${escXml(valuationUsd)}</text>

      <text class="lbl" x="0" y="170">ΦKEY</text>
      <text class="val" x="0" y="202">${escXml(phiShort)}</text>

      <text class="micro" x="0" y="234">SERIAL ${escXml(serialDisplay)}</text>
      <text class="micro" x="0" y="254">SVG ${escXml(shortHash(svgHash))}</text>
      <text class="micro" x="0" y="274">SEAL ${escXml(shortHash(capsuleHash))}</text>
    </g>

    <g transform="translate(0,286)">
      ${kasG16BadgesMarkup(kasOk, g16Ok, 0, 0)}
    </g>

    ${
      kind === "money"
        ? `
    <g transform="translate(0,362)">
      <rect x="0" y="0" width="360" height="88" rx="14" fill="#0a1013" stroke="url(#${id}-frame)" stroke-opacity=".55"/>
      <text class="mono" x="16" y="26">${escXml(moneyRedeemTitle)}</text>
      <text class="micro" x="16" y="48">${escXml(moneyRedeemPolicy)}</text>
      <text class="micro" x="16" y="66">${escXml(moneyRedeemWindow)}</text>
      <text class="micro" x="16" y="84">${escXml(moneyRedeemLineage)}</text>
    </g>
    `
        : ""
    }
  </g>

  <!-- Center: sigil -->
  <g>
    <rect x="${slot.x - 10}" y="${slot.y - 10}" width="${slot.w + 20}" height="${slot.h + 20}" rx="${slot.r + 10}"
      fill="#0a1013" stroke="url(#${id}-frame)" stroke-opacity=".60" filter="url(#${id}-frostGlow)"/>
    <rect x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" rx="${slot.r}"
      fill="#081014" stroke="#2ad6c7" stroke-opacity=".22"/>
    <image x="${slot.x + 16}" y="${slot.y + 16}" width="56" height="56" href="${phiLogoDataUri}" opacity=".22" />
    ${sigilSlotMarkup(sigilSvg, slot, sigilClipId)}

    <text class="cap" x="${slotCenterX}" y="${slotCaptionY}" text-anchor="middle">SIGIL • SEALED • VERIFIED</text>
  </g>

  <!-- Right: proof badge + QR (QR moved left; badge slightly lower) -->
  <g filter="url(#${id}-badgeGlow)">${proofSealMarkup}</g>
  ${qrBlockMarkup(qrDataUrl, qrX, qrY, qrClipId)}

  <!-- Legal frame -->
  <g>
    <rect x="${legalOuterX}" y="${legalY}" width="${legalOuterW}" height="${legalH}" rx="14"
      fill="rgba(10,16,19,0.66)" stroke="url(#${id}-frame)" stroke-opacity=".55" />
    <g clip-path="url(#${legalClipId})">
      ${
        legalLines.length
          ? legalLines
              .map((line, i) => {
                const y = textTopY + chosenLineH * (i + 1);
                return `<text class="legal" x="${legalCenterX}" y="${y}" text-anchor="middle">${line}</text>`;
              })
              .join("\n")
          : ""
      }
    </g>
  </g>

  <!-- Microtext belts -->
  <rect x="72" y="${belt1Y}" width="1056" height="16" fill="url(#${id}-micro)" opacity=".46"/>
  <rect x="72" y="${belt2Y}" width="1056" height="10" fill="url(#${id}-micro)" opacity=".32"/>
<!-- Tasteful Φ watermark (bigger, heavier, softer) -->
<text
  x="160" y="180"
  text-anchor="middle"
  font-size="92"
  font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial"
  font-weight="900"
  fill="#81fff1"
  fill-opacity=".08"
  stroke="#81fff1"
  stroke-opacity=".06"
  stroke-width="2"
  paint-order="stroke"
>
  Φ
</text>


  ${
    showValuationMeta
      ? `
  <g opacity=".92">
    ${
      valuationPulse !== undefined || valuationAlg
        ? `<text class="micro" x="72" y="${valuation1Y}">VALUATION${valuationPulse !== undefined ? ` PULSE ${escXml(String(valuationPulse))}` : ""}${
            valuationPulse !== undefined && valuationAlg ? " • " : ""
          }${valuationAlg ? `ALGORITHM ${escXml(truncText(valuationAlg, 44))}` : ""}</text>`
        : ""
    }
    ${
      valuationStamp
        ? `<text class="micro" x="72" y="${valuation2Y}">HASH (VALUATION) ${escXml(shortHash(valuationStamp, 14, 10))}</text>`
        : ""
    }
  </g>
  `
      : ""
  }

  <!-- Footer hashes (moved up, spaced, no overlap) -->
  <g opacity=".92">
    <text class="mono" x="${fx1}" y="${footerRow1Y}">BUNDLE ${escXml(shortHash(bundleHashValue))}</text>
    <text class="mono" x="${fx2}" y="${footerRow1Y}">ZK ${escXml(shortHash(zkPoseidonHash))}</text>
    <text class="mono" x="${fx3}" y="${footerRow1Y}">VERIFIER ${escXml(verifier ?? "—")}</text>

    <text class="mono" x="${fx1}" y="${footerRow2Y}">RECEIPT ${escXml(shortHash(receiptHash))}</text>
    <text class="mono" x="${fx2}" y="${footerRow2Y}">VERSION ${escXml(verificationVersion ?? "—")}</text>
    <text class="mono" x="${fx3}" y="${footerRow2Y}">phi.network</text>
  </g>
</svg>
  `.trim();
}
