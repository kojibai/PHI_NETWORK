import { getCapsuleByHash, getCapsuleByVerifierSlug } from "../src/og/capsuleStore";

type HeaderValue = string | string[] | undefined;

type ApiResponse =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; error: string };

function firstHeader(value: HeaderValue): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function getHeader(headers: Record<string, HeaderValue> | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  return firstHeader(direct);
}

function inferOrigin(req: { headers?: Record<string, HeaderValue> }): string {
  const headers = req.headers;
  const xfProtoRaw = getHeader(headers, "x-forwarded-proto");
  const xfHostRaw = getHeader(headers, "x-forwarded-host");
  const proto = (xfProtoRaw ?? "https").split(",")[0]?.trim() || "https";
  const host =
    (xfHostRaw ?? getHeader(headers, "host") ?? process.env.VERCEL_URL ?? "").split(",")[0]?.trim();
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

export default async function handler(
  req: { url?: string; headers?: Record<string, HeaderValue> },
  res: { setHeader: (key: string, value: string) => void; end: (body: string) => void; statusCode: number },
): Promise<void> {
  const origin = inferOrigin(req);
  const requestUrl = new URL(req.url ?? "/", origin);
  const slugRaw = requestUrl.searchParams.get("slug") ?? "";
  let slug = slugRaw.trim();
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep raw slug
  }

  if (!slug) {
    const body: ApiResponse = { ok: false, error: "Missing slug." };
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return;
  }

  const record = getCapsuleByVerifierSlug(slug) ?? getCapsuleByHash(slug);
  if (!record) {
    const body: ApiResponse = { ok: false, error: "Record not found." };
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
    return;
  }

  const body: ApiResponse = { ok: true, record: record as Record<string, unknown> };
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export const config = {
  runtime: "nodejs",
};
