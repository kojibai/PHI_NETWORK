// src/utils/glyphValue.ts
// Resolve glyph valuation from embedded metadata/proof bundles.

export type GlyphPhiResolution = Readonly<{
  valuePhi?: number;
  source?: string;
}>;

type UnknownRecord = Record<string, unknown>;
const isRecord = (v: unknown): v is UnknownRecord => typeof v === "object" && v !== null;

const toNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const toBigInt = (v: unknown): bigint | null => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^[0-9]+$/.test(v.trim())) {
    try {
      return BigInt(v.trim());
    } catch {
      return null;
    }
  }
  return null;
};

const microToPhi = (v: unknown): number | null => {
  const bi = toBigInt(v);
  if (bi === null) return null;
  return Number(bi) / 1_000_000;
};

const readValuePhiFromRecord = (rec: UnknownRecord): number | null => {
  const direct = toNumber(rec.valuePhi);
  if (direct != null) return direct;

  const viaSeal = isRecord(rec.seal) ? toNumber(rec.seal.valuePhi) : null;
  if (viaSeal != null) return viaSeal;

  const viaValuation = isRecord(rec.valuation) ? toNumber(rec.valuation.valuePhi) : null;
  if (viaValuation != null) return viaValuation;

  const viaValue = isRecord(rec.value) ? toNumber(rec.value.phi ?? rec.value.valuePhi) : null;
  if (viaValue != null) return viaValue;

  const fromMicro = microToPhi(rec.valuePhiMicro ?? rec.availablePhiMicro);
  if (fromMicro != null) return fromMicro;

  return null;
};

const parseSource = (source: unknown): unknown => {
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return source;
      }
    }
  }
  return source;
};

export const resolveGlyphPhi = (sources: readonly unknown[], fallbackValuePhi?: number): GlyphPhiResolution => {
  for (let i = 0; i < sources.length; i += 1) {
    const parsed = parseSource(sources[i]);
    if (isRecord(parsed)) {
      const found = readValuePhiFromRecord(parsed);
      if (found != null) {
        return { valuePhi: found, source: `embedded:${i}` };
      }
    }
  }

  if (typeof fallbackValuePhi === "number" && Number.isFinite(fallbackValuePhi)) {
    return { valuePhi: fallbackValuePhi, source: "intrinsic" };
  }

  return {};
};
