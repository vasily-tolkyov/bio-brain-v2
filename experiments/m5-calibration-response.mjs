/** Diagnostic only: frozen inhibitory-weight response, never chooses parameters. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ERRORS, SpikingErrors } from '../src/errors.mjs';
import { mean, variance, restReference } from './m5-statistics.mjs';

const started = performance.now(), rows = [], reference = restReference(8000);
for (const weight of [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3]) {
  // Identical afferent RNG at each fixed weight; continuous state between trials.
  const e = new SpikingErrors(['x'], 7);
  e.rows[0].Minh.scale.fill(weight);
  const trials = [];
  for (let n = 0; n < 30; n++) {
    const start = n * 8000, offset = [-500, 0, 500][n % 3];
    const counts = [];
    for (let elapsed = 0; elapsed < 8000; elapsed += 100) {
      const [c] = e.step(start + elapsed, [Number(elapsed === 3200 + offset)],
        elapsed === 0 ? [{ B: 'x', tArrive: start + 3200, strength: 1 }] : []);
      counts.push(c.M);
    }
    trials.push({ offset, M: counts.reduce((a, b) => a + b, 0), windows: counts });
  }
  const summaries = [-500, 0, 500].map(offset => {
    const selected = trials.filter(t => t.offset === offset), values = selected.map(t => t.M);
    return { offset, M: mean(values), sem: Math.sqrt(variance(values) / (values.length - 1)),
      windows: Array.from({ length: 80 }, (_, i) => mean(selected.map(t => t.windows[i]))) };
  });
  rows.push({ weight, summaries, trials });
  console.log(JSON.stringify({ weight, summaries: summaries.map(({ windows, ...s }) => s) }));
}
mkdirSync('out/m11c-gate2', { recursive: true });
const result = { seed: 7, targetHz: ERRORS.targetHz, reference, ceiling: 3 * reference.deviationSD,
  rows, wallSeconds: (performance.now() - started) / 1000 };
writeFileSync('out/m11c-gate2/calibration-response.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(`Response diagnostic wall ${result.wallSeconds.toFixed(2)} s`);
