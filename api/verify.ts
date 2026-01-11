import fs from "node:fs/promises";
import path from "node:path";

import { parseSlug } from "../src/utils/verifySigil";

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

async function readIndexHtml(): Promise<string> {
  const root = process.cwd();
  const distPath = path.join(root, "dist", "index.html");
  const fallbackPath = path.join(root, "index.html");

  try {
    return await fs.readFile(distPath, "utf8");
  } catch {
    return await fs.readFile(fallbackPath, "utf8");
  }
}

export default async function handler(req: { url?: string }, res: { setHeader: (key: string, value: string) => void; end: (body: string) => void; statusCode: number }): Promise<void> {
  const base = "https://verahai.com";
  const requestUrl = new URL(req.url ?? "/", base);
  const slugRaw = requestUrl.searchParams.get("slug") ?? "";
  const slug = parseSlug(slugRaw);
  const status = statusFromQuery(requestUrl.searchParams.get("status"));

  const statusLabel = status === "verified" ? "VERIFIED" : status === "failed" ? "FAILED" : "STANDBY";
  const pulseLabel = slug.pulse ? String(slug.pulse) : "—";
  const title = `Proof of Breath™ — ${statusLabel}`;
  const description = `Proof of Breath™ • ${statusLabel} • Pulse ${pulseLabel}`;

  const origin = requestUrl.origin || base;
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

  const html = await readIndexHtml();
  const withMeta = html.includes("</head>") ? html.replace("</head>", `${meta}</head>`) : `${meta}${html}`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(withMeta);
}

export const config = {
  runtime: "nodejs",
};
