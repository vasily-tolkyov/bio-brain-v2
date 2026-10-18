/** R1/R2 observations only. Nothing in this module feeds the learner. */
import { lifetimes as pilotLifetimes, mean } from './m11e-measure.mjs';
import { DOWNWARD, plasticityBoost } from '../src/downward.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';
import { ERRORS } from '../src/errors.mjs';
export { regression, mean, restCreations } from './m11e-measure.mjs';

export function wilson(hits, count) {
  if (!count) return [0, 1];
  const z = 1.959963984540054, p = hits / count, d = 1 + z * z / count;
  const centre = (p + z * z / (2 * count)) / d;
  const radius = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / d;
  return [Math.max(0, centre - radius), Math.min(1, centre + radius)];
}

export function equilibrium(p, S, M) {
  const gain = p * S, loss = (1 - p) * M;
  // At nonpositive drift at zero, clipping makes zero the stable equilibrium.
  // The algebraic root outside [0,1] is not a stable positive equilibrium.
  return gain <= loss ? 0 : (gain - loss) / (gain - loss * (1 - THREE_FACTOR.gFloor));
}

export function killCount(u, M) {
  if (u > 0 && M === 0) return Infinity;
  let n = 0;
  while (u > 0) { u = Math.max(0, u - M * (1 - (1 - THREE_FACTOR.gFloor) * u)); n++; }
  return n;
}

export function calibrationReport(data) {
  const { onsets, generations, hits, misses } = data.measurements;
  const aHit = mean(hits.map(e => e.a)), aMiss = mean(misses.map(e => e.a));
  const measuredBoost = mean(hits.map(e => e.boost));
  const S = aHit === null ? null : DOWNWARD.etaS * measuredBoost * aHit;
  const M = aMiss === null ? null : THREE_FACTOR.etaMissByLayer[2] * aMiss;
  if (S === null || M === null) return { complete: false, reason: 'Missing hit or miss eligibility samples' };
  const causes = A => onsets.filter(o => o.id === A);
  const generationRows = generations.filter(g => !g.causal).map(g => {
    const A = JSON.parse(g.ruleKey)[0], nKill = killCount(g.peak, M), K = nKill + 2;
    const since = g.lastHit ?? g.birth;
    const postLastHit = causes(A).filter(o => o.tOnset > since && (g.death === null || o.tOnset < g.death)).length;
    const status = g.death !== null ? 'deleted' : postLastHit < K ? 'still dying' : 'violation';
    return { ...g, nKill, K, postLastHit, status };
  });
  const rows = data.final.weights.filter(w => !data.trueRules.some(r => r.ruleKey === w.ruleKey)).map(w => {
    const source = causes(w.A), target = onsets.filter(o => o.id === w.B), delay = 100 * 2 ** (w.k - 1);
    const h = source.filter(o => target.some(t => Math.abs(t.tOnset - o.tOnset - delay) <= ERRORS.toleranceMs)).length;
    const p = source.length ? h / source.length : null, ci = wilson(h, source.length);
    const uStar = p === null ? null : equilibrium(p, S, M), lo = equilibrium(ci[0], S, M), hi = equilibrium(ci[1], S, M);
    const g = generationRows.find(g => g.ruleKey === w.ruleKey && g.birth === w.createdAt);
    const birthOnsets = source.filter(o => o.tOnset > w.createdAt).length;
    const zeroAllowed = hi !== 0 || birthOnsets < g.nKill;
    const u = w.W / DOWNWARD.wMax, band = [lo - 0.1, hi + 0.1];
    return { ruleKey: w.ruleKey, hits: h, count: source.length, p, ci, uStar, band, u,
      zeroAllowed, birthOnsets, nKill: g.nKill, pass: u >= band[0] && u <= band[1] && zeroAllowed, oldCap: u <= 0.1 };
  });
  const counts = Object.fromEntries(['deleted', 'still dying', 'violation'].map(s =>
    [s, generationRows.filter(g => g.status === s).length]));
  return { complete: true, aHit, aMiss, S, M, hitSamples: hits.length, missSamples: misses.length,
    measuredBoost, exactBoostedS: DOWNWARD.etaS * mean(hits.map(e => e.a * e.boost)),
    rows, generations: generationRows, counts, R1: rows.every(r => r.pass), R2: counts.violation === 0 };
}

/** Called after each existing 100 ms advance, never from a neural tick. */
export function lifetimes(p, causalKeys) {
  const pilot = pilotLifetimes(p, causalKeys), onsets = [], generations = [], hits = [], misses = [];
  const active = new Map(), matched = new Set(), causal = new Set(causalKeys);
  let previous = new Map();
  return {
    sample: pilot.sample,
    begin() {
      // Frozen probes restore cloned objects with the same generations.
      previous = new Map(p.downward.weights.map(w => [w.ruleKey, { w, W: w.W, STDP: w.deltas.STDP }]));
    },
    observe(trial, phase, t) {
      onsets.push(...p.unroll.entries.filter(o => o.tOnset === t).map(o => ({ ...o, phase, trial })));
      const live = new Map(p.downward.weights.map(w => [w.ruleKey, w]));
      for (const [key, old] of previous) {
        const g = active.get(key);
        g.peak = Math.max(g.peak, (old.W + old.w.deltas.STDP - old.STDP) / DOWNWARD.wMax);
      }
      for (const e of p.errors.pending) {
        const old = previous.get(e.ruleKey);
        if (!old || old.w.createdAt !== e.createdAt || t < e.tArrive - ERRORS.toleranceMs) continue;
        const entry = Math.max(e.tOnset, e.tArrive - ERRORS.toleranceMs);
        const a = e.activation * Math.exp(-(t - entry) / THREE_FACTOR.tauE);
        const id = JSON.stringify([e.ruleKey, e.createdAt, e.tArrive]);
        if (e.matched > 0 && !matched.has(id)) {
          matched.add(id);
          active.get(e.ruleKey).lastHit = t;
          hits.push({ ruleKey: e.ruleKey, createdAt: e.createdAt, t, a, boost: plasticityBoost(t - e.createdAt) });
        }
        if (t === e.tArrive + ERRORS.toleranceMs && e.matched === 0) {
          misses.push({ ruleKey: e.ruleKey, createdAt: e.createdAt, t, a });
        }
      }
      for (const [key, old] of previous) if (live.get(key) !== old.w) {
        active.get(key).death = t; active.delete(key);
      }
      for (const [key, w] of live) if (previous.get(key)?.w !== w) {
        const g = { ruleKey: key, causal: causal.has(key), birth: w.createdAt, death: null,
          peak: w.W / DOWNWARD.wMax, lastHit: null };
        generations.push(g); active.set(key, g);
      }
      pilot.observe(trial, phase, t);
      previous = new Map([...live].map(([key, w]) => [key, { w, W: w.W, STDP: w.deltas.STDP }]));
    },
    finish() { return { ...pilot.finish(), measurements: { onsets, generations, hits, misses } }; },
  };
}
