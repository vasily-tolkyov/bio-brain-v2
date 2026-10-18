/** Extend gate5 weak-miss data using its calibrated, frozen inhibitory weights. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SpikingErrors, restCount } from '../src/errors.mjs';
import { missSummary } from './m5-statistics.mjs';
const source = 'out/m11e-roles/7/gate5/results.json', bytes = readFileSync(source);
const gate5 = JSON.parse(bytes).runs[0], id = gate5.mapping.find(a => a.feature === 'thunder').id;
const weights = gate5.calibration.history.at(-1).weights.find(r => r.id === id);
export function calibratedComparator(ids = ['a', 'b']) {
  const e = new SpikingErrors(ids, 7), row = e.rows.at(-1);
  row.Ninh.scale.set(weights.N); row.Minh.scale.set(weights.M);
  return e;
}
if (process.argv[1]?.endsWith('m11f-floor.mjs')) {
  const e = calibratedComparator(['b']), rows = [];
  for (const strength of [0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.1]) {
    const deviations = [];
    for (let n = 0; n < 200; n++) {
      const start = e.t === null ? 0 : e.t + 100;
      for (let dt = 0; dt < 3000; dt += 100) {
        const [c] = e.step(start + dt, [0], dt === 0 ? [{ B: 'b', tArrive: start + 600, strength }] : []);
        if (dt === 1100) deviations.push(c.M);
      }
    }
    rows.push({ strength, ...missSummary(deviations) });
    console.log(JSON.stringify({ strength, M: rows.at(-1).M, detected: rows.at(-1).positiveFraction }));
  }
  const deadband = 3 * Math.sqrt(restCount(100));
  const hi = rows.findIndex(r => r.M >= deadband), a = rows[hi - 1], b = rows[hi];
  const floor = a.strength + (deadband - a.M) * (b.strength - a.strength) / (b.M - a.M);
  writeFileSync('out/m11f-pilot/floor.json', JSON.stringify({ source, sha256: createHash('sha256').update(bytes).digest('hex'),
    method: 'First mean-M crossing of analytic 3 sigma rest, linearly interpolated between adjacent sampled strengths; 200 isolated misses/strength.',
    deadband, bracket: [a.strength, b.strength], floor, rows }, null, 2));
  console.log({ floor, deadband });
}
