import fs from "node:fs/promises";
import path from "node:path";
import { decodeVerifyShareR_SSR } from "../src/utils/verifyShareR.ssr";

type SlugInfo = {
  raw: string;
  pulse: number | null;
  shortSig: string | null;
};

type ProofCapsule = {
  v: "KPV-1";
  pulse: number;
  chakraDay: string;
  kaiSignature: string;
  phiKey: string;
  verifierSlug: string;
};

type SharedReceipt = {
  proofCapsule: ProofCapsule;
  authorSig?: unknown;
  zkVerified?: boolean;
};

function parseSlug(rawSlug: string): SlugInfo {
  let raw = (rawSlug || "").trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep raw as-is when decoding fails (avoid crashing the function).
  }
  const m = raw.match(/^(\d+)-([A-Za-z0-9]+)$/);
  if (!m) return { raw, pulse: null, shortSig: null };

  const pulseNum = Number(m[1]);
  const pulse = Number.isFinite(pulseNum) && pulseNum > 0 ? pulseNum : null;
  const shortSig = m[2] ? String(m[2]) : null;

  return { raw, pulse, shortSig };
}

function parseProofCapsule(raw: unknown): ProofCapsule | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== "KPV-1") return null;
  if (typeof record.pulse !== "number" || !Number.isFinite(record.pulse)) return null;
  if (typeof record.chakraDay !== "string") return null;
  if (typeof record.kaiSignature !== "string") return null;
  if (typeof record.phiKey !== "string") return null;
  if (typeof record.verifierSlug !== "string") return null;
  return record as ProofCapsule;
}

function parseSharedReceipt(raw: unknown): SharedReceipt | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const proofCapsule = parseProofCapsule(record.proofCapsule);
  if (!proofCapsule) return null;
  return {
    proofCapsule,
    authorSig: record.authorSig,
    zkVerified: typeof record.zkVerified === "boolean" ? record.zkVerified : undefined,
  };
}

