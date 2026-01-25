import fs from "node:fs/promises";
import path from "node:path";
import { matchRoutes, type RouteObject } from "react-router";
import { API_URLS_PATH, LIVE_BASE_URL, LIVE_BACKUP_URL } from "../components/SigilExplorer/apiClient";
import { LruTtlCache, cacheKeyForRequest } from "./cache";
import type { JsonValue, SnapshotEntry } from "./snapshotTypes";
import { decodePayloadFromQuery } from "../utils/payload";
import { toJsonValue } from "./safeJson";

export type LoaderResult = {
  key: string;
  ttlMs: number;
  value: JsonValue;
};

export type RouteLoader = (ctx: { url: URL }) => Promise<LoaderResult | null>;

const SSR_ROUTE_CONFIG: RouteObject[] = [
  { path: "s", id: "sigil" },
  { path: "s/:hash", id: "sigil" },
  { path: "stream", id: "stream" },
  { path: "stream/p/:token", id: "stream-token" },
  { path: "stream/c/:token", id: "stream-canonical" },
  { path: "feed", id: "feed" },
  { path: "feed/p/:token", id: "feed-token" },
  { path: "p~:token", id: "p-short" },
  { path: "p~:token/*", id: "p-short-child" },
  { path: "token", id: "token" },
  { path: "p~token", id: "token" },
  { path: "p", id: "p-legacy" },
  { path: "explorer", id: "explorer" },
  { path: "keystream", id: "explorer" },
];

const loaderRegistry: Record<string, RouteLoader> = {
  stream: loadStreamSeed,
  "stream-token": loadStreamSeed,
  "stream-canonical": loadStreamSeed,
  feed: loadStreamSeed,
  "feed-token": loadStreamSeed,
  "p-short": loadStreamSeed,
  "p-short-child": loadStreamSeed,
  token: loadStreamSeed,
  "p-legacy": loadStreamSeed,
  sigil: loadSigilPayload,
  explorer: loadExplorerUrls,
};

export function matchRouteLoaders(url: URL): RouteLoader[] {
  const matches = matchRoutes(SSR_ROUTE_CONFIG, url.pathname) ?? [];
  const out: RouteLoader[] = [];
  for (const match of matches) {
    const id = match.route.id;
    if (typeof id !== "string") continue;
    const loader = loaderRegistry[id];
    if (!loader) continue;
    out.push(loader);
  }
  return out;
}

type CachedLoaderValue = { value: JsonValue; ttlMs: number };

export async function buildSnapshotEntries(
  url: URL,
  dataCache: LruTtlCache<string, CachedLoaderValue>,
): Promise<Record<string, SnapshotEntry>> {
  const entries: Record<string, SnapshotEntry> = {};
  const loaders = matchRouteLoaders(url);
  if (loaders.length === 0) return entries;

  const now = Date.now();
  const ctx = { url };

  for (const loader of loaders) {
    const result = await loader(ctx);
    if (!result) continue;

    const cached = dataCache.getEntry(result.key);
    if (cached) {
      const remaining = cached.expiresAtMs > 0 ? Math.max(0, cached.expiresAtMs - now) : cached.value.ttlMs;
      entries[result.key] = {
        value: cached.value.value,
        ttlMs: remaining,
      };
      continue;
    }

    dataCache.set(result.key, { value: result.value, ttlMs: result.ttlMs }, result.ttlMs);
    entries[result.key] = { value: result.value, ttlMs: result.ttlMs };
  }

  return entries;
}

async function loadStreamSeed(): Promise<LoaderResult | null> {
  const key = cacheKeyForRequest("GET", "/links.json");
  const filePath = path.resolve(process.cwd(), "public", "links.json");

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    const entries: { url: string }[] = [];
    for (const row of parsed) {
      if (row && typeof row === "object" && typeof (row as { url?: unknown }).url === "string") {
        const url = (row as { url: string }).url.trim();
        if (url) entries.push({ url });
      }
    }

    return {
      key,
      ttlMs: 60_000,
      value: entries as JsonValue,
    };
  } catch {
    return null;
  }
}

async function loadExplorerUrls(): Promise<LoaderResult | null> {
  const url = new URL(API_URLS_PATH, LIVE_BASE_URL);
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "5000");

  const key = cacheKeyForRequest("GET", url.toString());

  try {
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) {
      const fallbackUrl = new URL(API_URLS_PATH, LIVE_BACKUP_URL);
      fallbackUrl.searchParams.set("offset", "0");
      fallbackUrl.searchParams.set("limit", "5000");

      const backupRes = await fetch(fallbackUrl.toString(), { method: "GET" });
      if (!backupRes.ok) return null;
      const backupData = (await backupRes.json()) as JsonValue;
      return { key, ttlMs: 30_000, value: backupData };
    }

    const data = (await res.json()) as JsonValue;
    return { key, ttlMs: 30_000, value: data };
  } catch {
    return null;
  }
}

async function loadSigilPayload(ctx: { url: URL }): Promise<LoaderResult | null> {
  const payload = decodePayloadFromQuery(ctx.url.search);
  if (!payload) return null;

  const hash = ctx.url.pathname.startsWith("/s/") ? ctx.url.pathname.split("/")[2] : "query";
  const key = `sigil:${hash || "query"}`;

  return {
    key,
    ttlMs: 60_000,
    value: toJsonValue(payload),
  };
}
