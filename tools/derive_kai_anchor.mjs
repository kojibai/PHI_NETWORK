import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const payloadPath = process.argv[2] || "genesis/GENESIS_PAYLOAD.txt";
const outPath = process.argv[3] || "src/kai-anchor.json";

const payload = fs.readFileSync(payloadPath); // raw bytes (canonical)
const sha256 = crypto.createHash("sha256").update(payload).digest("hex");
const H = BigInt("0x" + sha256);

// Canonical params (must match payload)
const MODULUS = 10n ** 18n;
const MICROS_PER_PULSE = 1_000_000n;
const PULSES_PER_STEP = 11n;
const MICROS_PER_STEP = MICROS_PER_PULSE * PULSES_PER_STEP;

// Reduce → snap
let anchor = H % MODULUS;
anchor = anchor - (anchor % MICROS_PER_STEP);

const out = {
  schema: "KAI_ANCHOR_V1",
  spec: "KKS-1.0",
  payloadFile: payloadPath.replace(/\\/g, "/"),
  payloadBytes: payload.length,
  payloadSha256Hex: sha256,
  modulus: MODULUS.toString(),
  microsPerPulse: MICROS_PER_PULSE.toString(),
  pulsesPerStep: PULSES_PER_STEP.toString(),
  microsPerStep: MICROS_PER_STEP.toString(),
  kaiAnchorMicro: anchor.toString(), // ← THIS is the universal seed constant
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log("✅ payloadSha256Hex:", sha256);
console.log("✅ kaiAnchorMicro:", anchor.toString());
console.log("✅ wrote:", outPath);