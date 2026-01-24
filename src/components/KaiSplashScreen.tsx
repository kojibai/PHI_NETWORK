import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { matchPath, useLocation, useNavigationType } from "react-router";


type SplashPhase = "show" | "fade" | "hidden";

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

const SPLASH_ROUTES: readonly string[] = [
  "/s",
  "/s/:hash",
  "/stream",
  "/stream/*",
  "/feed",
  "/feed/*",
  "/p~:token",
  "/p~:token/*",
  "/token",
  "/p~token",
  "/p",
  "/verify/*",
];

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (!isBrowser || typeof window.matchMedia === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (!isBrowser || typeof window.matchMedia === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList): void => {
      setPrefersReducedMotion(event.matches);
    };

    handleChange(mediaQuery);

    try {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } catch {
      // Safari legacy
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  return prefersReducedMotion;
}

export default function KaiSplashScreen(): React.JSX.Element | null {
  // ✅ Hooks must always run in the same order. We DO NOT early-return before hooks.
  const location = useLocation();
  const navigationType = useNavigationType();
  const prefersReducedMotion = usePrefersReducedMotion();

  const [phase, setPhase] = useState<SplashPhase>("show");
  const [mounted, setMounted] = useState<boolean>(true);
  const [isFirstLoad, setIsFirstLoad] = useState<boolean>(true);

  // ✅ Portal target must be assigned client-side; never read document during render.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const hasCompletedFirstPaint = useRef<boolean>(false);
  const exitTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const navShowTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const fadeDurationMs = useMemo(
    () => (prefersReducedMotion ? 140 : 260),
    [prefersReducedMotion],
  );
  const navHoldMs = useMemo(
    () => (prefersReducedMotion ? 220 : 420),
    [prefersReducedMotion],
  );
  const initialFallbackMs = useMemo(
    () => (prefersReducedMotion ? 800 : 1200),
    [prefersReducedMotion],
  );
  const navShowDelayMs = useMemo(
    () => (prefersReducedMotion ? 70 : 120),
    [prefersReducedMotion],
  );

  const clearTimers = useCallback((): void => {
    if (!isBrowser) return;
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
    exitTimerRef.current = null;
    fadeTimerRef.current = null;
  }, []);

  const clearRaf = useCallback((): void => {
    if (!isBrowser) return;
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const clearNavShowTimer = useCallback((): void => {
    if (!isBrowser) return;
    if (navShowTimerRef.current !== null) window.clearTimeout(navShowTimerRef.current);
    navShowTimerRef.current = null;
  }, []);

  const matchesSplashRoute = useMemo(() => {
    // ✅ Safe on server: does not touch DOM
    return SPLASH_ROUTES.some((pattern) =>
      Boolean(matchPath({ path: pattern, end: false }, location.pathname)),
    );
  }, [location.pathname]);

  const splashEnabled = useMemo(() => {
    // ✅ Safe on server
    return isFirstLoad || matchesSplashRoute;
  }, [isFirstLoad, matchesSplashRoute]);

  const hideSplash = useCallback(
    (delayMs: number) => {
      if (!isBrowser) return;
      clearTimers();
      clearNavShowTimer();

      exitTimerRef.current = window.setTimeout(() => {
        setPhase("fade");
        fadeTimerRef.current = window.setTimeout(() => {
          setPhase("hidden");
          setIsFirstLoad(false);
          // ✅ fully unmount after fade (no invisible overlay, no tap blocking)
          setMounted(false);
        }, fadeDurationMs);
      }, Math.max(0, delayMs));
    },
    [clearNavShowTimer, clearTimers, fadeDurationMs],
  );

  const hideOnNextFrame = useCallback(
    (delayMs: number) => {
      if (!isBrowser) return;
      clearRaf();
      rafRef.current = window.requestAnimationFrame(() => hideSplash(delayMs));
    },
    [clearRaf, hideSplash],
  );

  const showSplash = useCallback((): void => {
    if (!isBrowser) return;
    clearTimers();
    clearRaf();
    clearNavShowTimer();
    setMounted(true);
    setPhase("show");
  }, [clearNavShowTimer, clearRaf, clearTimers]);

  // ✅ Set portal target on client only (layout effect for zero-flicker)
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser) return;
    setPortalTarget(document.body);
  }, []);

  // ✅ Body background tweak (client only)
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser) return;
    const body = document.body;
    const prevBg = body.style.backgroundColor;
    if (!prevBg) body.style.backgroundColor = "var(--bg-0, #040f24)";
    return () => {
      body.style.backgroundColor = prevBg;
    };
  }, []);

  // ✅ Initial hide logic (client only; guards prevent SSR touching document/window)
  useEffect(() => {
    if (!isBrowser) return;
    if (!splashEnabled) return;

    let readyTimer: number | null = null;
    const finishInitial = (): void => hideOnNextFrame(prefersReducedMotion ? 30 : 80);

    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      readyTimer = window.setTimeout(finishInitial, prefersReducedMotion ? 30 : 60);
    } else {
      window.addEventListener("load", finishInitial, { once: true });
    }

    const fallbackTimer = window.setTimeout(() => hideSplash(0), initialFallbackMs);

    return () => {
      if (readyTimer !== null) window.clearTimeout(readyTimer);
      window.removeEventListener("load", finishInitial);
      window.clearTimeout(fallbackTimer);
      clearTimers();
      clearNavShowTimer();
      clearRaf();
    };
  }, [
    clearNavShowTimer,
    clearRaf,
    clearTimers,
    hideOnNextFrame,
    hideSplash,
    initialFallbackMs,
    prefersReducedMotion,
    splashEnabled,
  ]);

  // ✅ Navigation-triggered splash (client only)
  useEffect(() => {
    if (!isBrowser) return;

    if (!hasCompletedFirstPaint.current) {
      hasCompletedFirstPaint.current = true;
      return;
    }

    if (navigationType === "REPLACE") return;
    if (!matchesSplashRoute) return;

    navShowTimerRef.current = window.setTimeout(() => {
      showSplash();
      hideOnNextFrame(prefersReducedMotion ? 60 : navHoldMs);
    }, navShowDelayMs);

    return () => {
      clearNavShowTimer();
      clearTimers();
      clearRaf();
    };
  }, [
    clearNavShowTimer,
    clearRaf,
    clearTimers,
    hideOnNextFrame,
    matchesSplashRoute,
    navHoldMs,
    navShowDelayMs,
    prefersReducedMotion,
    showSplash,
    location.pathname,
    location.search,
    location.hash,
    navigationType,
  ]);

  // ✅ Cleanup (client only guard inside helpers)
  useEffect(() => {
    return () => {
      clearTimers();
      clearNavShowTimer();
      clearRaf();
    };
  }, [clearNavShowTimer, clearRaf, clearTimers]);

  // ✅ SSR render: portalTarget is null (no DOM), so we return null safely.
  // ✅ Client: portalTarget becomes document.body via layout effect.
  if (!mounted) return null;
  if (!portalTarget) return null;

  return createPortal(
    <div className="kai-splash" data-state={phase} aria-live="polite" role="status">
      <div className="kai-splash__grid" aria-hidden="true" />

      <div className="kai-splash__content" aria-hidden="true">
        <div className="kai-splash__badge">
          <span className="kai-splash__badge-halo" aria-hidden="true" />
          <span className="kai-splash__badge-glow" aria-hidden="true" />

          <div className="kai-splash__rays" aria-hidden="true" />

          <div className="kai-splash__badge-core">
            <img
              className="kai-splash__phi"
              src="/phi.svg"
              alt=""
              loading="eager"
              decoding="sync"
              draggable={false}
            />
            <span className="kai-splash__badge-orb" aria-hidden="true" />
            <span className="kai-splash__badge-core-shine" aria-hidden="true" />
          </div>

          <div className="kai-splash__ring" aria-hidden="true" />
          <div className="kai-splash__ring kai-splash__ring--inner" aria-hidden="true" />
          <div className="kai-splash__flare" aria-hidden="true" />
        </div>
      </div>

      <span className="sr-only">Preparing Atlantean link…</span>
    </div>,
    portalTarget,
  );
}
