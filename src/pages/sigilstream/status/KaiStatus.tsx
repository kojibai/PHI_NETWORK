// src/pages/sigilstream/status/KaiStatus.tsx
"use client";

/**
 * KaiStatus — Atlantean μpulse Bar
 * v5.2 — FULL KKS-1.0 COHERENCE (pulse + beat + step + day + countdown)
 *
 * ✅ FIX (Beat/Step correctness):
 * Beat + Step are derived from canonical μpulses since Genesis (SigilModal parity),
 * not from any external ticker shape that may be in mismatched units.
 *
 * ✅ FIX (Next pulse countdown correctness):
 * Countdown is derived from μpulse “now” → epoch-ms (via GENESIS_TS/PULSE_MS),
 * then aligned to the NEXT pulse boundary (exact 5.236…s cadence).
 * No fast/incorrect countdown loops.
 *
 * ✅ FIX (Day chakra correctness):
 * Day chakra follows weekday (Solhara..Kaelith), not day-of-month segmentation.
 * - Verdari → Heart (green)
 * - Sonari  → Throat (blue)
 * - Kaelith → Crown ("Krown")
 *
 * Keeps UI + portal dial behavior unchanged.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { pad2 } from "../core/utils";
import {
  GENESIS_TS,
  PULSE_MS,
  kairosEpochNow,
  microPulsesSinceGenesis,
  N_DAY_MICRO,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  MONTHS_PER_YEAR,
} from "../../../utils/kai_pulse";
import KaiKlockRaw from "../../../components/EternalKlock";
import "./KaiStatus.css";

/* ─────────────────────────────────────────────────────────────
   Pulse constants (Golden Breath)
───────────────────────────────────────────────────────────── */

const DEFAULT_PULSE_DUR_S = PULSE_MS / 1000; // exact source of truth

const ONE_PULSE_MICRO = 1_000_000n; // 1 pulse = 1e6 μpulses
const PULSES_PER_STEP_MICRO = 11_000_000n; // 11 pulses/step * 1e6
const MU_PER_BEAT_EXACT = (N_DAY_MICRO + 18n) / 36n; // round(N_DAY_MICRO/36) (SigilModal parity)

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Reads --pulse-dur from CSS and returns SECONDS.
 * Accepts:
 *  - "5236.0679ms"  -> 5.2360679
 *  - "5.2360679s"   -> 5.2360679
 *  - "5.2360679"    -> assumes seconds
 *  - "5236.0679"    -> assumes ms (heuristic)
 */
function readPulseDurSeconds(el: HTMLElement | null): number {
  if (!el) return DEFAULT_PULSE_DUR_S;

  const raw = window.getComputedStyle(el).getPropertyValue("--pulse-dur").trim();
  if (!raw) return DEFAULT_PULSE_DUR_S;

  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_PULSE_DUR_S;

  const lower = raw.toLowerCase();
  if (lower.endsWith("ms")) return v / 1000;
  if (lower.endsWith("s")) return v;

  // Heuristic: if it's huge, it was almost certainly ms.
  if (v > 1000) return v / 1000;

  return v;
}

type LayoutMode = "wide" | "tight" | "tiny" | "nano";
type BottomMode = "row" | "stack";

function layoutForWidth(width: number): LayoutMode {
  if (width > 0 && width < 360) return "nano";
  if (width > 0 && width < 520) return "tiny";
  if (width > 0 && width < 760) return "tight";
  return "wide";
}

function uiScaleFor(layout: LayoutMode): number {
  switch (layout) {
    case "nano":
      return 0.84;
    case "tiny":
      return 0.9;
    case "tight":
      return 0.95;
    default:
      return 1.0;
  }
}

function bottomModeFor(layout: LayoutMode): BottomMode {
  return layout === "nano" ? "stack" : "row";
}

function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = React.useState<number>(0);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const read = (): void => {
      const w = Math.round(el.getBoundingClientRect().width);
      setWidth(w);
    };

    read();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => read());
      ro.observe(el);
      return () => ro.disconnect();
    }

    const onResize = (): void => read();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [ref]);

  return width;
}

