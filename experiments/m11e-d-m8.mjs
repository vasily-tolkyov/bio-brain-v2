/** Unchanged M8 schedules and margin checks; save sensory/motor teacher for M11e. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';
import { teacherSchedule } from './m11a-runtime.mjs';
import { actionsEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { weightProfile } from './m3-pipeline.mjs';
import { saveLayer } from './m8-cache.mjs';
const seed = Number(process.argv[2]);
assert.ok([7, 19, 31].includes(seed));
const dir = `out/m11e-roles/${seed}`; mkdirSync(dir, { recursive: true });
const pairs = [['action:press', 'light'], ['action:wave', 'bell'], ['action:press', 'bell'],
  ['action:wave', 'light'], ['bird', 'light']], runs = [];
for (const shuffled of [false, true]) {
  const p = actionPipeline(actionsEnv({ seed, count: 30, shuffled }), seed), copies = [];
  const schedule = teacherSchedule(seed, p.env.actions, 0, 30);
  while (p.t < p.env.duration) {
    const action = schedule.get(p.t), drive = new Float64Array(p.env.actions.length);
    if (action) drive[p.env.actions.indexOf(action)] = 1;
    const r = advanceActions(p, drive); assert.equal(r.executed.action, action ?? null);
    copies.push(...p.unroll.entries.filter(e => e.tOnset === r.t && typeof e.id === 'string')
      .map(e => ({ t: r.t, action: e.id.slice(7) })));
    if (p.t % (5 * ACTION_WORLD.slotMs) === 0) console.log(`M8 seed ${seed} shuffled=${shuffled} ${p.t / ACTION_WORLD.slotMs}/30`);
  }
  assert.deepEqual(copies, p.env.executed);
  if (!shuffled) {
    const teacher = { mapping: p.mapping, layer1: saveLayer(p.layer1), motor: saveLayer(p.output.layer), previous: p.output.previous };
    if (seed === 7) {
      const old = JSON.parse(readFileSync('out/m11c-graded/m8-cache/7-causal.json'));
      for (const k of Object.keys(teacher)) assert.deepEqual(teacher[k], old[k]);
    }
    writeFileSync(`${dir}/teacher.json`, JSON.stringify(teacher));
  }
  const profiles = pairs.map(([a, b]) => {
    const r = weightProfile(p, a, b); return { ...r, delta: r.rho.map(x => x === null ? null : x - 0.01) };
  });
  let weakExecutions = 0;
  for (let i = 0; i < 10; i++) weakExecutions += Number(p.output.step(new Float64Array(p.env.actions.length).fill(0.001)).action !== null);
  runs.push({ shuffled, profiles, copies: copies.length, executions: p.env.executed.length, weakExecutions });
}
const rules = [6, 4].map((k, i) => ({ k, peak: runs[0].profiles[i].argmax,
  shuffledMargin: runs[0].profiles[i].delta[k] - runs[1].profiles[i].delta[k],
  controlMargin: runs[0].profiles[i].delta[k] - Math.max(...runs[0].profiles.slice(2).map(p => p.delta[k])) }));
const pass = rules.every(r => r.peak === r.k && r.shuffledMargin >= 0.05 && r.controlMargin >= 0.05) &&
  runs.every(r => r.copies === r.executions && r.executions === 90 && r.weakExecutions === 0);
writeFileSync(`${dir}/m8.json`, JSON.stringify({ seed, runs, rules, pass }));
console.log(JSON.stringify({ seed, rules, pass }));
