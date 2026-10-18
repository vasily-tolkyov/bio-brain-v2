/** M3/M8 unchanged bidirectional STDP measurements, plus graded M4 probes. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { learnedPipeline } from './m4-learning.mjs';
import { cachedActions } from './m8-cache.mjs';
import { weightProfile } from './m3-pipeline.mjs';
import { probe } from './m4-probe.mjs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';
import { teacherSchedule } from './m11a-runtime.mjs';
import { actionsEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { DOWNWARD } from '../src/downward.mjs';
const seed = Number(process.argv[2]), started = performance.now();
assert.ok([7, 19, 31].includes(seed));
const directory = 'out/m11c-graded/readout/'; mkdirSync(directory, { recursive: true });
const profile = (p, a, b) => {
  const r = weightProfile(p, a, b);
  return { ...r, delta: r.rho.map(x => x === null ? null : x - 0.01) };
};
const pairs = [['lightning', 'thunder'], ['bird', 'thunder']];
const storms = [];
for (const shuffled of [false, true]) {
  const { pipeline: p, baseline, cache } = learnedPipeline(seed, shuffled);
  const profiles = pairs.map(([a, b]) => profile(p, a, b));
  const intact = p.layer1.identify().map(a => a.members).sort().toString() === p.mapping.map(a => a.members).sort().toString();
  storms.push({ shuffled, cache, profiles, intact, mapping: p.mapping, ...probe(p, baseline) });
}
const [c, s] = storms, causal = c.profiles[0].delta[6];
const M3 = { peak: c.profiles[0].argmax, causal, shuffledMargin: causal - s.profiles[0].delta[6],
  birdMargin: causal - c.profiles[1].delta[6], intact: storms.every(s => s.intact) };
M3.pass = M3.peak === 6 && M3.shuffledMargin >= 0.05 && M3.birdMargin >= 0.05 && M3.intact;
const perColumn = (r, kind) => Array.from({ length: 8 }, (_, i) => r.trials.filter(t => t.kind === kind)
  .flatMap(t => t.created).filter(e => e.B === r.mapping.find(a => a.feature === 'thunder').id && e.k === i + 1)
  .reduce((n, e) => n + e.strength, 0) / 10);
const columns = { causal: perColumn(c, 'lightning'), shuffled: perColumn(s, 'lightning'), bird: perColumn(c, 'bird') };
const sum = xs => xs.reduce((a, b) => a + b, 0);
const M4 = { columns, trueStrength: columns.causal[5], singleShuffledRatio: columns.causal[5] / Math.max(...columns.shuffled),
  singleBirdRatio: columns.causal[5] / Math.max(...columns.bird), totalShuffledRatio: sum(columns.causal) / sum(columns.shuffled),
  totalBirdRatio: sum(columns.causal) / sum(columns.bird), tables: storms.map(r => ({ shuffled: r.shuffled, mapping: r.mapping, weights: r.downward.weights })),
  arrivalMs: 3200, timely: c.summaries.slice(0, 2).every(s => s.timelyTrialFraction >= 0.9) };
M4.pass = M4.singleShuffledRatio >= 5 && M4.singleBirdRatio >= 5 && M4.timely;
const actions = [];
const apairs = [['action:press', 'light'], ['action:wave', 'bell'], ['action:press', 'bell'], ['action:wave', 'light'], ['bird', 'light']];
for (const shuffled of [false, true]) {
  const p = actionPipeline(actionsEnv({ seed, count: 30, shuffled }), seed);
  const copies = [];
  {
    const schedule = teacherSchedule(seed, p.env.actions, 0, 30);
    while (p.t < p.env.duration) {
      const action = schedule.get(p.t), drive = new Float64Array(p.env.actions.length);
      if (action) drive[p.env.actions.indexOf(action)] = 1;
      const r = advanceActions(p, drive); assert.equal(r.executed.action, action ?? null);
      copies.push(...p.unroll.entries.filter(e => e.tOnset === r.t && typeof e.id === 'string').map(e => ({ t: r.t, action: e.id.slice(7) })));
      if (p.t % (5 * ACTION_WORLD.slotMs) === 0) console.log(`M8 ${shuffled ? 'shuffled' : 'causal'} seed ${seed}: ${p.t / ACTION_WORLD.slotMs}/30`);
    }
    assert.deepEqual(copies, p.env.executed);
  }
  if (!shuffled) assert.deepEqual(p.downward, cachedActions(seed).pipeline.downward, 'Replayed M8 teacher differs');
  const profiles = apairs.map(([a, b]) => profile(p, a, b));
  let weakExecutions = 0;
  for (let i = 0; i < 10; i++) weakExecutions += Number(p.output.step(new Float64Array(p.env.actions.length).fill(0.001)).action !== null);
  actions.push({ shuffled, profiles, copies: copies.length, executions: p.env.executed.length, weakExecutions });
}
const M8 = { runs: actions, rules: [6, 4].map((k, i) => ({ k, peak: actions[0].profiles[i].argmax,
  shuffledMargin: actions[0].profiles[i].delta[k] - actions[1].profiles[i].delta[k],
  controlMargin: actions[0].profiles[i].delta[k] - Math.max(...actions[0].profiles.slice(2).map(p => p.delta[k])) })) };
M8.pass = M8.rules.every(r => r.peak === r.k && r.shuffledMargin >= 0.05 && r.controlMargin >= 0.05) &&
  actions.every(r => r.copies === r.executions && r.executions === 90 && r.weakExecutions === 0);
const result = { seed, DOWNWARD, M3, M4, M8, storms, wallSeconds: (performance.now() - started) / 1000 };
writeFileSync(`${directory}${seed}.json`, JSON.stringify(result));
console.log(JSON.stringify({ seed, M3, M4: { ...M4, tables: undefined }, M8, wallSeconds: result.wallSeconds }));
process.exitCode = M3.pass && M4.pass && M8.pass ? 0 : 1;
