import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { FutureSlices } from '../src/predict.mjs';
import { DOWNWARD, createDownward, newConnection, plasticityBoost } from '../src/downward.mjs';
import { NOVELTY as ERRORS, SpikingNovelty as SpikingErrors } from '../src/novelty.mjs';
import { THREE_FACTOR, ThreeFactor, sat, trace, calibrateWeight, missShape, missDelta, predictionCredit } from '../src/three-factor.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const cap = DOWNWARD.wMax;
const make = ratio => {
  const f = new FutureSlices(['a', 'b'], createDownward(['a', 'b']));
  if (ratio > 0) f.downward.weights.push({ ...newConnection('a', 1, 'b', 0), W: ratio * cap });
  return f;
};
export function verifyThreeFactor() {
  const c = checker('M11e learning roles');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); } catch (e) { c.check(name, false, e.stack); }
  };
  test('A miss follows the original decreasing shape with no neural gate or target strength', () => {
    near(sat(100), 0.5); near(sat(-100), -0.5); // Separate goal consumer unchanged.
    near(missShape(0), 1); near(missShape(1), THREE_FACTOR.gFloor);
    let previous = Infinity;
    for (const u of [0.1, 0.5, 1]) {
      const delta = -missDelta(u * cap, cap, 1);
      near(delta, cap * THREE_FACTOR.etaMissByLayer[2] * missShape(u));
      near(calibrateWeight(u * cap, cap, 1), Math.max(0, u * cap - delta));
      assert.ok(delta < previous && delta > 0); previous = delta;
      near(calibrateWeight(u * cap, cap, 0), u * cap);
    }
    assert.throws(() => missDelta(cap, cap, 1, 100), /no neural M gate/);
    const misses = initial => {
      let W = initial * cap, n = 0;
      while (W > 0) { W = calibrateWeight(W, cap, 1); n++; }
      return n;
    };
    assert.ok(misses(1) > misses(0.5) && misses(0.5) > misses(0.1));
  });
  test('N creates exactly w_init for every active past line, never adds or uses a stale N trace', () => {
    const f = make(0), l = new ThreeFactor(f);
    f.update(0, [{ id: 'a', strength: 0.2 }]); l.step(0, [], []);
    f.update(100, []); l.step(100, [{ id: 'b', N: 100, M: 0, Nraw: 0 }], []);
    near(f.downward.weights[0].W, DOWNWARD.wInit);
    assert.equal(f.downward.weights[0].createdAt, 100);
    for (let t = 200; t <= 400; t += 100) {
      f.update(t, []); l.step(t, [{ id: 'b', N: 1000, M: 0 }], []);
    }
    near(f.downward.weights[0].W, DOWNWARD.wInit);
    assert.equal(f.downward.weights[0].createdAt, 100);
    assert.equal(f.downward.weights[1].createdAt, 200);
    assert.equal(f.downward.weights[2].createdAt, 300);
    assert.equal(f.downward.weights.filter(w => w.W > 0).length, 3);
    assert.ok(f.downward.weights.filter(w => w.W > 0).every(w => w.W === DOWNWARD.wInit));
    const zero = make(0), z = new ThreeFactor(zero);
    zero.update(0, [{ id: 'a', strength: 1 }]); z.step(0, [], []);
    zero.update(100, []); z.step(100, [{ id: 'b', N: 0, M: 0, Nraw: 10000 }], []);
    zero.update(200, []); z.step(200, [{ id: 'b', N: 100, M: 0 }], []);
    assert.ok(!zero.downward.weights.some(w => w.k === 1)); // No stale N trace.
    near(zero.downward.weights[0].W, DOWNWARD.wInit);
    assert.equal(zero.downward.weights[0].k, 2);
  });
  test('Per-prediction eligibility traces onset activation, independently of W and strength', () => {
    const credits = [];
    for (const ratio of [0.1, 0.8]) {
      const f = make(ratio), l = new ThreeFactor(f); let pending, credit;
      for (let t = 0; t <= 600; t += 100) {
        f.update(t, t === 0 ? [{ id: 'a', strength: 0.5 }] : []);
        if (t === 0) { pending = f.created; near(pending[0].activation, 0.5); near(pending[0].strength, ratio * 0.5); }
        if (t === 600) credit = 0.5;
        l.step(t, [{ id: 'b', M: 100, N: 0 }], pending);
        if (t < 600) {
          near(f.downward.weights[0].W, ratio * cap);
          near(l.predictions[0].sourceActivation, 0.5);
        }
      }
      credits.push(credit);
      near(f.downward.weights[0]?.W ?? 0, calibrateWeight(ratio * cap, cap, credit));
      assert.equal(l.predictions.length, 0);
    }
    near(credits[0], credits[1]); near(trace(1, 0, 300), Math.exp(-0.75));
  });
  test('An omitted new connection reaches exact zero; later surprise recreates it with a fresh birth time', () => {
    const f = make(DOWNWARD.wInit / cap), l = new ThreeFactor(f), old = f.downward.weights[0]; let pending = [];
    for (let t = 0; t <= 1100; t += 100) {
      f.update(t, t === 0 || t === 1000 ? [{ id: 'a', strength: 1 }] : []);
      if (t === 0) pending = f.created;
      l.step(t, [{ id: 'b', N: t === 1100 ? 100 : 0, M: t === 600 ? 100 : 0 }], pending);
      if (t >= 600 && t < 1100) {
        assert.equal(f.downward.weights.length, 0);
        assert.equal(l.predictions.length, 0);
        assert.ok(!JSON.stringify(f.saveState().downward).includes(old.ruleKey));
      }
    }
    near(f.downward.weights[0].W, DOWNWARD.wInit);
    const fresh = f.downward.weights[0];
    assert.notEqual(fresh, old); assert.equal(fresh.createdAt, 1100);
    near(plasticityBoost(1100 - fresh.createdAt), 1 + DOWNWARD.boost);
    near(fresh.deltas.STDP, 0); near(fresh.deltas.miss, 0);
  });
  test('Miss credit is the actual activation peak at every column deadline', () => {
    for (let k = 1; k <= 8; k++) for (const activation of [0.2, 1]) {
      const f = new FutureSlices(['a', 'b'], { weights: [newConnection('a', k, 'b', 0)] });
      const l = new ThreeFactor(f), arrival = 100 * 2 ** (k - 1), deadline = arrival + ERRORS.toleranceMs;
      let pending;
      const w = f.downward.weights[0]; w.W = 0.8 * cap;
      for (let t = 0; t <= deadline; t += 100) {
        f.update(t, t === 0 ? [{ id: 'a', strength: activation }] : []);
        if (t === 0) pending = f.created;
        l.step(t, [{ id: 'b', N: 0, M: t === deadline ? 100 : 0 }], pending);
        if (t >= Math.max(0, arrival - ERRORS.toleranceMs) && t < deadline) near(l.predictions[0].sourceActivation, activation);
        if (t === deadline) {
          near(w.W, calibrateWeight(0.8 * cap, cap, activation));
          assert.equal(l.predictions.length, 0);
        }
      }
    }
  });
  test('Distinct cause onsets keep additive credit without capping their sum at one', () => {
    const f = new FutureSlices(['a', 'b'], { weights: [newConnection('a', 4, 'b', 0)] });
    const l = new ThreeFactor(f), pending = [];
    for (let t = 0; t <= 500; t += 100) {
      f.update(t, [0, 200].includes(t) ? [{ id: 'a', strength: 1 }] : []);
      pending.push(...f.created); l.step(t, [], pending);
    }
    assert.equal(l.predictions.length, 2);
    near(l.predictions[0].sourceActivation, 1);
    near(l.predictions[1].sourceActivation, 1);
    assert.ok(l.predictions.reduce((sum, p) => sum + p.sourceActivation, 0) > 1);
  });
  test('Inclusive tolerance-edge consumption has zero triangular strengthening credit', () => {
    const f = make(0), l = new ThreeFactor(f); let pending = [], w;
    for (let t = 0; t <= 800; t += 100) {
      if (t === 100) { w = newConnection('a', 1, 'b', t); f.downward.weights.push(w); }
      f.update(t, t === 200 ? [{ id: 'a', strength: 1 }] : []);
      pending.push(...f.created);
      if (t === 800) pending[0].matched = 1;
      l.step(t, [{ id: 'b', N: 0, M: 0 }], pending);
      if (t >= 200 && t < 800) near(l.predictions[0].sourceActivation, 1);
    }
    near(w.W / cap, 0.1);
    assert.ok(w.W / cap <= 0.15);
  });
  test('Frozen weights advance prediction traces, reject invalid windows, and JSON continuation is exact', () => {
    const f = make(0.8), e = new SpikingErrors(f.past.ids, 7), l = new ThreeFactor(f);
    const step = (f, e, l, t, learn) => {
      f.update(t, t === 0 ? [{ id: 'a', strength: 1 }] : []);
      const lines = f.past.lines(t), counts = e.step(t, [lines[0], lines[9]], f.created);
      l.step(t, counts, e.pending, { learn });
    };
    for (let t = 0; t <= 300; t += 100) step(f, e, l, t, false);
    near(f.downward.weights[0].W, 0.8 * cap); assert.ok(l.predictions[0].sourceActivation > 0);
    assert.throws(() => l.step(300, [], [])); assert.throws(() => l.step(500, [], []));
    const saved = JSON.parse(JSON.stringify({ f: f.saveState(), e: e.saveState(), l: l.saveState() }));
    const f2 = new FutureSlices(f.past.ids).loadState(saved.f), e2 = new SpikingErrors(f.past.ids, 7).loadState(saved.e);
    const l2 = new ThreeFactor(f2).loadState(saved.l);
    for (let t = 400; t <= 1000; t += 100) { step(f, e, l, t, true); step(f2, e2, l2, t, true); }
    assert.deepEqual(f.saveState(), f2.saveState()); assert.deepEqual(e.saveState(), e2.saveState());
    assert.deepEqual(l.saveState(), l2.saveState());
  });
  test('Deleted eligibility and pending predictions cannot strengthen a recreated generation', () => {
    const f = make(0.1), l = new ThreeFactor(f), e = new SpikingErrors(f.past.ids, 7);
    for (let t = 0; t <= 900; t += 100) {
      f.update(t, [0, 300, 600].includes(t) ? [{ id: 'a', strength: 1 }] :
        t === 800 ? [{ id: 'b', strength: 1 }] : []);
      const lines = f.past.lines(t);
      e.step(t, [lines[0], lines[9]], f.created);
      l.step(t, [{ id: 'b', N: t === 700 ? 100 : 0, M: t === 600 ? 100 : 0 }], e.pending);
      if (t === 600) { assert.equal(f.downward.weights.length, 0); assert.equal(l.predictions.length, 0); }
      if (t >= 700) {
        assert.deepEqual(f.downward.weights.map(w => w.k), [1, 3, 4]);
        const w = f.downward.weights.find(w => w.k === 1); assert.equal(w.createdAt, 700);
        near(w.W, DOWNWARD.wInit); near(w.deltas.STDP, 0);
        assert.equal(l.predictions.length, 0);
      }
    }
  });
  test('Pruning removes the lookup entry before N can recreate in the same window', () => {
    const f = make(0.1), l = new ThreeFactor(f), e = new SpikingErrors(f.past.ids, 7);
    const old = f.downward.weights[0];
    for (let t = 0; t <= 700; t += 100) {
      f.update(t, [0, 500].includes(t) ? [{ id: 'a', strength: 1 }] :
        t === 700 ? [{ id: 'b', strength: 1 }] : []);
      const lines = f.past.lines(t);
      e.step(t, [lines[0], lines[9]], f.created);
      l.step(t, [{ id: 'b', N: t === 600 ? 100 : 0, M: t === 600 ? 100 : 0 }], e.pending);
      if (t >= 600) {
        const fresh = f.downward.weights.find(w => w.k === 1);
        assert.notEqual(fresh, old); assert.equal(fresh.createdAt, 600);
        near(fresh.W, DOWNWARD.wInit); near(fresh.deltas.STDP, 0);
        assert.ok(!l.predictions.some(c => c.generation === old.generation));
      }
    }
  });
  test('Exact-zero deletion preserves all positive weights and does not prune frozen state', () => {
    assert.equal(THREE_FACTOR.pruneThreshold, 0);
    for (const ratio of [Number.MIN_VALUE / cap, 1e-12, 0.001, 0.019]) {
      const f = make(ratio), l = new ThreeFactor(f), w = f.downward.weights[0];
      f.update(0, []); l.step(0, [], []);
      assert.equal(f.downward.weights[0], w); near(w.W, ratio * cap);
    }
    for (const learn of [false, true]) {
      const f = make(0.1), l = new ThreeFactor(f), w = f.downward.weights[0]; w.W = 0;
      f.update(0, []); l.step(0, [], [], { learn });
      assert.equal(f.downward.weights.includes(w), !learn);
    }
    assert.throws(() => new FutureSlices(['a', 'b'], { weights: [{ ...newConnection('a', 1, 'b', 0), W: 0 }] }));
  });
  test('Zero remnants are removed before a hit; same-time N rebirth cannot inherit old credit', () => {
    const f = make(0.1), l = new ThreeFactor(f), old = f.downward.weights[0];
    f.update(0, [{ id: 'a', strength: 1 }]); const pending = f.created;
    l.step(0, [], pending, { learn: false }); old.W = 0;
    f.update(100, []); pending[0].matched = 1;
    l.step(100, [{ id: 'b', N: 100 }], pending);
    const fresh = f.downward.weights.find(w => w.ruleKey === old.ruleKey);
    assert.ok(fresh); assert.notEqual(fresh, old); assert.equal(fresh.createdAt, 100);
    assert.notEqual(fresh.generation, old.generation);
    near(fresh.W, DOWNWARD.wInit); near(old.deltas.STDP, 0); near(fresh.deltas.STDP, 0);
    assert.equal(l.predictions.length, 0);
  });
  test('Same-edge overlapping instances settle independently, without a neural M count', () => {
    const f = new FutureSlices(['a', 'b'], { weights: [{ ...newConnection('a', 4, 'b', 0), W: cap }] });
    const l = new ThreeFactor(f), pending = [];
    let expected = cap, hitValue;
    for (let t = 0; t <= 2200; t += 100) {
      f.update(t, [0, 200].includes(t) ? [{ id: 'a', strength: 1 }] : []);
      pending.push(...f.created);
      // This actual onset is inside the first window [300,1300], not the second [500,1500].
      if (t === 400) pending.filter(p => Math.abs(t - p.tArrive) <= ERRORS.toleranceMs).forEach(p => { p.matched = 1; });
      l.step(t, [], pending);
      if (t === 400) hitValue = f.downward.weights[0].W;
      if (t === 1300) near(f.downward.weights[0].W, hitValue); // Matched first instance has no LTD.
      if (t === 1500) expected = calibrateWeight(hitValue, cap, 1);
      if (t >= 1500) near(f.downward.weights[0].W, expected); // Exactly one unmatched payment.
    }
    near(f.downward.weights[0].deltas.miss, expected - hitValue);
    assert.equal(l.predictions.length, 0);
  });
  test('Every overlapping miss is charged once; a target-wide fabricated M value cannot gate it', () => {
    const results = [];
    for (const fakeM of [undefined, -100, 0, 10000]) {
      const f = new FutureSlices(['a', 'b'], { weights: [{ ...newConnection('a', 4, 'b', 0), W: cap }] });
      const l = new ThreeFactor(f), pending = [];
      for (let t = 0; t <= 2000; t += 100) {
        f.update(t, [0, 200].includes(t) ? [{ id: 'a', strength: 1 }] : []);
        pending.push(...f.created); l.step(t, [{ id: 'b', N: 0, ...(fakeM === undefined ? {} : { M: fakeM }) }], pending);
        if (t < 1300) near(f.downward.weights[0].W, cap);
      }
      const expected = calibrateWeight(calibrateWeight(cap, cap, 1), cap, 1);
      near(f.downward.weights[0].W, expected); results.push(f.saveState());
    }
    for (const result of results) assert.deepEqual(result, results[0]);
  });
  test('Same-time rebirth gets a distinct generation; old predictions cannot credit its replacement', () => {
    const f = make(0.1), l = new ThreeFactor(f), old = f.downward.weights[0];
    f.update(0, [{ id: 'a', strength: 1 }]); const pending = [...f.created];
    l.step(0, [], pending, { learn: false });
    // Replace the object at the same birth time, as a loaded/deleted generation can be.
    f.downward.weights.splice(0, 1, newConnection('a', 1, 'b', 0));
    for (let t = 100; t <= 700; t += 100) {
      f.update(t, []); if (t === 100) pending[0].matched = 1;
      l.step(t, [], pending);
      const fresh = f.downward.weights[0];
      assert.notEqual(fresh.generation, old.generation); assert.equal(fresh.createdAt, old.createdAt);
      near(fresh.W, DOWNWARD.wInit); near(fresh.deltas.STDP, 0); near(fresh.deltas.miss, 0);
    }
  });
  test('Legacy snapshots and duplicate pending credit are explicitly rejected', () => {
    const f = make(0.8), l = new ThreeFactor(f);
    f.update(0, [{ id: 'a', strength: 1 }]); l.step(0, [], f.created);
    const fs = f.saveState(), ls = l.saveState();
    assert.throws(() => new FutureSlices(['a', 'b']).loadState({ ...fs, schema: undefined }), /legacy migration/);
    assert.throws(() => new ThreeFactor(f).loadState({ ...ls, schema: undefined }), /legacy migration/);
    assert.throws(() => new ThreeFactor(f).loadState({ ...ls, predictions: [...ls.predictions, ...ls.predictions] }), /Invalid/);
    const bad = structuredClone(fs); delete bad.downward.weights[0].generation;
    assert.throws(() => new FutureSlices(['a', 'b']).loadState(bad), /generations/);
  });
  test('An empty store restores its identity counter before the first N birth', () => {
    const f = new FutureSlices(['a', 'b']); const l = new ThreeFactor(f);
    f.update(0, [{ id: 'a', strength: 1 }]); l.step(0, [], []);
    const saved = JSON.parse(JSON.stringify({ f: f.saveState(), l: l.saveState() }));
    const resumed = new FutureSlices(['a', 'b']).loadState(saved.f);
    const learner = new ThreeFactor(resumed).loadState(saved.l);
    for (const [future, factor] of [[f, l], [resumed, learner]]) {
      future.update(100, []); factor.step(100, [{ id: 'b', N: 100 }], []);
      assert.equal(future.downward.weights[0].generation, 1);
      assert.equal(future.downward.nextGeneration, 2);
    }
    assert.deepEqual(f.saveState(), resumed.saveState());
  });
  return c.done();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = verifyThreeFactor() ? 0 : 1;
