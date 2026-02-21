import { loadStreamRows, sealForRows } from "./data";

type Req = { url?: string };
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  const requestUrl = new URL(req.url ?? "/api/stream/delta", "http://localhost");
  const limit = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get("limit") ?? "200")));
  const rows = await loadStreamRows();
  const after = requestUrl.searchParams.get("after") ?? "";
  const seal = sealForRows(rows);
  const start = after === seal ? rows.length : 0;
  const slice = rows.slice(start, start + limit);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ seal, rows: slice.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview })) }));
}
