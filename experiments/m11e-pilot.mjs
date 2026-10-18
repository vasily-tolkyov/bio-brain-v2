/** M11e Phase 1 only: fixed seed 7. No three-seed acceptance entry point. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { advance, makePipeline, teachFeatures, weightProfile } from './m3-pipeline.mjs';
import { stormWorld } from '../src/world.mjs';
import { saveLearning, loadLearning } from '../src/learning.mjs';
import { saveLayer, loadLayer } from './m8-cache.mjs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';
import { chainEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { teacherSchedule } from './m11a-runtime.mjs';
import { lifetimes, regression, mean, restCreations } from './m11e-measure.mjs';
import { learnedRest } from './m11e-rest.mjs';
import { calibrationTrial } from './m6-trial.mjs';
import { probe } from './m4-probe.mjs';
import { probeChain } from './m10-probe.mjs';
import { DOWNWARD } from '../src/downward.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';
const seed = 7, directory = 'out/m11e-pilot-c/', started = performance.now();
mkdirSync(directory, { recursive: true });
const write = (name, value) => writeFileSync(`${directory}${name}.json`, JSON.stringify(value));
const save = p => ({ t: p.t, baseline: p.baseline, mapping: p.mapping,
  layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), learning: saveLearning(p) });
const restore = (p, s) => { p.t = s.t; loadLayer(p.layer1, s.layer1); loadLayer(p.layer2, s.layer2); loadLearning(p, s.learning); };
const key = (p, A, k, B) => JSON.stringify([p.mapping.find(a => a.feature === A).id, k,
  p.mapping.find(a => a.feature === B).id]);
const profile = (p, A, B) => {
  const r = weightProfile(p, A, B);
  return { ...r, delta: r.rho.map(x => x === null ? null : x - 0.01) };
};
const report = { seed, DOWNWARD, THREE_FACTOR, storms: [], stopped: null };
write('parameters', { seed, DOWNWARD, THREE_FACTOR });
for (const shuffled of [false, true]) {
  const name = shuffled ? 'shuffled' : 'causal', p = makePipeline(teachFeatures(seed), seed);
  const world = stormWorld({ seed, count: 30, shuffled });
  const ruleKey = key(p, 'lightning', 6, 'thunder');
  const track = lifetimes(p, shuffled ? [] : [ruleKey]);
  let trial = 0;
  while (p.t < world.duration) {
    const r = advance(p, world); track.observe(trial + 1, name, r.t);
    if (p.t >= world.trials[trial].end) {
      track.sample(++trial, name);
      if (trial % 5 === 0) console.log(`${name} ${trial}/30: ${JSON.stringify(track.finish().history.at(-1).chance)}`);
    }
  }
  const state = save(p); write(`${name}-state`, state);
  const result = { ...track.finish(), profiles: [profile(p, 'lightning', 'thunder'), profile(p, 'bird', 'thunder')],
    intact: p.layer1.identify().map(a => a.members).sort().toString() === p.mapping.map(a => a.members).sort().toString() };
  write(name, result); report.storms.push({ name, file: `${name}.json`, profiles: result.profiles, intact: result.intact });
  if (!shuffled) {
    console.log('Causal learned rest: 300 s');
    const rest = learnedRest(p, seed); write('storm-rest', rest);
    report.stormRest = { pass: rest.pass, rho: rest.rho.mean, W: rest.W.mean, gateOpenFraction: rest.gateOpenFraction };
    if (!rest.pass) { report.stopped = 'Learned storm rest failed'; break; }
    restore(p, state);
    const phase = (name, n, paired) => {
      const run = calibrationTrial(p, ruleKey), rows = [], creations = restCreations(p);
      for (let i = 0; i < n; i++) {
        rows.push(run(typeof paired === 'function' ? paired(i) : paired, 3000, creations.observe));
        if ((i + 1) % 10 === 0) console.log(`${name} ${i + 1}/${n}: u=${rows.at(-1).W / DOWNWARD.wMax}`);
      }
      return { name, trials: rows, u: [rows[0].before, ...rows.map(r => r.W)].map(w => w / DOWNWARD.wMax),
        restCreations: creations.finish() };
    };
    const A = phase('A', 10, true), endA = save(p); write('end-A-state', endA);
    const B = phase('B', 60, false);
    restore(p, endA); const E = phase('E', 30, i => i % 2 === 0);
    const crosses = fraction => { const i = B.u.findIndex(u => u <= B.u[0] * fraction); return i < 0 ? null : i; };
    const hits = E.trials.filter(r => r.paired), misses = E.trials.filter(r => !r.paired);
    const calibration = { A, B, E, half: crosses(0.5), tenth: crosses(0.1),
      mixed: { trend: regression(E.u), last10: regression(E.u.slice(-10)),
        meanHitGain: mean(hits.map(r => r.W - r.before)), meanMissLoss: mean(misses.map(r => r.before - r.W)) } };
    write('calibration', calibration); report.calibration = { half: calibration.half, tenth: calibration.tenth, mixed: calibration.mixed };
    restore(p, state);
  }
  const probes = probe(p, p.baseline); write(`${name}-probes`, { mapping: p.mapping, ...probes });
}
if (!report.stopped) {
  const [c, s] = report.storms, causal = c.profiles[0].delta[6];
  report.M3 = { peak: c.profiles[0].argmax, causal, shuffledMargin: causal - s.profiles[0].delta[6],
    birdMargin: causal - c.profiles[1].delta[6], intact: c.intact && s.intact };
  report.M3.pass = report.M3.peak === 6 && report.M3.shuffledMargin >= 0.05 && report.M3.birdMargin >= 0.05 && report.M3.intact;
  const read = name => JSON.parse(readFileSync(`${directory}${name}.json`));
  const columns = (r, kind) => Array.from({ length: 8 }, (_, i) => r.trials.filter(t => t.kind === kind)
    .flatMap(t => t.created).filter(e => e.B === r.mapping.find(a => a.feature === 'thunder').id && e.k === i + 1)
    .reduce((n, e) => n + e.strength, 0) / 10);
  const cp = read('causal-probes'), sp = read('shuffled-probes');
  const cols = { causal: columns(cp, 'lightning'), shuffled: columns(sp, 'lightning'), bird: columns(cp, 'bird') };
  report.M4 = { columns: cols, trueStrength: cols.causal[5],
    singleShuffledRatio: cols.causal[5] / Math.max(...cols.shuffled), singleBirdRatio: cols.causal[5] / Math.max(...cols.bird),
    timely: cp.summaries.slice(0, 2).every(s => s.timelyTrialFraction >= 0.9) };
  report.M4.pass = report.M4.singleShuffledRatio >= 5 && report.M4.singleBirdRatio >= 5 && report.M4.timely;
  write('progress', report);
  const p = actionPipeline(chainEnv({ seed, count: 30, phase: 'T1' }), seed);
  // Reuse only the same M11c M8 sensory/motor teacher artifact as M11a. No old rule layer.
  const source = 'out/m11c-graded/m8-cache/7-causal.json', bytes = readFileSync(source), reused = JSON.parse(bytes);
  assert.deepEqual(reused.mapping, p.mapping);
  loadLayer(p.layer1, reused.layer1); loadLayer(p.output.layer, reused.motor); p.output.previous = reused.previous;
  report.reuse = { source, sha256: createHash('sha256').update(bytes).digest('hex') };
  const track = lifetimes(p, [key(p, 'action:press', 6, 'light'), key(p, 'light', 4, 'bell'), key(p, 'action:press', 6, 'bell')]);
  let globalTrial = 0;
  const actionBlocks = [];
  for (const phase of ['T1', 'T2', 'natural']) {
    const n = phase === 'natural' ? 60 : 30;
    p.env = chainEnv({ seed: phase === 'natural' ? seed + 60000 : seed, count: n, phase: phase === 'natural' ? 'goal' : phase });
    const schedule = teacherSchedule(seed, p.env.actions, phase === 'natural' ? 30 : 0, n), start = p.t;
    const copies = [];
    for (let trial = 1; trial <= n; trial++) {
      globalTrial++;
      while (p.t < start + trial * ACTION_WORLD.slotMs) {
        const action = phase === 'T2' ? null : schedule.get(p.t - start), drive = new Float64Array(p.env.actions.length);
        if (action) drive[p.env.actions.indexOf(action)] = 1;
        const r = advanceActions(p, drive); assert.equal(r.executed.action, action ?? null);
        copies.push(...p.unroll.entries.filter(e => e.tOnset === r.t && typeof e.id === 'string')
          .map(e => ({ t: r.t - start, action: e.id.slice(7) })));
        track.observe(globalTrial, phase, r.t);
      }
      track.sample(globalTrial, phase);
      if (phase === 'natural' && trial % 6 === 0) {
        const saved = save(p), motor = saveLayer(p.output.layer), previous = p.output.previous;
        const goals = probeChain(p, p.baseline, seed, [], { downward: p.downward, errors: p.errors.saveState() }, 2);
        const totals = goals.falseActions.blocks.reduce((a, b) => Object.fromEntries(
          Object.keys(a).map(k => [k, a[k] + b[k]])), { bird: 0, extraPresses: 0, distractors: 0, other: 0, total: 0 });
        actionBlocks.push({ block: trial / 6, start: start + (trial - 6) * ACTION_WORLD.slotMs,
          end: p.t, ...totals });
        write(`block-${trial / 6}-goals`, goals);
        restore(p, saved); loadLayer(p.output.layer, motor); p.output.previous = previous;
      }
      if (trial % 5 === 0) console.log(`${phase} ${trial}/${n}: ${JSON.stringify(track.finish().history.at(-1).chance)}`);
    }
    assert.deepEqual(copies, p.env.executed.map(({ t, action }) => ({ t, action })));
    write(`${phase}-state`, { ...save(p), motor: saveLayer(p.output.layer), previous: p.output.previous });
    write('actions', track.finish());
  }
  const natural = save(p);
  report.falseActions = { blocks: actionBlocks, pass: actionBlocks.at(-1).total === 0 };
  write('action-blocks', report.falseActions);
  console.log('Natural learned rest: 300 s');
  const rest = learnedRest(p, seed); write('natural-rest', rest);
  report.naturalRest = { pass: rest.pass, rho: rest.rho.mean, W: rest.W.mean, gateOpenFraction: rest.gateOpenFraction };
  if (!rest.pass) report.stopped = 'Learned natural rest failed';
  else {
    restore(p, natural);
    const goals = probeChain(p, p.baseline, seed, [], { downward: p.downward, errors: p.errors.saveState() });
    write('goals', goals); report.goals = goals.summaries; report.goalPass = goals.pass;
  }
}
report.wallSeconds = (performance.now() - started) / 1000;
write('summary', report); console.log(JSON.stringify(report));
process.exitCode = report.stopped ? 1 : 0;
