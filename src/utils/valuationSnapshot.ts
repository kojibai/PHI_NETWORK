export type ValuationSnapshot = Readonly<{
  v: "KVS-1";
  verifiedAtPulse: number;
  phiValue: number;
  usdValue: number | null;
  usdPerPhi: number | null;
  source: "balance" | "embedded" | "live" | "unknown";
  mode: "origin" | "receive";
}>;

export type ValuationSnapshotInput = {
  verifiedAtPulse: number;
  phiValue: number;
  usdPerPhi: number | null;
  source: ValuationSnapshot["source"];
  mode: ValuationSnapshot["mode"];
};

export type ValuationSnapshotState = {
  key: string;
  snapshot: ValuationSnapshot;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValuationSnapshot(value: unknown): value is ValuationSnapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.v !== "KVS-1") return false;
  if (!isFiniteNumber(record.verifiedAtPulse)) return false;
  if (!isFiniteNumber(record.phiValue)) return false;
  const usdPerPhi = record.usdPerPhi;
  if (usdPerPhi !== null && !isFiniteNumber(usdPerPhi)) return false;
  const usdValue = record.usdValue;
  if (usdValue !== null && !isFiniteNumber(usdValue)) return false;
  if (record.source !== "balance" && record.source !== "embedded" && record.source !== "live" && record.source !== "unknown") return false;
  if (record.mode !== "origin" && record.mode !== "receive") return false;
  return true;
}

export function buildValuationSnapshotKey(bundleHash: string, verifiedAtPulse: number): string {
  return `${bundleHash}|${verifiedAtPulse}`;
}

export function createValuationSnapshot(input: ValuationSnapshotInput): ValuationSnapshot {
  const usdPerPhi = isFiniteNumber(input.usdPerPhi) && input.usdPerPhi > 0 ? input.usdPerPhi : null;
  const usdValue = usdPerPhi ? input.phiValue * usdPerPhi : null;
  return {
    v: "KVS-1",
    verifiedAtPulse: input.verifiedAtPulse,
    phiValue: input.phiValue,
    usdValue,
    usdPerPhi,
    source: input.source,
    mode: input.mode,
  };
}

export function getOrCreateValuationSnapshot(
  prev: ValuationSnapshotState | null,
  key: string,
  input: ValuationSnapshotInput | null,
): ValuationSnapshotState | null {
  if (!key) return null;
  if (prev?.key === key) return prev;
  if (!input) return null;
  return { key, snapshot: createValuationSnapshot(input) };
}
