import { blake3Hex } from "./hash";

export const KSFP_CACHE_NAME = "ksfp1-store-v1";
export const KSFP_ORIGIN_PREFIX = "/ksfp1/origin";
export const KSFP_LINEAGE_PREFIX = "/ksfp1/lineage";
export const KSFP_BLOB_PREFIX = "/ksfp1/blobs";

const textEncoder = new TextEncoder();

export type KsfpLineageKey = {
  format: "KFC-1";
  "data-type": "lineage-file-chunk";
  originKeyRef: string;
  tier: number;
  chunkIndex: number;
  chunkByteOffset: number;
  chunkByteLength: number;
  hashAlg: "BLAKE3";
  chunkHash: string;
  merkle: {
    tree: "KMT-1";
    leafIndex: number;
    proof: string[];
    root: string;
  };
  pulse: number;
  kaiSignature: string;
  proofCapsule: {
    v: "KPV-1";
    bind: {
      originKeyRef: string;
      tier: number;
      chunkIndex: number;
      chunkByteOffset: number;
      chunkHash: string;
      merkleRoot: string;
      pulse: number;
    };
  };
  payload: {
    encoding: "ref";
    compression: "none";
    blobRef: string;
  };
};

export type KsfpChunking = {
  scheme: "FCS-1";
  baseChunkBytes: number;
  fibStart: [number, number];
  maxTier: number;
};

export type KsfpOriginManifest = {
  format: "KFG-1";
  "data-type": "origin-file";
  fileName: string;
  mime: string;
  byteLength: number;
  hashAlg: "BLAKE3";
  fileHash: string;
  pulse: number;
  kaiSignature: string;
  creatorPhiKey?: string;
  chunking: KsfpChunking;
  merkleTree: {
    tree: "KMT-1";
    leafHash: string;
    merkleRoot: string;
    leafCount: number;
  };
  lineageIndex: {
    scheme: "FIB-LI-1";
    ranges: Array<{ tier: number; count: number; chunkBytes: number }>;
  };
  specialization?: {
    kind: "video";
    container: string;
    codec?: string;
    initSegmentKey?: string;
  };
  proofCapsule: {
    v: "KPV-1";
    bind: {
      fileHash: string;
      byteLength: number;
      chunking: KsfpChunking;
      merkleRoot: string;
    };
  };
};

type ChunkPlan = {
  tier: number;
  index: number;
  offset: number;
  length: number;
  chunkBytes: number;
  leafIndex: number;
};

type ChunkRange = { tier: number; count: number; chunkBytes: number };

export function isKsfpOriginUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url, globalThis.location?.origin ?? "http://localhost");
    return u.pathname.startsWith(`${KSFP_ORIGIN_PREFIX}/`);
  } catch {
    return false;
  }
}

export function ksfpOriginUrl(originSig: string): string {
  return `${KSFP_ORIGIN_PREFIX}/${originSig}`;
}

function ksfpLineageUrl(originSig: string, tier: number, index: number): string {
  return `${KSFP_LINEAGE_PREFIX}/${originSig}/t${tier}/i${index}`;
}

function ksfpBlobUrl(chunkHash: string): string {
  return `${KSFP_BLOB_PREFIX}/${chunkHash}`;
}

function fibSequence(start: [number, number], count: number): number[] {
  const seq = [start[0], start[1]];
  while (seq.length < count) {
    seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
  }
  return seq;
}

function buildFibChunkPlan(
  byteLength: number,
  baseChunkBytes: number,
  fibStart: [number, number] = [1, 2],
): { plan: ChunkPlan[]; ranges: ChunkRange[] } {
  const plan: ChunkPlan[] = [];
  const ranges: ChunkRange[] = [];
  const fib = fibSequence(fibStart, 32);
  let offset = 0;
  let leafIndex = 0;

  for (let tier = 0; offset < byteLength; tier += 1) {
    const chunkBytes = baseChunkBytes * fib[tier];
    const count = fib[tier + 1] ?? fib[fib.length - 1];
    let tierCount = 0;

    for (let i = 0; i < count && offset < byteLength; i += 1) {
      const length = Math.min(chunkBytes, byteLength - offset);
      plan.push({ tier, index: i, offset, length, chunkBytes, leafIndex });
      offset += length;
      leafIndex += 1;
      tierCount += 1;
    }

    ranges.push({ tier, count: tierCount, chunkBytes });
  }

  return { plan, ranges };
}

