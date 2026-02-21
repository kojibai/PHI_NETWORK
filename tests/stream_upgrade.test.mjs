import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-stream-upgrade-"));
const moduleCache = new Map();

const IMPORT_FROM_RE = /from\s+["']([^"']+)["']/g;
const IMPORT_CALL_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(spec, baseFile) {
  if (!spec.startsWith(".")) return null;
  const baseDir = dirname(baseFile);
  const candidates = [spec, `${spec}.ts`, `${spec}.tsx`, `${spec}.js`, `${spec}.jsx`];
  for (const candidate of candidates) {
    const full = resolve(baseDir, candidate);
    if (existsSync(full) && lstatSync(full).isFile()) return full;
  }
  return null;
}

function gatherImports(source) {
  const specs = new Set();
  for (const match of source.matchAll(IMPORT_FROM_RE)) specs.add(match[1]);
  for (const match of source.matchAll(IMPORT_CALL_RE)) specs.add(match[1]);
  return [...specs];
}

function rewriteImports(code, replacements) {
  let out = code;
  for (const [spec, replacement] of replacements) {
    out = out.replaceAll(`"${spec}"`, `"${replacement}"`);
    out = out.replaceAll(`'${spec}'`, `'${replacement}'`);
  }
  return out;
}

function transpileRecursive(fileUrl) {
  const filePath = fileURLToPath(fileUrl);
  if (moduleCache.has(filePath)) return moduleCache.get(filePath);
  moduleCache.set(filePath, filePath);

  const source = readFileSync(filePath, "utf8");
  const imports = gatherImports(source);
  const replacements = new Map();

  for (const spec of imports) {
    const resolved = resolveImport(spec, filePath);
    if (!resolved) continue;
    const depUrl = pathToFileURL(resolved).href;
    const compiledPath = transpileRecursive(depUrl);
    replacements.set(spec, pathToFileURL(compiledPath).href);
  }

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const rewritten = rewriteImports(transpiled, replacements);
  const tempFile = join(
    tempRoot,
    `${basename(filePath).replace(/\W+/g, "_")}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`,
  );
  writeFileSync(tempFile, rewritten, "utf8");
  moduleCache.set(filePath, tempFile);
  return tempFile;
}

process.on("exit", () => {
  rmSync(tempRoot, { recursive: true, force: true });
});

const streamStorePath = new URL("../src/lib/stream/streamStore.ts", import.meta.url);
const streamSyncPath = new URL("../src/lib/stream/streamSync.ts", import.meta.url);
const streamListPath = new URL("../src/pages/sigilstream/list/virtualWindow.ts", import.meta.url);

const streamStore = await import(pathToFileURL(transpileRecursive(streamStorePath.href)).href);
const streamSync = await import(pathToFileURL(transpileRecursive(streamSyncPath.href)).href);
const streamList = await import(pathToFileURL(transpileRecursive(streamListPath.href)).href);

test("delta apply correctness updates and deletes records", () => {
  const start = new Map([
    [
      "tokA",
      {
        token: "tokA",
        url: "https://x/p/tokA",
        title: "old",
        author: "@a",
        pulse: 10,
        kind: "text",
        shortBody: "old",
        links: [],
        updatedAt: 1,
      },
    ],
  ]);

  const next = streamStore.applyDeltaRowsToRecords(start, {
    rows: [
      { token: "tokA", url: "https://x/p/tokA", preview: { title: "new", pulse: 22 } },
      { token: "tokB", url: "https://x/p/tokB", preview: { title: "insert", pulse: 30 } },
      { token: "tokA", url: "https://x/p/tokA", deleted: true },
    ],
  });

  assert.equal(next.has("tokA"), false);
  assert.equal(next.get("tokB")?.title, "insert");
  assert.equal(next.get("tokB")?.pulse, 30);
});

test("offline-first sync path uses snapshot for empty local seal", () => {
  assert.equal(streamSync.buildSyncUrl(null, 200), "/api/stream/snapshot?compact=1");
  assert.equal(streamSync.buildSyncUrl("abc", 200), "/api/stream/delta?after=abc&limit=200");
});

test("worker fallback control flag can be toggled", () => {
  streamStore.setStreamWorkerFailedForTests(false);
  streamStore.setStreamWorkerFailedForTests(true);
  streamStore.setStreamWorkerFailedForTests(false);
  assert.equal(typeof streamStore.setStreamWorkerFailedForTests, "function");
});

test("virtual list windowing computes bounded start/end", () => {
  const nearTop = streamList.computeVirtualWindow(0, 900, 100);
  assert.equal(nearTop.start, 0);
  assert.ok(nearTop.end > 0);

  const mid = streamList.computeVirtualWindow(2400, 900, 100);
  assert.ok(mid.start > 0);
  assert.ok(mid.end <= 100);
  assert.ok(mid.end > mid.start);
});
