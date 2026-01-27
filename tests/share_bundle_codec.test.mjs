import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-share-bundle-codec-"));
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

const codecPath = new URL("../src/utils/shareBundleCodec.ts", import.meta.url);
const codec = await import(pathToFileURL(transpileRecursive(codecPath.href)).href);
const shaPath = new URL("../src/utils/sha256.ts", import.meta.url);
const sha = await import(pathToFileURL(transpileRecursive(shaPath.href)).href);

const { encodeSharePayload, decodeSharePayload } = codec;
const { base64UrlEncode } = sha;

test("share bundle codec roundtrip and compactness", () => {
  const bundle = {
    hashAlg: "sha256",
    canon: "JCS",
    proofCapsule: {
      v: "KPV-1",
      pulse: 12345,
      chakraDay: "2001-01-01",
      kaiSignature: "kai-signature",
      phiKey: "phi-key",
      verifierSlug: "sigil",
    },
    capsuleHash: "0xabc",
    svgHash: "0xdef",
    bundleHash: "0x123",
    verifier: "local",
    verificationVersion: "KVB-1.2",
    receiveSig: {
      v: "KAS-1",
      sig: "sig",
      challenge: "challenge",
    },
    zkProof: {
      pi_a: ["1", "2"],
      pi_b: [
        ["3", "4"],
        ["5", "6"],
      ],
      pi_c: ["7", "8"],
      protocol: "groth16",
      curve: "bn128",
    },
    zkPublicInputs: ["9", "10", "11"],
  };

  const encoded = encodeSharePayload(bundle);
  const decoded = decodeSharePayload(encoded);
  assert.deepEqual(decoded, bundle);

  const legacyJson = JSON.stringify(bundle);
  const legacyEncoded = base64UrlEncode(new TextEncoder().encode(legacyJson));
  assert.ok(encoded.length < legacyEncoded.length);

  const shareUrl = `https://phi.network/verify/sigil?p=${encoded}`;
  assert.ok(shareUrl.length < 2000);
});
