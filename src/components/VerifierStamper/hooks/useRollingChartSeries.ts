import { useCallback, useEffect, useRef, useState } from "react";
import type { ChartPoint } from "../../valuation/series";
import { kaiPulseNow } from "../constants";

export type LiveChartPoint = ChartPoint & { fx?: number };

type RollingSeriesInput = {
  seriesKey: string;
  sampleMs: number;
  valuePhi: number;
  usdPerPhi: number;
  maxPoints?: number;
  snapKey?: number;
};

const makePoint = (i: number, value: number, fx: number): LiveChartPoint => ({
  i,
  value,
  premium: value,
  fx,
});

function clampPoints(arr: LiveChartPoint[], maxPoints: number): LiveChartPoint[] {
  if (arr.length <= maxPoints) return arr;
  return arr.slice(arr.length - maxPoints);
}

export default function useRollingChartSeries({
  seriesKey,
  sampleMs,
  valuePhi,
  usdPerPhi,
  maxPoints = 2048,
  snapKey,
}: RollingSeriesInput): LiveChartPoint[] {
  const [data, setData] = useState<LiveChartPoint[]>([]);
  const dataRef = useRef<LiveChartPoint[]>([]);

  // latest live inputs in refs (do NOT setState from these)
  const vRef = useRef<number>(0);
  const fxRef = useRef<number>(0);

  // keep refs updated during render (pure assignments are ok)
  if (Number.isFinite(valuePhi)) vRef.current = valuePhi;
  if (Number.isFinite(usdPerPhi) && usdPerPhi > 0) fxRef.current = usdPerPhi;

  // make resets/snap-trigger detection without effects that setState
  const prevSeriesKeyRef = useRef<string>(seriesKey);
  const prevSnapKeyRef = useRef<number | undefined>(snapKey);

  const pushPoint = useCallback(
    (pulseIndex: number) => {
      const val = Number.isFinite(vRef.current) ? vRef.current : 0;
      const fx = Number.isFinite(fxRef.current) && fxRef.current > 0 ? fxRef.current : 0;

      const prev = dataRef.current;

      let next: LiveChartPoint[];
      if (!prev.length) {
        next = clampPoints(
          [makePoint(pulseIndex - 1, val, fx), makePoint(pulseIndex, val, fx)],
          maxPoints
        );
      } else {
        const last = prev[prev.length - 1];

        if (last?.i === pulseIndex) {
          next = [...prev.slice(0, -1), { ...last, value: val, premium: val, fx }];
        } else if (typeof last?.i === "number" && last.i < pulseIndex) {
          next = clampPoints([...prev, makePoint(pulseIndex, val, fx)], maxPoints);
        } else {
          // time went backwards or weirdness: just update last point
          next = [...prev.slice(0, -1), { ...last, value: val, premium: val, fx }];
        }
      }

      dataRef.current = next;
      setData(next);
    },
    [maxPoints]
  );

  // external subscription: interval tick drives the series
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = kaiPulseNow();

      // Handle seriesKey change (reset) inside the external callback:
      // this avoids "setState inside effect body" warnings.
      if (prevSeriesKeyRef.current !== seriesKey) {
        prevSeriesKeyRef.current = seriesKey;
        dataRef.current = [];
        setData([]);
      }

      // Handle snapKey edge-trigger inside the external callback as well.
      if (prevSnapKeyRef.current !== snapKey) {
        prevSnapKeyRef.current = snapKey;
        if (typeof snapKey === "number") {
          pushPoint(p);
          return;
        }
      }

      const prev = dataRef.current;
      const last = prev[prev.length - 1];
      if (last?.i === p) return;

      pushPoint(p);
    }, Math.max(16, sampleMs));

    return () => window.clearInterval(id);
  }, [sampleMs, seriesKey, snapKey, pushPoint]);

  // Optional: first render seed without a cascading-effect warning.
  // This is still in an effect, but it's a single "start subscription" sync,
  // and the state update happens via the same pushPoint path.
  useEffect(() => {
    // one-time initial snap
    pushPoint(kaiPulseNow());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally once

  return data;
}