/* ─────────────────────────────────────────────────────────────
   Ark mapping (beats 0..35; 6 beats per ark)
───────────────────────────────────────────────────────────── */

const ARK_NAMES = ["Ignite", "Integrate", "Harmonize", "Reflekt", "Purifikation", "Dream"] as const;
type ArkName = (typeof ARK_NAMES)[number];

function arkFromBeat(beat: number): ArkName {
  const b = Number.isFinite(beat) ? Math.floor(beat) : 0;
  const idx = Math.max(0, Math.min(5, Math.floor(b / 6)));
  return ARK_NAMES[idx];
}

/* ─────────────────────────────────────────────────────────────
   KKS-1.0 BigInt helpers
───────────────────────────────────────────────────────────── */

/** Euclidean mod (always 0..m-1) */
const modE = (a: bigint, m: bigint): bigint => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};

/** Euclidean floor division (toward −∞) */
const floorDivE = (a: bigint, d: bigint): bigint => {
  if (d === 0n) throw new Error("Division by zero");
  const q = a / d;
  const r = a % d;
  return r === 0n ? q : a >= 0n ? q : q - 1n;
};

const toSafeNumber = (x: bigint): number => {
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  const MIN = BigInt(Number.MIN_SAFE_INTEGER);
  if (x > MAX) return Number.MAX_SAFE_INTEGER;
  if (x < MIN) return Number.MIN_SAFE_INTEGER;
  return Number(x);
};

const absBI = (x: bigint): bigint => (x < 0n ? -x : x);

/* ─────────────────────────────────────────────────────────────
   ✅ Canonical μpulse normalization (SigilModal-aligned robustness)
   kairosEpochNow() SHOULD return μpulses since Genesis (BigInt).
   If a build accidentally routes epoch-ms or epoch-μs here, normalize safely.
───────────────────────────────────────────────────────────── */

const GENESIS_MS_BI = BigInt(GENESIS_TS);

// “close to genesis in ms” window (≈ ±5.8 days) — strong signal for epoch-ms misuse
const NEAR_GENESIS_MS_WINDOW = 500_000_000_000n;

function normalizeKaiEpochRawToMicroPulses(raw: bigint): bigint {
  // If it looks like epoch-μs, convert to ms first.
  if (raw >= 100_000_000_000_000n) {
    // 1e14+ cannot be μpulses since 2024-genesis without being absurdly far; treat as epoch-μs.
    return microPulsesSinceGenesis(raw / 1000n);
  }

  // If it is “near” GENESIS_TS in ms-space, treat as epoch-ms.
  if (absBI(raw - GENESIS_MS_BI) <= NEAR_GENESIS_MS_WINDOW) {
    return microPulsesSinceGenesis(raw);
  }

  // Default: assume correct μpulses-since-Genesis.
  return raw;
}

function kaiPulseFromMicro(pμ_total: bigint): number {
  return toSafeNumber(floorDivE(pμ_total, ONE_PULSE_MICRO));
}

function beatStepFromMicroTotal(pμ_total: bigint): { beat: number; step: number } {
  const pμ_in_day = modE(pμ_total, N_DAY_MICRO);

  const beatBI = floorDivE(pμ_in_day, MU_PER_BEAT_EXACT);
  const beat = Math.max(0, Math.min(35, toSafeNumber(beatBI)));

  const pμ_in_beat = pμ_in_day - BigInt(beat) * MU_PER_BEAT_EXACT;
  const step = Math.max(0, Math.min(43, toSafeNumber(pμ_in_beat / PULSES_PER_STEP_MICRO)));

  return { beat, step };
}

function harmonicDayFromMicroTotal(pμ_total: bigint): string {
  const dayIdx = floorDivE(pμ_total, N_DAY_MICRO); // days since genesis
  const idx = toSafeNumber(modE(dayIdx, 6n)); // 0..5
  const WEEKDAY = ["Solhara", "Aquaris", "Flamora", "Verdari", "Sonari", "Kaelith"] as const;
  return WEEKDAY[Math.max(0, Math.min(5, idx))] ?? "Solhara";
}

