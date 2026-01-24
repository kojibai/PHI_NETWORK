// src/utils/sigilRegistry.ts
/* ─────────────────────────────────────────────────────────────
   sigilRegistry.ts — Shared bridge into the Sigil Explorer
   - Single entrypoint for “a sigil/stream URL was just created”
   - Canonical storage in localStorage (with legacy fallback key)
   - BroadcastChannel for cross-tab sync
   - DOM CustomEvent("sigil:url-registered") for same-tab listeners
   - Optional global hook: window.__SIGIL__.registerSigilUrl
   - SSR-safe: everything is guarded behind window checks
   ───────────────────────────────────────────────────────────── */

import type { KASAuthorSig } from "./authorSig";
import { extractPayloadTokenFromUrlString } from "./feedPayload";

export type SigilRegistryGlobal = {
  registerSigilUrl?: (url: string) => void;
};

export type SigilRegistryRegisterResult = {
  changed: boolean;
  added: boolean;
  updated: boolean;
  value: string;
};

/** Canonical localStorage key for the sigil registry. */
export const SIGIL_REGISTRY_LS_KEY = "kai:sigils:v1" as const;

/** Legacy/fallback key for older code paths (kept in sync). */
export const SIGIL_REGISTRY_FALLBACK_LS_KEY = "sigil:urls" as const;

/** Local keystream cache for KAS author signatures keyed by sigil URL/token. */
export const SIGIL_REGISTRY_AUTH_LS_KEY = "kai:sigils:auth:v1" as const;

/** BroadcastChannel name for cross-tab notifications. */
export const SIGIL_REGISTRY_CHANNEL_NAME = "kai-sigil-registry" as const;

const hasWindow = typeof window !== "undefined";
const inMemoryRegistry: string[] = [];

/* ───────── Internal helpers ───────── */

function getSigilGlobalBag(): SigilRegistryGlobal {
  if (!hasWindow) return {};
  const w = window as unknown as { __SIGIL__?: SigilRegistryGlobal };
  if (!w.__SIGIL__) w.__SIGIL__ = {};
  return w.__SIGIL__!;
}

/** Read a JSON string[] list from localStorage under the given key. */
function readList(key: string): string[] {
  if (!hasWindow) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed.filter((x) => typeof x === "string") as string[])
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function authKeyForUrl(rawUrl: string): string | null {
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) return null;
  const token = extractPayloadTokenFromUrlString(canonical);
  return token ? `t:${token}` : `u:${canonical}`;
}

