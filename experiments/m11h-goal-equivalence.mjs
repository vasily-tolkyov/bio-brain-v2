/** Paired old/new goal-comparator replay only; not action-world acceptance. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GoalErrors } from '../src/errors.mjs';
import { SpikingErrors as HistoricalErrors } from '../out/m11g-fresh/seed-7/action-natural/source-snapshot/src/errors.mjs';
const dir = 'out/m11h/goal-equivalence';
assert.ok(!existsSync(dir), 'Refusing to overwrite evidence');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const oldPath = 'out/m11g-fresh/seed-7/action-natural/source-snapshot/src/errors.mjs';
assert.equal(sha(readFileSync(oldPath)), '4618cdec64fde13d2df6dd7eef60e87a78f29301155bdfe412c61c3551f421cd');
mkdirSync(dir, { recursive: true });
const sources = ['src/errors.mjs', oldPath, 'src/network.mjs', 'src/core/state.mjs', 'src/core/rng.mjs',
  'src/neuron/lif.mjs', 'src/synapse.mjs', 'src/stdp.mjs', 'src/readout.mjs', 'src/unroll.mjs',
  'experiments/m11h-goal-equivalence.mjs'];
const manifest = { started: new Date().toISOString(), source: Object.fromEntries(sources.map(p =>
  [p, { sha256: sha(readFileSync(p)), text: readFileSync(p, 'utf8') }])), seeds: [7, 19, 31], windows: 300,
  scope: 'Identical goal/reality/learning inputs, original and current goal comparator. No prediction-M learning runs or world training.' };
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
const results = [], start = performance.now();
for (const seed of manifest.seeds) {
  const a = new HistoricalErrors(['x', 'y'], seed), b = new GoalErrors(['x', 'y'], seed), samples = [];
  assert.deepEqual(a.net.saveState(), b.net.saveState());
  for (let window = 0; window < manifest.windows; window++) {
    const t = window * 100, goals = [0, .001, .1, .5, 1];
    const goal = [goals[Math.floor(window / 5) % goals.length], goals[Math.floor(window / 7) % goals.length]];
    const reality = [window % 13 === 0 ? 1 : 0, window % 17 === 0 ? .5 : 0];
    const learn = window < 150;
    const before = a.stepGoals(t, reality, goal, { learn }), after = b.stepGoals(t, reality, goal, { learn });
    assert.deepEqual(after, before); samples.push({ t, goal, reality, learn, counts: after });
    if (window % 25 === 0 || window === manifest.windows - 1) assert.deepEqual(a.net.saveState(), b.net.saveState());
  }
  results.push({ seed, windows: samples.length, samples, finalNetworkSHA256: sha(JSON.stringify(b.net.saveState())) });
}
const changed = Object.entries(manifest.source).filter(([p, v]) => sha(readFileSync(p)) !== v.sha256).map(([p]) => p);
assert.deepEqual(changed, []);
const result = { finished: new Date().toISOString(), seconds: (performance.now() - start) / 1000,
  countWindows: 900, neuralStateCheckpoints: 42, exactCountsEqual: true, exactNeuralStatesEqual: true, changed, results };
writeFileSync(`${dir}/results.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, results: undefined }));
