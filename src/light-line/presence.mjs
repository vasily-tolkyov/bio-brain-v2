import { L1_DEFAULTS } from './boundary-config.mjs';

export const WINDOW_MS = L1_DEFAULTS.windowMs;
export const PRESENCE_THRESHOLD = L1_DEFAULTS.readoutThreshold;
export const strengthOK = x => Number.isFinite(x) && x >= 0 && x <= 1;

/** Input is P7 over contrast-discovered physical members. Visibility (.3)
 * selects members inside the optical boundary; strict P7>.25 is its existing
 * observation deadband. No brightness subtraction enters either comparator. */
export function present(value) {
  if (!strengthOK(value)) throw new RangeError('Presence requires a strength in [0,1]');
  return Number(value > PRESENCE_THRESHOLD);
}
export const novelty = (reality, prediction) => present(reality) * (1 - present(prediction));
export const deficit = (goal, reality) => present(goal) * (1 - present(reality));

export function checkWindow(t, previous, ids, ...vectors) {
  if (!Number.isFinite(t) || t < 0 || t % WINDOW_MS ||
      (previous !== null && t !== previous + WINDOW_MS) ||
      vectors.some(xs => xs.length !== ids.length || !Array.from(xs).every(strengthOK))) {
    throw new Error('Invalid comparator window or strengths');
  }
}
