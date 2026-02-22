import { decodeCursor, encodeCursor, getStreamIndex } from "./data";

type Req = { url?: string };
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  const requestUrl = new URL(req.url ?? "/api/stream/delta", "http://localhost");
  const limit = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get("limit") ?? "200")));
  const after = requestUrl.searchParams.get("after") ?? "";
  const index = await getStreamIndex();

  const cursor = decodeCursor(requestUrl.searchParams.get("cursor"), index.latestPulse);
  const baseCount = after ? index.prefixIndexBySeal.get(after) ?? 0 : 0;
  const changedRows = index.rows
    .slice(baseCount)
    .filter((row) => row.pulse <= cursor.anchorPulse);

  const slice = changedRows.slice(cursor.offset, cursor.offset + limit);
  const nextOffset = cursor.offset + slice.length;
  const nextCursor = nextOffset < changedRows.length
    ? encodeCursor({ offset: nextOffset, anchorPulse: cursor.anchorPulse })
    : null;

  const deliveredCount = baseCount + nextOffset;
  const seal = index.sealByCount[Math.min(deliveredCount, index.rows.length)] ?? index.latestSeal;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      seal,
      latestSeal: index.latestSeal,
      latestPulse: index.latestPulse,
      anchorPulse: cursor.anchorPulse,
      nextCursor,
      rows: slice.map((r) => ({ token: r.token, url: r.url, pulse: r.pulse, preview: r.preview })),
    }),
  );
}