function kaiDMYFromMicroKKS(pμ_total: bigint): { day: number; month: number; year: number } {
  const dayIdx = floorDivE(pμ_total, N_DAY_MICRO); // days since genesis
  const monthIdx = floorDivE(dayIdx, BigInt(DAYS_PER_MONTH)); // months since genesis
  const yearIdx = floorDivE(dayIdx, BigInt(DAYS_PER_YEAR)); // years since genesis

  const dayOfMonth = toSafeNumber(modE(dayIdx, BigInt(DAYS_PER_MONTH))) + 1; // 1..42
  const month = toSafeNumber(modE(monthIdx, BigInt(MONTHS_PER_YEAR))) + 1; // 1..8
  const year = toSafeNumber(yearIdx); // 0..

  return { day: dayOfMonth, month, year };
}

/* ─────────────────────────────────────────────────────────────
   ✅ Countdown: μpulse “now” → aligned NEXT boundary (5.236s)
   (SigilModal parity: boundary timestamps only)
───────────────────────────────────────────────────────────── */

function epochMsFromMicroPulses(pμ: bigint): number {
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
  if (pμ > maxSafe || pμ < minSafe) return GENESIS_TS;

  const pμN = Number(pμ);
  if (!Number.isFinite(pμN)) return GENESIS_TS;

  const deltaPulses = pμN / 1_000_000; // pulses since Genesis (float)
  const msUTC = GENESIS_TS + deltaPulses * PULSE_MS;
  return Number.isFinite(msUTC) ? msUTC : GENESIS_TS;
}

function computeNextBoundaryFromMicro(pμNow: bigint): number {
  const pulseIdx = floorDivE(pμNow, ONE_PULSE_MICRO); // current pulse (floor)
  const nextPulseIdx = pulseIdx + 1n;

  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (nextPulseIdx > maxSafe) return GENESIS_TS;

  return GENESIS_TS + Number(nextPulseIdx) * PULSE_MS;
}

type CountdownSnap = {
  secsLeft: number | null;
  pμNow: bigint;
};

function useGoldenBreathCountdown(active: boolean): CountdownSnap {
  const initRaw = React.useMemo(() => {
    if (typeof window === "undefined") return 0n;
    return normalizeKaiEpochRawToMicroPulses(kairosEpochNow());
  }, []);

  const pμRef = React.useRef<bigint>(initRaw);

  const [secsLeft, setSecsLeft] = React.useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_PULSE_DUR_S;
    const msNow = epochMsFromMicroPulses(initRaw);
    const next = computeNextBoundaryFromMicro(initRaw);
    return Math.max(0, (next - msNow) / 1000);
  });

  const nextRef = React.useRef<number>(0);
  const rafRef = React.useRef<number | null>(null);
  const intRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (intRef.current !== null) {
      window.clearInterval(intRef.current);
      intRef.current = null;
    }

    if (!active) return;

    const snap0 = normalizeKaiEpochRawToMicroPulses(kairosEpochNow());
    pμRef.current = snap0;
    nextRef.current = computeNextBoundaryFromMicro(snap0);

    const tick = (): void => {
      const pμ = normalizeKaiEpochRawToMicroPulses(kairosEpochNow());
      pμRef.current = pμ;

      const nowMs = epochMsFromMicroPulses(pμ);

      if (nowMs >= nextRef.current) {
        const missed = Math.floor((nowMs - nextRef.current) / PULSE_MS) + 1;
        nextRef.current += missed * PULSE_MS;
      }

      const diffMs = Math.max(0, nextRef.current - nowMs);
      setSecsLeft(diffMs / 1000);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const onVis = (): void => {
      if (document.visibilityState === "hidden") {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (intRef.current === null) {
          intRef.current = window.setInterval(() => {
            const pμ = normalizeKaiEpochRawToMicroPulses(kairosEpochNow());
            pμRef.current = pμ;

            const nowMs = epochMsFromMicroPulses(pμ);

            if (nowMs >= nextRef.current) {
              const missed = Math.floor((nowMs - nextRef.current) / PULSE_MS) + 1;
              nextRef.current += missed * PULSE_MS;
            }

            setSecsLeft(Math.max(0, (nextRef.current - nowMs) / 1000));
          }, 33);
        }
      } else {
        if (intRef.current !== null) {
          window.clearInterval(intRef.current);
          intRef.current = null;
        }
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        const pμ = normalizeKaiEpochRawToMicroPulses(kairosEpochNow());
        pμRef.current = pμ;
        nextRef.current = computeNextBoundaryFromMicro(pμ);

        rafRef.current = requestAnimationFrame(tick);
      }
    };

    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (intRef.current !== null) window.clearInterval(intRef.current);
      rafRef.current = null;
      intRef.current = null;
    };
  }, [active]);

  return { secsLeft: active ? secsLeft : null, pμNow: pμRef.current };
}

