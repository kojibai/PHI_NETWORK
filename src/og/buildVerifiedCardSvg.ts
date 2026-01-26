import phiSvg from "../assets/phi.svg?raw";
import type { VerifiedCardData } from "./types";
import { sanitizeSigilSvg, svgToDataUri } from "./sigilEmbed";
import { currency as fmtPhi, usd as fmtUsd } from "../components/valuation/display";
import { buildProofOfBreathSeal } from "./proofOfBreathSeal";

export const VERIFIED_CARD_W = 1200;
export const VERIFIED_CARD_H = 630;
const PHI = (1 + Math.sqrt(5)) / 2;
const phiLogoDataUri = svgToDataUri(phiSvg);

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

function badgeMark(ok: boolean): string {
  if (ok) {
    return "M18 32 L28 42 L46 18";
  }
  return "M20 20 L44 44 M44 20 L20 44";
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

function sigilImageMarkup(sigilSvg: string | undefined, clipId: string): string {
  if (!sigilSvg) {
    return `
      <rect x="810" y="150" width="320" height="320" rx="26" fill="rgba(14,16,20,0.7)" stroke="rgba(255,255,255,0.08)" />
      <text x="970" y="330" text-anchor="middle" font-size="22" font-weight="600" fill="#C9D4E8">Sigil unavailable</text>
    `;
  }
  const sanitized = sanitizeSigilSvg(sigilSvg);
  const dataUri = svgToDataUri(sanitized);
  return `
    <image
      x="810" y="150"
      width="320" height="320"
      href="${dataUri}"
      preserveAspectRatio="xMidYMid meet"
      clip-path="url(#${clipId})"
    />
  `;
}

function qrImageMarkup(qrDataUrl: string | undefined, clipId: string, x: number, y: number): string {
  if (!qrDataUrl) {
    return `
      <rect x="${x}" y="${y}" width="264" height="124" rx="16" fill="rgba(10,12,18,0.7)" stroke="rgba(255,255,255,0.08)" />
      <text x="${x + 132}" y="${y + 72}" text-anchor="middle" font-size="18" font-weight="600" fill="#B7C6E3">QR unavailable</text>
    `;
  }
  return `
    <image
      x="${x + 16}" y="${y + 8}"
      width="232" height="108"
      href="${qrDataUrl}"
      preserveAspectRatio="xMidYMid meet"
      clip-path="url(#${clipId})"
    />
  `;
}

function shortHash(value: string | undefined, head = 10, tail = 8): string {
  if (!value) return "—";
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function sealPlacement(seedValue: string): { x: number; y: number; rotation: number; dash: string } {
  const hash = hashStringToInt(seedValue);
  const offsetX = (hash % 48) - 24;
  const offsetY = ((hash >> 6) % 24) - 12;
  const rotation = ((hash % 41) - 20) * 0.5;
  const dashA = 4 + (hash % 5);
  const dashB = 3 + ((hash >> 3) % 4);
  return { x: 1008 + offsetX, y: 92 + offsetY, rotation, dash: `${dashA} ${dashB}` };
}

function sealBrandIcon(x: number, y: number, palette: { primary: string; accent: string }): string {
  return `
    <g transform="translate(${x} ${y})">
      <circle cx="0" cy="0" r="6" fill="none" stroke="${palette.primary}" stroke-width="1.2" />
      <circle cx="0" cy="0" r="1.8" fill="${palette.accent}" />
    </g>
  `;
}

function ornamentMarkup(
  x: number,
  y: number,
  width: number,
  height: number,
  palette: { primary: string; secondary: string; accent: string },
  geometry: { tickCount: number; polygonSides: number },
): string {
  const inset = 16;
  const left = x + inset;
  const right = x + width - inset;
  const top = y + inset;
  const bottom = y + height - inset;
  const cx = x + width - inset - 24;
  const cy = y + inset + 24;
  const ticks = Array.from({ length: Math.min(geometry.tickCount, 18) }).map((_, idx) => {
    const t = (idx / Math.min(geometry.tickCount, 18)) * Math.PI * 0.6 + Math.PI * 1.2;
    const inner = 18;
    const outer = 26;
    const x1 = cx + Math.cos(t) * inner;
    const y1 = cy + Math.sin(t) * inner;
    const x2 = cx + Math.cos(t) * outer;
    const y2 = cy + Math.sin(t) * outer;
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${palette.accent}" stroke-width="0.9" opacity="0.5" />`;
  });
  const poly = Array.from({ length: geometry.polygonSides }).map((_, idx) => {
    const t = (idx / geometry.polygonSides) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(t) * 12;
    const py = cy + Math.sin(t) * 12;
    return `${idx === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)}`;
  });
  return `
    <g opacity="0.6">
      <path d="M ${left} ${top} L ${left + 36} ${top} L ${left + 46} ${top + 10}" stroke="${palette.secondary}" stroke-width="1" fill="none" />
      <path d="M ${right} ${bottom} L ${right - 32} ${bottom} L ${right - 42} ${bottom - 12}" stroke="${palette.secondary}" stroke-width="1" fill="none" />
      <circle cx="${cx}" cy="${cy}" r="20" fill="none" stroke="${palette.primary}" stroke-width="1" opacity="0.5" />
      ${ticks.join("\n")}
      <path d="${poly.join(" ")} Z" fill="none" stroke="${palette.primary}" stroke-width="0.9" opacity="0.55" />
    </g>
  `;
}

export function buildVerifiedCardSvg(data: VerifiedCardData): string {
  const { capsuleHash, verifiedAtPulse, phikey, kasOk, g16Ok, sigilSvg, qrDataUrl, svgHash, receiptHash } = data;
  const { accent, accentSoft, accentGlow } = accentFromHash(capsuleHash);
  const id = `og-${hashStringToInt(capsuleHash).toString(16)}`;
  const sigilClipId = `${id}-sigil-clip`;
  const qrClipId = `${id}-qr-clip`;
  const ringGradientId = `${id}-ring`;
  const glowId = `${id}-glow`;
  const waveId = `${id}-wave`;
  const badgeGlowId = `${id}-badge-glow`;
  const sealId = `${id}-seal`;
  const hasKas = typeof kasOk === "boolean";
  const sealSeed = `${capsuleHash}|${svgHash ?? ""}|${verifiedAtPulse}`;
  const seal = sealPlacement(sealSeed);

  const phiShort = shortPhiKey(phikey);
  const valuationSnapshot = data.valuation ? { ...data.valuation } : data.receipt?.valuation ? { ...data.receipt.valuation } : undefined;
  if (valuationSnapshot && "valuationHash" in valuationSnapshot) {
    delete (valuationSnapshot as { valuationHash?: string }).valuationHash;
  }
  const valuationHash = data.valuation?.valuationHash ?? data.receipt?.valuationHash;
  const valuationPhi = formatPhiValue(valuationSnapshot?.phiValue);
  const valuationUsd = formatUsdValue(valuationSnapshot?.usdValue);
  const isReceiveMode = valuationSnapshot?.mode === "receive";
  const valuationModeLabel = isReceiveMode ? "RECEIVE" : "ORIGIN";
  const headlineText = isReceiveMode ? "VERIFIED RECEIVE" : "VERIFIED ORIGIN";

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
  const receiptMeta: Record<string, unknown> = {};
  const bundleHashValue = receiptPayload?.bundleHash ?? data.bundleHash;
  const zkPoseidonHash = receiptPayload?.zkPoseidonHash ?? data.zkPoseidonHash;
  const verifier = receiptPayload?.verifier ?? data.verifier;
  const verificationVersion = receiptPayload?.verificationVersion ?? data.verificationVersion;
  if (bundleHashValue) receiptMeta.bundleHash = bundleHashValue;
  if (zkPoseidonHash) receiptMeta.zkPoseidonHash = zkPoseidonHash;
  if (verifier) receiptMeta.verifier = verifier;
  if (verificationVersion) receiptMeta.verificationVersion = verificationVersion;
  receiptMeta.verifiedAtPulse = receiptPayload?.verifiedAtPulse ?? verifiedAtPulse;
  if (receiptPayload) receiptMeta.receipt = receiptPayload;
  if (data.receiptHash) receiptMeta.receiptHash = data.receiptHash;
  if (data.verificationSig) receiptMeta.verificationSig = data.verificationSig;
  const receiptJson = JSON.stringify(receiptMeta);

  const proofSeal = buildProofOfBreathSeal({
    bundleHash: bundleHashValue,
    capsuleHash,
    svgHash,
    receiptHash,
    pulse: verifiedAtPulse,
  });

  const auditMeta = dropUndefined({
    receiptHash: data.receiptHash,
    valuation: valuationSnapshot,
    valuationHash,
    bundleHash: bundleHashValue,
    zkPoseidonHash,
    verifiedAtPulse: receiptPayload?.verifiedAtPulse ?? verifiedAtPulse,
  });
  const auditJson = JSON.stringify(auditMeta);

  const proofSealLabel = "PROOF OF BREATH™";
  const proofSealMicro = `${shortHash(capsuleHash, 6, 4)} · ${shortHash(bundleHashValue, 6, 4)}`;
  const proofSealSize = 240;
  const proofSealX = 600;
  const proofSealY = 312;
  const proofSealMarkup = proofSeal.toSvg(proofSealX, proofSealY, proofSealSize, id, proofSealLabel, proofSealMicro);
  const sigilFrameX = 796;
  const sigilFrameY = 136;
  const sigilFrameSize = 348;
  const unit = 22;
  const phiGap = Math.round(unit * PHI);
  const badgeLabelY = 262;
  const valueLabelY = badgeLabelY + phiGap;
  const valueY = valueLabelY + Math.round(unit * 1.4);
  const usdLabelY = valueY + phiGap;
  const usdValueY = usdLabelY + Math.round(unit * 1.4);
  const qrBoxX = 128;
  const qrBoxY = usdValueY + Math.round(phiGap * 0.45);
  const qrBoxW = 288;
  const qrBoxH = 140;
  const brandX = 420;
  const brandY = 206;
  const phiKeyLabelY = Math.round(proofSealY + proofSealSize / 2 + phiGap * 0.7);
  const phiKeyValueY = phiKeyLabelY + Math.round(unit * 1.9);
  const brandPalette = proofSeal.palette;
  const ornament = ornamentMarkup(810, 150, 320, 320, brandPalette, proofSeal.geometry);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${VERIFIED_CARD_W}" height="${VERIFIED_CARD_H}" viewBox="0 0 ${VERIFIED_CARD_W} ${VERIFIED_CARD_H}">
  <metadata id="kai-verified-receipt"><![CDATA[${receiptJson}]]></metadata>
  <metadata id="kai-verified-audit"><![CDATA[${auditJson}]]></metadata>
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0E1118" />
      <stop offset="55%" stop-color="#0B0E14" />
      <stop offset="100%" stop-color="#141B26" />
    </linearGradient>
    <linearGradient id="${ringGradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.95" />
      <stop offset="50%" stop-color="#9fe2ff" stop-opacity="0.45" />
      <stop offset="100%" stop-color="${accentSoft}" stop-opacity="0.85" />
    </linearGradient>
    <radialGradient id="${waveId}" cx="0.9" cy="0.2" r="0.8">
      <stop offset="0%" stop-color="${accentGlow}" />
      <stop offset="100%" stop-color="rgba(0,0,0,0)" />
    </radialGradient>
    <filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18" result="blur" />
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.8 0" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="${badgeGlowId}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  <clipPath id="${sigilClipId}">
      <rect x="810" y="150" width="320" height="320" rx="26" />
    </clipPath>
    <clipPath id="${qrClipId}">
      <rect x="${qrBoxX + 12}" y="${qrBoxY + 8}" width="264" height="124" rx="16" />
    </clipPath>
    <style>
      .headline { font: 800 56px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; letter-spacing: 0.12em; fill: #F4F6FB; }
      .subhead { font: 600 26px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #DEE6F5; }
      .phikey { font: 700 38px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #F2F5FB; }
      .label { font: 700 22px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #C4D0E6; letter-spacing: 0.08em; }
      .value { font: 700 30px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #F2F5FB; }
      .mode-label { font: 800 18px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #94BCEB; letter-spacing: 0.24em; }
      .micro { font: 500 12px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #8FA3C5; letter-spacing: 0.12em; }
      .brand { font: 600 14px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #9FB5DA; letter-spacing: 0.42em; }
      .seal { font: 700 16px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; letter-spacing: 0.24em; }
    </style>
  </defs>

  <rect width="${VERIFIED_CARD_W}" height="${VERIFIED_CARD_H}" fill="url(#${id}-bg)" />

  <rect x="0" y="0" width="${VERIFIED_CARD_W}" height="${VERIFIED_CARD_H}" fill="url(#${waveId})" opacity="0.25" />

  <rect x="26" y="26" width="1148" height="578" rx="26" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.8" />
  <rect x="40" y="40" width="1120" height="550" rx="22" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.2" />

  <g opacity="0.12" stroke="#C9D6FF" stroke-width="1" fill="none">
    <path d="M420 120 C 560 60 760 90 980 40" />
    <path d="M440 200 C 560 140 780 170 1000 120" />
    <path d="M460 280 C 640 240 820 250 1040 210" />
    <path d="M480 360 C 670 330 860 330 1080 300" />
    <path d="M500 440 C 690 420 860 420 1100 410" />
  </g>

  <circle cx="220" cy="220" r="92" fill="none" stroke="url(#${ringGradientId})" stroke-width="6" filter="url(#${glowId})" />
  <circle cx="220" cy="220" r="72" fill="rgba(11,14,20,0.85)" stroke="rgba(255,255,255,0.08)" />
  <image
    x="180" y="180"
    width="80" height="80"
    href="${phiLogoDataUri}"
    preserveAspectRatio="xMidYMid meet"
  />

  <text class="headline" x="320" y="120">${headlineText}</text>
  <text class="subhead" x="320" y="162">Steward Verified @ Pulse ${verifiedAtPulse}</text>
  ${valuationModeLabel ? `<text class="mode-label" x="320" y="196">${valuationModeLabel}</text>` : ""}
  ${sealBrandIcon(brandX - 18, brandY - 4, { primary: brandPalette.primary, accent: brandPalette.accent })}
  <text class="brand" x="${brandX}" y="${brandY}">SIGIL-SEAL</text>

  <text class="label" x="${proofSealX}" y="${phiKeyLabelY}" text-anchor="middle">ΦKEY</text>
  <text class="phikey" x="${proofSealX}" y="${phiKeyValueY}" text-anchor="middle">${phiShort}</text>

  ${hasKas ? `<text class="label" x="320" y="${badgeLabelY}">KAS</text>` : ""}
  ${
    hasKas
      ? `<g transform="translate(368 ${badgeLabelY - 22})" filter="url(#${badgeGlowId})">
    <rect width="54" height="54" rx="14" fill="rgba(10,16,22,0.9)" stroke="${kasOk ? "#38E4B6" : "#C86B6B"}" stroke-width="2" />
    <g transform="translate(13.5 13.5) scale(0.5)">
      <path d="${badgeMark(kasOk)}" fill="none" stroke="${kasOk ? "#38E4B6" : "#C86B6B"}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    </g>
  </g>`
      : ""
  }

  <text class="label" x="${hasKas ? 470 : 320}" y="${badgeLabelY}">G16</text>
  <g transform="translate(${hasKas ? 508 : 358} ${badgeLabelY - 22})" filter="url(#${badgeGlowId})">
    <g transform="translate(4 4) scale(0.85)">
      <rect width="54" height="54" rx="14" fill="rgba(10,16,22,0.9)" stroke="${g16Ok ? "#38E4B6" : "#C86B6B"}" stroke-width="1.8" />
      <g transform="translate(13.5 13.5) scale(0.5)">
        <path d="${badgeMark(g16Ok)}" fill="none" stroke="${g16Ok ? "#38E4B6" : "#C86B6B"}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    </g>
  </g>

  <text class="label" x="320" y="${valueLabelY}">Φ VALUE</text>
  <text class="value" x="320" y="${valueY}">${valuationPhi}</text>

  <text class="label" x="320" y="${usdLabelY}">USD VALUE</text>
  <text class="value" x="320" y="${usdValueY}">${valuationUsd}</text>

  <g id="${sealId}" transform="translate(${seal.x} ${seal.y}) rotate(${seal.rotation})">
    <circle cx="0" cy="0" r="44" fill="rgba(12,14,18,0.72)" stroke="${accent}" stroke-width="2" filter="url(#${glowId})" stroke-dasharray="${seal.dash}" />
    <circle cx="0" cy="0" r="30" fill="none" stroke="${accentSoft}" stroke-width="1.2" opacity="0.7" />
    <text x="0" y="-2" text-anchor="middle" class="seal" fill="${accent}">VERIFIED</text>
    <text x="0" y="16" text-anchor="middle" class="seal" fill="${accentSoft}">${shortHash(capsuleHash, 6, 4)}</text>
  </g>

  ${proofSealMarkup}

  <rect x="${sigilFrameX}" y="${sigilFrameY}" width="${sigilFrameSize}" height="${sigilFrameSize}" rx="30" fill="rgba(6,8,12,0.75)" stroke="${accent}" stroke-width="2.4" filter="url(#${glowId})" />
  <rect x="810" y="150" width="320" height="320" rx="26" fill="rgba(10,14,20,0.6)" />
  ${sigilImageMarkup(sigilSvg, sigilClipId)}
  ${ornament}

  <rect x="${qrBoxX}" y="${qrBoxY}" width="${qrBoxW}" height="${qrBoxH}" rx="18" fill="rgba(10,12,18,0.62)" stroke="rgba(255,255,255,0.12)" />
  ${qrImageMarkup(qrDataUrl, qrClipId, qrBoxX + 12, qrBoxY + 8)}

  <g opacity="0.9">
    <text class="micro" x="80" y="570">BUNDLE ${shortHash(bundleHashValue)}</text>
    <text class="micro" x="80" y="588">RECEIPT ${shortHash(receiptHash)}</text>
    <text class="micro" x="320" y="570">SVG ${shortHash(svgHash)}</text>
    <text class="micro" x="320" y="588">CAPSULE ${shortHash(capsuleHash)}</text>
    <text class="micro" x="820" y="588">phi.network</text>
  </g>
</svg>
  `.trim();
}
