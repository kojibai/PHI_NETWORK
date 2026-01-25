import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolvePath = (p) => path.resolve(__dirname, p);
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

const OG_PATH_PREFIX = "/og/v/verified/";
const OG_CACHE_CONTROL = "public, max-age=0, s-maxage=31536000, immutable";
const OG_CACHE_TTL_MS = 10 * 60 * 1000;
const OG_CACHE_MAX_ENTRIES = 512;

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const shortPhiKey = (phiKey) => {
  const trimmed = String(phiKey || "").trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
};

const stripQuotes = (value) => String(value || "").replace(/\"/g, "");

const sendFile = (res, filePath, cacheControl) => {
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
  if (cacheControl) {
    res.setHeader("Cache-Control", cacheControl);
  }
  fsSync.createReadStream(filePath).pipe(res);
};

const tryServeStatic = (req, res, rootDir) => {
  const url = new URL(req.url, "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    res.statusCode = 400;
    res.end("Bad Request");
    console.error("Malformed URL path", error);
    return true;
  }
  const filePath = path.join(rootDir, pathname);
  if (!filePath.startsWith(rootDir)) return false;
  if (!fsSync.existsSync(filePath) || fsSync.statSync(filePath).isDirectory()) return false;
  const isAsset = pathname.startsWith("/assets/");
  const cacheControl = isAsset ? "public, max-age=31536000, immutable" : "public, max-age=600";
  sendFile(res, filePath, cacheControl);
  return true;
};

async function createServer() {
  let vite;
  if (!isProd) {
    vite = await createViteServer({
      root: __dirname,
      server: { middlewareMode: true },
      appType: "custom",
    });
  }

  let dataCache = null;
  let ogCache = null;
  let ogModulePromise = null;

  const loadOgModule = async () => {
    if (!ogModulePromise) {
      ogModulePromise = (async () => {
        const mod = isProd
          ? await import(resolvePath("dist/server/entry-server.js"))
          : await vite.ssrLoadModule("/src/entry-server.tsx");
        return {
          renderVerifiedOgPng: mod.renderVerifiedOgPng,
          renderNotFoundOgPng: mod.renderNotFoundOgPng,
          getCapsuleByHash: mod.getCapsuleByHash,
          getCapsuleByVerifierSlug: mod.getCapsuleByVerifierSlug,
          OgLruTtlCache: mod.OgLruTtlCache,
        };
      })();
    }
    return ogModulePromise;
  };

  const buildVerifiedMeta = async (requestUrl, origin) => {
    const pathname = requestUrl.pathname || "/";
    if (!pathname.startsWith("/s/") && !pathname.startsWith("/verify/")) return "";

    const og = await loadOgModule();
    let slug;
    try {
      slug = decodeURIComponent(pathname.replace(/^\/(s|verify)\//, ""));
    } catch {
      return "";
    }
    let record = null;
    if (pathname.startsWith("/verify/")) {
      record = og.getCapsuleByVerifierSlug(slug) ?? og.getCapsuleByHash(slug);
    } else {
      record = og.getCapsuleByHash(slug);
    }
    if (!record) return "";

    const ogImageUrl = `${origin}/og/v/verified/${encodeURIComponent(record.capsuleHash)}.png`;
    const title = `VERIFIED • Pulse ${record.pulse} • ΦKey ${shortPhiKey(record.phikey)}`;
    const description = `KAS ${record.kasOk ? "✓" : "×"} • G16 ${record.g16Ok ? "✓" : "×"} • Proof of Breath™`;

    return [
      `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ].join("");
  };

  const handleOgRoute = async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.statusCode = 400;
      res.end("Bad Request");
      return true;
    }

    if (!pathname.startsWith(OG_PATH_PREFIX)) return false;
    const suffix = pathname.slice(OG_PATH_PREFIX.length);
    const capsuleHash = suffix.endsWith(".png") ? suffix.slice(0, -4) : suffix;

    if (!capsuleHash) {
      res.statusCode = 400;
      res.end("Bad Request");
      return true;
    }

    const og = await loadOgModule();
    if (!ogCache) {
      ogCache = new og.OgLruTtlCache({ maxEntries: OG_CACHE_MAX_ENTRIES, ttlMs: OG_CACHE_TTL_MS });
    }

    let cached = ogCache.get(capsuleHash);
    if (!cached) {
      const record = og.getCapsuleByHash(capsuleHash);
      const pngBuffer = record ? og.renderVerifiedOgPng(record) : og.renderNotFoundOgPng(capsuleHash);
      const etag = createHash("sha256").update(pngBuffer).digest("hex");
      cached = { pngBuffer, etag };
      ogCache.set(capsuleHash, cached);
    }

    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && stripQuotes(ifNoneMatch) === cached.etag) {
      res.statusCode = 304;
      res.setHeader("ETag", `"${cached.etag}"`);
      res.setHeader("Cache-Control", OG_CACHE_CONTROL);
      res.end();
      return true;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", cached.pngBuffer.length);
    res.setHeader("ETag", `"${cached.etag}"`);
    res.setHeader("Cache-Control", OG_CACHE_CONTROL);
    res.end(cached.pngBuffer);
    return true;
  };

  const server = createHttpServer((req, res) => {
    const handleRequest = async () => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("Bad Request");
        return;
      }

      if (await handleOgRoute(req, res)) return;

      if (isProd) {
        const clientRoot = resolvePath("dist/client");
        if (tryServeStatic(req, res, clientRoot)) return;
      }

      const runSsr = async () => {
        const url = req.url || "/";
        const origin = (() => {
          const host = req.headers.host || "localhost";
          const proto = req.headers["x-forwarded-proto"] || "http";
          if (Array.isArray(proto)) return `${proto[0]}://${host}`;
          return `${proto}://${host}`;
        })();
        const requestUrl = new URL(url, origin);

        const templatePath = isProd ? "dist/client/index.html" : "index.html";
        let template = await fs.readFile(resolvePath(templatePath), "utf-8");
        if (!isProd && vite) {
          template = await vite.transformIndexHtml(url, template);
        }

        const [head, tail] = template.split("<!--ssr-outlet-->");
        const { render, safeJsonStringify, stableJsonStringify, buildSnapshotEntries, LruTtlCache } = isProd
          ? await import(resolvePath("dist/server/entry-server.js"))
          : await vite.ssrLoadModule("/src/entry-server.tsx");

        if (!dataCache) {
          dataCache = new LruTtlCache({ maxEntries: 256 });
        }

        const snapshotEntries = await buildSnapshotEntries(requestUrl, dataCache);
        const snapshot = {
          version: "v1",
          url: `${requestUrl.pathname}${requestUrl.search}`,
          createdAtMs: Date.now(),
          data: snapshotEntries,
        };

        const etagSource = { ...snapshot, createdAtMs: 0 };
        const etag = createHash("sha256").update(stableJsonStringify(etagSource)).digest("hex");
        snapshot.meta = { etag };

        const ifNoneMatch = req.headers["if-none-match"];
        const cacheControl = "public, max-age=0, s-maxage=30, stale-while-revalidate=300";

        if (ifNoneMatch && ifNoneMatch.replace(/\"/g, "") === etag) {
          res.statusCode = 304;
          res.setHeader("ETag", `"${etag}"`);
          res.setHeader("Cache-Control", cacheControl);
          res.end();
          return;
        }

        const initialData = { url };
        const snapshotScript = `<script id=\"__SSR_SNAPSHOT__\" type=\"application/json\">${safeJsonStringify(
          snapshot,
        )}</script>`;
        const snapshotEtag = `<script>window.__SSR_SNAPSHOT_ETAG__=${safeJsonStringify(etag)};window.__KAI_SSR__=true;</script>`;
        const ogMeta = await buildVerifiedMeta(requestUrl, origin);
        const ssrHead = `${ogMeta}<script>window.__INITIAL_DATA__=${safeJsonStringify(initialData)};</script>${snapshotScript}${snapshotEtag}`;
        const htmlHead = head.replace("<!--ssr-head-->", ssrHead).replace("<div id=\"root\">", "<div id=\"root\" data-ssr=\"1\">");

        let didError = false;
        const bodyStream = new PassThrough();
        bodyStream.on("end", () => {
          res.write(tail);
          res.end();
        });

        const { pipe, abort } = render(url, snapshot, {
          onShellReady() {
            res.statusCode = didError ? 500 : 200;
            res.setHeader("Content-Type", "text/html");
            res.setHeader("Cache-Control", cacheControl);
            res.setHeader("ETag", `"${etag}"`);
            res.write(htmlHead);
            pipe(bodyStream);
            bodyStream.pipe(res, { end: false });
          },
          onShellError(error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/html");
            res.end(template.replace("<!--ssr-outlet-->", ""));
            console.error(error);
          },
          onAllReady() {
            // handled by stream end
          },
          onError(error) {
            didError = true;
            console.error(error);
          },
        });

        setTimeout(() => abort(), 15000);
      };

      if (!isProd && vite) {
        vite.middlewares(req, res, () => {
          runSsr().catch((error) => {
            vite.ssrFixStacktrace(error);
            console.error(error);
            res.statusCode = 500;
            res.end("Internal Server Error");
          });
        });
        return;
      }

      runSsr().catch((error) => {
        console.error(error);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
    };

    handleRequest().catch((error) => {
      console.error(error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  });

  server.listen(port, () => {
    console.log(`SSR server running at http://localhost:${port}`);
  });
}

createServer();