function readAuthMap(): Record<string, KASAuthorSig> {
  if (!hasWindow) return {};
  try {
    const raw = window.localStorage.getItem(SIGIL_REGISTRY_AUTH_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, KASAuthorSig>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAuthMap(map: Record<string, KASAuthorSig>): void {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(SIGIL_REGISTRY_AUTH_LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Store the KAS author signature alongside a sigil URL in the local keystream cache. */
export function registerSigilAuth(url: string, authorSig: KASAuthorSig): void {
  if (!hasWindow) return;
  const key = authKeyForUrl(url);
  if (!key) return;
  const next = readAuthMap();
  next[key] = authorSig;
  writeAuthMap(next);
}

/** Lookup a stored KAS author signature for a sigil URL (if available). */
export function getRegisteredSigilAuth(url: string): KASAuthorSig | null {
  if (!hasWindow) return null;
  const key = authKeyForUrl(url);
  if (!key) return null;
  const map = readAuthMap();
  return map[key] ?? null;
}

function countAddsInUrl(rawUrl: string): number {
  if (!hasWindow) return 0;
  try {
    const u = new URL(rawUrl, window.location.origin);
    const hashStr = u.hash.startsWith("#") ? u.hash.slice(1) : "";
    const hp = new URLSearchParams(hashStr);
    return hp.getAll("add").length + u.searchParams.getAll("add").length;
  } catch {
    return 0;
  }
}

function registryScore(rawUrl: string): number {
  const adds = countAddsInUrl(rawUrl);
  return adds * 100_000 + rawUrl.length;
}

function upsertUrlList(key: string, rawUrl: string): SigilRegistryRegisterResult {
  if (!hasWindow) return { changed: false, added: false, updated: false, value: rawUrl };
  if (typeof window.localStorage === "undefined") {
    return { changed: false, added: false, updated: false, value: rawUrl };
  }

  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) return { changed: false, added: false, updated: false, value: rawUrl };

  try {
    const raw = window.localStorage.getItem(key);
    const existing: string[] = [];
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const v of parsed) if (typeof v === "string") existing.push(v);
      }
    }

    const order: string[] = [];
    const best = new Map<string, { url: string; score: number }>();

    const keyOf = (u: string): string => {
      const canon = canonicalizeUrl(u) ?? u;
      const token = extractPayloadTokenFromUrlString(canon);
      return token ? `t:${token}` : `u:${canon}`;
    };

    for (const v of existing) {
      const canon = canonicalizeUrl(v);
      if (!canon) continue;
      const k = keyOf(canon);
      const sc = registryScore(canon);

      if (!best.has(k)) {
        best.set(k, { url: canon, score: sc });
        order.push(k);
      } else {
        const prior = best.get(k)!;
        if (sc > prior.score) best.set(k, { url: canon, score: sc });
      }
    }

    const newKey = keyOf(canonical);
    const newScore = registryScore(canonical);

    let added = false;
    let updated = false;

    if (!best.has(newKey)) {
      best.set(newKey, { url: canonical, score: newScore });
      order.push(newKey);
      added = true;
    } else {
      const prior = best.get(newKey)!;
      if (newScore > prior.score) {
        best.set(newKey, { url: canonical, score: newScore });
        updated = true;
      }
    }

    const next: string[] = [];
    for (const k of order) {
      const it = best.get(k);
      if (it) next.push(it.url);
    }

    const prevJson = JSON.stringify(existing);
    const nextJson = JSON.stringify(next);

    if (prevJson !== nextJson) {
      window.localStorage.setItem(key, nextJson);
      return { changed: true, added, updated, value: canonical };
    }

    return { changed: false, added, updated, value: canonical };
  } catch {
    return { changed: false, added: false, updated: false, value: canonical };
  }
}

/** Canonicalize to an absolute URL when possible. */
function canonicalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (!hasWindow) return trimmed;

  try {
    const u = new URL(trimmed, window.location.origin);
    return u.toString();
  } catch {
    // If URL constructor fails (e.g. custom schemes), fall back to raw
    return trimmed;
  }
}

function rememberInMemory(url: string): void {
  const abs = canonicalizeUrl(url);
  if (!abs) return;
  if (inMemoryRegistry.includes(abs)) return;
  inMemoryRegistry.push(abs);
}

export function getInMemorySigilUrls(): string[] {
  return [...inMemoryRegistry];
}

/** Lazy BroadcastChannel (shared instance). */
let _bc: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel | null {
  if (!hasWindow) return null;
  if (!("BroadcastChannel" in window)) return null;
  if (_bc) return _bc;
  _bc = new BroadcastChannel(SIGIL_REGISTRY_CHANNEL_NAME);
  return _bc;
}

/* ───────── Core API: registerSigilUrl / registerSigilUrls ───────── */

/**
 * Main bridge: call this whenever you mint/exhale a sigil or stream URL.
 */
