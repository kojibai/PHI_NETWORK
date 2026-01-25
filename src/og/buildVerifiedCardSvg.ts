import type { VerifiedCardData } from "./types";
import { sanitizeSigilSvg, svgToDataUri } from "./sigilEmbed";

const WIDTH = 1200;
const HEIGHT = 630;

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
    return "M20 34 L28 42 L44 20";
  }
  return "M20 20 L44 44 M44 20 L20 44";
}

function headerCheckPath(): string {
  return "M16 26 L26 36 L44 16";
}

function sigilImageMarkup(sigilSvg: string | undefined, clipId: string): string {
  if (!sigilSvg) {
    return `
      <rect x="840" y="210" width="300" height="300" rx="28" fill="rgba(10,14,20,0.6)" />
      <text x="990" y="370" text-anchor="middle" font-size="24" font-weight="700" fill="#B7C6E3">Sigil unavailable</text>
    `;
  }
  const sanitized = sanitizeSigilSvg(sigilSvg);
  const dataUri = svgToDataUri(sanitized);
  return `
    <image
      x="840" y="210"
      width="300" height="300"
      href="${dataUri}"
      preserveAspectRatio="xMidYMid meet"
      clip-path="url(#${clipId})"
    />
  `;
}

export function buildVerifiedCardSvg(data: VerifiedCardData): string {
  const { capsuleHash, pulse, phikey, kasOk, g16Ok, sigilSvg } = data;
  const { accent, accentSoft, accentGlow } = accentFromHash(capsuleHash);
  const id = `og-${hashStringToInt(capsuleHash).toString(16)}`;
  const sigilClipId = `${id}-sigil-clip`;
  const ringGradientId = `${id}-ring`;
  const glowId = `${id}-glow`;
  const waveId = `${id}-wave`;
  const badgeGlowId = `${id}-badge-glow`;

  const phiShort = shortPhiKey(phikey);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#05060A" />
      <stop offset="55%" stop-color="#07080C" />
      <stop offset="100%" stop-color="#0B1222" />
    </linearGradient>
    <linearGradient id="${ringGradientId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.95" />
      <stop offset="50%" stop-color="#5fe3ff" stop-opacity="0.45" />
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
      <rect x="840" y="210" width="300" height="300" rx="28" />
    </clipPath>
    <style>
      .headline { font: 800 72px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #EEF2FF; }
      .subhead { font: 600 34px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #DDE6FF; }
      .phikey { font: 700 44px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #EEF2FF; }
      .label { font: 800 34px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #DDE6FF; }
      .footer { font: 700 30px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #EEF2FF; }
      .footer-right { font: 600 22px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #B9C7E6; }
    </style>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${id}-bg)" />

  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#${waveId})" opacity="0.35" />

  <g opacity="0.18" stroke="#C9D6FF" stroke-width="1" fill="none">
    <path d="M620 120 C 760 60 960 90 1140 40" />
    <path d="M640 200 C 760 140 980 170 1160 120" />
    <path d="M660 280 C 820 240 1020 250 1180 210" />
    <path d="M680 360 C 850 330 1040 330 1200 300" />
    <path d="M700 440 C 870 420 1040 420 1200 410" />
  </g>

  <circle cx="240" cy="315" r="172" fill="none" stroke="url(#${ringGradientId})" stroke-width="8" filter="url(#${glowId})" />
  <circle cx="240" cy="315" r="135" fill="rgba(11,15,24,0.92)" stroke="rgba(255,255,255,0.05)" />
  <text x="240" y="355" text-anchor="middle" font-size="170" font-weight="800" fill="#EEF2FF" font-family="Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif">Φ</text>

  <text class="headline" x="420" y="120">VERIFIED</text>
  <g transform="translate(800 78)">
    <circle cx="28" cy="28" r="26" fill="rgba(14,40,24,0.9)" stroke="#4FFFA2" stroke-width="2" filter="url(#${badgeGlowId})" />
    <path d="${headerCheckPath()}" fill="none" stroke="#4FFFA2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <text class="subhead" x="420" y="220">Pulse ${pulse} • ΦKey</text>
  <text class="phikey" x="420" y="285">${phiShort}</text>

  <text class="label" x="420" y="360">KAS</text>
  <g transform="translate(500 326)" filter="url(#${badgeGlowId})">
    <rect width="64" height="64" rx="16" fill="rgba(10,16,22,0.9)" stroke="#35F2B8" stroke-width="2" />
    <path d="${badgeMark(kasOk)}" fill="none" stroke="${kasOk ? "#35F2B8" : "#FF6F6F"}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <text class="label" x="620" y="360">G16</text>
  <g transform="translate(700 326)" filter="url(#${badgeGlowId})">
    <rect width="64" height="64" rx="16" fill="rgba(10,16,22,0.9)" stroke="#35F2B8" stroke-width="2" />
    <path d="${badgeMark(g16Ok)}" fill="none" stroke="${g16Ok ? "#35F2B8" : "#FF6F6F"}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <rect x="828" y="198" width="324" height="324" rx="34" fill="rgba(8,12,18,0.75)" stroke="${accent}" stroke-width="3" filter="url(#${glowId})" />
  <rect x="840" y="210" width="300" height="300" rx="28" fill="rgba(10,14,20,0.65)" />
  ${sigilImageMarkup(sigilSvg, sigilClipId)}

  <rect x="40" y="560" width="1120" height="54" rx="20" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.12)" />
  <text class="footer" x="70" y="596">Proof of Breath™ — VERIFIED</text>
  <text class="footer-right" x="1110" y="596" text-anchor="end">phi.network</text>
</svg>
  `.trim();
}
