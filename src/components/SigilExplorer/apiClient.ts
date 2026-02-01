// src/components/SigilExplorer/apiClient.ts
"use client";

import { cacheKeyForRequest } from "../../ssr/cache";
import { getSeeded } from "../../ssr/snapshotClient";

export type ApiSealResponse = {
  seal: string;
  pulse?: number;
  latestPulse?: number;
  latest_pulse?: number;
  total?: number;
};

const hasWindow = typeof window !== "undefined";
const canStorage =
  hasWindow &&
  (() => {
    try {
      return typeof window.localStorage !== "undefined";
    } catch {
      return false;
    }
  })();

/* ─────────────────────────────────────────────────────────────────────
 *  LAH-MAH-TOR API (Primary + Backup + Same-Origin Proxy First)
 *
 *  Mobile reality:
 *  - Cross-origin fetch to LIVE_BASE_URL/LIVE_BACKUP_URL can throw due to CORS.
 *  - On iOS, repeated retry loops + failed fetches can destabilize the tab.
 *
 *  Strategy:
 *  1) Prefer SAME-ORIGIN proxy FIRST when app is not hosted on API domains.
 *     (This avoids CORS entirely when proxy routes exist.)
 *  2) If cross-origin base throws (CORS/network), suppress it for a cooldown window
 *     so we don't spam retries.
 *  3) Backup suppression stays, plus generalized base suppression.
 * ─────────────────────────────────────────────────────────────────── */

export const LIVE_BASE_URL = "https://m.kai.ac";
export const LIVE_BACKUP_URL = "https://memory.kaiklok.com";

/**
 * PROXY_API_BASE:
 * - "" means same-origin relative requests: fetch("/sigils/...")
 * - Your hosting layer (or dev proxy) must route /sigils to the real API.
 */
const PROXY_API_BASE = "";

/**
 * Dev API base:
 * With Vite proxy configured for "/sigils", "" is best:
 * fetch("/sigils/inhale") -> Vite proxies to API target.
 */
export const DEV_API_BASE = "";

export const API_SEAL_PATH = "/sigils/seal";
export const API_URLS_PATH = "/sigils/urls";
export const API_INHALE_PATH = "/sigils/inhale";

const API_BASE_HINT_LS_KEY = "kai:lahmahtorBase:v1";

/** Backup suppression: if backup fails, suppress it for a cooldown window (no spam). */
const API_BACKUP_DEAD_UNTIL_LS_KEY = "kai:lahmahtorBackupDeadUntil:v1";
const API_BACKUP_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
let apiBackupDeadUntil = 0;

/** General base suppression (covers primary too when CORS/network fails). */
const API_DEAD_MAP_LS_KEY = "kai:lahmahtorDeadMap:v1";
const API_BASE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
let apiDeadMap: Record<string, number> = {};

/** Sticky base (only for real remote bases; proxy is always attempted first). */
let apiBaseHint: string = LIVE_BASE_URL;

let hydrated = false;

function nowMs(): number {
  return Date.now();
}

function isLocalDevOrigin(origin: string): boolean {
  return origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
}

function isApiDomainOrigin(origin: string): boolean {
  return origin === LIVE_BASE_URL || origin === LIVE_BACKUP_URL;
}

function isHttpsPage(): boolean {
  if (!hasWindow) return true;
  try {
    return window.location.protocol === "https:";
  } catch {
    return true;
  }
}

function loadApiDeadMap(): void {
  if (!canStorage) return;
  try {
    const raw = localStorage.getItem(API_DEAD_MAP_LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return;

    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v);
      if (typeof k === "string" && Number.isFinite(n) && n > 0) next[k] = n;
    }
    apiDeadMap = next;
  } catch {
    // ignore
  }
}

function saveApiDeadMap(): void {
  if (!canStorage) return;
  try {
    localStorage.setItem(API_DEAD_MAP_LS_KEY, JSON.stringify(apiDeadMap));
  } catch {
    // ignore
  }
}

function isBaseSuppressed(base: string): boolean {
  if (!base) return false; // proxy base is never suppressed
  const until = apiDeadMap[base] ?? 0;
  return until > 0 && nowMs() < until;
}

function clearBaseSuppression(base: string): void {
  if (!base) return;
  if (!apiDeadMap[base]) return;
  delete apiDeadMap[base];
  saveApiDeadMap();
}

function markBaseDead(base: string): void {
  if (!base) return;
  apiDeadMap[base] = nowMs() + API_BASE_COOLDOWN_MS;
  saveApiDeadMap();

  // If we were "hinted" to a base that is now dead, fall back.
  if (apiBaseHint === base) {
    apiBaseHint = LIVE_BASE_URL;
    saveApiBaseHint();
  }
}

