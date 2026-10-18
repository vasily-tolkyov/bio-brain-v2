/** 300 s uninterrupted learned-network rest; statistics never feed learning. */
import { restRecorder, summarizeRest } from './m5-statistics.mjs';
import { longRestAudit } from './m5-rest-audit.mjs';
import { regression, mean, restCreations } from './m11e-measure.mjs';
import { SurpriseGate } from '../src/three-factor.mjs';
import { learnWindow } from '../src/learning.mjs';
import { discardHistory } from '../src/io.mjs';
export function learnedRest(p, seed) {
  const start = p.t, duration = 300000, recorder = restRecorder(p.errors, duration);
  const rho = () => p.layer2.replicas.flatMap(r => [...r.EE.stdp.rho]);
  const ids = p.mapping.map(a => a.id);
  const keys = ids.flatMap(A => ids.filter(B => B !== A).flatMap(B =>
    Array.from({ length: 8 }, (_, i) => JSON.stringify([A, i + 1, B]))));
  const W = () => { const live = new Map(p.downward.weights.map(w => [w.ruleKey, w.W]));
    return keys.map(k => live.get(k) ?? 0); };
  const snapshots = [{ seconds: 0, rho: rho(), W: W() }], windows = [];
  const creations = restCreations(p);
  let opened = 0;
  const gate = new SurpriseGate();
  while (p.t < start + duration) {
    const at = p.layer1.t;
    p.layer1.run(100);
    const { counts } = learnWindow(p, p.layer1.readout(at));
    creations.observe(p.t, counts);
    discardHistory(p.layer1); discardHistory(p.layer2); p.t += 100;
    recorder.record(); opened += Number(gate.step(counts)); windows.push(counts);
    if ((p.t - start) % 1000 === 0) snapshots.push({ seconds: (p.t - start) / 1000, rho: rho(), W: W() });
  }
  const measure = field => {
    const edges = snapshots[0][field].map((_, i) => ({ index: i, ...regression(snapshots.map(s => s[field][i])) }));
    return { mean: regression(snapshots.map(s => mean(s[field]))),
      growingBeyondNoise: edges.filter(e => e.delta > 0 && e.nondecreasing && e.slope > 3 * e.se), edges };
  };
  const populations = summarizeRest([{ kind: 'rest', duration, populations: recorder.finish() }]);
  const result = { seconds: duration / 1000, rho: measure('rho'), W: measure('W'), populations,
    gateOpenFraction: opened / (duration / 100), snapshots, windows, creations: creations.finish() };
  result.pass = !result.rho.growingBeyondNoise.length && !result.W.growingBeyondNoise.length &&
    populations.every(p => p.pass) && result.gateOpenFraction < 0.01;
  // Preserve the existing independent comparator/consumer gate5 audit and bounds.
  result.comparatorAudit = longRestAudit(p.errors.ids, seed);
  result.pass &&= result.comparatorAudit.pass;
  return result;
}
