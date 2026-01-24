import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { AppRoutes } from "./router/AppRouter";
import ErrorBoundary from "./components/ErrorBoundary";

export type SsrRenderOptions = {
  onShellReady: () => void;
  onAllReady: () => void;
  onShellError: (error: unknown) => void;
  onError: (error: unknown) => void;
};

export const render = (url: string, options: SsrRenderOptions) => {
  return renderToPipeableStream(
    <React.StrictMode>
      <ErrorBoundary>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </ErrorBoundary>
    </React.StrictMode>,
    options
  );
};
