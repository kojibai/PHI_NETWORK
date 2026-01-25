import { Resvg } from "@resvg/resvg-js";
import type { VerifiedOgData } from "./types";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortPhiKey(phiKey: string): string {
  const trimmed = phiKey.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}`;
}

function accentFromHash(hash: string): { primary: string; secondary: string } {
  const safe = hash.replace(/[^0-9a-fA-F]/g, "");
  const seed = safe.slice(0, 6) || "7c9aff";
  const hue = parseInt(seed, 16) % 360;
  const primary = `hsl(${hue}, 88%, 62%)`;
  const secondary = `hsl(${(hue + 28) % 360}, 92%, 55%)`;
  return { primary, secondary };
}

function checkLabel(ok: boolean): string {
  return ok ? "✓" : "✕";
}

export function renderVerifiedOgPng(data: VerifiedOgData): Buffer {
  const { primary, secondary } = accentFromHash(data.capsuleHash);
  const pulse = Number.isFinite(data.pulse) ? Math.trunc(data.pulse).toString() : "—";
  const phiShort = shortPhiKey(data.phikey);
  const capsuleHash = data.capsuleHash;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#06070b" />
      <stop offset="55%" stop-color="#0a1020" />
      <stop offset="100%" stop-color="#05060a" />
    </linearGradient>
    <linearGradient id="halo" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${primary}" stop-opacity="0.6" />
      <stop offset="100%" stop-color="${secondary}" stop-opacity="0.4" />
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14" result="blur" />
      <feColorMatrix
        in="blur"
        type="matrix"
        values="0 0 0 0 0.35  0 0 0 0 0.75  0 0 0 0 1  0 0 0 0.9 0"
      />
    </filter>
  </defs>

  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)" />
  <rect x="60" y="60" width="1080" height="510" rx="28" fill="#0b1223" stroke="url(#halo)" stroke-width="2" />
  <rect x="90" y="90" width="1020" height="450" rx="24" fill="#0c1428" opacity="0.7" />

  <g transform="translate(110 130)">
    <text x="0" y="0" fill="${primary}" font-family="'Unbounded', 'Inter', sans-serif" font-size="64" font-weight="800" letter-spacing="2">VERIFIED</text>
    <text x="0" y="44" fill="#A6B4D6" font-family="Inter, system-ui, sans-serif" font-size="20" letter-spacing="4">PROOF OF BREATH™</text>
  </g>

  <g transform="translate(110 220)">
    <rect x="0" y="0" width="360" height="190" rx="22" fill="#0a0f1e" stroke="#1c2842" stroke-width="1" />
    <text x="26" y="50" fill="#8EA2C9" font-family="Inter, system-ui, sans-serif" font-size="18">PULSE</text>
    <text x="26" y="102" fill="#E7F0FF" font-family="'Unbounded', 'Inter', sans-serif" font-size="44" font-weight="600">${escapeXml(pulse)}</text>
    <text x="26" y="150" fill="#8EA2C9" font-family="Inter, system-ui, sans-serif" font-size="16">ΦKey</text>
    <text x="26" y="178" fill="#E7F0FF" font-family="Inter, system-ui, sans-serif" font-size="22">${escapeXml(phiShort)}</text>
  </g>

  <g transform="translate(510 220)">
    <rect x="0" y="0" width="300" height="190" rx="22" fill="#0a0f1e" stroke="#1c2842" stroke-width="1" />
    <text x="28" y="50" fill="#8EA2C9" font-family="Inter, system-ui, sans-serif" font-size="16">KAS</text>
    <text x="90" y="54" fill="${data.kasOk ? primary : "#ff6b6b"}" font-family="'Unbounded', 'Inter', sans-serif" font-size="26" font-weight="700">${checkLabel(data.kasOk)}</text>

    <text x="28" y="110" fill="#8EA2C9" font-family="Inter, system-ui, sans-serif" font-size="16">G16</text>
    <text x="90" y="114" fill="${data.g16Ok ? primary : "#ff6b6b"}" font-family="'Unbounded', 'Inter', sans-serif" font-size="26" font-weight="700">${checkLabel(data.g16Ok)}</text>

    <text x="28" y="160" fill="#9AB0D8" font-family="Inter, system-ui, sans-serif" font-size="14">Capsule</text>
    <text x="28" y="184" fill="#E7F0FF" font-family="Inter, system-ui, sans-serif" font-size="12">${escapeXml(capsuleHash.slice(0, 24))}…</text>
  </g>

  <g transform="translate(860 190)">
    <circle cx="120" cy="120" r="108" fill="#0b1226" stroke="url(#halo)" stroke-width="2" />
    <circle cx="120" cy="120" r="88" fill="#0c152b" />
    <circle cx="120" cy="120" r="70" fill="#0f1a33" />
    <text x="120" y="142" text-anchor="middle" fill="${secondary}" font-family="'Unbounded', 'Inter', sans-serif" font-size="72" font-weight="700">Φ</text>
    <circle cx="120" cy="120" r="96" fill="url(#halo)" opacity="0.25" filter="url(#glow)" />
  </g>

  <g transform="translate(110 520)">
    <text x="0" y="0" fill="#9FB2DA" font-family="Inter, system-ui, sans-serif" font-size="16">Proof of Breath™ — VERIFIED</text>
    <text x="620" y="0" fill="#5E6C88" font-family="Inter, system-ui, sans-serif" font-size="12">phi.network</text>
  </g>
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: OG_WIDTH,
    },
  });
  const rendered = resvg.render();
  const pngData = rendered.asPng();
  return Buffer.from(pngData);
}
