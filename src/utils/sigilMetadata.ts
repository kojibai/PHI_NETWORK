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

function findJsonInText(text: string): EmbeddedMeta | null {
  const parsed = safeJsonParse(text);
  if (parsed) return toEmbeddedMetaFromUnknown(parsed);

  if (!text.includes("kaiSignature")) return null;
  const slice = text.slice(Math.max(0, text.indexOf("kaiSignature") - 800), Math.min(text.length, text.indexOf("kaiSignature") + 2000));
  const m = slice.match(/\{[\s\S]*\}/);
  if (!m || !m[0]) return null;
  const blobParsed = safeJsonParse(m[0]);
  return blobParsed ? toEmbeddedMetaFromUnknown(blobParsed) : null;
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
