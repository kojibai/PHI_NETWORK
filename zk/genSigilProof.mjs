// zk/genSigilProof.mjs
import fs from "fs";
import { execSync } from "child_process";

const run = async () => {
  const secretInput = process.argv[2];

  if (!secretInput) {
    console.error("❌ Usage: node zk/genSigilProof.mjs <secretPhraseOrNumber>");
    process.exit(1);
  }

  const secret = BigInt(secretInput);
  const expectedHash = secret.toString();

  console.log("🔐 Expected Hash:", expectedHash);

  // Step 1: Write input.json
  const input = {
    secret: secret.toString(),
    expectedHash
  };

  const inputPath = "zk/input.json";
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));
  console.log("✅ Wrote:", inputPath);

  // Step 2: Run witness
  console.log("⚙️  Calculating witness...");
  execSync(`snarkjs wtns calculate public/zk/sigil_proof.wasm ${inputPath} zk/witness.wtns`, {
    stdio: "inherit"
  });

  // Step 3: Run proof
  console.log("🔮 Generating proof...");
  execSync(`snarkjs groth16 prove public/zk/sigil_proof_final.zkey zk/witness.wtns zk/proof.json zk/public.json`, {
    stdio: "inherit"
  });

  console.log("✅ Proof and public outputs generated.");

// Step 4: Show result for embedding
const proof = JSON.parse(fs.readFileSync("zk/proof.json"));
const pub = JSON.parse(fs.readFileSync("zk/public.json"));

const zkEmbed = {
  zkPoseidonHash: pub[0],
  zkProof: {
    pi_a: proof.pi_a,
    pi_b: proof.pi_b,
    pi_c: proof.pi_c
  }
};

console.log("\n📦 Embed this in your SVG or manifest:");
console.log(JSON.stringify(zkEmbed, null, 2));


};

run();
