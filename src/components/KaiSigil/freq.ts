import { CHAKRA_BASE_FREQ } from "./constants";
import type { ChakraDayKey } from "./types";
import { PHI } from "./constants";
import { STEPS_BEAT } from "../utils/kai_pulse";

const STEPS_SAFE =
  Number.isFinite(STEPS_BEAT) && STEPS_BEAT > 0 ? Math.trunc(STEPS_BEAT) : 6;

export const deriveFrequencyHzSafe = (c: ChakraDayKey, si: number) =>
  +(
    CHAKRA_BASE_FREQ[c] *
    Math.pow(PHI, (Number.isFinite(si) ? si : 0) / STEPS_SAFE)
  ).toFixed(3);
