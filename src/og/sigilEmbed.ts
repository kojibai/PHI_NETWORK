const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const FOREIGN_OBJECT_TAG = /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi;
const EVENT_HANDLER_ATTR = /\son[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_PROTOCOL_ATTR = /\s(xlink:href|href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

function stripProhibitedTags(svg: string): string {
  return svg.replace(SCRIPT_TAG, "").replace(FOREIGN_OBJECT_TAG, "");
}

function stripEventHandlers(svg: string): string {
  return svg.replace(EVENT_HANDLER_ATTR, "");
}

function sanitizeHrefValue(raw: string): string {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  const lower = value.toLowerCase();
  if (lower.startsWith("javascript:")) return "";
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "";
  return value;
}

function stripUnsafeHrefs(svg: string): string {
  return svg.replace(JS_PROTOCOL_ATTR, (match, attr, value) => {
    const sanitized = sanitizeHrefValue(String(value));
    if (!sanitized) return "";
    return ` ${String(attr)}=\"${sanitized}\"`;
  });
}

export function sanitizeSigilSvg(svg: string): string {
  const raw = svg ?? "";
  const withoutTags = stripProhibitedTags(raw);
  const withoutHandlers = stripEventHandlers(withoutTags);
  return stripUnsafeHrefs(withoutHandlers);
}

export function svgToDataUri(svg: string): string {
  const cleaned = sanitizeSigilSvg(svg);
  const encoded = encodeURIComponent(cleaned)
    .replace(/%0A/g, "")
    .replace(/%0D/g, "")
    .replace(/%09/g, "");
  return `data:image/svg+xml;utf8,${encoded}`;
}
