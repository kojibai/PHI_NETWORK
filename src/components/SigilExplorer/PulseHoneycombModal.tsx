"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./SigilHoneycomb.css";
import "./PulseHoneycombModal.css";

import { memoryRegistry } from "./registryStore";
import { computeIntrinsicUnsigned, type SigilMetadataLite } from "../../utils/valuation";
import { DEFAULT_ISSUANCE_POLICY, quotePhiForUsd } from "../../utils/phi-issuance";
import LiveChart from "../valuation/chart/LiveChart";
import { COLORS } from "../valuation/constants";
import { bootstrapSeries } from "../valuation/series";
import KaiSigil from "../KaiSigil";
import type { ChakraDay } from "../KaiSigil/types";
import { N_DAY_MICRO, latticeFromMicroPulses, momentFromPulse, normalizePercentIntoStep } from "../../utils/kai_pulse";
import {
  canonicalizeUrl,
  browserViewUrl,
  explorerOpenUrl,
  contentKindForUrl,
  scoreUrlForView,
  parseHashFromUrl,
} from "./url";

type EdgeMode = "none" | "parent" | "parent+children" | "all";

type HoneyNode = {
  hash: string;
  bestUrl: string;
  sources: string[];
  payload?: Record<string, unknown>;

  pulse?: number;
  beat?: number;
  stepIndex?: number;
  chakraDay?: string;

  userPhiKey?: string;
  kaiSignature?: string;

  parentHash?: string;
  originHash?: string;

  transferDirection?: "send" | "receive";
  transferAmountPhi?: string;
  phiDelta?: string;

  degree: number;
};

type Coord = { q: number; r: number };
type Pt = { x: number; y: number };

type LayoutItem = {
  node: HoneyNode;
  x: number;
  y: number;
  cx: number;
  cy: number;
};

type EdgeLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "parent" | "child" | "origin";
};

export type PulseHoneycombModalProps = {
  open: boolean;
  pulse: number | null;
  nowPulse?: number | null;
  originUrl?: string;
  originHash?: string;
  anchor?: { x: number; y: number };
  registryRev?: number; // used only as a refresh signal (no state derived from it)
  onClose: () => void;
};

const HAS_WINDOW = typeof window !== "undefined";

const SIGIL_SELECT_CHANNEL_NAME = "sigil:explorer:select:bc:v1";
const SIGIL_SELECT_LS_KEY = "sigil:explorer:selectedHash:v1";
const ONE_PULSE_MICRO = 1_000_000n;
type IdleCompat = {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function getIdleCompat(): IdleCompat {
  return globalThis as unknown as IdleCompat;
}

function scheduleIdle(cb: () => void): { cancel: () => void } {
  const g = getIdleCompat();

  if (typeof g.requestIdleCallback === "function") {
    const id = g.requestIdleCallback(() => cb(), { timeout: 200 });
    return {
      cancel: () => {
        if (typeof g.cancelIdleCallback === "function") g.cancelIdleCallback(id);
      },
    };
  }

  const id = window.setTimeout(cb, 32);
  return { cancel: () => clearTimeout(id) };
}

const modE = (a: bigint, m: bigint) => {
  if (m === 0n) return 0n;
  const r = a % m;
  return r >= 0n ? r : r + m;
};

const gcdBI = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
};

const SIGIL_WRAP_PULSE: bigint = (() => {
  const g = gcdBI(N_DAY_MICRO, ONE_PULSE_MICRO);
  return g === 0n ? 0n : N_DAY_MICRO / g;
})();

const SIGIL_RENDER_CACHE = new Set<string>();
const PHI = (1 + Math.sqrt(5)) / 2;

const wrapPulseForSigil = (pulse: number): number => {
  if (!Number.isFinite(pulse)) return 0;
  const pulseBI = BigInt(Math.trunc(pulse));
  if (SIGIL_WRAP_PULSE <= 0n) return 0;
  const wrapped = modE(pulseBI, SIGIL_WRAP_PULSE);
  return Number(wrapped);
};

const deriveKksFromPulse = (pulse: number) => {
  const p = Number.isFinite(pulse) ? Math.trunc(pulse) : 0;
  const pμ = BigInt(p) * ONE_PULSE_MICRO;
  const { beat, stepIndex, percentIntoStep } = latticeFromMicroPulses(pμ);
  const stepPct = normalizePercentIntoStep(percentIntoStep);
  return { beat, stepIndex, stepPct };
};

const hashToUnit = (hash: string): number => {
  let acc = 0;
  for (let i = 0; i < hash.length; i += 1) {
    acc = (acc * 31 + hash.charCodeAt(i)) % 1000000;
  }
  return acc / 1000000;
};

