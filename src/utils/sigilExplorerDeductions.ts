// src/utils/sigilExplorerDeductions.ts
// Shared storage + events for Sigil Explorer Φ deductions.

export const EXPLORER_DEDUCTIONS_LS_KEY = "kai:sigil-explorer-deductions:v1";
export const EXPLORER_DEDUCTIONS_EVENT = "sigil:explorer:deductions";

export type ExplorerDeductionTotals = Record<string, number>;

type ExplorerDeductionPayload = {
  updatedAt: number;
  totals: ExplorerDeductionTotals;
};

const hasWindow = typeof window !== "undefined";

function normalizeTotals(raw: ExplorerDeductionTotals): ExplorerDeductionTotals {
  const entries = Object.entries(raw)
    .map(([k, v]) => [k.toLowerCase(), Number.isFinite(v) ? Number(v) : 0] as const)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const out: ExplorerDeductionTotals = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

function readRawPayload(): ExplorerDeductionPayload | null {
  if (!hasWindow) return null;
  try {
    const raw = window.localStorage.getItem(EXPLORER_DEDUCTIONS_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    if ("totals" in (parsed as ExplorerDeductionPayload)) {
      const totals = (parsed as ExplorerDeductionPayload).totals ?? {};
      if (totals && typeof totals === "object") {
        return {
          updatedAt: Number((parsed as ExplorerDeductionPayload).updatedAt ?? 0) || 0,
          totals: totals as ExplorerDeductionTotals,
        };
      }
    }

    if (typeof parsed === "object") {
      return { updatedAt: 0, totals: parsed as ExplorerDeductionTotals };
    }
  } catch {
    // ignore malformed storage
  }
  return null;
}

export function readExplorerDeductions(): ExplorerDeductionTotals {
  const payload = readRawPayload();
  if (!payload) return {};
  return normalizeTotals(payload.totals ?? {});
}

export function getExplorerDeduction(canonical: string | null | undefined): number {
  if (!canonical) return 0;
  const totals = readExplorerDeductions();
  return totals[canonical.toLowerCase()] ?? 0;
}

export function writeExplorerDeductions(totals: ExplorerDeductionTotals): void {
  if (!hasWindow) return;
  const normalized = normalizeTotals(totals);
  const payload: ExplorerDeductionPayload = {
    updatedAt: Date.now(),
    totals: normalized,
  };

  try {
    const prev = readRawPayload();
    const prevNorm = prev ? normalizeTotals(prev.totals ?? {}) : {};
    if (JSON.stringify(prevNorm) === JSON.stringify(normalized)) return;
    window.localStorage.setItem(EXPLORER_DEDUCTIONS_LS_KEY, JSON.stringify(payload));
  } catch {
    // ignore write failures
  }

  try {
    window.dispatchEvent(new CustomEvent(EXPLORER_DEDUCTIONS_EVENT, { detail: payload }));
  } catch {
    // ignore dispatch failures
  }
}
