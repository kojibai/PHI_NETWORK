import React from "react";
import ReactDOM from "react-dom/client";

// ✅ CSS FIRST (so App.css can be the final authority)
import "./styles.css";
import "./App.css";

import AppRouter from "./router/AppRouter";
import { APP_VERSION, SW_VERSION_EVENT } from "./version";
import ErrorBoundary from "./components/ErrorBoundary";
import type { Groth16 } from "./components/VerifierStamper/zk";
import * as snarkjs from "snarkjs";

// ✅ REPLACE scheduler impl with your utils cadence file
import { startKaiCadence, startKaiFibBackoff } from "./utils/kai_cadence";

const isProduction = import.meta.env.MODE === "production";

declare global {
  interface Window {
    kairosSwVersion?: string;
  }
}

function rewriteLegacyHash(): void {
  const h = window.location.hash || "";
  if (!h.startsWith("#/")) return;

  const frag = h.slice(1); // "/stream/p/ABC123?add=...."
  const qMark = frag.indexOf("?");
  const path = (qMark === -1 ? frag : frag.slice(0, qMark)) || "/";
  const query = qMark === -1 ? "" : frag.slice(qMark + 1);

  if (!path.startsWith("/stream/p/")) return;

  const qs = new URLSearchParams(query);
  const add = qs.get("add") || "";
  qs.delete("add");
  const search = qs.toString();

  const newUrl =
    `${path}${search ? `?${search}` : ""}` +
    `${add ? `#add=${add}` : ""}`;

  window.history.replaceState(null, "", newUrl);
}

if (isProduction) {
  window.addEventListener("DOMContentLoaded", rewriteLegacyHash, { once: true });
}

async function loadSnarkjsGlobal(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.snarkjs) return;

  try {
    const mod = snarkjs as unknown as { groth16?: Groth16; default?: { groth16?: Groth16 } };
    const groth16 = mod.groth16 ?? mod.default?.groth16;
    if (groth16) {
      window.snarkjs = { groth16 };
    }
  } catch (err) {
    console.error("Failed to load snarkjs", err);
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  </React.StrictMode>
);

void loadSnarkjsGlobal();

// ✅ Register Kairos Service Worker with instant-upgrade behavior
if ("serviceWorker" in navigator && isProduction) {
  const registerKairosSW = async () => {
    try {
      const reg = await navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`, { scope: "/" });

      // Avoid mid-session reloads: refresh on next background/idle moment.
      let pendingReload = false;
      const tryReload = () => {
        if (!pendingReload) return;
        if (document.visibilityState === "hidden") {
          window.location.reload();
        }
      };
      const onVisChange = () => tryReload();
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        pendingReload = true;
        tryReload();
        document.addEventListener("visibilitychange", onVisChange, { passive: true, once: true });
      });

      // Auto-skip waiting once the new worker finishes installing
      const triggerSkipWaiting = (worker: ServiceWorker | null) => {
        worker?.postMessage({ type: "SKIP_WAITING" });
      };

      const watchForUpdates = (registration: ServiceWorkerRegistration) => {
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              triggerSkipWaiting(newWorker);
            }
          });
        });
      };

      watchForUpdates(reg);

      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SW_ACTIVATED") {
          console.log("Kairos service worker active", event.data.version);
          if (typeof event.data.version === "string") {
            window.kairosSwVersion = event.data.version;
            window.dispatchEvent(new CustomEvent(SW_VERSION_EVENT, { detail: event.data.version }));
          }
        }
      });

      // ✅ REPLACES the hour interval: Kai beat cadence via utils
      const navAny = navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      };
      const saveData = Boolean(navAny.connection?.saveData);
      const effectiveType = navAny.connection?.effectiveType || "";
      const slowNet = effectiveType === "slow-2g" || effectiveType === "2g";

      if (saveData || slowNet) {
        startKaiCadence({
          unit: "beat",
          every: 144,
          onTick: async () => {
            await reg.update();
          },
        });
      } else {
        startKaiFibBackoff({
          unit: "beat",
          work: async () => {
            await reg.update();
          },
        });
      }

      console.log("Kairos Service Worker registered:", reg);
    } catch (err) {
      console.error("Service Worker error:", err);
    }
  };

  window.addEventListener("load", registerKairosSW);
}
