import fs from "node:fs/promises";
import path from "node:path";

type SlugInfo = {
  raw: string;
  pulse: number | null;
  shortSig: string | null;
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
  const fallbackPath = path.join(root, "index.html");

  try {
    return await fs.readFile(distPath, "utf8");
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
  const status = statusFromQuery(requestUrl.searchParams.get("status"));

  const statusLabel = status === "verified" ? "VERIFIED" : status === "failed" ? "FAILED" : "STANDBY";
  const pulseLabel = slug.pulse ? String(slug.pulse) : "—";
  const title = `Proof of Breath™ — ${statusLabel}`;
  const description = `Proof of Breath™ • ${statusLabel} • Pulse ${pulseLabel}`;

  const canonicalSlug = slug.raw || slugRaw;
  const verifyUrl = `${origin}/verify/${encodeURIComponent(canonicalSlug)}`;

  const ogUrl = new URL(`${origin}/api/og/verify`);
  ogUrl.searchParams.set("slug", canonicalSlug);
  ogUrl.searchParams.set("status", status);

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
