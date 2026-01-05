// SigilMarkets/views/MarketRoom/MarketCountdown.tsx
"use client";

import React, { useMemo } from "react";
import type { KaiMoment, KaiPulse } from "../../types/marketTypes";
import { ProgressRing } from "../../ui/atoms/ProgressRing";
import { formatCloseIn } from "../../utils/format";
import { Icon } from "../../ui/atoms/Icon";

export type MarketCountdownProps = Readonly<{
  now: KaiMoment;
  closePulse: KaiPulse;
  /** If true, show "closed" emphasis. */
  status?: "open" | "closed" | "resolving" | "resolved";
}>;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const closeIn = (closePulse: KaiPulse, nowPulse: KaiPulse): number => {
  const c = Number.isFinite(closePulse) ? Math.floor(closePulse) : 0;
  const n = Number.isFinite(nowPulse) ? Math.floor(nowPulse) : 0;
  const d = c - n;
  return d <= 0 ? 0 : d;
};

export const MarketCountdown = (props: MarketCountdownProps) => {
  const remaining = useMemo(() => closeIn(props.closePulse, props.now.pulse), [props.closePulse, props.now.pulse]);
  const label = useMemo(() => formatCloseIn(remaining), [remaining]);

  const ring = useMemo(() => {
    if (remaining <= 0) return 1;
    // ramp within 5000 pulses
    return clamp01(1 - remaining / 5000);
  }, [remaining]);

  const tone = props.status === "resolved" ? "success" : remaining <= 600 ? "gold" : "cyan";

  return (
    <div className="sm-countdown" data-sm="countdown">
      <ProgressRing value={ring} size={54} stroke={6} tone={tone} label={remaining <= 600 && remaining > 0 ? "soon" : ""} />
      <div className="sm-countdown-text">
        <div className="sm-countdown-k">
          <Icon name="clock" size={14} tone="dim" /> Close
        </div>
        <div className={`sm-countdown-v ${remaining <= 600 && remaining > 0 ? "is-soon" : ""}`}>
          {props.status === "resolved" ? "resolved" : label}
        </div>
      </div>
    </div>
  );
};
