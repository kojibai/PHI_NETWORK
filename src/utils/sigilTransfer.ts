export type PhiTransferPayload = {
  kind?: string;
  version?: number;
  amountPhi?: number;
  recipient?: string | null;
  message?: string | null;
  createdAtPulseEternal?: number;
  sigilPulse?: number;
  sendPulse?: number;
  canonicalHash?: string | null;
  shareUrl?: string | null;
  sourcePhiKey?: string | null;
  kairosStamp?: Record<string, unknown>;
};

export type PhiTransferExtractResult =
  | { ok: true; payload: PhiTransferPayload; rawJson: string }
  | { ok: false; error: string };

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

function extractJsonFromMetadataBlock(block: string): string | null {
  const cdataMatch = block.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  if (cdataMatch && cdataMatch[1]) return cdataMatch[1].trim();
  const stripped = stripTags(block);
  return stripped.length ? stripped : null;
}

function parseJson(raw: string): unknown {
  return JSON.parse(raw);
}

export function extractPhiTransferFromSvg(svgText: string): PhiTransferExtractResult {
  const match = svgText.match(
    /<metadata[^>]*id=(["'])phi-transfer\1[^>]*>([\s\S]*?)<\/metadata>/i
  );

  if (!match) {
    return { ok: false, error: "No phi-transfer metadata block found." };
  }

  const jsonText = extractJsonFromMetadataBlock(match[2]);
  if (!jsonText) {
    return { ok: false, error: "phi-transfer metadata is empty." };
  }

  let parsed: unknown;
  try {
    parsed = parseJson(jsonText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid JSON in phi-transfer metadata.";
    return { ok: false, error: msg };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "phi-transfer metadata payload is not an object." };
  }

  const payload = (parsed as Record<string, unknown>).phiTransfer;
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "phiTransfer payload missing in metadata." };
  }

  return {
    ok: true,
    payload: payload as PhiTransferPayload,
    rawJson: jsonText,
  };
}
