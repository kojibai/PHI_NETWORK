import { Resvg } from "@resvg/resvg-js";

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

export function renderNotFoundOgPng(capsuleHash: string): Buffer {
  const label = capsuleHash.trim() ? capsuleHash : "unknown";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12070b" />
      <stop offset="60%" stop-color="#1b0d12" />
      <stop offset="100%" stop-color="#07060a" />
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)" />
  <rect x="70" y="70" width="1060" height="490" rx="28" fill="#120c12" stroke="#ff6b6b" stroke-width="2" />

  <g transform="translate(120 170)">
    <text x="0" y="0" fill="#ff6b6b" font-family="'Unbounded', 'Inter', sans-serif" font-size="58" font-weight="800">NOT FOUND</text>
    <text x="0" y="50" fill="#c3a9b0" font-family="Inter, system-ui, sans-serif" font-size="18">Proof capsule could not be resolved.</text>
    <text x="0" y="110" fill="#9b8790" font-family="Inter, system-ui, sans-serif" font-size="14">Requested capsule hash</text>
    <text x="0" y="140" fill="#f0dde6" font-family="Inter, system-ui, sans-serif" font-size="20">${escapeXml(label)}</text>
  </g>

  <g transform="translate(120 520)">
    <text x="0" y="0" fill="#8f7b84" font-family="Inter, system-ui, sans-serif" font-size="14">Proof of Breath™ — Capsule lookup failed</text>
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
