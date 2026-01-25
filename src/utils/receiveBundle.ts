import type { AuthorSig } from "./authorSig";
import type { OwnerKeyDerivation } from "./ownerPhiKey";
import { jcsCanonicalize } from "./jcs";
import { sha256Hex } from "./sha256";
import { buildBundleRoot, type BundleRoot, type ProofBundleLike } from "../components/KaiVoh/verifierProof";

type ReceiveBundleRootBase = BundleRoot & {
  mode: "receive";
  originBundleHash?: string;
  originAuthorSig?: AuthorSig | null;
  receivePulse?: number;
  ownerPhiKey?: string;
  ownerKeyDerivation?: OwnerKeyDerivation;
};

export type ReceiveBundleRoot = Readonly<ReceiveBundleRootBase>;

type ReceiveBundleRootInput = {
  bundleRoot?: BundleRoot;
  bundle: ProofBundleLike;
  originBundleHash?: string;
  originAuthorSig?: AuthorSig | null;
  receivePulse?: number;
  ownerPhiKey?: string;
  ownerKeyDerivation?: OwnerKeyDerivation;
};

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
  return Object.fromEntries(entries) as T;
}

/**
 * Receive bundle root is derived from the proof bundle root plus receive bindings.
 * NOTE: ownerPhiKey/ownerKeyDerivation are optional inputs; avoid including them
 * when hashing receiveBundleHash to prevent circular dependencies.
 */
export function buildReceiveBundleRoot(input: ReceiveBundleRootInput): ReceiveBundleRoot {
  const baseRoot = input.bundleRoot ?? buildBundleRoot(input.bundle);
  const merged = dropUndefined({
    ...baseRoot,
    mode: "receive" as const,
    originBundleHash: input.originBundleHash,
    originAuthorSig: input.originAuthorSig ?? undefined,
    receivePulse: input.receivePulse,
    ownerPhiKey: input.ownerPhiKey,
    ownerKeyDerivation: input.ownerKeyDerivation,
  });
  return merged as ReceiveBundleRoot;
}

export async function hashReceiveBundleRoot(root: ReceiveBundleRoot): Promise<string> {
  return await sha256Hex(jcsCanonicalize(root as Parameters<typeof jcsCanonicalize>[0]));
}
