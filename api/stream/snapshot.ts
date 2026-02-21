import { loadStreamRows, sealForRows } from "./data";

type Req = { url?: string };
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  const requestUrl = new URL(req.url ?? "/api/stream/snapshot", "http://localhost");
  const compact = requestUrl.searchParams.get("compact") === "1";
  const rows = await loadStreamRows();
  const body = compact
    ? { seal: sealForRows(rows), rows: rows.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview })) }
    : { seal: sealForRows(rows), rows };
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