export function loadApiBackupDeadUntil(): void {
  if (!canStorage) return;
  try {
    const raw = localStorage.getItem(API_BACKUP_DEAD_UNTIL_LS_KEY);
    if (!raw) return;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) apiBackupDeadUntil = n;
  } catch {
    // ignore
  }
}

function saveApiBackupDeadUntil(): void {
  if (!canStorage) return;
  try {
    localStorage.setItem(API_BACKUP_DEAD_UNTIL_LS_KEY, String(apiBackupDeadUntil));
  } catch {
    // ignore
  }
}

function isBackupSuppressed(): boolean {
  return nowMs() < apiBackupDeadUntil;
}

function clearBackupSuppression(): void {
  if (apiBackupDeadUntil === 0) return;
  apiBackupDeadUntil = 0;
  saveApiBackupDeadUntil();
}

function markBackupDead(): void {
  apiBackupDeadUntil = nowMs() + API_BACKUP_COOLDOWN_MS;
  saveApiBackupDeadUntil();

  // never “stick” to fallback if it’s failing
  const primary = selectPrimaryBase(LIVE_BASE_URL, LIVE_BACKUP_URL);
  const fallback = primary === LIVE_BASE_URL ? LIVE_BACKUP_URL : LIVE_BASE_URL;
  if (apiBaseHint === fallback) {
    apiBaseHint = primary;
    saveApiBaseHint();
  }
}

function shouldTrySameOriginProxy(origin: string): boolean {
  if (!origin || origin === "null") return false;

  // Local dev always uses proxy base "".
  if (isLocalDevOrigin(origin)) return true;

  // If you're hosted on API domains, don't proxy (just use same-origin).
  if (isApiDomainOrigin(origin)) return false;

  // In prod on a non-API domain (phi.network, etc.), try proxy first.
  return true;
}

function selectPrimaryBase(primary: string, backup: string): string {
  if (!hasWindow) return primary;
  const origin = window.location.origin;

  // LOCAL DEV: always use relative base (Vite proxy).
  if (isLocalDevOrigin(origin)) return DEV_API_BASE;

  // If hosted on API domains, allow same-origin.
  if (origin === primary || origin === backup) return origin;

  return primary;
}

const API_BASE_PRIMARY = selectPrimaryBase(LIVE_BASE_URL, LIVE_BACKUP_URL);
const API_BASE_FALLBACK = API_BASE_PRIMARY === LIVE_BASE_URL ? LIVE_BACKUP_URL : LIVE_BASE_URL;

export function loadApiBaseHint(): void {
  if (!canStorage) return;

  // Local dev: proxy only
  if (hasWindow && isLocalDevOrigin(window.location.origin)) {
    apiBaseHint = DEV_API_BASE;
    return;
  }

  try {
    const raw = localStorage.getItem(API_BASE_HINT_LS_KEY);
    if (raw === API_BASE_PRIMARY) {
      apiBaseHint = raw;
      return;
    }
    if (raw === API_BASE_FALLBACK) {
      apiBaseHint = isBackupSuppressed() ? API_BASE_PRIMARY : raw;
      return;
    }
  } catch {
    // ignore
  }

  apiBaseHint = API_BASE_PRIMARY;
}

function saveApiBaseHint(): void {
  if (!canStorage) return;
  try {
    // only persist hints for real remote bases (not proxy "")
    if (apiBaseHint === API_BASE_PRIMARY || apiBaseHint === API_BASE_FALLBACK) {
      localStorage.setItem(API_BASE_HINT_LS_KEY, apiBaseHint);
    }
  } catch {
    // ignore
  }
}

function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  loadApiBackupDeadUntil();
  loadApiDeadMap();
  loadApiBaseHint();
}

function apiBases(): string[] {
  ensureHydrated();

  // LOCAL DEV: single base via Vite proxy.
  if (hasWindow && isLocalDevOrigin(window.location.origin)) {
    return [DEV_API_BASE];
  }

  // SSR: just attempt primary then fallback (proxy doesn’t exist server-side).
  if (!hasWindow) {
    const list = isBackupSuppressed()
      ? [API_BASE_PRIMARY].filter((b) => !isBaseSuppressed(b))
      : [API_BASE_PRIMARY, API_BASE_FALLBACK].filter((b) => !isBaseSuppressed(b));
    return list.length ? list : [API_BASE_PRIMARY];
  }

  const pageOrigin = window.location.origin;

  // If app is hosted on API domains, use same-origin only.
  if (isApiDomainOrigin(pageOrigin)) {
    return [pageOrigin];
  }

  const bases: string[] = [];

  // ✅ Always try same-origin proxy first for non-API origins.
  if (shouldTrySameOriginProxy(pageOrigin)) {
    bases.push(PROXY_API_BASE);
  }

  const wantFallbackFirst = apiBaseHint === API_BASE_FALLBACK && !isBackupSuppressed();
  const ordered = wantFallbackFirst
    ? [API_BASE_FALLBACK, API_BASE_PRIMARY]
    : [API_BASE_PRIMARY, API_BASE_FALLBACK];

  const protocolFiltered = isHttpsPage()
    ? ordered.filter((b) => b.startsWith("https://"))
    : ordered;

  const filteredByBackup = isBackupSuppressed()
    ? protocolFiltered.filter((b) => b !== API_BASE_FALLBACK)
    : protocolFiltered;

  const filteredByDead = filteredByBackup.filter((b) => !isBaseSuppressed(b));

  // If both remotes are suppressed/dead, we’ll rely on proxy only.
  for (const b of filteredByDead) bases.push(b);

  return bases;
}

