/** Pilot-only lifecycle records: never read by the learner. */
import { DOWNWARD } from '../src/downward.mjs';
import { distribution } from './m11a-measure.mjs';
import { effectiveNovelty } from '../src/errors.mjs';
export const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export function regression(xs, step = 1) {
  const n = xs.length, xbar = (n - 1) * step / 2, ybar = mean(xs);
  const sxx = xs.reduce((s, _, i) => s + (i * step - xbar) ** 2, 0);
  const slope = xs.reduce((s, y, i) => s + (i * step - xbar) * (y - ybar), 0) / sxx;
  const se = Math.sqrt(xs.reduce((s, y, i) => s + (y - ybar - slope * (i * step - xbar)) ** 2, 0) / (n - 2) / sxx);
  return { initial: xs[0], final: xs.at(-1), delta: xs.at(-1) - xs[0], slope, se,
    nondecreasing: xs.every((x, i) => !i || x >= xs[i - 1]),
    nonincreasing: xs.every((x, i) => !i || x <= xs[i - 1]) };
}
export function lifetimes(p, causalKeys) {
  const ids = p.mapping.map(a => a.id), causal = new Set(causalKeys), episodes = [], active = new Map(), history = [];
  // A fixed measurement grid includes absent connections as zeros; never enters learning.
  const keys = ids.flatMap(A => ids.filter(B => B !== A).flatMap(B =>
    Array.from({ length: 8 }, (_, i) => JSON.stringify([A, i + 1, B]))));
  const trueWindows = [], connectionCounts = [];
  let previous = new Map();
  const liveCounts = () => ({ layer: '2->1', total: p.downward.weights.length,
    causal: p.downward.weights.filter(w => causal.has(w.ruleKey)).length,
    noncausal: p.downward.weights.filter(w => !causal.has(w.ruleKey)).length });
  let births = 0, deaths = 0;
  const sample = (trial, phase) => {
    const live = new Map(p.downward.weights.map(w => [w.ruleKey, w.W]));
    const u = keys.map(k => (live.get(k) ?? 0) / DOWNWARD.wMax), chance = u.filter((_, i) => !causal.has(keys[i]));
    history.push({ trial, phase, t: p.t, u, chance: { ...distribution(chance), live: chance.filter(x => x > 0).length,
      total: chance.length }, live: liveCounts(), creations: births, deaths });
    births = 0; deaths = 0;
  };
  sample(0, 'initial');
  return {
    sample,
    observe(trial, phase, t) {
      const live = new Map(p.downward.weights.map(w => [w.ruleKey, w]));
      for (const [key, old] of previous) if (!live.has(key) || live.get(key).createdAt !== old.createdAt) {
        active.get(key).death = { trial, t }; active.delete(key); deaths++;
      }
      for (const [key, w] of live) {
        const old = previous.get(key);
        if (!old || old.createdAt !== w.createdAt) {
          const e = { ruleKey: key, causal: causal.has(key), phase, trial, t, death: null };
          episodes.push(e); active.set(key, e); births++;
        }
      }
      for (const key of causal) if ((previous.get(key)?.W ?? 0) !== (live.get(key)?.W ?? 0)) {
        const w = live.get(key);
        trueWindows.push({ trial, phase, t, ruleKey: key, u: (w?.W ?? 0) / DOWNWARD.wMax,
          createdAt: w?.createdAt ?? null, deltas: w ? { ...w.deltas } : null });
      }
      connectionCounts.push({ trial, phase, t, ...liveCounts() });
      previous = new Map([...live].map(([key, w]) => [key, { W: w.W, createdAt: w.createdAt }]));
    },
    finish() {
      const last = history.at(-1), survival = [true, false].map(c => {
        const rows = episodes.filter(e => e.causal === c);
        const dead = rows.filter(e => e.death);
        return { causal: c, created: rows.length, fractionCreated: rows.length / episodes.length,
          alive: rows.filter(e => !e.death).length,
          deadLifetimeTrials: dead.length ? distribution(dead.map(e => e.death.trial - e.trial)) : null,
          deadLifetimeSeconds: dead.length ? distribution(dead.map(e => (e.death.t - e.t) / 1000)) : null,
          rightCensored: rows.filter(e => !e.death).map(e => ({ ruleKey: e.ruleKey, seconds: (p.t - e.t) / 1000,
            trials: last.trial - e.trial })),
          after: [1, 5, 20].map(h => {
            const eligible = rows.filter(e => e.trial + h <= last.trial);
            const alive = eligible.filter(e => !e.death || e.death.trial > e.trial + h).length;
            return { trials: h, eligible: eligible.length, alive, fraction: eligible.length ? alive / eligible.length : null };
          }) };
      });
      return { history, episodes, survival, trueWindows, connectionCounts, keys,
        trueRules: causalKeys.map(ruleKey => ({ ruleKey,
          creation: episodes.find(e => e.ruleKey === ruleKey),
          finalU: (p.downward.weights.find(w => w.ruleKey === ruleKey)?.W ?? 0) / DOWNWARD.wMax })),
        final: structuredClone(p.downward) };
    },
  };
}

/** Observe N births without a target onset; never gates or changes learning. */
export function restCreations(p) {
  let previous = new Map(p.downward.weights.map(w => [w.ruleKey, w.createdAt])), quietMs = 0;
  const episodes = [], active = new Map();
  return {
    observe(t, counts) {
      const live = new Map(p.downward.weights.map(w => [w.ruleKey, w.createdAt]));
      const quiet = counts.every(c => c.reality === 0);
      if (quiet) quietMs += 100;
      for (const [key, e] of active) if (live.get(key) !== e.createdAt) {
        e.death = t; active.delete(key);
      }
      for (const w of p.downward.weights) if (previous.get(w.ruleKey) !== w.createdAt) {
        const error = counts.find(c => c.id === w.B);
        if (error.reality !== 0) continue;
        const e = { ruleKey: w.ruleKey, createdAt: w.createdAt, t, quiet, error,
          Neff: effectiveNovelty(error.N, 100), death: null };
        episodes.push(e); active.set(w.ruleKey, e);
      }
      previous = live;
    },
    finish() {
      const quiet = episodes.filter(e => e.quiet);
      return { quietSeconds: quietMs / 1000, quietCreations: quiet.length,
        per300Seconds: quietMs ? quiet.length * 300000 / quietMs : null,
        quietPruned: quiet.filter(e => e.death !== null).length,
        noTargetOnsetCreations: episodes.length, episodes };
    },
  };
}
