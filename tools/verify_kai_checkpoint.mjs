// tools/verify_kai_checkpoint.mjs
import fs from "node:fs";
import crypto from "node:crypto";

const cpPath = process.argv[2] || "src/kai-checkpoint.json";
const cp = JSON.parse(fs.readFileSync(cpPath, "utf8"));

const payload = Buffer.from(cp.payloadB64, "base64");
const sha = crypto.createHash("sha256").update(payload).digest("hex");
if (sha !== cp.payloadSha256Hex) throw new Error("Payload sha mismatch.");

const pubDer = Buffer.from(cp.issuerPubkeySpkiB64, "base64");
const pubKey = crypto.createPublicKey({ key: pubDer, format: "der", type: "spki" });

const sig = Buffer.from(cp.signatureB64, "base64");
const ok = crypto.verify(null, payload, pubKey, sig);
if (!ok) throw new Error("Signature verify FAILED.");

console.log("✅ VERIFY OK:", cpPath);
console.log("✅ checkpointAbsMu:", cp.checkpointAbsMu);
