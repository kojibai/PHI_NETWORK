/* eslint-disable @typescript-eslint/consistent-type-definitions */

/**
 * SigilMarkets — vaultTypes (normative)
 *
 * Vault = value layer bound to an Identity Sigil (NOT the identity itself).
 * - A user "inhales" an Identity Sigil (SVG) to authenticate.
 * - We derive a VaultId deterministically from identity artifacts elsewhere.
 * - The vault holds spendable Φ and locks Φ into escrow for open positions.
 *
 * Storage:
 * - Runtime uses bigint microΦ (PhiMicro = bigint).
 * - JSON uses decimal strings (MicroDecimalString).
 *
 * IdentitySigilRef:
 * - Stores identity artifact refs + optional valuation snapshot for local UX.
 * - canonicalHash is the preferred stable key (canonicalized payload hash).
 * - svgHash is the artifact hash fallback.
 */

import { asMicroDecimalString } from "./marketTypes";
import type { Brand, KaiMoment, KaiPulse, LockId, MicroDecimalString, PhiMicro, VaultId } from "./marketTypes";

/**
 * Re-export MicroDecimalString utilities for convenience so other modules
 * can import from vaultTypes without reaching into marketTypes directly.
 */
export type { MicroDecimalString } from "./marketTypes";
export { asMicroDecimalString } from "./marketTypes";

/** Hash of an SVG payload (sha256 hex string, etc.). */
export type SvgHash = Brand<string, "SvgHash">;
export const asSvgHash = (v: string): SvgHash => v as SvgHash;

/** User public key / identifier used across Phi Network. */
export type UserPhiKey = Brand<string, "UserPhiKey">;
export const asUserPhiKey = (v: string): UserPhiKey => v as UserPhiKey;

/** Deterministic Kai signature (hex string). */
export type KaiSignature = Brand<string, "KaiSignature">;
export const asKaiSignature = (v: string): KaiSignature => v as KaiSignature;

/** Optional ZK proof reference (opaque id or hash). */
export type ZkProofRef = Brand<string, "ZkProofRef">;
export const asZkProofRef = (v: string): ZkProofRef => v as ZkProofRef;

/** A stable identifier for a specific identity sigil artifact. */
export type IdentitySigilId = Brand<string, "IdentitySigilId">;
export const asIdentitySigilId = (v: string): IdentitySigilId => v as IdentitySigilId;

/**
 * Preferred stable hash for identity payload canonicalization.
 * This is the primary key for registries/movement keys.
 */
export type CanonicalHash = Brand<string, "CanonicalHash">;
export const asCanonicalHash = (v: string): CanonicalHash => v as CanonicalHash;

/** Normalize canonical hash (lowercase) while preserving the brand. */
export const normCanonicalHash = (v: string): CanonicalHash => asCanonicalHash(v.trim().toLowerCase());

/** Optional valuation provenance tag (for future-proofing). */
export type ValuationSource =
  | "intrinsic"
  | "proofbundle"
  | "verifier"
  | "manual"
  | (string & { readonly __valuationSource?: "custom" });

export type VaultStatus = "active" | "frozen";
export const isVaultStatus = (v: unknown): v is VaultStatus => v === "active" || v === "frozen";

/**
 * Lock status:
 * - locked: escrowed for an open position
 * - released: released back to spendable (e.g. cancel/failed trade)
 * - burned: removed from vault (loss or fee burn)
 * - paid: transferred out to settlement pool / winners
 * - refunded: returned due to VOID/CANCEL resolution
 */
export type VaultLockStatus = "locked" | "released" | "burned" | "paid" | "refunded";
export const isVaultLockStatus = (v: unknown): v is VaultLockStatus =>
  v === "locked" || v === "released" || v === "burned" || v === "paid" || v === "refunded";

/** Lock reason for UI explanation. */
export type VaultLockReason =
  | "position-open"
  | "position-claim"
  | "position-loss"
  | "position-refund"
  | "trade-failed"
  | "admin"
  | (string & { readonly __vaultLockReason?: "custom" });

