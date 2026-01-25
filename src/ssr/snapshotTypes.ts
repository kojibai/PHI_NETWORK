export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SnapshotEntry<T extends JsonValue = JsonValue> = {
  value: T;
  ttlMs: number;
};

export type SnapshotMeta = {
  etag?: string;
  cacheTags?: string[];
};

export type SsrSnapshotV1 = {
  version: "v1";
  url: string;
  createdAtMs: number;
  data: Record<string, SnapshotEntry>;
  meta?: SnapshotMeta;
};

export type SsrSnapshot = SsrSnapshotV1;
