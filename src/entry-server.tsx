import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router";
import { AppRoutes } from "./router/AppRouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { SsrSnapshotProvider } from "./ssr/SsrSnapshotContext";
import type { SsrSnapshot } from "./ssr/snapshotTypes";

export type SsrRenderOptions = {
  onShellReady: () => void;
  onAllReady: () => void;
  onShellError: (error: unknown) => void;
  onError: (error: unknown) => void;
};

export const render = (
  url: string,
  snapshot: SsrSnapshot | null,
  options: SsrRenderOptions
) => {
  return renderToPipeableStream(
    <React.StrictMode>
      <ErrorBoundary>
        <SsrSnapshotProvider snapshot={snapshot}>
          <StaticRouter location={url}>
            <AppRoutes />
          </StaticRouter>
        </SsrSnapshotProvider>
      </ErrorBoundary>
    </React.StrictMode>,
    options
  );
};

export { safeJsonStringify, stableJsonStringify, buildSnapshotEntries, LruTtlCache } from "./ssr/serverExports";
export { renderVerifiedOgPng } from "./og/renderVerifiedOg";
export { renderNotFoundOgPng } from "./og/renderNotFoundOg";
export { getCapsuleByHash, getCapsuleByVerifierSlug } from "./og/capsuleStore";
export { LruTtlCache as OgLruTtlCache } from "./og/cache";
