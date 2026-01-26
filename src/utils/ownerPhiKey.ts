import { jcsCanonicalize } from "./jcs";
import { sha256Hex } from "./sha256";

export type OwnerKeyDerivation = {
  v: "OPK-1";
  method: "phiKey@pulse";
  originPhiKey?: string;
  receivePulse: number;
  binds: { receiveBundleHash: string };
};

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);

  let out = "";
  while (n > 0n) {
    const mod = Number(n % 58n);
    out = B58_ALPHABET[mod] + out;
    n /= 58n;
  }

  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) out = "1" + out;
  return out;
}

async function base58Check(payload: Uint8Array, version = 0x00): Promise<string> {
  const v = new Uint8Array(1 + payload.length);
  v[0] = version;
  v.set(payload, 1);

  const c1 = await crypto.subtle.digest("SHA-256", v as BufferSource);
  const c2 = await crypto.subtle.digest("SHA-256", c1);

  const checksum = new Uint8Array(c2).slice(0, 4);
  const full = new Uint8Array(v.length + 4);
  full.set(v);
  full.set(checksum, v.length);
  return base58Encode(full);
}

function phiKeyPayloadFromHash(hashHex: string): Uint8Array {
  const raw = new Uint8Array(20);
  for (let i = 0; i < 20; i += 1) {
    raw[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }
  return raw;
}

export async function deriveOwnerPhiKeyFromReceive(args: {
  receiverPubKeyJwk: JsonWebKey;
  receivePulse: number;
  receiveBundleHash: string;
}): Promise<string> {
  const receiverJson = jcsCanonicalize(args.receiverPubKeyJwk as Parameters<typeof jcsCanonicalize>[0]);
  const receiverId = await sha256Hex(receiverJson);
  const seed = `phi.owner.receive.v1|${receiverId}|${String(args.receivePulse)}|${args.receiveBundleHash}`;
  const seedHash = await sha256Hex(seed);
  const payload = phiKeyPayloadFromHash(seedHash);
  return base58Check(payload, 0x00);
}

export function buildOwnerKeyDerivation(args: {
  originPhiKey?: string;
  receivePulse: number;
  receiveBundleHash: string;
}): OwnerKeyDerivation {
  return {
    v: "OPK-1",
    method: "phiKey@pulse",
    originPhiKey: args.originPhiKey,
    receivePulse: args.receivePulse,
    binds: { receiveBundleHash: args.receiveBundleHash },
  };
}
