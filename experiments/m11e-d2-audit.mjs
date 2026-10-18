/** Verify retained pilot metrics with identical-runtime checkpoint replay. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readJSON, restore } from './m11e-d-state.mjs';
import { actionBlocks } from './m11e-action-blocks.mjs';
import { makePipeline, teachFeatures } from './m3-pipeline.mjs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';
import { saveLayer, loadLayer } from './m8-cache.mjs';
import { saveLearning } from '../src/learning.mjs';
import { calibrationTrial } from './m6-trial.mjs';
import { teacherSchedule } from './m11a-runtime.mjs';
import { probe } from './m4-probe.mjs';
import { probeChain } from './m10-probe.mjs';
import { DOWNWARD } from '../src/downward.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';
import { ACTION_WORLD, chainEnv } from '../src/envs/actions.mjs';
const dir = 'out/m11e-roles/7', base = 'out/m11e-pilot-c';
const read = name => readJSON(`${base}/${name}.json`);
const snapshot = p => ({ t: p.t, baseline: p.baseline, mapping: p.mapping,
  layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), learning: saveLearning(p) });
// Compare the exact JSON representation written by the original pilot.
const compare = (name, value, t) => assert.deepEqual(JSON.parse(JSON.stringify(value)), read(name), `${name} at ${t} ms`);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const runtime = readJSON('out/m11e-roles/runtime-audit.json');
for (const f of runtime.files) assert.equal(hash(f.file), f.sha256, f.file);
const baseline = readJSON(`${dir}/d2-baseline.json`);
for (const f of baseline.hashes.filter(f => f.file.startsWith(`${base}/`))) {
  assert.equal(hash(f.file), f.sha256, f.file);
}
assert.deepEqual(read('parameters'), { seed: 7, DOWNWARD, THREE_FACTOR });
const worlds = Object.fromEntries(['causal', 'shuffled', 'actions'].map(name => [name, read(name)]));
const probes = {};
for (const name of ['causal', 'shuffled']) {
  const data = probes[name] = read(`${name}-probes`), weights = worlds[name].final.weights;
  const p = makePipeline(teachFeatures(7), 7);
  restore(p, read(`${name}-state`));
  console.log(`Verify seed-7 ${name} M4 probes from ${p.t} ms`);
  compare(`${name}-probes`, { mapping: p.mapping, ...probe(p, p.baseline) }, p.t);
  assert.deepEqual(data.downward.weights, weights, `${name} probe weights`);
  for (const trial of data.trials) {
    const created = trial.onsets.flatMap(o => weights.filter(w => w.A === o.id && w.A !== w.B).map(w => ({
      A: w.A, B: w.B, k: w.k, ruleKey: w.ruleKey, strength: o.strength * w.W / DOWNWARD.wMax,
      activation: o.strength, tOnset: o.tOnset, tArrive: o.tOnset + 100 * 2 ** (w.k - 1), createdAt: w.createdAt,
    })));
    assert.deepEqual(created, trial.created, `${name} predictions at ${trial.start} ms`);
  }
}
const columns = (r, kind) => Array.from({ length: 8 }, (_, i) => r.trials.filter(t => t.kind === kind)
  .flatMap(t => t.created).filter(e => e.B === r.mapping.find(a => a.feature === 'thunder').id && e.k === i + 1)
  .reduce((n, e) => n + e.strength, 0) / 10);
const cols = { causal: columns(probes.causal, 'lightning'), shuffled: columns(probes.shuffled, 'lightning'),
  bird: columns(probes.causal, 'bird') };
const M4 = { columns: cols, trueStrength: cols.causal[5],
  singleShuffledRatio: cols.causal[5] / Math.max(...cols.shuffled), singleBirdRatio: cols.causal[5] / Math.max(...cols.bird),
  timely: probes.causal.summaries.slice(0, 2).every(s => s.timelyTrialFraction >= 0.9) };
M4.pass = M4.singleShuffledRatio >= 5 && M4.singleBirdRatio >= 5 && M4.timely;
assert.deepEqual(M4, read('summary').M4, 'M4');
const blocks = [];
const p = actionPipeline(chainEnv({ seed: 7, count: 30, phase: 'T1' }), 7), t2 = read('T2-state');
restore(p, t2); loadLayer(p.output.layer, t2.motor); p.output.previous = t2.previous;
p.env = chainEnv({ seed: 60007, count: 60, phase: 'goal' });
const schedule = teacherSchedule(7, p.env.actions, 30, 60), start = p.t;
for (let block = 1; block <= 10; block++) {
  while (p.t < start + block * 6 * ACTION_WORLD.slotMs) {
    const action = schedule.get(p.t - start), drive = new Float64Array(p.env.actions.length);
    if (action) drive[p.env.actions.indexOf(action)] = 1;
    assert.equal(advanceActions(p, drive).executed.action, action ?? null);
  }
  const saved = snapshot(p), motor = saveLayer(p.output.layer), previous = p.output.previous;
  const actual = probeChain(p, p.baseline, 7, [], { downward: p.downward, errors: p.errors.saveState() }, 2);
  compare(`block-${block}-goals`, actual, p.t);
  restore(p, saved); loadLayer(p.output.layer, motor); p.output.previous = previous;
  console.log(`Verified seed-7 action block ${block}/10 at ${p.t} ms`);
  const goals = read(`block-${block}-goals`), h = worlds.actions.history.find(h => h.trial === 60 + block * 6);
  const weights = new Map(goals.downward.weights.map(w => [w.ruleKey, w.W]));
  assert.equal(weights.size, h.live.total, `block ${block} live weights at ${h.t} ms`);
  assert.deepEqual(worlds.actions.keys.map(k => (weights.get(k) ?? 0) / DOWNWARD.wMax), h.u,
    `block ${block} weights at ${h.t} ms`);
  const measured = actionBlocks(goals.trials, 2);
  assert.deepEqual(measured, goals.falseActions, `block ${block} actions`);
  const totals = measured.blocks.reduce((a, b) => Object.fromEntries(Object.keys(a).map(k => [k, a[k] + b[k]])),
    { bird: 0, extraPresses: 0, distractors: 0, other: 0, total: 0 });
  blocks.push({ block, start: h.t - 6 * ACTION_WORLD.slotMs, end: h.t, ...totals });
}
compare('natural-state', { ...snapshot(p), motor: saveLayer(p.output.layer), previous: p.output.previous }, p.t);
const naturalActions = { blocks, pass: blocks.at(-1).total === 0 };
assert.deepEqual(naturalActions, read('action-blocks'), 'natural action blocks');
assert.deepEqual(naturalActions, read('summary').falseActions, 'summary action blocks');
const goals = read('goals'), frozenActions = actionBlocks(goals.trials);
console.log('Verify seed-7 final frozen goal probes');
compare('goals', probeChain(p, p.baseline, 7, [], { downward: p.downward, errors: p.errors.saveState() }), p.t);
assert.deepEqual(goals.downward, worlds.actions.final, 'final frozen weights');
assert.deepEqual(frozenActions, goals.falseActions, 'frozen action blocks');
const calibration = read('calibration');
const storm = makePipeline(teachFeatures(7), 7);
restore(storm, read('causal-state'));
const run = calibrationTrial(storm, worlds.causal.trueRules[0].ruleKey);
for (const [i, expected] of calibration.A.trials.entries()) {
  assert.deepEqual(run(expected.paired, expected.delay), expected, `A${i + 1} at ${expected.start} ms`);
}
compare('end-A-state', snapshot(storm), storm.t);
for (const name of ['A', 'B', 'E']) assert.deepEqual(
  [calibration[name].trials[0].before, ...calibration[name].trials.map(t => t.W)].map(w => w / DOWNWARD.wMax),
  calibration[name].u, `${name} trajectory`);
const result = { seed: 7, exact: true, originalFiles: runtime.files.length,
  note: 'M4 probes, all ten natural action-block probe suites, final frozen goals and A endpoint reproduced exactly from saved checkpoints. Original artifacts retained.',
  M4, trueU: Object.fromEntries(Object.entries(worlds).map(([name, w]) => [name, w.trueRules.map(r => r.finalU)])),
  falseRules: Object.fromEntries(Object.entries(worlds).map(([name, w]) => [name, w.history.at(-1).chance])),
  naturalActions, frozenActions, extinction: calibration.B.u, alternating: calibration.E.u };
writeFileSync(`${dir}/replay-metrics.json`, JSON.stringify(result));
console.log(JSON.stringify({ exact: true, M4, naturalLast: blocks.at(-1).total, frozenLast: frozenActions.blocks.at(-1).total }));
