import { loadStreamRows, sealForRows } from "./data";

type Req = { url?: string };
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  const requestUrl = new URL(req.url ?? "/api/stream/delta", "http://localhost");
  const limit = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get("limit") ?? "200")));
  const rows = await loadStreamRows();
  const after = requestUrl.searchParams.get("after") ?? "";
  const latestSeal = sealForRows(rows);

  let start = 0;
  if (after === latestSeal) {
    start = rows.length;
  } else if (after) {
    for (let index = 1; index <= rows.length; index += 1) {
      const prefixSeal = sealForRows(rows.slice(0, index));
      if (prefixSeal === after) {
        start = index;
        break;
      }
    }
  }

  const slice = rows.slice(start, start + limit);
  const seal = sealForRows(rows.slice(0, start + slice.length));
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ seal, latestSeal, rows: slice.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview })) }));
}
