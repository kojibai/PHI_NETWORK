// src/utils/kaiMath.ts
import { latticeFromPulse, PULSES_STEP, STEPS_BEAT } from "./kai_pulse";

export function stepsToPulses(steps: number) {
  return Math.max(0, Math.floor(steps)) * PULSES_STEP;
}
export function breathsToPulses(breaths: number) {
  return Math.max(0, Math.floor(breaths));
}

export function stepIndexFromPulse(pulse: number, stepsPerBeat: number) {
  const steps = Number.isFinite(stepsPerBeat) && stepsPerBeat > 0 ? Math.floor(stepsPerBeat) : STEPS_BEAT;
  if (steps === STEPS_BEAT) return latticeFromPulse(pulse).stepIndex;
  const safePulse = Number.isFinite(pulse) ? Math.trunc(pulse) : 0;
  const pulsesPerBeat = PULSES_STEP * steps;
  const into = ((safePulse % pulsesPerBeat) + pulsesPerBeat) % pulsesPerBeat;
  return Math.floor(into / PULSES_STEP);
}
export function stepProgressWithinStepFromPulse(pulse: number, stepsPerBeat: number) {
  const steps = Number.isFinite(stepsPerBeat) && stepsPerBeat > 0 ? Math.floor(stepsPerBeat) : STEPS_BEAT;
  if (steps === STEPS_BEAT) return latticeFromPulse(pulse).percentIntoStep;
  const safePulse = Number.isFinite(pulse) ? Math.trunc(pulse) : 0;
  const pulsesPerBeat = PULSES_STEP * steps;
  const into = ((safePulse % pulsesPerBeat) + pulsesPerBeat) % pulsesPerBeat;
  const intoStep = into % PULSES_STEP;
  return intoStep / PULSES_STEP;
}
