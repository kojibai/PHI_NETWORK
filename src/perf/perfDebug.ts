type PerfLog = {
  label: string;
  start: number;
  state?: number;
};

type PerfWindow = Window & {
  markInteraction?: (label: string, phase?: "start" | "state" | "end") => void;
};

const perfLogs = new Map<string, PerfLog>();
let perfEnabled = false;

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

export const isPerfEnabled = (): boolean => perfEnabled;

export const logPerf = (...args: unknown[]) => {
  if (!perfEnabled) return;
  // eslint-disable-next-line no-console
  console.log("[perf]", ...args);
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return "\"[unserializable]\"";
  }
};

const getPerfFlag = (): boolean => {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  return url.searchParams.get("perf") === "1" || window.localStorage.getItem("perf") === "1";
};

const patchLocation = (key: "assign" | "replace" | "reload") => {
  const original = window.location[key].bind(window.location) as (...args: unknown[]) => void;
  const locationAny = window.location as unknown as Record<string, (...args: unknown[]) => void>;
  locationAny[key] = (...args: unknown[]) => {
    logPerf(`location.${key}`, ...args);
    return original(...args);
  };
};

const patchHistory = (key: "pushState" | "replaceState") => {
  const original = window.history[key].bind(window.history);
  window.history[key] = ((...args: Parameters<History["pushState"]>) => {
    logPerf(`history.${key}`, ...args);
    return original(...args);
  }) as History["pushState"];
};

const addNavListener = (event: string) => {
  window.addEventListener(
    event as keyof WindowEventMap,
    (evt) => {
      logPerf(event, {
        type: evt.type,
        time: now(),
        state: (evt as PageTransitionEvent).persisted,
        visibility: document.visibilityState,
      });
    },
    { passive: true }
  );
};

const observeLongTasks = () => {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        logPerf("longtask", { duration: entry.duration, startTime: entry.startTime });
      });
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch (err) {
    logPerf("longtask observer failed", err);
  }
};

export const markInteraction = (label: string, phase: "start" | "state" | "end" = "start") => {
  if (!perfEnabled) return;
  const existing = perfLogs.get(label);
  const t = now();
  if (phase === "start" || !existing) {
    perfLogs.set(label, { label, start: t });
    return;
  }
  if (phase === "state") {
    perfLogs.set(label, { ...existing, state: t });
    return;
  }
  if (phase === "end") {
    const entry = perfLogs.get(label);
    if (!entry) return;
    requestAnimationFrame(() => {
      const paint = now();
      logPerf("interaction", {
        label,
        start: entry.start,
        state: entry.state ?? null,
        toStateMs: entry.state ? entry.state - entry.start : null,
        toPaintMs: paint - entry.start,
      });
      perfLogs.delete(label);
    });
  }
};

const installInteractionDebug = () => {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.closest<HTMLElement>("[data-perf-action]");
      const label = tag?.dataset.perfAction;
      if (!label) return;
      markInteraction(label, "start");
    },
    { passive: true, capture: true }
  );
  document.addEventListener(
    "pointerup",
    (event) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.closest<HTMLElement>("[data-perf-action]");
      const label = tag?.dataset.perfAction;
      if (!label) return;
      markInteraction(label, "end");
    },
    { passive: true, capture: true }
  );
};

const installGlobalFormGuard = () => {
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target as HTMLFormElement | null;
    logPerf("form submit", {
        action: form?.action,
        method: form?.method,
        id: form?.id,
      });
    },
    { capture: true }
  );
};

const observeServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    logPerf("sw controllerchange");
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    logPerf("sw message", safeStringify(event.data));
  });
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    reg.addEventListener("updatefound", () => {
      logPerf("sw updatefound");
    });
    reg.installing?.addEventListener("statechange", () => {
      logPerf("sw statechange", reg.installing?.state);
    });
  });
};

export const initPerfDebug = () => {
  if (typeof window === "undefined") return;
  perfEnabled = getPerfFlag();
  if (!perfEnabled) return;

  const navEntries = performance.getEntriesByType("navigation");
  navEntries.forEach((entry) => {
    const nav = entry as PerformanceNavigationTiming;
    logPerf("navigation", {
      type: nav.type,
      domContentLoaded: nav.domContentLoadedEventEnd,
      loadEventEnd: nav.loadEventEnd,
      transferSize: nav.transferSize,
    });
  });

  addNavListener("beforeunload");
  addNavListener("pagehide");
  addNavListener("pageshow");
  addNavListener("visibilitychange");
  addNavListener("freeze");
  addNavListener("resume");

  patchLocation("assign");
  patchLocation("replace");
  patchLocation("reload");
  patchHistory("pushState");
  patchHistory("replaceState");

  installGlobalFormGuard();
  observeLongTasks();
  observeServiceWorker();
  installInteractionDebug();

  (window as PerfWindow).markInteraction = markInteraction;
  logPerf("perf debug enabled");
};
