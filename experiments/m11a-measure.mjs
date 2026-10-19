/** Measurement only: every rule, every trial; no statistic enters learning. */
import { DOWNWARD } from '../src/downward.mjs';
export function distribution(xs) {
  const values = [...xs].sort((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / values.length,
    p95: values[Math.ceil(values.length * 0.95) - 1], max: values.at(-1) };
}
export function slope(xs) {
  const mid = (xs.length - 1) / 2;
  return xs.reduce((n, x, i) => n + (i - mid) * x, 0) / xs.reduce((n, _, i) => n + (i - mid) ** 2, 0);
}
export function measurements(p) {
  const down = p.downward, id = name => p.mapping.find(a => a.feature === name).id;
  const key = (A, k, B) => JSON.stringify([A, k, B]);
  const valid = new Set([key('action:press', 6, id('light')), key(id('light'), 4, id('bell')),
    key('action:press', 6, id('bell'))]);
  const ids = p.mapping.map(a => a.id);
  const slots = ids.flatMap(A => ids.filter(B => B !== A).flatMap(B =>
    Array.from({ length: 8 }, (_, i) => ({ A, B, k: i + 1, ruleKey: key(A, i + 1, B) }))));
  const snapshot = () => { const live = new Map(p.downward.weights.map(w => [w.ruleKey, w.W]));
    return slots.map(w => live.get(w.ruleKey) ?? 0); };
  const initial = structuredClone(down), history = [snapshot()];
  const peaks = slots.map((_, i) => ({ W: history[0][i], trial: 0, t: p.t, half: null, tenth: null }));
  let previous = new Map(down.weights.map(w => [w.ruleKey, { w, deltas: { ...w.deltas } }]));
  const deltas = slots.map(() => ({ STDP: 0, N: 0, miss: 0, clamp: 0 }));
  return {
    observe(trial, t) {
      const live = new Map(p.downward.weights.map(w => [w.ruleKey, w]));
      slots.forEach((slot, i) => {
        const current = live.get(slot.ruleKey), old = previous.get(slot.ruleKey);
        // A removed object still exposes its final decrement in this observation only.
        for (const k of Object.keys(deltas[i])) {
          if (old) deltas[i][k] += old.w.deltas[k] - old.deltas[k];
          if (current && current !== old?.w) deltas[i][k] += current.deltas[k];
        }
        const w = { W: current?.W ?? 0 }, peak = peaks[i];
        if (w.W > peak.W) Object.assign(peak, { W: w.W, trial, t, half: null, tenth: null });
        if (peak.W > 0) for (const [name, fraction] of [['half', 0.5], ['tenth', 0.1]]) {
          if (w.W <= fraction * peak.W) peak[name] ??= { trial, sincePeak: trial - peak.trial, t, elapsedMs: t - peak.t };
        }
      });
      previous = new Map([...live].map(([k, w]) => [k, { w, deltas: { ...w.deltas } }]));
    },
    sample() { history.push(snapshot()); },
    finish() {
      const live = new Map(p.downward.weights.map(w => [w.ruleKey, w]));
      const rows = slots.map((slot, i) => {
        const w = { ...slot, ...live.get(slot.ruleKey), W: live.get(slot.ruleKey)?.W ?? 0 };
        const trajectory = history.map(xs => xs[i]), peak = peaks[i];
        return { ...w, causal: valid.has(w.ruleKey), initial: trajectory[0], peak: peak.W, atPeak: peak.trial, peakTime: peak.t,
          half: peak.half, tenth: peak.tenth, trajectory,
          last20Mean: trajectory.slice(-20).reduce((a, b) => a + b, 0) / 20 / DOWNWARD.wMax,
          ratio: w.W / DOWNWARD.wMax, last20Slope: slope(trajectory.slice(-20)) / DOWNWARD.wMax,
          continuationDeltas: { ...deltas[i] } };
      });
      const noncausal = rows.filter(w => !w.causal), trueRules = rows.filter(w => w.causal);
      const distributionHistory = history.map((xs, trial) => ({ trial,
        ...distribution(noncausal.map(w => w.trajectory[trial] / DOWNWARD.wMax)) }));
      const strongestFalse = noncausal.reduce((a, b) => a.peak >= b.peak ? a : b);
      const trend = Object.fromEntries(['mean', 'p95', 'max'].map(k => [k, slope(distributionHistory.map(d => d[k]))]));
      const checks = { falseEnd: distributionHistory.at(-1).max <= 0.1,
        falseTrend: Object.values(trend).every(x => x < 0) };
      return { initial, final: structuredClone(p.downward), rows, trueRules, strongestFalse, distributionHistory, trend,
        checks, pass: Object.values(checks).every(Boolean) };
    },
  };
}
