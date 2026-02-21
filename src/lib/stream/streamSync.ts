import { streamStore, type StreamDelta } from "./streamStore";

export type StreamHead = { seal: string; latestPulse: number; total: number };

export function buildSyncUrl(localSeal: string | null, limit: number): string {
  return localSeal
    ? `/api/stream/delta?after=${encodeURIComponent(localSeal)}&limit=${encodeURIComponent(String(limit))}`
    : "/api/stream/snapshot?compact=1";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function syncStreamDelta(limit = 200): Promise<number> {
  const localSeal = await streamStore.getSeal();
  const head = await fetchJson<StreamHead>("/api/stream/head");
  if (!head) return 0;
  if (localSeal && localSeal === head.seal) return 0;
  const url = buildSyncUrl(localSeal, limit);
  const delta = await fetchJson<StreamDelta>(url);
  if (!delta) return 0;
  await streamStore.applyDelta({ ...delta, seal: head.seal });
  return delta.rows.length;
}
