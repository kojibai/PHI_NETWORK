// api/ssr.ts
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PipeableStream } from "react-dom/server";

type SsrRenderOptions = {
  onShellReady: () => void;
  onAllReady: () => void;
  onShellError: (error: unknown) => void;
  onError: (error: unknown) => void;
};

type RenderFn = (url: string, options: SsrRenderOptions) => PipeableStream;

type SsrModule = {
  render?: RenderFn;
  default?: RenderFn | { render?: RenderFn };
};

function pickRender(mod: unknown): RenderFn | null {
  if (!mod || typeof mod !== "object") return null;
  const m = mod as SsrModule;

  const candidate =
    m.render ??
    (typeof m.default === "function" ? m.default : m.default?.render);

  return typeof candidate === "function" ? (candidate as RenderFn) : null;
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const ABORT_DELAY_MS = 10_000;

  try {
    const url = absoluteUrl(req);
    const DEBUG = url.searchParams.has("__ssr_debug");

    const templatePath = path.join(process.cwd(), "dist", "server", "template.html");
    const template = fs.readFileSync(templatePath, "utf8");
    const { head, tail } = splitTemplate(template);

    const entryPath = path.join(process.cwd(), "dist", "server", "entry-server.js");
    const entryUrl = pathToFileURL(entryPath).href;

    const mod = (await import(entryUrl)) as unknown;
    const render = pickRender(mod);

    if (!render) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("SSR entry missing render() export");
      return;
    }

    // We want to always return HTML. If SSR fails, we fall back to the empty shell
    // so the client bundle can still boot + hydrate.
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");

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
          if (DEBUG) {
            if (!res.writableEnded) res.end(`<pre>${escapeHtml(formatErrorForDebug(err))}</pre>`);
          } else {
            if (!res.writableEnded) res.end(head + tail);
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
    pipeable = render(url.pathname + url.search, opts);
  } catch (err) {
    console.error("SSR function crashed:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("SSR function crashed");
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
