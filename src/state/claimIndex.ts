// src/state/claimIndex.ts
"use client";

export type NoteId = string;
export type ClaimStatus = "claimed";

export interface ClaimRecord {
  noteId: NoteId;
  claimedAtMs: number;
  claimedAtPulse?: string;
  claimedByPhiKey?: string;
  txHash?: string;
  schemaVersion: 1;
}

const DB_NAME = "phi-claim-index-v1";
const DB_VERSION = 1;
const STORE_NAME = "claims";
const LS_KEY = "phi.claimIndex.v1";
const NOTE_ID_SEPARATOR = "::";

const hasWindow = typeof window !== "undefined";
const hasIndexedDb = hasWindow && typeof indexedDB !== "undefined";
const hasLocalStorage = hasWindow && typeof window.localStorage !== "undefined";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "noteId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeClaimRecord(raw: unknown): ClaimRecord | null {
  if (!isRecord(raw)) return null;
  const noteId = typeof raw.noteId === "string" ? raw.noteId.trim() : "";
  if (!noteId) return null;
  const claimedAtMs = typeof raw.claimedAtMs === "number" ? raw.claimedAtMs : Number(raw.claimedAtMs);
  if (!Number.isFinite(claimedAtMs) || claimedAtMs <= 0) return null;
  const claimedAtPulse = typeof raw.claimedAtPulse === "string" ? raw.claimedAtPulse.trim() : undefined;
  const claimedByPhiKey = typeof raw.claimedByPhiKey === "string" ? raw.claimedByPhiKey.trim() : undefined;
  const txHash = typeof raw.txHash === "string" ? raw.txHash.trim() : undefined;
  return {
    noteId,
    claimedAtMs,
    claimedAtPulse: claimedAtPulse || undefined,
    claimedByPhiKey: claimedByPhiKey || undefined,
    txHash: txHash || undefined,
    schemaVersion: 1,
  };
}

function mergeClaimRecords(existing: ClaimRecord | null, incoming: ClaimRecord): ClaimRecord {
  if (!existing) return incoming;
  const claimedAtMs = Math.min(existing.claimedAtMs, incoming.claimedAtMs);
  return {
    noteId: existing.noteId,
    claimedAtMs: Number.isFinite(claimedAtMs) ? claimedAtMs : existing.claimedAtMs,
    claimedAtPulse: existing.claimedAtPulse || incoming.claimedAtPulse,
    claimedByPhiKey: existing.claimedByPhiKey || incoming.claimedByPhiKey,
    txHash: existing.txHash || incoming.txHash,
    schemaVersion: 1,
  };
}

function readLocalStorageMap(): Record<string, ClaimRecord> {
  if (!hasLocalStorage) return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    const out: Record<string, ClaimRecord> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const rec = normalizeClaimRecord({ ...(value as Record<string, unknown>), noteId: key });
      if (rec) out[rec.noteId] = rec;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalStorageMap(map: Record<string, ClaimRecord>): void {
  if (!hasLocalStorage) return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function upsertLocalStorage(record: ClaimRecord): void {
  const map = readLocalStorageMap();
  const existing = map[record.noteId] ?? null;
  map[record.noteId] = mergeClaimRecords(existing, record);
  writeLocalStorageMap(map);
}

async function getClaimFromIndexedDb(noteId: NoteId): Promise<ClaimRecord | null> {
  if (!hasIndexedDb) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const result = await requestToPromise(store.get(noteId));
    await transactionDone(tx);
    return normalizeClaimRecord(result);
  } catch {
    return null;
  }
}

async function listClaimsFromIndexedDb(): Promise<ClaimRecord[]> {
  if (!hasIndexedDb) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const result = await requestToPromise(store.getAll());
    await transactionDone(tx);
    if (!Array.isArray(result)) return [];
    return result.map(normalizeClaimRecord).filter((rec): rec is ClaimRecord => Boolean(rec));
  } catch {
    return [];
  }
}

async function writeClaimToIndexedDb(record: ClaimRecord): Promise<void> {
  if (!hasIndexedDb) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    await transactionDone(tx);
  } catch {
    // ignore IDB failures
  }
}

export function buildNoteId(parentCanonical: string, transferNonce: string): NoteId {
  const parent = parentCanonical.trim().toLowerCase();
  const nonce = transferNonce.trim();
  return `${parent}${NOTE_ID_SEPARATOR}${nonce}`;
}

export function parseNoteId(noteId: NoteId): { parentCanonical: string; transferNonce: string } | null {
  const raw = noteId.trim();
  if (!raw) return null;
  const idx = raw.indexOf(NOTE_ID_SEPARATOR);
  if (idx <= 0) return null;
  const parentCanonical = raw.slice(0, idx);
  const transferNonce = raw.slice(idx + NOTE_ID_SEPARATOR.length);
  if (!parentCanonical || !transferNonce) return null;
  return { parentCanonical, transferNonce };
}

export async function getClaim(noteId: NoteId): Promise<ClaimRecord | null> {
  if (!hasWindow) return null;
  const fromIdb = await getClaimFromIndexedDb(noteId);
  if (fromIdb) return fromIdb;
  const fromLs = readLocalStorageMap()[noteId] ?? null;
  return fromLs ?? null;
}

export async function hasClaim(noteId: NoteId): Promise<boolean> {
  const record = await getClaim(noteId);
  return Boolean(record);
}

export async function setClaim(record: ClaimRecord): Promise<void> {
  if (!hasWindow) return;
  const normalized = normalizeClaimRecord(record);
  if (!normalized) return;
  const existing = await getClaim(normalized.noteId);
  const merged = mergeClaimRecords(existing, normalized);
  await writeClaimToIndexedDb(merged);
  upsertLocalStorage(merged);
}

export async function mergeClaims(records: ClaimRecord[]): Promise<void> {
  for (const record of records) {
    await setClaim(record);
  }
}

export async function listClaims(): Promise<ClaimRecord[]> {
  if (!hasWindow) return [];
  const idbClaims = await listClaimsFromIndexedDb();
  if (idbClaims.length > 0) return idbClaims;
  return Object.values(readLocalStorageMap());
}
