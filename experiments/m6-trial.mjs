/** All-channel online M6/M7/M7b trial, using the same learning window as teachers. */
import { stormEnv } from '../src/world.mjs';
import { presentWindow, discardHistory } from '../src/io.mjs';
import { learnWindow } from '../src/learning.mjs';
import { WINDOW_MS } from '../src/readout.mjs';
import { effectiveNovelty, NOVELTY } from '../src/novelty.mjs';

export const SLOT_MS = 25000; // Longer than the 18.1 s past horizon.
export function calibrationTrial(p, ruleKey) {
  const [A, k, B] = JSON.parse(ruleKey);
  const weight = () => p.downward.weights.find(w => w.ruleKey === ruleKey);
  return (paired, delay, observe = () => {}) => {
    const start = p.t, events = [{ g: 'lightning', start, duration: 100 }];
    if (paired) events.push({ g: 'thunder', start: start + delay, duration: 2000 });
    const env = stormEnv(events, start), before = weight()?.W ?? 0;
    const deltas = { STDP: 0, N: 0, miss: 0, clamp: 0 }, changes = [];
    const r = { start, paired, delay, before, onsets: 0, predictions: 0, thunderN: 0, unmatchedDeadlines: 0 };
    while (p.t < start + SLOT_MS) {
      const neuralStart = p.layer1.t;
      presentWindow(p.layer1, env, WINDOW_MS);
      const old = weight(), initial = { ...old?.deltas }, oldW = old?.W ?? 0;
      const lit = p.layer1.readout(neuralStart), { counts } = learnWindow(p, lit);
      observe(p.t, counts);
      const w = weight();
      for (const key of Object.keys(deltas)) {
        if (old) deltas[key] += old.deltas[key] - (initial[key] ?? 0);
        if (w && w !== old) deltas[key] += w.deltas[key];
      }
      if (w !== old || (w?.W ?? 0) !== oldW) changes.push({ t: p.t, before: oldW, W: w?.W ?? 0,
        createdAt: w?.createdAt ?? null, causeActivity: p.unroll.lines(p.t)[p.unroll.indices.get(A) * 9 + k],
        error: counts.find(c => c.id === B), Neff: effectiveNovelty(counts.find(c => c.id === B).N, WINDOW_MS),
        onsets: p.unroll.entries.filter(e => e.tOnset === p.t) });
      r.onsets += p.unroll.entries.filter(e => e.tOnset === p.t && e.id === A).length;
      r.predictions += p.future.created.filter(e => e.ruleKey === ruleKey).length;
      const c = counts.find(c => c.id === B);
      r.thunderN += c.N;
      r.unmatchedDeadlines += p.errors.pending.filter(e => e.ruleKey === ruleKey &&
        e.tArrive + NOVELTY.toleranceMs === p.t && e.matched === 0).length;
      discardHistory(p.layer1); discardHistory(p.layer2); p.t += WINDOW_MS;
    }
    return { ...r, W: weight()?.W ?? 0, deltas, changes };
  };
}
