import phiSvg from "../assets/phi.svg?raw";
import type { VerifiedCardData } from "./types";
import { sanitizeSigilSvg, svgToDataUri } from "./sigilEmbed";
import { currency as fmtPhi, usd as fmtUsd } from "../components/valuation/display";

export const VERIFIED_CARD_W = 1200;
export const VERIFIED_CARD_H = 630;
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

function qrImageMarkup(qrDataUrl: string | undefined, clipId: string): string {
  if (!qrDataUrl) {
    return `
      <rect x="860" y="462" width="240" height="140" rx="16" fill="rgba(10,12,18,0.7)" stroke="rgba(255,255,255,0.08)" />
      <text x="980" y="542" text-anchor="middle" font-size="18" font-weight="600" fill="#B7C6E3">QR unavailable</text>
    `;
  }
  return `
    <image
      x="868" y="470"
      width="224" height="124"
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

  const phiShort = shortPhiKey(phikey);
  const valuationSnapshot = data.valuation ? { ...data.valuation } : data.receipt?.valuation ? { ...data.receipt.valuation } : undefined;
  if (valuationSnapshot && "valuationHash" in valuationSnapshot) {
    delete (valuationSnapshot as { valuationHash?: string }).valuationHash;
  }
  const valuationHash = data.valuation?.valuationHash ?? data.receipt?.valuationHash;
  const valuationPhi = formatPhiValue(valuationSnapshot?.phiValue);
  const valuationUsd = formatUsdValue(valuationSnapshot?.usdValue);
  const valuationModeLabel =
    valuationSnapshot?.mode === "receive" ? "RECEIVE" : valuationSnapshot?.mode === "origin" ? "ORIGIN" : "ORIGIN";

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

  const auditMeta = dropUndefined({
    receiptHash: data.receiptHash,
    valuation: valuationSnapshot,
    valuationHash,
    bundleHash: bundleHashValue,
    zkPoseidonHash,
    verifiedAtPulse: receiptPayload?.verifiedAtPulse ?? verifiedAtPulse,
  });
  const auditJson = JSON.stringify(auditMeta);

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
      <rect x="860" y="462" width="240" height="140" rx="16" />
    </clipPath>
    <style>
      .headline { font: 800 56px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; letter-spacing: 0.12em; fill: #F4F6FB; }
      .subhead { font: 600 26px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #DEE6F5; }
      .phikey { font: 700 38px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #F2F5FB; }
      .label { font: 700 22px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #C4D0E6; letter-spacing: 0.08em; }
      .value { font: 700 30px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #F2F5FB; }
      .mode-label { font: 800 18px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #94BCEB; letter-spacing: 0.24em; }
      .micro { font: 500 12px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #8FA3C5; letter-spacing: 0.12em; }
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

  <text class="headline" x="320" y="120">VERIFIED ORIGIN</text>
  <text class="subhead" x="320" y="162">Steward Verified @ Pulse ${verifiedAtPulse}</text>
  ${valuationModeLabel ? `<text class="mode-label" x="320" y="196">${valuationModeLabel}</text>` : ""}

  <text class="label" x="320" y="260">ΦKEY</text>
  <text class="phikey" x="320" y="300">${phiShort}</text>

  <text class="label" x="320" y="350">KAS</text>
  <g transform="translate(380 324)" filter="url(#${badgeGlowId})">
    <rect width="54" height="54" rx="14" fill="rgba(10,16,22,0.9)" stroke="${kasOk ? "#38E4B6" : "#C86B6B"}" stroke-width="2" />
    <path d="${badgeMark(kasOk)}" fill="none" stroke="${kasOk ? "#38E4B6" : "#C86B6B"}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <text class="label" x="470" y="350">G16</text>
  <g transform="translate(530 324)" filter="url(#${badgeGlowId})">
    <rect width="54" height="54" rx="14" fill="rgba(10,16,22,0.9)" stroke="${g16Ok ? "#38E4B6" : "#C86B6B"}" stroke-width="2" />
    <path d="${badgeMark(g16Ok)}" fill="none" stroke="${g16Ok ? "#38E4B6" : "#C86B6B"}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <text class="label" x="320" y="420">Φ VALUE</text>
  <text class="value" x="320" y="456">${valuationPhi}</text>

  <text class="label" x="320" y="498">USD VALUE</text>
  <text class="value" x="320" y="534">${valuationUsd}</text>

  <g id="${sealId}" transform="translate(700 86)">
    <circle cx="120" cy="60" r="48" fill="rgba(12,14,18,0.75)" stroke="${accent}" stroke-width="2" filter="url(#${glowId})" />
    <text x="120" y="55" text-anchor="middle" class="seal" fill="${accent}">VERIFIED</text>
    <text x="120" y="74" text-anchor="middle" class="seal" fill="${accentSoft}">SEAL</text>
  </g>

  <rect x="796" y="136" width="348" height="348" rx="30" fill="rgba(6,8,12,0.75)" stroke="${accent}" stroke-width="2.4" filter="url(#${glowId})" />
  <rect x="810" y="150" width="320" height="320" rx="26" fill="rgba(10,14,20,0.6)" />
  ${sigilImageMarkup(sigilSvg, sigilClipId)}

  <rect x="844" y="448" width="272" height="164" rx="18" fill="rgba(10,12,18,0.62)" stroke="rgba(255,255,255,0.12)" />
  ${qrImageMarkup(qrDataUrl, qrClipId)}

  <g opacity="0.9">
    <text class="micro" x="80" y="570">BUNDLE ${shortHash(bundleHashValue)}</text>
    <text class="micro" x="80" y="588">RECEIPT ${shortHash(receiptHash)}</text>
    <text class="micro" x="320" y="570">SVG ${shortHash(svgHash)}</text>
    <text class="micro" x="320" y="588">CAPSULE ${shortHash(capsuleHash)}</text>
  </g>
</svg>
  `.trim();
}
