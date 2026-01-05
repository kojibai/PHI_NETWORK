// SigilMarkets/utils/ids.ts
/* eslint-disable @typescript-eslint/consistent-type-definitions */

/**
 * SigilMarkets — ids
 *
 * Deterministic + random id helpers (no "any").
 * - Prefer crypto.subtle for sha256 when available.
 * - Provide safe fallbacks so the module still works offline/standalone.
 *
 * Conventions:
 * - IDs are opaque strings branded by types via as* helpers.
 * - We prefix ids to keep them visually recognizable in logs/UI.
 */

import type { KaiPulse, LockId, MarketId, VaultId } from "../types/marketTypes";
import { asLockId, asMarketId, asVaultId } from "../types/marketTypes";
import type { PositionId, PositionSigilId } from "../types/sigilPositionTypes";
import { asPositionId, asPositionSigilId } from "../types/sigilPositionTypes";
import type { SvgHash, UserPhiKey } from "../types/vaultTypes";

type UnknownRecord = Record<string, unknown>;

const getGlobal = (): UnknownRecord => globalThis as unknown as UnknownRecord;

const getCrypto = (): Crypto | null => {
  const g = getGlobal();
  const c = g["crypto"];
  return (typeof c === "object" && c !== null ? (c as Crypto) : null);
};

const bytesToHex = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
};

const randomBytes = (n: number): Uint8Array => {
  const len = Math.max(1, Math.min(64, Math.floor(n)));
  const out = new Uint8Array(len);

  const c = getCrypto();
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(out);
    return out;
  }

  // Fallback (not cryptographically strong, but keeps the app functional)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
};

const hasSubtle = (): boolean => {
  const c = getCrypto();
  return !!(c && c.subtle && typeof c.subtle.digest === "function");
};

const textEncode = (s: string): Uint8Array => {
  const g = getGlobal();
  const TE = g["TextEncoder"];
  if (typeof TE === "function") {
    const enc = new (TE as { new (): TextEncoder })();
    return enc.encode(s);
  }
  // Extremely old environments: naive utf-8-ish fallback
  const arr: number[] = [];
  for (let i = 0; i < s.length; i += 1) arr.push(s.charCodeAt(i) & 0xff);
  return new Uint8Array(arr);
};

/**
 * IMPORTANT (TS / BufferSource):
 * Some TS lib combos type Uint8Array as Uint8Array<ArrayBufferLike>, whose `.buffer` may be
 * SharedArrayBuffer. WebCrypto's BufferSource expects ArrayBuffer (not SAB) in lib.dom types.
 * We fix this by copying bytes into a fresh ArrayBuffer every time we digest.
 */
const toArrayBufferCopy = (bytes: Uint8Array): ArrayBuffer => {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
};

/**
 * FNV-1a 32-bit fallback expanded to 64 hex chars.
 * This is NOT cryptographic; it is only for offline/demo environments without subtle crypto.
 */
const fnvFallbackHex = (message: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < message.length; i += 1) {
    h ^= message.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  const hex8 = h.toString(16).padStart(8, "0");
  // expand deterministically to 64 hex chars
  return (hex8 + hex8 + hex8 + hex8 + hex8 + hex8 + hex8 + hex8).slice(0, 64);
};

/**
 * sha256Hex (async)
 * - Uses crypto.subtle when available.
 * - Falls back to a non-cryptographic hash (functional, not secure).
 */
export const sha256Hex = async (message: string): Promise<string> => {
  if (hasSubtle()) {
    const c = getCrypto();
    if (!c) return fnvFallbackHex(message);

    const bytes = textEncode(message);
    const ab = toArrayBufferCopy(bytes); // always ArrayBuffer => satisfies BufferSource typing
    const digest = await c.subtle.digest("SHA-256", ab);
    return bytesToHex(new Uint8Array(digest));
  }
  return fnvFallbackHex(message);
};

export const makeRandomId = (prefix: string, bytes: number = 16): string => {
  const p = prefix.trim().length > 0 ? prefix.trim() : "id";
  const hex = bytesToHex(randomBytes(bytes));
  return `${p}_${hex}`;
};

/** ---- Branded id generators (random) ---- */

export const newMarketId = (): MarketId => asMarketId(makeRandomId("mkt", 16));
export const newVaultId = (): VaultId => asVaultId(makeRandomId("vault", 16));
export const newLockId = (): LockId => asLockId(makeRandomId("lock", 16));
export const newPositionId = (): PositionId => asPositionId(makeRandomId("pos", 16));
export const newPositionSigilId = (): PositionSigilId => asPositionSigilId(makeRandomId("psigil", 16));

/** ---- Deterministic derivations (sha256) ---- */

/**
 * Derive a VaultId deterministically from:
 * - userPhiKey
 * - identity svgHash
 */
export const deriveVaultId = async (args: Readonly<{ userPhiKey: UserPhiKey; identitySvgHash: SvgHash }>): Promise<VaultId> => {
  const msg = `SM:VAULT:${args.userPhiKey}:${args.identitySvgHash}`;
  const h = await sha256Hex(msg);
  return asVaultId(`vault_${h.slice(0, 40)}`);
};

/**
 * Derive a LockId deterministically from:
 * - vaultId
 * - marketId
 * - openPulse
 * - nonce (caller can pass a random or incremental nonce)
 */
export const deriveLockId = async (args: Readonly<{ vaultId: VaultId; marketId: MarketId; openPulse: KaiPulse; nonce: string }>): Promise<LockId> => {
  const p = Number.isFinite(args.openPulse) ? Math.max(0, Math.floor(args.openPulse)) : 0;
  const msg = `SM:LOCK:${args.vaultId}:${args.marketId}:${p}:${args.nonce}`;
  const h = await sha256Hex(msg);
  return asLockId(`lock_${h.slice(0, 40)}`);
};

/**
 * Derive a PositionId deterministically from:
 * - vaultId
 * - marketId
 * - lockId
 */
export const derivePositionId = async (args: Readonly<{ vaultId: VaultId; marketId: MarketId; lockId: LockId }>): Promise<PositionId> => {
  const msg = `SM:POS:${args.vaultId}:${args.marketId}:${args.lockId}`;
  const h = await sha256Hex(msg);
  return asPositionId(`pos_${h.slice(0, 40)}`);
};

/**
 * Derive a PositionSigilId deterministically from:
 * - positionId
 * - svgHash of minted sigil (if known) OR a nonce for pre-mint ids
 */
export const derivePositionSigilId = async (args: Readonly<{ positionId: PositionId; ref: string }>): Promise<PositionSigilId> => {
  const msg = `SM:PSIGIL:${args.positionId}:${args.ref}`;
  const h = await sha256Hex(msg);
  return asPositionSigilId(`psigil_${h.slice(0, 40)}`);
};
