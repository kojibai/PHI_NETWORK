// src/components/SigilExplorer/apiClient.ts
"use client";

import { getInternalSigilApi, markInternalSigilApiEnabled } from "../../utils/lahmahtorClient";

export type ApiSealResponse = {
  seal: string;
  pulse?: number;
  latestPulse?: number;
  latest_pulse?: number;
  total?: number;
};

const hasWindow = typeof window !== "undefined";

/* ─────────────────────────────────────────────────────────────────────
 *  LAH-MAH-TOR API (Internal, offline)
 *  ─────────────────────────────────────────────────────────────────── */
export const LIVE_BASE_URL = "https://m.phi.network";
export const LIVE_BACKUP_URL = "https://memory.kaiklok.com";

export const API_SEAL_PATH = "/sigils/seal";
export const API_URLS_PATH = "/sigils/urls";
export const API_INHALE_PATH = "/sigils/inhale";

export function loadApiBackupDeadUntil(): void {
  // no-op: offline internal API
  markInternalSigilApiEnabled();
}

export function loadApiBaseHint(): void {
  // no-op: offline internal API
  markInternalSigilApiEnabled();
}

function apiBaseOrigin(): string {
  if (!hasWindow) return "https://example.invalid";
  return window.location.origin;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseBooleanParam(value: string | null, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const t = value.trim().toLowerCase();
  if (!t) return defaultValue;
  if (["0", "false", "no", "off"].includes(t)) return false;
  if (["1", "true", "yes", "on"].includes(t)) return true;
  return defaultValue;
}

type FormDataEntry = [string, FormDataEntryValue];

function isFileLike(value: FormDataEntryValue): value is File {
  if (typeof value === "string") return false;
  return "name" in value;
}

async function formDataToFiles(body: FormData): Promise<File[]> {
  const files: File[] = [];
  for (const [, value] of body.entries() as Iterable<FormDataEntry>) {
    if (typeof value === "string") continue;

    if (isFileLike(value)) {
      files.push(value);
      continue;
    }

    const blob = value as Blob;
    const name = "sigils.json";
    files.push(new File([blob], name, { type: blob.type || "application/json" }));
  }
  return files;
}

async function handleInternalRequest(urlString: string, init?: RequestInit): Promise<Response> {
  const api = getInternalSigilApi();
  const method = (init?.method || "GET").toUpperCase();
  const url = new URL(urlString, apiBaseOrigin());

  if (url.pathname === API_SEAL_PATH && method === "GET") {
    const state = api.state();
    const body: ApiSealResponse = {
      seal: state.state_seal,
      latest_pulse: state.latest.pulse,
      latestPulse: state.latest.pulse,
      pulse: state.latest.pulse,
      total: state.total_urls,
    };
    return jsonResponse(body);
  }

  if (url.pathname === API_URLS_PATH && method === "GET") {
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const limit = Number(url.searchParams.get("limit") ?? "10000");
    const page = api.urls(offset, limit);
    return jsonResponse(page);
  }

  if (url.pathname === API_INHALE_PATH && method === "POST") {
    if (!init?.body || !(init.body instanceof FormData)) {
      return jsonResponse({ status: "error", errors: ["Missing FormData body"] }, 400);
    }
    const files = await formDataToFiles(init.body);
    const includeState = parseBooleanParam(url.searchParams.get("include_state"), true);
    const includeUrls = parseBooleanParam(url.searchParams.get("include_urls"), true);
    const maxBytesRaw = url.searchParams.get("max_bytes_per_file");
    const maxBytesPerFile = maxBytesRaw ? Number(maxBytesRaw) : undefined;

    const inhaleRes = await api.inhale({
      files,
      includeState,
      includeUrls,
      maxBytesPerFile,
    });
    return jsonResponse(inhaleRes);
  }

  return jsonResponse({ status: "error", error: "Not found" }, 404);
}

export async function apiFetchWithFailover(
  makeUrl: (base: string) => string,
  init?: RequestInit,
): Promise<Response | null> {
  markInternalSigilApiEnabled();
  const url = makeUrl(apiBaseOrigin());
  return handleInternalRequest(url, init);
}

export async function apiFetchJsonWithFailover<T>(
  makeUrl: (base: string) => string,
  init?: RequestInit,
): Promise<{ ok: true; value: T; status: number } | { ok: false; status: number }> {
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
