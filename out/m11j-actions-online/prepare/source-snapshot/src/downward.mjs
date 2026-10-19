/** Layer 2 -> 1 plastic connections. All bookkeeping is between P7 windows. */
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

/** M4 directed co-occurrence readout, without selection or normalization.
 * Mean signed rho gain of wired A@k -> B@0 edges, across all replicas.
 * This is a measurement, never a separate executable rule library.
 */
export function readDownward(layer, baseline, ids) {
  new TimeUnroll(ids);
  if (layer.n !== ids.length * 9 || baseline.length !== layer.replicas.length) {
    throw new Error('Downward row/baseline mismatch');
  }
  const pooled = new Map();
  for (const [r, { EE, E }] of layer.replicas.entries()) {
    if (baseline[r].length !== EE.pre.length || !baseline[r].every(x => Number.isFinite(x) && x >= 0 && x <= 1)) {
      throw new Error('Invalid learning baseline');
    }
    for (let e = 0; e < EE.pre.length; e++) {
      const from = Math.floor((EE.pre[e] - E) / layer.cellsPerLine);
      const to = Math.floor((EE.post[e] - E) / layer.cellsPerLine), k = from % 9;
      const A = ids[Math.floor(from / 9)], B = ids[Math.floor(to / 9)];
      if (!k || to % 9 || A === B) continue;
      const ruleKey = key(A, k, B);
      if (!pooled.has(ruleKey)) pooled.set(ruleKey, { A, B, k, ruleKey, W: 0, edges: 0 });
      const w = pooled.get(ruleKey);
      w.W += EE.stdp.rho[e] - baseline[r][e]; w.edges++;
    }
  }
  return { weights: [...pooled.values()].map(w => ({ ...w, W: w.W / w.edges })) };
}
