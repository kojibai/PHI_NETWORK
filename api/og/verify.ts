import { PNG } from "pngjs";
import QRCode from "qrcode";

import { parseSlug } from "../../src/utils/verifySigil";

type Rgba = [number, number, number, number];

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
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};
const FONT_WIDTH = 5;

function normalizeText(text: string): string {
  return text
    .replaceAll("Φ", "PHI")
    .replaceAll("™", "TM")
    .toUpperCase();
}

function fillRect(png: PNG, x: number, y: number, w: number, h: number, color: Rgba): void {
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

function drawText(png: PNG, textRaw: string, x: number, y: number, scale: number, color: Rgba): void {
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
  return text.length * (FONT_WIDTH + 1) * scale;
}

function drawGradient(png: PNG, top: Rgba, bottom: Rgba): void {
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

function parseBool(value: string | null): boolean | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (["1", "true", "yes", "ok"].includes(v)) return true;
  if (["0", "false", "no", "fail"].includes(v)) return false;
  return null;
}

function drawLine(png: PNG, x0: number, y0: number, x1: number, y1: number, color: Rgba): void {
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

function drawBadge(png: PNG, x: number, y: number, ok: boolean | null): void {
  const size = 18;
  const stroke: Rgba = [160, 200, 240, 200];
  const fill: Rgba = [12, 18, 28, 255];
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

function statusFromQuery(value: string | null): "verified" | "failed" | "standby" {
  const v = value?.toLowerCase().trim();
  if (v === "verified" || v === "ok" || v === "valid") return "verified";
  if (v === "failed" || v === "error" || v === "invalid") return "failed";
  return "standby";
}

async function makeQrMatrix(text: string): Promise<{ size: number; data: boolean[] }> {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  return { size: qr.modules.size, data: qr.modules.data as boolean[] };
}

export default async function handler(
  req: { url?: string },
  res: { setHeader: (key: string, value: string) => void; end: (body: Buffer) => void; statusCode: number }
): Promise<void> {
  const base = "https://verahai.com";
  const url = new URL(req.url ?? "/", base);
  const slugRaw = url.searchParams.get("slug") ?? "";
  const slug = parseSlug(slugRaw);

  const pulse = url.searchParams.get("pulse") ?? (slug.pulse ? String(slug.pulse) : "NA");
  const chakraDay = url.searchParams.get("chakraDay") ?? "";
  const phiKey = url.searchParams.get("phiKey") ?? slug.shortSig ?? "NA";
  const kasOk = parseBool(url.searchParams.get("kas"));
  const g16Ok = parseBool(url.searchParams.get("g16"));
  const status = statusFromQuery(url.searchParams.get("status"));

  const statusLabel = status === "verified" ? "VERIFIED" : status === "failed" ? "FAILED" : "STANDBY";
  const statusColor: Rgba = status === "verified" ? [56, 231, 166, 255] : status === "failed" ? [255, 107, 107, 255] : [181, 199, 221, 255];
  const textColor: Rgba = [230, 242, 255, 255];

  const png = new PNG({ width: 1200, height: 630 });
  drawGradient(png, [12, 18, 26, 255], [6, 10, 15, 255]);

  fillRect(png, 60, 60, 1080, 510, [18, 26, 38, 235]);
  fillRect(png, 60, 60, 1080, 4, [85, 120, 180, 180]);

  drawText(png, statusLabel, 110, 120, 6, statusColor);
  drawText(png, "PROOF OF BREATH TM", 110, 200, 3, [200, 215, 235, 220]);

  drawText(png, "PULSE", 110, 260, 2, [160, 190, 230, 200]);
  drawText(png, String(pulse), 110, 290, 3, textColor);

  if (chakraDay) {
    drawText(png, "CHAKRADAY", 320, 260, 2, [160, 190, 230, 200]);
    drawText(png, chakraDay, 320, 290, 3, textColor);
  }

  drawText(png, "PHIKEY", 560, 260, 2, [160, 190, 230, 200]);
  drawText(png, phiKey || "NA", 560, 290, 3, textColor);

  const kasLabel = "KAS";
  drawText(png, kasLabel, 110, 360, 2, textColor);
  drawBadge(png, 110 + measureText(kasLabel, 2) + 12, 356, kasOk);

  const g16Label = "G16";
  drawText(png, g16Label, 240, 360, 2, textColor);
  drawBadge(png, 240 + measureText(g16Label, 2) + 12, 356, g16Ok);

  const verifyUrl = `${url.origin}/verify/${encodeURIComponent(slug.raw || slugRaw)}`;
  const qr = await makeQrMatrix(verifyUrl);
  const moduleSize = Math.floor(220 / qr.size);
  const qrSize = qr.size * moduleSize;
  const qrX = 880;
  const qrY = 180;

  fillRect(png, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, [12, 18, 28, 255]);
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      const idx = y * qr.size + x;
      if (qr.data[idx]) {
        fillRect(png, qrX + x * moduleSize, qrY + y * moduleSize, moduleSize, moduleSize, [236, 248, 255, 255]);
      }
    }
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.end(PNG.sync.write(png));
}

export const config = {
  runtime: "nodejs",
};
