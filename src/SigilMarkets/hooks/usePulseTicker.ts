// SigilMarkets/hooks/usePulseTicker.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KaiMoment, KaiPulse } from "../types/marketTypes";
import {
  createKaiNowClock,
  kaiMomentFromMicroPulses,
  MICRO_PER_PULSE,
  type KaiNowClock,
  type KaiNowSource,
} from "./useKaiNow";

type UnknownRecord = Record<string, unknown>;

/**
 * Pulse duration (φ-exact breath):
 *   T = 3 + √5 seconds
 * Used ONLY for UI scheduling (setTimeout). MicroPulses remain the canonical state coordinate.
 */
const KAI_PULSE_MS = (3 + Math.sqrt(5)) * 1000;

export type PulseTickerOptions = Readonly<{
  /** Default: true */
  enabled?: boolean;
  /**
   * Default: true
   * Re-sync immediately when the tab becomes visible or window gains focus.
   */
  syncOnVisibility?: boolean;
  /**
   * Default: false
   * If true, stop scheduling while hidden (saves battery). On visible, resync.
   * Most Kai-Klok UX wants this false (keep living even offscreen).
   */
  pauseWhenHidden?: boolean;
  /**
   * Optional callback fired when a new pulse is observed.
   * Called after state updates (best effort).
   */
  onPulse?: (moment: KaiMoment, microPulses: bigint) => void;
}>;

export type PulseTickerSnapshot = Readonly<{
  microPulses: bigint;
  pulse: KaiPulse;
  moment: KaiMoment;
  source: KaiNowSource;
  isSeeded: boolean;
}>;

type SnapState = Readonly<{
  microPulses: bigint;
  source: KaiNowSource;
  isSeeded: boolean;
}>;

const getGlobal = (): UnknownRecord => globalThis as unknown as UnknownRecord;

const isDocumentVisible = (): boolean => {
  const g = getGlobal();
  const d = g["document"];
  if (typeof d === "object" && d !== null) {
    const vis = (d as UnknownRecord)["visibilityState"];
    if (vis === "hidden") return false;
  }
  return true;
};

