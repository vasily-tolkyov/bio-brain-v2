import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { chainEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { teacherSchedule } from '../experiments/m11a-runtime.mjs';
import { actionBlocks } from '../experiments/m11e-action-blocks.mjs';
import { measurements } from '../experiments/m11a-measure.mjs';
import { newConnection } from '../src/downward.mjs';

export function verifyM11a() {
  const c = checker('M11a natural-world smoke');
  try {
    for (const seed of [7, 19, 31]) {
      const env = chainEnv({ seed: seed + 60000, count: 2 });
      const schedule = teacherSchedule(seed, env.actions, 30, 2);
      const prefix = teacherSchedule(seed, env.actions, 0, 32);
      assert.deepEqual([...schedule], [...prefix].filter(([t]) => t >= 30 * ACTION_WORLD.slotMs)
        .map(([t, action]) => [t - 30 * ACTION_WORLD.slotMs, action]));
      assert.equal(env.events.filter(e => e.g === 'bird').length, 2);
      for (let t = 0; t < env.duration; t += 100) env.step(100, schedule.get(t) ?? null);
      for (let trial = 0; trial < 2; trial++) {
        const commands = env.executed.filter(e => Math.floor(e.t / ACTION_WORLD.slotMs) === trial);
        assert.deepEqual(commands.map(e => e.action).sort(), [...env.actions].sort());
        assert.ok(commands.every(e => e.t % ACTION_WORLD.slotMs < ACTION_WORLD.onsetSpanMs));
      }
      const presses = env.executed.filter(e => e.action === 'press');
      assert.deepEqual(env.events.filter(e => e.g === 'light').map(e => e.start), presses.map(e => e.t + 3000));
      assert.deepEqual(env.events.filter(e => e.g === 'bell').map(e => e.start), presses.map(e => e.t + 4000));
    }
    c.check('T1-rate teacher continuation; birds independent; only press causes light and chained bell', true);
  } catch (e) { c.check('Natural continuation environment', false, e.stack); }
  try {
    const trials = Array.from({ length: 10 }, (_, i) => ({ start: i * 10000, kind: 'bird', actions: [] }));
    trials[0].actions.push({ t: 100, action: 'press' });
    const early = actionBlocks(trials);
    assert.equal(early.pass, true); assert.deepEqual(early.blocks.map(b => b.total), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    trials[9] = { start: 90000, kind: 'bell', actions: [{ t: 100, action: 'press' }, { t: 500, action: 'press' }] };
    const late = actionBlocks(trials);
    assert.equal(late.pass, false); assert.equal(late.blocks[9].extraPresses, 1);
    trials[9] = { start: 90000, kind: 'light', satisfiedAt: 0, actions: [{ t: 100, action: 'press' }] };
    assert.equal(actionBlocks(trials).blocks[9].extraPresses, 1);
    c.check('Approved block metric retains transient false actions and fails on any last-block extra press', true);
  } catch (e) { c.check('False-action block accounting', false, e.stack); }
  try {
    const p = { t: 0, mapping: [{ id: 0, feature: 'light' }, { id: 1, feature: 'bell' },
      { id: 'action:press', feature: 'action:press' }], downward: { weights: [] } };
    const m = measurements(p), w = newConnection(1, 1, 0, 0);
    p.downward.weights.push(w); m.observe(1, 0); p.t = 100; m.sample();
    w.W = 0; w.deltas.miss = -0.02; w.deltas.clamp = 0.01; p.downward.weights.splice(0);
    m.observe(2, 100); p.t = 200; m.sample();
    p.downward.weights.push(newConnection(1, 1, 0, 200)); m.observe(3, 200); p.t = 300; m.sample();
    const row = m.finish().rows.find(r => r.ruleKey === w.ruleKey);
    assert.deepEqual(row.trajectory, [0, 0.01, 0, 0.01]);
    assert.deepEqual(row.continuationDeltas, { STDP: 0, N: 0.02, miss: -0.02, clamp: 0.01 });
    c.check('Existing M11a metrics preserve slots and cumulative deltas through deletion and recreation', true);
  } catch (e) { c.check('Sparse M11a measurement', false, e.stack); }
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyM11a() ? 0 : 1;
}