function shortPhiKey(phiKey: string): string {
  const trimmed = String(phiKey || "").trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function readReceiptFromParams(params: URLSearchParams): SharedReceipt | null {
  const encoded = params.get("r") ?? params.get("receipt");
  if (!encoded) return null;
  const decoded = decodeVerifyShareR_SSR(encoded);
  return parseSharedReceipt(decoded);
}

function buildMetaTags(params: {
  title: string;
  description: string;
  url: string;
  image: string;
}): string {
  const { title, description, url, image } = params;
  return [
    `<title>${title}</title>`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildFallbackHtml(meta: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${meta}
  </head>
  <body>
    <main style="font-family: system-ui, sans-serif; padding: 24px;">
      <h1>Verify</h1>
      <p>Loading the verifier shell failed. Please refresh or open the home page.</p>
      <p><a href="/">Open home</a></p>
    </main>
  </body>
</html>`;
}

async function readIndexHtml(origin: string): Promise<string> {
  const root = process.cwd();
  const distPath = path.join(root, "dist", "index.html");
  const ssrTemplatePath = path.join(root, "dist", "server", "template.html");
  const fallbackPath = path.join(root, "index.html");

  try {
    return await fs.readFile(distPath, "utf8");
  } catch {
    try {
      return await fs.readFile(ssrTemplatePath, "utf8");
    } catch {
      try {
        return await fs.readFile(fallbackPath, "utf8");
      } catch {
        try {
          const res = await fetch(`${origin}/index.html`);
          if (res.ok) return await res.text();
        } catch {
          // ignore
        }
        try {
          const res = await fetch(`${origin}/`);
          if (res.ok) return await res.text();
        } catch {
          // ignore
        }
        return "";
      }
    }
  }
}

type HeaderValue = string | string[] | undefined;

function firstHeader(value: HeaderValue): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function getHeader(headers: Record<string, HeaderValue> | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  // Node/Next headers are lowercased, but be safe.
  const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  return firstHeader(direct);
}

function inferOrigin(req: { headers?: Record<string, HeaderValue> }): string {
  const headers = req.headers;

  // Prefer forwarded headers (Vercel/Cloudflare/etc.)
  const xfProtoRaw = getHeader(headers, "x-forwarded-proto");
  const xfHostRaw = getHeader(headers, "x-forwarded-host");

  const proto = (xfProtoRaw ?? "https").split(",")[0]?.trim() || "https";
  const host =
    (xfHostRaw ?? getHeader(headers, "host") ?? process.env.VERCEL_URL ?? "").split(",")[0]?.trim();

  if (host) return `${proto}://${host}`;

  // Last resort: local/dev fallback
  return "http://localhost:3000";
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value != null && typeof value === "object";
}

function readNestedRecord(value: unknown, key: string): RecordValue | null {
  if (!isRecord(value)) return null;
  const next = value[key];
  return isRecord(next) ? next : null;
}

function readStringField(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const next = value[key];
  return typeof next === "string" ? next : null;
}

function readBoolField(value: unknown, key: string): boolean {
  if (!isRecord(value)) return false;
  return value[key] === true;
}

function readKasVersion(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return readStringField(value, "v");
}

function pickSocialImageUrl(payload: RecordValue | null): string | null {
  if (!payload) return null;
  const proofHints = readNestedRecord(payload, "proofHints");
  const directCandidates = [
    payload.pngUrl,
    payload.posterUrl,
    payload.imageUrl,
    readStringField(proofHints, "image"),
    payload.shareImageUrl,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const shareUrl = typeof payload.shareUrl === "string" ? payload.shareUrl.trim() : "";
  if (shareUrl) {
    if (shareUrl.endsWith(".png")) return shareUrl;
    const match = shareUrl.match(/\/s\/([^/?#]+)/);
    if (match) {
      return `/s/${match[1]}.png`;
    }
  }

  return null;
}

function buildPreviewDescription(params: {
  pulse: string | null;
  phiKey: string | null;
  isZkVerified: boolean;
  isKasPresent: boolean;
}): string {
  const parts: string[] = [];
  if (params.pulse) parts.push(`Pulse ${params.pulse}`);
  if (params.phiKey) parts.push(`ΦKey ${params.phiKey}`);
  if (params.isZkVerified) parts.push("G16 ✓");
  if (params.isKasPresent) parts.push("KAS ✓");
  return parts.length > 0 ? parts.join(" • ") : "Proof of Breath™";
}

function normalizeAbsoluteUrl(value: string, origin: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
}

export default async function handler(
  req: { url?: string; headers?: Record<string, HeaderValue> },
  res: {
    setHeader: (key: string, value: string) => void;
    end: (body: string) => void;
    statusCode: number;
  }
): Promise<void> {
  const origin = inferOrigin(req);

  const requestUrl = new URL(req.url ?? "/", origin);
  const slugRaw = requestUrl.searchParams.get("slug") ?? "";
  const slug = parseSlug(slugRaw);
  const receipt = readReceiptFromParams(requestUrl.searchParams);
  const receiptSlug = receipt?.proofCapsule.verifierSlug ?? "";
  const canonicalSlug = slug.raw || slugRaw || receiptSlug;
  const receiptMatchesSlug =
    receipt != null && (!canonicalSlug || receipt.proofCapsule.verifierSlug === canonicalSlug);

  const payloadRaw = decodeVerifyShareR_SSR(requestUrl.searchParams.get("r") ?? "");
  const payload = isRecord(payloadRaw) ? payloadRaw : null;

  const isZkVerified =
    payload?.zkVerified === true ||
    readBoolField(readNestedRecord(payload, "zk"), "zkVerified") ||
    readBoolField(readNestedRecord(payload, "zkProofBundle"), "zkVerified");
  const isKasPresent =
    readKasVersion(payload?.authorSig) === "KAS-1" ||
    readKasVersion(payload?.originAuthorSig) === "KAS-1" ||
    readKasVersion(payload?.kas) === "KAS-1";

  const isVerifiedForPreview = isZkVerified === true;
  const statusLabel = isVerifiedForPreview ? "VERIFIED" : "STANDBY";

  const proofCapsule = payload && isRecord(payload.proofCapsule) ? payload.proofCapsule : null;
  const pulseLabel = proofCapsule?.pulse
    ? String(proofCapsule.pulse)
    : receiptMatchesSlug
      ? String(receipt?.proofCapsule.pulse ?? "")
      : slug.pulse
        ? String(slug.pulse)
        : null;
  const phiKey = proofCapsule?.phiKey ? shortPhiKey(String(proofCapsule.phiKey)) : null;

  const title = `Proof of Breath™ — ${statusLabel}`;
  const description = buildPreviewDescription({
    pulse: pulseLabel,
    phiKey,
    isZkVerified,
    isKasPresent,
  });

  const verifyUrl = `${origin}/verify/${encodeURIComponent(canonicalSlug)}`;
  const canonicalUrl = (() => {
    const url = new URL(verifyUrl);
    const rParam = requestUrl.searchParams.get("r");
    if (rParam) url.searchParams.set("r", rParam);
    return url.toString();
  })();

  const imageUrl = (() => {
    const picked = pickSocialImageUrl(payload);
    if (picked) return normalizeAbsoluteUrl(picked, origin);
    return normalizeAbsoluteUrl("/og-image.png", origin);
  })();

  const meta = buildMetaTags({
    title: escapeHtml(title),
    description: escapeHtml(description),
    url: escapeHtml(canonicalUrl),
    image: escapeHtml(imageUrl),
  });

  const html = await readIndexHtml(origin);
  const withMeta = html
    ? html.includes("</head>")
      ? html.replace("</head>", `${meta}</head>`)
      : `${meta}${html}`
    : buildFallbackHtml(meta);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(withMeta);
}

export const config = {
  runtime: "nodejs",
};
