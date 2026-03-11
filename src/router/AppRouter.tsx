import React from "react";
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

import SigilFeedPage from "../pages/SigilFeedPage";
import PShort from "../pages/PShort";
import VerifyPage from "../pages/VerifyPage";
import VerifyEmbedPage from "../pages/VerifyEmbedPage";

// ✅ SigilPage stays eager so it always opens offline (no missing chunk)
import SigilPage from "../pages/SigilPage/SigilPage";

// ✅ HOME MUST BE INSTANT → eager import (no Suspense fallback)
import VerifierStamper from "../components/VerifierStamper/VerifierStamper";

export function AppRoutes(): React.JSX.Element {
  return (
    <>
      <PerfProfiler id="routes">
        <Routes>
          <Route path="s" element={<SigilPage />} />
          <Route path="s/:hash" element={<SigilPage />} />

          <Route path="stream" element={<SigilFeedPage />} />
          <Route path="stream/p/:token" element={<SigilFeedPage />} />
          <Route path="stream/c/:token" element={<SigilFeedPage />} />
          <Route path="feed" element={<SigilFeedPage />} />
          <Route path="feed/p/:token" element={<SigilFeedPage />} />

          <Route path="p~:token" element={<SigilFeedPage />} />
          <Route path="p~:token/*" element={<PShort />} />

          <Route path="token" element={<SigilFeedPage />} />
          <Route path="p~token" element={<SigilFeedPage />} />
          <Route path="p" element={<PShort />} />

          <Route path="verify/*" element={<VerifyPage />} />
          <Route path="embed/verify/:slug" element={<VerifyEmbedPage />} />

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
