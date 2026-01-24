// src/components/SigilGlyphButton.tsx
/* ────────────────────────────────────────────────────────────────
   SigilGlyphButton.tsx · Atlantean Lumitech “Kairos Sigil Glyph”
   v7.2 — EXACT match with SigilModal (μpulse math + deterministic hash)
          + persistent glyph after modal close (unique origin + remount key)

   Fixes:
   ✅ No setState synchronously inside useEffect body (React purity warning)
   ✅ No Math.random() during render/initializer (useId-derived stable scope)
───────────────────────────────────────────────────────────────── */

"use client";

import React, { Suspense, useState, useEffect, useRef, useCallback, useMemo, useId } from "react";
import KaiSigil, { type KaiSigilProps, type KaiSigilHandle } from "./KaiSigil";
import "./SigilGlyphButton.css";

import {
  GENESIS_TS,
  PULSE_MS,
  latticeFromMicroPulses,
  microPulsesSinceGenesis,
  momentFromUTC,
} from "../utils/kai_pulse";

const SigilModal = React.lazy(() => import("./SigilModal"));

/* compute the exact render state the modal uses */
function computeLocalKai(now: Date): {
  pulse: number;
  beat: number;
  chakraDay: KaiSigilProps["chakraDay"];
} {
  const pμ = microPulsesSinceGenesis(now);
  const { beat } = latticeFromMicroPulses(pμ);
  const { pulse, chakraDay } = momentFromUTC(now);
  return { pulse, beat, chakraDay };
}

/* aligned φ-boundary scheduler (same idea as the modal) */
const epochNow = () => performance.timeOrigin + performance.now();
const nextBoundary = (nowMs: number) => {
  const elapsed = nowMs - GENESIS_TS;
  const periods = Math.ceil(elapsed / PULSE_MS);
  return GENESIS_TS + periods * PULSE_MS;
};

/* ═════════════ Component ═════════════ */
interface Props {
  kaiPulse?: number; // optional seed; ignored once live
}

const SigilGlyphButton: React.FC<Props> = () => {
  const [pulse, setPulse] = useState<number>(0);
  const [beat, setBeat] = useState<number>(0);
  const [chakraDay, setChakraDay] = useState<KaiSigilProps["chakraDay"]>("Root");
  const [open, setOpen] = useState(false);

  // 🔑 unique, stable scope for this instance’s internal SVG ids
  // (pure, deterministic; avoids Math.random() in render)
  const rid = useId();
  const idScope = useMemo(() => `btn-${rid.replace(/:/g, "")}`, [rid]);

  // Force a tiny remount of the <KaiSigil> whenever modal opens/closes
  const instanceKey = open ? "sigil-open" : "sigil-closed";

  const sigilRef = useRef<KaiSigilHandle | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const targetRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const applyNow = useCallback(() => {
    const { pulse: p, beat: b, chakraDay: cd } = computeLocalKai(new Date());
    setPulse(p);
    setBeat(b);
    setChakraDay(cd);
  }, []);

  const scheduleAligned = useCallback(() => {
    clearTimer();

    const now = epochNow();
    targetRef.current = nextBoundary(now);

    const fire = () => {
      // Catch up if tab slept
      const nowMs = epochNow();
      const missed = Math.floor((nowMs - targetRef.current) / PULSE_MS);
      const runs = Math.max(0, missed) + 1;

      for (let i = 0; i < runs; i++) {
        applyNow();
        targetRef.current += PULSE_MS;
      }

      const delay = Math.max(0, targetRef.current - epochNow());
      timeoutRef.current = window.setTimeout(fire, delay) as unknown as number;
    };

    const initialDelay = Math.max(0, targetRef.current - now);
    timeoutRef.current = window.setTimeout(fire, initialDelay) as unknown as number;
  }, [applyNow, clearTimer]);

  /* mount: subscribe timers, then update state via external callback (no sync setState in effect body) */
  useEffect(() => {
    scheduleAligned();

    // Kick an initial state sync as an external callback (avoids the React warning)
    const kick = window.setTimeout(() => {
      applyNow();
    }, 0) as unknown as number;

    return () => {
      clearTimeout(kick);
      clearTimer();
    };
  }, [applyNow, scheduleAligned, clearTimer]);

  /* visibility: re-align when returning to foreground */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") scheduleAligned();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [scheduleAligned]);

  return (
    <>
      <button
        className="sigil-button"
        title="View & save this sigil"
        onClick={() => setOpen(true)}
        data-chakra={chakraDay}
        aria-label="Open Kairos Sigil"
      >
        {/* Decorative thumbnail only — link-proof via shield */}
        <span className="sigil-thumb" aria-hidden="true" inert>
          <KaiSigil
            key={instanceKey}
            ref={sigilRef}
            pulse={pulse}
            beat={beat}
            chakraDay={chakraDay}
            size={40}
            hashMode="deterministic"
            origin={idScope}
            onReady={(payload?: { hash?: string; pulse?: number }) => {
              if (payload && typeof payload.pulse === "number" && payload.pulse !== pulse) {
                setPulse(payload.pulse);
              }
            }}
          />
          {/* ⛨ Transparent shield that intercepts all clicks/taps */}
          <span className="sigil-shield" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <Suspense fallback={null}>
          <SigilModal initialPulse={pulse} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
};

export default SigilGlyphButton;
