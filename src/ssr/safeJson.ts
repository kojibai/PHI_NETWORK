import type { JsonValue } from "./snapshotTypes";

type StableJson = JsonValue;

function toStableJson(value: unknown): StableJson {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => toStableJson(item)) as StableJson;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value as StableJson;
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return null;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const out: Record<string, StableJson> = {};
    for (const key of keys) {
      const next = record[key];
      if (typeof next === "undefined" || typeof next === "function" || typeof next === "symbol") continue;
      out[key] = toStableJson(next);
    }
    return out;
  }
  return null;
}

export function toJsonValue(value: unknown): JsonValue {
  return toStableJson(value);
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJson(value));
}

export function safeJsonStringify(value: unknown): string {
  return stableJsonStringify(value).replace(/</g, "\\u003c");
}
