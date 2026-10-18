import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { OutputLayer, OUTPUT, motorWinner } from '../src/output.mjs';
import { TimeUnroll } from '../src/unroll.mjs';
import { checkEnv, actionId, stepIO, teachGroups, groupInput } from '../src/io.mjs';
import { actionsEnv } from '../src/envs/actions.mjs';

export function verifyOutput() {
  const c = checker('M8 output and fixed IO');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); } catch (e) { c.check(name, false, e.message); }
  };
  const actions = ['turn', 'jump', 'wait'], output = new OutputLayer(actions, 7);
  test('Teacher forms three exact motor groups; WTA selects strongest P7 and handles ties', () => {
    assert.equal(output.mapping.length, 3);
    assert.deepEqual(output.mapping.map(a => a.members), [[0,1,2,3,4,5], [6,7,8,9,10,11], [12,13,14,15,16,17]]);
    assert.equal(motorWinner([{ id: 0, strength: 0.8 }, { id: 6, strength: 1 },
      { id: 12, strength: 0.9 }], output.mapping).action, 'jump');
    assert.equal(motorWinner([{ id: 0, strength: 1 }, { id: 6, strength: 1 }], output.mapping).action, 'turn');
    assert.equal(motorWinner([{ id: 0, strength: OUTPUT.thetaExec }], output.mapping).action, 'turn');
    assert.equal(motorWinner([{ id: 0, strength: OUTPUT.thetaExec - 0.001 }], output.mapping).action, null);
  });
  const { layer: layer1, mapping } = teachGroups(['tone', 'shape', 'odor'], 7), calls = [];
  let time = 0;
  // No schedule, simulator type, registry, or other adapter methods are required.
  const env = checkEnv({ features: ['tone', 'shape', 'odor'], actions,
    step(ms, action) {
      if (action !== null) calls.push({ t: time, action });
      const features = { tone: time < 100 ? 1 : 0 };
      time += ms; return { features };
    } });
  const unroll = new TimeUnroll([...mapping.map(a => a.id), ...actions.map(actionId)]);
  const core = { env, layer1, output, unroll };
  test('Tiny fake env works; weak motor drive sends zero actions and zero efference onsets', () => {
    for (let t = 0; t < 1000; t += 100) stepIO(core, t, new Float64Array([0.001, 0.001, 0.001]));
    assert.equal(calls.length, 0);
    assert.equal(unroll.entries.filter(e => typeof e.id === 'string').length, 0);
    assert.ok(unroll.entries.some(e => e.id === mapping[0].id));
    assert.throws(() => checkEnv({ features: ['a'], actions: ['a', 'a'], step() {} }));
    assert.throws(() => checkEnv({ features: ['a'], actions: [] }));
    assert.throws(() => output.step(new Float64Array([NaN, 0, 0])));
    assert.throws(() => groupInput(['tone'], { tone: null }));
    assert.throws(() => groupInput(['tone'], { tone: 1.1 }));
    assert.throws(() => groupInput(['tone'], { unknown: 1 }));
    assert.ok(groupInput(['toString'], {}).every(x => x === 0));
  });
  test('Executed onset alone enters action col 0, shifts, and stays separate from observations', () => {
    const first = stepIO(core, 1000, new Float64Array([1, 0, 0]));
    assert.equal(first.executed.action, 'turn'); assert.equal(calls.length, 1);
    assert.equal(first.lines[3 * 9], 1);
    assert.equal(first.lines[0], 0); assert.equal(first.lines[4], 1);
    assert.deepEqual(unroll.entries.filter(e => e.id === actionId('turn')),
      [{ id: actionId('turn'), strength: 1, tOnset: 1000 }]);
    for (let t = 1100; t <= 1400; t += 100) stepIO(core, t, new Float64Array([1, 0, 0]));
    assert.equal(calls.length, 1, 'sustained winner must not re-execute');
    assert.equal(unroll.lines(1400)[3 * 9 + 3], 1);
    assert.equal(unroll.entries.filter(e => e.id === actionId('turn')).length, 1);
    for (let t = 1500; t < 2500; t += 100) stepIO(core, t, new Float64Array(3));
    stepIO(core, 2500, new Float64Array([1, 0, 0]));
    assert.equal(calls.length, 2);
    assert.equal(unroll.entries.filter(e => e.id === actionId('turn')).length, 2);
  });
  test('Behavior adapter causal delays, idle, independent shuffled times and equal counts', () => {
    const causal = actionsEnv({ seed: 7, count: 1 }), shuffled = actionsEnv({ seed: 7, count: 1, shuffled: true });
    for (let t = 0; t < causal.duration; t += 100) {
      const action = t === 0 ? 'press' : t === 500 ? 'wave' : t === 1000 ? 'idle' : null;
      const observation = causal.step(100, action); shuffled.step(100, action);
      assert.equal(observation.features.light, Number(t >= 3000 && t < 3200));
      assert.equal(observation.features.bell, Number(t >= 1500 && t < 1700));
    }
    assert.deepEqual(causal.executed, shuffled.executed);
    for (const g of causal.features) assert.equal(causal.events.filter(e => e.g === g).length,
      shuffled.events.filter(e => e.g === g).length);
    const independent = actionsEnv({ seed: 7, count: 1, shuffled: true });
    for (let t = 0; t < independent.duration; t += 100) independent.step(100, null);
    assert.deepEqual(independent.events, shuffled.events);
    assert.throws(() => causal.step(100, 'unknown'));
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyOutput() ? 0 : 1;
}
