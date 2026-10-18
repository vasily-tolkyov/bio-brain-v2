/** Gate5 diagnostic beyond the fast unit budget; no layer learning or resets. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ERRORS, SpikingErrors } from '../src/errors.mjs';
import { WINDOW_MS } from '../src/readout.mjs';
import { calibrationRate, calibrationConverged, MATCHED_OFFSETS, PROTOCOL } from './m5-probe.mjs';
import { predictionCounts, calibrationSummary, missSummary } from './m5-statistics.mjs';

const started = performance.now(), e = new SpikingErrors(['arbitrary-id'], 7), history = [];
const weights = () => e.rows.map(r => ({ id: r.id, N: [...r.Ninh.scale], M: [...r.Minh.scale] }));
function trial(offset, learn = false) {
  const start = e.t === null ? 0 : e.t + WINDOW_MS, windows = [];
  for (let t = 0; t < 3000; t += WINDOW_MS) windows.push(e.step(start + t,
    [t === 600 + offset ? 1 : 0], t === 0 ? [{ B: e.ids[0], tArrive: start + 600, strength: 1 }] : [], { learn }));
  return predictionCounts(windows, [{ B: e.ids[0], tArrive: start + 600 }])[0];
}
for (let i = 0; i < PROTOCOL.maxCalibrationTrials && !calibrationConverged(history); i++) {
  const eta = calibrationRate(e, i + 1), offset = MATCHED_OFFSETS[i % MATCHED_OFFSETS.length];
  const c = trial(offset, true);
  history.push({ trial: i + 1, eta, delay: 600 + offset, qualified: c.nearRest, counts: [c], weights: weights() });
}
const diagnostic = calibrationSummary(history), before = weights(), hits = [];
for (let offset = -ERRORS.toleranceMs; offset <= ERRORS.toleranceMs; offset += WINDOW_MS) {
  const trials = Array.from({ length: PROTOCOL.trials }, () => trial(offset));
  hits.push({ offset, ...missSummary(trials.map(c => c.M)), counts: trials });
}
assert.deepEqual(weights(), before);
const result = { seed: 7, protocol: PROTOCOL, errors: ERRORS, converged: calibrationConverged(history),
  history, diagnostic, hits, wallSeconds: (performance.now() - started) / 1000 };
mkdirSync('out/m11c-gate5', { recursive: true });
writeFileSync('out/m11c-gate5/synthetic.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, history: undefined, hits: hits.map(({ counts, deviations, effective, ...h }) => h) }, null, 2));
