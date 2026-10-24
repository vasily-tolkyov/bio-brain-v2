/** Light upper -> lower plastic connections. All bookkeeping is between P7 windows. */
import { TimeUnroll } from './unroll.mjs';

// Layer-2 constants, shared by every world, feature and column.
export const DOWNWARD = Object.freeze({ wMax: 0.1, wInit: 0.01, etaS: 0.205,
  boost: 0.05, tauBoost: 5000 });
export const plasticityBoost = age => 1 + DOWNWARD.boost * Math.exp(-age / DOWNWARD.tauBoost);
const key = (A, k, B) => JSON.stringify([A, k, B]);

export function createDownward(ids) {
  new TimeUnroll(ids);
  return { weights: [], nextGeneration: 1 };
}

export function newConnection(A, k, B, t) {
  return { A, B, k, ruleKey: key(A, k, B), W: DOWNWARD.wInit, createdAt: t,
    deltas: { STDP: 0, N: DOWNWARD.wInit, miss: 0, clamp: 0 } };
}

/** Store-local identity survives snapshots and distinguishes same-time rebirths. */
export function registerConnection(downward, w) {
  downward.nextGeneration ??= 1;
  if (!Number.isSafeInteger(downward.nextGeneration) || downward.nextGeneration < 1) {
    throw new Error('Invalid connection generation counter');
  }
  if (w.generation === undefined) w.generation = downward.nextGeneration++;
  if (!Number.isSafeInteger(w.generation) || w.generation < 1) throw new Error('Invalid connection generation');
  downward.nextGeneration = Math.max(downward.nextGeneration, w.generation + 1);
  return w;
}

/** One pre-gated pairing at this synapse, never the pairing that created it. */
export function strengthenDownward(w, a, t) {
  if (t <= w.createdAt || a <= 0.01) return;
  const after = Math.min(DOWNWARD.wMax, w.W + DOWNWARD.wMax * DOWNWARD.etaS *
    plasticityBoost(t - w.createdAt) * a * (1 - w.W / DOWNWARD.wMax));
  w.deltas.STDP += after - w.W;
  w.W = after;
}

