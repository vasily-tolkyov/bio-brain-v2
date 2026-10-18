/** Pre-fix seed-7 calibration: constant eta, signed counts, all iSTDP weights. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ERRORS } from '../src/errors.mjs';
import { cachedCausal } from './m5-cache.mjs';
import { errorExperiment, PROTOCOL } from './m5-probe.mjs';
import { mean } from './m5-statistics.mjs';

const started = performance.now(), seed = 7;
const { pipeline, baseline } = cachedCausal(seed);
const e = errorExperiment(pipeline, baseline, seed);
const delay = e.downward.weights.filter(w => w.B === e.thunder).sort((a, b) => b.W - a.W).slice(0, 1)
  .map(w => 100 * 2 ** (w.k - 1));
if (delay.length !== 1) throw new Error('Expected one learned rule');
const rest = ERRORS.targetHz * ERRORS.cells * PROTOCOL.slotMs / 1000;
const ceiling = 3 * Math.sqrt(rest), history = [];
let quiet = 0;
for (let i = 0; i < 150; i++) {
  const result = e.trial('calibration', { delay: delay[0] + [-500, 0, 500][i % 3], learn: true });
  const predicted = new Set(result.created.map(p => p.B));
  const matched = result.created.every(p => result.onsets.some(o => o.id === p.B &&
    Math.abs(o.tOnset - p.tArrive) <= ERRORS.toleranceMs));
  const counts = result.counts.filter(c => predicted.has(c.id))
    .map(c => ({ id: c.id, N: c.Nraw - rest, M: c.Mraw - rest }));
  quiet = matched && counts.length && counts.every(c => Math.abs(c.N) <= ceiling && Math.abs(c.M) <= ceiling)
    ? quiet + 1 : 0;
  const weights = e.errors.rows.filter(r => predicted.has(r.id)).map(r => ({ id: r.id,
    N: [...r.Ninh.scale], M: [...r.Minh.scale] }));
  history.push({ trial: i + 1, matched, counts, quiet, weights });
  console.log(JSON.stringify({ trial: i + 1, matched, counts, quiet,
    weights: weights.map(w => ({ id: w.id, N: mean(w.N), M: mean(w.M) })) }));
}
mkdirSync('out/m11c-gate2', { recursive: true });
const result = { seed, eta: ERRORS.eta, ceiling, history, wallSeconds: (performance.now() - started) / 1000 };
writeFileSync('out/m11c-gate2/diagnosis.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(`Diagnosis wall ${result.wallSeconds.toFixed(2)} s`);
