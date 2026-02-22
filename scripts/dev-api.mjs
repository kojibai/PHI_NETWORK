import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { URL } from "node:url";

import { generateSigilProof } from "../api/proof/sigil.js";

const PORT = Number(process.env.API_PORT ?? 8787);
const JOURNAL_PATH = path.resolve(process.cwd(), ".cache/stream-journal.dev.json");
let cachedIndex = null;

const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

  const pathName = parsed.pathname || "";
  const fromPath =
    pathName.match(/\/p\/([^/?#]+)/u)?.[1]
    ?? pathName.match(/\/(?:stream|feed)\/p\/([^/?#]+)/u)?.[1]
    ?? pathName.match(/\/p(?:~|%7[Ee])\/?([^/?#]+)/u)?.[1];
  if (fromPath) return decodeURIComponent(fromPath).trim() || null;

  const hashStr = parsed.hash && parsed.hash.startsWith("#") ? parsed.hash.slice(1) : "";
  const hashParams = new URLSearchParams(hashStr);
  for (const key of ["t", "p", "token", "capsule"]) {
    const candidate = hashParams.get(key) ?? parsed.searchParams.get(key);
    if (candidate?.trim()) return candidate.trim();
  }
  return null;
};

const encodeCursor = (state) => Buffer.from(JSON.stringify(state)).toString("base64url");
const decodeCursor = (raw, fallbackPulse) => {
  if (!raw) return { offset: 0, anchorPulse: fallbackPulse };
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return {
      offset: Math.max(0, Number(parsed.offset) || 0),
      anchorPulse: Number(parsed.anchorPulse) || fallbackPulse,
    };
  } catch {
    return { offset: 0, anchorPulse: fallbackPulse };
  }
};

const hashString = (input) => createHash("sha256").update(input).digest("hex");

const computePrefixSeals = (rows) => {
  const h = createHash("sha256");
  const seals = ["0"];
  for (const row of rows) {
    h.update(`${row.token}:${row.pulse}:${row.updatedAt}`);
    seals.push(h.copy().digest("hex").slice(0, 24));
  }
  return seals;
};

const getStreamIndex = async () => {
  const linksPath = path.resolve(process.cwd(), "public/links.json");
  let raw;
  try {
    raw = await fs.readFile(linksPath, "utf8");
  } catch {
    raw = "[]";
  }
  const sourceDigest = hashString(raw);

  if (!cachedIndex) {
    try {
      cachedIndex = JSON.parse(await fs.readFile(JOURNAL_PATH, "utf8"));
    } catch {
      cachedIndex = null;
    }
  }

  if (!cachedIndex || cachedIndex.sourceDigest !== sourceDigest) {
    const json = JSON.parse(raw);
    const rows = [];
    for (const row of json) {
      const itemUrl = typeof row?.url === "string" ? row.url.trim() : "";
      if (!itemUrl) continue;
      const token = payloadTokenFromUrl(itemUrl);
      if (!token) continue;
      rows.push({
        token,
        url: itemUrl,
        pulse: Number(row?.pulse) || 0,
        updatedAt: Number(row?.updatedAt) || 0,
        preview: {
          title: String(row?.title || "memory").slice(0, 72),
          author: String(row?.author || "@unknown"),
          pulse: Number(row?.pulse) || 0,
          kind: String(row?.kind || "text"),
          shortBody: String(row?.shortBody || "").replace(/\s+/g, " ").slice(0, 180),
          links: [itemUrl],
        },
      });
    }
    rows.sort((a, b) => a.updatedAt - b.updatedAt || a.pulse - b.pulse || a.token.localeCompare(b.token));
    cachedIndex = {
      sourceDigest,
      rows,
      seals: computePrefixSeals(rows),
    };
    await fs.mkdir(path.dirname(JOURNAL_PATH), { recursive: true });
    await fs.writeFile(JOURNAL_PATH, JSON.stringify(cachedIndex), "utf8");
  }

  const prefixIndexBySeal = new Map();
  for (let i = 0; i < cachedIndex.seals.length; i += 1) prefixIndexBySeal.set(cachedIndex.seals[i], i);

  return {
    sourceDigest: cachedIndex.sourceDigest,
    rows: cachedIndex.rows,
    latestSeal: cachedIndex.seals[cachedIndex.seals.length - 1] ?? "0",
    latestPulse: cachedIndex.rows[cachedIndex.rows.length - 1]?.pulse ?? 0,
    sealByCount: cachedIndex.seals,
    prefixIndexBySeal,
  };
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

  if (req.method === "OPTIONS") return void res.writeHead(204).end();

  if (url.pathname === "/api/proof/sigil") {
    if (req.method !== "POST") return void res.writeHead(405).end("Method not allowed");
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
    const index = await getStreamIndex();
    sendJson(res, 200, { seal: index.latestSeal, latestPulse: index.latestPulse, total: index.rows.length, sourceDigest: index.sourceDigest });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stream/snapshot") {
    const compact = url.searchParams.get("compact") === "1";
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? "200")));
    const index = await getStreamIndex();
    const cursor = decodeCursor(url.searchParams.get("cursor"), index.latestPulse);
    const rows = index.rows.filter((row) => row.pulse <= cursor.anchorPulse);
    const slice = rows.slice(cursor.offset, cursor.offset + limit);
    const nextOffset = cursor.offset + slice.length;
    const nextCursor = nextOffset < rows.length ? encodeCursor({ offset: nextOffset, anchorPulse: cursor.anchorPulse }) : null;

    sendJson(res, 200, {
      seal: index.latestSeal,
      latestSeal: index.latestSeal,
      latestPulse: index.latestPulse,
      anchorPulse: cursor.anchorPulse,
      nextCursor,
      rows: compact ? slice.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview })) : slice,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stream/delta") {
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? "200")));
    const after = url.searchParams.get("after") ?? "";
    const index = await getStreamIndex();
    const cursor = decodeCursor(url.searchParams.get("cursor"), index.latestPulse);

    const baseCount = after ? index.prefixIndexBySeal.get(after) ?? 0 : 0;
    const changedRows = index.rows.slice(baseCount).filter((row) => row.pulse <= cursor.anchorPulse);
    const slice = changedRows.slice(cursor.offset, cursor.offset + limit);
    const nextOffset = cursor.offset + slice.length;
    const nextCursor = nextOffset < changedRows.length ? encodeCursor({ offset: nextOffset, anchorPulse: cursor.anchorPulse }) : null;
    const seal = index.sealByCount[Math.min(baseCount + nextOffset, index.rows.length)] ?? index.latestSeal;

    sendJson(res, 200, {
      seal,
      latestSeal: index.latestSeal,
      latestPulse: index.latestPulse,
      anchorPulse: cursor.anchorPulse,
      nextCursor,
      rows: slice.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview })),
    });
    return;
  }

  res.statusCode = 404;
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Sigil proof API listening on http://localhost:${PORT}`);
});
