import { loadStreamRows, sealForRows } from "./data";

type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void };

export default async function handler(_req: unknown, res: Res): Promise<void> {
  const rows = await loadStreamRows();
  const latestPulse = rows[0]?.pulse ?? 0;
  const body = { seal: sealForRows(rows), latestPulse, total: rows.length };
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
