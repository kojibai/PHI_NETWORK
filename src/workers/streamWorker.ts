import { decodeFeedPayload, extractPayloadTokenFromUrlString } from "../utils/feedPayload";

type StreamRecord = {
  token: string;
  url: string;
  title: string;
  author: string;
  pulse: number;
  kind: string;
  shortBody: string;
  links: string[];
  updatedAt: number;
  parentToken?: string;
};

function project(url: string): StreamRecord | null {
  const token = extractPayloadTokenFromUrlString(url);
  if (!token) return null;
  const payload = decodeFeedPayload(token);
  if (!payload) return null;
  const bodyText =
    payload.body?.kind === "text"
      ? payload.body.text
      : payload.body?.kind === "md"
        ? payload.body.md
        : payload.body?.kind === "code"
          ? payload.body.code
          : payload.body?.kind === "html"
            ? payload.body.html
            : payload.caption ?? "";
  const links = payload.attachments?.items.flatMap((item) => {
    if (item.kind === "url") return item.url ? [item.url] : [];
    if (item.kind === "file-ref") return item.url ? [item.url] : [];
    return [];
  }) ?? [];
  if (payload.url) links.unshift(payload.url);
  return {
    token,
    url,
    title: payload.caption?.slice(0, 72) || payload.body?.kind || "memory",
    author: payload.author || "@unknown",
    pulse: Number(payload.pulse) || 0,
    kind: payload.body?.kind || (payload.seal ? "sealed" : "text"),
    shortBody: bodyText.replace(/\s+/g, " ").slice(0, 180),
    links: links.slice(0, 6),
    updatedAt: Date.now(),
    parentToken: payload.parentUrl ? extractPayloadTokenFromUrlString(payload.parentUrl) ?? undefined : undefined,
  };
}

self.onmessage = (event: MessageEvent<string[]>) => {
  const rows = event.data.map(project).filter((v): v is StreamRecord => Boolean(v));
  self.postMessage(rows);
};
