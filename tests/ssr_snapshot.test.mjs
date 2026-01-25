import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

async function loadTsModule(tsPath) {
  const source = readFileSync(tsPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  }).outputText;
  const dataUrl = `data:text/javascript,${encodeURIComponent(transpiled)}`;
  return import(dataUrl);
}

const safeJsonPath = new URL("../src/ssr/safeJson.ts", import.meta.url);
const cachePath = new URL("../src/ssr/cache.ts", import.meta.url);
const snapshotClientPath = new URL("../src/ssr/snapshotClient.ts", import.meta.url);

const { safeJsonStringify } = await loadTsModule(safeJsonPath);
const { LruTtlCache, cacheKeyForRequest } = await loadTsModule(cachePath);
const { parseSnapshot, seedFromSnapshot, getSeeded } = await loadTsModule(snapshotClientPath);

test("safeJsonStringify escapes <", () => {
  const json = safeJsonStringify({ html: "<script>alert('x')</script>" });
  assert.ok(json.includes("\\u003c"));
});

test("LruTtlCache expires entries", async () => {
  const cache = new LruTtlCache({ maxEntries: 2 });
  cache.set("key", "value", 10);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(cache.get("key"), undefined);
});

test("snapshot parse/seed returns seeded data", () => {
  const key = cacheKeyForRequest("GET", "/sigils/urls?offset=0&limit=1");
  const snapshot = {
    version: "v1",
    url: "/keystream",
    createdAtMs: Date.now(),
    data: {
      [key]: {
        value: { status: "ok", urls: ["https://example.com"] },
        ttlMs: 1000,
      },
    },
  };

  const parsed = parseSnapshot(JSON.stringify(snapshot));
  assert.equal(parsed?.url, "/keystream");

  seedFromSnapshot(parsed);
  const seeded = getSeeded(key);
  assert.deepEqual(seeded, { status: "ok", urls: ["https://example.com"] });
});
