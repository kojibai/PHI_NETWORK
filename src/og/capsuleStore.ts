import fs from "node:fs/promises";
import path from "node:path";
import { extractPayloadFromUrl } from "../utils/sigilUrl";
import { buildVerifierSlug, hashProofCapsuleV1, normalizeChakraDay } from "../components/KaiVoh/verifierProof";
import type { VerifiedOgData } from "./types";

const STORE_CANDIDATES = [
  path.join(process.cwd(), "public", "links.json"),
  path.join(process.cwd(), "tests", "krystal-primitive-v1", "examples", "sigil-registry-normalized.json"),
  path.join(process.cwd(), "tests", "krystal-primitive-v1", "examples", "sigil-registry.json"),
];

type UrlStore = { urls?: unknown } | unknown;

type CapsuleIndex = {
  byCapsuleHash: Map<string, VerifiedOgData>;
  byVerifierSlug: Map<string, VerifiedOgData>;
  byCanonicalHash: Map<string, VerifiedOgData>;
  sourcePath?: string;
  sourceMtimeMs: number;
};

let cachedIndex: CapsuleIndex | null = null;

function normalizeUrlStore(raw: UrlStore): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { urls?: unknown }).urls)) {
    return (raw as { urls: unknown[] }).urls.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function canonicalHashFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] === "s" && segments[1]) return segments[1].toLowerCase();
    return null;
  } catch {
    return null;
  }
}

function resolvePhiKey(payload: Record<string, unknown>): string | null {
  const userPhiKey = payload.userPhiKey;
  if (typeof userPhiKey === "string" && userPhiKey.trim()) return userPhiKey.trim();
  const phiKey = payload.phiKey;
  if (typeof phiKey === "string" && phiKey.trim()) return phiKey.trim();
  return null;
}

async function readStore(): Promise<{ urls: string[]; sourcePath?: string; sourceMtimeMs: number }> {
  for (const candidate of STORE_CANDIDATES) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      const rawText = await fs.readFile(candidate, "utf8");
      const parsed = JSON.parse(rawText) as UrlStore;
      const urls = normalizeUrlStore(parsed);
      return { urls, sourcePath: candidate, sourceMtimeMs: stat.mtimeMs };
    } catch {
      // ignore missing or malformed
    }
  }
  return { urls: [], sourceMtimeMs: 0 };
}

async function buildIndex(): Promise<CapsuleIndex> {
  const { urls, sourcePath, sourceMtimeMs } = await readStore();
  const byCapsuleHash = new Map<string, VerifiedOgData>();
  const byVerifierSlug = new Map<string, VerifiedOgData>();
  const byCanonicalHash = new Map<string, VerifiedOgData>();

  for (const rawUrl of urls) {
    const payload = extractPayloadFromUrl(rawUrl);
    if (!payload) continue;

    const pulse = Number(payload.pulse);
    if (!Number.isFinite(pulse)) continue;

    const kaiSignature = typeof payload.kaiSignature === "string" ? payload.kaiSignature.trim() : "";
    if (!kaiSignature) continue;

    const chakraDay = normalizeChakraDay(
      typeof payload.chakraDay === "string" ? payload.chakraDay : undefined,
    );
    if (!chakraDay) continue;

    const phiKey = resolvePhiKey(payload as Record<string, unknown>);
    if (!phiKey) continue;

    const verifierSlug = buildVerifierSlug(pulse, kaiSignature);
    const capsuleHash = await hashProofCapsuleV1({
      v: "KPV-1",
      pulse,
      chakraDay,
      kaiSignature,
      phiKey,
      verifierSlug,
    });

    const data: VerifiedOgData = {
      capsuleHash,
      pulse,
      phikey: phiKey,
      kasOk: true,
      g16Ok: true,
      verifierSlug,
    };

    if (!byCapsuleHash.has(capsuleHash)) {
      byCapsuleHash.set(capsuleHash, data);
    }

    if (!byVerifierSlug.has(verifierSlug)) {
      byVerifierSlug.set(verifierSlug, data);
    }

    const canonicalFromPayload = typeof payload.canonicalHash === "string" ? payload.canonicalHash.toLowerCase() : null;
    const canonicalFromUrl = canonicalHashFromUrl(rawUrl);
    const canonical = canonicalFromPayload ?? canonicalFromUrl;
    if (canonical && !byCanonicalHash.has(canonical)) {
      byCanonicalHash.set(canonical, data);
    }
  }

  return { byCapsuleHash, byVerifierSlug, byCanonicalHash, sourcePath, sourceMtimeMs };
}

async function getIndex(): Promise<CapsuleIndex> {
  if (!cachedIndex) {
    cachedIndex = await buildIndex();
    return cachedIndex;
  }

  if (cachedIndex.sourcePath) {
    try {
      const stat = await fs.stat(cachedIndex.sourcePath);
      if (stat.mtimeMs > cachedIndex.sourceMtimeMs) {
        cachedIndex = await buildIndex();
      }
    } catch {
      cachedIndex = await buildIndex();
    }
  }

  return cachedIndex;
}

export async function getCapsuleByHash(capsuleHash: string): Promise<VerifiedOgData | null> {
  const index = await getIndex();
  return index.byCapsuleHash.get(capsuleHash) ?? null;
}

export async function getCapsuleByVerifierSlug(verifierSlug: string): Promise<VerifiedOgData | null> {
  const index = await getIndex();
  return index.byVerifierSlug.get(verifierSlug) ?? null;
}

export async function getCapsuleByCanonicalHash(canonicalHash: string): Promise<VerifiedOgData | null> {
  const index = await getIndex();
  return index.byCanonicalHash.get(canonicalHash.toLowerCase()) ?? null;
}
