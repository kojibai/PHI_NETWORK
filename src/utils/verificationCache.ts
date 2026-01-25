import { sha256Hex } from "./sha256";

export type VerificationCache = Readonly<{
  v: "KVC-1";
  cacheKey: string;
  bundleHash: string;
  zkPoseidonHash: string;
  verificationVersion: string;
  verifiedAtPulse?: number;
  verifier?: string;
  createdAtMs?: number;
  expiresAtPulse?: number | null;
  zkVerifiedCached?: boolean;
}>;

const CACHE_PREFIX = "kvb:" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function buildVerificationCacheKey(params: {
  bundleHash: string;
  zkPoseidonHash: string;
  verificationVersion?: string | null;
}): Promise<string> {
  const version = params.verificationVersion ?? "KVB-1.0";
  const seed = `${params.bundleHash}|${params.zkPoseidonHash}|${version}`;
  const digest = await sha256Hex(seed);
  return `${CACHE_PREFIX}${digest.toLowerCase()}`;
}

export function isVerificationCache(value: unknown): value is VerificationCache {
  if (!isRecord(value)) return false;
  return (
    value.v === "KVC-1" &&
    typeof value.cacheKey === "string" &&
    typeof value.bundleHash === "string" &&
    typeof value.zkPoseidonHash === "string" &&
    typeof value.verificationVersion === "string"
  );
}

export function matchesVerificationCache(
  record: VerificationCache,
  params: { bundleHash: string; zkPoseidonHash: string; verificationVersion?: string | null }
): boolean {
  const expectedVersion = params.verificationVersion ?? "KVB-1.0";
  return (
    record.bundleHash === params.bundleHash &&
    record.zkPoseidonHash === params.zkPoseidonHash &&
    record.verificationVersion === expectedVersion
  );
}

export async function readVerificationCache(params: {
  bundleHash: string;
  zkPoseidonHash: string;
  verificationVersion?: string | null;
}): Promise<VerificationCache | null> {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
  const cacheKey = await buildVerificationCacheKey(params);
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isVerificationCache(parsed)) return null;
    if (parsed.cacheKey !== cacheKey) return null;
    if (!matchesVerificationCache(parsed, params)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeVerificationCache(record: VerificationCache): Promise<void> {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(record.cacheKey, JSON.stringify(record));
  } catch {
    // ignore cache write errors
  }
}

export async function buildVerificationCacheRecord(params: {
  bundleHash: string;
  zkPoseidonHash: string;
  verificationVersion?: string | null;
  verifiedAtPulse?: number | null;
  verifier?: string | null;
  createdAtMs?: number;
  expiresAtPulse?: number | null;
}): Promise<VerificationCache> {
  const verificationVersion = params.verificationVersion ?? "KVB-1.0";
  const cacheKey = await buildVerificationCacheKey({
    bundleHash: params.bundleHash,
    zkPoseidonHash: params.zkPoseidonHash,
    verificationVersion,
  });
  return {
    v: "KVC-1",
    cacheKey,
    bundleHash: params.bundleHash,
    zkPoseidonHash: params.zkPoseidonHash,
    verificationVersion,
    verifiedAtPulse: params.verifiedAtPulse ?? undefined,
    verifier: params.verifier ?? undefined,
    createdAtMs: params.createdAtMs,
    expiresAtPulse: params.expiresAtPulse ?? null,
  };
}