const pulseFromMicro = (micro: bigint): KaiPulse => {
  if (micro <= 0n) return 0;
  const p = micro / MICRO_PER_PULSE;
  const n = Number(p);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

const microWithinPulse = (micro: bigint): bigint => {
  if (MICRO_PER_PULSE <= 0n) return 0n;
  // Normalize mod for safety (handles negative input defensively)
  const m = micro % MICRO_PER_PULSE;
  return m >= 0n ? m : m + MICRO_PER_PULSE;
};

const msUntilNextPulseFromMicro = (micro: bigint): number => {
  if (micro <= 0n) return 1;

  const within = microWithinPulse(micro); // [0, MICRO_PER_PULSE)
  const remaining = MICRO_PER_PULSE - within; // (0..MICRO_PER_PULSE]
  const denom = Number(MICRO_PER_PULSE);
  const numer = Number(remaining);

  if (!Number.isFinite(denom) || denom <= 0) return 1;
  if (!Number.isFinite(numer) || numer <= 0) return 1;

  const ms = (numer / denom) * KAI_PULSE_MS;
  if (!Number.isFinite(ms) || ms < 0) return 1;

  // Clamp for safety (should be ~5236ms max)
  return Math.max(1, Math.min(60_000, Math.ceil(ms)));
};

export const usePulseTicker = (
  options?: PulseTickerOptions,
  providedClock?: KaiNowClock,
): PulseTickerSnapshot => {
  const enabled = options?.enabled ?? true;
  const syncOnVisibility = options?.syncOnVisibility ?? true;
  const pauseWhenHidden = options?.pauseWhenHidden ?? false;
  const onPulse = options?.onPulse;

  const clock = useMemo(() => providedClock ?? createKaiNowClock(), [providedClock]);

  const [snap, setSnap] = useState<SnapState>(() => {
    const micro = clock.microNow();
    return {
      microPulses: micro,
      source: clock.source,
      isSeeded: clock.isSeeded,
    };
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(false);
  const lastPulseRef = useRef<KaiPulse>(pulseFromMicro(snap.microPulses));

  const scheduleNextRef = useRef<() => void>(() => {});
  const resyncNowRef = useRef<() => void>(() => {});

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resyncNow = useCallback((): void => {
    const micro = clock.microNow();
    const moment = kaiMomentFromMicroPulses(micro);
    lastPulseRef.current = moment.pulse;

    setSnap({
      microPulses: micro,
      source: clock.source,
      isSeeded: clock.isSeeded,
    });

    if (onPulse) onPulse(moment, micro);
  }, [clock, onPulse]);

  const scheduleNext = useCallback((): void => {
    clearTimer();
    if (!enabled) return;
    if (pauseWhenHidden && !isDocumentVisible()) return;

    const micro = clock.microNow();
    const delay = msUntilNextPulseFromMicro(micro);

    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;

      if (pauseWhenHidden && !isDocumentVisible()) {
        // If hidden, do not tick. We'll resync when visible/focus.
        clearTimer();
        return;
      }

      const micro2 = clock.microNow();
      const moment2 = kaiMomentFromMicroPulses(micro2);
      const p2 = moment2.pulse;
      const prevPulse = lastPulseRef.current;

      if (p2 !== prevPulse) {
        lastPulseRef.current = p2;
        setSnap({
          microPulses: micro2,
          source: clock.source,
          isSeeded: clock.isSeeded,
        });
        if (onPulse) onPulse(moment2, micro2);
      }
      // Always schedule again (even if we woke slightly early).
      scheduleNextRef.current();
    }, delay);
  }, [clearTimer, clock, enabled, onPulse, pauseWhenHidden]);

  // Keep refs pointed at the latest callbacks (so timers/listeners always call the newest logic).
  useEffect(() => {
    scheduleNextRef.current = scheduleNext;
  }, [scheduleNext]);

  useEffect(() => {
    resyncNowRef.current = resyncNow;
  }, [resyncNow]);

  useEffect(() => {
    mountedRef.current = true;
    lastPulseRef.current = pulseFromMicro(snap.microPulses);
    scheduleNextRef.current();

    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer, snap.microPulses]);

  useEffect(() => {
    if (!syncOnVisibility) return;

    const g = getGlobal();
    const d = g["document"];
    const w = g["window"];

    const onVis = (): void => {
      if (!enabled) return;
      // When pauseWhenHidden=true, ignore while hidden; when it becomes visible, this will run.
      if (pauseWhenHidden && !isDocumentVisible()) return;
      resyncNowRef.current();
      scheduleNextRef.current();
    };

    const onFocus = (): void => {
      if (!enabled) return;
      if (pauseWhenHidden && !isDocumentVisible()) return;
      resyncNowRef.current();
      scheduleNextRef.current();
    };

    const cleanups: Array<() => void> = [];

    if (typeof d === "object" && d !== null) {
      const add = (d as UnknownRecord)["addEventListener"];
      const rem = (d as UnknownRecord)["removeEventListener"];
      if (typeof add === "function" && typeof rem === "function") {
        add.call(d, "visibilitychange", onVis);
        cleanups.push(() => rem.call(d, "visibilitychange", onVis));
      }
    }

    if (typeof w === "object" && w !== null) {
      const add = (w as UnknownRecord)["addEventListener"];
      const rem = (w as UnknownRecord)["removeEventListener"];
      if (typeof add === "function" && typeof rem === "function") {
        add.call(w, "focus", onFocus);
        cleanups.push(() => rem.call(w, "focus", onFocus));
      }
    }

    if (cleanups.length === 0) return;

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [enabled, pauseWhenHidden, syncOnVisibility]);

  const moment = useMemo(() => kaiMomentFromMicroPulses(snap.microPulses), [snap.microPulses]);
  const pulse = moment.pulse;

  return {
    microPulses: snap.microPulses,
    pulse,
    moment,
    source: snap.source,
    isSeeded: snap.isSeeded,
  };
};
