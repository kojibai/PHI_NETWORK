// SigilMarkets/hooks/useScrollRestoration.ts
"use client";

/**
 * SigilMarkets — useScrollRestoration
 *
 * Purpose:
 * - Restore scroll position per SigilMarkets route (grid/market/etc).
 * - Works for:
 *   (A) window scrolling
 *   (B) a scroll container element (recommended for app shells).
 *
 * Requirements:
 * - Uses uiStore's scrollYByKey and routeKey().
 * - Pure UI; does not affect protocol state.
 */

import { useEffect, useMemo, useRef } from "react";
import { routeKey, type SigilMarketsRoute } from "../types/uiTypes";
import { useSigilMarketsUi } from "../state/uiStore";

export type ScrollMode = "window" | "container";

export type UseScrollRestorationOptions = Readonly<{
  /** Default: "window" */
  mode?: ScrollMode;
  /** For mode="container" */
  containerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Delay before restoring (ms). Helps after route transitions.
   * Default: 0 (immediate on next tick).
   */
  restoreDelayMs?: number;
  /**
   * If true, do not auto-restore (caller will call restore()).
   * Default: false
   */
  manual?: boolean;
}>;

export type UseScrollRestorationResult = Readonly<{
  save: () => void;
  restore: () => void;
  key: string;
  savedY: number;
}>;

const getScrollYWindow = (): number => {
  if (typeof window === "undefined") return 0;
  const y = window.scrollY;
  return Number.isFinite(y) ? Math.max(0, Math.floor(y)) : 0;
};

const setScrollYWindow = (y: number): void => {
  if (typeof window === "undefined") return;
  try {
    window.scrollTo({ top: y, behavior: "auto" });
  } catch {
    window.scrollTo(0, y);
  }
};

const getScrollYElement = (el: HTMLElement | null): number => {
  if (!el) return 0;
  const y = el.scrollTop;
  return Number.isFinite(y) ? Math.max(0, Math.floor(y)) : 0;
};

const setScrollYElement = (el: HTMLElement | null, y: number): void => {
  if (!el) return;
  try {
    el.scrollTo({ top: y, behavior: "auto" });
  } catch {
    el.scrollTop = y;
  }
};

export const useScrollRestoration = (route: SigilMarketsRoute, opts?: UseScrollRestorationOptions): UseScrollRestorationResult => {
  const { state: ui, actions } = useSigilMarketsUi();

  const mode: ScrollMode = opts?.mode ?? "window";
  const containerRef = opts?.containerRef;
  const restoreDelayMs = Math.max(0, Math.floor(opts?.restoreDelayMs ?? 0));
  const manual = opts?.manual ?? false;

  const key = useMemo(() => routeKey(route), [route]);

  const savedY = ui.grid.scrollYByKey[key] ?? 0;

  const savedYRef = useRef<number>(savedY);
  savedYRef.current = savedY;

  const routeRef = useRef<SigilMarketsRoute>(route);
  routeRef.current = route;

  const save = (): void => {
    const y = mode === "container" ? getScrollYElement(containerRef?.current ?? null) : getScrollYWindow();
    actions.setScrollY(routeRef.current, y);
  };

  const restore = (): void => {
    const y = savedYRef.current ?? 0;
    if (mode === "container") setScrollYElement(containerRef?.current ?? null, y);
    else setScrollYWindow(y);
  };

  // Auto-save on unmount / route change
  useEffect(() => {
    const onBeforeUnload = (): void => save();

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", onBeforeUnload);
    }

    return () => {
      save();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode]);

  // Auto-restore on route key change
  useEffect(() => {
    if (manual) return;

    const doRestore = (): void => {
      // Defer to allow layout to settle.
      if (restoreDelayMs <= 0) {
        setTimeout(() => restore(), 0);
        return;
      }
      setTimeout(() => restore(), restoreDelayMs);
    };

    doRestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, manual, restoreDelayMs]);

  return { save, restore, key, savedY };
};
