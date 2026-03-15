import React, { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import {
  AppChrome,
  ExplorerRoute,
  KaiVohRoute,
  KlockRoute,
  NotFound,
  SigilMintRoute,
} from "../App";
import KaiSplashScreen from "../components/KaiSplashScreen";
import { PerfProfiler } from "../perf/PerfProfiler";
import { computeMobileLiteMode } from "../hooks/useMobileLiteMode";

// Standalone pages stay lazy (RouteLoader allowed here)
const SigilFeedPage = React.lazy(() => import("../pages/SigilFeedPage"));
const PShort = React.lazy(() => import("../pages/PShort"));
const VerifyPage = React.lazy(() => import("../pages/VerifyPage"));
const VerifyEmbedPage = React.lazy(() => import("../pages/VerifyEmbedPage"));

// ✅ SigilPage stays eager so it always opens offline (no missing chunk)
import SigilPage from "../pages/SigilPage/SigilPage";

// ✅ HOME MUST BE INSTANT → eager import (no Suspense fallback)
import VerifierStamper from "../components/VerifierStamper/VerifierStamper";

const PREFETCH_LAZY_ROUTES: ReadonlyArray<() => Promise<unknown>> = [
  () => import("../pages/SigilFeedPage"),
  () => import("../pages/PShort"),
  () => import("../pages/VerifyPage"),
  () => import("../pages/VerifyEmbedPage"),
];

function shouldPrefetchLazyRoutes(): boolean {
  if (typeof navigator === "undefined") return false;
  if (computeMobileLiteMode()) return false;
  const navAny = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  const saveData = Boolean(navAny.connection?.saveData);
  const et = navAny.connection?.effectiveType || "";
  const slowNet = et === "slow-2g" || et === "2g";
  const lowMemory = typeof navAny.deviceMemory === "number" && navAny.deviceMemory > 0 && navAny.deviceMemory <= 2;
  return !(saveData || slowNet || lowMemory);
}

function RouteLoader(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "1.25rem",
        background:
          "radial-gradient(circle at 25% 10%, rgba(51,246,255,.06), transparent 48%), radial-gradient(circle at 75% 85%, rgba(155,91,255,.08), transparent 58%), linear-gradient(160deg, rgba(2,3,10,.96), rgba(6,14,35,.96))",
      }}
    >
      <div
        style={{
          padding: "0.85rem 1rem",
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(8,14,16,.6)",
          color: "rgba(231,251,247,.92)",
          boxShadow: "0 14px 34px rgba(0,0,0,.24)",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Opening...
      </div>
    </div>
  );
}

function withStandaloneSuspense(node: React.ReactElement): React.JSX.Element {
  return <Suspense fallback={<RouteLoader />}>{node}</Suspense>;
}

// AppChrome routes: NEVER show the RouteLoader (home must be instant)
function withChromeSuspense(node: React.ReactElement): React.JSX.Element {
  return <Suspense fallback={null}>{node}</Suspense>;
}

export function AppRoutes(): React.JSX.Element {
  return (
    <>
      {/* stays allowed; your App.tsx already hard-kills splash on "/" */}
      <KaiSplashScreen />

      <PerfProfiler id="routes">
        <Routes>
          {/* ───────────── Standalone routes (RouteLoader is allowed here) ───────────── */}
          <Route path="s" element={withStandaloneSuspense(<SigilPage />)} />
          <Route path="s/:hash" element={withStandaloneSuspense(<SigilPage />)} />

          <Route path="stream" element={withStandaloneSuspense(<SigilFeedPage />)} />
          <Route path="stream/p/:token" element={withStandaloneSuspense(<SigilFeedPage />)} />
          <Route path="stream/c/:token" element={withStandaloneSuspense(<SigilFeedPage />)} />
          <Route path="feed" element={withStandaloneSuspense(<SigilFeedPage />)} />
          <Route path="feed/p/:token" element={withStandaloneSuspense(<SigilFeedPage />)} />

          <Route path="p~:token" element={withStandaloneSuspense(<SigilFeedPage />)} />
          <Route path="p~:token/*" element={withStandaloneSuspense(<PShort />)} />

          <Route path="token" element={withStandaloneSuspense(<SigilFeedPage />)} />
          <Route path="p~token" element={withStandaloneSuspense(<SigilFeedPage />)} />
          <Route path="p" element={withStandaloneSuspense(<PShort />)} />

          <Route path="verify/*" element={withStandaloneSuspense(<VerifyPage />)} />
          <Route path="embed/verify/:slug" element={withStandaloneSuspense(<VerifyEmbedPage />)} />

          {/* ───────────── App shell routes (NO RouteLoader, home = instant) ───────────── */}
          <Route
            element={
              <PerfProfiler id="app-chrome">
                <AppChrome />
              </PerfProfiler>
            }
          >
            <Route
              index
              element={
                <PerfProfiler id="verifier-stamper">
                  <VerifierStamper />
                </PerfProfiler>
              }
            />
            <Route path="mint" element={<SigilMintRoute />} />
            <Route path="voh" element={<KaiVohRoute />} />
            <Route path="explorer" element={<ExplorerRoute />} />
            <Route path="keystream" element={<ExplorerRoute />} />
            <Route path="klock" element={<KlockRoute />} />
            <Route path="klok" element={<KlockRoute />} />
            <Route path="*" element={withChromeSuspense(<NotFound />)} />
          </Route>
        </Routes>
      </PerfProfiler>
    </>
  );
}

export default function AppRouter(): React.JSX.Element {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const idleWin = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const warmLazyBundles = (): void => {
      if (!shouldPrefetchLazyRoutes()) return;
      for (const prefetch of PREFETCH_LAZY_ROUTES) {
        prefetch().catch(() => {
          /* non-blocking */
        });
      }
    };

    const idleHandle =
      typeof idleWin.requestIdleCallback === "function"
        ? idleWin.requestIdleCallback(warmLazyBundles, { timeout: 1000 })
        : window.setTimeout(warmLazyBundles, 380);

    return () => {
      if (typeof idleWin.cancelIdleCallback === "function") {
        idleWin.cancelIdleCallback(idleHandle as number);
      } else {
        window.clearTimeout(idleHandle as number);
      }
    };
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
