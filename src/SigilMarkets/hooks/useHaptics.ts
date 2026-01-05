// SigilMarkets/hooks/useHaptics.ts
"use client";

/**
 * SigilMarkets — useHaptics
 *
 * UX goal:
 * - Make the app feel "alive" on pulse-bound events (lock, mint, win, close).
 * - Never be annoying: respect user toggles + platform capability.
 *
 * Implementation:
 * - Uses navigator.vibrate where available (Android/Chromium).
 * - iOS Safari doesn't expose a public vibration API; we gracefully no-op.
 * - Call sites should keep haptics sparse and meaningful.
 */

import { useCallback, useMemo } from "react";
import { useSigilMarketsUi } from "../state/uiStore";

export type HapticKind =
  | "tap" // light selection / button tap
  | "toggle" // YES/NO switch, segment change
  | "tick" // subtle pulse tick
  | "confirm" // lock confirm / mint
  | "success" // win / claim
  | "warning" // dispute / caution
  | "error"; // failure / rejected

export type UseHaptics = Readonly<{
  supported: boolean;
  enabled: boolean;
  fire: (kind: HapticKind) => void;
  firePattern: (patternMs: readonly number[]) => void;
}>;

const hasVibrate = (): boolean => {
  try {
    if (typeof navigator === "undefined") return false;
    return typeof navigator.vibrate === "function";
  } catch {
    return false;
  }
};

// IMPORTANT: navigator.vibrate expects VibratePattern (number | number[]), NOT readonly arrays.
const vibrate = (pattern: VibratePattern): void => {
  try {
    if (!hasVibrate()) return;
    navigator.vibrate(pattern);
  } catch {
    // no-op
  }
};

const patternFor = (kind: HapticKind): readonly number[] => {
  // Patterns are in ms; keep short.
  // NOTE: iOS will no-op; this is fine.
  switch (kind) {
    case "tap":
      return [10];
    case "toggle":
      return [12];
    case "tick":
      return [6];
    case "confirm":
      return [12, 20, 18];
    case "success":
      return [14, 22, 14, 22, 22];
    case "warning":
      return [18, 26, 18];
    case "error":
      return [28, 24, 28, 24, 40];
    default: {
      // exhaustive
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _never: never = kind;
      return [10];
    }
  }
};

export const useHaptics = (): UseHaptics => {
  const { state } = useSigilMarketsUi();

  const enabled = state.hapticsEnabled;
  const supported = useMemo(() => hasVibrate(), []);

  const firePattern = useCallback(
    (patternMs: readonly number[]) => {
      if (!enabled) return;
      if (!supported) return;
      if (!patternMs || patternMs.length === 0) return;

      // Clamp values to a sane range; browsers may ignore extreme values.
      // This produces a MUTABLE number[] (good for VibratePattern).
      const safe: number[] = patternMs
        .map((n) => (Number.isFinite(n) ? Math.max(1, Math.min(250, Math.floor(n))) : 0))
        .filter((n) => n > 0);

      if (safe.length === 0) return;
      vibrate(safe); // ✅ safe is number[] (mutable), matches VibratePattern
    },
    [enabled, supported],
  );

  const fire = useCallback(
    (kind: HapticKind) => {
      firePattern(patternFor(kind));
    },
    [firePattern],
  );

  return { supported, enabled, fire, firePattern };
};