export function registerSigilUrl(url: string): void {
  if (!hasWindow) return;
  const abs = canonicalizeUrl(url);
  if (!abs) return;

  rememberInMemory(abs);

  // 1) Upsert into canonical list
  const canonRes = upsertUrlList(SIGIL_REGISTRY_LS_KEY, abs);
  const changedCanon = canonRes.changed;

  // 2) Mirror into fallback list for older code paths
  const fallbackRes = upsertUrlList(SIGIL_REGISTRY_FALLBACK_LS_KEY, abs);
  const changedFallback = fallbackRes.changed;

  // If neither storage list changed, this is a duplicate/no-op.
  // We still fire the same-tab event (cheap), but we can skip cross-tab broadcast spam.
  const didChange = changedCanon || changedFallback;

  // 3) DOM event for same-tab listeners (includes change flags)
  try {
    const evt = new CustomEvent<{
      url: string;
      changed: boolean;
      changedCanon: boolean;
      changedFallback: boolean;
      added?: boolean;
      updated?: boolean;
    }>("sigil:url-registered", {
      detail: {
        url: abs,
        changed: didChange,
        changedCanon,
        changedFallback,
        added: canonRes.added || fallbackRes.added,
        updated: canonRes.updated || fallbackRes.updated,
      },
    });
    window.dispatchEvent(evt);
  } catch {
    /* ignore event errors */
  }

  // 4) BroadcastChannel for cross-tab listeners (only when something actually changed)
  try {
    if (didChange) {
      const bc = getBroadcastChannel();
      bc?.postMessage({
        type: "sigil:add",
        url: abs,
        changedCanon,
        changedFallback,
        added: canonRes.added || fallbackRes.added,
        updated: canonRes.updated || fallbackRes.updated,
      });
    }
  } catch {
    /* ignore broadcast errors */
  }

  // 5) Ensure window.__SIGIL__.registerSigilUrl points to this function
  try {
    const bag = getSigilGlobalBag();
    if (bag.registerSigilUrl !== registerSigilUrl) {
      bag.registerSigilUrl = registerSigilUrl;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Convenience helper for bulk registration.
 * Loops through the array and calls registerSigilUrl for each.
 */
export function registerSigilUrls(urls: string[]): void {
  for (const u of urls) {
    if (typeof u === "string" && u.trim()) {
      registerSigilUrl(u);
    }
  }
}

/* Back-compat export names (old callers can keep using them) */
export function registerSigilUrlForExplorer(url: string): void {
  registerSigilUrl(url);
}
export function registerSigilUrlsForExplorer(urls: string[]): void {
  registerSigilUrls(urls);
}

/* ───────── Query helpers: getRegisteredSigilUrls ───────── */

export function getRegisteredSigilUrls(): string[] {
  if (!hasWindow) return [];
  const primary = readList(SIGIL_REGISTRY_LS_KEY);
  const fallback = readList(SIGIL_REGISTRY_FALLBACK_LS_KEY);

  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const abs = canonicalizeUrl(raw);
    if (!abs) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };

  for (const u of primary) push(u);
  for (const u of fallback) push(u);

  return out;
}

/* ───────── Subscription helpers: subscribeSigilRegistry ───────── */

export type SigilRegistrySource = "event" | "storage" | "broadcast";

export function subscribeSigilRegistry(
  handler: (url: string, source: SigilRegistrySource) => void,
): () => void {
  if (!hasWindow) return () => {};

  // 1) Same-tab CustomEvent
  const onEvent = (e: Event) => {
    const ce = e as CustomEvent<{ url?: string }>;
    const u = ce?.detail?.url;
    if (typeof u === "string" && u.trim()) {
      const abs = canonicalizeUrl(u);
      if (abs) handler(abs, "event");
    }
  };

  // 2) BroadcastChannel
  const bc = getBroadcastChannel();
  const onMsg = (ev: MessageEvent) => {
    const data = ev?.data as { type?: string; url?: string } | undefined;
    if (!data || data.type !== "sigil:add") return;
    if (typeof data.url === "string" && data.url.trim()) {
      const abs = canonicalizeUrl(data.url);
      if (abs) handler(abs, "broadcast");
    }
  };

  // 3) storage events (other tabs mutating LS)
  const onStorage = (ev: StorageEvent) => {
    if (!ev.key) return;
    if (ev.key !== SIGIL_REGISTRY_LS_KEY && ev.key !== SIGIL_REGISTRY_FALLBACK_LS_KEY) return;
    if (typeof ev.newValue !== "string") return;
    try {
      const arr = JSON.parse(ev.newValue) as unknown;
      if (!Array.isArray(arr)) return;
      for (const u of arr) {
        if (typeof u !== "string" || !u.trim()) continue;
        const abs = canonicalizeUrl(u);
        if (abs) handler(abs, "storage");
      }
    } catch {
      /* ignore parse errors */
    }
  };

  window.addEventListener("sigil:url-registered", onEvent as EventListener);
  if (bc) bc.addEventListener("message", onMsg as EventListener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("sigil:url-registered", onEvent as EventListener);
    if (bc) bc.removeEventListener("message", onMsg as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}

/* ───────── Ensure global hook is wired once on module load ───────── */

if (hasWindow) {
  try {
    const bag = getSigilGlobalBag();
    if (bag.registerSigilUrl !== registerSigilUrl) {
      bag.registerSigilUrl = registerSigilUrl;
    }
  } catch {
    /* ignore */
  }
}