async function blake3HexUtf8(value: string): Promise<string> {
  return blake3Hex(textEncoder.encode(value));
}

async function computeMerkleProofs(
  leafHashes: string[],
): Promise<{ root: string; proofs: string[][] }> {
  if (leafHashes.length === 0) {
    const empty = await blake3Hex(new Uint8Array());
    return { root: empty, proofs: [] };
  }

  const levels: string[][] = [leafHashes.slice()];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const a = prev[i];
      const b = prev[i + 1] ?? prev[i];
      next.push(await blake3HexUtf8(a + b));
    }
    levels.push(next);
  }

  const proofs = leafHashes.map((_, leafIdx) => {
    const proof: string[] = [];
    let index = leafIdx;
    for (let level = 0; level < levels.length - 1; level += 1) {
      const nodes = levels[level];
      const sibling = index ^ 1;
      proof.push(nodes[sibling] ?? nodes[index]);
      index = Math.floor(index / 2);
    }
    return proof;
  });

  return { root: levels[levels.length - 1][0], proofs };
}

async function blake3HexStream(blob: Blob, chunkSize = 4 * 1024 * 1024): Promise<string> {
  const { createBLAKE3 } = (await import("hash-wasm")) as {
    createBLAKE3: (bits?: number) => Promise<{ update: (data: Uint8Array) => void; digest: (t?: "hex") => string }>;
  };
  const hasher = await createBLAKE3();
  let offset = 0;
  while (offset < blob.size) {
    const slice = blob.slice(offset, offset + chunkSize);
    const buf = new Uint8Array(await slice.arrayBuffer());
    hasher.update(buf);
    offset += slice.size;
  }
  return hasher.digest("hex");
}

async function cachePutJson(cache: Cache, url: string, value: unknown): Promise<void> {
  await cache.put(
    new Request(url, { method: "GET" }),
    new Response(JSON.stringify(value, null, 2), { headers: { "Content-Type": "application/json" } }),
  );
}

