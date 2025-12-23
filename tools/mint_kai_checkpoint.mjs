// tools/mint_kai_checkpoint.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const originPath = process.argv[2] || "src/kai-origin.json";
const outPath = process.argv[3] || "src/kai-checkpoint.json";
const privKeyPath = arg("--key") || "keys/kai-issuer-ed25519-private.pem";

const pulseStr = arg("--pulse");   // integer pulses
const absMuStr = arg("--absMu");   // absolute μpulses (string int)
const seqStr   = arg("--seq") || "1";

const origin = JSON.parse(fs.readFileSync(originPath, "utf8"));
const originAbsMu = BigInt(origin.originAbsMu ?? origin.kaiAnchorMicro);
const originSha = String(origin.payloadSha256Hex);

if (!originSha || !/^[0-9a-f]{64}$/.test(originSha)) {
  throw new Error("Invalid origin payloadSha256Hex in origin file.");
}

let checkpointAbsMu;
if (absMuStr) {
  checkpointAbsMu = BigInt(absMuStr);
} else if (pulseStr) {
  const p = BigInt(pulseStr);
  checkpointAbsMu = originAbsMu + p * 1_000_000n;
} else {
  throw new Error("Provide --pulse <int> OR --absMu <int>.");
}

const seq = BigInt(seqStr);
if (seq < 0n) throw new Error("--seq must be >= 0");

const privKeyPem = fs.readFileSync(privKeyPath, "utf8");
const privKey = crypto.createPrivateKey(privKeyPem);
const pubKey = crypto.createPublicKey(privKey);
const pubSpkiDer = pubKey.export({ format: "der", type: "spki" });
const pubSpkiB64 = Buffer.from(pubSpkiDer).toString("base64");

// Canonical payload bytes (LF, no trailing spaces)
const payloadText =
`KAI-KLOK CHECKPOINT PAYLOAD
SCHEMA: KAI_CHECKPOINT_PAYLOAD_V1
SPEC: KKS-1.0
ORIGIN_PAYLOAD_SHA256: ${originSha}
ORIGIN_ABS_MU: ${originAbsMu.toString()}
CHECKPOINT_ABS_MU: ${checkpointAbsMu.toString()}
CHECKPOINT_SEQ: ${seq.toString()}
ISSUER_PUBKEY_SPKI_B64: ${pubSpkiB64}
`;

const payloadBytes = Buffer.from(payloadText, "utf8");
const payloadSha256Hex = crypto.createHash("sha256").update(payloadBytes).digest("hex");

// Ed25519 signs the bytes directly (algo = null)
const sig = crypto.sign(null, payloadBytes, privKey);
const sigB64 = Buffer.from(sig).toString("base64");

const out = {
  schema: "KAI_CHECKPOINT_V1",
  spec: "KKS-1.0",

  originPayloadSha256Hex: originSha,
  originAbsMu: originAbsMu.toString(),

  checkpointAbsMu: checkpointAbsMu.toString(),
  checkpointSeq: seq.toString(),

  issuerPubkeySpkiB64: pubSpkiB64,

  payloadB64: payloadBytes.toString("base64"),
  payloadSha256Hex,

  signatureB64: sigB64,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("✅ checkpointAbsMu:", checkpointAbsMu.toString());
console.log("✅ payloadSha256Hex:", payloadSha256Hex);
console.log("✅ wrote:", outPath);
