import fs from "node:fs";
import path from "node:path";
import type { VerifiedCardData } from "./types";

const DEFAULT_PATHS = [
  "data/verified-capsules.json",
  "data/verified_capsules.json",
  "public/verified-capsules.json",
  "public/verified_capsules.json",
];

type CapsuleIndex = {
  byHash: Map<string, VerifiedCardData>;
  bySlug: Map<string, VerifiedCardData>;
  mtimeMs: number;
  storePath: string | null;
};

let cache: CapsuleIndex = {
  byHash: new Map(),
  bySlug: new Map(),
  mtimeMs: 0,
  storePath: null,
};

function resolveStorePath(): string | null {
  const envPath = process.env.PHI_CAPSULE_INDEX_PATH || process.env.PHI_CAPSULE_INDEX;
  const candidates = envPath ? [envPath, ...DEFAULT_PATHS] : DEFAULT_PATHS;

  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return resolved;
  }

  return null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "ok", "verified"].includes(normalized)) return true;
    if (["0", "false", "no", "invalid", "failed"].includes(normalized)) return false;
  }
  return null;
}

function parseRecord(raw: unknown): VerifiedCardData | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const capsuleHash = typeof record.capsuleHash === "string" ? record.capsuleHash : null;
  const pulseValue = record.pulse;
  const pulse = typeof pulseValue === "number" && Number.isFinite(pulseValue) ? pulseValue : null;
  const verifiedAtPulseValue =
    record.verifiedAtPulse ??
    record.verified_at_pulse ??
    record.verifiedPulse ??
    record.verified_pulse ??
    record.verificationPulse;
  const verifiedAtPulse =
    typeof verifiedAtPulseValue === "number" && Number.isFinite(verifiedAtPulseValue)
      ? verifiedAtPulseValue
      : typeof verifiedAtPulseValue === "string" && verifiedAtPulseValue.trim() !== "" && Number.isFinite(Number(verifiedAtPulseValue))
        ? Number(verifiedAtPulseValue)
        : null;
  const phiKey = typeof record.phikey === "string"
    ? record.phikey
    : typeof record.phiKey === "string"
    ? record.phiKey
    : null;
  const kasOk = parseBoolean(record.kasOk);
  const g16Ok = parseBoolean(record.g16Ok);
  const verifierSlug = typeof record.verifierSlug === "string" ? record.verifierSlug : undefined;
  const sigilSvg = typeof record.sigilSvg === "string" ? record.sigilSvg : undefined;

  if (!capsuleHash || pulse == null || !phiKey || kasOk == null || g16Ok == null) return null;

  return {
    capsuleHash,
    pulse,
    verifiedAtPulse: verifiedAtPulse ?? pulse,
    phikey: phiKey,
    kasOk,
    g16Ok,
    verifierSlug,
    sigilSvg,
  };
}

function loadIndex(): CapsuleIndex {
  const storePath = resolveStorePath();
  if (!storePath) {
    cache = { byHash: new Map(), bySlug: new Map(), mtimeMs: 0, storePath: null };
    return cache;
  }

  const stats = fs.statSync(storePath);
  if (cache.storePath === storePath && cache.mtimeMs === stats.mtimeMs) {
    return cache;
  }

  const rawText = fs.readFileSync(storePath, "utf8");
  const parsed = JSON.parse(rawText) as unknown;
  const records: VerifiedCardData[] = [];

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const rec = parseRecord(entry);
      if (rec) records.push(rec);
    }
  } else if (parsed && typeof parsed === "object") {
    const parsedRecord = parseRecord(parsed);
    if (parsedRecord) {
      records.push(parsedRecord);
    } else {
      const container = parsed as Record<string, unknown>;
      if (Array.isArray(container.records)) {
        for (const entry of container.records) {
          const rec = parseRecord(entry);
          if (rec) records.push(rec);
        }
      } else {
        for (const entry of Object.values(container)) {
          const rec = parseRecord(entry);
          if (rec) records.push(rec);
        }
      }
    }
  }

  const byHash = new Map<string, VerifiedCardData>();
  const bySlug = new Map<string, VerifiedCardData>();
  for (const record of records) {
    byHash.set(record.capsuleHash, record);
    if (record.verifierSlug) {
      bySlug.set(record.verifierSlug.toLowerCase(), record);
    }
  }

  cache = { byHash, bySlug, mtimeMs: stats.mtimeMs, storePath };
  return cache;
}

export function getCapsuleByHash(capsuleHash: string): VerifiedCardData | null {
  const index = loadIndex();
  return index.byHash.get(capsuleHash) ?? null;
}

export function getCapsuleByVerifierSlug(verifierSlug: string): VerifiedCardData | null {
  const index = loadIndex();
  return index.bySlug.get(verifierSlug.toLowerCase()) ?? null;
}
