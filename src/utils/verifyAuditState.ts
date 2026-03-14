export type AttestationState = boolean | "missing";

export type AuditSealState = "off" | "busy" | "valid" | "invalid" | "na";

export function resolveVerificationBoolean(value: boolean | null | undefined): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

export function resolveKasVerificationStatus(args: {
  hasKASOwnerSig: boolean;
  ownerAuthorSigVerified: boolean | null;
  hasKASReceiveSig: boolean;
  receiveSigVerified: boolean | null;
}): boolean | null {
  if (args.hasKASOwnerSig) {
    return resolveVerificationBoolean(args.ownerAuthorSigVerified);
  }
  if (args.hasKASReceiveSig) {
    return resolveVerificationBoolean(args.receiveSigVerified);
  }
  return null;
}

export function resolveOriginOwnershipAttestation(args: {
  hasKASOwnerSig: boolean;
  ownerAuthorSigVerified: boolean | null;
  effectiveOwnerPhiKey: string | null | undefined;
  signerPhiKey: string | null | undefined;
}): { ownerPhiKeyVerified: boolean | null; ownershipAttested: AttestationState } {
  if (!args.hasKASOwnerSig) {
    return { ownerPhiKeyVerified: null, ownershipAttested: "missing" };
  }

  const ownerSigStatus = resolveVerificationBoolean(args.ownerAuthorSigVerified);
  if (ownerSigStatus === false) {
    return { ownerPhiKeyVerified: false, ownershipAttested: false };
  }
  if (ownerSigStatus === null) {
    return { ownerPhiKeyVerified: null, ownershipAttested: "missing" };
  }

  const effectiveOwnerPhiKey = args.effectiveOwnerPhiKey?.trim() ?? "";
  const signerPhiKey = args.signerPhiKey?.trim() ?? "";
  if (!effectiveOwnerPhiKey || !signerPhiKey) {
    return { ownerPhiKeyVerified: null, ownershipAttested: "missing" };
  }

  const ok = signerPhiKey === effectiveOwnerPhiKey;
  return { ownerPhiKeyVerified: ok, ownershipAttested: ok };
}

export function sealStateToBoolean(state: AuditSealState): boolean | null {
  if (state === "valid") return true;
  if (state === "invalid") return false;
  return null;
}

export function verificationBooleanToMark(value: boolean | null): string | null {
  if (value === true) return "✅";
  if (value === false) return "❌";
  return null;
}
