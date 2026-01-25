import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import ts from "typescript";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-verification-cache-"));
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

const cachePath = new URL("../src/utils/verificationCache.ts", import.meta.url);
const cache = await import(pathToFileURL(transpileRecursive(cachePath.href)).href);

const { buildVerificationCacheKey, matchesVerificationCache } = cache;

test("verification cache rejects mismatched bundle hash", async () => {
  const params = {
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verificationVersion: "KVB-1.2",
  };
  const cacheKey = await buildVerificationCacheKey(params);
  const entry = {
    v: "KVC-1",
    cacheKey,
    bundleHash: "0xother",
    zkPoseidonHash: "0xbbb",
    verificationVersion: "KVB-1.2",
  };
  assert.equal(matchesVerificationCache(entry, params), false);
});

test("verification cache rejects mismatched poseidon hash", async () => {
  const params = {
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verificationVersion: "KVB-1.2",
  };
  const cacheKey = await buildVerificationCacheKey(params);
  const entry = {
    v: "KVC-1",
    cacheKey,
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xccc",
    verificationVersion: "KVB-1.2",
  };
  assert.equal(matchesVerificationCache(entry, params), false);
});
