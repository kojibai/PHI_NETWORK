// SigilMarkets/types/oracleTypes.ts
/* eslint-disable @typescript-eslint/consistent-type-definitions */

/**
 * SigilMarkets — oracleTypes (normative)
 *
 * Oracles in SigilMarkets are intentionally flexible, but the experience must feel:
 * - obvious (users understand what "decides"),
 * - verifiable (resolution is auditable),
 * - portable (resolution can be exported as a Resolution Sigil artifact).
 *
 * This file defines:
 * - Evidence bundles (URLs + hashes)
 * - Resolution proposals + finalizations
 * - Dispute windows / votes (provider-agnostic)
 * - Resolution Sigil payload (JSON-in-SVG) for portable proof
 */

import type {
  Brand,
  EvidenceHash,
  KaiMoment,
  KaiPulse,
  MarketId,
  MarketOutcome,
  MarketOraclePolicy,
  OracleId,
} from "./marketTypes";

import type { KaiSignature, SvgHash, UserPhiKey } from "./vaultTypes";

/** Opaque URL string (validated by runtime where needed). */
export type EvidenceUrl = Brand<string, "EvidenceUrl">;
export const asEvidenceUrl = (v: string): EvidenceUrl => v as EvidenceUrl;

/** A short label shown in UI for evidence. */
export type EvidenceLabel = Brand<string, "EvidenceLabel">;
export const asEvidenceLabel = (v: string): EvidenceLabel => v as EvidenceLabel;

/** A deterministic, canonical hash of the evidence bundle JSON (sha256 hex). */
export type EvidenceBundleHash = Brand<string, "EvidenceBundleHash">;
export const asEvidenceBundleHash = (v: string): EvidenceBundleHash => v as EvidenceBundleHash;

/** Oracle decision id (proposal/finalization tracking). */
export type OracleDecisionId = Brand<string, "OracleDecisionId">;
export const asOracleDecisionId = (v: string): OracleDecisionId => v as OracleDecisionId;

/** Dispute id (if a proposal is disputed). */
export type DisputeId = Brand<string, "DisputeId">;
export const asDisputeId = (v: string): DisputeId => v as DisputeId;

/** Optional signature blob (provider-specific). */
export type OracleSig = Brand<string, "OracleSig">;
export const asOracleSig = (v: string): OracleSig => v as OracleSig;

/**
 * Evidence item types.
 * Keep it simple: URL, hash, and optional label/note.
 */
export type EvidenceItem =
  | Readonly<{
      kind: "url";
      url: EvidenceUrl;
      label?: EvidenceLabel;
      note?: string;
    }>
  | Readonly<{
      kind: "hash";
      hash: EvidenceHash;
      label?: EvidenceLabel;
      note?: string;
    }>;

export type EvidenceBundle = Readonly<{
  items: readonly EvidenceItem[];
  /** Optional human-readable summary displayed in the resolution panel. */
  summary?: string;
  /** Optional canonical bundle hash (computed elsewhere). */
  bundleHash?: EvidenceBundleHash;
}>;

/**
 * Provider-agnostic proposal.
 * A "proposal" can later become "final" after the dispute window closes.
 */
export type OracleResolutionProposal = Readonly<{
  decisionId: OracleDecisionId;
  marketId: MarketId;

  outcome: MarketOutcome;

  /** Pulse the proposal was posted. */
  proposedPulse: KaiPulse;

  /** Oracle policy used. */
  oracle: MarketOraclePolicy;

  /** Optional evidence bundle. */
  evidence?: EvidenceBundle;

  /**
   * Signatures / attestations.
   * For provider="sigil-oracle", this may be a single resolver seal.
   * For provider="committee", include multiple signatures.
   */
  attestations?: readonly OracleAttestation[];
}>;

/**
 * Provider-agnostic finalization.
 * Either:
 * - a proposal becomes final after dispute window
 * - or finalization happens immediately (disputeWindowPulses absent/0)
 */
