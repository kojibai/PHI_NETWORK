import { useEffect, useState } from "react";

type NetLike = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

type NavLike = Navigator & {
  connection?: NetLike;
  deviceMemory?: number;
  hardwareConcurrency?: number;
};

export function computeMobileLiteMode(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const nav = navigator as NavLike;
  const conn = nav.connection;
  const saveData = Boolean(conn?.saveData);
  const et = (conn?.effectiveType || "").toLowerCase();
  const constrainedNet = et === "slow-2g" || et === "2g" || et === "3g";
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 4;
  const lowerCpu =
    typeof nav.hardwareConcurrency === "number" &&
    nav.hardwareConcurrency > 0 &&
    nav.hardwareConcurrency <= 6;

  const mqNarrow = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 1100px)").matches : false;
  const mqCoarse = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)").matches : false;
  const mqReduced =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  return mqReduced || saveData || constrainedNet || lowMemory || lowerCpu || (mqNarrow && mqCoarse);
}

export function useMobileLiteMode(): boolean {
  const [lite, setLite] = useState<boolean>(() => computeMobileLiteMode());

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    const nav = navigator as NavLike;
    const conn = nav.connection;

    const onChange = (): void => setLite(computeMobileLiteMode());
    const onResize = (): void => onChange();

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });

    const mqs: MediaQueryList[] = [];
    if (typeof window.matchMedia === "function") {
      mqs.push(
        window.matchMedia("(max-width: 1100px)"),
        window.matchMedia("(pointer: coarse)"),
        window.matchMedia("(prefers-reduced-motion: reduce)"),
      );
    }

    for (const mq of mqs) {
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
      else if (typeof mq.addListener === "function") mq.addListener(onChange);
    }

    if (conn?.addEventListener) conn.addEventListener("change", onChange);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      for (const mq of mqs) {
        if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onChange);
        else if (typeof mq.removeListener === "function") mq.removeListener(onChange);
      }
      if (conn?.removeEventListener) conn.removeEventListener("change", onChange);
    };
  }, []);

  return lite;
}
