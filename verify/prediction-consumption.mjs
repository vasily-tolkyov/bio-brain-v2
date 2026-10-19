import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { NOVELTY as ERRORS, SpikingNovelty as SpikingErrors } from '../src/novelty.mjs';
import { FutureSlices } from '../src/predict.mjs';
import { DOWNWARD, plasticityBoost } from '../src/downward.mjs';
import { ThreeFactor, calibrateWeight, predictionCredit } from '../src/three-factor.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const rule = (A, k, W) => ({ A, k, B: 'b', W: W * DOWNWARD.wMax, ruleKey: JSON.stringify([A, k, 'b']) });

export function verifyConsumption() {
  const c = checker('Per-prediction hit/miss consumption');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.stack); }
  };
  test('Only real onsets inside the inclusive window mark a prediction as hit', () => {
    for (const offset of [-600, -500, -300, 500, 600, null]) {
      const e = new SpikingErrors(['b'], 7);
      for (let t = 0; t <= 1200; t += 100) {
        const hit = offset !== null && Math.abs(offset) <= ERRORS.toleranceMs;
        const [r] = e.step(t, [offset !== null && t === 600 + offset ? 1 : 0],
          t === 0 ? [{ B: 'b', tArrive: 600, strength: 1 }] : []);
        if (t <= 1100) {
          const matched = hit && t >= 600 + offset;
          assert.equal(e.pending[0].matched, matched ? 1 : 0);
          assert.equal(e.pending[0].tArrive, 600);
          assert.equal('M' in r || 'Mraw' in r || 'deadline' in r, false);
        }

      }
      assert.equal(e.pending.length, 0);
    }
  });
  test('One onset consumes every containing window, while an outside prediction stays intact', () => {
    const e = new SpikingErrors(['b'], 19);
    for (let t = 0; t <= 1700; t += 100) {
      const [r] = e.step(t, [t === 200 ? 1 : 0], t === 0 ?
        [600, 700, 1200].map(tArrive => ({ B: 'b', tArrive, strength: 1 })) : []);
      if (t === 200) assert.deepEqual(e.pending.map(p => p.matched), [1, 1, 0]);
      if (t === 1100) assert.equal(e.pending.find(p => p.tArrive === 600).matched, 1);
      if (t === 1200) assert.equal(e.pending.find(p => p.tArrive === 700).matched, 1);
      if (t === 1700) assert.equal(e.pending.find(p => p.tArrive === 1200).matched, 0);
    }
  });
  test('The ledger remembers strongest real onset independently of N and survives JSON', () => {
    let e = new SpikingErrors(['b'], 31), resumed;
    const predictions = [0.8, 0.4].map(strength => ({ B: 'b', tArrive: 600, strength }));
    for (let t = 0; t <= 1100; t += 100) {
      const now = [t === 100 ? 0.5 : t === 300 ? 0.25 : t === 500 ? 0.75 : 0];
      const counts = e.step(t, now, t === 0 ? predictions : []);
      if (t === 100 || t === 300) near(e.pending[0].matched, 0.5);
      if (t >= 500) near(e.pending[0].matched, 0.75);
      if (resumed) assert.deepEqual(resumed.step(t, now), counts);
      if (t === 500) {
        const saved = JSON.parse(JSON.stringify(e.saveState()));
        resumed = new SpikingErrors(['b'], 31).loadState(saved);
        assert.throws(() => new SpikingErrors(['b'], 31).loadState({ ...saved,
          pending: saved.pending.map(p => ({ ...p, matched: 2 })) }));
      }
      if (t === 1100) assert.deepEqual(e.pending.map(p => p.matched), [0.75, 0.75]);
    }
    assert.deepEqual(e.saveState(), resumed.saveState());
  });
  test('A consumed rule is unchanged at its deadline despite an unconsumed rule to the same B', () => {
    const f = new FutureSlices(['a', 'b', 'c'], {
      weights: [rule('a', 4, 0.8), rule('c', 3, 0.9)] });
    const errors = new SpikingErrors(f.past.ids, 7), learner = new ThreeFactor(f);
    const credit = [0, 0];
    let after, hitWeight = 0.8;
    for (let t = 0; t <= 1500; t += 100) {
      f.update(t, (t === 0 ? ['a'] : t === 300 ? ['b'] : t === 400 ? ['c'] : []).map(id => ({ id, strength: 1 })));
      const lines = f.past.lines(t);
      errors.step(t, f.past.ids.map((_, i) => lines[i * 9]), f.created);
      // Both arrive at 800 and expire at 1300. c's prediction was created after
      // the B onset, so only a's pending prediction was consumed.
      for (const [i, start] of [300, 400].entries()) if (t >= start && t <= 1300) {
        credit[i] = 1;
      }
      if (t === 300) hitWeight += DOWNWARD.etaS * plasticityBoost(t) * predictionCredit(1, 800, t) * (1 - hitWeight);
      learner.step(t, [{ id: 'b', N: 0 }], errors.pending);
      const ws = f.downward.weights.slice(0, 2).map(w => w.W / DOWNWARD.wMax);
      if (t < 1300) { near(ws[0], hitWeight); near(ws[1], 0.9); }
      if (t === 1300) {
        near(ws[0], hitWeight);
        near(ws[1], calibrateWeight(0.9, 1, credit[1]));
        after = ws;
      }
      if (t > 1300) assert.deepEqual(ws, after);
    }
  });
  test('Overlapping predictions of one rule each use only their own deadline eligibility', () => {
    for (const onset of [400, 600]) {
      const f = new FutureSlices(['a', 'b'], { weights: [rule('a', 4, 0.8)] });
      const errors = new SpikingErrors(f.past.ids, 19), learner = new ThreeFactor(f);
      const credits = [0, 0];
      let expected = 0.8;
      for (let t = 0; t <= 1600; t += 100) {
        f.update(t, (t === 0 || t === 200 ? ['a'] : t === onset ? ['b'] : []).map(id => ({ id, strength: 1 })));
        const lines = f.past.lines(t);
        errors.step(t, [lines[0], lines[9]], f.created);
        for (const [i, start] of [300, 500].entries()) if (t >= start && t <= start + 1000) {
          credits[i] = 1;
        }
        if (t === onset) for (const [i, start] of [300, 500].entries()) if (t >= start) {
          expected += DOWNWARD.etaS * plasticityBoost(t) * predictionCredit(1, 800 + 200 * i, t) * (1 - expected);
        }
        learner.step(t, [{ id: 'b', N: 0 }], errors.pending);
        if (t === 1500 && onset !== 600) expected = calibrateWeight(expected, 1, credits[1]);
        near(f.downward.weights[0].W / DOWNWARD.wMax, expected);
      }
    }
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyConsumption() ? 0 : 1;
}