/** A lock inside a vault. */
export type VaultLock = Readonly<{
  lockId: LockId;
  status: VaultLockStatus;

  /** Why this lock exists / transitioned. */
  reason: VaultLockReason;

  /** Amount locked (microΦ). */
  amountMicro: PhiMicro;

  /** Pulses for provenance. */
  createdAt: KaiMoment;
  updatedPulse: KaiPulse;

  /** Optional linkages. */
  marketId?: string;
  positionId?: string;

  /** Optional note for UI. */
  note?: string;
}>;

/**
 * Identity sigil info stored on vault owner for UI + rehydration.
 *
 * Important invariants (when valuation fields exist):
 * - If valuePhiMicro is set, it is the max value the glyph was valued at (microΦ).
 * - availablePhiMicro is the remaining spendable glyph value (microΦ) after deposits.
 * - If both exist: 0 <= availablePhiMicro <= valuePhiMicro.
 * - lastValuedPulse is the pulse when valuePhiMicro/availablePhiMicro were computed.
 */
export type IdentitySigilRef = Readonly<{
  sigilId?: IdentitySigilId;
  svgHash: SvgHash;
  url?: string;

  /**
   * Preferred stable identifier (canonicalized payload hash, lowercase hex).
   * If present, use this instead of svgHash for registries/movement keys.
   */
  canonicalHash?: CanonicalHash;

  /** Optional valuation snapshot (microΦ). */
  valuePhiMicro?: PhiMicro;

  /** Optional remaining spendable value on the glyph (microΦ). */
  availablePhiMicro?: PhiMicro;

  /** Pulse when the valuation was last computed/updated. */
  lastValuedPulse?: KaiPulse;

  /** Optional provenance label for the valuation (future-proof). */
  valuationSource?: ValuationSource;
}>;

/**
 * Deterministic internal vault record.
 * - spendable: can be used for new wagers
 * - locked: sum of locks in status=locked (escrowed)
 * - total: spendable + locked (for UI)
 */
export type VaultRecord = Readonly<{
  vaultId: VaultId;

  /** Identity binding (who controls this vault). */
  owner: Readonly<{
    userPhiKey: UserPhiKey;
    kaiSignature: KaiSignature;

    /** Optional stronger uniqueness proof reference. */
    zkProofRef?: ZkProofRef;

    /** Identity sigil info (for UI & rehydration). */
    identitySigil?: IdentitySigilRef;
  }>;

  status: VaultStatus;

  /** Balances (microΦ). */
  spendableMicro: PhiMicro;
  lockedMicro: PhiMicro;

  /** Lock set (escrow). */
  locks: readonly VaultLock[];

  /** Optional streak / prestige stats (computed, but stored for fast UI). */
  stats?: Readonly<{
    winStreak: number;
    lossStreak: number;
    totalWins: number;
    totalLosses: number;
    totalClaims: number;
    totalRefunds: number;
    /** Last outcome pulse for animation timing. */
    lastOutcomePulse?: KaiPulse;
  }>;

  /** Pulses for ordering. */
  createdPulse: KaiPulse;
  updatedPulse: KaiPulse;
}>;

/** JSON-serializable identity sigil ref (microΦ bigint -> decimal strings). */
export type SerializedIdentitySigilRef = Readonly<{
  sigilId?: IdentitySigilId;
  svgHash: SvgHash;
  url?: string;
  canonicalHash?: CanonicalHash;

  valuePhiMicro?: MicroDecimalString;
  availablePhiMicro?: MicroDecimalString;
  lastValuedPulse?: KaiPulse;
  valuationSource?: ValuationSource;
}>;

/**
 * JSON-serializable form of VaultRecord (microΦ bigint -> decimal strings).
 */
