import {
  BASE_DAY_MICRO,
  N_DAY_MICRO,
  PULSES_PER_BEAT_MICRO,
  PULSES_PER_STEP_MICRO,
  STEPS_BEAT,
} from "../../utils/kai_pulse";

/* SAFE steps per beat (>=1), integer */
export const STEPS_SAFE =
  Number.isFinite(STEPS_BEAT) && STEPS_BEAT > 0 ? Math.trunc(STEPS_BEAT) : 6;

const modE = (a: bigint, m: bigint) => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};

const microPulsesFromPulse = (pulse: number) => {
  if (!Number.isFinite(pulse)) return 0n;
  return BigInt(Math.floor(pulse * 1_000_000));
};

/* Exact integer step from absolute pulse (0..43), clamped to STEPS_SAFE range */
export function stepIndexFromPulseExact(pulse: number): number {
  const pμ = microPulsesFromPulse(pulse);
  const pulsesInDay = modE(pμ, N_DAY_MICRO);
  const pulsesInGrid = pulsesInDay % BASE_DAY_MICRO;
  const beatBI = pulsesInGrid / PULSES_PER_BEAT_MICRO;              // 0..35
  const pulsesInBeat = pulsesInGrid - beatBI * PULSES_PER_BEAT_MICRO;
  const stepBI = pulsesInBeat / PULSES_PER_STEP_MICRO;              // 0..43
  const idx = Number(stepBI);
  return Math.min(Math.max(0, idx), Math.max(1, STEPS_SAFE) - 1);
}

/* Fractional pct into current step [0,1) using absolute pulse */
export function percentIntoStepFromPulseExact(pulse: number): number {
  const pμ = microPulsesFromPulse(pulse);
  const pulsesInDay = modE(pμ, N_DAY_MICRO);
  const pulsesInGrid = pulsesInDay % BASE_DAY_MICRO;
  const beatBI = pulsesInGrid / PULSES_PER_BEAT_MICRO;
  const pulsesInBeat = pulsesInGrid - beatBI * PULSES_PER_BEAT_MICRO;
  const stepBI = pulsesInBeat / PULSES_PER_STEP_MICRO;
  const pulsesInStep = pulsesInBeat - stepBI * PULSES_PER_STEP_MICRO;
  const v = Number(pulsesInStep) / Number(PULSES_PER_STEP_MICRO);
  return v >= 1 ? 1 - Number.EPSILON : v < 0 ? 0 : v;
}
