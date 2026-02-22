import { decodeFeedPayload, extractPayloadTokenFromUrlString, type FeedPostPayload } from "../../utils/feedPayload";

export type StreamPreview = {
  token: string;
  url: string;
  title: string;
  author: string;
  pulse: number;
  kind: string;
  shortBody: string;
  links: string[];
  updatedAt: number;
};

type StreamRecord = StreamPreview & {
  parentToken?: string;
  payload?: FeedPostPayload;
};

export type StreamDeltaRow = {
  token: string;
  url: string;
  pulse?: number;
  payload?: FeedPostPayload;
  preview?: Partial<StreamPreview>;
  deleted?: boolean;
};

export type StreamDelta = { seal?: string; latestSeal?: string; sourceDigest?: string; rows: StreamDeltaRow[] };
export type StreamFeedPage = { rows: StreamPreview[]; nextCursor: string | null };

const DB_NAME = "kai-stream-v1";
const DB_VERSION = 1;
const STORE_ITEMS = "items";
const STORE_META = "meta";

function shortBody(payload: FeedPostPayload): string {
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

function parseLinks(payload: FeedPostPayload): string[] {
  const links = new Set<string>();
  for (const item of payload.attachments?.items ?? []) {
    if (item.kind === "url" && item.url) links.add(item.url);
    if (item.kind === "file-ref" && item.url) links.add(item.url);
  }
  if (payload.url) links.add(payload.url);
  return [...links].slice(0, 6);
}

function previewFromPayload(token: string, url: string, payload: FeedPostPayload): StreamPreview {
  return {
    token,
    url,
    title: payload.caption?.slice(0, 72) || payload.body?.kind || "memory",
    author: payload.author || "@unknown",
    pulse: Number(payload.pulse) || 0,
    kind: payload.body?.kind || (payload.seal ? "sealed" : "text"),
    shortBody: shortBody(payload),
    links: parseLinks(payload),
    updatedAt: Date.now(),
  };
}

function decodeFromUrl(url: string): { token: string; payload: FeedPostPayload; preview: StreamPreview } | null {
  const token = extractPayloadTokenFromUrlString(url);
  if (!token) return null;
  const payload = decodeFeedPayload(token);
  if (!payload) return null;
  return { token, payload, preview: previewFromPayload(token, url, payload) };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const s = db.createObjectStore(STORE_ITEMS, { keyPath: "token" });
        s.createIndex("pulse", "pulse");
        s.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "k" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(): Promise<StreamRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, "readonly");
    const req = tx.objectStore(STORE_ITEMS).getAll();
    req.onsuccess = () => resolve((req.result as StreamRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutMany(rows: StreamRecord[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_ITEMS], "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDeleteMany(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_ITEMS], "readwrite");
    const store = tx.objectStore(STORE_ITEMS);
    for (const token of tokens) store.delete(token);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetMeta<T>(k: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).get(k);
    req.onsuccess = () => resolve((req.result?.v as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSetMeta(k: string, v: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ k, v });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const mem = new Map<string, StreamRecord>();
let workerFailed = false;

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

export function setStreamWorkerFailedForTests(value: boolean): void {
  workerFailed = value;
}

export function applyDeltaRowsToRecords(existing: Map<string, StreamRecord>, delta: StreamDelta): Map<string, StreamRecord> {
  const next = new Map(existing);
  for (const row of delta.rows) {
    if (row.deleted) {
      next.delete(row.token);
      continue;
    }
    const base = row.payload
      ? previewFromPayload(row.token, row.url, row.payload)
      : next.get(row.token) ?? {
          token: row.token,
          url: row.url,
          title: "memory",
          author: "@unknown",
          pulse: row.pulse ?? 0,
          kind: "text",
          shortBody: "",
          links: [],
          updatedAt: Date.now(),
        };
    const merged = { ...base, ...row.preview, url: row.url, token: row.token, updatedAt: Date.now() };
    next.set(row.token, {
      ...merged,
      payload: row.payload,
      parentToken: row.payload?.parentUrl ? extractPayloadTokenFromUrlString(row.payload.parentUrl) ?? undefined : undefined,
    });
  }
  return next;
}

async function decodeBatch(urls: string[]): Promise<StreamRecord[]> {
  if (typeof window === "undefined") return [];
  if (workerFailed || typeof Worker === "undefined") {
    return urls.map(decodeFromUrl).filter(notNull).map((r) => ({ ...r.preview, payload: r.payload, parentToken: r.payload.parentUrl ? extractPayloadTokenFromUrlString(r.payload.parentUrl) ?? undefined : undefined }));
  }

  try {
    const worker = new Worker(new URL("../../workers/streamWorker.ts", import.meta.url), { type: "module" });
    const rows = await new Promise<StreamRecord[]>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("stream worker timeout")), 2500);
      worker.onmessage = (evt: MessageEvent<StreamRecord[]>) => {
        window.clearTimeout(timer);
        resolve(evt.data);
      };
      worker.onerror = (err) => {
        window.clearTimeout(timer);
        reject(err);
      };
      worker.postMessage(urls);
    });
    worker.terminate();
    return rows;
  } catch {
    workerFailed = true;
    return urls.map(decodeFromUrl).filter(notNull).map((r) => ({ ...r.preview, payload: r.payload, parentToken: r.payload.parentUrl ? extractPayloadTokenFromUrlString(r.payload.parentUrl) ?? undefined : undefined }));
  }
}

export const streamStore = {
  async ingestUrls(urls: string[]): Promise<void> {
    const rows = await decodeBatch(urls);
    for (const row of rows) mem.set(row.token, row);
    await idbPutMany(rows);
  },

  async getFeedPage(cursor: string | null, limit: number): Promise<StreamFeedPage> {
    const all = (await idbGetAll()).sort((a, b) => (b.pulse - a.pulse) || (b.updatedAt - a.updatedAt));
    const offset = Number(cursor || 0);
    const rows = all.slice(offset, offset + limit).map(({ payload: _p, parentToken: _t, ...preview }) => preview);
    return { rows, nextCursor: offset + limit < all.length ? String(offset + limit) : null };
  },

  async getThread(token: string, depth: number): Promise<StreamPreview[]> {
    const all = await idbGetAll();
    const byToken = new Map(all.map((r) => [r.token, r]));
    const out: StreamPreview[] = [];
    const seen = new Set<string>();
    const walk = (t: string, d: number) => {
      if (d < 0 || seen.has(t)) return;
      seen.add(t);
      const row = byToken.get(t);
      if (!row) return;
      const { payload: _p, parentToken: _pt, ...preview } = row;
      out.push(preview);
      if (row.parentToken) walk(row.parentToken, d - 1);
      for (const child of all) {
        if (child.parentToken === t) walk(child.token, d - 1);
      }
    };
    walk(token, depth);
    return out.sort((a, b) => a.pulse - b.pulse);
  },

  async applyDelta(delta: StreamDelta): Promise<void> {
    const persisted = await idbGetAll();
    const baseline = new Map(persisted.map((row) => [row.token, row]));
    for (const [token, row] of mem.entries()) {
      baseline.set(token, row);
    }

    const next = applyDeltaRowsToRecords(baseline, delta);
    const upserts: StreamRecord[] = [];
    const deletes: string[] = [];

    for (const [token, record] of next.entries()) {
      upserts.push(record);
      mem.set(token, record);
    }

    for (const token of baseline.keys()) {
      if (!next.has(token)) {
        mem.delete(token);
        deletes.push(token);
      }
    }

    await idbPutMany(upserts);
    await idbDeleteMany(deletes);
    if (delta.seal) await idbSetMeta("seal", delta.seal);
    if (delta.sourceDigest) await idbSetMeta("sourceDigest", delta.sourceDigest);
  },

  async getPreview(urlOrToken: string): Promise<StreamPreview | null> {
    const token = extractPayloadTokenFromUrlString(urlOrToken) ?? urlOrToken;
    const inMem = mem.get(token);
    if (inMem) {
      const { payload: _p, parentToken: _pt, ...preview } = inMem;
      return preview;
    }
    const rows = await idbGetAll();
    const row = rows.find((r) => r.token === token);
    if (!row) return null;
    const { payload: _p, parentToken: _pt, ...preview } = row;
    return preview;
  },

  async prefetchAround(token: string): Promise<void> {
    const thread = await this.getThread(token, 2);
    const urls = thread.map((t) => t.url);
    await this.ingestUrls(urls);
  },

  async getSeal(): Promise<string | null> {
    return idbGetMeta<string>("seal");
  },

  async getSourceDigest(): Promise<string | null> {
    return idbGetMeta<string>("sourceDigest");
  },
};