export async function ingestKsfpFile(
  file: File,
  opts: { cacheName?: string; baseChunkBytes?: number; fibStart?: [number, number] } = {},
): Promise<{ originUrl: string; originSig: string } | null> {
  if (!("caches" in globalThis) || typeof caches.open !== "function") return null;

  const cacheName = opts.cacheName ?? KSFP_CACHE_NAME;
  const baseChunkBytes = opts.baseChunkBytes ?? 256 * 1024;
  const fibStart = opts.fibStart ?? [1, 2];
  const cache = await caches.open(cacheName);

  const { plan, ranges } = buildFibChunkPlan(file.size, baseChunkBytes, fibStart);
  const chunkHashes: string[] = [];
  const chunkMeta: Array<ChunkPlan & { chunkHash: string }> = [];

  for (const chunk of plan) {
    const slice = file.slice(chunk.offset, chunk.offset + chunk.length);
    const bytes = new Uint8Array(await slice.arrayBuffer());
    const chunkHash = await blake3Hex(bytes);
    chunkHashes.push(chunkHash);
    chunkMeta.push({ ...chunk, chunkHash });
    await cache.put(
      new Request(ksfpBlobUrl(chunkHash), { method: "GET" }),
      new Response(slice, { headers: { "Content-Type": file.type || "application/octet-stream" } }),
    );
  }

  const leafHashes: string[] = [];
  for (const hash of chunkHashes) {
    leafHashes.push(await blake3HexUtf8(hash));
  }
  const { root, proofs } = await computeMerkleProofs(leafHashes);
  const fileHash = await blake3HexStream(file);
  const originSig = fileHash;

  const pulse = Date.now();
  const chunking = {
    scheme: "FCS-1" as const,
    baseChunkBytes,
    fibStart,
    maxTier: ranges.length - 1,
  };

  const origin: KsfpOriginManifest = {
    format: "KFG-1",
    "data-type": "origin-file",
    fileName: file.name,
    mime: file.type || "application/octet-stream",
    byteLength: file.size,
    hashAlg: "BLAKE3",
    fileHash,
    pulse,
    kaiSignature: originSig,
    chunking,
    merkleTree: {
      tree: "KMT-1",
      leafHash: "blake3(chunkHash)",
      merkleRoot: root,
      leafCount: chunkMeta.length,
    },
    lineageIndex: {
      scheme: "FIB-LI-1",
      ranges,
    },
    proofCapsule: {
      v: "KPV-1",
      bind: {
        fileHash,
        byteLength: file.size,
        chunking,
        merkleRoot: root,
      },
    },
  };

  if (file.type.startsWith("video/")) {
    origin.specialization = {
      kind: "video",
      container: file.type.includes("mp4") ? "fMP4" : "webm",
      initSegmentKey: `${originSig}:t0:i0`,
    };
  }

  await cachePutJson(cache, ksfpOriginUrl(originSig), origin);

  for (const [idx, chunk] of chunkMeta.entries()) {
    const leafIndex = chunk.leafIndex;
    const lineage: KsfpLineageKey = {
      format: "KFC-1",
      "data-type": "lineage-file-chunk",
      originKeyRef: originSig,
      tier: chunk.tier,
      chunkIndex: chunk.index,
      chunkByteOffset: chunk.offset,
      chunkByteLength: chunk.length,
      hashAlg: "BLAKE3",
      chunkHash: chunk.chunkHash,
      merkle: {
        tree: "KMT-1",
        leafIndex,
        proof: proofs[leafIndex] ?? [],
        root,
      },
      pulse,
      kaiSignature: await blake3HexUtf8(`${originSig}:${chunk.tier}:${chunk.index}:${chunk.chunkHash}`),
      proofCapsule: {
        v: "KPV-1",
        bind: {
          originKeyRef: originSig,
          tier: chunk.tier,
          chunkIndex: chunk.index,
          chunkByteOffset: chunk.offset,
          chunkHash: chunk.chunkHash,
          merkleRoot: root,
          pulse,
        },
      },
      payload: {
        encoding: "ref",
        compression: "none",
        blobRef: ksfpBlobUrl(chunk.chunkHash),
      },
    };
    await cachePutJson(cache, ksfpLineageUrl(originSig, chunk.tier, chunk.index), lineage);
  }

  return { originUrl: ksfpOriginUrl(originSig), originSig };
}

export async function loadKsfpOrigin(
  originUrl: string,
  opts: { cacheName?: string } = {},
): Promise<KsfpOriginManifest | null> {
  if (!("caches" in globalThis) || typeof caches.open !== "function") return null;
  const cache = await caches.open(opts.cacheName ?? KSFP_CACHE_NAME);
  const res = await cache.match(originUrl);
  if (!res) return null;
  try {
    return (await res.json()) as KsfpOriginManifest;
  } catch {
    return null;
  }
}

export function listKsfpChunks(origin: KsfpOriginManifest): Array<{ tier: number; index: number }> {
  const chunks: Array<{ tier: number; index: number }> = [];
  for (const range of origin.lineageIndex.ranges) {
    for (let i = 0; i < range.count; i += 1) {
      chunks.push({ tier: range.tier, index: i });
    }
  }
  return chunks;
}

export async function loadKsfpLineage(
  originSig: string,
  tier: number,
  index: number,
  opts: { cacheName?: string } = {},
): Promise<KsfpLineageKey | null> {
  if (!("caches" in globalThis) || typeof caches.open !== "function") return null;
  const cache = await caches.open(opts.cacheName ?? KSFP_CACHE_NAME);
  const res = await cache.match(ksfpLineageUrl(originSig, tier, index));
  if (!res) return null;
  try {
    return (await res.json()) as KsfpLineageKey;
  } catch {
    return null;
  }
}

export async function loadKsfpChunkBuffer(
  blobRef: string,
  opts: { cacheName?: string } = {},
): Promise<ArrayBuffer | null> {
  if (!("caches" in globalThis) || typeof caches.open !== "function") return null;
  const cache = await caches.open(opts.cacheName ?? KSFP_CACHE_NAME);
  const res = await cache.match(blobRef);
  if (!res) return null;
  return res.arrayBuffer();
}
