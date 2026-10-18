/** Isolated one-candidate afferent experiment: real comparator and ThreeFactor.
 * The fixture supplies one A@4 past line at the on-time target onset. It has no
 * other candidate synapses. N alone recreates deleted generations, at w_init.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DOWNWARD, newConnection } from '../src/downward.mjs';
import { THREE_FACTOR, ThreeFactor } from '../src/three-factor.mjs';
import { effectiveMiss } from '../src/errors.mjs';
import { makeRng } from '../src/core/rng.mjs';
import { calibratedComparator } from './m11f-floor.mjs';
import { equilibrium } from './m11e-d-measure.mjs';
import { mean, variance } from './m5-statistics.mjs';

const events = 400, interval = 4000, delay = 800;
export function measureRate(p) {
  const rng = makeRng(7), errors = calibratedComparator(['b']), samples = [], changes = [], outcomes = [];
  let active = false, births = 1, hits = 0, predictedMisses = 0, detectedMisses = 0;
  const future = { t: 0, downward: { weights: [newConnection('a', 4, 'b', 0)] },
    past: { ids: ['a', 'b'], indices: new Map([['a', 0], ['b', 1]]),
      lines() { const lines = new Float64Array(18); lines[4] = Number(active); return lines; } } };
  const learner = new ThreeFactor(future);
  for (let event = 0; event < events; event++) {
    const hit = rng.uniform() < p, start = event * interval;
    hits += Number(hit); outcomes.push(hit);
    for (let dt = 0; dt < interval; dt += 100) {
      const t = start + dt, w = future.downward.weights[0], before = w?.W ?? 0;
      const created = dt === 0 && w ? [{ A: 'a', B: 'b', k: 4, ruleKey: w.ruleKey,
        createdAt: w.createdAt, activation: 1, strength: w.W / DOWNWARD.wMax,
        tOnset: t, tArrive: t + delay }] : [];
      const counts = errors.step(t, [Number(hit && dt === delay)], created);
      future.t = t; active = dt === delay;
      learner.step(t, counts, errors.pending);
      if (!w && future.downward.weights.length) births++;
      const after = future.downward.weights[0];
      if ((after?.W ?? 0) !== before || after !== w) changes.push({ event: event + 1, t, before,
        W: after?.W ?? 0, createdAt: after?.createdAt ?? null, counts: counts[0] });
      if (!hit && dt === delay + 500 && errors.pending.length) {
        predictedMisses++; detectedMisses += Number(effectiveMiss(counts[0].M) > 0);
      }
    }
    samples.push(future.downward.weights[0]?.W / DOWNWARD.wMax || 0);
  }
  const tail = samples.slice(-100);
  const row = { p, empiricalP: hits / events, events, mean: mean(tail), sd: Math.sqrt(variance(tail)),
    analytic: equilibrium(p, DOWNWARD.etaS, THREE_FACTOR.etaMissByLayer[2]),
    births, predictedMisses, detectedMisses, samples, changes,
    tailEmpiricalP: mean(outcomes.slice(-100).map(Number)) };
  return row;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const rows = [0, 0.25, 0.5, 0.67, 0.8, 0.9, 1].map(p => {
  const row = measureRate(p);
  console.log(JSON.stringify({ ...row, samples: undefined, changes: undefined }));
  return row;
});
const jumps = rows.slice(1).map((r, i) => r.mean - rows[i].mean);
const result = { seed: 7, DOWNWARD, THREE_FACTOR, events, interval, delay, rows, jumps,
  equation: 'p*S*(1-u) = (1-p)*M*(1-0.8*u); settled boost=1; mean and population SD over last100.',
  pass: rows[0].mean === 0 && rows.at(-1).mean >= 0.9 && jumps.every(x => x >= 0 && x <= 0.4) };
mkdirSync('out/m11f-pilot', { recursive: true });
writeFileSync(`out/m11f-pilot/curve-${DOWNWARD.etaS}-${THREE_FACTOR.etaMissByLayer[2]}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ pass: result.pass, jumps }));
}
