import React from "react";
import ReactDOM from "react-dom/client";

// ✅ CSS FIRST (so App.css can be the final authority)
import "./styles.css";
import "./App.css";

import { APP_VERSION, SW_VERSION_EVENT } from "./version";

/* ────────────────────────────────────────────────────────────────
   Kai NOW seeding (μpulses) — one-time coordinate selection only.
   Priority:
     1) localStorage checkpoint (if present)
     2) build-injected env anchor: VITE_KAI_ANCHOR_MICRO
     3) performance.timeOrigin + performance.now() → bridged to μpulses
   NOTE:
     - We intentionally avoid importing kai_pulse (or anything that imports it)
       until AFTER we have ensured a seed checkpoint exists.
────────────────────────────────────────────────────────────────── */

const KAI_SEED_KEYS: readonly string[] = [
  // try multiple to match whatever you’ve used historically
  "kai.now.micro",
  "kai_now_micro",
  "kai_anchor_micro",
  "KAI_ANCHOR_MICRO",
  "KAI_NOW_MICRO",
];

const envUnknown = import.meta.env as Record<string, unknown>;

const readNumberEnv = (key: string): number => {
  const v = envUnknown[key];
  const n =
    typeof v === "number" ? v :
    typeof v === "string" ? Number(v) :
    NaN;

  if (!Number.isFinite(n)) {
    throw new Error(`Missing/invalid ${key}. Check vite.config.ts define() injection.`);
  }
  return n;
};

const GENESIS_TS_MS_UTC: number = readNumberEnv("VITE_KAI_GENESIS_TS_MS_UTC");
const PULSE_MS: number = readNumberEnv("VITE_KAI_PULSE_MS");

const parseBigInt = (v: unknown): bigint | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^-?\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
};

const floorBigIntFromNumber = (x: number): bigint => {
  if (!Number.isFinite(x)) return 0n;
  // floor toward -∞
  const f = Math.floor(x);
  // safe for current magnitudes (μpulses ~ 1e13–1e15 range)
  return BigInt(f);
};

const microPulsesSinceGenesisFromEpochMs = (epochMs: number): bigint => {
  const deltaMs = epochMs - GENESIS_TS_MS_UTC;
  const pulses = deltaMs / PULSE_MS; // bridge only
  return floorBigIntFromNumber(pulses * 1_000_000);
};

const readSeedFromLocalStorage = (): bigint | null => {
  if (typeof window === "undefined") return null;
  try {
    for (const k of KAI_SEED_KEYS) {
      const raw = window.localStorage.getItem(k);
      const b = parseBigInt(raw);
      if (b !== null) return b;
    }
  } catch {
    // ignore
  }
  return null;
};

const readSeedFromEnv = (): bigint | null => {
  const raw = envUnknown["VITE_KAI_ANCHOR_MICRO"];
  // vite define injects null literally when unset
  if (raw === null || raw === undefined) return null;
  return parseBigInt(raw);
};

const writeSeedCheckpoint = (pμ: bigint): void => {
  if (typeof window === "undefined") return;
  try {
    const s = pμ.toString();
    // write canonical + back-compat keys so older code paths still find it
    for (const k of KAI_SEED_KEYS) {
      if (window.localStorage.getItem(k) == null) {
        window.localStorage.setItem(k, s);
      }
    }
  } catch {
    // ignore
  }
};

const pickSeedMicroPulses = (): bigint => {
  const fromLS = readSeedFromLocalStorage();
  if (fromLS !== null) return fromLS;

  const fromEnv = readSeedFromEnv();
  if (fromEnv !== null) return fromEnv;

  // final fallback: one-time bridge from perf-derived epoch ms
  const epochMs = performance.timeOrigin + performance.now();
  return microPulsesSinceGenesisFromEpochMs(epochMs);
};

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

if (isProduction && typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", rewriteLegacyHash, { once: true });
}

const bootstrap = async (): Promise<void> => {
  // 🔒 MUST happen before any component/module calls kairosEpochNow()
  if (typeof window !== "undefined") {
    const pμ = pickSeedMicroPulses();
    writeSeedCheckpoint(pμ);

    // Now it is safe to import kai_pulse (it can read the checkpoint if it wants)
    const kai = await import("./utils/kai_pulse");
    kai.seedKaiNowMicroPulses(pμ);
  }

  // Import router only AFTER seeding
  const mod = await import("./router/AppRouter");
  const AppRouter = mod.default;

  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error('Missing #root element');

  ReactDOM.createRoot(rootEl as HTMLElement).render(
    <React.StrictMode>
      <AppRouter />
    </React.StrictMode>
  );
};

void bootstrap().catch((err) => {
  console.error("Bootstrap error:", err);
});

// ✅ Register Kairos Service Worker with instant-upgrade behavior
if ("serviceWorker" in navigator && isProduction) {
  const registerKairosSW = async (): Promise<void> => {
    try {
      const reg = await navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`, { scope: "/" });

      // Force refresh when a new worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
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

      const isSwActivatedMsg = (data: unknown): data is { type: "SW_ACTIVATED"; version: string } => {
        if (typeof data !== "object" || data === null) return false;
        const rec = data as Record<string, unknown>;
        return rec["type"] === "SW_ACTIVATED" && typeof rec["version"] === "string";
      };

      navigator.serviceWorker.addEventListener("message", (event: MessageEvent<unknown>) => {
        if (isSwActivatedMsg(event.data)) {
          console.log("Kairos service worker active", event.data.version);
          window.kairosSwVersion = event.data.version;
          window.dispatchEvent(new CustomEvent<string>(SW_VERSION_EVENT, { detail: event.data.version }));
        }
      });

      // ✅ Import cadence only after seed + SW reg (avoids early kai_pulse import paths)
      const cadence = await import("./utils/kai_cadence");

      cadence.startKaiCadence({
        unit: "beat",
        every: 1,
        onTick: async () => {
          await reg.update();
        },
      });

      console.log("Kairos Service Worker registered:", reg);
    } catch (err) {
      console.error("Service Worker error:", err);
    }
  };

  window.addEventListener("load", () => {
    void registerKairosSW();
  });
}