export type OracleResolutionFinal = Readonly<{
  decisionId: OracleDecisionId;
  marketId: MarketId;

  outcome: MarketOutcome;

  /** When final outcome became final. */
  finalPulse: KaiPulse;

  /** Oracle policy used. */
  oracle: MarketOraclePolicy;

  /** Link back to proposal pulse (if any). */
  proposedPulse?: KaiPulse;

  /** Optional evidence. */
  evidence?: EvidenceBundle;

  /** Optional dispute metadata. */
  dispute?: OracleDisputeRecord;

  /** Final attestations (e.g., quorum signature). */
  finalAttestations?: readonly OracleAttestation[];
}>;

/** An attestation made by a resolver entity. */
export type OracleAttestation = Readonly<{
  /** Who attested. */
  signer: OracleSigner;
  /** Signature blob over canonical resolution payload. */
  sig: OracleSig;
  /** Pulse at which the attestation was created. */
  atPulse: KaiPulse;
  /** Optional weight (committee/quorum). */
  weight?: number;
}>;

/** Who can sign oracle decisions. */
export type OracleSigner =
  | Readonly<{
      kind: "user";
      userPhiKey: UserPhiKey;
    }>
  | Readonly<{
      kind: "oracle";
      oracleId: OracleId;
      label?: string;
    }>
  | Readonly<{
      kind: "committee";
      committeeId: OracleId;
      label?: string;
    }>
  | Readonly<{
      kind: "system";
      label: string;
    }>;

/**
 * Dispute window record.
 * If provider supports disputes, users (or committee members) can dispute a proposal.
 */
export type OracleDisputeRecord = Readonly<{
  disputeId: DisputeId;
  marketId: MarketId;
  decisionId: OracleDecisionId;

  /** Pulse when dispute opened. */
  openedPulse: KaiPulse;

  /** Pulse when dispute closed/finalized. */
  closedPulse?: KaiPulse;

  /** Votes/claims inside the dispute. */
  votes?: readonly OracleDisputeVote[];

  /** Final dispute result (provider-specific summary). */
  result?: Readonly<{
    /** The outcome accepted after dispute. */
    acceptedOutcome: MarketOutcome;
    /** Optional notes. */
    note?: string;
  }>;
}>;

/** A vote/claim during dispute. */
export type OracleDisputeVote = Readonly<{
  voter: OracleSigner;
  vote: MarketOutcome;
  atPulse: KaiPulse;
  sig?: OracleSig;
  weight?: number;
}>;

/**
 * Resolution Sigil payload:
 * Portable proof that a market resolved to a specific outcome under a specific policy.
 * This is what users can export/print/share.
 */
export type ResolutionSigilPayloadV1 = Readonly<{
  v: "SM-RES-1";
  kind: "resolution";

  marketId: MarketId;
  outcome: MarketOutcome;

  /** Oracle policy that governed the resolution. */
  oracle: MarketOraclePolicy;

  /** Proposal/final pulses. */
  proposedPulse?: KaiPulse;
  finalPulse: KaiPulse;

  /** Optional evidence. */
  evidence?: Readonly<{
    bundleHash?: EvidenceBundleHash;
    urls?: readonly string[];
    hashes?: readonly string[];
    summary?: string;
  }>;

  /**
   * Attestation summary for portability.
   * Full signatures may be included if small, or referenced by hash.
   */
  attestations?: readonly Readonly<{
    signer: Readonly<{ kind: OracleSigner["kind"]; id: string; label?: string }>;
    sig: string;
    atPulse: KaiPulse;
    weight?: number;
  }>[];

  /**
   * Optional: binder identity (who minted the resolution sigil artifact).
   * This does NOT imply authority; it only identifies the minter.
   */
  mintedBy?: Readonly<{
    userPhiKey: UserPhiKey;
    kaiSignature: KaiSignature;
  }>;

  /** Kai moment minted (for UI). */
  mintedAt: KaiMoment;

  /** Optional label. */
  label?: string;
}>;

/** Reference to a minted Resolution Sigil artifact. */
export type ResolutionSigilArtifact = Readonly<{
  svgHash: SvgHash;
  url?: string;
  payload: ResolutionSigilPayloadV1;
}>;

/** Minimal guards (no runtime validation beyond type checks). */
export const isEvidenceUrl = (v: unknown): v is EvidenceUrl => typeof v === "string" && v.length > 0;
export const isOracleSig = (v: unknown): v is OracleSig => typeof v === "string" && v.length > 0;
