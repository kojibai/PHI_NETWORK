import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import {
  AppChrome,
  ExplorerRoute,
  KaiVohRoute,
  KlockRoute,
  NotFound,
  SigilMintRoute,
} from "../App";
import { PerfProfiler } from "../perf/PerfProfiler";

// ✅ SigilPage stays eager so it always opens offline (no missing chunk)
import SigilPage from "../pages/SigilPage/SigilPage";

const SigilFeedPage = lazy(() => import("../pages/SigilFeedPage"));
const PShort = lazy(() => import("../pages/PShort"));
const VerifyPage = lazy(() => import("../pages/VerifyPage"));
const VerifyEmbedPage = lazy(() => import("../pages/VerifyEmbedPage"));
const VerifierStamper = lazy(() => import("../components/VerifierStamper/VerifierStamper"));

export function AppRoutes(): React.JSX.Element {
  return (
    <>
      <PerfProfiler id="routes">
        <Routes>
          <Route path="s" element={<SigilPage />} />
          <Route path="s/:hash" element={<SigilPage />} />

          <Route path="stream" element={<Suspense fallback={null}><SigilFeedPage /></Suspense>} />
          <Route path="stream/p/:token" element={<Suspense fallback={null}><SigilFeedPage /></Suspense>} />
          <Route path="stream/c/:token" element={<Suspense fallback={null}><SigilFeedPage /></Suspense>} />
          <Route path="feed" element={<Suspense fallback={null}><SigilFeedPage /></Suspense>} />
          <Route path="feed/p/:token" element={<Suspense fallback={null}><SigilFeedPage /></Suspense>} />

          <Route path="p~:token" element={<Suspense fallback={null}><SigilFeedPage /></Suspense>} />
          <Route path="p~:token/*" element={<Suspense fallback={null}><PShort /></Suspense>} />

          <Route path="token" element={<Suspense fallback={null}><SigilFeedPage /></Suspense>} />
          <Route path="p~token" element={<Suspense fallback={null}><SigilFeedPage /></Suspense>} />
          <Route path="p" element={<Suspense fallback={null}><PShort /></Suspense>} />

          <Route path="verify/*" element={<Suspense fallback={null}><VerifyPage /></Suspense>} />
          <Route path="embed/verify/:slug" element={<Suspense fallback={null}><VerifyEmbedPage /></Suspense>} />

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
                  <Suspense fallback={null}>
                    <VerifierStamper />
                  </Suspense>
                </PerfProfiler>
              }
            />
            <Route path="mint" element={<SigilMintRoute />} />
            <Route path="voh" element={<KaiVohRoute />} />
            <Route path="explorer" element={<ExplorerRoute />} />
            <Route path="keystream" element={<ExplorerRoute />} />
            <Route path="klock" element={<KlockRoute />} />
            <Route path="klok" element={<KlockRoute />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </PerfProfiler>
    </>
  );
}

export default function AppRouter(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
