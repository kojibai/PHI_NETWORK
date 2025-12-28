/* ────────────────────────────────────────────────────────────────
   kai.ts · Atlantean Lumitech “Harmonic Core”
   v25.3 — Pure-JS Poseidon, ESLint-clean, runtime-robust
──────────────────────────────────────────────────────────────────
   ✦ Breath-synchronous Kai-Pulse maths (Genesis: 10 May 2024 06:45:41.888 UTC)
   ✦ Poseidon ⊕ BLAKE3 → deterministic kai_signature
   ✦ Zero Node shims · Zero `any` · Works in every evergreen browser
────────────────────────────────────────────────────────────────── */

////////////////////////////////////////////////////////////////////////////////
// ░░  DEPENDENCIES  ░░  (Poseidon is loaded lazily to shrink bundle size)
////////////////////////////////////////////////////////////////////////////////

import { blake3Hex, hexToBytes } from "../lib/hash";

////////////////////////////////////////////////////////////////////////////////
// ░░  CONSTANTS  ░░
////////////////////////////////////////////////////////////////////////////////
/** Genesis Breath — the harmonic epoch. */
export const GENESIS_TS = Date.UTC(2024, 4, 10, 6, 45, 41, 888);

/** One Kai-Pulse = 5 .236 s (φ² ÷ 10). */
export const PULSE_MS = (3 + Math.sqrt(5)) * 1000;

/** System Intention — silent mantra baked into every signature. */
export const SYSTEM_INTENTION = "Enter my portal";

////////////////////////////////////////////////////////////////////////////////
// ░░  PULSE LOGIC  ░░
////////////////////////////////////////////////////////////////////////////////

/** Returns the current Kai-Pulse number since Genesis. */
export const getCurrentKaiPulse = (now: number = Date.now()): number =>
  Math.floor((now - GENESIS_TS) / PULSE_MS);

////////////////////////////////////////////////////////////////////////////////
// ░░  INTERNAL HELPERS  ░░
////////////////////////////////////////////////////////////////////////////////

/* — Poseidon loader — */
type PoseidonFn = (inputs: bigint[]) => bigint;
let poseidonFn: PoseidonFn | null = null;

/** Runtime type-guard. */
const isPoseidon = (f: unknown): f is PoseidonFn =>
  typeof f === "function";

/** Resolve *whatever* export shape snarkjs exposes, exactly once. */
const getPoseidon = async (): Promise<PoseidonFn> => {
  if (poseidonFn) return poseidonFn;

  const mod: unknown = await import("snarkjs");

  // Shape 1: named export  poseidon(...)
  if (isPoseidon((mod as { poseidon?: unknown }).poseidon)) {
    poseidonFn = (mod as { poseidon: PoseidonFn }).poseidon;
    return poseidonFn;
  }

  // Shape 2: default export  function poseidon(...)
  if (isPoseidon((mod as { default?: unknown }).default)) {
    poseidonFn = (mod as { default: PoseidonFn }).default;
    return poseidonFn;
  }

  // Shape 3: default export  { poseidon }
  const defObj = (mod as { default?: unknown }).default;
  if (
    typeof defObj === "object" &&
    defObj !== null &&
    isPoseidon((defObj as { poseidon?: unknown }).poseidon)
  ) {
    poseidonFn = (defObj as { poseidon: PoseidonFn }).poseidon;
    return poseidonFn;
  }

  // Shape 4: module itself is callable
  if (isPoseidon(mod)) {
    poseidonFn = mod;
    return poseidonFn;
  }

  throw new Error("snarkjs: no callable Poseidon export found");
};

/* — UTF-8 → bigint (field element) — */
const stringToBigInt = (s: string): bigint => {
  const hex = Array.from(new TextEncoder().encode(s), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return BigInt(`0x${hex || "0"}`);
};

/* — Poseidon⟨pulse,intention⟩ → 64-char hex — */
const poseidonHashHex = async (
  pulse: number,
  intention: string,
): Promise<string> => {
  const poseidon = await getPoseidon();
  const out = poseidon([BigInt(pulse), stringToBigInt(intention)]);
  return out.toString(16).padStart(64, "0");
};

/* — BLAKE3( hex ) → 64-char hex (lower-case) — */
const blake3HashHex = async (hexInput: string): Promise<string> => {
  const bytes = hexToBytes(hexInput);
  return blake3Hex(bytes);
};

////////////////////////////////////////////////////////////////////////////////
// ░░  PUBLIC API  ░░
////////////////////////////////////////////////////////////////////////////////

/**
 * Computes the immutable **kai_signature** for a given pulse.
 *
 * @param pulse      Kai-Pulse number (`getCurrentKaiPulse()`).
 * @param intention  Optional override (defaults to SYSTEM_INTENTION).
 * @returns          64-char lower-case hex signature.
 */
export const computeKaiSignature = async (
  pulse: number,
  intention: string = SYSTEM_INTENTION,
): Promise<string> => {
  const poseidonHex = await poseidonHashHex(pulse, intention);
  return blake3HashHex(poseidonHex);
};

/**
 * Computes a deterministic Poseidon hash (decimal string) from a 64-char hex.
 * Used for per-payload ZK stamps without circular dependency on the payload.
 */
export const computeZkPoseidonHash = async (hashHex: string): Promise<string> => {
  const poseidon = await getPoseidon();
  const clean = hashHex.startsWith("0x") ? hashHex.slice(2) : hashHex;
  const hi = clean.slice(0, 32).padStart(32, "0");
  const lo = clean.slice(32).padEnd(32, "0");
  const out = poseidon([BigInt(`0x${hi}`), BigInt(`0x${lo}`)]);
  return out.toString();
};
