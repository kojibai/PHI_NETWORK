import fs from "node:fs/promises";
import path from "node:path";
import { groth16 } from "snarkjs";
import { blake3 } from "hash-wasm";

const ROOT_DIR = process.cwd();
const ARTIFACTS_DIR = path.join(ROOT_DIR, "public", "zk");
const WASM_PATH = path.join(ARTIFACTS_DIR, "sigil.wasm");
const ZKEY_PATH = path.join(ARTIFACTS_DIR, "sigil.zkey");
const VKEY_PATH = path.join(ARTIFACTS_DIR, "sigil.vkey.json");

function hexToBytes(hex) {
  const clean = String(hex).trim().toLowerCase().replace(/^0x/, "");
  if (clean.length % 2 !== 0) throw new Error("HEX_LENGTH_MUST_BE_EVEN");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = clean.slice(i * 2, i * 2 + 2);
    const val = Number.parseInt(byte, 16);
    if (Number.isNaN(val)) throw new Error("HEX_PARSE_ERROR");
    out[i] = val;
  }
  return out;
}

function padHex64(hex) {
  return String(hex).padStart(64, "0");
}

async function computeZkPoseidonHashFromPayloadHex(payloadHashHex) {
  const clean = String(payloadHashHex).trim().replace(/^0x/i, "");
  const hi = clean.slice(0, 32).padStart(32, "0");
  const lo = clean.slice(32).padEnd(32, "0");
  const hiBig = BigInt(`0x${hi}`);
  const loBig = BigInt(`0x${lo}`);
  const joined = `${padHex64(hiBig.toString(16))}${padHex64(loBig.toString(16))}`;
  const digestHex = await blake3(hexToBytes(joined));
  return BigInt(`0x${digestHex}`).toString();
}

async function loadSigilVkey() {
  const raw = await fs.readFile(VKEY_PATH, "utf8");
  return JSON.parse(raw);
}

function normalizeValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)])
    );
  }
  return value;
}

function normalizePublicSignals(signals) {
  if (!Array.isArray(signals)) return [];
  return signals.map((entry) => {
    if (typeof entry === "bigint") return entry.toString();
    if (typeof entry === "number") return entry.toString();
    return String(entry);
  });
}

export async function generateSigilProof({
  zkPoseidonHash,
  payloadHashHex,
  poseidonHash,
} = {}) {
  const hashFromPayload = payloadHashHex
    ? await computeZkPoseidonHashFromPayloadHex(payloadHashHex)
    : null;
  const canonicalPoseidonHash =
    (hashFromPayload ?? poseidonHash ?? zkPoseidonHash ?? "").toString().trim();
  if (!canonicalPoseidonHash) {
    throw new Error("Missing zkPoseidonHash/payloadHashHex");
  }

  const input = {
    poseidonHash: canonicalPoseidonHash,
    zkPoseidonHash: canonicalPoseidonHash,
    hash: canonicalPoseidonHash,
  };

  const { proof, publicSignals } = await groth16.fullProve(
    input,
    WASM_PATH,
    ZKEY_PATH
  );

  const normalizedProof = normalizeValue(proof);
  const normalizedSignals = normalizePublicSignals(publicSignals);
  const publicInput0 = normalizedSignals[0];

  if (publicInput0 !== canonicalPoseidonHash) {
    throw new Error("ZK public input mismatch");
  }

  const vkey = await loadSigilVkey();
  const verified = await groth16.verify(vkey, normalizedSignals, normalizedProof);
  if (!verified) {
    throw new Error("ZK proof failed verification");
  }

  return {
    zkPoseidonHash: publicInput0,
    zkProof: normalizedProof,
    zkPublicInputs: normalizedSignals,
    proofHints: {
      scheme: "groth16-poseidon",
      api: "/api/proof/sigil",
      explorer: `/keystream/hash/${publicInput0}`,
    },
  };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  try {
    const body = await readJsonBody(req);
    const result = await generateSigilProof(body);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proof generation failed";
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: message }));
  }
}

export { loadSigilVkey };
