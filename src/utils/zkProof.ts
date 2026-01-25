import type { SigilProofHints } from "../types/sigil";

type Groth16Prover = {
  fullProve: (
    input: Record<string, unknown>,
    wasmPath: string,
    zkeyPath: string
  ) => Promise<{ proof: unknown; publicSignals: unknown }>;
  verify: (vkey: unknown, publicSignals: unknown, proof: unknown) => Promise<boolean>;
};

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
}

const DEFAULT_PROOF_HINTS: SigilProofHints = {
  scheme: "groth16-poseidon",
  api: "/api/proof/sigil",
  explorer: "/keystream/hash/<hash>",
};

function isGroth16Prover(value: unknown): value is Groth16Prover {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Groth16Prover).fullProve === "function" &&
    typeof (value as Groth16Prover).verify === "function"
  );
}

async function loadGroth16Prover(): Promise<Groth16Prover | null> {
  if (typeof window !== "undefined") {
    const candidate = window.snarkjs?.groth16;
    if (isGroth16Prover(candidate)) return candidate;
  }

  const mod = await import("snarkjs").catch(() => null);
  if (!mod) return null;

  const candidate = (mod as { groth16?: unknown; default?: { groth16?: unknown } }).groth16 ??
    (mod as { default?: { groth16?: unknown } }).default?.groth16;
  return isGroth16Prover(candidate) ? candidate : null;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)])
    );
  }
  return value;
}

function normalizePublicSignals(signals: unknown): string[] {
  if (!Array.isArray(signals)) return [];
  return signals.map((entry) => {
    if (typeof entry === "bigint") return entry.toString();
    if (typeof entry === "number") return entry.toString();
    return String(entry);
  });
}

async function generateLocalZkProof(params: {
  poseidonHash: string;
  secret: string;
  proofHints?: SigilProofHints;
}): Promise<{ proof: unknown; proofHints: SigilProofHints; zkPublicInputs: string[] } | null> {
  const groth16 = await loadGroth16Prover();
  if (!groth16) return null;

  const { proof, publicSignals } = await groth16.fullProve(
    {
      secret: params.secret,
      expectedHash: params.poseidonHash,
    },
    "/zk/sigil_proof.wasm",
    "/zk/sigil_proof_final.zkey"
  );

  const normalizedProof = normalizeValue(proof);
  const normalizedSignals = normalizePublicSignals(publicSignals);
  if (!normalizedSignals.length) throw new Error("ZK public input missing");
  if (normalizedSignals[0] !== params.poseidonHash) throw new Error("ZK public input mismatch");

  const vkeyRes = await fetch("/zk/verification_key.json", { cache: "force-cache" });
  if (!vkeyRes.ok) throw new Error("ZK vkey missing");
  const vkey = (await vkeyRes.json()) as unknown;

  const verified = await groth16.verify(vkey, normalizedSignals, normalizedProof);
  if (!verified) throw new Error("ZK proof failed verification");

  const proofHints = buildProofHints(params.poseidonHash, params.proofHints);
  return { proof: normalizedProof, proofHints, zkPublicInputs: normalizedSignals };
}

export function buildProofHints(
  poseidonHash: string,
  baseHints?: Partial<SigilProofHints>
): SigilProofHints {
  const merged: SigilProofHints = {
    ...DEFAULT_PROOF_HINTS,
    ...baseHints,
  };
  const explorer = merged.explorer || `/keystream/hash/${poseidonHash}`;
  const normalizedExplorer = explorer.replace(/<hash>|\{hash\}/gi, poseidonHash);
  return { ...merged, explorer: normalizedExplorer };
}

export async function generateZkProofFromPoseidonHash(params: {
  poseidonHash: string;
  secret?: string;
  proofHints?: SigilProofHints;
}): Promise<{ proof: unknown; proofHints: SigilProofHints; zkPublicInputs: string[] } | null> {
  const poseidonHash = params.poseidonHash?.trim();
  const secret = params.secret?.trim();
  if (!poseidonHash || !secret) return null;

  const shouldUseRemote = typeof navigator === "undefined" || navigator.onLine;

  if (shouldUseRemote) {
    try {
      if (typeof fetch !== "function") return null;
      const res = await fetch("/api/proof/sigil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
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

      const proofHints = buildProofHints(poseidonHash, {
        ...(params.proofHints ?? {}),
        ...(payload.proofHints ?? {}),
      });

      return { proof: zkProof ?? null, proofHints, zkPublicInputs };
    } catch {
      // fall through to local prover
    }
  }

  try {
    return await generateLocalZkProof({
      poseidonHash,
      secret,
      proofHints: params.proofHints,
    });
  } catch {
    return null;
  }
}