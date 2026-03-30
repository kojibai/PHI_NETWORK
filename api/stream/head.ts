import { getStreamIndex } from "./data";

type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void };

export default async function handler(_req: unknown, res: Res): Promise<void> {
  const index = await getStreamIndex();
  const body = { seal: index.latestSeal, latestPulse: index.latestPulse, total: index.rows.length, sourceDigest: index.sourceDigest };
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
