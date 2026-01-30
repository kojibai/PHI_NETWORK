// src/hooks/useDisableZoom.ts
import { useEffect } from "react";

function isInteractiveTarget(t: EventTarget | null): boolean {
  const el = t instanceof Element ? t : null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button") return true;
  if (tag === "a") return true;
  const ht = el as HTMLElement;
  return Boolean(ht.isContentEditable) || Boolean(el.closest("[contenteditable='true'],[contenteditable]"));
}

function hasEditableFocus(): boolean {
  const a = typeof document !== "undefined" ? document.activeElement : null;
  if (!a || !(a instanceof Element)) return false;
  return isInteractiveTarget(a);
}

/* ──────────────────────────────────────────────────────────────────────────────
   Zoom lock (safe)
   - Blocks pinch zoom + ctrl/cmd zoom
   - NEVER interferes while typing / focused in inputs
   - Does NOT mutate html/body touchAction (avoids iOS weirdness)
────────────────────────────────────────────────────────────────────────────── */
export function useDisableZoom(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let lastTouchEnd = 0;

    const nowTs = (e: TouchEvent): number => {
      const ts = (e as unknown as { timeStamp?: number }).timeStamp;
      return typeof ts === "number" && Number.isFinite(ts) ? ts : performance.now();
    };

    const onTouchEnd = (e: TouchEvent): void => {
      if (hasEditableFocus()) return;
      if (isInteractiveTarget(e.target)) return;

      const now = nowTs(e);
      // double-tap zoom guard (non-interactive areas only)
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    };

    const onTouchMove = (e: TouchEvent): void => {
      if (hasEditableFocus()) return;
      // prevent pinch zoom (two-finger)
      if (e.touches.length > 1) e.preventDefault();
    };

    const onWheel = (e: WheelEvent): void => {
      // ctrl/cmd + wheel zoom guard (desktop)
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };

    const onKeydown = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.key;
      if (k === "+" || k === "-" || k === "=" || k === "_" || k === "0") e.preventDefault();
    };

    const onGesture = (e: Event): void => {
      if (hasEditableFocus()) return;
      e.preventDefault();
    };

    document.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });

    // iOS gesture events (pinch)
    document.addEventListener("gesturestart", onGesture, { passive: false, capture: true });
    document.addEventListener("gesturechange", onGesture, { passive: false, capture: true });
    document.addEventListener("gestureend", onGesture, { passive: false, capture: true });

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeydown);

    return () => {
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("gesturestart", onGesture, true);
      document.removeEventListener("gesturechange", onGesture, true);
      document.removeEventListener("gestureend", onGesture, true);

      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeydown);
    };
  }, []);
}
