// SigilMarkets/hooks/useStickyHeader.ts
"use client";

/**
 * SigilMarkets — useStickyHeader
 *
 * Purpose:
 * - Make top chrome feel "alive" as you scroll (glass blur + shadow ramp).
 * - Works with either:
 *   (A) window scrolling, or
 *   (B) a scroll container element (recommended for app shells).
 *
 * Usage:
 * const { headerStyle, onScroll } = useStickyHeader({ mode:"container", containerRef });
 * <div ref={containerRef} onScroll={onScroll}>...</div>
 * <div style={headerStyle}>TopBar</div>
 */

import { useCallback, useMemo, useRef, useState } from "react";

export type StickyMode = "window" | "container";

export type UseStickyHeaderOptions = Readonly<{
  mode?: StickyMode;
  /** For mode="container" */
  containerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Scroll distance at which header reaches full shadow/blur.
   * Default: 56px (roughly one header height).
   */
  rampPx?: number;
  /**
   * Additional offset before ramp begins (useful if you have a hero section).
   * Default: 0.
   */
  startPx?: number;
}>;

export type UseStickyHeaderResult = Readonly<{
  /** Call on scroll (or you can also call manually). */
  onScroll: () => void;
  /** 0..1 how "scrolled" we are (drives UI). */
  t: number;
  /** True when scrollY is essentially 0. */
  atTop: boolean;
  /** Inline style for a frosted header (no fixed colors). */
  headerStyle: React.CSSProperties;
  /** Inline style for a subtle divider line under header. */
  dividerStyle: React.CSSProperties;
}>;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const getScrollYWindow = (): number => {
  if (typeof window === "undefined") return 0;
  const y = window.scrollY;
  return Number.isFinite(y) ? Math.max(0, y) : 0;
};

const getScrollYElement = (el: HTMLElement | null): number => {
  if (!el) return 0;
  const y = el.scrollTop;
  return Number.isFinite(y) ? Math.max(0, y) : 0;
};

export const useStickyHeader = (opts?: UseStickyHeaderOptions): UseStickyHeaderResult => {
  const mode: StickyMode = opts?.mode ?? "window";
  const rampPx = Math.max(8, Math.floor(opts?.rampPx ?? 56));
  const startPx = Math.max(0, Math.floor(opts?.startPx ?? 0));

  const containerRef = opts?.containerRef;

  const [t, setT] = useState<number>(0);
  const atTopRef = useRef<boolean>(true);
  const rafRef = useRef<number | null>(null);

  const compute = useCallback(() => {
    const y = mode === "container" ? getScrollYElement(containerRef?.current ?? null) : getScrollYWindow();
    const y2 = Math.max(0, y - startPx);
    const nextT = clamp01(y2 / rampPx);

    // Avoid state churn
    setT((prev) => (Math.abs(prev - nextT) < 0.01 ? prev : nextT));

    const nextAtTop = y <= 1;
    atTopRef.current = nextAtTop;
  }, [mode, containerRef, rampPx, startPx]);

  const onScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    if (typeof window === "undefined") {
      compute();
      return;
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      compute();
    });
  }, [compute]);

  const atTop = atTopRef.current;

  const headerStyle = useMemo<React.CSSProperties>(() => {
    // Use alpha + blur based on t (no explicit colors).
    // Consumers can set background via CSS; this is just a tasteful frosted overlay.
    const blurPx = 2 + t * 10; // 2..12px
    const shadowAlpha = 0.08 + t * 0.18; // subtle → stronger
    const bgAlpha = 0.18 + t * 0.22; // transparent → more frosted

    return {
      backdropFilter: `blur(${blurPx.toFixed(2)}px)`,
      WebkitBackdropFilter: `blur(${blurPx.toFixed(2)}px)`,
      boxShadow: `0 10px 30px rgba(0,0,0,${shadowAlpha.toFixed(3)})`,
      background: `rgba(255,255,255,${bgAlpha.toFixed(3)})`,
      transition: "backdrop-filter 160ms ease, box-shadow 160ms ease, background 160ms ease",
    };
  }, [t]);

  const dividerStyle = useMemo<React.CSSProperties>(() => {
    const alpha = 0.06 + t * 0.16;
    return {
      height: 1,
      width: "100%",
      background: `rgba(0,0,0,${alpha.toFixed(3)})`,
      opacity: 1,
      transition: "background 160ms ease",
    };
  }, [t]);

  return { onScroll, t, atTop, headerStyle, dividerStyle };
};