export type SerializedVaultRecord = Readonly<{
  vaultId: VaultId;

  owner: Readonly<{
    userPhiKey: UserPhiKey;
    kaiSignature: KaiSignature;
    zkProofRef?: ZkProofRef;

    identitySigil?: SerializedIdentitySigilRef;
  }>;

  status: VaultStatus;

  spendableMicro: MicroDecimalString;
  lockedMicro: MicroDecimalString;

  locks: readonly Readonly<{
    lockId: LockId;
    status: VaultLockStatus;
    reason: VaultLockReason;
    amountMicro: MicroDecimalString;
    createdAt: KaiMoment;
    updatedPulse: KaiPulse;
    marketId?: string;
    positionId?: string;
    note?: string;
  }>[];

  stats?: Readonly<{
    winStreak: number;
    lossStreak: number;
    totalWins: number;
    totalLosses: number;
    totalClaims: number;
    totalRefunds: number;
    lastOutcomePulse?: KaiPulse;
  }>;

  createdPulse: KaiPulse;
  updatedPulse: KaiPulse;
}>;

/** Deposit/withdraw intent for UI + execution layer. */
export type VaultValueMoveKind = "deposit" | "withdraw";

export type VaultValueMoveRequest = Readonly<{
  vaultId: VaultId;
  kind: VaultValueMoveKind;

  /** Amount to move (microΦ). */
  amountMicro: PhiMicro;

  /** Kai pulse when user initiated. */
  initiatedPulse: KaiPulse;

  /** Optional external references (payment, QR transfer, etc.). */
  meta?: Readonly<Record<string, string>>;
}>;

export type VaultValueMoveResult = Readonly<{
  vaultId: VaultId;
  kind: VaultValueMoveKind;

  /** Pulse when applied. */
  appliedPulse: KaiPulse;

  /** New balances. */
  spendableMicro: PhiMicro;
  lockedMicro: PhiMicro;
}>;

/**
 * Vault Sigil payload embedded in a rendered Vault Sigil (optional UI artifact).
 * This is NOT required for functionality, but enables share/print proof of value state.
 * All micros as decimal strings for JSON.
 */
export type VaultSigilPayloadV1 = Readonly<{
  v: "SM-VAULT-1";
  kind: "vault";

  vaultId: VaultId;

  userPhiKey: UserPhiKey;
  kaiSignature: KaiSignature;

  /** Balances snapshot at time of mint. */
  spendableMicro: MicroDecimalString;
  lockedMicro: MicroDecimalString;

  /** Optional prestige stats snapshot. */
  stats?: Readonly<{
    winStreak: number;
    totalWins: number;
    totalLosses: number;
  }>;

  /** Kai moment the snapshot was minted. */
  mintedAt: KaiMoment;

  /**
   * Identity sigil hash used to bind this vault.
   * Prefer canonicalHash when available; otherwise fall back to svgHash.
   */
  identitySvgHash: SvgHash;

  /** Optional UI labels. */
  label?: string;
}>;

/** Reference to a minted Vault Sigil artifact. */
export type VaultSigilArtifact = Readonly<{
  svgHash: SvgHash;
  url?: string;
  payload: VaultSigilPayloadV1;
}>;

/** Helper interfaces for type-safe vault querying. */
export type VaultSnapshot = Readonly<{
  vaultId: VaultId;
  status: VaultStatus;
  spendableMicro: PhiMicro;
  lockedMicro: PhiMicro;
  updatedPulse: KaiPulse;
}>;

/** Guard utilities (minimal). */
export const isUserPhiKey = (v: unknown): v is UserPhiKey => typeof v === "string" && v.length > 0;
export const isKaiSignature = (v: unknown): v is KaiSignature => typeof v === "string" && v.length > 0;
export const isSvgHash = (v: unknown): v is SvgHash => typeof v === "string" && v.length > 0;
export const isCanonicalHash = (v: unknown): v is CanonicalHash =>
  typeof v === "string" && v.length > 0 && /^[0-9a-f]+$/i.test(v);

/**
 * Bigint → canonical MicroDecimalString helper (non-negative).
 * (Exported because stores/serializers frequently need it.)
 */
export const biDec = (v: bigint): MicroDecimalString => asMicroDecimalString(v < 0n ? "0" : v.toString(10));
