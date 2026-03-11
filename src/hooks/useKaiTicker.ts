// src/hooks/useKaiTicker.ts
import { useEffect, useRef, useState } from "react";
import { PULSE_MS, computeKaiLocally } from "../utils/kai_pulse";

type UseKaiTickerOptions = {
  tickMs?: number;
  hiddenTickMs?: number;
};

export function useKaiTicker(options?: UseKaiTickerOptions) {
  const tickMs = Math.max(60, Math.floor(options?.tickMs ?? 180));
  const hiddenTickMs = Math.max(tickMs, Math.floor(options?.hiddenTickMs ?? Math.max(700, tickMs * 2)));

  const [pulse, setPulse] = useState<number | null>(null);
  const [msToNextPulse, setMsToNextPulse] = useState<number>(PULSE_MS);
  const lastPulseAtRef = useRef<number | null>(null);
  const lastPulseRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastMsRef = useRef<number>(PULSE_MS);

  useEffect(() => {
    const schedule = (): void => {
      const visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
      const delay = visible ? tickMs : hiddenTickMs;
      timerRef.current = window.setTimeout(() => {
        update();
        schedule();
      }, delay);
    };

    const update = (): void => {
      const calc = computeKaiLocally(new Date());
      const now = Date.now();

      if (lastPulseRef.current == null || calc.pulse !== lastPulseRef.current) {
        lastPulseRef.current = calc.pulse;
        lastPulseAtRef.current = now;
        setPulse(calc.pulse);
        lastMsRef.current = PULSE_MS;
        setMsToNextPulse(PULSE_MS);
      } else {
        const lastAt = lastPulseAtRef.current;
        const rem = lastAt == null ? PULSE_MS : Math.max(0, PULSE_MS - (now - lastAt));
        const rounded = Math.round(rem);
        if (lastMsRef.current !== rounded) {
          lastMsRef.current = rounded;
          setMsToNextPulse(rounded);
        }
      }
    };

    update();
    schedule();

    const onVisibility = (): void => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      update();
      schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [tickMs, hiddenTickMs]);

  return { pulse, msToNextPulse };
}
