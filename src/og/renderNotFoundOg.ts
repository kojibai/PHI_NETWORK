import { Resvg } from "@resvg/resvg-js";

const WIDTH = 1200;
const HEIGHT = 630;

const escapeXml = (value: string): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

function buildNotFoundSvg(capsuleHash: string): string {
  const safeHash = escapeXml(capsuleHash || "unknown");
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="nf-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B0507" />
      <stop offset="50%" stop-color="#10070B" />
      <stop offset="100%" stop-color="#1A0A12" />
    </linearGradient>
    <filter id="nf-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <style>
      .headline { font: 800 72px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #FFE6EC; }
      .sub { font: 600 28px "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; fill: #F2C9D2; }
      .mono { font: 600 22px "JetBrains Mono", "SFMono-Regular", Menlo, monospace; fill: #F2A7B6; }
    </style>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#nf-bg)" />
  <circle cx="240" cy="315" r="172" fill="none" stroke="#FF5B8A" stroke-width="6" filter="url(#nf-glow)" />
  <circle cx="240" cy="315" r="135" fill="rgba(20,10,16,0.92)" stroke="rgba(255,255,255,0.05)" />
  <text x="240" y="355" text-anchor="middle" font-size="170" font-weight="800" fill="#FFE6EC" font-family="Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif">Φ</text>

  <text class="headline" x="420" y="130">NOT FOUND</text>
  <text class="sub" x="420" y="200">Proof capsule unavailable</text>
  <text class="mono" x="420" y="260">${safeHash}</text>

  <rect x="40" y="560" width="1120" height="54" rx="20" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.12)" />
  <text x="70" y="596" font-size="28" font-weight="700" fill="#FFE6EC" font-family="Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif">Proof of Breath™ — NOT FOUND</text>
  <text x="1110" y="596" text-anchor="end" font-size="22" font-weight="600" fill="#F2A7B6" font-family="Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif">phi.network</text>
</svg>
  `.trim();
}

export function renderNotFoundOgPng(capsuleHash: string): Buffer {
  const svg = buildNotFoundSvg(capsuleHash);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  const pngData = resvg.render().asPng();
  return Buffer.from(pngData);
}
