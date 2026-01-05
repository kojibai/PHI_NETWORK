// SigilMarkets/ui/atoms/Tooltip.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type TooltipProps = Readonly<{
  content: React.ReactNode;
  children: React.ReactNode;
  /** Default: "top" */
  placement?: "top" | "bottom";
  /** Default: 10 */
  offsetPx?: number;
  className?: string;
}>;

const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ");

export const Tooltip = (props: TooltipProps) => {
  const { content, children, placement = "top", offsetPx = 10, className } = props;

  const hostRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState<boolean>(false);
  const [pos, setPos] = useState<Readonly<{ left: number; top: number }>>({ left: 0, top: 0 });

  const computePos = (): void => {
    const host = hostRef.current;
    const tip = tipRef.current;
    if (!host || !tip) return;

    const r = host.getBoundingClientRect();
    const t = tip.getBoundingClientRect();

    const left = r.left + r.width / 2 - t.width / 2;
    const top = placement === "top" ? r.top - t.height - offsetPx : r.bottom + offsetPx;

    // Clamp within viewport
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    const x = Math.max(8, Math.min(vw - t.width - 8, left));
    const y = Math.max(8, Math.min(vh - t.height - 8, top));

    setPos({ left: x, top: y });
  };

  useEffect(() => {
    if (!open) return;

    computePos();

    const onScroll = (): void => computePos();
    const onResize = (): void => computePos();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement, offsetPx]);

  const cls = useMemo(() => cx("sm-tip", open && "is-open", placement === "bottom" ? "is-bottom" : "is-top", className), [open, placement, className]);

  return (
    <span
      className="sm-tip-host"
      ref={hostRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <div
        ref={tipRef}
        className={cls}
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        role="tooltip"
        aria-hidden={!open}
      >
        {content}
      </div>
    </span>
  );
};
