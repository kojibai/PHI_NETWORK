// src/entry-client.tsx
import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

// ✅ CSS FIRST (so App.css can be the final authority)
import "./styles.css";
import "./App.css";

import AppRouter from "./router/AppRouter";
import { APP_VERSION, SW_VERSION_EVENT } from "./version";
import ErrorBoundary from "./components/ErrorBoundary";
import type { Groth16 } from "./components/VerifierStamper/zk";
import * as snarkjs from "snarkjs";
import { initReloadDetective } from "./utils/reloadDetective";
import { initPerfDebug } from "./perf/perfDebug";
import { readSnapshotFromDom, seedFromSnapshot, persistSnapshotToOfflineStores } from "./ssr/snapshotClient";
import { SsrSnapshotProvider } from "./ssr/SsrSnapshotContext";
import type { SsrSnapshot } from "./ssr/snapshotTypes";

// ✅ Scheduler cadence utils
import { startKaiCadence, startKaiFibBackoff } from "./utils/kai_cadence";

const isProduction = import.meta.env.MODE === "production";
const ssrSnapshot = typeof document !== "undefined" ? readSnapshotFromDom(document) : null;
seedFromSnapshot(ssrSnapshot);
persistSnapshotToOfflineStores(ssrSnapshot);

declare global {
  interface Window {
    kairosSwVersion?: string;
    kairosApplyUpdate?: () => void;
    snarkjs?: { groth16?: Groth16 };

    /**
     * Optional SSR marker:
     * If you actually SSR-render React into #root, set ONE of these in your HTML/template:
     *   window.__KAI_SSR__ = true
     *   <html data-kai-ssr="1">
     *   <div id="root" data-ssr="1">...</div>
     */
    __KAI_SSR__?: boolean;
    __SSR_SNAPSHOT_ETAG__?: string;
    __SSR_SNAPSHOT__?: SsrSnapshot;
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

  const newUrl = `${path}${search ? `?${search}` : ""}${add ? `#add=${add}` : ""}`;
  window.history.replaceState(null, "", newUrl);
}

if (isProduction) {
  window.addEventListener("DOMContentLoaded", rewriteLegacyHash, { once: true });
}

initPerfDebug();
initReloadDetective();

async function loadSnarkjsGlobal(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.snarkjs) return;

  try {
    const mod = snarkjs as unknown as { groth16?: Groth16; default?: { groth16?: Groth16 } };
    const groth16 = mod.groth16 ?? mod.default?.groth16;
    if (groth16) window.snarkjs = { groth16 };
  } catch (err) {
    console.error("Failed to load snarkjs", err);
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Hydration selection (THIS is what fixes your mismatch)
   - DO NOT hydrate unless you KNOW real SSR markup is present.
   - If #root contains any placeholder/splash markup (not SSR), we clear it and createRoot().
────────────────────────────────────────────────────────────────────── */
function pickRootEl(): HTMLElement | null {
  return (
    (document.getElementById("root") as HTMLElement | null) ||
    (document.getElementById("app") as HTMLElement | null) ||
    (document.getElementById("__next") as HTMLElement | null)
  );
}

function hasMeaningfulMarkup(el: HTMLElement): boolean {
  // avoids whitespace-only nodes, comments, etc.
  return el.innerHTML.trim().length > 0;
}

function hasSsrMarker(el: HTMLElement): boolean {
  const html = document.documentElement as HTMLElement | null;
  return Boolean(
    (window as Window).__KAI_SSR__ === true ||
      el.dataset.ssr === "1" ||
      html?.dataset?.kaiSsr === "1",
  );
}

const container = pickRootEl();

if (container) {
  const app = (
    <React.StrictMode>
      <ErrorBoundary>
        <SsrSnapshotProvider snapshot={ssrSnapshot}>
          <AppRouter />
        </SsrSnapshotProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );

  const hasMarkup = hasMeaningfulMarkup(container);
  const ssrMarked = hasSsrMarker(container);

  /**
   * ✅ Correct behavior:
   * - If SSR markup is present AND marked → hydrateRoot
   * - Otherwise → createRoot (no hydration mismatch)
   *
   * This eliminates the "server rendered HTML didn't match" spam in dev and non-SSR prod.
   */
  if (hasMarkup && ssrMarked) {
    hydrateRoot(container, app);
  } else {
    // If markup exists but isn't SSR React output (splash/placeholder), wipe it.
    if (hasMarkup && !ssrMarked) {
      container.innerHTML = "";
    }
    createRoot(container).render(app);
  }
}

void loadSnarkjsGlobal();

/* ─────────────────────────────────────────────────────────────────────
   Service worker registration (prod only)
────────────────────────────────────────────────────────────────────── */
if ("serviceWorker" in navigator && isProduction) {
  const registerKairosSW = async () => {
    try {
      const reg = await navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`, { scope: "/" });

      // Avoid mid-session reloads: only refresh when safe/idle.
      let pendingReload = false;

      const hasActiveKaiVohSession = (): boolean => {
        try {
          return Boolean(
            window.localStorage.getItem("kai.voh.session.v1") ||
              window.localStorage.getItem("kai.sigilAuth.v1"),
          );
        } catch {
          return false;
        }
      };

      const isInteractiveElement = (el: Element | null): boolean => {
        if (!el) return false;
        if (el instanceof HTMLInputElement) return true;
        if (el instanceof HTMLTextAreaElement) return true;
        if (el instanceof HTMLSelectElement) return true;
        if (el instanceof HTMLElement && el.isContentEditable) return true;
        return false;
      };

      const hasFocusedKaiVohField = (): boolean => {
        const active = document.activeElement;
        if (!active || active === document.body) return false;
        if (!(active instanceof HTMLElement)) return false;
        if (!active.closest(".kai-voh-app-shell, .kai-voh-login-shell, .kai-voh-modal-backdrop")) {
          return false;
        }
        return Boolean(
          isInteractiveElement(active) ||
            active.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']"),
        );
      };

      const hasActiveKaiVohUi = (): boolean => {
        return Boolean(
          document.querySelector(".kai-voh-modal-backdrop") ||
            document.querySelector(".kai-voh-app-shell") ||
            document.querySelector(".kai-voh-login-shell") ||
            document.querySelector(".kv-post-caption-textarea") ||
            document.querySelector(".composer-textarea") ||
            hasFocusedKaiVohField(),
        );
      };

      const isReloadSafe = (): boolean => !hasActiveKaiVohSession() && !hasActiveKaiVohUi();

      const markUpdateAvailable = (reason: string): void => {
        window.dispatchEvent(
          new CustomEvent("kairos-sw-update-available", {
            detail: { reason, version: window.kairosSwVersion },
          }),
        );
      };

      const tryReload = (reason: string): void => {
        if (!pendingReload) return;

        if (!isReloadSafe()) {
          markUpdateAvailable(`blocked:${reason}`);
          return;
        }

        if (document.visibilityState === "hidden") {
          window.location.reload();
        } else {
          markUpdateAvailable(`deferred:${reason}`);
        }
      };

   
 

      window.kairosApplyUpdate = () => {
        pendingReload = true;
        tryReload("manual");
      };

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

      // ✅ Beat cadence update checks (replaces hourly interval)
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
