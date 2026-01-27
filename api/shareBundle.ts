import { decodeLegacyRParam, decodeSharePayload } from "../src/utils/shareBundleCodec";

type SharePayloadParam = { param: "p" | "r"; value: string };

export type ShareBundleInfo = {
  bundle: Record<string, unknown>;
  mode?: string;
  isVerified: boolean;
  pulse?: number;
  phiKey?: string;
  keyShort: string | null;
  checks: { kas: boolean | null; g16: boolean | null };
  verifierSlug?: string;
  payload: SharePayloadParam;
};

const shortPhiKey = (phiKey: string | null | undefined): string | null => {
  const trimmed = String(phiKey ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const readNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const readNestedRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? (value as Record<string, unknown>) : undefined;

function readSharePayloadParam(params: URLSearchParams): SharePayloadParam | null {
  const p = params.get("p");
  if (p) return { param: "p", value: p };
  const r = params.get("r") ?? params.get("receipt");
  if (r) return { param: "r", value: r };
  return null;
}

function extractProofCapsule(bundle: Record<string, unknown>): {
  pulse?: number;
  phiKey?: string;
  verifierSlug?: string;
} | null {
  const direct = readNestedRecord(bundle.proofCapsule);
  const nested = readNestedRecord(readNestedRecord(bundle.bundleRoot)?.proofCapsule);
  const capsule = direct ?? nested;
  if (!capsule) return null;
  const pulse = readNumber(capsule.pulse);
  const phiKey = readString(capsule.phiKey);
  const verifierSlug = readString(capsule.verifierSlug);
  if (pulse == null && !phiKey && !verifierSlug) return null;
  return { pulse, phiKey, verifierSlug };
}

function readZkField(bundle: Record<string, unknown>, key: "zkProof" | "zkPublicInputs"): unknown {
  if (key in bundle) return bundle[key];
  const nested = readNestedRecord(bundle.bundleRoot);
  if (nested && key in nested) return nested[key];
  return undefined;
}

export function decodeShareBundleFromParams(params: URLSearchParams): ShareBundleInfo | null {
  const payload = readSharePayloadParam(params);
  if (!payload) return null;

  let decoded: unknown;
  try {
    decoded = payload.param === "p" ? decodeSharePayload(payload.value) : decodeLegacyRParam(payload.value);
  } catch {
    return null;
  }

  if (!isRecord(decoded)) return null;
  const bundle = decoded;

  const proofCapsule = extractProofCapsule(bundle);
  const verifierSlug = proofCapsule?.verifierSlug;
  const mode = readString(bundle.mode) ?? readString(readNestedRecord(bundle.bundleRoot)?.mode);

  const explicitZkVerified = typeof bundle.zkVerified === "boolean" ? bundle.zkVerified : undefined;
  const zkpVerified = typeof bundle.zkpVerified === "boolean" ? bundle.zkpVerified : undefined;
  const zkProof = readZkField(bundle, "zkProof");
  const zkInputs = readZkField(bundle, "zkPublicInputs");
  const hasProof = zkProof != null && zkInputs != null;
  const modeOk = mode === "receive" || mode === "verify";
  const inferredVerified = Boolean(verifierSlug && hasProof && modeOk && zkpVerified !== false);
  const isVerified = typeof explicitZkVerified === "boolean" ? explicitZkVerified : inferredVerified;

  const pulse = readNumber(bundle.verifiedAtPulse) ?? proofCapsule?.pulse;
  const phiKey = readString(bundle.ownerPhiKey) ?? proofCapsule?.phiKey;
  const keyShort = shortPhiKey(phiKey);

  const kasOk = bundle.authorSig ? true : null;
  const g16Ok =
    typeof explicitZkVerified === "boolean"
      ? explicitZkVerified
      : zkpVerified === false
        ? false
        : hasProof
          ? true
          : null;

  return {
    bundle,
    mode,
    isVerified,
    pulse,
    phiKey,
    keyShort,
    checks: { kas: kasOk, g16: g16Ok },
    verifierSlug,
    payload,
  };
}

export function formatCheck(value: boolean | null): string {
  if (value === true) return "✓";
  if (value === false) return "×";
  return "—";
}

export { readSharePayloadParam };