/* ─────────────────────────────────────────────────────────────
   Chakra labeling + deterministic chakra assignment
───────────────────────────────────────────────────────────── */

type ChakraName =
  | "Root"
  | "Sacral"
  | "Solar Plexus"
  | "Heart"
  | "Throat"
  | "Third Eye"
  | "Crown";

const CHAKRA_SEQ: readonly ChakraName[] = [
  "Root",
  "Sacral",
  "Solar Plexus",
  "Heart",
  "Throat",
  "Third Eye",
  "Crown",
] as const;

function chakraToLabel(ch: ChakraName): string {
  return ch === "Crown" ? "Krown" : ch;
}

function chakraFromDayOfMonth(dayOfMonth: number): ChakraName {
  const d = Number.isFinite(dayOfMonth) ? Math.floor(dayOfMonth) : 1;
  const idx = Math.max(0, Math.min(6, Math.floor((Math.max(1, d) - 1) / 6)));
  return CHAKRA_SEQ[idx] ?? "Root";
}

function modIndex(n: number, m: number): number {
  const r = n % m;
  return r < 0 ? r + m : r;
}

function chakraFromMonth(month: number): ChakraName {
  const m = Number.isFinite(month) ? Math.floor(month) : 1;
  const idx = modIndex(Math.max(1, m) - 1, 7);
  return CHAKRA_SEQ[idx] ?? "Root";
}

/* ✅ weekday → chakra (Verdari/Heart, Sonari/Throat, Kaelith/Crown) */
const WEEKDAY_CHAKRA: Readonly<Record<string, ChakraName>> = {
  solhara: "Root",
  aquaris: "Sacral",
  flamora: "Solar Plexus",
  verdari: "Heart",
  sonari: "Throat",
  kaelith: "Crown",
  caelith: "Crown", // alias safety
};

function chakraFromHarmonicDay(harmonicDay: unknown, fallbackDayOfMonth: number): ChakraName {
  if (typeof harmonicDay === "string") {
    const key = harmonicDay.trim().toLowerCase().replace(/[^a-z]/g, "");
    const ch = WEEKDAY_CHAKRA[key];
    if (ch) return ch;
  }

  if (typeof harmonicDay === "number" && Number.isFinite(harmonicDay)) {
    const idx = modIndex(Math.floor(harmonicDay), 6);
    const keys = ["solhara", "aquaris", "flamora", "verdari", "sonari", "kaelith"] as const;
    const ch = WEEKDAY_CHAKRA[keys[idx]];
    if (ch) return ch;
  }

  return chakraFromDayOfMonth(fallbackDayOfMonth);
}

/** Month names (8). */
const KAI_MONTH_NAMES: readonly string[] = [
  "Aethon",
  "Virelai",
  "Solari",
  "Amarin",
  "Kaelus",
  "Umbriel",
  "Noktura",
  "Liora",
] as const;

function monthNameFromIndex(month: number): string {
  const m = Number.isFinite(month) ? Math.floor(month) : 1;
  const idx = Math.max(1, Math.min(8, m)) - 1;
  return KAI_MONTH_NAMES[idx] ?? `Month ${Math.max(1, m)}`;
}

