import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolvePath = (p) => path.resolve(__dirname, p);
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5173);

const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

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
  const pathname = decodeURIComponent(url.pathname);
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

  const server = createHttpServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    if (isProd) {
      const clientRoot = resolvePath("dist/client");
      if (tryServeStatic(req, res, clientRoot)) return;
    }

    const runSsr = async () => {
      const url = req.url || "/";
      const templatePath = isProd ? "dist/client/index.html" : "index.html";
      let template = await fs.readFile(resolvePath(templatePath), "utf-8");
      if (!isProd && vite) {
        template = await vite.transformIndexHtml(url, template);
      }

      const [head, tail] = template.split("<!--ssr-outlet-->");
      const initialData = { url };
      const ssrHead = `<script>window.__INITIAL_DATA__=${safeJson(initialData)};</script>`;
      const htmlHead = head.replace("<!--ssr-head-->", ssrHead);

      const { render } = isProd
        ? await import(resolvePath("dist/server/entry-server.js"))
        : await vite.ssrLoadModule("/src/entry-server.tsx");

      let didError = false;
      const bodyStream = new PassThrough();
      bodyStream.on("end", () => {
        res.write(tail);
        res.end();
      });

      const { pipe, abort } = render(url, {
        onShellReady() {
          res.statusCode = didError ? 500 : 200;
          res.setHeader("Content-Type", "text/html");
          res.setHeader("Cache-Control", "no-cache");
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
