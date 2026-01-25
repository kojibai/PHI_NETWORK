import { PNG } from "pngjs";
import type { VerifiedOgData } from "./types";

type PngInstance = InstanceType<typeof PNG> & { data: Buffer };

type Rgba = [number, number, number, number];

type PngSyncWriter = { sync: { write: (png: PngInstance) => Buffer } };

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const FONT_5X7: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10001", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "✓": ["00001", "00010", "00100", "10100", "01000", "00000", "00000"],
  "✕": ["10001", "01010", "00100", "01010", "10001", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function normalizeText(text: string): string {
  return text.replaceAll("Φ", "PHI").replaceAll("™", "TM").toUpperCase();
}

function fillRect(png: PngInstance, x: number, y: number, w: number, h: number, color: Rgba): void {
  const [r, g, b, a] = color;
  for (let yy = y; yy < y + h; yy += 1) {
    if (yy < 0 || yy >= png.height) continue;
    for (let xx = x; xx < x + w; xx += 1) {
      if (xx < 0 || xx >= png.width) continue;
      const idx = (png.width * yy + xx) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
}

function drawGradient(png: PngInstance, top: Rgba, bottom: Rgba): void {
  const [tr, tg, tb] = top;
  const [br, bg, bb] = bottom;
  for (let y = 0; y < png.height; y += 1) {
    const t = y / (png.height - 1);
    const r = Math.round(tr + (br - tr) * t);
    const g = Math.round(tg + (bg - tg) * t);
    const b = Math.round(tb + (bb - tb) * t);
    fillRect(png, 0, y, png.width, 1, [r, g, b, 255]);
  }
}

function drawText(png: PngInstance, textRaw: string, x: number, y: number, scale: number, color: Rgba): void {
  const text = normalizeText(textRaw);
  let cursor = x;
  for (const char of text) {
    const glyph = FONT_5X7[char] ?? FONT_5X7[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      const line = glyph[row];
      for (let col = 0; col < line.length; col += 1) {
        if (line[col] === "1") {
          fillRect(png, cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
}

function measureText(textRaw: string, scale: number): number {
  const text = normalizeText(textRaw);
  return text.length * (5 + 1) * scale;
}

function drawLine(png: PngInstance, x0: number, y0: number, x1: number, y1: number, color: Rgba): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    fillRect(png, x, y, 2, 2, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawBadge(png: PngInstance, x: number, y: number, ok: boolean): void {
  const size = 18;
  const stroke: Rgba = [124, 156, 204, 210];
  const fill: Rgba = [10, 16, 26, 255];
  fillRect(png, x, y, size, size, fill);
  fillRect(png, x, y, size, 2, stroke);
  fillRect(png, x, y + size - 2, size, 2, stroke);
  fillRect(png, x, y, 2, size, stroke);
  fillRect(png, x + size - 2, y, 2, size, stroke);

  if (ok) {
    drawLine(png, x + 4, y + 10, x + 8, y + 14, [56, 231, 166, 255]);
    drawLine(png, x + 8, y + 14, x + 14, y + 4, [56, 231, 166, 255]);
  } else {
    drawLine(png, x + 4, y + 4, x + 14, y + 14, [255, 107, 107, 255]);
    drawLine(png, x + 14, y + 4, x + 4, y + 14, [255, 107, 107, 255]);
  }
}

function drawCircle(png: PngInstance, cx: number, cy: number, radius: number, color: Rgba): void {
  const r2 = radius * radius;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= r2) {
        fillRect(png, cx + x, cy + y, 1, 1, color);
      }
    }
  }
}

function drawRing(png: PngInstance, cx: number, cy: number, radius: number, thickness: number, color: Rgba): void {
  const outer = radius * radius;
  const inner = (radius - thickness) * (radius - thickness);
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const dist = x * x + y * y;
      if (dist <= outer && dist >= inner) {
        fillRect(png, cx + x, cy + y, 1, 1, color);
      }
    }
  }
}

function shortPhiKey(phiKey: string): string {
  const trimmed = phiKey.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}`;
}

function accentFromHash(hash: string): { primary: Rgba; secondary: Rgba } {
  const safe = hash.replace(/[^0-9a-fA-F]/g, "");
  const seed = safe.slice(0, 6) || "7c9aff";
  const hue = parseInt(seed, 16) % 360;
  const toRgb = (h: number, s: number, l: number): [number, number, number] => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  };
  const [pr, pg, pb] = toRgb(hue, 0.82, 0.6);
  const [sr, sg, sb] = toRgb((hue + 28) % 360, 0.86, 0.55);
  return { primary: [pr, pg, pb, 255], secondary: [sr, sg, sb, 255] };
}

export function renderVerifiedOgPng(data: VerifiedOgData): Buffer {
  const { primary, secondary } = accentFromHash(data.capsuleHash);
  const pulse = Number.isFinite(data.pulse) ? Math.trunc(data.pulse).toString() : "—";
  const phiShort = shortPhiKey(data.phikey);

  const png = new PNG({ width: OG_WIDTH, height: OG_HEIGHT }) as PngInstance;
  if (!png.data) {
    throw new Error("PNG buffer not initialized");
  }

  drawGradient(png, [6, 8, 14, 255], [4, 6, 10, 255]);
  fillRect(png, 60, 60, 1080, 510, [11, 18, 32, 255]);
  fillRect(png, 60, 60, 1080, 4, [primary[0], primary[1], primary[2], 180]);
  fillRect(png, 60, 566, 1080, 4, [secondary[0], secondary[1], secondary[2], 140]);

  drawText(png, "VERIFIED", 110, 120, 6, primary);
  drawText(png, "PROOF OF BREATH TM", 110, 200, 3, [166, 184, 212, 220]);

  fillRect(png, 110, 240, 360, 190, [10, 16, 28, 255]);
  fillRect(png, 110, 240, 360, 2, [36, 54, 90, 200]);
  drawText(png, "PULSE", 130, 270, 2, [140, 170, 210, 200]);
  drawText(png, pulse, 130, 300, 4, [230, 242, 255, 255]);
  drawText(png, "PHIKEY", 130, 360, 2, [140, 170, 210, 200]);
  drawText(png, phiShort, 130, 390, 2, [230, 242, 255, 255]);

  fillRect(png, 520, 240, 300, 190, [10, 16, 28, 255]);
  fillRect(png, 520, 240, 300, 2, [36, 54, 90, 200]);
  drawText(png, "KAS", 540, 280, 2, [230, 242, 255, 255]);
  drawBadge(png, 540 + measureText("KAS", 2) + 12, 276, data.kasOk);
  drawText(png, "G16", 540, 330, 2, [230, 242, 255, 255]);
  drawBadge(png, 540 + measureText("G16", 2) + 12, 326, data.g16Ok);

  const hashLabel = `${data.capsuleHash.slice(0, 24)}…`;
  drawText(png, "CAPSULE", 540, 380, 2, [160, 180, 210, 200]);
  drawText(png, hashLabel, 540, 410, 2, [200, 220, 245, 220]);

  const phiCx = 980;
  const phiCy = 300;
  drawCircle(png, phiCx, phiCy, 100, [9, 15, 28, 255]);
  drawRing(png, phiCx, phiCy, 100, 3, primary);
  drawRing(png, phiCx, phiCy, 78, 2, secondary);
  drawLine(png, phiCx, phiCy - 60, phiCx, phiCy + 60, [220, 238, 255, 220]);
  drawCircle(png, phiCx, phiCy, 34, [12, 20, 36, 255]);
  drawRing(png, phiCx, phiCy, 34, 2, [220, 238, 255, 220]);

  drawText(png, "PROOF OF BREATH TM — VERIFIED", 110, 530, 2, [160, 178, 208, 220]);
  drawText(png, "phi.network", 870, 530, 2, [92, 108, 136, 200]);

  return (PNG as typeof PNG & PngSyncWriter).sync.write(png);
}
