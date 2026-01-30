// src/hooks/useVisualViewportSize.ts
import { useEffect, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────────
   Shared VisualViewport publisher (RAF-throttled, EDIT-FROZEN)
   - iOS keyboard causes vv resize spam. We allow ONE update after focus, then freeze.
   - Unfreeze when editing ends, then publish again.
────────────────────────────────────────────────────────────────────────────── */

type VVSize = { width: number; height: number };

type VVStore = {
  size: VVSize;
  subs: Set<(s: VVSize) => void>;
  listening: boolean;
  rafId: number | null;
  cleanup?: (() => void) | null;

  // Freeze behavior during input focus (iOS keyboard churn protection)
  frozen: boolean;
  freezePending: boolean;
  focusCleanup?: (() => void) | null;
};

const vvStore: VVStore = {
  size: { width: 0, height: 0 },
  subs: new Set(),
  listening: false,
  rafId: null,
  cleanup: null,

  frozen: false,
  freezePending: false,
  focusCleanup: null,
};

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return !el.disabled;
  if (el instanceof HTMLTextAreaElement) return !el.disabled;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t instanceof Element ? t : null;
  if (!el) return false;
  if (isEditableElement(el)) return true;
  if (el instanceof HTMLElement) {
    const nearest = el.closest(
      "input,textarea,select,[contenteditable='true'],[contenteditable=''],[contenteditable]"
    );
    return isEditableElement(nearest);
  }
  return false;
}

function hasEditableFocus(): boolean {
  if (typeof document === "undefined") return false;
  return isEditableTarget(document.activeElement);
}

function readVVNow(): VVSize {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  const vv = window.visualViewport;
  if (vv) return { width: Math.round(vv.width), height: Math.round(vv.height) };
  return { width: window.innerWidth, height: window.innerHeight };
}

function startVVListeners(): void {
  if (typeof window === "undefined" || vvStore.listening) return;

  vvStore.listening = true;
  vvStore.size = readVVNow();

  const publish = (force = false): void => {
    vvStore.rafId = null;

    // If frozen (editing), do nothing unless we're in the “one allowed publish” window.
    if (vvStore.frozen && !vvStore.freezePending && !force) return;

    const next = readVVNow();
    const prev = vvStore.size;

    if (!force && next.width === prev.width && next.height === prev.height) {
      // still complete the freeze transition if needed
      if (vvStore.freezePending) {
        vvStore.freezePending = false;
        vvStore.frozen = true;
      }
      return;
    }

    vvStore.size = next;
    vvStore.subs.forEach((fn) => fn(next));

    // After the first keyboard-driven publish, freeze to stop churn while typing.
    if (vvStore.freezePending) {
      vvStore.freezePending = false;
      vvStore.frozen = true;
    }
  };

  const schedule = (): void => {
    if (vvStore.rafId !== null) return;
    vvStore.rafId = window.requestAnimationFrame(() => publish(false));
  };

  const scheduleForce = (): void => {
    if (vvStore.rafId !== null) return;
    vvStore.rafId = window.requestAnimationFrame(() => publish(true));
  };

  const vv = window.visualViewport;

  // Viewport events
  window.addEventListener("resize", schedule, { passive: true });
  if (vv) {
    vv.addEventListener("resize", schedule, { passive: true });
    // iOS can change vv metrics via scroll when bars/keyboard animate
    vv.addEventListener("scroll", schedule, { passive: true });
  }

  // Focus freeze logic (prevents iOS keyboard resize spam from re-rendering the whole app)
  const onFocusIn = (e: FocusEvent): void => {
    if (!isEditableTarget(e.target)) return;

    // Allow one resize publish after focus, then freeze.
    vvStore.frozen = false;
    vvStore.freezePending = true;

    // Force a publish soon even if resize event is delayed.
    scheduleForce();
  };

  const onFocusOut = (): void => {
    // Wait a tick to see if focus just moved to another editable control.
    window.requestAnimationFrame(() => {
      if (hasEditableFocus()) return;

      // Editing ended: unfreeze and publish once to restore stable layout.
      vvStore.frozen = false;
      vvStore.freezePending = false;
      scheduleForce();
    });
  };

  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);

  vvStore.focusCleanup = (): void => {
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    vvStore.focusCleanup = null;
  };

  vvStore.cleanup = (): void => {
    if (vvStore.rafId !== null) {
      window.cancelAnimationFrame(vvStore.rafId);
      vvStore.rafId = null;
    }

    window.removeEventListener("resize", schedule);
    if (vv) {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
    }

    vvStore.focusCleanup?.();
    vvStore.cleanup = null;
    vvStore.listening = false;

    // reset freeze flags
    vvStore.frozen = false;
    vvStore.freezePending = false;
  };
}

function stopVVListenersIfIdle(): void {
  if (vvStore.subs.size > 0) return;
  vvStore.cleanup?.();
}

export function useVisualViewportSize(): VVSize {
  const [size, setSize] = useState<VVSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;

    startVVListeners();

    const sub = (s: VVSize): void => {
      setSize((prev) => (prev.width === s.width && prev.height === s.height ? prev : s));
    };

    vvStore.subs.add(sub);
    sub(readVVNow());

    return () => {
      vvStore.subs.delete(sub);
      stopVVListenersIfIdle();
    };
  }, []);

  return size;
}
