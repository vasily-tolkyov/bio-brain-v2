import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { createDownward, newConnection, registerConnection, strengthenDownward, DOWNWARD, plasticityBoost } from '../src/downward.mjs';
import { AttractorLayer } from '../src/layer.mjs';
import { attachLearning, learnWindow, saveLearning, loadLearning } from '../src/learning.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

export function verifyRuleStore() {
  const c = checker('M11e continuous downward weights');
  const test = (name, fn) => {
    try { fn(); c.check(name, true); } catch (e) { c.check(name, false, e.stack); }
  };
  test('Direct STDP excludes birth, keeps the pre gate, saturates, and has a decaying age boost', () => {
    const down = createDownward(['a', 'b']); assert.deepEqual(down.weights, []);
    const w = newConnection('a', 1, 'b', 100); down.weights.push(w);
    strengthenDownward(w, 10, 100); near(w.W, DOWNWARD.wInit);
    strengthenDownward(w, 0.01, 200); near(w.W, DOWNWARD.wInit);
    strengthenDownward(w, 1, 200);
    near(w.W, DOWNWARD.wInit + DOWNWARD.wMax * DOWNWARD.etaS * plasticityBoost(100) * 0.9);
    assert.ok(w.W / DOWNWARD.wMax < 0.3);
    const learned = w.W, age = DOWNWARD.tauBoost;
    near(plasticityBoost(age), 1 + DOWNWARD.boost / Math.E);
    assert.ok(plasticityBoost(age) < plasticityBoost(0)); near(plasticityBoost(100 * age), 1);
    strengthenDownward(w, 1, 100 + age);
    near(w.W, learned + DOWNWARD.wMax * DOWNWARD.etaS * plasticityBoost(age) * (1 - learned / DOWNWARD.wMax));
    w.W = DOWNWARD.wMax; strengthenDownward(w, 1, 100 + 2 * age);
    assert.equal(w.W, DOWNWARD.wMax);
    const repeated = newConnection('a', 6, 'b', 0);
    const a = Math.exp(-300 / 400); // One event, 300 ms after entering tolerance.
    for (let hit = 1; hit <= 15; hit++) strengthenDownward(repeated, a, hit * 34000);
    assert.ok(repeated.W / DOWNWARD.wMax >= 0.8);
  });
  test('Matched onsets strengthen once per prediction with a closed diagnostic gate; L2 stays ungated', () => {
    const ids = ['a', 'b'], layer = new AttractorLayer({ n: 18, R: 1, level: 2, seed: 7 });
    const p = attachLearning({ mapping: ids.map(id => ({ id })), layer2: layer, t: 0 }, 7);
    const w = newConnection('a', 1, 'b', 0); p.downward.weights.push(w);
    const step = p.errors.step.bind(p.errors);
    p.errors.step = (...args) => step(...args).map(c => ({ ...c, N: 0, M: 0 }));
    let hit;
    for (p.t = 0; p.t <= 600; p.t += 100) {
      learnWindow(p, p.t === 0 ? [{ id: 'a', strength: 1 }] :
        [100, 300].includes(p.t) ? [{ id: 'b', strength: 1 }] : []);
      if (p.t === 100) hit = w.W;
      if (p.t > 100) near(w.W, hit);
      assert.ok(layer.replicas.every(r => r.EE.frozen === false));
    }
    assert.equal(p.gate.value, 0); assert.ok(hit > DOWNWARD.wInit);
    assert.ok(p.downward.weights.every(w => !('hit' in w.deltas)));
    assert.equal(p.errors.constructor.name, 'SpikingNovelty');
    assert.ok(Object.keys(p.errors.net.pops).every(name => !/^[MD]/.test(name)));
    const saved = saveLearning(p);
    assert.throws(() => loadLearning(p, { ...saved, schema: undefined }), /legacy M states/);
    assert.deepEqual(saveLearning(p), saved);
    loadLearning(p, JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(saveLearning(p), saved);
    for (const field of ['threshold', 'noise', 'maxW']) assert.equal(field in p.downward, false);
  });
  test('An unpredicted creating onset gets exactly w_init, and no delayed association bonus', () => {
    const ids = ['a', 'b'], layer = new AttractorLayer({ n: 18, R: 1, level: 2, seed: 7 });
    const p = attachLearning({ mapping: ids.map(id => ({ id })), layer2: layer, t: 0 }, 7);
    const step = p.errors.step.bind(p.errors);
    p.errors.step = (...args) => step(...args).map(c => ({ ...c, N: p.t === 100 && c.id === 'b' ? 100 : 0, M: 0 }));
    learnWindow(p, [{ id: 'a', strength: 1 }]); p.t = 100;
    learnWindow(p, [{ id: 'b', strength: 1 }]);
    const w = p.downward.weights[0]; near(w.W, DOWNWARD.wInit); near(w.deltas.STDP, 0);
    for (p.t = 200; p.t <= 1000; p.t += 100) learnWindow(p, []);
    near(w.W, DOWNWARD.wInit); near(w.deltas.STDP, 0);
  });
  test('Ungated learned L2 and downward W stay fixed in silent rest after calcium settles', () => {
    const ids = ['a', 'b'], layer = new AttractorLayer({ n: 18, R: 1, level: 2, seed: 7 });
    const p = attachLearning({ mapping: ids.map(id => ({ id })), layer2: layer, t: 0 }, 7);
    p.downward.weights.push(registerConnection(p.downward, newConnection('a', 1, 'b', 0)));
    const lines = new Float64Array(18); lines[1] = lines[9] = 1;
    layer.run(500, lines); layer.run(1000);
    const before = [...layer.replicas[0].EE.stdp.rho], W = structuredClone(p.downward);
    for (p.t = 0; p.t < 10000; p.t += 100) learnWindow(p, []);
    assert.deepEqual([...layer.replicas[0].EE.stdp.rho], before); assert.deepEqual(p.downward, W);
  });
  return c.done();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = verifyRuleStore() ? 0 : 1;
