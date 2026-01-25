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

const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-sigil-bundle-"));
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

const bundlePath = new URL("../src/utils/canonicalGlyphBundle.ts", import.meta.url);
const attPath = new URL("../src/utils/kasAttestation.ts", import.meta.url);
const shaPath = new URL("../src/utils/sha256.ts", import.meta.url);

const canonical = await import(pathToFileURL(transpileRecursive(bundlePath.href)).href);
const attestations = await import(pathToFileURL(transpileRecursive(attPath.href)).href);
const sha = await import(pathToFileURL(transpileRecursive(shaPath.href)).href);

const { buildCanonicalGlyphBundle } = canonical;
const { makeKasAttestationFilename, makeKasAttestationJson, computeCredId8 } = attestations;
const { base64UrlEncode, hexToBytes, sha256Bytes } = sha;

function makeRandomBytes(size) {
  const out = new Uint8Array(size);
  crypto.getRandomValues(out);
  return out;
}

async function makeAuthorSig(bundleHash) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pubKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const credId = base64UrlEncode(makeRandomBytes(16));
  const authenticatorData = makeRandomBytes(37);
  const challengeBytes = hexToBytes(bundleHash);
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
    signedPayload
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

function makeBundleInputs() {
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg"><g><text>Kai</text></g></svg>`;
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  const proofCapsule = {
    v: "KPV-1",
    pulse: 123,
    chakraDay: "Root",
    kaiSignature: "deadbeef",
    phiKey: "phi-test",
    verifierSlug: "123-deadbeef",
  };
  return { svgText, pngBytes, proofCapsule };
}

test("canonical builder determinism", async () => {
  const inputs = makeBundleInputs();
  const first = await buildCanonicalGlyphBundle({
    ...inputs,
    zkPoseidonHash: "123",
    zkProof: { proof: "ok" },
    zkPublicInputs: ["123"],
  });
  const second = await buildCanonicalGlyphBundle({
    ...inputs,
    zkPoseidonHash: "123",
    zkProof: { proof: "ok" },
    zkPublicInputs: ["123"],
  });

  assert.equal(first.svgHash, second.svgHash);
  assert.equal(first.bundleHash, second.bundleHash);
  assert.equal(first.proofBundleJson, second.proofBundleJson);
});

test("attestation addition does not mutate canonical bytes", async () => {
  const inputs = makeBundleInputs();
  const bundle = await buildCanonicalGlyphBundle({
    ...inputs,
    zkPoseidonHash: "123",
    zkProof: { proof: "ok" },
    zkPublicInputs: ["123"],
  });

  const beforeSvg = new Uint8Array(bundle.svgBytes);
  const beforeProof = bundle.proofBundleJson;
  const beforeManifest = bundle.manifestJson;

  const authorSig = await makeAuthorSig(bundle.bundleHash);
  await makeKasAttestationJson({
    bundleHash: bundle.bundleHash,
    canonicalBundleObject: bundle.canonicalBundleObject,
    proofCapsule: bundle.proofBundle.proofCapsule,
    capsuleHash: bundle.capsuleHash,
    svgHash: bundle.svgHash,
    authorSig,
    rpId: "example.test",
  });

  assert.deepEqual(bundle.svgBytes, beforeSvg);
  assert.equal(bundle.proofBundleJson, beforeProof);
  assert.equal(bundle.manifestJson, beforeManifest);
});

test("filename generator matches convention and collisions", async () => {
  const bundleHash = "a".repeat(64);
  const credId = base64UrlEncode(new Uint8Array([1, 2, 3, 4]));
  const credId8 = await computeCredId8(credId);
  const name = await makeKasAttestationFilename({
    verifierSlug: "slug",
    bundleHash,
    credId,
    pulse: 42,
  });

  assert.equal(name, `kas_v1__slug__${bundleHash.slice(0, 12)}__${credId8}__p42.json`);

  const name2 = await makeKasAttestationFilename({
    verifierSlug: "slug",
    bundleHash,
    credId,
    pulse: 42,
    existingNames: [name],
  });
  assert.equal(name2, `kas_v1__slug__${bundleHash.slice(0, 12)}__${credId8}__p42__n2.json`);
});

test("authorSig.challenge binds bundleHash bytes", async () => {
  const inputs = makeBundleInputs();
  const bundle = await buildCanonicalGlyphBundle({
    ...inputs,
    zkPoseidonHash: "123",
    zkProof: { proof: "ok" },
    zkPublicInputs: ["123"],
  });
  const authorSig = await makeAuthorSig(bundle.bundleHash);
  assert.equal(authorSig.challenge, base64UrlEncode(hexToBytes(bundle.bundleHash)));
});

test("attestation bundleObjectHash equals bundleHash", async () => {
  const inputs = makeBundleInputs();
  const bundle = await buildCanonicalGlyphBundle({
    ...inputs,
    zkPoseidonHash: "123",
    zkProof: { proof: "ok" },
    zkPublicInputs: ["123"],
  });
  const authorSig = await makeAuthorSig(bundle.bundleHash);
  const attestation = await makeKasAttestationJson({
    bundleHash: bundle.bundleHash,
    canonicalBundleObject: bundle.canonicalBundleObject,
    proofCapsule: bundle.proofBundle.proofCapsule,
    capsuleHash: bundle.capsuleHash,
    svgHash: bundle.svgHash,
    authorSig,
    rpId: "example.test",
  });

  assert.equal(attestation.ref.bundleObjectHash, bundle.bundleHash);
});
