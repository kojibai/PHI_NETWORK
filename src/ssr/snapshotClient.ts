import type { JsonValue, SsrSnapshot } from "./snapshotTypes";
import { LruTtlCache, cacheKeyForRequest } from "./cache";
import { prependUniqueToStorage } from "../pages/sigilstream/data/storage";
import {
  addUrl,
  ensureRegistryHydrated,
  persistRegistryToStorage,
} from "../components/SigilExplorer/registryStore";

const seededCache = new LruTtlCache<string, JsonValue>({ maxEntries: 256 });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getSeeded<T>(key: string): T | undefined {
  const value = seededCache.get(key);
  return value as T | undefined;
}

export function setSeeded<T extends JsonValue>(key: string, value: T, ttlMs: number): void {
  seededCache.set(key, value, ttlMs);
}

export function seedFromSnapshot(snapshot: SsrSnapshot | null): void {
  if (!snapshot) return;
  const now = Date.now();
  const ageMs = Math.max(0, now - snapshot.createdAtMs);

  for (const [key, entry] of Object.entries(snapshot.data)) {
    const ttlMs = Math.max(0, entry.ttlMs - ageMs);
    if (ttlMs <= 0) continue;
    setSeeded(key, entry.value, ttlMs);
  }
}

export function parseSnapshot(raw: string | null): SsrSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    if (parsed.version !== "v1") return null;
    if (typeof parsed.url !== "string") return null;
    if (typeof parsed.createdAtMs !== "number") return null;
    if (!isRecord(parsed.data)) return null;
    return parsed as SsrSnapshot;
  } catch {
    return null;
  }
}

export function readSnapshotFromDom(doc: Document): SsrSnapshot | null {
  const script = doc.getElementById("__SSR_SNAPSHOT__");
  if (!script) return null;
  return parseSnapshot(script.textContent);
}

export function persistSnapshotToOfflineStores(snapshot: SsrSnapshot | null): void {
  if (!snapshot) return;
  if (typeof window === "undefined") return;

  const idleWin = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  };

  const commit = (): void => {
    const linksKey = cacheKeyForRequest("GET", "/links.json");
    const linksEntry = snapshot.data[linksKey];
    if (linksEntry && Array.isArray(linksEntry.value)) {
      const urls = linksEntry.value
        .map((row) => (isRecord(row) ? row.url : null))
        .filter((u): u is string => typeof u === "string" && u.trim().length > 0);
      if (urls.length) prependUniqueToStorage(urls);
    }

    const explorerKeyPrefix = `${cacheKeyForRequest("GET", "/sigils/urls")}`;
    for (const [key, entry] of Object.entries(snapshot.data)) {
      if (!key.startsWith(explorerKeyPrefix)) continue;
      if (!isRecord(entry.value)) continue;
      const urls = entry.value.urls;
      if (!Array.isArray(urls)) continue;
      ensureRegistryHydrated();
      let changed = false;
      for (const url of urls) {
        if (typeof url !== "string") continue;
        const added = addUrl(url, {
          includeAncestry: true,
          broadcast: false,
          persist: false,
          source: "hydrate",
          enqueueToApi: false,
        });
        if (added) changed = true;
      }
      if (changed) persistRegistryToStorage();
    }
  };

  if (typeof idleWin.requestIdleCallback === "function") {
    idleWin.requestIdleCallback(commit, { timeout: 1200 });
  } else {
    window.setTimeout(commit, 120);
  }
}
