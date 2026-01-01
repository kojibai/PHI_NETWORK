// api/proxy/lahmahtorProxy.mjs
const PRIMARY = "https://m.kai.ac";
const BACKUP = "https://memory.kaiklok.com";

const FAILOVER_TIMEOUT_MS = 8000;

function shouldFailoverStatus(status) {
  if (status === 0) return true;          // network/unknown
  if (status === 404) return true;        // route missing on one base
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  return false;
}

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

function copyUpstreamHeaders(upHeaders, res) {
  for (const [k, v] of upHeaders.entries()) {
    const key = k.toLowerCase();
    // skip hop-by-hop / unsafe
    if (key === "set-cookie") continue;
    if (key === "connection") continue;
    if (key === "transfer-encoding") continue;
    res.setHeader(k, v);
  }
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FAILOVER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function proxyOnce(base, req, upstreamPath, rawBody) {
  const url = base + upstreamPath;

  // forward minimal safe headers
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v) continue;
    const key = k.toLowerCase();
    if (key === "host") continue;
    if (key === "connection") continue;
    if (key === "content-length") continue;
    headers.set(k, Array.isArray(v) ? v.join(",") : v);
  }

  const method = (req.method || "GET").toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : rawBody;

  return fetchWithTimeout(url, {
    method,
    headers,
    body,
    redirect: "manual",
  });
}

/**
 * Same-origin handler:
 * /api/lahmahtor/*  ->  https://align.kaiklok.com/* (failover to https://m.phi.network/*)
 */
export async function handleLahmahtorProxy(req, res, url) {
  const method = (req.method || "GET").toUpperCase();

  // Strip /api/lahmahtor prefix
  const upstreamPath = url.pathname.replace(/^\/api\/lahmahtor/, "") + (url.search || "");
  const path = upstreamPath.startsWith("/") ? upstreamPath : `/${upstreamPath}`;

  const rawBody = method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readRaw(req);

  let primaryRes = null;
  try {
    primaryRes = await proxyOnce(PRIMARY, req, path, rawBody);
  } catch {
    primaryRes = null;
  }

  let finalRes = primaryRes;

  if (!finalRes || shouldFailoverStatus(finalRes.status)) {
    try {
      const backupRes = await proxyOnce(BACKUP, req, path, rawBody);
      // Prefer backup if primary missing/unreachable OR backup ok
      if (!finalRes || backupRes.ok) finalRes = backupRes;
    } catch {
      // keep whatever we had
    }
  }

  if (!finalRes) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "lahmahtor_upstream_unreachable" }));
    return;
  }

  res.statusCode = finalRes.status;
  copyUpstreamHeaders(finalRes.headers, res);

  const buf = Buffer.from(await finalRes.arrayBuffer());
  res.end(buf);
}
