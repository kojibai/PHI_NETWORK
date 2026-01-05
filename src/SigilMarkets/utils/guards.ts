// SigilMarkets/utils/guards.ts
/* eslint-disable @typescript-eslint/consistent-type-definitions */

/**
 * SigilMarkets — guards
 *
 * Runtime-safe helpers:
 * - object/array/string/number guards
 * - bigint micro parsing (decimal strings)
 * - safe JSON parsing
 *
 * These are intentionally small and dependency-free.
 */

import type { Bps, KaiPulse, PhiMicro, PriceMicro, ShareMicro } from "../types/marketTypes";
import { ONE_PHI_MICRO, ONE_SHARE_MICRO } from "../types/marketTypes";
import type { MicroDecimalString } from "../types/vaultTypes";
import { asMicroDecimalString } from "../types/vaultTypes";

export type UnknownRecord = Record<string, unknown>;

export const isRecord = (v: unknown): v is UnknownRecord => typeof v === "object" && v !== null;
export const isArray = (v: unknown): v is readonly unknown[] => Array.isArray(v);
export const isString = (v: unknown): v is string => typeof v === "string";
export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
export const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const clampInt = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.floor(n)));

export const asPulse = (v: unknown): KaiPulse | null => {
  if (!isFiniteNumber(v)) return null;
  if (v < 0) return 0;
  return Math.floor(v);
};

export const asBps = (v: unknown): Bps | null => {
  if (!isFiniteNumber(v)) return null;
  return clampInt(v, 0, 10_000);
};

export const safeJsonParse = (raw: string): Readonly<{ ok: true; value: unknown } | { ok: false; error: string }> => {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "JSON parse error";
    return { ok: false, error: msg };
  }
};

export const safeJsonStringify = (v: unknown): Readonly<{ ok: true; value: string } | { ok: false; error: string }> => {
  try {
    return { ok: true, value: JSON.stringify(v) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "JSON stringify error";
    return { ok: false, error: msg };
  }
};

/** Parse a non-negative bigint from a decimal string. */
export const parseBigIntDec = (v: unknown): bigint | null => {
  if (typeof v === "bigint") return v >= 0n ? v : null;
  if (!isString(v)) return null;
  const s = v.trim();
  if (s.length === 0) return null;
  if (!/^\d+$/.test(s)) return null;
  try {
    const bi = BigInt(s);
    return bi >= 0n ? bi : null;
  } catch {
    return null;
  }
};

export const toMicroDecimalString = (v: bigint): MicroDecimalString => asMicroDecimalString((v < 0n ? 0n : v).toString(10));

export const toPhiMicro = (v: bigint): PhiMicro => (v < 0n ? (0n as PhiMicro) : (v as PhiMicro));
export const toShareMicro = (v: bigint): ShareMicro => (v < 0n ? (0n as ShareMicro) : (v as ShareMicro));
export const toPriceMicro = (v: bigint): PriceMicro => {
  // price is bounded 0..ONE_PHI_MICRO for UI; clamp for safety
  const clamped = v < 0n ? 0n : v > ONE_PHI_MICRO ? ONE_PHI_MICRO : v;
  return clamped as PriceMicro;
};

/** Parse microΦ (decimal) safely into bigint micro units. */
export const parsePhiMicro = (v: unknown): PhiMicro | null => {
  const bi = parseBigIntDec(v);
  return bi === null ? null : toPhiMicro(bi);
};

/** Parse microShares (decimal) safely into bigint micro units. */
export const parseShareMicro = (v: unknown): ShareMicro | null => {
  const bi = parseBigIntDec(v);
  return bi === null ? null : toShareMicro(bi);
};

/** Parse micro price (decimal) safely; clamps to 0..ONE_PHI_MICRO. */
export const parsePriceMicro = (v: unknown): PriceMicro | null => {
  const bi = parseBigIntDec(v);
  return bi === null ? null : toPriceMicro(bi);
};

/** Sum microΦ with clamp at 0. */
export const addPhi = (a: PhiMicro, b: PhiMicro): PhiMicro => toPhiMicro((a as unknown as bigint) + (b as unknown as bigint));
export const subPhi = (a: PhiMicro, b: PhiMicro): PhiMicro => {
  const out = (a as unknown as bigint) - (b as unknown as bigint);
  return toPhiMicro(out);
};

/** Ensure ONE_SHARE_MICRO and ONE_PHI_MICRO are consistent constants. */
export const assertUnitInvariants = (): Readonly<{ ok: true } | { ok: false; error: string }> => {
  if (ONE_PHI_MICRO <= 0n) return { ok: false, error: "ONE_PHI_MICRO must be > 0" };
  if (ONE_SHARE_MICRO <= 0n) return { ok: false, error: "ONE_SHARE_MICRO must be > 0" };
  return { ok: true };
};
