import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { URL } from "node:url";

import { generateSigilProof } from "../api/proof/sigil.js";

const PORT = Number(process.env.API_PORT ?? 8787);

const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
};

const payloadTokenFromUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    parsed = new URL(value, "http://localhost");
  }

  const path = parsed.pathname || "";
  const fromPath =
    path.match(/\/p\/([^/?#]+)/u)?.[1]
    ?? path.match(/\/(?:stream|feed)\/p\/([^/?#]+)/u)?.[1]
    ?? path.match(/\/p(?:~|%7[Ee])\/?([^/?#]+)/u)?.[1];
  if (fromPath) return decodeURIComponent(fromPath).trim() || null;

  const hashStr = parsed.hash && parsed.hash.startsWith("#") ? parsed.hash.slice(1) : "";
  const hashParams = new URLSearchParams(hashStr);
  for (const key of ["t", "p", "token", "capsule"]) {
    const candidate = hashParams.get(key) ?? parsed.searchParams.get(key);
    if (candidate?.trim()) return candidate.trim();
  }

  return null;
};

const loadStreamRows = async () => {
  const linksPath = path.resolve(process.cwd(), "public/links.json");
  let raw;
  try {
    raw = await fs.readFile(linksPath, "utf8");
  } catch {
    return [];
  }
  const json = JSON.parse(raw);
  const out = [];
  for (const row of json) {
    const url = typeof row?.url === "string" ? row.url.trim() : "";
    if (!url) continue;
    const token = payloadTokenFromUrl(url);
    if (!token) continue;
    out.push({
      token,
      url,
      pulse: Number(row?.pulse) || 0,
      updatedAt: Number(row?.updatedAt) || 0,
      preview: {
        title: String(row?.title || "memory").slice(0, 72),
        author: String(row?.author || "@unknown"),
        pulse: Number(row?.pulse) || 0,
        kind: String(row?.kind || "text"),
        shortBody: String(row?.shortBody || "").replace(/\s+/g, " ").slice(0, 180),
        links: [url],
      },
    });
  }
  return out.sort((a, b) => b.pulse - a.pulse);
};

const sealForRows = (rows) => {
  const h = createHash("sha256");
  for (const row of rows) h.update(`${row.token}:${row.pulse}:${row.updatedAt}`);
  return h.digest("hex").slice(0, 24);
};

const sendJson = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (url.pathname === "/api/proof/sigil") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method not allowed");
      return;
    }

    try {
      const body = await readJson(req);
      const result = await generateSigilProof(body);
      sendJson(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Proof generation failed";
      sendJson(res, 400, { error: message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stream/head") {
    const rows = await loadStreamRows();
    const latestPulse = rows.reduce((max, row) => Math.max(max, row.pulse), 0);
    sendJson(res, 200, { seal: sealForRows(rows), latestPulse, total: rows.length });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stream/snapshot") {
    const compact = url.searchParams.get("compact") === "1";
    const rows = await loadStreamRows();
    const body = compact
      ? { seal: sealForRows(rows), rows: rows.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview })) }
      : { seal: sealForRows(rows), rows };
    sendJson(res, 200, body);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stream/delta") {
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? "200")));
    const rows = await loadStreamRows();
    const after = url.searchParams.get("after") ?? "";
    const seal = sealForRows(rows);
    const start = after === seal ? rows.length : 0;
    const slice = rows.slice(start, start + limit);
    sendJson(res, 200, { seal, rows: slice.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview })) });
    return;
  }

  res.statusCode = 404;
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Sigil proof API listening on http://localhost:${PORT}`);
});
