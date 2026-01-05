// SigilMarkets/ui/atoms/ProgressRing.tsx
"use client";

import React, { useMemo } from "react";

export type ProgressRingProps = Readonly<{
  /** 0..1 */
  value: number;
  size?: number; // px
  stroke?: number; // px
  /** "cyan"|"violet"|"gold"|"danger"|"success"|"dim" */
  tone?: "cyan" | "violet" | "gold" | "danger" | "success" | "dim";
  /** Optional center label. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}>;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ");

const toneClass = (tone: NonNullable<ProgressRingProps["tone"]>): string => {
  switch (tone) {
    case "violet":
      return "sm-ring-violet";
    case "gold":
      return "sm-ring-gold";
    case "danger":
      return "sm-ring-danger";
    case "success":
      return "sm-ring-success";
    case "dim":
      return "sm-ring-dim";
    case "cyan":
    default:
      return "sm-ring-cyan";
  }
};

export const ProgressRing = (props: ProgressRingProps) => {
  const { value, size = 44, stroke = 5, tone = "cyan", label, className, style } = props;

  const v = clamp01(value);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * v;
  const gap = c - dash;

  const cls = useMemo(() => cx("sm-ring", toneClass(tone), className), [tone, className]);

  return (
    <div className={cls} style={{ width: size, height: size, ...style }} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="sm-ring-svg" aria-hidden="true">
        <circle
          className="sm-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="sm-ring-bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${gap}`}
          strokeDashoffset={c * 0.25}
          strokeLinecap="round"
        />
      </svg>

      {label ? <div className="sm-ring-label">{label}</div> : null}
    </div>
  );
};
