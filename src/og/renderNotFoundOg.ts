import { PNG } from "pngjs";

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

export function renderNotFoundOgPng(capsuleHash: string): Buffer {
  const label = capsuleHash.trim() ? capsuleHash : "unknown";

  const png = new PNG({ width: OG_WIDTH, height: OG_HEIGHT }) as PngInstance;
  if (!png.data) {
    throw new Error("PNG buffer not initialized");
  }

  drawGradient(png, [18, 7, 11, 255], [7, 6, 10, 255]);
  fillRect(png, 70, 70, 1060, 490, [18, 12, 18, 255]);
  fillRect(png, 70, 70, 1060, 4, [255, 107, 107, 200]);

  drawText(png, "NOT FOUND", 120, 170, 6, [255, 107, 107, 255]);
  drawText(png, "PROOF CAPSULE COULD NOT BE RESOLVED.", 120, 240, 2, [195, 169, 176, 220]);
  drawText(png, "REQUESTED CAPSULE HASH", 120, 300, 2, [155, 135, 144, 220]);
  drawText(png, label.slice(0, 40), 120, 330, 2, [240, 221, 230, 255]);

  drawText(png, "PROOF OF BREATH TM — CAPSULE LOOKUP FAILED", 120, 520, 2, [143, 123, 132, 200]);

  return (PNG as typeof PNG & PngSyncWriter).sync.write(png);
}
