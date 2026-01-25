import type { VerificationReceipt, VerificationSig } from "../utils/verificationReceipt";

export type VerifiedCardData = {
  capsuleHash: string;
  pulse: number;
  verifiedAtPulse: number;
  phikey: string;
  kasOk: boolean;
  g16Ok: boolean;
  verifierSlug?: string;
  verifier?: string;
  verificationVersion?: string;
  bundleHash?: string;
  zkPoseidonHash?: string;
  receipt?: VerificationReceipt;
  receiptHash?: string;
  verificationSig?: VerificationSig;
  sigilSvg?: string;
};
