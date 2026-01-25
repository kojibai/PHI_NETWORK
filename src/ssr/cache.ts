export type CacheEntry<V> = {
  value: V;
  expiresAtMs: number;
};

export type LruTtlCacheOptions = {
  maxEntries: number;
};

export class LruTtlCache<K, V> {
  private readonly maxEntries: number;
  private readonly store: Map<K, CacheEntry<V>>;

  constructor(options: LruTtlCacheOptions) {
    this.maxEntries = Math.max(1, options.maxEntries);
    this.store = new Map();
  }

  get(key: K): V | undefined {
    const entry = this.getEntry(key);
    return entry?.value;
  }

  getEntry(key: K): CacheEntry<V> | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs > 0 && entry.expiresAtMs <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(key: K, value: V, ttlMs: number): void {
    const expiresAtMs = ttlMs > 0 ? Date.now() + ttlMs : 0;
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAtMs });
    this.prune();
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAtMs > 0 && entry.expiresAtMs <= now) {
        this.store.delete(key);
      }
    }
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value as K | undefined;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }
}

function canonicalizeSearchParams(params: URLSearchParams): string {
  const entries = Array.from(params.entries());
  entries.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const next = new URLSearchParams();
  for (const [key, value] of entries) {
    next.append(key, value);
  }
  const search = next.toString();
  return search ? `?${search}` : "";
}

export function cacheKeyForRequest(method: string, url: string, bodyHash?: string): string {
  const normalizedMethod = method.toUpperCase();
  const parsed = new URL(url, "http://localhost");
  const search = canonicalizeSearchParams(parsed.searchParams);
  const path = `${parsed.pathname}${search}`;
  const suffix = bodyHash ? `:${bodyHash}` : "";
  return `${normalizedMethod} ${path}${suffix}`;
}
