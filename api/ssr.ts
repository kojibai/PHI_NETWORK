// api/ssr.ts
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PipeableStream } from "react-dom/server";

type SsrRenderOptions = {
  onShellReady: () => void;
  onAllReady: () => void;
  onShellError: (error: unknown) => void;
  onError: (error: unknown) => void;
};

type RenderFn = (
  url: string,
  snapshot: unknown | null,
  options: SsrRenderOptions
) => PipeableStream;

type SsrModule = {
  render?: RenderFn;
  default?: RenderFn | { render?: RenderFn };
};

type ManifestEntry = {
  file?: string;
  isEntry?: boolean;
  imports?: string[];
  src?: string;
};

function pickRender(mod: unknown): RenderFn | null {
  if (!mod || typeof mod !== "object") return null;
  const m = mod as SsrModule;

  const candidate =
    m.render ??
    (typeof m.default === "function" ? m.default : m.default?.render);

  return typeof candidate === "function" ? (candidate as RenderFn) : null;
}

function toPublicPath(file?: string): string | null {
  if (!file) return null;
  return file.startsWith("/") ? file : `/${file}`;
}

function buildSsrHead(): string {
  const parts: string[] = [];
  const manifestPaths = [
    path.join(process.cwd(), "dist", ".vite", "manifest.json"),
    path.join(process.cwd(), "dist", "client", ".vite", "manifest.json"),
  ];

  try {
    const manifestPath = manifestPaths.find((candidate) => fs.existsSync(candidate));
    if (manifestPath) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, ManifestEntry>;
      const entryKey =
        Object.keys(manifest).find((key) => manifest[key]?.src?.includes("entry-client")) ??
        Object.keys(manifest).find((key) => manifest[key]?.isEntry);
      const entry = entryKey ? manifest[entryKey] : null;

      const preloadFiles = new Set<string>();
      if (entry?.file) preloadFiles.add(entry.file);
      entry?.imports?.forEach((imp) => {
        const file = manifest[imp]?.file ?? imp;
        if (file) preloadFiles.add(file);
      });

      preloadFiles.forEach((file) => {
        const href = toPublicPath(file);
        if (href) parts.push(`<link rel="modulepreload" href="${href}">`);
      });
    }
  } catch (err) {
    console.warn("SSR manifest preload failed:", err);
  }

  parts.push('<link rel="preload" href="/phi.svg" as="image" type="image/svg+xml">');
  return parts.join("");
}

function splitTemplate(template: string): { head: string; tail: string } {
  const marker = "<!--ssr-outlet-->";
  if (template.includes(marker)) {
    const [head, ...rest] = template.split(marker);
    return { head, tail: rest.join(marker) };
  }

  const root = '<div id="root"></div>';
  const idx = template.indexOf(root);
  if (idx >= 0) {
    return {
      head: template.slice(0, idx) + '<div id="root">',
      tail: "</div>" + template.slice(idx + root.length),
    };
  }

  const bodyClose = "</body>";
  const j = template.indexOf(bodyClose);
  if (j >= 0) {
    return { head: template.slice(0, j), tail: template.slice(j) };
  }

  return { head: template, tail: "" };
}

function absoluteUrl(req: IncomingMessage): URL {
  const protoRaw = req.headers["x-forwarded-proto"] ?? "https";
  const hostRaw = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const proto = String(protoRaw).split(",")[0].trim();
  const host = String(hostRaw).split(",")[0].trim();
  const p = req.url ?? "/";
  return new URL(`${proto}://${host}${p}`);
}

