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
    if (ogModulePromise) return ogModulePromise;
    ogModulePromise = isProd
      ? import(resolvePath("dist/server/entry-server.js"))
      : vite.ssrLoadModule("/src/og/serverExports.ts");
    return ogModulePromise;
  };

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const shortPhiKey = (value) => {
    const trimmed = String(value || "").trim();
    if (trimmed.length <= 16) return trimmed || "—";
    return `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}`;
  };

  const buildVerifiedOgHead = async (requestUrl, origin) => {
    try {
      const pathname = requestUrl.pathname || "/";
      const parts = pathname.split("/").filter(Boolean);
      let capsuleData = null;

      if (parts[0] === "s" && parts[1]) {
        const canonicalHash = decodeURIComponent(parts[1]);
        const ogModule = await loadOgModule();
        if (ogModule.getCapsuleByCanonicalHash) {
          capsuleData = await ogModule.getCapsuleByCanonicalHash(canonicalHash);
        }
      } else if (parts[0] === "verify" && parts[1]) {
        const verifierSlug = decodeURIComponent(parts[1]);
        const ogModule = await loadOgModule();
        if (ogModule.getCapsuleByVerifierSlug) {
          capsuleData = await ogModule.getCapsuleByVerifierSlug(verifierSlug);
        }
      }

      if (!capsuleData) return "";

      const capsuleHash = capsuleData.capsuleHash;
      const ogImageUrl = `${origin}/og/v/verified/${encodeURIComponent(capsuleHash)}.png`;
      const title = `VERIFIED • Pulse ${capsuleData.pulse} • ΦKey ${shortPhiKey(capsuleData.phikey)}`;
      const description = `Pulse ${capsuleData.pulse} • KAS ✓ • G16 ✓ • Proof of Breath™`;

      return [
        `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
        `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
        `<meta property="og:type" content="website" />`,
      ].join("");
    } catch (error) {
      console.error("Failed to build OG head", error);
      return "";
    }
  };

  const server = createHttpServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/og/v/verified/")) {
      const handleOg = async () => {
        const ogModule = await loadOgModule();
        const cacheClass = ogModule.OgLruTtlCache;
        if (!ogCache) {
          ogCache = new cacheClass({ maxEntries: 512, defaultTtlMs: 10 * 60 * 1000 });
        }

        const pathPart = url.pathname.replace("/og/v/verified/", "");
        const rawHash = pathPart.endsWith(".png") ? pathPart.slice(0, -4) : pathPart;
        const capsuleHash = decodeURIComponent(rawHash || "");
        const cacheKey = capsuleHash || "not-found";
        const cached = ogCache.get(cacheKey);

        if (cached) {
          const ifNoneMatch = req.headers["if-none-match"];
          if (ifNoneMatch && ifNoneMatch.replace(/\"/g, "") === cached.etag) {
            res.statusCode = 304;
            res.setHeader("ETag", `"${cached.etag}"`);
            res.setHeader("Cache-Control", "public, max-age=0, s-maxage=31536000, immutable");
            res.end();
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Content-Length", String(cached.buffer.length));
          res.setHeader("ETag", `"${cached.etag}"`);
          res.setHeader("Cache-Control", "public, max-age=0, s-maxage=31536000, immutable");
          res.end(cached.buffer);
          return;
        }

        let pngBuffer;
        let ogData = null;
        if (capsuleHash) {
          ogData = await ogModule.getCapsuleByHash(capsuleHash);
        }

        if (ogData) {
          pngBuffer = ogModule.renderVerifiedOgPng(ogData);
        } else {
          pngBuffer = ogModule.renderNotFoundOgPng(capsuleHash || "unknown");
        }

        const etag = createHash("sha256").update(pngBuffer).digest("hex");
        ogCache.set(cacheKey, { buffer: pngBuffer, etag });

        const ifNoneMatch = req.headers["if-none-match"];
        if (ifNoneMatch && ifNoneMatch.replace(/\"/g, "") === etag) {
          res.statusCode = 304;
          res.setHeader("ETag", `"${etag}"`);
          res.setHeader("Cache-Control", "public, max-age=0, s-maxage=31536000, immutable");
          res.end();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", String(pngBuffer.length));
        res.setHeader("ETag", `"${etag}"`);
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=31536000, immutable");
        res.end(pngBuffer);
      };

      handleOg().catch((error) => {
        console.error(error);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
      return;
    }

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
      const ogHead = await buildVerifiedOgHead(requestUrl, origin);
      const ssrHead = `${ogHead}<script>window.__INITIAL_DATA__=${safeJsonStringify(initialData)};</script>${snapshotScript}${snapshotEtag}`;
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
  });

  server.listen(port, () => {
    console.log(`SSR server running at http://localhost:${port}`);
  });
}

createServer();
