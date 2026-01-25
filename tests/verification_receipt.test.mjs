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

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-verification-receipt-"));
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

const receiptPath = new URL("../src/utils/verificationReceipt.ts", import.meta.url);
const receipt = await import(pathToFileURL(transpileRecursive(receiptPath.href)).href);
const valuationPath = new URL("../src/utils/valuationSnapshot.ts", import.meta.url);
const valuation = await import(pathToFileURL(transpileRecursive(valuationPath.href)).href);

const {
  assertReceiptHashMatch,
  buildVerificationReceipt,
  hashValuationSnapshot,
  hashVerificationReceipt,
  verificationReceiptChallenge,
  verifyVerificationSig,
} = receipt;
const { createValuationSnapshot } = valuation;

test("receipt hash changes when verifiedAtPulse changes", async () => {
  const receiptA = buildVerificationReceipt({
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 10,
    verifier: "local",
    verificationVersion: "KVB-1.2",
  });
  const receiptB = buildVerificationReceipt({
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 11,
    verifier: "local",
    verificationVersion: "KVB-1.2",
  });
  const hashA = await hashVerificationReceipt(receiptA);
  const hashB = await hashVerificationReceipt(receiptB);
  assert.notEqual(hashA, hashB);
});

test("receipt hash changes when bundleHash changes", async () => {
  const receiptA = buildVerificationReceipt({
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 10,
    verifier: "local",
    verificationVersion: "KVB-1.2",
  });
  const receiptB = buildVerificationReceipt({
    bundleHash: "0xccc",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 10,
    verifier: "local",
    verificationVersion: "KVB-1.2",
  });
  const hashA = await hashVerificationReceipt(receiptA);
  const hashB = await hashVerificationReceipt(receiptB);
  assert.notEqual(hashA, hashB);
});

test("verification sig fails when receipt hash changes", async () => {
  const receiptA = buildVerificationReceipt({
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 10,
    verifier: "local",
    verificationVersion: "KVB-1.2",
  });
  const receiptB = buildVerificationReceipt({
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 11,
    verifier: "local",
    verificationVersion: "KVB-1.2",
  });
  const hashA = await hashVerificationReceipt(receiptA);
  const hashB = await hashVerificationReceipt(receiptB);
  const { challengeB64 } = verificationReceiptChallenge(hashA);
  const fakeSig = {
    v: "KAS-1",
    scope: "verification-receipt",
    alg: "webauthn-es256",
    credId: "cred",
    pubKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
    challenge: challengeB64,
    signature: "",
    authenticatorData: "",
    clientDataJSON: "",
  };
  const ok = await verifyVerificationSig(hashB, fakeSig);
  assert.equal(ok, false);
});

test("receipt hash changes when valuation hash changes", async () => {
  const valuationA = createValuationSnapshot({
    verifiedAtPulse: 10,
    phiValue: 2,
    usdPerPhi: 3,
    source: "live",
    mode: "origin",
  });
  const valuationB = createValuationSnapshot({
    verifiedAtPulse: 10,
    phiValue: 2,
    usdPerPhi: 4,
    source: "live",
    mode: "origin",
  });
  const hashA = await hashValuationSnapshot(valuationA);
  const hashB = await hashValuationSnapshot(valuationB);
  const receiptA = buildVerificationReceipt({
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 10,
    verifier: "local",
    verificationVersion: "KVB-1.2",
    valuationHash: hashA,
    valuation: valuationA,
  });
  const receiptB = buildVerificationReceipt({
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 10,
    verifier: "local",
    verificationVersion: "KVB-1.2",
    valuationHash: hashB,
    valuation: valuationB,
  });
  const receiptHashA = await hashVerificationReceipt(receiptA);
  const receiptHashB = await hashVerificationReceipt(receiptB);
  assert.notEqual(receiptHashA, receiptHashB);
});

test("receipt hash check fails on mismatched valuation hash", async () => {
  const valuation = createValuationSnapshot({
    verifiedAtPulse: 10,
    phiValue: 2,
    usdPerPhi: 3,
    source: "live",
    mode: "origin",
  });
  const receipt = buildVerificationReceipt({
    bundleHash: "0xaaa",
    zkPoseidonHash: "0xbbb",
    verifiedAtPulse: 10,
    verifier: "local",
    verificationVersion: "KVB-1.2",
    valuationHash: "deadbeef",
    valuation,
  });
  const receiptHash = await hashVerificationReceipt(receipt);
  await assert.rejects(async () => assertReceiptHashMatch(receipt, receiptHash), /verification receipt mismatch/);
});
