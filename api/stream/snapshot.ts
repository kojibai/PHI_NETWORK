import { decodeCursor, encodeCursor, getStreamIndex } from "./data";

type Req = { url?: string };
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  const requestUrl = new URL(req.url ?? "/api/stream/snapshot", "http://localhost");
  const compact = requestUrl.searchParams.get("compact") === "1";
  const limit = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get("limit") ?? "200")));
  const index = await getStreamIndex();

  const cursor = decodeCursor(requestUrl.searchParams.get("cursor"), index.latestPulse);
  const rows = index.rows.filter((row) => row.pulse <= cursor.anchorPulse);
  const slice = rows.slice(cursor.offset, cursor.offset + limit);
  const nextOffset = cursor.offset + slice.length;
  const nextCursor = nextOffset < rows.length ? encodeCursor({ offset: nextOffset, anchorPulse: cursor.anchorPulse }) : null;

  const bodyRows = compact
    ? slice.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview }))
    : slice;

  const body = {
    seal: index.latestSeal,
    latestSeal: index.latestSeal,
    latestPulse: index.latestPulse,
    anchorPulse: cursor.anchorPulse,
    nextCursor,
    rows: bodyRows,
  };
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
