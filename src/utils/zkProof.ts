import type { SigilProofHints } from "../types/sigil";

type Groth16FullProve = (
  input: Record<string, string | number | bigint>,
  wasmPath: string,
  zkeyPath: string
) => Promise<{ proof: unknown; publicSignals: string[] }>;

type Groth16Module = { fullProve?: Groth16FullProve };

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
}

function hasMeaningfulZkProof(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return isNonEmptyObject(value);
}

async function resolveArtifactPath(
  candidates: string[],
): Promise<string> {
  if (typeof fetch !== "function") return candidates[0] ?? "";
  for (const path of candidates) {
    try {
      const res = await fetch(path, { method: "HEAD" });
      if (res.ok) return path;
    } catch {
      // ignore and try next
    }
  }
  return candidates[0] ?? "";
}

async function loadFallbackProof(): Promise<unknown | null> {
  if (typeof fetch !== "function") return null;
  try {
    const res = await fetch("/zk/sigil.artifacts.json");
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (isNonEmptyObject(data)) return data;
  } catch {
    return null;
  }
  return null;
}

async function loadGroth16Prover(): Promise<Groth16Module | null> {
  const isGroth16Prover = (v: unknown): v is Groth16Module =>
    typeof v === "object" && v !== null && "fullProve" in v && typeof (v as Groth16Module).fullProve === "function";

  if (typeof window !== "undefined" && isGroth16Prover(window.snarkjs?.groth16)) {
    return window.snarkjs!.groth16 as Groth16Module;
  }

  const mod = await import("snarkjs").catch(() => null);
  const candidate = (mod?.groth16 ?? mod?.default?.groth16) as Groth16Module | undefined;
  if (isGroth16Prover(candidate)) return candidate;
  return null;
}

export async function generateZkProofFromPoseidonHash(params: {
  poseidonHash: string;
  proofHints?: SigilProofHints;
}): Promise<{ proof: unknown; proofHints: SigilProofHints; zkPublicInputs: string[] } | null> {
  const poseidonHash = params.poseidonHash?.trim();
  if (!poseidonHash) return null;

  const groth16 = await loadGroth16Prover();
  if (!groth16?.fullProve) return null;

  const wasmPath = await resolveArtifactPath(["/zk/sigil.wasm", "/sigil.wasm"]);
  const zkeyPath = await resolveArtifactPath(["/zk/sigil.zkey", "/sigil.zkey"]);

  const input = {
    poseidonHash,
    zkPoseidonHash: poseidonHash,
    hash: poseidonHash,
  };

  try {
    const { proof, publicSignals } = await groth16.fullProve(input, wasmPath, zkeyPath);
    if (!hasMeaningfulZkProof(proof)) return null;

    const proofHints: SigilProofHints = {
      scheme: "groth16-poseidon",
      api: "/api/proof/sigil",
      explorer: `/keystream/hash/${poseidonHash}`,
      ...(params.proofHints ?? {}),
    };

    return { proof, proofHints, zkPublicInputs: publicSignals };
  } catch {
    const fallback = await loadFallbackProof();
    if (!fallback) return null;
    const proofHints: SigilProofHints = {
      scheme: "groth16-poseidon",
      api: "/api/proof/sigil",
      explorer: `/keystream/hash/${poseidonHash}`,
      ...(params.proofHints ?? {}),
    };
    return { proof: fallback, proofHints, zkPublicInputs: [poseidonHash] };
  }
}
