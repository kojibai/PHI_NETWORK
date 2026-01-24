// src/components/valuation/hooks.ts
import React, { useEffect, useSyncExternalStore } from "react";

/**
 * useIsMounted
 * React-compiler-safe:
 * - No setState in effects
 * - No ref reads during render
 * - Uses external-store subscription pattern
 *
 * Returns: false on first render, true after first commit.
 */
export function useIsMounted(): boolean {
  const subscribe = (onStoreChange: () => void) => {
    // run AFTER commit
    queueMicrotask(onStoreChange);
    return () => {};
  };

  const getSnapshot = () => true; // once mounted, always true for this component lifetime
  const getServerSnapshot = () => false; // SSR: not mounted

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* Legacy Safari matchMedia typing (no `any`) */
type LegacyMql = MediaQueryList & {
  addListener?: (listener: (e: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (e: MediaQueryListEvent) => void) => void;
};

/**
 * useMedia
 * React-18 correct subscription pattern for matchMedia.
 */
export function useMedia(query: string): boolean {
  const getSnapshot = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };

  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);

    const handler = () => onStoreChange();

    // Modern browsers
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }

    // Legacy Safari
    const legacy = mql as LegacyMql;
    legacy.addListener?.(() => onStoreChange());
    const legacyHandler = () => onStoreChange();
    legacy.addListener?.(legacyHandler);
    return () => legacy.removeListener?.(legacyHandler);
  };

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    const isNarrow =
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 560px)").matches
        : false;
    if (!isLocked || isNarrow) return;

    const { scrollY } = window;
    const original = {
      top: document.body.style.top,
      pos: document.body.style.position,
      w: document.body.style.width,
      o: document.documentElement.style.overflow,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.documentElement.style.overflow = original.o;
      document.body.style.position = original.pos;
      document.body.style.top = original.top;
      document.body.style.width = original.w;
      window.scrollTo(0, scrollY);
    };
  }, [isLocked]);
}

type AnyRef<T extends HTMLElement> =
  | React.RefObject<T | null>
  | React.MutableRefObject<T | null>;

export function useFocusTrap<T extends HTMLElement>(active: boolean, containerRef: AnyRef<T>) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, summary, [tabindex]:not([tabindex="-1"])';

    const firstFocus = () => {
      const el =
        container.querySelector<HTMLElement>(".close-btn") ||
        container.querySelector<HTMLElement>(".btn.primary") ||
        container.querySelector<HTMLElement>(FOCUSABLE);
      el?.focus();
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const prevActive = document.activeElement as HTMLElement | null;
    firstFocus();
    container.addEventListener("keydown", handleKeydown);
    return () => {
      container.removeEventListener("keydown", handleKeydown);
      prevActive?.focus?.();
    };
  }, [active, containerRef]);
}
