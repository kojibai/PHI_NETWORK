import { XMLParser } from "fast-xml-parser";

export type EmbeddedMeta = {
  pulse?: number;
  beat?: number;
  stepIndex?: number;
  frequencyHz?: number;
  chakraDay?: string;
  chakraGate?: string;
  kaiSignature?: string;
  phiKey?: string;
  timestamp?: string;
  verifierUrl?: string;
  raw?: unknown;
};

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  allowBooleanAttributes: true,
  trimValues: true,
  cdataPropName: "__cdata",
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeJsonParse(s: string): unknown | null {
  const t = s.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function toEmbeddedMetaFromUnknown(raw: unknown): EmbeddedMeta {
  if (!isRecord(raw)) return { raw };

  const kaiSignature =
    typeof raw.kaiSignature === "string" ? raw.kaiSignature : undefined;

  const pulse =
    typeof raw.pulse === "number" && Number.isFinite(raw.pulse) ? raw.pulse : undefined;

  const beat =
    typeof raw.beat === "number" && Number.isFinite(raw.beat) ? raw.beat : undefined;

  const stepIndex =
    typeof raw.stepIndex === "number" && Number.isFinite(raw.stepIndex) ? raw.stepIndex : undefined;

  const frequencyHz =
    typeof raw.frequencyHz === "number" && Number.isFinite(raw.frequencyHz)
      ? raw.frequencyHz
      : undefined;

  const chakraDay =
    typeof raw.chakraDay === "string" ? raw.chakraDay : undefined;

  const chakraGate =
    typeof raw.chakraGate === "string" ? raw.chakraGate : undefined;

  const timestamp =
    typeof raw.timestamp === "string" ? raw.timestamp : undefined;

  const phiKeyRaw = typeof raw.phiKey === "string" ? raw.phiKey : undefined;
  const userPhiKey = typeof raw.userPhiKey === "string" ? raw.userPhiKey : undefined;

  const phiKey =
    phiKeyRaw && !phiKeyRaw.startsWith("φK-") ? phiKeyRaw : userPhiKey;

  const verifierUrl =
    typeof raw.verifierUrl === "string" ? raw.verifierUrl : undefined;

  return {
    pulse,
    beat,
    stepIndex,
    frequencyHz,
    chakraDay,
    chakraGate,
    kaiSignature,
    phiKey,
    timestamp,
    verifierUrl,
    raw,
  };
}

function collectText(node: unknown, texts: string[]): void {
  if (typeof node === "string") {
    texts.push(node);
    return;
  }
  if (!isRecord(node)) return;

  if (typeof node.__cdata === "string") {
    texts.push(node.__cdata);
  }

  for (const value of Object.values(node)) {
    collectText(value, texts);
  }
}

function extractNearbyJsonBlocks(text: string, matchIndex: number, window = 2000): string[] {
  const start = Math.max(0, matchIndex - window);
  const end = Math.min(text.length, matchIndex + window);
  const slice = text.slice(start, end);
  const targetIndex = matchIndex - start;

  const blocks: Array<{ start: number; end: number }> = [];
  const stack: number[] = [];
  let inString = false;
  let escaping = false;

  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (ch === "\\") {
        escaping = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      stack.push(i);
      continue;
    }

    if (ch === "}") {
      const blockStart = stack.pop();
      if (blockStart == null) continue;
      if (blockStart <= targetIndex && i >= targetIndex) {
        blocks.push({ start: blockStart, end: i });
      }
    }
  }

  blocks.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  return blocks.map(({ start: s, end: e }) => slice.slice(s, e + 1));
}

function findJsonInText(text: string): EmbeddedMeta | null {
  const parsed = safeJsonParse(text);
  if (parsed) {
    const parsedMeta = toEmbeddedMetaFromUnknown(parsed);
    if (parsedMeta.kaiSignature) return parsedMeta;
  }

  const matches = [...text.matchAll(/"kaiSignature"\s*:/g)];
  if (!matches.length) return null;

  for (const match of matches) {
    const idx = match.index ?? 0;
    const blocks = extractNearbyJsonBlocks(text, idx);
    for (const block of blocks) {
      if (!block.includes('"kaiSignature"')) continue;
      const blobParsed = safeJsonParse(block);
      if (!blobParsed) continue;
      const meta = toEmbeddedMetaFromUnknown(blobParsed);
      if (meta.kaiSignature) return meta;
    }
  }

  return null;
}

function extractFromParsedSvg(parsed: Record<string, unknown>): EmbeddedMeta | null {
  const svg = isRecord(parsed.svg) ? parsed.svg : parsed;
  const candidates: string[] = [];

  if (isRecord(svg.metadata)) {
    collectText(svg.metadata, candidates);
  } else if (typeof svg.metadata === "string") {
    candidates.push(svg.metadata);
  }

  if (isRecord(svg.desc)) {
    collectText(svg.desc, candidates);
  } else if (typeof svg.desc === "string") {
    candidates.push(svg.desc);
  }

  for (const text of candidates) {
    const meta = findJsonInText(text);
    if (meta) return meta;
  }

  return null;
}

function getAttr(svg: string, key: string): string | undefined {
  const pattern = `${key}\\s*=\\s*(\"([^\"]*)\"|'([^']*)')`;
  const match = svg.match(new RegExp(pattern, "i"));
  if (!match) return undefined;
  return match[2] ?? match[3];
}

function getNumberAttr(svg: string, key: string): number | undefined {
  const raw = getAttr(svg, key);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractAttrFallback(svgText: string): EmbeddedMeta {
  const pulse = getNumberAttr(svgText, "data-pulse");
  const beat = getNumberAttr(svgText, "data-beat");
  const stepIndex = getNumberAttr(svgText, "data-step-index");
  const frequencyHz = getNumberAttr(svgText, "data-frequency-hz");
  const chakraGate = getAttr(svgText, "data-chakra-gate");
  const chakraDay = getAttr(svgText, "data-harmonic-day") ?? getAttr(svgText, "data-chakra-day");
  const kaiSignature = getAttr(svgText, "data-kai-signature");
  const phiKey = getAttr(svgText, "data-phi-key");

  return {
    pulse,
    beat,
    stepIndex,
    frequencyHz,
    chakraDay,
    chakraGate,
    kaiSignature,
    phiKey,
  };
}

function mergeEmbeddedMeta(primary: EmbeddedMeta, fallback: EmbeddedMeta): EmbeddedMeta {
  const merged: EmbeddedMeta = { ...primary };
  for (const [key, value] of Object.entries(fallback)) {
    if (value === undefined) continue;
    const current = (merged as Record<string, unknown>)[key];
    if (current === undefined || current === null) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export function extractEmbeddedMetaFromSvg(svgText: string): EmbeddedMeta {
  const attrFallback = extractAttrFallback(svgText);
  try {
    const parsed = XML_PARSER.parse(svgText);
    if (isRecord(parsed)) {
      const meta = extractFromParsedSvg(parsed);
      if (meta) return mergeEmbeddedMeta(meta, attrFallback);
    }
  } catch (err) {
    console.warn("sigilMetadata: failed to parse SVG", err);
  }

  const fallback = findJsonInText(svgText);
  if (fallback) return mergeEmbeddedMeta(fallback, attrFallback);
  return attrFallback;
}
