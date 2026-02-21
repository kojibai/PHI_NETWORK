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
  const head = await fetchJson<StreamHead>("/api/stream/head");
  if (!head) return 0;

  let localSeal = await streamStore.getSeal();
  if (localSeal && localSeal === head.seal) return 0;

  let totalChanged = 0;
  for (let page = 0; page < 20; page += 1) {
    const url = buildSyncUrl(localSeal, limit);
    const delta = await fetchJson<StreamDelta>(url);
    if (!delta) return totalChanged;

    if (!delta.rows.length) {
      if (delta.latestSeal && delta.latestSeal !== localSeal) {
        await streamStore.applyDelta({ rows: [], seal: delta.latestSeal, latestSeal: delta.latestSeal });
      }
      break;
    }

    await streamStore.applyDelta(delta);
    totalChanged += delta.rows.length;
    localSeal = delta.seal ?? localSeal;

    if (delta.latestSeal && delta.seal === delta.latestSeal) break;
  }

  return totalChanged;
}
