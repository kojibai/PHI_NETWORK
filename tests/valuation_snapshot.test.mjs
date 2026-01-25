import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-valuation-snapshot-"));
const moduleCache = new Map();

const IMPORT_FROM_RE = /from\s+["']([^"']+)["']/g;
const IMPORT_CALL_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(spec, baseFile) {
  if (!spec.startsWith(".")) return null;
  const baseDir = dirname(baseFile);
  const candidates = [spec, `${spec}.ts`, `${spec}.tsx`, `${spec}.js`, `${spec}.jsx`];
  for (const candidate of candidates) {
    const full = resolve(baseDir, candidate);
    if (existsSync(full)) return full;
  }
  return null;
}

function gatherImports(source) {
  const specs = new Set();
  for (const match of source.matchAll(IMPORT_FROM_RE)) {
    specs.add(match[1]);
  }
  for (const match of source.matchAll(IMPORT_CALL_RE)) {
    specs.add(match[1]);
  }
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
    },
  }).outputText;

  const rewritten = rewriteImports(transpiled, replacements);
  const tempFile = join(
    tempRoot,
    `${basename(filePath).replace(/\W+/g, "_")}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`
  );
  writeFileSync(tempFile, rewritten, "utf8");
  moduleCache.set(filePath, tempFile);
  return tempFile;
}

process.on("exit", () => {
  rmSync(tempRoot, { recursive: true, force: true });
});

const valuationPath = new URL("../src/utils/valuationSnapshot.ts", import.meta.url);
const valuation = await import(pathToFileURL(transpileRecursive(valuationPath.href)).href);

const { buildValuationSnapshotKey, createValuationSnapshot, getOrCreateValuationSnapshot } = valuation;

function makeInput(usdPerPhi) {
  return {
    verifiedAtPulse: 100,
    phiValue: 2,
    usdPerPhi,
    source: "live",
    mode: "origin",
  };
}

test("valuation snapshot remains stable when usdPerPhi changes for same key", () => {
  const key = buildValuationSnapshotKey("bundle-1", 1000);
  const first = getOrCreateValuationSnapshot(null, key, makeInput(3));
  const second = getOrCreateValuationSnapshot(first, key, makeInput(4));
  assert.equal(first.key, second.key);
  assert.deepEqual(first.snapshot, second.snapshot);
});

test("valuation snapshot remints when key changes", () => {
  const keyA = buildValuationSnapshotKey("bundle-1", 1000);
  const keyB = buildValuationSnapshotKey("bundle-1", 1001);
  const first = getOrCreateValuationSnapshot(null, keyA, makeInput(3));
  const second = getOrCreateValuationSnapshot(first, keyB, makeInput(3));
  assert.notEqual(first.key, second.key);
  assert.notStrictEqual(first, second);
});

test("valuation snapshot drops usd when usdPerPhi is unavailable", () => {
  const snapshot = createValuationSnapshot(makeInput(null));
  assert.equal(snapshot.usdPerPhi, null);
  assert.equal(snapshot.usdValue, null);
});
