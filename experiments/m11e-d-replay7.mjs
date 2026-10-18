/** Missing seed-7 telemetry/checkpoints ONLY. Requires the pending replay authorization. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { makePipeline, teachFeatures, advance } from './m3-pipeline.mjs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';
import { saveLayer, loadLayer } from './m8-cache.mjs';
import { saveLearning } from '../src/learning.mjs';
import { restore, readJSON } from './m11e-d-state.mjs';
import { lifetimes } from './m11e-d-measure.mjs';
import { stormWorld } from '../src/world.mjs';
import { chainEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { teacherSchedule } from './m11a-runtime.mjs';
import { calibrationTrial } from './m6-trial.mjs';
const seed = 7, base = 'out/m11e-pilot-c', dir = 'out/m11e-roles/7';
mkdirSync(dir, { recursive: true });
const read = name => readJSON(`${base}/${name}.json`);
const write = (name, data) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(data));
const snapshot = p => ({ t: p.t, baseline: p.baseline, mapping: p.mapping,
  layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), learning: saveLearning(p) });
const key = (p, A, k, B) => JSON.stringify([p.mapping.find(a => a.feature === A).id, k,
  p.mapping.find(a => a.feature === B).id]);
const audit = [];
function compare(name, actual) {
  const expected = read(name);
  for (const [k, value] of Object.entries(actual)) if (k !== 'measurements') assert.deepEqual(value, expected[k], `${name}.${k}`);
  audit.push({ name, exact: true });
}
for (const shuffled of [false, true]) {
  const name = shuffled ? 'shuffled' : 'causal', p = makePipeline(teachFeatures(seed), seed);
  const world = stormWorld({ seed, count: 30, shuffled });
  const track = lifetimes(p, shuffled ? [] : [key(p, 'lightning', 6, 'thunder')]);
  let trial = 0;
  while (p.t < world.duration) {
    track.begin(); const r = advance(p, world); track.observe(trial + 1, name, r.t);
    if (p.t >= world.trials[trial].end) {
      track.sample(++trial, name);
      if (trial % 5 === 0) console.log(`Seed-7 telemetry ${name} ${trial}/30`);
    }
  }
  assert.deepEqual(snapshot(p), read(`${name}-state`));
  const data = track.finish(); compare(name, data); write(`${name}-measurements`, data);
}
const p = actionPipeline(chainEnv({ seed, count: 30, phase: 'T1' }), seed);
const teacher = readJSON('out/m11c-graded/m8-cache/7-causal.json');
assert.deepEqual(teacher.mapping, p.mapping);
loadLayer(p.layer1, teacher.layer1); loadLayer(p.output.layer, teacher.motor); p.output.previous = teacher.previous;
const track = lifetimes(p, [key(p, 'action:press', 6, 'light'), key(p, 'light', 4, 'bell'), key(p, 'action:press', 6, 'bell')]);
let globalTrial = 0;
for (const phase of ['T1', 'T2', 'natural']) {
  const n = phase === 'natural' ? 60 : 30;
  p.env = chainEnv({ seed: phase === 'natural' ? seed + 60000 : seed, count: n, phase: phase === 'natural' ? 'goal' : phase });
  const schedule = teacherSchedule(seed, p.env.actions, phase === 'natural' ? 30 : 0, n), start = p.t;
  for (let trial = 1; trial <= n; trial++) {
    globalTrial++;
    while (p.t < start + trial * ACTION_WORLD.slotMs) {
      const action = phase === 'T2' ? null : schedule.get(p.t - start), drive = new Float64Array(p.env.actions.length);
      if (action) drive[p.env.actions.indexOf(action)] = 1;
      track.begin(); const r = advanceActions(p, drive); assert.equal(r.executed.action, action ?? null);
      track.observe(globalTrial, phase, r.t);
    }
    track.sample(globalTrial, phase);
    if (trial % 5 === 0) console.log(`Seed-7 telemetry ${phase} ${trial}/${n}`);
  }
  assert.deepEqual({ ...snapshot(p), motor: saveLayer(p.output.layer), previous: p.output.previous }, read(`${phase}-state`));
  audit.push({ name: `${phase}-state`, exact: true });
}
const data = track.finish(); compare('actions', data); write('actions-measurements', data);
// The original pilot did not save B/E endpoints. Replay only to obtain those
// missing checkpoints, verifying every existing per-trial result exactly.
const storm = makePipeline(teachFeatures(seed), seed), calibration = read('calibration');
for (const name of ['B', 'E']) {
  restore(storm, read('end-A-state'));
  const run = calibrationTrial(storm, key(storm, 'lightning', 6, 'thunder'));
  for (const [i, expected] of calibration[name].trials.entries()) {
    assert.deepEqual(run(expected.paired, expected.delay), expected, `${name}${i + 1}`);
    if ((i + 1) % 10 === 0) console.log(`Seed-7 checkpoint ${name}${i + 1}`);
  }
  write(`end-${name}-state`, snapshot(storm)); audit.push({ name, trials: calibration[name].trials.length, exact: true });
}
write('replay-audit', { seed, audit });
console.log(JSON.stringify({ seed, audit }));
