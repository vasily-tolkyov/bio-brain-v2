/** Verify final calibration bookkeeping against the seed-7 pilot's saved trials. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makePipeline, teachFeatures } from './m3-pipeline.mjs';
import { loadLayer } from './m8-cache.mjs';
import { loadLearning } from '../src/learning.mjs';
import { calibrationTrial } from './m6-trial.mjs';
const dir = 'out/m11e-pilot-b/', read = name => JSON.parse(readFileSync(`${dir}${name}.json`));
const expected = read('calibration'), p = makePipeline(teachFeatures(7), 7), stages = [];
for (const [name, state] of [['A', 'causal-state'], ['B', 'end-A-state'], ['E', 'end-A-state']]) {
  const s = read(state);
  p.t = s.t; p.baseline = s.baseline;
  assert.deepEqual(p.mapping, s.mapping);
  loadLayer(p.layer1, s.layer1); loadLayer(p.layer2, s.layer2); loadLearning(p, s.learning);
  const run = calibrationTrial(p, '[0,6,6]');
  for (const [i, old] of expected[name].trials.entries()) {
    assert.deepEqual(run(old.paired, old.delay), old, `${name}${i + 1}`);
  }
  stages.push({ name, trials: expected[name].trials.length, exact: true });
  console.log(stages.at(-1));
}
const source = 'experiments/m6-trial.mjs';
writeFileSync(`${dir}calibration-replay.json`, JSON.stringify({ seed: 7, stages, source,
  sha256: createHash('sha256').update(readFileSync(source)).digest('hex') }));
