import { DOWNWARD } from '../src/downward.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { FutureSlices, GoalRow } from '../src/predict.mjs';
import { GoalActions, GOALS, upwardDrive } from '../src/goals.mjs';
import { SpikingErrors } from '../src/errors.mjs';
import { sat } from '../src/three-factor.mjs';
import { OutputLayer } from '../src/output.mjs';
import { actionId, teachGroups } from '../src/io.mjs';
import { advanceGoals } from '../experiments/m9-pipeline.mjs';
import { ThreeFactor } from '../src/three-factor.mjs';
import { chainEnv, ACTION_WORLD, CHAIN_WORLD } from '../src/envs/actions.mjs';

const rule = (A, B, k, W) => ({ A, B, k, W: W * DOWNWARD.wMax, ruleKey: JSON.stringify([A, k, B]) });
const weights = layer => layer.replicas.map(r => r.net.groups.map(g =>
  ({ scale: [...g.scale], rho: g.stdp ? [...g.stdp.rho] : null })));
const planner = (ids, rules) => new GoalActions(new FutureSlices([...ids, actionId('turn')],
  { weights: rules }), ['turn'], ids, 7);

export function verifyGoals() {
  const c = checker('M9/M10 goals, upward action selection and subgoals');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); } catch (e) { c.check(name, false, e.stack); }
  };
  test('Goal persists without timeout; only its reality onset or cancellation clears it', () => {
    const f = new FutureSlices(['x', 'y']), g = new GoalRow(['x', 'y']);
    g.write('x', 0.8);
    for (const t of [0, 100, 20000, 100000]) {
      f.update(t, []); g.observe([]);
      assert.equal(g.entries.get('x'), 0.8);
      assert.equal(f.past.entries.length, 0); assert.equal(f.entries.length, 0);
    }
    g.observe([{ id: 'y', strength: 1 }]); assert.equal(g.entries.get('x'), 0.8);
    g.observe([{ id: 'x', strength: 0 }]); assert.equal(g.entries.get('x'), 0.8);
    g.observe([{ id: 'x', strength: 1 }]); assert.equal(g.entries.size, 0);
    g.write('y'); g.cancel('y'); assert.equal(g.entries.size, 0);
    g.write('x').write('x', 0); assert.equal(g.entries.size, 0);
    assert.throws(() => g.write('missing')); assert.throws(() => g.write('x', NaN));
  });
  test('Upward U reads current W, sums all delays, clips, and ignores observation preconditions', () => {
    const down = { weights: [
      rule(actionId('turn'), 'x', 2, 0.2), rule(actionId('turn'), 'x', 6, 0.4),
      rule('observation', 'x', 4, 1), rule(actionId('jump'), 'y', 3, 1)] };
    const counts = [{ id: 'x', effective: 100 }, { id: 'y', effective: 0 }];
    const drive = () => upwardDrive(down, ['turn', 'jump'], counts);
    assert.ok(Math.abs(drive()[0] - GOALS.gain * sat(100) * 0.6) < 1e-12);
    assert.equal(drive()[1], 0);
    down.weights[0].W = 0.6 * DOWNWARD.wMax;
    assert.equal(drive()[0], 1);
    down.weights = [down.weights[2]]; assert.deepEqual([...drive()], [0, 0]);
    down.weights = [rule(actionId('turn'), 'x', 1, 1), rule(actionId('turn'), 'x', 2, 1)];
    counts[0].effective = 1000; assert.equal(drive()[0], 1);
    counts[0].effective = -100; assert.equal(drive()[0], 0);
    down.weights.push(rule(actionId('turn'), 'y', 1, 1)); counts[1].effective = 1000;
    assert.equal(drive()[0], 0, 'Signed goal terms cancel before clipping');
    down.weights.length = 0; assert.deepEqual([...drive()], [0, 0]);
  });
  test('Motor U uses the fixed prediction scale, including tiny chance weights', () => {
    const down = { weights: [rule(actionId('turn'), 'x', 6, 0.2),
      rule(actionId('jump'), 'x', 2, 0.1)] };
    const counts = [{ id: 'x', effective: 100 }, { id: 'y', effective: 100 }];
    const drive = () => [...upwardDrive(down, ['turn', 'jump'], counts)];
    assert.deepEqual(drive(), [0.1 * GOALS.gain, 0.05 * GOALS.gain]);
    down.weights.push(rule('x', 'y', 4, 1), rule('y', 'x', 3, 1));
    assert.deepEqual(drive(), [0.1 * GOALS.gain, 0.05 * GOALS.gain]);
    down.weights[0].W = 0.00001 * DOWNWARD.wMax;
    assert.deepEqual(drive(), [0.000005 * GOALS.gain, 0.05 * GOALS.gain]);
  });
  test('Pending prediction suppresses effective goal-M, including M5 arrival tolerance, then expires', () => {
    const A = actionId('turn'), f = new FutureSlices(['x', A],
      {  weights: [rule(A, 'x', 2, 0.5)] });
    const g = new GoalActions(f, ['turn'], ['x'], 7), e = new SpikingErrors(f.past.ids, 7);
    g.goals.write('x');
    const before = g.errors.net.groups.map(w => [...w.scale]);
    for (let t = 0; t <= 900; t += 100) {
      f.update(t, t === 0 ? [{ id: A, strength: 1 }] : []);
      e.step(t, [0, Number(t === 0)], f.created);
      const { counts, drive } = g.step(t, [], e.pending);
      assert.ok(counts[0].M > 0, 'raw goal M persists while awaiting reality');
      if (t <= 700) {
        assert.equal(counts[0].pendingStrength, 0.5); assert.equal(drive[0], Math.min(1, GOALS.gain * sat(counts[0].M * 0.5) * 0.5));
      } else assert.ok(drive[0] > 0, 'missing outcome releases drive at expiry');
      assert.equal(g.goals.entries.size, 1);
      assert.ok(f.past.entries.every(o => o.id === A));
    }
    const half = g.step(1000, [], [{ B: 'x', strength: 0.5 }]).counts[0];
    assert.equal(half.effective, half.M * 0.5);
    assert.equal(g.motorDrive()[0], Math.min(1, GOALS.gain * sat(half.effective) * 0.5));
    const held = g.step(1100, [], [{ B: 'x', strength: 1 }]);
    assert.equal(held.counts[0].effective, 0); assert.equal(held.drive[0], 0);
    g.goals.cancel('x'); assert.equal(g.motorDrive()[0], 0, 'cancel must invalidate queued drive');
    g.goals.write('x');
    const satisfied = g.step(1200, [{ id: 'x', strength: 1 }]);
    assert.equal(g.goals.entries.size, 0); assert.equal(satisfied.drive[0], 0);
    assert.deepEqual(g.errors.net.groups.map(w => [...w.scale]), before);
  });
  test('Goal-M uses excitatory goal / inhibitory reality and the same afferent iSTDP gate', () => {
    const e = new SpikingErrors(['x'], 19), row = e.rows[0];
    assert.ok(e.stepGoals(0, [0], [1])[0].M > 0);
    row.Minh.y.fill(2);
    const before = [...row.Minh.scale];
    e.stepGoals(100, [1], [0], { learn: true });
    assert.equal(row.Minh.frozen, true); assert.deepEqual([...row.Minh.scale], before);
    e.stepGoals(200, [1], [1], { learn: true });
    assert.equal(row.Minh.frozen, false); assert.notDeepEqual([...row.Minh.scale], before);
    assert.throws(() => e.stepGoals(400, [0], [1]));
  });
  test('Weak goal-driven rehearsal makes no env action/copy/prediction and changes no weights', () => {
    const output = new OutputLayer(['turn', 'jump'], 7), teacher = teachGroups(['tone', 'odor'], 7);
    const ids = [...teacher.mapping.map(a => a.id), ...output.actions.map(actionId)];
    const f = new FutureSlices(ids, {
      weights: [rule(ids[1], ids[0], 4, 1), rule(ids[0], ids[1], 4, 1),
        rule(actionId('turn'), ids[1], 2, 0.001)] });
    const goal = new GoalActions(f, output.actions, teacher.mapping.map(a => a.id), 7);
    const p = { layer1: teacher.layer, output, future: f, goal, t: 0,
      errors: new SpikingErrors(ids, 7), factor: new ThreeFactor(f) };
    let calls = 0;
    const env = { features: ['tone', 'odor'], actions: output.actions,
      step(ms, action) { if (action !== null) calls++; return { features: {} }; } };
    const before = [weights(p.layer1), weights(output.layer), structuredClone(f.downward)];
    goal.goals.write(ids[0]);
    for (let i = 0; i < 10; i++) {
      const r = advanceGoals(p, env);
      assert.equal(r.executed.action, null); assert.ok(r.goal.drive[0] > 0);
      assert.equal(f.past.entries.length, 0); assert.equal(f.entries.length, 0);
    }
    assert.equal(calls, 0); assert.equal(goal.goals.entries.size, 2);
    assert.equal(goal.links.get(ids[0]).kind, 'SUBGOAL');
    assert.deepEqual([weights(p.layer1), weights(output.layer), f.downward], before);
  });
  test('Best observation precondition writes a scaled persistent subgoal, with no past input', () => {
    const g = planner(['x', 'y', 'z'], [rule('y', 'x', 4, 1), rule('z', 'x', 6, 0.6),
      rule(actionId('turn'), 'y', 6, 0.8)]);
    g.goals.write('x', 0.8);
    for (let t = 0; t <= 1000; t += 100) {
      g.future.update(t, []);
      const r = g.step(t, []);
      assert.deepEqual([...g.goals.entries], [['x', 0.8], ['y', 0.8 * (DOWNWARD.wMax) / DOWNWARD.wMax]]);
      assert.deepEqual(g.links.get('x'), { kind: 'SUBGOAL', id: 'y', parent: 'x',
        strength: 0.8 * DOWNWARD.wMax / DOWNWARD.wMax, depth: 2, satisfied: false });
      assert.equal(r.written.length, t === 0 ? 1 : 0); assert.ok(r.drive[0] > 0);
      assert.equal(g.future.past.entries.length, 0); assert.equal(g.future.entries.length, 0);
      assert.ok(g.future.past.lines(t).every(x => x === 0));
    }
    const scaled = planner(['x', 'y'], [rule('y', 'x', 4, 0.5)]);
    scaled.goals.write('x', 0.8); scaled.step(0, []);
    assert.ok(Math.abs(scaled.goals.entries.get('y') - 0.4) < 1e-12);
  });
  test('Observation argmax expands even with a stronger direct action; ablation prevents recursion', () => {
    for (const mode of ['direct', 'noise', 'disabled']) {
      const g = planner(['x', 'y'], [rule('y', 'x', 4, mode === 'noise' ? 0.2 : 0.4),
        ...(mode === 'direct' ? [rule(actionId('turn'), 'x', 6, 0.5)] : [])]);
      g.recursion = mode !== 'disabled'; g.goals.write('x');
      const r = g.step(0, []);
      assert.equal(r.written.length, mode !== 'disabled' ? 1 : 0);
      assert.equal(g.goals.entries.size, mode !== 'disabled' ? 2 : 1);
      if (mode !== 'direct') assert.equal(r.drive[0], 0);
    }
  });
  test('Goal stack includes root in depth limit three; cycles never re-add a feature', () => {
    const g = planner(['a', 'b', 'c', 'd'], [rule('b', 'a', 4, 1),
      rule('c', 'b', 4, 1), rule('d', 'c', 4, 1)]);
    g.goals.write('a'); g.step(0, []); g.step(100, []);
    assert.equal(GOALS.maxDepth, 3);
    assert.deepEqual([...g.goals.entries.keys()], ['a', 'b', 'c']);
    assert.deepEqual([...g.links.values()].map(e => e.depth), [2, 3]);
    g.goals.cancel('b'); assert.equal(g.motorDrive()[0], 0); g.step(200, []);
    assert.deepEqual([...g.goals.entries.keys()], ['a']);
    const cycle = planner(['a', 'b'], [rule('b', 'a', 4, 1), rule('a', 'b', 4, 1)]);
    cycle.goals.write('a'); cycle.step(0, []); cycle.step(100, []);
    assert.deepEqual([...cycle.goals.entries.keys()], ['a', 'b']);
    assert.equal(cycle.links.size, 1); assert.equal(cycle.written.length, 0);
  });
  test('Subgoal reality clears only the child; parent persists until its own reality', () => {
    const g = planner(['x', 'y'], [rule('y', 'x', 4, 1), rule(actionId('turn'), 'y', 6, 1)]);
    g.goals.write('x'); g.step(0, []);
    g.step(100, [{ id: 'y', strength: 1 }]);
    assert.deepEqual([...g.goals.entries.keys()], ['x']); assert.equal(g.motorDrive()[0], 0);
    assert.equal(g.links.get('x').satisfied, true);
    g.step(200, []); assert.deepEqual([...g.goals.entries.keys()], ['x']);
    g.step(300, [{ id: 'x', strength: 1 }]);
    assert.equal(g.goals.entries.size, 0); assert.equal(g.links.size, 0);
    g.goals.write('x'); g.step(400, []); assert.equal(g.written.length, 1);
    g.goals.cancel('x'); assert.equal(g.motorDrive()[0], 0);
    assert.equal(g.goals.entries.size, 0); assert.equal(g.links.size, 0);
    g.goals.write('x'); g.step(500, []);
    g.step(600, [{ id: 'x', strength: 1 }]); // Parent can also arrive before its child.
    assert.equal(g.goals.entries.size, 0); assert.equal(g.links.size, 0);
    g.goals.write('x'); g.step(700, [{ id: 'y', strength: 1 }]);
    assert.deepEqual([...g.goals.entries.keys()], ['x']); // New subgoal already real.
    assert.equal(g.links.get('x').satisfied, true); assert.equal(g.motorDrive()[0], 0);
  });
  test('Chain environment separates teacher phases and composes both delays only in goals', () => {
    for (const phase of ['T1', 'T2', 'goal']) {
      const env = chainEnv({ seed: 7, count: 1, phase }), seen = [];
      for (let t = 0; t < 15000; t += 100) {
        const action = phase !== 'T2' && t === 0 ? 'press' : null;
        const sample = env.step(100, action);
        for (const feature of ['light', 'bell']) if (sample.features[feature]) seen.push({ feature, t });
      }
      const light = seen.find(e => e.feature === 'light'), bell = seen.find(e => e.feature === 'bell');
      assert.ok(light);
      if (phase !== 'T2') assert.equal(light.t, ACTION_WORLD.pressDelayMs);
      if (phase === 'T1') assert.equal(bell, undefined);
      else assert.equal(bell.t - light.t, CHAIN_WORLD.bellDelayMs);
      assert.equal(env.executed.length, phase === 'T2' ? 0 : 1);
      if (phase === 'T2') assert.throws(() => env.step(100, 'press'));
    }
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyGoals() ? 0 : 1;
}
