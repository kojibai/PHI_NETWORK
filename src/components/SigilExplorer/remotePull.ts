// src/components/SigilExplorer/remotePull.ts
"use client";

import { apiFetchJsonWithFailover, API_URLS_PATH } from "./apiClient";
import { addUrl, persistRegistryToStorage, memoryRegistry } from "./registryStore";
import { canonicalizeUrl } from "./url";

const URLS_PAGE_LIMIT = 5000;
const URLS_MAX_PAGES_PER_SYNC = 24; // safety cap (5000*24 = 120k)

type ApiUrlsPageResponse = {
  status: "ok";
  state_seal: string;
  total: number;
  offset: number;
  limit: number;
  urls: string[];
};

function getOriginFallback(): string {
  if (typeof window !== "undefined" && typeof window.location?.origin === "string") {
    return window.location.origin;
  }
  // Only used in extreme edge cases (e.g., tests); file is "use client" so window should exist.
  return "http://localhost";
}

function normalizeBaseToAbsolute(base: string): string {
  const origin = getOriginFallback();
  const raw = typeof base === "string" ? base.trim() : "";

  // Empty / whitespace / obviously bad -> fallback to current origin
  if (!raw || /\s/.test(raw)) return origin;

  // If it already looks like an absolute URL (has a scheme), try to use it.
  // Examples: https://x.com, http://localhost:3000
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(raw);
  if (hasScheme) {
    try {
      // Validate it
      // eslint-disable-next-line no-new
      new URL(raw);
      return raw;
    } catch {
      return origin;
    }
  }

  // Protocol-relative: //api.example.com
  if (raw.startsWith("//")) {
    const candidate = `https:${raw}`;
    try {
      // eslint-disable-next-line no-new
      new URL(candidate);
      return candidate;
    } catch {
      return origin;
    }
  }

  // Looks like a path (/api) or relative (api) -> resolve against current origin
  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
    try {
      return new URL(raw, origin).toString();
    } catch {
      return origin;
    }
  }

  // Looks like a bare host (api.example.com or localhost:8000) -> add a scheme
  const isLocal =
    raw.startsWith("localhost") ||
    raw.startsWith("127.") ||
    raw.startsWith("0.0.0.0") ||
    raw.startsWith("[::1]");

  const withScheme = `${isLocal ? "http" : "https"}://${raw}`;
  try {
    // eslint-disable-next-line no-new
    new URL(withScheme);
    return withScheme;
  } catch {
    return origin;
  }
}

function buildUrlsPageUrl(base: string, offset: number, limit: number): string {
  const absBase = normalizeBaseToAbsolute(base);

  // This is the line that was throwing before when `base` was invalid.
  // Now `absBase` is always a valid absolute URL string.
  const url = new URL(API_URLS_PATH, absBase);

  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));

  return url.toString();
}

export async function pullAndImportRemoteUrls(
  signal: AbortSignal,
): Promise<{ imported: number; remoteSeal?: string; remoteTotal?: number; pulled: boolean }> {
  let imported = 0;
  let remoteSeal: string | undefined;
  let remoteTotal: number | undefined;
  let pulled = false;

  for (let page = 0; page < URLS_MAX_PAGES_PER_SYNC; page++) {
    if (signal.aborted) break;

    const offset = page * URLS_PAGE_LIMIT;

    const r = await apiFetchJsonWithFailover<ApiUrlsPageResponse>(
      (base) => buildUrlsPageUrl(base, offset, URLS_PAGE_LIMIT),
      { method: "GET", signal, cache: "no-store" },
    );

    if (!r.ok) break;

    pulled = true;
    remoteSeal = r.value.state_seal;
    remoteTotal = r.value.total;

    const urls = r.value.urls;
    if (!Array.isArray(urls) || urls.length === 0) break;

    for (const u of urls) {
      if (typeof u !== "string") continue;

      let abs: string;
      try {
        abs = canonicalizeUrl(u);
      } catch {
        continue;
      }

      if (memoryRegistry.has(abs)) continue;

      const changed = addUrl(abs, {
        includeAncestry: true,
        broadcast: false,
        persist: false,
        source: "remote",
        enqueueToApi: false,
      });

      if (changed) imported += 1;
    }

    if (urls.length < URLS_PAGE_LIMIT) break;
    if (remoteTotal != null && offset + urls.length >= remoteTotal) break;
  }

  if (imported > 0) persistRegistryToStorage();
  return { imported, remoteSeal, remoteTotal, pulled };
}
