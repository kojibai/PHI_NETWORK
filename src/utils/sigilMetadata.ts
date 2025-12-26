import { XMLParser } from "fast-xml-parser";

export type EmbeddedMeta = {
  pulse?: number;
  chakraDay?: string;
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

  const chakraDay =
    typeof raw.chakraDay === "string" ? raw.chakraDay : undefined;

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
    chakraDay,
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

export function extractEmbeddedMetaFromSvg(svgText: string): EmbeddedMeta {
  try {
    const parsed = XML_PARSER.parse(svgText);
    if (isRecord(parsed)) {
      const meta = extractFromParsedSvg(parsed);
      if (meta) return meta;
    }
  } catch (err) {
    console.warn("sigilMetadata: failed to parse SVG", err);
  }

  const fallback = findJsonInText(svgText);
  return fallback ?? {};
}