function shouldFailoverStatus(status: number): boolean {
  // 0 = network/CORS/unknown (caller uses 0 in wrappers)
  if (status === 0) return true;

  // common “route didn’t exist here but exists on the other base”
  if (status === 404) return true;

  // request too large / gateway / transient / throttling / upstream
  if (status === 408 || status === 413 || status === 429) return true;
  if (status >= 500) return true;

  return false;
}

function joinUrl(base: string, path: string): string {
  // base "" means relative; ensure we don't generate "//sigils/..."
  if (!base) return path;
  return `${base}${path}`;
}

export async function apiFetchWithFailover(
  makeUrl: (base: string) => string,
  init?: RequestInit,
): Promise<Response | null> {
  const bases = apiBases();
  let last: Response | null = null;

  for (const base of bases) {
    const url = makeUrl(base);
    try {
      const res = await fetch(url, init);
      last = res;

      // 304 is a valid success for seal checks.
      if (res.ok || res.status === 304) {
        // if backup works again, clear suppression
        if (base === API_BASE_FALLBACK) clearBackupSuppression();

        // if a remote base works again, clear suppression
        if (base === API_BASE_PRIMARY || base === API_BASE_FALLBACK) clearBaseSuppression(base);

        // only persist hints for real remote bases
        if (base === API_BASE_PRIMARY || base === API_BASE_FALLBACK) {
          apiBaseHint = base;
          saveApiBaseHint();
        }

        return res;
      }

      // Suppress backup if it's failing.
      if (base === API_BASE_FALLBACK && shouldFailoverStatus(res.status)) markBackupDead();

      // If proxy is returning failover-ish statuses (404/413/etc), just try remotes next.
      // If remotes are returning failover-ish statuses, we’ll try others, but also
      // treat repeated failure as "dead" if it keeps happening.
      if ((base === API_BASE_PRIMARY || base === API_BASE_FALLBACK) && shouldFailoverStatus(res.status)) {
        // For persistent 4xx/5xx, short cooldown helps reduce spam.
        // (We don't mark dead on every 404 because that could be real routing mismatch,
        // but it still helps on iOS when the endpoint is simply not reachable.)
        if (res.status === 0 || res.status >= 500 || res.status === 404) {
          markBaseDead(base);
        }
      }

      // If this status is “final”, stop here; otherwise try the other base.
      if (!shouldFailoverStatus(res.status)) return res;
    } catch {
      // network/CORS failure → mark remote dead (cooldown) so we stop spamming.
      if (base === API_BASE_PRIMARY || base === API_BASE_FALLBACK) {
        markBaseDead(base);
        if (base === API_BASE_FALLBACK) markBackupDead();
      }
      continue;
    }
  }

  return last;
}

export async function apiFetchJsonWithFailover<T>(
  makeUrl: (base: string) => string,
  init?: RequestInit,
): Promise<{ ok: true; value: T; status: number } | { ok: false; status: number }> {
  const method = init?.method ?? "GET";
  const keyUrl = makeUrl(apiBases()[0] ?? "");
  const seedKey = cacheKeyForRequest(method, keyUrl);
  const seeded = getSeeded<T>(seedKey);
  if (seeded !== undefined) {
    return { ok: true, value: seeded, status: 200 };
  }

  const res = await apiFetchWithFailover(makeUrl, init);
  if (!res) return { ok: false, status: 0 };
  if (!res.ok) return { ok: false, status: res.status };
  try {
    const value = (await res.json()) as T;
    return { ok: true, value, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * Convenience URL builders (optional helpers you can use elsewhere)
 * ─────────────────────────────────────────────────────────────────── */
export function urlSeal(base: string): string {
  return joinUrl(base, API_SEAL_PATH);
}
export function urlUrls(base: string): string {
  return joinUrl(base, API_URLS_PATH);
}
export function urlInhale(base: string): string {
  return joinUrl(base, API_INHALE_PATH);
}
