import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-verify-audit-state-"));
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
    `${basename(filePath).replace(/\W+/g, "_")}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`,
  );
  writeFileSync(tempFile, rewritten, "utf8");
  moduleCache.set(filePath, tempFile);
  return tempFile;
}

process.on("exit", () => {
  rmSync(tempRoot, { recursive: true, force: true });
});

const auditPath = new URL("../src/utils/verifyAuditState.ts", import.meta.url);
const audit = await import(pathToFileURL(transpileRecursive(auditPath.href)).href);

const {
  resolveKasVerificationStatus,
  resolveOriginOwnershipAttestation,
  sealStateToBoolean,
  verificationBooleanToMark,
} = audit;

test("origin shared-link attestation stays true when the signed owner phi key matches", () => {
  const resolved = resolveOriginOwnershipAttestation({
    hasKASOwnerSig: true,
    ownerAuthorSigVerified: true,
    effectiveOwnerPhiKey: "phi-owner-123",
    signerPhiKey: "phi-owner-123",
  });

  assert.deepEqual(resolved, {
    ownerPhiKeyVerified: true,
    ownershipAttested: true,
  });
});

test("origin shared-link attestation preserves unresolved state instead of collapsing to false", () => {
  const unresolved = resolveOriginOwnershipAttestation({
    hasKASOwnerSig: true,
    ownerAuthorSigVerified: null,
    effectiveOwnerPhiKey: "phi-owner-123",
    signerPhiKey: null,
  });

  assert.deepEqual(unresolved, {
    ownerPhiKeyVerified: null,
    ownershipAttested: "missing",
  });
});

test("historical kas status resolves from the attestation source without inventing failure", () => {
  assert.equal(
    resolveKasVerificationStatus({
      hasKASOwnerSig: true,
      ownerAuthorSigVerified: true,
      hasKASReceiveSig: false,
      receiveSigVerified: null,
    }),
    true,
  );

  assert.equal(
    resolveKasVerificationStatus({
      hasKASOwnerSig: false,
      ownerAuthorSigVerified: null,
      hasKASReceiveSig: true,
      receiveSigVerified: false,
    }),
    false,
  );

  assert.equal(
    resolveKasVerificationStatus({
      hasKASOwnerSig: true,
      ownerAuthorSigVerified: null,
      hasKASReceiveSig: false,
      receiveSigVerified: null,
    }),
    null,
  );
});

test("share and export markers stay tri-state for unresolved verification", () => {
  assert.equal(sealStateToBoolean("valid"), true);
  assert.equal(sealStateToBoolean("invalid"), false);
  assert.equal(sealStateToBoolean("na"), null);
  assert.equal(verificationBooleanToMark(true), "✅");
  assert.equal(verificationBooleanToMark(false), "❌");
  assert.equal(verificationBooleanToMark(null), null);
});