function formatErrorForDebug(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}\n\n${err.stack ?? ""}`;
  }
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

type TemplateParts = { head: string; tail: string };

function minimalTemplate(): TemplateParts {
  return {
    head:
      "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><div id=\"root\">",
    tail: "</div></body></html>",
  };
}

function loadTemplate(): TemplateParts {
  const templatePath = path.join(process.cwd(), "dist", "server", "template.html");
  try {
    const template = fs.readFileSync(templatePath, "utf8");
    const templateWithHead = template.replace("<!--ssr-head-->", buildSsrHead());
    return splitTemplate(templateWithHead);
  } catch (err) {
    console.error("SSR template load failed:", err);
    return minimalTemplate();
  }
}

function respondWithShell(
  res: ServerResponse,
  parts: TemplateParts,
  requestId: string,
  opts: { debug: boolean; error?: unknown }
) {
  if (!res.headersSent) {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-ssr", "0");
    res.setHeader("x-ssr-request-id", requestId);
  }

  if (opts.debug && opts.error) {
    const payload = escapeHtml(formatErrorForDebug(opts.error));
    res.end(`${parts.head}<pre>${payload}</pre>${parts.tail}`);
    return;
  }

  res.end(parts.head + parts.tail);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const ABORT_DELAY_MS = 10_000;
  const requestId = randomUUID();

  try {
    const url = absoluteUrl(req);
    const DEBUG = url.searchParams.has("__ssr_debug") || req.headers["x-ssr-debug"] === "1";
    const templateParts = loadTemplate();
    const { head, tail } = templateParts;

    const entryPath = path.join(process.cwd(), "dist", "server", "entry-server.js");
    const entryUrl = pathToFileURL(entryPath).href;

    let render: RenderFn | null = null;
    try {
      const mod = (await import(entryUrl)) as unknown;
      render = pickRender(mod);
    } catch (err) {
      console.error(`[SSR ${requestId}] entry import failed:`, err);
      respondWithShell(res, templateParts, requestId, { debug: DEBUG, error: err });
      return;
    }

    if (!render) {
      console.error(`[SSR ${requestId}] entry missing render() export`);
      respondWithShell(res, templateParts, requestId, { debug: DEBUG });
      return;
    }

    // We want to always return HTML. If SSR fails, we fall back to the empty shell
    // so the client bundle can still boot + hydrate.
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-ssr", "1");
    res.setHeader("x-ssr-request-id", requestId);

    let shellFlushed = false;
    let pipeable: PipeableStream | null = null;

    const pass = new PassThrough();

    // When React stream ends, append tail and close response.
    pass.on("end", () => {
      if (!res.writableEnded) res.end(tail);
    });

    pass.on("error", () => {
      if (!res.writableEnded) res.end(tail);
    });

    const timeout = setTimeout(() => {
      try {
        pipeable?.abort();
      } catch {
        // ignore
      }
    }, ABORT_DELAY_MS);

    // Abort if client disconnects
    req.on("close", () => {
      clearTimeout(timeout);
      try {
        pipeable?.abort();
      } catch {
        // ignore
      }
    });

    const opts: SsrRenderOptions = {
      onShellReady() {
        if (shellFlushed) return;
        shellFlushed = true;

        // Start with head, then stream React, tail is appended on stream end.
        res.write(head);
        pass.pipe(res, { end: false });
        pipeable?.pipe(pass);
      },

      onAllReady() {
        // optional
      },

      onShellError(err) {
        clearTimeout(timeout);
        console.error("SSR shell error:", err);

        // If shell failed before onShellReady, we still want to return an HTML document.
        // Debug mode: show error details in the browser.
        if (!shellFlushed) {
          if (!res.writableEnded) {
            respondWithShell(res, templateParts, requestId, { debug: DEBUG, error: err });
          }
          return;
        }

        // If shell already started streaming, we can’t safely replace the document.
        // End what we can.
        if (!res.writableEnded) res.end(tail);
      },

      onError(err) {
        // recoverable errors can happen; keep streaming if possible
        console.error("SSR render error:", err);
      },
    };

    // Start React SSR stream
    try {
      pipeable = render(url.pathname + url.search, null, opts);
    } catch (err) {
      console.error(`[SSR ${requestId}] render crashed:`, err);
      respondWithShell(res, templateParts, requestId, { debug: DEBUG, error: err });
    }
  } catch (err) {
    console.error(`[SSR ${requestId}] function crashed:`, err);
    const DEBUG = req.headers["x-ssr-debug"] === "1";
    respondWithShell(res, loadTemplate(), requestId, { debug: DEBUG, error: err });
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
