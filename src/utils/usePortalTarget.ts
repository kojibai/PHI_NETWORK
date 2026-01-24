import { useEffect, useLayoutEffect, useState } from "react";

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

/**
 * SSR-safe portal target. Returns null on server; becomes document.body (or an element) on client.
 */
export function usePortalTarget(targetId?: string) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!isBrowser) return;
    if (targetId) setTarget(document.getElementById(targetId));
    else setTarget(document.body);
  }, [targetId]);

  return target;
}