/** Ark → Chakra color mapping (Ignite MUST be Root/red). */
const ARK_CHAKRA: Readonly<Record<ArkName, ChakraName>> = {
  Ignite: "Root",
  Integrate: "Sacral",
  Harmonize: "Solar Plexus",
  Reflekt: "Heart",
  Purifikation: "Throat",
  Dream: "Third Eye",
};

type KaiStatusVars = React.CSSProperties & {
  ["--kai-progress"]?: number;
  ["--kai-ui-scale"]?: number;
};

/* ─────────────────────────────────────────────────────────────
   ✅ KaiKlock props (strict) + typed component binding
───────────────────────────────────────────────────────────── */

type KaiKlockProps = {
  hue: string;
  pulse: number;
  harmonicDayPercent: number;
  microCyclePercent: number;
  dayLabel: string;
  monthLabel: string;
  monthDay: number;
  kaiPulseEternal: number;
  glowPulse: boolean;
  pulseIntervalSec: number;
  rimFlash: boolean;
  solarSpiralStepString: string;
  eternalBeatIndex: number;
  eternalStepIndex: number;
};

const KaiKlock = KaiKlockRaw as unknown as React.ComponentType<KaiKlockProps>;

export function KaiStatus(): React.JSX.Element {
  // ✅ canonical μpulse “now” + exact countdown
  const { secsLeft, pμNow } = useGoldenBreathCountdown(true);

  // Derive ALL displayed Kai coordinates from μpulses (parity with SigilModal)
  const pulseNum = React.useMemo(() => kaiPulseFromMicro(pμNow), [pμNow]);
  const { beat: beatNum, step: stepNum } = React.useMemo(() => beatStepFromMicroTotal(pμNow), [pμNow]);
  const dmy = React.useMemo(() => kaiDMYFromMicroKKS(pμNow), [pμNow]);

  const dayNameFull = React.useMemo(() => harmonicDayFromMicroTotal(pμNow), [pμNow]);
  const beatStepDisp = `${beatNum}:${pad2(stepNum)}`;

  const arkFull: ArkName = arkFromBeat(beatNum);
  const arkChakra: ChakraName = ARK_CHAKRA[arkFull] ?? "Heart";

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const width = useElementWidth(rootRef);

  const layout: LayoutMode = layoutForWidth(width);
  const bottomMode: BottomMode = bottomModeFor(layout);

  const pulseOnTop = layout === "wide" || layout === "tight";

  const [pulseDur, setPulseDur] = React.useState<number>(DEFAULT_PULSE_DUR_S);
  React.useEffect(() => {
    setPulseDur(readPulseDurSeconds(rootRef.current));
  }, [pulseNum]);

  // Boundary flash when countdown wraps (0 → dur)
  const [flash, setFlash] = React.useState<boolean>(false);
  const prevAnchorRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const prev = prevAnchorRef.current;
    prevAnchorRef.current = secsLeft;

    if (prev != null && secsLeft != null && secsLeft > prev + 0.25) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 180);
      return () => window.clearTimeout(t);
    }
    return;
  }, [secsLeft]);

  const progress = React.useMemo<number>(() => {
    if (secsLeft == null) return 0;
    return clamp01(1 - secsLeft / pulseDur);
  }, [secsLeft, pulseDur]);

  const secsTextFull = secsLeft !== null ? secsLeft.toFixed(6) : "—";
  const secsText = secsLeft !== null ? secsLeft.toFixed(6) : "—";

  const dayChakra = React.useMemo<ChakraName>(
    () => chakraFromHarmonicDay(dayNameFull, dmy.day),
    [dayNameFull, dmy.day],
  );

  const monthChakra = React.useMemo<ChakraName>(() => chakraFromMonth(dmy.month), [dmy.month]);
  const monthName = React.useMemo<string>(() => monthNameFromIndex(dmy.month), [dmy.month]);

  const dmyText = `D${dmy.day}/M${dmy.month}/Y${dmy.year}`;
  const dayChakraLabel = chakraToLabel(dayChakra);
  const monthChakraLabel = chakraToLabel(monthChakra);

  const styleVars: KaiStatusVars = React.useMemo(() => {
    return {
      "--kai-progress": progress,
      "--kai-ui-scale": uiScaleFor(layout),
    };
  }, [progress, layout]);

  // KaiKlock props derived from Beat/Step (stable + deterministic)
  const stepsPerDay = 36 * 44; // 1584
  const stepOfDay = Math.max(0, Math.min(stepsPerDay - 1, beatNum * 44 + stepNum));
  const harmonicDayPercent = (stepOfDay / stepsPerDay) * 100;
  const microCyclePercent = progress * 100;

  // If your dial expects hue degrees, keep it a string degrees payload.
  const hue = String(Math.round((beatNum / 36) * 360));

  const [dialOpen, setDialOpen] = React.useState<boolean>(false);
  const openDial = React.useCallback(() => setDialOpen(true), []);
  const closeDial = React.useCallback(() => setDialOpen(false), []);

  const onRootKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setDialOpen(true);
    }
  }, []);

  // Modal: scroll lock + ESC close
  React.useEffect(() => {
    if (!dialOpen) return;
    if (typeof document === "undefined") return;

    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") closeDial();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [dialOpen, closeDial]);

  const Countdown = (
    <div className="kai-status__countdown" aria-label="Next pulse">
      <span className="kai-status__nLabel">NEXT</span>
      <span
        className="kai-status__nVal"
        title={secsTextFull}
        aria-label={`Next pulse in ${secsTextFull} seconds`}
      >
        {secsText} <span className="kai-status__nUnit">s</span>
      </span>
    </div>
  );

  const PulsePill = (
    <span
      className="kai-pill kai-pill--pulse"
      title={`Pulse ${pulseNum}`}
      aria-label={`Pulse ${pulseNum}`}
      data-chakra="Pulse"
    >
      ☤KAI: <strong className="kai-pill__num">{pulseNum}</strong>
    </span>
  );

  const DMYPill = (
    <span className="kai-pill kai-pill--dmy" title={dmyText} aria-label={`Date ${dmyText}`}>
      <span className="kai-dmy__seg kai-dmy__seg--day" data-chakra={dayChakra}>
        D<span className="kai-dmy__num">{dmy.day}</span>
      </span>
      <span className="kai-dmy__sep">/</span>
      <span className="kai-dmy__seg kai-dmy__seg--month" data-chakra={monthChakra}>
        M<span className="kai-dmy__num">{dmy.month}</span>
      </span>
      <span className="kai-dmy__sep">/</span>
      <span className="kai-dmy__seg kai-dmy__seg--year" data-chakra="Year">
        Y<span className="kai-dmy__num">{dmy.year}</span>
      </span>
    </span>
  );

  const DayPill = (
    <span
      className="kai-pill kai-pill--day"
      title={dayNameFull}
      aria-label={`Day ${dayNameFull}`}
      data-chakra={dayChakra}
    >
      {dayNameFull}
    </span>
  );

  const DayChakraPill = (
    <span
      className="kai-pill kai-pill--dayChakra"
      title={`Day chakra ${dayChakraLabel}`}
      aria-label={`Day chakra ${dayChakraLabel}`}
      data-chakra={dayChakra}
    >
      {dayChakraLabel}
    </span>
  );

  const MonthNamePill = (
    <span
      className="kai-pill kai-pill--monthName"
      title={monthName}
      aria-label={`Month ${monthName}`}
      data-chakra={monthChakra}
    >
      {monthName}
    </span>
  );

  const MonthChakraPill = (
    <span
      className="kai-pill kai-pill--monthChakra"
      title={`Month chakra ${monthChakraLabel}`}
      aria-label={`Month chakra ${monthChakraLabel}`}
      data-chakra={monthChakra}
    >
      {monthChakraLabel}
    </span>
  );

  const ArkPill = (
    <span
      className="kai-pill kai-pill--ark"
      title={arkFull}
      aria-label={`Ark ${arkFull}`}
      data-chakra={arkChakra}
    >
      {arkFull}
    </span>
  );

  const dialPortal =
    dialOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="kk-pop" role="dialog" aria-modal="true" aria-label="Kai-Klok">
            <button
              type="button"
              className="kk-pop__backdrop"
              aria-label="Close Kai-Klok"
              onClick={closeDial}
            />
            <div className="kk-pop__panel" role="document">
              <div className="kk-pop__head">
                <div className="kk-pop__title">Kai-Klok</div>
                <button type="button" className="kk-pop__close" onClick={closeDial} aria-label="Close">
                  ✕
                </button>
              </div>

              <div className="kk-pop__meta" aria-label="Kai summary">
                <span className="kk-pop__pill">{beatStepDisp}</span>
                <span className="kk-pop__pill">{dmyText}</span>
                <span className="kk-pop__pill">{monthName}</span>
                <span className="kk-pop__pill">{arkFull}</span>
              </div>

              <div className="kk-pop__dial" aria-label="Kai-Klok dial">
                <div className="klock-stage" data-klock-stage="1">
                  <div className="klock-stage__inner">
                    <KaiKlock
                      hue={hue}
                      pulse={pulseNum}
                      harmonicDayPercent={harmonicDayPercent}
                      microCyclePercent={microCyclePercent}
                      dayLabel={dayNameFull}
                      monthLabel={monthName}
                      monthDay={dmy.day}
                      kaiPulseEternal={pulseNum}
                      glowPulse={true}
                      pulseIntervalSec={pulseDur}
                      rimFlash={flash}
                      solarSpiralStepString={`${pad2(beatNum)}:${pad2(stepNum)}`}
                      eternalBeatIndex={beatNum}
                      eternalStepIndex={stepNum}
                    />
                  </div>
                </div>
              </div>

              <div className="kk-pop__foot">
                <span className="kk-pop__hint">Tap the Klok for more details or press x to return.</span>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={rootRef}
        className={`kai-feed-status kai-feed-status--slim${flash ? " kai-feed-status--flash" : ""}`}
        onClick={openDial}
        onKeyDown={onRootKeyDown}
        tabIndex={0}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={dialOpen}
        aria-label="Kai status (open Kai-Klok)"
        data-layout={layout}
        data-bottom={bottomMode}
        data-kai-bsi={beatStepDisp}
        data-kai-ark={arkFull}
        data-kai-dmy={dmyText}
        data-day-chakra={dayChakra}
        data-month-chakra={monthChakra}
        data-ark-chakra={arkChakra}
        data-day-num={dmy.day}
        data-month-num={dmy.month}
        data-year-num={dmy.year}
        style={styleVars}
      >
        {/* ROW 1: day row (one line; scrollable) */}
        <div className="kai-status__top" aria-label="Kai timeline (day row)">
          <span className="kai-status__bsiWrap" aria-label={`Beat step ${beatStepDisp}`}>
            <span className="kai-status__kLabel" aria-hidden="true">
              KAIROS
            </span>
            <span className="kai-status__bsi" title={beatStepDisp}>
              {beatStepDisp}
            </span>
          </span>

          {DMYPill}
          {DayPill}
          {DayChakraPill}

          {pulseOnTop ? PulsePill : null}
        </div>

        {/* ROW 2: month + ark row (one line; scrollable) */}
        <div className="kai-status__mid" aria-label="Kai timeline (month/ark row)">
          {MonthNamePill}
          {MonthChakraPill}
          {ArkPill}
        </div>

        {/* ROW 3: countdown row (pulse drops here on tiny/nano) */}
        <div className="kai-status__bottom" aria-label="Next pulse row">
          {pulseOnTop ? null : PulsePill}
          {Countdown}
        </div>

        {/* Progress bar (always present) */}
        <div className="kai-feed-status__bar" aria-hidden="true">
          <div className="kai-feed-status__barFill" />
          <div className="kai-feed-status__barSpark" />
        </div>
      </div>

      {dialPortal}
    </>
  );
}

export default KaiStatus;
