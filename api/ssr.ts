// api/ssr.ts
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PassThrough } from "node:stream";
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
    const head = template.slice(0, idx) + '<div id="root">';
    const tail = "</div>" + template.slice(idx + root.length);
    return { head, tail };
  }

  const bodyClose = "</body>";
  const j = template.indexOf(bodyClose);
  if (j >= 0) {
    return { head: template.slice(0, j), tail: template.slice(j) };
  }

  return { head: template, tail: "" };
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const templatePath = path.join(process.cwd(), "dist", "server", "template.html");
  const template = fs.readFileSync(templatePath, "utf8");
  const { head, tail } = splitTemplate(template);

  const entryPath = path.join(process.cwd(), "dist", "server", "entry-server.js");
  const entryUrl = pathToFileURL(entryPath).href;

  const mod = (await import(entryUrl)) as unknown;
  const render = pickRender(mod);
  if (!render) {
    return new Response("SSR entry missing render() export", { status: 500 });
  }

  const ABORT_DELAY_MS = 10_000;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let shellFlushed = false;

      const nodeStream = new PassThrough();

      nodeStream.on("data", (chunk) => {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : new Uint8Array(chunk));
      });

      nodeStream.on("end", () => {
        controller.enqueue(encoder.encode(tail));
        controller.close();
      });

      nodeStream.on("error", (err) => {
        controller.error(err);
      });

      let pipeable: PipeableStream | null = null;

      const opts: SsrRenderOptions = {
        onShellReady() {
          if (shellFlushed) return;
          shellFlushed = true;

          controller.enqueue(encoder.encode(head));
          pipeable?.pipe(nodeStream);
        },
        onAllReady() {
          // no-op
        },
        onShellError(err) {
          controller.error(err);
        },
        onError() {
          // React may call this for recoverable errors during streaming.
          // We keep streaming unless onShellError fires.
        },
      };

      try {
        pipeable = render(url.pathname + url.search, opts);
      } catch (err) {
        controller.error(err);
        return;
      }

      setTimeout(() => {
        try {
          pipeable?.abort();
        } catch {
          // ignore
        }
      }, ABORT_DELAY_MS);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
