import type { SigilProofHints } from "../types/sigil";

type Groth16FullProve = (
  input: Record<string, string | number | bigint>,
  wasmPath: string,
  zkeyPath: string
) => Promise<{ proof: unknown; publicSignals: string[] }>;

type Groth16Verify = (
  vkey: unknown,
  publicSignals: unknown,
  proof: unknown
) => Promise<boolean> | boolean;

type Groth16Module = { fullProve?: Groth16FullProve; verify?: Groth16Verify };

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

async function fetchSigilProofFromApi(params: {
  poseidonHash: string;
  proofHints?: SigilProofHints;
  payloadHashHex?: string;
}): Promise<{ proof: unknown; proofHints: SigilProofHints; zkPublicInputs: string[] } | null> {
  if (typeof fetch !== "function") return null;
  try {
    const res = await fetch("/api/proof/sigil", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poseidonHash: params.poseidonHash,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      zkProof?: unknown;
      zkPublicInputs?: unknown;
      proofHints?: SigilProofHints;
      zkPoseidonHash?: string;
    };
    if (!data || !isNonEmptyObject(data)) return null;
    if (!data.zkProof || !data.zkPublicInputs) return null;
    const proofHints: SigilProofHints = {
      scheme: "groth16-poseidon",
      api: "/api/proof/sigil",
      explorer: `/keystream/hash/${params.poseidonHash}`,
      ...(params.proofHints ?? {}),
      ...(data.proofHints ?? {}),
    };
    return {
      proof: data.zkProof,
      proofHints,
      zkPublicInputs: Array.isArray(data.zkPublicInputs)
        ? data.zkPublicInputs.map((entry) => String(entry))
        : [params.poseidonHash],
    };
  } catch {
    return null;
  }
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

async function loadSigilVkey(explicit?: unknown): Promise<unknown | null> {
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    const win = window as unknown as { SIGIL_ZK_VKEY?: unknown };
    if (win.SIGIL_ZK_VKEY) return win.SIGIL_ZK_VKEY;
  }
  if (typeof fetch !== "function") return null;

  const candidates = ["/zk/sigil.vkey.json", "/sigil.vkey.json"];
  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) continue;
      return (await res.json()) as unknown;
    } catch {
      // ignore and try next
    }
  }
  return null;
}

export async function generateZkProofFromPoseidonHash(params: {
  poseidonHash: string;
  proofHints?: SigilProofHints;
  vkey?: unknown;
  payloadHashHex?: string;
}): Promise<{ proof: unknown; proofHints: SigilProofHints; zkPublicInputs: string[] } | null> {
  const poseidonHash = params.poseidonHash?.trim();
  if (!poseidonHash) return null;

  const apiAttempted = typeof fetch === "function";
  if (apiAttempted) {
    const apiProof = await fetchSigilProofFromApi({
      poseidonHash,
      proofHints: params.proofHints,
      payloadHashHex: params.payloadHashHex,
    });
    if (apiProof) return apiProof;
    throw new Error("ZK proof API unavailable");
  }

  const groth16 = await loadGroth16Prover();
  if (!groth16?.fullProve) {
    return null;
  }

  const wasmPath = await resolveArtifactPath(["/zk/sigil.wasm", "/sigil.wasm"]);
  const zkeyPath = await resolveArtifactPath(["/zk/sigil.zkey", "/sigil.zkey"]);

  const input = {
    poseidonHash,
  };

  try {
    const { proof, publicSignals } = await groth16.fullProve(input, wasmPath, zkeyPath);
    if (!hasMeaningfulZkProof(proof)) return null;
    const publicInput0 = publicSignals?.[0];
    if (String(publicInput0 ?? "") !== poseidonHash) {
      throw new Error("ZK public input mismatch");
    }
    if (typeof groth16.verify !== "function") {
      throw new Error("ZK verifier unavailable");
    }
    const vkey = await loadSigilVkey(params.vkey);
    if (!vkey) {
      throw new Error("ZK verifying key missing");
    }
    const verified = await groth16.verify(vkey, publicSignals, proof);
    if (!verified) {
      throw new Error("ZK proof failed verification");
    }

    const proofHints: SigilProofHints = {
      scheme: "groth16-poseidon",
      api: "/api/proof/sigil",
      explorer: `/keystream/hash/${poseidonHash}`,
      ...(params.proofHints ?? {}),
    };

    return { proof, proofHints, zkPublicInputs: publicSignals };
  } catch (err) {
    if (err instanceof Error) {
      const msg = err.message;
      if (
        msg.includes("ZK public input mismatch") ||
        msg.includes("ZK proof failed verification")
      ) {
        throw err;
      }
    }
    if (!apiAttempted) {
      return fetchSigilProofFromApi({
        poseidonHash,
        proofHints: params.proofHints,
        payloadHashHex: params.payloadHashHex,
      });
    }
    return null;
  }
}
