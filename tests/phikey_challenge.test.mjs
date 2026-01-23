import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import { test } from "node:test";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-phikey-"));
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
  const outPath = join(tempRoot, `${basename(filePath)}.mjs`);
  writeFileSync(outPath, rewritten, "utf8");
  moduleCache.set(filePath, outPath);
  return outPath;
}

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const phiKeyPath = new URL("../src/utils/phiKey.ts", import.meta.url);
const phiKeyUrl = pathToFileURL(transpileRecursive(phiKeyPath.href)).href;
const phiKey = await import(phiKeyUrl);

const { deriveGlyphChallenge } = phiKey;

test("deriveGlyphChallenge uses glyph hash, origin, and nonce", async () => {
  const glyphHash = "deadbeefcafebabe";
  const requestingOrigin = "https://asterion.cc";
  const nonce = "nonce-1234";

  const payload = `PHI_GLYPH_AUTH_V1|${glyphHash}|${requestingOrigin}|${nonce}`;
  const expectedBytes = createHash("sha256").update(payload).digest();
  const expectedB64 = base64UrlEncode(expectedBytes);

  const result = await deriveGlyphChallenge({
    glyphHash,
    requestingOrigin,
    nonce,
  });

  assert.equal(result.challengeB64, expectedB64);
  assert.equal(result.requestingOrigin, requestingOrigin);
  assert.equal(result.nonce, nonce);
});

test("cleanup temp modules", () => {
  rmSync(tempRoot, { recursive: true, force: true });
});
