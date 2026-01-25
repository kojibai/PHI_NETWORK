import type { JsonValue } from "./snapshotTypes";

type StableJson = JsonValue;

function toStableJson(value: unknown): StableJson {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => toStableJson(item)) as StableJson;
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return value as StableJson;
  }
  if (valueType === "bigint") return value.toString();
  if (valueType === "undefined" || valueType === "function" || valueType === "symbol") return null;
  if (valueType === "object") {
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

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJson(value));
}

export function safeJsonStringify(value: unknown): string {
  return stableJsonStringify(value).replace(/</g, "\\u003c");
}
