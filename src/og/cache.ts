export type LruTtlCacheOptions = {
  maxEntries: number;
  ttlMs: number;
};

type CacheEntry<V> = {
  value: V;
  expiresAtMs: number;
};

export class LruTtlCache<K, V> {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly store = new Map<K, CacheEntry<V>>();

  constructor(options: LruTtlCacheOptions) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries));
    this.ttlMs = Math.max(0, Math.floor(options.ttlMs));
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    const now = Date.now();
    if (entry.expiresAtMs > 0 && entry.expiresAtMs <= now) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const ttl = ttlMs == null ? this.ttlMs : Math.max(0, Math.floor(ttlMs));
    const expiresAtMs = ttl > 0 ? Date.now() + ttl : 0;
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { value, expiresAtMs });
    while (this.store.size > this.maxEntries) {
      const firstKey = this.store.keys().next().value as K | undefined;
      if (firstKey === undefined) break;
      this.store.delete(firstKey);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
