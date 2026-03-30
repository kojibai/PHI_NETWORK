import { streamStore, type StreamDelta } from "./streamStore";

export type StreamHead = { seal: string; latestPulse: number; total: number; sourceDigest?: string };

export function buildSyncUrl(localSeal: string | null, limit: number, cursor: string | null = null): string {
  const encodedLimit = encodeURIComponent(String(limit));
  const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return localSeal
    ? `/api/stream/delta?after=${encodeURIComponent(localSeal)}&limit=${encodedLimit}${cursorPart}`
    : `/api/stream/snapshot?compact=1&limit=${encodedLimit}${cursorPart}`;
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

  let [localSeal, localSourceDigest] = await Promise.all([streamStore.getSeal(), streamStore.getSourceDigest()]);

  const sourceDigestChanged =
    Boolean(head.sourceDigest) && Boolean(localSourceDigest) && head.sourceDigest !== localSourceDigest;

  if (!sourceDigestChanged && localSeal && localSeal === head.seal) return 0;

  if (sourceDigestChanged) localSeal = null;

  let totalChanged = 0;
  let cursor: string | null = null;

  for (let page = 0; page < 40; page += 1) {
    const url = buildSyncUrl(localSeal, limit, cursor);
    const delta = await fetchJson<StreamDelta & { nextCursor?: string | null }>(url);
    if (!delta) return totalChanged;

    if (!delta.rows.length) {
      if (delta.latestSeal && delta.latestSeal !== localSeal) {
        await streamStore.applyDelta({
          rows: [],
          seal: delta.latestSeal,
          latestSeal: delta.latestSeal,
          sourceDigest: head.sourceDigest,
        });
      }
      break;
    }

    await streamStore.applyDelta({ ...delta, sourceDigest: head.sourceDigest });
    totalChanged += delta.rows.length;
    localSeal = delta.seal ?? localSeal;
    cursor = delta.nextCursor ?? null;

    if (!cursor && delta.latestSeal && delta.seal === delta.latestSeal) break;
  }

  return totalChanged;
}
