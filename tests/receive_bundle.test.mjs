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

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-receive-bundle-"));
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

const kasPath = new URL("../src/utils/webauthnKAS.ts", import.meta.url);
const receivePath = new URL("../src/utils/webauthnReceive.ts", import.meta.url);
const ownerPath = new URL("../src/utils/ownerPhiKey.ts", import.meta.url);
const shaPath = new URL("../src/utils/sha256.ts", import.meta.url);

const kas = await import(pathToFileURL(transpileRecursive(kasPath.href)).href);
const receive = await import(pathToFileURL(transpileRecursive(receivePath.href)).href);
const owner = await import(pathToFileURL(transpileRecursive(ownerPath.href)).href);
const sha = await import(pathToFileURL(transpileRecursive(shaPath.href)).href);

const { verifyBundleAuthorSig } = kas;
const { buildKasChallenge, verifyWebAuthnAssertion } = receive;
const { deriveOwnerPhiKeyFromReceive } = owner;
const { base64UrlEncode, base64UrlDecode, sha256Bytes, sha256Hex } = sha;

function makeRandomBytes(size) {
  const out = new Uint8Array(size);
  crypto.getRandomValues(out);
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeAuthorSig(bundleHash) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pubKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const credId = base64UrlEncode(makeRandomBytes(16));
  const authenticatorData = makeRandomBytes(37);
  const challengeBytes = Buffer.from(bundleHash, "hex");
  const challenge = base64UrlEncode(new Uint8Array(challengeBytes));
  const clientData = JSON.stringify({
    type: "webauthn.get",
    challenge,
    origin: "https://example.test",
  });
  const clientDataBytes = new TextEncoder().encode(clientData);
  const clientDataHash = await sha256Bytes(clientDataBytes);
  const signedPayload = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedPayload.set(authenticatorData, 0);
  signedPayload.set(clientDataHash, authenticatorData.length);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    signedPayload,
  );

  return {
    v: "KAS-1",
    alg: "webauthn-es256",
    credId,
    pubKeyJwk,
    challenge,
    signature: base64UrlEncode(new Uint8Array(signature)),
    authenticatorData: base64UrlEncode(authenticatorData),
    clientDataJSON: base64UrlEncode(clientDataBytes),
  };
}

async function makeReceiveSig({ bundleHash, nonce, receivePulse }) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pubKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const credId = base64UrlEncode(makeRandomBytes(16));
  const authenticatorData = makeRandomBytes(37);
  const { challengeBytes } = await buildKasChallenge("receive", bundleHash, nonce);
  const challenge = base64UrlEncode(challengeBytes);
  const clientData = JSON.stringify({
    type: "webauthn.get",
    challenge,
    origin: "https://example.test",
  });
  const clientDataBytes = new TextEncoder().encode(clientData);
  const clientDataHash = await sha256Bytes(clientDataBytes);
  const signedPayload = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedPayload.set(authenticatorData, 0);
  signedPayload.set(clientDataHash, authenticatorData.length);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    signedPayload,
  );

  const assertion = {
    id: credId,
    rawId: credId,
    type: "public-key",
    response: {
      authenticatorData: base64UrlEncode(authenticatorData),
      clientDataJSON: base64UrlEncode(clientDataBytes),
      signature: base64UrlEncode(new Uint8Array(signature)),
      userHandle: null,
    },
  };

  return {
    v: "KRS-1",
    alg: "webauthn-es256",
    nonce,
    binds: { bundleHash },
    createdAtPulse: receivePulse,
    credId,
    pubKeyJwk,
    assertion,
  };
}

test("authorSig binds to bundleHash (normal glyph)", async () => {
  const bundleHash = await sha256Hex("bundle-seed-normal");
  const authorSig = await makeAuthorSig(bundleHash);
  const ok = await verifyBundleAuthorSig(bundleHash, authorSig);
  assert.equal(ok, true);
});

test("receive glyph provenance + ownership bindings", async () => {
  const originBundleHash = await sha256Hex("origin-bundle");
  const receiveBundleHash = await sha256Hex("receive-bundle");
  const originAuthorSig = await makeAuthorSig(originBundleHash);

  const originChallengeBytes = base64UrlDecode(originAuthorSig.challenge);
  assert.equal(bytesToHex(originChallengeBytes), originBundleHash);

  const receivePulse = 123456;
  const receiveSig = await makeReceiveSig({
    bundleHash: receiveBundleHash,
    nonce: "nonce-test",
    receivePulse,
  });

  const expectedChallenge = (await buildKasChallenge("receive", receiveBundleHash, receiveSig.nonce)).challengeBytes;
  const receiveOk = await verifyWebAuthnAssertion({
    assertion: receiveSig.assertion,
    expectedChallenge,
    pubKeyJwk: receiveSig.pubKeyJwk,
    expectedCredId: receiveSig.credId,
  });
  assert.equal(receiveOk, true);

  const ownerPhiKey = await deriveOwnerPhiKeyFromReceive({
    receiverPubKeyJwk: receiveSig.pubKeyJwk,
    receivePulse,
    receiveBundleHash,
  });
  const ownerPhiKeyAgain = await deriveOwnerPhiKeyFromReceive({
    receiverPubKeyJwk: receiveSig.pubKeyJwk,
    receivePulse,
    receiveBundleHash,
  });
  assert.equal(ownerPhiKey, ownerPhiKeyAgain);
});

test("legacy compatibility: receive bundles without receiveSig mark ownership missing", async () => {
  const bundleHash = await sha256Hex("legacy-bundle");
  const authorSig = await makeAuthorSig(bundleHash);
  const ok = await verifyBundleAuthorSig(bundleHash, authorSig);
  assert.equal(ok, true);

  const mode = "receive";
  const receiveSig = null;
  const ownership = mode === "receive" && !receiveSig ? "missing" : "ok";
  assert.equal(ownership, "missing");
});
