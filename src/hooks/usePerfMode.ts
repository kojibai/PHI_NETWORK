import { useEffect } from "react";

function isLowPowerEnvironment(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const nav = navigator as unknown as {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };

  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const prefersReducedTransparency =
    window.matchMedia?.("(prefers-reduced-transparency: reduce)")?.matches ?? false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  const saveData = Boolean(nav.connection?.saveData);
  const et = (nav.connection?.effectiveType || "").toLowerCase();
  const constrainedNetwork = et === "slow-2g" || et === "2g" || et === "3g";

  return (
    prefersReducedMotion ||
    prefersReducedTransparency ||
    saveData ||
    constrainedNetwork ||
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) ||
    (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) ||
    (coarsePointer && narrowViewport)
  );
}

export function usePerfMode(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const root = document.documentElement;

    const apply = (): void => {
      const lowPower = isLowPowerEnvironment();
      if (lowPower) root.dataset.perf = "low";
      else delete root.dataset.perf;
    };

    apply();

    const onResize = (): void => apply();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });

    const conn = (navigator as Navigator & {
      connection?: {
        addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
        removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
      };
    }).connection;

    if (conn?.addEventListener) conn.addEventListener("change", apply);

    const mqs = [
      window.matchMedia?.("(prefers-reduced-motion: reduce)"),
      window.matchMedia?.("(prefers-reduced-transparency: reduce)"),
      window.matchMedia?.("(pointer: coarse)"),
      window.matchMedia?.("(max-width: 900px)"),
    ].filter(Boolean) as MediaQueryList[];

    for (const mq of mqs) {
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", apply);
      else if (typeof mq.addListener === "function") mq.addListener(apply);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (conn?.removeEventListener) conn.removeEventListener("change", apply);
      for (const mq of mqs) {
        if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", apply);
        else if (typeof mq.removeListener === "function") mq.removeListener(apply);
      }
    };
  }, []);
}
