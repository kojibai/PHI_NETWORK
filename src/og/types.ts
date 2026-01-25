export type VerifiedCardData = {
  capsuleHash: string;
  pulse: number;
  verifiedAtPulse: number;
  phikey: string;
  kasOk: boolean;
  g16Ok: boolean;
  verifierSlug?: string;
  sigilSvg?: string;
};
