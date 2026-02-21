import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { extractPayloadTokenFromUrlString, decodeFeedPayload } from "../../src/utils/feedPayload";

export type StreamRow = {
  token: string;
  url: string;
  pulse: number;
  updatedAt: number;
  preview: {
    title: string;
    author: string;
    pulse: number;
    kind: string;
    shortBody: string;
    links: string[];
  };
};

function bodyText(payload: ReturnType<typeof decodeFeedPayload>): string {
  if (!payload) return "";
  const body = payload.body;
  const raw =
    body?.kind === "text"
      ? body.text
      : body?.kind === "md"
        ? body.md
        : body?.kind === "code"
          ? body.code
          : body?.kind === "html"
            ? body.html
            : payload.caption ?? "";
  return String(raw).replace(/\s+/g, " ").slice(0, 180);
}

export async function loadStreamRows(): Promise<StreamRow[]> {
  const linksPath = path.resolve(process.cwd(), "public/links.json");
  const raw = await fs.readFile(linksPath, "utf8");
  const json = JSON.parse(raw) as Array<{ url?: string }>;
  const out: StreamRow[] = [];
  for (const row of json) {
    const url = row.url?.trim();
    if (!url) continue;
    const token = extractPayloadTokenFromUrlString(url);
    if (!token) continue;
    const payload = decodeFeedPayload(token);
    if (!payload) continue;
    out.push({
      token,
      url,
      pulse: Number(payload.pulse) || 0,
      updatedAt: Number(payload.ts) || Date.now(),
      preview: {
        title: payload.caption?.slice(0, 72) || payload.body?.kind || "memory",
        author: payload.author || "@unknown",
        pulse: Number(payload.pulse) || 0,
        kind: payload.body?.kind || "text",
        shortBody: bodyText(payload),
        links: [payload.url],
      },
    });
  }
  return out.sort((a, b) => b.pulse - a.pulse);
}

export function sealForRows(rows: StreamRow[]): string {
  const h = createHash("sha256");
  for (const row of rows) h.update(`${row.token}:${row.pulse}:${row.updatedAt}`);
  return h.digest("hex").slice(0, 24);
}