function useDeferredSigilRender(key: string): boolean {
  const [, forceRender] = useState(0);
  const cached = SIGIL_RENDER_CACHE.has(key);

  useEffect(() => {
    if (cached) return;

    let cancelled = false;
    const task = scheduleIdle(() => {
      if (cancelled) return;
      SIGIL_RENDER_CACHE.add(key);
      forceRender((v) => v + 1);
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [cached, key]);

  return cached;
}


const HEX_DIRS: Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function ignore(): void {
  // Intentionally ignored (best-effort behavior).
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function readStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function readLowerStr(v: unknown): string | undefined {
  const s = readStr(v);
  return s ? s.toLowerCase() : undefined;
}

function readFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toTransferDirection(v: unknown): "send" | "receive" | undefined {
  const s = readStr(v);
  if (s === "send" || s === "receive") return s;
  return undefined;
}

function normalizeChakraDay(value?: string): ChakraDay {
  const v = (value ?? "").toLowerCase();
  if (v.includes("root")) return "Root";
  if (v.includes("sacral")) return "Sacral";
  if (v.includes("solar")) return "Solar Plexus";
  if (v.includes("heart")) return "Heart";
  if (v.includes("throat")) return "Throat";
  if (v.includes("third") || v.includes("brow")) return "Third Eye";
  if (v.includes("crown")) return "Crown";
  return "Root";
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    ignore();
  }
}

function broadcastSelectedHash(hash: string): void {
  if (!HAS_WINDOW) return;

  safeLocalStorageSet(SIGIL_SELECT_LS_KEY, hash);

  try {
    const ch = "BroadcastChannel" in window ? new BroadcastChannel(SIGIL_SELECT_CHANNEL_NAME) : null;
    ch?.postMessage({ type: "sigil:select", hash });
    ch?.close();
  } catch {
    ignore();
  }
}

function chakraClass(chakraDay?: string): string {
  const c = (chakraDay ?? "").toLowerCase();
  if (c.includes("root")) return "chakra-root";
  if (c.includes("sacral")) return "chakra-sacral";
  if (c.includes("solar")) return "chakra-solar";
  if (c.includes("heart")) return "chakra-heart";
  if (c.includes("throat")) return "chakra-throat";
  if (c.includes("third") || c.includes("brow")) return "chakra-third";
  if (c.includes("crown")) return "chakra-crown";
  return "chakra-unknown";
}

function formatPhi(v?: string): string {
  if (!v) return "—";
  return v.startsWith("-") ? v : `+${v}`;
}

function formatUsd(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatPhiNumber(value?: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const fixed = value.toFixed(6);
  return fixed.replace(/0+$/u, "").replace(/\.$/u, "");
}

function buildValuationMeta(payload: Record<string, unknown>): SigilMetadataLite {
  return {
    pulse: readFiniteNumber(payload.pulse),
    beat: readFiniteNumber(payload.beat),
    stepIndex: readFiniteNumber(payload.stepIndex),
    chakraDay: readStr(payload.chakraDay),
    userPhiKey: readStr(payload.userPhiKey),
    kaiSignature: readLowerStr(payload.kaiSignature),
    transfers: Array.isArray(payload.transfers) ? (payload.transfers as SigilMetadataLite["transfers"]) : undefined,
    segments: Array.isArray(payload.segments) ? (payload.segments as SigilMetadataLite["segments"]) : undefined,
    ip: isRecord(payload.ip) ? (payload.ip as SigilMetadataLite["ip"]) : undefined,
  };
}

function computeLivePhi(payload: Record<string, unknown>, nowPulse: number | null): number | null {
  if (nowPulse == null || !Number.isFinite(nowPulse)) return null;
  try {
    const meta = buildValuationMeta(payload);
    const { unsigned } = computeIntrinsicUnsigned(meta, nowPulse);
    return Number.isFinite(unsigned.valuePhi) ? unsigned.valuePhi : null;
  } catch {
    return null;
  }
}

function computeUsdPerPhi(payload: Record<string, unknown>, nowPulse: number | null): number | null {
  if (nowPulse == null || !Number.isFinite(nowPulse)) return null;
  try {
    const meta = buildValuationMeta(payload);
    const quote = quotePhiForUsd(
      {
        meta,
        nowPulse,
        usd: 100,
        currentStreakDays: 0,
        lifetimeUsdSoFar: 0,
      },
      DEFAULT_ISSUANCE_POLICY,
    );
    return Number.isFinite(quote.usdPerPhi) ? quote.usdPerPhi : null;
  } catch {
    return null;
  }
}

function shortHash(h: string, n = 10): string {
  return h.length <= n ? h : h.slice(0, n);
}

function formatAtlasId(originHash?: string, originUrl?: string, activePulse?: number | null): string {
  if (originHash) return `atlas-${shortHash(originHash, 16)}`;
  if (originUrl) {
    try {
      return `atlas-${new URL(originUrl).host}`;
    } catch {
      return `atlas-${shortHash(originUrl, 16)}`;
    }
  }
  if (activePulse != null) return `pulse-${activePulse.toLocaleString()}`;
  return "atlas-unknown";
}

function extractHashFromUrlLoose(url: string): string | null {
  const h = parseHashFromUrl(url);
  if (typeof h === "string" && h.length) return h.toLowerCase();
  const m = url.match(/\/s\/([0-9a-f]{32,128})(?:\?|$)/i);
  if (m?.[1]) return m[1].toLowerCase();
  return null;
}

function extractParentHash(payload: Record<string, unknown>): string | undefined {
  const direct = readLowerStr(payload.parentHash);
  if (direct) return direct;

  const parentUrl = readStr(payload.parentUrl);
  if (parentUrl) {
    const ph = extractHashFromUrlLoose(parentUrl);
    if (ph) return ph;
  }
  return undefined;
}

function extractOriginHash(payload: Record<string, unknown>): string | undefined {
  const originUrl = readStr(payload.originUrl);
  if (originUrl) {
    const oh = extractHashFromUrlLoose(originUrl);
    if (oh) return oh;
  }
  return undefined;
}

function nodeCompletenessScore(n: Partial<HoneyNode>): number {
  let s = 0;
  const bump = (v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && v.length === 0) return;
    s += 1;
  };
  bump(n.pulse);
  bump(n.beat);
  bump(n.stepIndex);
  bump(n.chakraDay);
  bump(n.userPhiKey);
  bump(n.kaiSignature);
  bump(n.parentHash);
  bump(n.originHash);
  bump(n.transferDirection);
  bump(n.transferAmountPhi);
  bump(n.phiDelta);
  return s;
}

function pickBestUrlForNode(urls: string[]): string {
  let best = urls[0] ?? "";
  let bestScore = -Infinity;

  for (const raw of urls) {
    const canon = canonicalizeUrl(raw);
    const kind = contentKindForUrl(canon);
    const s = scoreUrlForView(canon, kind);
    if (s > bestScore) {
      bestScore = s;
      best = raw;
    }
  }

  return explorerOpenUrl(best);
}

function hexSpiralCoords(n: number): Coord[] {
  if (n <= 0) return [];
  const coords: Coord[] = [{ q: 0, r: 0 }];
  let radius = 1;

  while (coords.length < n) {
    let q = HEX_DIRS[4].q * radius;
    let r = HEX_DIRS[4].r * radius;

    for (let d = 0; d < 6 && coords.length < n; d++) {
      const dq = HEX_DIRS[d].q;
      const dr = HEX_DIRS[d].r;
      for (let step = 0; step < radius && coords.length < n; step++) {
        coords.push({ q, r });
        q += dq;
        r += dr;
      }
    }

    radius += 1;
  }

  return coords;
}

function axialToPixelPointy(c: Coord, radiusPx: number): Pt {
  const x = radiusPx * Math.sqrt(3) * (c.q + c.r / 2);
  const y = radiusPx * (3 / 2) * c.r;
  return { x, y };
}

function buildNodesForPulse(pulse: number): HoneyNode[] {
  const byHash = new Map<string, HoneyNode>();

  for (const [rawUrl, payloadLoose] of memoryRegistry) {
    if (!isRecord(payloadLoose)) continue;
    const p = readFiniteNumber(payloadLoose.pulse);
    if (p !== pulse) continue;

    const url = canonicalizeUrl(rawUrl);
    const hash = extractHashFromUrlLoose(url);
    if (!hash) continue;

    const partial: Partial<HoneyNode> = {
      hash,
      bestUrl: explorerOpenUrl(url),
      sources: [url],
      payload: payloadLoose,

      pulse: p,
      beat: readFiniteNumber(payloadLoose.beat),
      stepIndex: readFiniteNumber(payloadLoose.stepIndex),
      chakraDay: readStr(payloadLoose.chakraDay),

      userPhiKey: readStr(payloadLoose.userPhiKey),
      kaiSignature: readLowerStr(payloadLoose.kaiSignature),

      parentHash: extractParentHash(payloadLoose),
      originHash: extractOriginHash(payloadLoose),

      transferDirection: toTransferDirection(payloadLoose.transferDirection),
      transferAmountPhi: readStr(payloadLoose.transferAmountPhi),
      phiDelta: readStr(payloadLoose.phiDelta),
    };

    const existing = byHash.get(hash);
    if (!existing) {
      byHash.set(hash, {
        hash,
        bestUrl: partial.bestUrl ?? explorerOpenUrl(url),
        sources: [url],
        payload: payloadLoose,
        pulse: partial.pulse,
        beat: partial.beat,
        stepIndex: partial.stepIndex,
        chakraDay: partial.chakraDay,
        userPhiKey: partial.userPhiKey,
        kaiSignature: partial.kaiSignature,
        parentHash: partial.parentHash,
        originHash: partial.originHash,
        transferDirection: partial.transferDirection,
        transferAmountPhi: partial.transferAmountPhi,
        phiDelta: partial.phiDelta,
        degree: 0,
      });
      continue;
    }

    const mergedSources = new Set<string>(existing.sources);
    mergedSources.add(url);

    const aScore = nodeCompletenessScore(existing);
    const bScore = nodeCompletenessScore(partial);
    const preferIncoming = bScore > aScore;

    byHash.set(hash, {
      ...existing,
      sources: Array.from(mergedSources),
      payload: preferIncoming ? payloadLoose : existing.payload ?? payloadLoose,
      pulse: existing.pulse ?? partial.pulse,
      beat: preferIncoming && partial.beat !== undefined ? partial.beat : existing.beat ?? partial.beat,
      stepIndex: preferIncoming && partial.stepIndex !== undefined ? partial.stepIndex : existing.stepIndex ?? partial.stepIndex,
      chakraDay: preferIncoming && partial.chakraDay ? partial.chakraDay : existing.chakraDay ?? partial.chakraDay,
      userPhiKey: preferIncoming && partial.userPhiKey ? partial.userPhiKey : existing.userPhiKey ?? partial.userPhiKey,
      kaiSignature: preferIncoming && partial.kaiSignature ? partial.kaiSignature : existing.kaiSignature ?? partial.kaiSignature,
      parentHash: preferIncoming && partial.parentHash ? partial.parentHash : existing.parentHash ?? partial.parentHash,
      originHash: preferIncoming && partial.originHash ? partial.originHash : existing.originHash ?? partial.originHash,
      transferDirection:
        preferIncoming && partial.transferDirection ? partial.transferDirection : existing.transferDirection ?? partial.transferDirection,
      transferAmountPhi:
        preferIncoming && partial.transferAmountPhi ? partial.transferAmountPhi : existing.transferAmountPhi ?? partial.transferAmountPhi,
      phiDelta: preferIncoming && partial.phiDelta ? partial.phiDelta : existing.phiDelta ?? partial.phiDelta,
      bestUrl: existing.bestUrl,
      degree: 0,
    });
  }

  // degrees within pulse
  const childrenCount = new Map<string, number>();
  for (const n of byHash.values()) {
    if (!n.parentHash) continue;
    childrenCount.set(n.parentHash, (childrenCount.get(n.parentHash) ?? 0) + 1);
  }

  for (const n of byHash.values()) {
    let deg = 0;
    if (n.parentHash) deg += 1;
    if (n.originHash) deg += 1;
    deg += childrenCount.get(n.hash) ?? 0;
    n.degree = deg;
    n.bestUrl = pickBestUrlForNode(n.sources);
  }

  return Array.from(byHash.values()).sort((a, b) => {
    if (b.degree !== a.degree) return b.degree - a.degree;
    const ab = typeof a.beat === "number" ? a.beat : -1;
    const bb = typeof b.beat === "number" ? b.beat : -1;
    if (bb !== ab) return bb - ab;
    const as = typeof a.stepIndex === "number" ? a.stepIndex : -1;
    const bs = typeof b.stepIndex === "number" ? b.stepIndex : -1;
    if (bs !== as) return bs - as;
    return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
  });
}

type ChartBundle = ReturnType<typeof bootstrapSeries>;

/**
 * Media query hook:
 * - initializes from matchMedia
 * - updates only from the "change" callback (no setState in effect body)
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (!HAS_WINDOW) return false;
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!HAS_WINDOW) return;

    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(query);
    } catch {
      return;
    }

    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    if ("addEventListener" in mql) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    const legacy = mql as unknown as {
      addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
      removeListener?: (cb: (e: MediaQueryListEvent) => void) => void;
    };

    legacy.addListener?.(onChange);
    return () => legacy.removeListener?.(onChange);
  }, [query]);

  return matches;
}

/**
 * Anchored popover positioning:
 * - NO React state
 * - writes left/top directly to the fixed shell (external system sync)
 * - clamps to viewport
 * - flips above anchor if needed
 * - recomputes on resize/scroll + shell ResizeObserver
 */
function useAnchoredPopoverPosition(args: {
  enabled: boolean;
  shellRef: React.RefObject<HTMLDivElement | null>;
  anchor?: { x: number; y: number };
}) {
  const { enabled, shellRef, anchor } = args;

  useLayoutEffect(() => {
    if (!HAS_WINDOW) return;
    if (!enabled) return;

    const shell = shellRef.current;
    if (!shell) return;
    if (!anchor) return;

    const margin = 12;
    const gap = 10;

    const place = () => {
      const el = shellRef.current;
      if (!el) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Measure current size
      const rect = el.getBoundingClientRect();

      const belowY = anchor.y + gap;
      const aboveY = anchor.y - rect.height - gap;

      const spaceBelow = vh - (belowY + rect.height) - margin;
      const spaceAbove = aboveY - margin;

      const useAbove = spaceBelow < 0 && spaceAbove > spaceBelow;

      const desiredX = anchor.x - rect.width * 0.5;
      const desiredY = useAbove ? aboveY : belowY;

      const x = clamp(desiredX, margin, Math.max(margin, vw - rect.width - margin));
      const y = clamp(desiredY, margin, Math.max(margin, vh - rect.height - margin));

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;

      // Optional: origin for any future transform effects
      el.style.transformOrigin = `${Math.max(0, anchor.x - x)}px ${Math.max(0, anchor.y - y)}px`;
      el.setAttribute("data-popover-flip", useAbove ? "above" : "below");
    };

    let raf = window.requestAnimationFrame(place);

    const onRecalc = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(place);
    };

    window.addEventListener("resize", onRecalc, { passive: true });
    window.addEventListener("scroll", onRecalc, { passive: true, capture: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => onRecalc());
      ro.observe(shell);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onRecalc as EventListener);
      window.removeEventListener("scroll", onRecalc as EventListener, true);
      ro?.disconnect();
    };
  }, [enabled, shellRef, anchor?.x, anchor?.y]);
}

const SigilHex = React.memo(function SigilHex(props: {
  node: HoneyNode;
  x: number;
  y: number;
  selected: boolean;
  isOrigin: boolean;
  nowPulse: number | null;
  onClick: () => void;
}) {
  const { node, x, y, selected, isOrigin, nowPulse, onClick } = props;

  const pulseValue = typeof node.pulse === "number" && Number.isFinite(node.pulse) ? node.pulse : 0;
  const sigilPulse = wrapPulseForSigil(pulseValue);
  const kks = deriveKksFromPulse(sigilPulse);
  const chakraDay = normalizeChakraDay(node.chakraDay);
  const sigilKey = `${sigilPulse}:${chakraDay}`;
  const renderSigil = useDeferredSigilRender(sigilKey);
  const depth = (hashToUnit(node.hash) - 0.5) * 220 * PHI;
  const livePhi = useMemo(() => (node.payload ? computeLivePhi(node.payload, nowPulse) : null), [node.payload, nowPulse]);
  const usdPerPhi = useMemo(() => (node.payload ? computeUsdPerPhi(node.payload, nowPulse) : null), [node.payload, nowPulse]);
  const liveUsd = livePhi != null && usdPerPhi != null ? livePhi * usdPerPhi : null;

  const ariaParts: string[] = [];
  if (typeof node.pulse === "number") ariaParts.push(`pulse ${node.pulse}`);
  if (Number.isFinite(kks.beat) && Number.isFinite(kks.stepIndex)) ariaParts.push(`beat ${kks.beat} step ${kks.stepIndex}`);
  if (node.chakraDay) ariaParts.push(node.chakraDay);
  ariaParts.push(shortHash(node.hash, 12));
  const aria = ariaParts.join(" — ");

  return (
    <button
      type="button"
      className={[
        "sigilHex",
        chakraClass(node.chakraDay),
        node.transferDirection ? `xfer-${node.transferDirection}` : "",
        isOrigin ? "isOrigin" : "",
        selected ? "isSelected" : "",
      ].join(" ")}
      style={{ transform: `translate3d(${x}px, ${y}px, ${depth.toFixed(2)}px)` }}
      onClick={onClick}
      aria-label={aria}
      title={aria}
    >
      <div className="sigilHexInner">
        <div className="sigilHexGlyphFrame" aria-hidden="true">
          {renderSigil ? (
            <KaiSigil
              pulse={sigilPulse}
              beat={kks.beat}
              stepIndex={kks.stepIndex}
              stepPct={kks.stepPct}
              chakraDay={chakraDay}
              size={48}
              hashMode="deterministic"
              animate={false}
            />
          ) : (
            <div className="sigilHexGlyphPlaceholder" />
          )}
        </div>

        <div className="sigilHexTop">
          <span className="sigilHexPulse">{typeof node.pulse === "number" ? node.pulse : "—"}</span>
          <span className="sigilHexHash">{shortHash(node.hash)}</span>
        </div>

        <div className="sigilHexMid">
          <span className="sigilHexBeat">
            {kks.beat}:{kks.stepIndex}
          </span>
          <span className="sigilHexDelta">{livePhi != null ? `${formatPhiNumber(livePhi)} Φ` : "—"}</span>
          <span className="sigilHexUsd">{liveUsd != null ? `$${formatUsd(liveUsd)}` : "—"}</span>
        </div>

        <div className="sigilHexBot">
          <span className="sigilHexChakra">{node.chakraDay || "—"}</span>
        </div>
      </div>
    </button>
  );
});

/* ─────────────────────────────────────────────────────────────
   Wrapper Modal
   - matches YOUR CSS exactly (sizes, backdrop alignment, z-index)
   - anchored popover positions via left/top on fixed shell (NO setState)
   - sheet mode uses a click-catcher (so it can't get "stuck")
   - body uses flex so header wrapping never cuts content
───────────────────────────────────────────────────────────── */

export default function PulseHoneycombModal(props: PulseHoneycombModalProps) {
  const { open, pulse, nowPulse, originUrl, originHash, anchor, onClose } = props;

  const shellRef = useRef<HTMLDivElement | null>(null);

  const isCompactSheet = useMediaQuery("(max-width: 720px), (max-height: 720px)");
  const anchored = !!anchor && !isCompactSheet;

  useAnchoredPopoverPosition({
    enabled: open && anchored,
    shellRef,
    anchor,
  });

  // ESC close + focus close button + focus trap (advanced, no state)
  useEffect(() => {
    if (!HAS_WINDOW) return;
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    const focusClose = () => {
      const btn = shellRef.current?.querySelector<HTMLButtonElement>(".phmBtnClose");
      btn?.focus();
    };

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = shellRef.current;
      if (!root) return;

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));

      if (focusables.length === 0) return;

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.setTimeout(focusClose, 0);
    const root = shellRef.current;
    root?.addEventListener("keydown", trap);

    return () => {
      window.removeEventListener("keydown", onKey);
      root?.removeEventListener("keydown", trap);
    };
  }, [open, onClose]);

  // body scroll lock (external system)
  useEffect(() => {
    if (!HAS_WINDOW) return;
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [open]);

  const portalEl = HAS_WINDOW ? document.body : null;
  if (!open || portalEl == null) return null;

  const key = `${pulse ?? "none"}:${originHash ?? ""}:${originUrl ?? ""}`;

  const backdropClass = [
    "phmBackdrop",
    anchored ? "phmBackdrop--anchored" : "",
    isCompactSheet ? "phmBackdrop--sheet" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const shellClass = [
    "phmShell",
    anchored ? "phmShell--anchored" : "",
    isCompactSheet ? "phmShell--sheet" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className={backdropClass} role="presentation">
      {/* Sheet click-catcher: keeps sheet dismissible without breaking anchored click-through behavior */}
      {!anchored ? (
        <div
          style={{ position: "fixed", inset: 0, pointerEvents: "auto" }}
          onMouseDown={() => onClose()}
          aria-hidden="true"
        />
      ) : null}

      <div
        ref={shellRef}
        className={shellClass}
        role="dialog"
        aria-modal={!anchored}
        aria-label="Pulse Atlas"
        data-anchored={anchored ? "1" : "0"}
      >
        <PulseHoneycombInner key={key} {...props} nowPulse={nowPulse} />
      </div>
    </div>,
    portalEl,
  );
}

function PulseHoneycombInner({ pulse, nowPulse, originUrl, originHash, registryRev, onClose }: PulseHoneycombModalProps) {
  const [edgeMode] = useState<EdgeMode>("parent+children");
  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);
  const [atlasPanelOpen, setAtlasPanelOpen] = useState(false);
  const [atlasPanelExpanded, setAtlasPanelExpanded] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [vpSize, setVpSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [userInteracted, setUserInteracted] = useState<boolean>(false);
  const [userPan, setUserPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const dragRef = useRef<{ active: boolean; x0: number; y0: number; panX0: number; panY0: number }>({
    active: false,
    x0: 0,
    y0: 0,
    panX0: 0,
    panY0: 0,
  });

  // ResizeObserver (subscription callback => OK)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setVpSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activePulse = typeof pulse === "number" ? pulse : null;
  const pricingPulse = typeof nowPulse === "number" ? nowPulse : activePulse;
  void registryRev;

  const nodesRaw = useMemo(() => {
    if (activePulse == null) return [];
    return buildNodesForPulse(activePulse);
  }, [activePulse, registryRev]);

  const originCandidate = useMemo(() => {
    return (originHash ?? (originUrl ? extractHashFromUrlLoose(originUrl) : null)) ?? null;
  }, [originHash, originUrl]);

  const byHash = useMemo(() => {
    const m = new Map<string, HoneyNode>();
    for (const n of nodesRaw) m.set(n.hash, n);
    return m;
  }, [nodesRaw]);

  const childrenByParent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const n of nodesRaw) {
      if (!n.parentHash) continue;
      const arr = m.get(n.parentHash) ?? [];
      arr.push(n.hash);
      m.set(n.parentHash, arr);
    }
    return m;
  }, [nodesRaw]);

  const filtered = nodesRaw;
  const selectionPool = filtered.length > 0 ? filtered : nodesRaw;

  const computedInitialHash = useMemo(() => {
    if (selectionPool.length === 0) return null;
    if (originCandidate && byHash.has(originCandidate)) return originCandidate;

    let best: HoneyNode | null = null;
    for (const n of selectionPool) {
      if (!best) best = n;
      else if (n.degree > best.degree) best = n;
    }
    return best?.hash ?? selectionPool[0].hash;
  }, [selectionPool, originCandidate, byHash]);

  const selectedHash = useMemo(() => {
    const ov = selectedOverride ? selectedOverride.toLowerCase() : null;
    if (ov && byHash.has(ov)) return ov;
    return computedInitialHash;
  }, [selectedOverride, byHash, computedInitialHash]);

  const selected = useMemo(() => (selectedHash ? byHash.get(selectedHash) ?? null : null), [selectedHash, byHash]);

  const selectedPulse =
    selected && typeof selected.pulse === "number" && Number.isFinite(selected.pulse) ? wrapPulseForSigil(selected.pulse) : null;

  const selectedKks = selectedPulse != null ? deriveKksFromPulse(selectedPulse) : null;
  const atlasId = useMemo(() => formatAtlasId(originHash, originUrl, activePulse), [originHash, originUrl, activePulse]);
  const atlasStats = useMemo(() => {
    const uniqueSources = new Set<string>();
    let transferCount = 0;
    let totalDegree = 0;
    const chakraCounts = new Map<string, number>();
    let anchor: HoneyNode | null = null;

    for (const node of nodesRaw) {
      node.sources.forEach((s) => uniqueSources.add(s));
      if (node.transferDirection) transferCount += 1;
      totalDegree += node.degree;
      const chakra = node.chakraDay ?? "Unknown";
      chakraCounts.set(chakra, (chakraCounts.get(chakra) ?? 0) + 1);
      if (!anchor || node.degree > anchor.degree) anchor = node;
    }

    let topChakra: string | null = null;
    let topCount = 0;
    chakraCounts.forEach((count, chakra) => {
      if (count > topCount) {
        topChakra = chakra;
        topCount = count;
      }
    });

    return {
      nodeCount: nodesRaw.length,
      sourceCount: uniqueSources.size,
      transferCount,
      avgDegree: nodesRaw.length ? totalDegree / nodesRaw.length : 0,
      anchorHash: anchor?.hash ?? null,
      topChakra,
      topChakraCount: topCount,
    };
  }, [nodesRaw]);

  const activeMoment = useMemo(() => (activePulse != null ? momentFromPulse(activePulse) : null), [activePulse]);
  const activePulseLabel = activePulse != null ? activePulse.toLocaleString() : "—";
  const activeChakraDay = activeMoment?.chakraDay ?? "Root";

  const pulseValue = useMemo(() => {
    if (activePulse == null) return { phi: null, usd: null, usdPerPhi: null };

    let phiTotal = 0;
    let usdPerPhi: number | null = null;

    for (const [, payloadLoose] of memoryRegistry) {
      if (!isRecord(payloadLoose)) continue;
      const p = readFiniteNumber(payloadLoose.pulse);
      if (p !== activePulse) continue;

      const phiValue = computeLivePhi(payloadLoose, pricingPulse);
      if (phiValue != null) phiTotal += phiValue;

      if (usdPerPhi == null) {
        const found = computeUsdPerPhi(payloadLoose, pricingPulse);
        if (found != null) usdPerPhi = found;
      }
    }

    const phi = Number.isFinite(phiTotal) ? phiTotal : null;
    const usd = phi != null && usdPerPhi != null ? phi * usdPerPhi : null;
    return { phi, usd, usdPerPhi };
  }, [activePulse, pricingPulse, registryRev]);

  const chartBundle = useMemo<ChartBundle | null>(() => {
    if (activePulse == null) return null;
    let payload: Record<string, unknown> | null = null;

    for (const [, payloadLoose] of memoryRegistry) {
      if (!isRecord(payloadLoose)) continue;
      const p = readFiniteNumber(payloadLoose.pulse);
      if (p !== activePulse) continue;
      payload = payloadLoose;
      break;
    }

    if (!payload) return null;

    const meta = buildValuationMeta(payload);
    const { unsigned } = computeIntrinsicUnsigned(meta, activePulse);
    const seal = {
      version: 1,
      unit: "Φ",
      algorithm: "phi/kosmos-vφ-5",
      policyChecksum: unsigned.policyChecksum,
      valuePhi: unsigned.valuePhi,
      premium: unsigned.premium,
      inputs: unsigned.inputs,
      computedAtPulse: unsigned.computedAtPulse,
      headRef: unsigned.headRef,
      stamp: "0",
    } as const;

    return bootstrapSeries(seal, meta, activePulse, 64);
  }, [activePulse, registryRev]);

  const layout = useMemo(() => {
    const N = filtered.length;
    const coords = hexSpiralCoords(N);

    const radiusPx = Math.round(30 * PHI);
    const pts: Pt[] = coords.map((c) => axialToPixelPointy(c, radiusPx));

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const hexW = Math.sqrt(3) * radiusPx;
    const hexH = 2 * radiusPx;
    const pad = 120;

    const offX = (Number.isFinite(minX) ? -minX : 0) + pad;
    const offY = (Number.isFinite(minY) ? -minY : 0) + pad;

    const items: LayoutItem[] = filtered.map((node, i) => {
      const p = pts[i] ?? { x: 0, y: 0 };
      const x = p.x + offX - hexW / 2;
      const y = p.y + offY - hexH / 2;
      const cx = p.x + offX;
      const cy = p.y + offY;
      return { node, x, y, cx, cy };
    });

    const width = (Number.isFinite(maxX - minX) ? maxX - minX : 0) + pad * 2 + hexW;
    const height = (Number.isFinite(maxY - minY) ? maxY - minY : 0) + pad * 2 + hexH;

    const itemByHash = new Map<string, LayoutItem>();
    for (const it of items) itemByHash.set(it.node.hash, it);

    const centerOf = (hash: string | null): Pt | null => {
      if (!hash) return null;
      const it = itemByHash.get(hash);
      return it ? { x: it.cx, y: it.cy } : null;
    };

    return { width, height, items, itemByHash, centerOf };
  }, [filtered]);

  const autoPan = useMemo(() => {
    if (!selectedHash) return { x: 0, y: 0 };
    if (!vpSize.w || !vpSize.h) return { x: 0, y: 0 };
    const c = layout.centerOf(selectedHash);
    if (!c) return { x: 0, y: 0 };
    return { x: vpSize.w / 2 - c.x * zoom, y: vpSize.h / 2 - c.y * zoom };
  }, [selectedHash, vpSize.w, vpSize.h, layout, zoom]);

  const pan = userInteracted ? userPan : autoPan;

  const edgeLines = useMemo<EdgeLine[]>(() => {
    if (!selectedHash) return [];
    if (edgeMode === "none") return [];

    const selItem = layout.itemByHash.get(selectedHash);
    const sel = byHash.get(selectedHash);
    if (!selItem || !sel) return [];

    const lines: EdgeLine[] = [];
    const addLine = (toHash: string | undefined, kind: EdgeLine["kind"]) => {
      if (!toHash) return;
      const tgt = layout.itemByHash.get(toHash);
      if (!tgt) return;
      lines.push({ x1: selItem.cx, y1: selItem.cy, x2: tgt.cx, y2: tgt.cy, kind });
    };

    if (edgeMode === "parent" || edgeMode === "parent+children" || edgeMode === "all") addLine(sel.parentHash, "parent");
    if (edgeMode === "parent+children" || edgeMode === "all") {
      const kids = childrenByParent.get(sel.hash) ?? [];
      for (const k of kids) addLine(k, "child");
    }
    if (edgeMode === "all") addLine(sel.originHash, "origin");

    return lines;
  }, [selectedHash, edgeMode, layout, byHash, childrenByParent]);

  const resetToAutoCenter = () => {
    setUserInteracted(false);
    setUserPan({ x: 0, y: 0 });
  };

  const selectHash = (hash: string) => {
    const h = hash.toLowerCase();
    setSelectedOverride(h);
    broadcastSelectedHash(h);
    resetToAutoCenter();
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = viewportRef.current;
    if (!el) return;

    const delta = e.deltaY;
    const nextZoom = clamp(zoom * (delta > 0 ? 0.92 : 1.08), 0.35, 3.0);

    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const curPan = pan;
    const worldX = (mx - curPan.x) / zoom;
    const worldY = (my - curPan.y) / zoom;

    const nextPanX = mx - worldX * nextZoom;
    const nextPanY = my - worldY * nextZoom;

    setZoom(nextZoom);
    setUserInteracted(true);
    setUserPan({ x: nextPanX, y: nextPanY });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target instanceof HTMLElement && e.target.closest(".sigilHex")) return;

    setUserInteracted(true);
    dragRef.current = { active: true, x0: e.clientX, y0: e.clientY, panX0: pan.x, panY0: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x0;
    const dy = e.clientY - dragRef.current.y0;
    setUserPan({ x: dragRef.current.panX0 + dx, y: dragRef.current.panY0 + dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      ignore();
    }
  };

  const openSelected = () => {
    if (!selected) return;
    window.open(selected.bestUrl, "_blank", "noopener,noreferrer");
  };

  const copySelectedUrl = async () => {
    if (!selected) return;
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(selected.bestUrl);
    } catch {
      ignore();
    }
  };

  return (
    <div className="phmRoot" aria-label="Pulse Atlas" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <header className="phmHeader">
        <div className="phmHeaderLeft">
          <div className="phmSigilCard" aria-label="Pulse sigil glyph">
            <div className="phmSigilFrame">
              {activePulse != null ? (
                <KaiSigil pulse={activePulse} chakraDay={activeChakraDay} size={60} animate />
              ) : (
                <div className="phmSigilPlaceholder" />
              )}
            </div>
            <div className="phmSigilMeta">
              <div className="phmSigilMetaMain">
                <div className="phmSigilPulse">☤KAI {activePulseLabel}</div>
                <div className="phmSigilSub">
                  <span>Beat {activeMoment?.beat ?? "—"}</span>
                  <span className="phmDot">•</span>
                  <span>Step {activeMoment?.stepIndex ?? "—"}</span>
                  <span className="phmDot">•</span>
                  <span>{activeChakraDay}</span>
                </div>
              </div>
              <div className="phmSigilKeys" aria-label="Active ΦKey and KaiSignature">
                <div className="phmSigilKey">
                  <span className="phmSigilKeyLabel">ΦKey</span>
                  <span className="phmSigilKeyValue" title={selected?.userPhiKey ?? "No ΦKey"}>
                    {selected?.userPhiKey ? shortHash(selected.userPhiKey, 18) : "—"}
                  </span>
                </div>
                <div className="phmSigilKey">
                  <span className="phmSigilKeyLabel">KaiSig</span>
                  <span className="phmSigilKeyValue" title={selected?.kaiSignature ?? "No KaiSignature"}>
                    {selected?.kaiSignature ? shortHash(selected.kaiSignature, 18) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="phmHeaderStack">
            <div className="phmTitleBlock">
              <div id="phmTitle" className="phmTitle">
        

              </div>
            </div>


          </div>

          <div className="phmChart" aria-label="Live pulse chart">
            <span className="phmChartBadge">
              <span className="phmLiveDot" aria-hidden="true" />
              LIVE
            </span>
            {chartBundle ? (
              <LiveChart
                data={chartBundle.lineData}
                live={pulseValue.phi ?? chartBundle.lineData[chartBundle.lineData.length - 1]?.value ?? 0}
                pv={chartBundle.lineData[chartBundle.lineData.length - 1]?.value ?? 0}
                premiumX={1}
                momentX={1}
                colors={Array.from(COLORS)}
                height={86}
                usdPerPhi={pulseValue.usdPerPhi ?? 0}
                mode="usd"
              />
            ) : (
              <div className="phmChartEmpty">No pulse data</div>
            )}
          </div>
        </div>

        <div className="phmHeaderRight">
          <div className="phmValueCard" aria-live="polite">
            <div className="phmValueLabel">Pulse Value</div>
            <div className="phmValuePhi">{pulseValue.phi != null ? `${formatPhiNumber(pulseValue.phi)} Φ` : "—"}</div>
            <div className="phmValueUsd">{pulseValue.usd != null ? `$${formatUsd(pulseValue.usd)}` : "—"}</div>
            <div className="phmValueMeta">{pulseValue.usdPerPhi != null ? `$${formatUsd(pulseValue.usdPerPhi)} / Φ` : "Live rate"}</div>
          </div>

          <button type="button" className="phmBtn phmBtnClose" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </header>

      {/* IMPORTANT: override the CSS height calc so header wrapping never cuts content */}
      <div className="phmBody" style={{ flex: "1 1 auto", minHeight: 0, height: "auto" }}>
        <div className="phmCombPanel">
          <div
            className="phmViewport combViewport"
            ref={viewportRef}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              className="combInner"
              style={{
                width: `${layout.width}px`,
                height: `${layout.height}px`,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <svg className="combEdges" width={layout.width} height={layout.height} aria-hidden="true">
                {edgeLines.map((ln, i) => (
                  <line
                    key={`${ln.kind}-${i}`}
                    x1={ln.x1}
                    y1={ln.y1}
                    x2={ln.x2}
                    y2={ln.y2}
                    className={`edgeLine edge-${ln.kind}`}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>

              {layout.items.map((it) => (
                <SigilHex
                  key={it.node.hash}
                  node={it.node}
                  x={it.x}
                  y={it.y}
                  isOrigin={originCandidate != null && it.node.hash === originCandidate}
                  selected={it.node.hash === selectedHash}
                  nowPulse={pricingPulse}
                  onClick={() => selectHash(it.node.hash)}
                />
              ))}
            </div>

            <button
              type="button"
              className="combHint phmHint phmHintButton"
              onClick={() => setAtlasPanelOpen((prev) => !prev)}
              aria-expanded={atlasPanelOpen}
            >
              Atlas ID: {atlasId}
            </button>
            {atlasPanelOpen ? (
              <div className="phmAtlasPanel" role="dialog" aria-label="Pulse atlas details">
                <div className="phmAtlasPanelHead">
                  <span className="phmAtlasTitle">Pulse Atlas Details</span>
                  <button type="button" className="phmBtn phmAtlasClose" onClick={() => setAtlasPanelOpen(false)}>
                    ✕
                  </button>
                </div>
                <div className="phmAtlasPanelBody">
                  <div className="phmAtlasRow">
                    <span>Glyphs</span>
                    <span>{atlasStats.nodeCount}</span>
                  </div>
                  <div className="phmAtlasRow">
                    <span>Sources linked</span>
                    <span>{atlasStats.sourceCount}</span>
                  </div>
                  <div className="phmAtlasRow">
                    <span>Transfers tagged</span>
                    <span>{atlasStats.transferCount}</span>
                  </div>
                  {atlasPanelExpanded ? (
                    <>
                      <div className="phmAtlasRow">
                        <span>Avg degree</span>
                        <span>{atlasStats.avgDegree.toFixed(1)}</span>
                      </div>
                      <div className="phmAtlasRow">
                        <span>Top chakra</span>
                        <span>{atlasStats.topChakra ? `${atlasStats.topChakra} (${atlasStats.topChakraCount})` : "—"}</span>
                      </div>
                      <div className="phmAtlasRow">
                        <span>Anchor glyph</span>
                        <span>{atlasStats.anchorHash ? shortHash(atlasStats.anchorHash, 12) : "—"}</span>
                      </div>
                      <div className="phmAtlasHint">Drag to pan • Scroll to zoom</div>
                    </>
                  ) : null}
                </div>
                <div className="phmAtlasPanelActions">
                  <button type="button" className="phmBtn" onClick={() => setAtlasPanelExpanded((prev) => !prev)}>
                    {atlasPanelExpanded ? "Less" : "More"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="phmInspector">
          {/* SUPER IMPORTANT: make selection never cut off (scroll region inside card) */}
          <div
            className="inspectorCard phmInspectorCard"
            style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
          >
            <div className="inspectorHead" style={{ flex: "0 0 auto" }}>
              <div className="inspectorTitle">Selection</div>
              <div className="inspectorSub">{selected ? shortHash(selected.hash, 16) : "—"}</div>
            </div>

            <div
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                overflow: "auto",
                paddingTop: 10,
              }}
            >
              <div className="inspectorGrid">
                {selected?.pulse != null && (
                  <>
                    <div className="k">Pulse</div>
                    <div className="v mono">{selected.pulse}</div>
                  </>
                )}

                {selectedPulse != null && selectedKks && (
                  <>
                    <div className="k">Beat:Step</div>
                    <div className="v mono">
                      {selectedKks.beat}:{selectedKks.stepIndex}
                    </div>
                  </>
                )}

                {selected?.chakraDay && (
                  <>
                    <div className="k">Chakra</div>
                    <div className="v">{selected.chakraDay}</div>
                  </>
                )}

                {selected?.phiDelta && (
                  <>
                    <div className="k">ΔΦ</div>
                    <div className="v mono">{formatPhi(selected.phiDelta)}</div>
                  </>
                )}

                {selected?.transferDirection && (
                  <>
                    <div className="k">Transfer</div>
                    <div className="v">{selected.transferDirection}</div>
                  </>
                )}

                {selected?.parentHash && (
                  <>
                    <div className="k">Parent</div>
                    <div className="v mono">
                      {byHash.has(selected.parentHash) ? (
                        <button className="linkBtn" type="button" onClick={() => selectHash(selected.parentHash!)}>
                          {shortHash(selected.parentHash, 14)}
                        </button>
                      ) : (
                        shortHash(selected.parentHash, 14)
                      )}
                    </div>
                  </>
                )}

                {selected?.originHash && (
                  <>
                    <div className="k">Origin</div>
                    <div className="v mono">
                      {byHash.has(selected.originHash) ? (
                        <button className="linkBtn" type="button" onClick={() => selectHash(selected.originHash!)}>
                          {shortHash(selected.originHash, 14)}
                        </button>
                      ) : (
                        shortHash(selected.originHash, 14)
                      )}
                    </div>
                  </>
                )}

                {selected?.degree != null && (
                  <>
                    <div className="k">Degree</div>
                    <div className="v mono">{selected.degree}</div>
                  </>
                )}
              </div>

              {selected?.sources?.length ? (
                <details className="sources" style={{ marginTop: 12 }}>
                  <summary>Sources ({selected.sources.length})</summary>
                  <div className="sourcesList">
                    {selected.sources.slice(0, 40).map((s, i) => (
                      <div key={`${i}-${s}`} className="sourceItem mono">
                        {browserViewUrl(s)}
                      </div>
                    ))}
                    {selected.sources.length > 40 ? <div className="sourceMore">… {selected.sources.length - 40} more</div> : null}
                  </div>
                </details>
              ) : null}
            </div>

            {/* Actions: sticky inside the card so they never disappear */}
            <div
              className="inspectorActions"
              style={{
                flex: "0 0 auto",
                position: "sticky",
                bottom: 0,
                paddingTop: 10,
                marginTop: 10,
                background: "linear-gradient(to top, rgba(0,0,0,0.45), rgba(0,0,0,0))",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            >
              <button type="button" className="primaryBtn" onClick={openSelected} disabled={!selected}>
                Open
              </button>
              <button type="button" className="miniBtn" onClick={copySelectedUrl} disabled={!selected}>
                Remember
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
