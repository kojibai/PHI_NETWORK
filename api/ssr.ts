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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = absoluteUrl(req);

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

    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");

    const ABORT_DELAY_MS = 10_000;

    let shellFlushed = false;
    let pipeable: PipeableStream | null = null;

    const pass = new PassThrough();
    pass.on("end", () => {
      if (!res.writableEnded) res.end(tail);
    });
    pass.on("error", () => {
      if (!res.writableEnded) res.end();
    });

    const timeout = setTimeout(() => {
      try {
        pipeable?.abort();
      } catch {
        // ignore
      }
    }, ABORT_DELAY_MS);

    // If client disconnects, abort React stream
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

        // write template head, then stream react, then tail on end
        res.write(head);
        pass.pipe(res, { end: false });
        pipeable?.pipe(pass);
      },
      onAllReady() {
        // optional
      },
      onShellError(err) {
        clearTimeout(timeout);
        console.error(err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "text/plain; charset=utf-8");
        }
        if (!res.writableEnded) res.end("SSR shell error");
      },
      onError(err) {
        // recoverable errors can happen; log and keep streaming
        console.error(err);
      },
    };

    pipeable = render(url.pathname + url.search, opts);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("SSR function crashed");
  }
}
