import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { groth16 } from "snarkjs";
import { generateSigilProof, loadSigilVkey } from "../api/proof/sigil.js";

const ARTIFACTS_DIR = path.join(process.cwd(), "public", "zk");
const requiredArtifacts = [
  path.join(ARTIFACTS_DIR, "sigil.wasm"),
  path.join(ARTIFACTS_DIR, "sigil.zkey"),
  path.join(ARTIFACTS_DIR, "sigil.vkey.json"),
];

const hasArtifacts = requiredArtifacts.every((file) => fs.existsSync(file));

test(
  "Groth16 proofs vary with poseidon hash inputs",
  { skip: !hasArtifacts, timeout: 180_000 },
  async () => {
    const vkey = await loadSigilVkey();

    const proofA = await generateSigilProof({ zkPoseidonHash: "1" });
    const proofB = await generateSigilProof({ zkPoseidonHash: "2" });

    assert.ok(
      await groth16.verify(vkey, proofA.zkPublicInputs, proofA.zkProof),
      "proof A should verify"
    );
    assert.ok(
      await groth16.verify(vkey, proofB.zkPublicInputs, proofB.zkProof),
      "proof B should verify"
    );

    assert.notStrictEqual(
      JSON.stringify(proofA.zkProof),
      JSON.stringify(proofB.zkProof),
      "proofs should differ for different poseidon hashes"
    );
  }
);
