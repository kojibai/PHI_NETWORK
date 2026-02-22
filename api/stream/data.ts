import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { extractPayloadTokenFromUrlString, decodeFeedPayload } from "../../src/utils/feedPayload";

export type StreamRow = {
  token: string;
  url: string;
  pulse: number;
  updatedAt: number;
  preview: {
    title: string;
    author: string;
    pulse: number;
    kind: string;
    shortBody: string;
    links: string[];
  };
};

type PersistedIndex = {
  sourceDigest: string;
  rows: StreamRow[];
  seals: string[];
  builtAt: number;
};

type StreamIndex = {
  sourceDigest: string;
  rows: StreamRow[];
  latestSeal: string;
  latestPulse: number;
  sealByCount: string[];
  prefixIndexBySeal: Map<string, number>;
};

const JOURNAL_PATH = path.resolve(process.cwd(), ".cache/stream-journal.json");
let memIndex: PersistedIndex | null = null;

function bodyText(payload: ReturnType<typeof decodeFeedPayload>): string {
  if (!payload) return "";
  const body = payload.body;
  const raw =
    body?.kind === "text"
      ? body.text
      : body?.kind === "md"
        ? body.md
        : body?.kind === "code"
          ? body.code
          : body?.kind === "html"
            ? body.html
            : payload.caption ?? "";
  return String(raw).replace(/\s+/g, " ").slice(0, 180);
}

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function loadPersistedIndex(): Promise<PersistedIndex | null> {
  if (memIndex) return memIndex;
  try {
    const raw = await fs.readFile(JOURNAL_PATH, "utf8");
    const parsed = JSON.parse(raw) as PersistedIndex;
    if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.seals) || typeof parsed.sourceDigest !== "string") {
      return null;
    }
    memIndex = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function persistIndex(index: PersistedIndex): Promise<void> {
  memIndex = index;
  await fs.mkdir(path.dirname(JOURNAL_PATH), { recursive: true });
  await fs.writeFile(JOURNAL_PATH, JSON.stringify(index), "utf8");
}

function computePrefixSeals(rows: StreamRow[]): string[] {
  const h = createHash("sha256");
  const seals: string[] = ["0"];
  for (const row of rows) {
    h.update(`${row.token}:${row.pulse}:${row.updatedAt}`);
    seals.push(h.copy().digest("hex").slice(0, 24));
  }
  return seals;
}

async function scanRowsFromLinks(rawLinks: string): Promise<StreamRow[]> {
  const json = JSON.parse(rawLinks) as Array<{ url?: string }>;
  const out: StreamRow[] = [];
  for (const row of json) {
    const url = row.url?.trim();
    if (!url) continue;
    const token = extractPayloadTokenFromUrlString(url);
    if (!token) continue;
    const payload = decodeFeedPayload(token);
    if (!payload) continue;
    out.push({
      token,
      url,
      pulse: Number(payload.pulse) || 0,
      updatedAt: Number(payload.ts) || 0,
      preview: {
        title: payload.caption?.slice(0, 72) || payload.body?.kind || "memory",
        author: payload.author || "@unknown",
        pulse: Number(payload.pulse) || 0,
        kind: payload.body?.kind || "text",
        shortBody: bodyText(payload),
        links: [payload.url],
      },
    });
  }
  out.sort((a, b) => a.updatedAt - b.updatedAt || a.pulse - b.pulse || a.token.localeCompare(b.token));
  return out;
}

export async function getStreamIndex(): Promise<StreamIndex> {
  const linksPath = path.resolve(process.cwd(), "public/links.json");
  const raw = await fs.readFile(linksPath, "utf8");
  const sourceDigest = hashString(raw);

  let persisted = await loadPersistedIndex();
  if (!persisted || persisted.sourceDigest !== sourceDigest) {
    const rows = await scanRowsFromLinks(raw);
    const seals = computePrefixSeals(rows);
    persisted = { sourceDigest, rows, seals, builtAt: Date.now() };
    await persistIndex(persisted);
  }

  const prefixIndexBySeal = new Map<string, number>();
  for (let i = 0; i < persisted.seals.length; i += 1) {
    prefixIndexBySeal.set(persisted.seals[i], i);
  }

  return {
    sourceDigest: persisted.sourceDigest,
    rows: persisted.rows,
    latestSeal: persisted.seals[persisted.seals.length - 1] ?? "0",
    latestPulse: persisted.rows[persisted.rows.length - 1]?.pulse ?? 0,
    sealByCount: persisted.seals,
    prefixIndexBySeal,
  };
}

export type CursorState = { offset: number; anchorPulse: number };

export function encodeCursor(state: CursorState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeCursor(raw: string | null, fallbackPulse: number): CursorState {
  if (!raw) return { offset: 0, anchorPulse: fallbackPulse };
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CursorState;
    return {
      offset: Math.max(0, Number(parsed.offset) || 0),
      anchorPulse: Number(parsed.anchorPulse) || fallbackPulse,
    };
  } catch {
    return { offset: 0, anchorPulse: fallbackPulse };
  }
}
