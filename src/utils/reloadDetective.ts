// src/utils/reloadDetective.ts
"use client";

type NavEntry = PerformanceNavigationTiming | PerformanceEntry;

type AnyFunc = (...args: unknown[]) => unknown;

const DEBUG_QS_KEY = "debugReload";
const DEBUG_STORAGE_KEY = "debugReload";
const LOG_PREFIX = "[Reload Detective]";

function readDebugFlag(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const qsVal = params.get(DEBUG_QS_KEY);
  if (qsVal === "1" || qsVal === "true") return true;
  try {
    const stored = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    return stored === "1" || stored === "true";
  } catch {
    return false;
  }
}

export function isReloadDebugEnabled(): boolean {
  return readDebugFlag();
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(LOG_PREFIX, ...args);
}

function logWarn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(LOG_PREFIX, ...args);
}

function safeTrace(label: string): void {
  try {
    // eslint-disable-next-line no-console
    console.trace(LOG_PREFIX, label);
  } catch {
    logWarn("trace unavailable for", label);
  }
}

function formatNavEntry(entry: NavEntry): Record<string, unknown> {
  const navEntry = entry as PerformanceNavigationTiming;
  return {
    name: entry.name,
    entryType: entry.entryType,
    type: "type" in navEntry ? navEntry.type : undefined,
    redirectCount: "redirectCount" in navEntry ? navEntry.redirectCount : undefined,
    startTime: entry.startTime,
    duration: entry.duration,
  };
}

function patchMethod<T extends object>(
  target: T,
  key: keyof T,
  label: string,
  logger: (...args: unknown[]) => void
): void {
  const original = target[key];
  if (typeof original !== "function") return;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    logger(label, ...args);
    safeTrace(label);
    return (original as AnyFunc).apply(this, args);
  };
  try {
    (target as Record<string, unknown>)[key as string] = wrapped as unknown;
  } catch {
    logWarn("Failed to patch", label);
  }
}

function attachServiceWorkerLogging(): void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

  log("serviceWorker controller", navigator.serviceWorker.controller);

  void navigator.serviceWorker.ready
    .then((registration) => {
      log("serviceWorker ready", registration);

      const reportWorker = (worker: ServiceWorker | null, phase: string): void => {
        if (!worker) return;
        log(`serviceWorker ${phase}`, worker.state);
        worker.addEventListener("statechange", () => {
          log(`serviceWorker ${phase} statechange`, worker.state);
        });
      };

      reportWorker(registration.installing, "installing");
      reportWorker(registration.waiting, "waiting");
      reportWorker(registration.active, "active");

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        log("serviceWorker updatefound", worker?.state);
        if (worker) {
          worker.addEventListener("statechange", () => {
            log("serviceWorker updatefound statechange", worker.state);
          });
        }
      });
    })
    .catch((err) => logWarn("serviceWorker ready error", err));
}

function attachFormLogging(): void {
  document.addEventListener(
    "submit",
    (event) => {
      const target = event.target as HTMLFormElement | null;
      log("form submit", {
        target,
        action: target?.getAttribute("action"),
        method: target?.getAttribute("method"),
      });
      safeTrace("form submit");
    },
    { capture: true }
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const submitLike = target.closest("button, input");
      if (!submitLike) return;

      if (submitLike instanceof HTMLButtonElement) {
        const type = (submitLike.getAttribute("type") || "submit").toLowerCase();
        if (type !== "submit") return;
      }

      if (submitLike instanceof HTMLInputElement) {
        const type = submitLike.type ? submitLike.type.toLowerCase() : "submit";
        if (type !== "submit" && type !== "image") return;
      }

      log("submit-like click", submitLike);
      safeTrace("submit-like click");
    },
    { capture: true }
  );
}

function attachLifecycleLogging(): void {
  const logEvent = (name: string) => () => log(`event:${name}`, { visibility: document.visibilityState });
  window.addEventListener("beforeunload", logEvent("beforeunload"));
  window.addEventListener("unload", logEvent("unload"));
  window.addEventListener("pagehide", (event) => log("event:pagehide", event));
  window.addEventListener("pageshow", (event) => log("event:pageshow", event));
  document.addEventListener("visibilitychange", logEvent("visibilitychange"));
  window.addEventListener("freeze", logEvent("freeze"));
  window.addEventListener("resume", logEvent("resume"));
}

let started = false;

export function initReloadDetective(): void {
  if (started) return;
  if (!isReloadDebugEnabled()) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  started = true;

  log("Reload detective enabled", {
    url: window.location.href,
    userAgent: navigator.userAgent,
  });

  try {
    const entries = performance.getEntriesByType("navigation");
    log("performance navigation entries", entries.map(formatNavEntry));
  } catch (err) {
    logWarn("performance navigation read failed", err);
  }

  attachLifecycleLogging();
  attachFormLogging();
  attachServiceWorkerLogging();

  patchMethod(window.location, "assign", "location.assign", log);
  patchMethod(window.location, "replace", "location.replace", log);
  patchMethod(window.location, "reload", "location.reload", logWarn);

  patchMethod(window.history, "pushState", "history.pushState", log);
  patchMethod(window.history, "replaceState", "history.replaceState", log);

  patchMethod(window, "open", "window.open", log);
}
