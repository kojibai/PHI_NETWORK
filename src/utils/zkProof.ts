import type { SigilProofHints } from "../types/sigil";

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
}

export async function generateZkProofFromPoseidonHash(params: {
  poseidonHash: string;
  secret?: string;
  proofHints?: SigilProofHints;
}): Promise<{ proof: unknown; proofHints: SigilProofHints; zkPublicInputs: string[] } | null> {
  const poseidonHash = params.poseidonHash?.trim();
  if (!poseidonHash) return null;

  try {
    if (typeof fetch !== "function") return null;
    const res = await fetch("/api/proof/sigil", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: params.secret ?? poseidonHash,
        expectedHash: poseidonHash,
      }),
    });
    if (!res.ok) {
      throw new Error("ZK proof API failed");
    }
    const payload = (await res.json()) as {
      zkProof?: unknown;
      zkPublicInputs?: string[];
      proofHints?: SigilProofHints;
    };
    if (!payload || !isNonEmptyObject(payload)) return null;
    const zkProof = payload.zkProof;
    if (!isNonEmptyObject(zkProof)) {
      throw new Error("ZK proof missing");
    }
    const zkPublicInputs = Array.isArray(payload.zkPublicInputs)
      ? payload.zkPublicInputs.map((entry) => String(entry))
      : [];
    if (!zkPublicInputs.length) {
      throw new Error("ZK public input missing");
    }
    if (zkPublicInputs[0] !== poseidonHash) {
      throw new Error("ZK public input mismatch");
    }

    const proofHints: SigilProofHints = {
      scheme: "groth16-poseidon",
      api: "/api/proof/sigil",
      explorer: `/keystream/hash/${poseidonHash}`,
      ...(params.proofHints ?? {}),
      ...(payload.proofHints ?? {}),
    };

    return { proof: zkProof ?? null, proofHints, zkPublicInputs };
  } catch {
    return null;
  }
}
