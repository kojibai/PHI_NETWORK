import fs from "node:fs/promises";
import path from "node:path";

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

function statusFromQuery(value: string | null): "verified" | "failed" | "standby" {
  const v = value?.toLowerCase().trim();
  if (v === "verified" || v === "ok" || v === "valid") return "verified";
  if (v === "failed" || v === "error" || v === "invalid") return "failed";
  return "standby";
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

function decodeBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
    return Buffer.from(`${base64}${pad}`, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

function readReceiptFromParams(params: URLSearchParams): SharedReceipt | null {
  const encoded = params.get("r") ?? params.get("receipt");
  if (!encoded) return null;
  const decoded = decodeBase64Url(encoded);
  if (!decoded) return null;
  try {
    const raw = JSON.parse(decoded);
    return parseSharedReceipt(raw);
  } catch {
    return null;
  }
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
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
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
  const statusParam = statusFromQuery(requestUrl.searchParams.get("status"));
  const status = receiptMatchesSlug && statusParam === "standby" ? "verified" : statusParam;

  const statusLabel = status === "verified" ? "VERIFIED" : status === "failed" ? "FAILED" : "STANDBY";
  const receiptPulse = receiptMatchesSlug ? receipt?.proofCapsule.pulse : null;
  const pulseLabel = receiptPulse ? String(receiptPulse) : slug.pulse ? String(slug.pulse) : "—";
  const title = `Proof of Breath™ — ${statusLabel}`;
  const description = `Proof of Breath™ • ${statusLabel} • Pulse ${pulseLabel}`;

  const verifyUrl = `${origin}/verify/${encodeURIComponent(canonicalSlug)}`;

  const ogUrl = new URL(`${origin}/api/og/verify`);
  ogUrl.searchParams.set("slug", canonicalSlug);
  ogUrl.searchParams.set("status", status);
  if (receiptMatchesSlug && receipt) {
    ogUrl.searchParams.set("pulse", String(receipt.proofCapsule.pulse));
    ogUrl.searchParams.set("phiKey", receipt.proofCapsule.phiKey);
    if (receipt.proofCapsule.chakraDay) ogUrl.searchParams.set("chakraDay", receipt.proofCapsule.chakraDay);
    if (receipt.authorSig) ogUrl.searchParams.set("kas", "1");
    if (receipt.zkVerified != null) ogUrl.searchParams.set("g16", receipt.zkVerified ? "1" : "0");
  }

  const meta = buildMetaTags({
    title: escapeHtml(title),
    description: escapeHtml(description),
    url: escapeHtml(verifyUrl),
    image: escapeHtml(ogUrl.toString()),
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
