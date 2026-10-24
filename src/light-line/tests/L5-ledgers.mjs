import assert from 'node:assert/strict';
import { FutureSlices, GoalRow } from '../predict.mjs';
import { DOWNWARD, newConnection, registerConnection, strengthenDownward, plasticityBoost } from '../downward.mjs';
import { BinaryNovelty } from '../novelty.mjs';
import { GoalErrors } from '../goal-errors.mjs';
import { ThreeFactor, predictionCredit, calibrateWeight, missDelta, sat } from '../three-factor.mjs';
import { PredictionLearning } from '../learning.mjs';
import { GoalActions } from '../goals.mjs';
import { reverseLookup, predictedOutcomes, actionRequest } from '../reverse-chain.mjs';
import { present, novelty, deficit } from '../presence.mjs';
import { simultaneousSource } from '../source-labels.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12, `${a} != ${b}`);
const event = (id, strength = 1) => ({ id, strength });
const bit = (id, N) => ({ kind: 'novelty', id, N });
const rule = (A, k, B, W = .08) => ({ ...newConnection(A, k, B, 0), W });
const make = (weights = [], labels = new Map(), ids = ['a', 'b', 'c']) => {
  const f = new FutureSlices(ids, { weights });
  return { f, n: new BinaryNovelty(ids), l: new ThreeFactor(f, labels) };
};
function tick(p, t, events = [], counts = null, learn = true) {
  p.f.update(t, events);
  const lines = p.f.past.lines(t);
  const actual = p.n.step(t, p.f.past.ids.map((_, i) => lines[i * 9]), p.f.created);
  p.l.step(t, counts ?? actual.map(c => ({ ...c, N: 0 })), p.n.pending, { learn });
  return actual;
}

/** Executed also by the acceptance runner; assertions fail closed. No RNG. */
export function ledgerChecks() {
  const rows = [], check = (name, fn) => { const detail = fn(); rows.push({ name, pass: true, detail }); };
  check('binary formulas, deadband, matched, goal isolation and birth once', () => {
    let cases = 0;
    for (const R of [0, .001, .05, .1, .25, .250001, .5, .75, 1])
      for (const P of [0, .001, .1, .25, .5, .75, 1])
        for (const G of [0, .001, .1, .25, .5, .75, 1]) {
          const n = new BinaryNovelty(['b']), g = new GoalErrors(['b']);
          const [nr] = n.step(0, [R], [{ B: 'b', strength: P, tArrive: 100 }]);
          const [gr] = g.stepGoals(0, [R], [G]);
          assert.equal(nr.N, Number(R > .25 && P <= .25));
          assert.equal(gr.M, Number(G > .25 && R <= .25));
          assert.equal(novelty(R, P), nr.N); assert.equal(deficit(G, R), gr.M);
          assert.ok(!('N' in gr) && !('M' in nr)); cases++;
        }
    for (const strength of [0, .001, .05, .1, .25, .250001, .5, 1]) {
      const p = new PredictionLearning(['a', 'b']);
      p.step(0, [event('a')]); p.step(100, [event('b', strength)]);
      assert.equal(p.downward.weights.length, present(strength));
      p.step(200, []);
      if (present(strength)) {
        assert.equal(p.downward.weights.length, 1);
        const w = p.downward.weights[0]; assert.equal(w.k, 1); assert.equal(w.W, .01);
        assert.equal(w.deltas.STDP, 0); assert.equal(w.deltas.N, .01);
      }
    }
    const p = make(); p.f.update(0, [event('a')]); p.l.step(0, [], []);
    p.f.update(100, []);
    const g = new GoalErrors(p.f.past.ids).stepGoals(100, [0, 0, 0], [0, 1, 0]);
    assert.throws(() => p.l.step(100, g, []));
    assert.equal(p.f.downward.weights.length, 0);
    const boundary = new PredictionLearning(['a']);
    for (const origin of ['goal', 'prediction', 'hypothetical']) {
      assert.throws(() => boundary.step(0, [{ ...event('a'), origin }]));
      assert.equal(boundary.future.past.entries.length, 0);
    }
    return { cases, presenceThreshold: .25, strict: true };
  });
  check('eleven inclusive arrival offsets, first hit only and exact triangle', () => {
    const offsets = [];
    for (let offset = -500; offset <= 500; offset += 100) {
      const w = rule('a', 6, 'b'), p = make([w]);
      const arrival = 3200, match = arrival + offset;
      let first;
      for (let t = 0; t <= 3900; t += 100) {
        tick(p, t, t === 0 ? [event('a', .6)] :
          [match, match + 200].includes(t) ? [event('b')] : []);
        if (t === match) first = w.W;
        if (t >= match) near(w.W, first);
      }
      const credit = .6 * (1 - Math.abs(offset) / 500);
      near(predictionCredit(.6, arrival, match), credit);
      const expected = .08 + .1 * .205 * (1 + .05 * Math.exp(-match / 5000)) * credit * .2;
      near(w.W, expected); assert.equal(w.deltas.miss, 0);
      assert.equal(p.l.predictions.length, 0); assert.equal(p.n.pending.length, 0);
      offsets.push({ offset, credit, W: w.W, expected, error: Math.abs(w.W - expected) });
    }
    return offsets;
  });
  check('outside-window onsets miss, pending max and binary first-match latch', () => {
    for (const offset of [-600, 600, null]) {
      const w = rule('a', 6, 'b'), p = make([w]);
      for (let t = 0; t <= 4000; t += 100) tick(p, t,
        t === 0 ? [event('a')] : offset !== null && t === 3200 + offset ? [event('b')] : []);
      near(w.W, calibrateWeight(.08, .1, 1));
    }
    const n = new BinaryNovelty(['b']);
    for (let t = 0; t <= 1800; t += 100) {
      const [c] = n.step(t, [t === 200 ? .5 : 0], t === 0 ?
        [600, 700, 1200].map((tArrive, i) => ({ B: 'b', tArrive, strength: [.9, .4, .8][i] })) : []);
      if (t === 200) { assert.deepEqual(n.pending.map(p => p.matched), [1, 1, 0]); assert.equal(c.N, 0); }
      if (t === 1700) assert.equal(n.pending[0].matched, 0);
    }
    assert.equal(n.pending.length, 0);
  });
  check('overlapping contributors settle independently, every miss exactly once', () => {
    const outcomes = [];
    for (const target of [400, 600, null]) {
      const w = rule('a', 4, 'b'), p = make([w]); let expected = .08;
      for (let t = 0; t <= 2200; t += 100) {
        if (t === target) for (const arrival of [800, 1000]) {
          if (Math.abs(t - arrival) <= 500) expected += .1 * .205 * plasticityBoost(t) *
            predictionCredit(1, arrival, t) * (1 - expected / .1);
        }
        if ([1300, 1500].includes(t) && (target === null || Math.abs(target - (t - 500)) > 500))
          expected = calibrateWeight(expected, .1, 1);
        tick(p, t, [0, 200].includes(t) ? [event('a')] : t === target ? [event('b')] : []);
        near(w.W, expected);
      }
      outcomes.push({ target, W: w.W, deltas: w.deltas });
    }
    // One onset must not rescue a contributor launched after that onset.
    const a = rule('a', 4, 'b'), c = rule('c', 3, 'b', .09), p = make([a, c]);
    for (let t = 0; t <= 1500; t += 100) tick(p, t,
      t === 0 ? [event('a')] : t === 300 ? [event('b')] : t === 400 ? [event('c')] : []);
    assert.equal(a.deltas.miss, 0); near(c.W, calibrateWeight(.09, .1, 1));
    return outcomes;
  });
  check('deleted/reborn generations share zero credit, including same-time replacement', () => {
    const old = rule('a', 1, 'b', .01), p = make([old]); let fresh;
    for (let t = 0; t <= 900; t += 100) {
      tick(p, t, [0, 300, 600].includes(t) ? [event('a')] : t === 800 ? [event('b')] : [],
        [bit('b', t === 700 ? 1 : 0)]);
      if (t === 600) { assert.equal(old.W, 0); assert.equal(p.f.downward.weights.length, 0); }
      if (t >= 700) {
        fresh = p.f.downward.weights.find(w => w.k === 1);
        assert.notEqual(fresh.generation, old.generation); assert.equal(fresh.W, .01);
        assert.equal(fresh.deltas.STDP, 0); assert.equal(fresh.deltas.miss, 0);
      }
    }
    const q = make([rule('a', 1, 'b', .01)]), original = q.f.downward.weights[0];
    tick(q, 0, [event('a')]);
    q.f.downward.weights.splice(0, 1, rule('a', 1, 'b', .01));
    for (let t = 100; t <= 700; t += 100) tick(q, t, t === 100 ? [event('b')] : []);
    const replacement = q.f.downward.weights[0];
    assert.notEqual(replacement.generation, original.generation); assert.equal(replacement.W, .01);
    // Remove an exact-zero remnant before processing a hit and same-window N.
    const z = make([rule('a', 1, 'b', .01)]), stale = z.f.downward.weights[0];
    tick(z, 0, [event('a')], [], false); stale.W = 0;
    tick(z, 100, [event('b')], [bit('b', 1)]);
    assert.notEqual(z.f.downward.weights[0].generation, stale.generation);
    assert.equal(stale.deltas.STDP, 0); assert.equal(z.f.downward.weights[0].W, .01);
    return { old: old.generation, reborn: fresh.generation };
  });
  check('exact-zero deletion, age boost, birth exclusion and all-column miss activation', () => {
    for (const W of [Number.MIN_VALUE, 1e-13, .0001, .0019]) {
      const p = make([rule('a', 1, 'b', W)]); tick(p, 0); assert.equal(p.f.downward.weights[0].W, W);
    }
    for (const learn of [true, false]) {
      const p = make([rule('a', 1, 'b')]); p.f.downward.weights[0].W = 0;
      tick(p, 0, [], [], learn); assert.equal(p.f.downward.weights.length, Number(!learn));
    }
    const w = newConnection('a', 6, 'b', 100);
    strengthenDownward(w, 1, 100); strengthenDownward(w, .01, 200); assert.equal(w.W, .01);
    strengthenDownward(w, 1, 200); near(w.W, .01 + .1 * .205 * plasticityBoost(100) * .9);
    near(sat(1), .5); near(sat(-1), -.5);
    assert.throws(() => missDelta(.1, .1, 1, 1));
    for (let k = 1; k <= 8; k++) for (const activation of [.27, 1]) {
      const w = rule('a', k, 'b'), p = make([w]), deadline = 100 * 2 ** (k - 1) + 500;
      for (let t = 0; t <= deadline + 200; t += 100) tick(p, t, t === 0 ? [event('a', activation)] : []);
      near(w.W, calibrateWeight(.08, .1, activation));
    }
  });
  check('source guards, distinct-time exception, coincidence consumes without credit', () => {
    const labels = new Map([['a', 'sensor'], ['b', 'sensor']]);
    for (const targets of [true, false]) {
      const p = make([], labels);
      for (let t = 0; t <= 18200; t += 100) {
        tick(p, t, t === 0 ? [event('a'), ...(targets ? [event('b')] : [])] : [], [bit('b', 1)]);
        assert.equal(p.f.downward.weights.length, 0);
      }
    }
    const p = new PredictionLearning(['a', 'b'], { sourceLabels: labels });
    for (let t = 0; t <= 1700; t += 100) p.step(t,
      [0, 1000].includes(t) ? [event('a')] : [100, 1100].includes(t) ? [event('b')] : []);
    const w = p.downward.weights.find(w => w.k === 1); assert.ok(w.W > .01); assert.equal(w.deltas.miss, 0);
    const q = make([rule('a', 1, 'b', .01)], labels), ignored = q.f.downward.weights[0];
    for (let t = 0; t <= 1700; t += 100) tick(q, t,
      t === 0 ? [event('a'), event('b')] : t === 200 ? [event('b')] : t === 1000 ? [event('a')] : []);
    assert.equal(ignored.deltas.STDP, 0); assert.equal(ignored.W, 0);
    const f = new FutureSlices(['a', 'b']);
    f.update(0, [event('a')]); f.update(100, []); f.update(200, [event('a'), event('b')]); f.update(1000, []);
    assert.equal(simultaneousSource(f.past, labels, 'a', 4, 'b', 1000), false);
    f.past.entries = f.past.entries.filter(e => e.tOnset !== 0);
    assert.equal(simultaneousSource(f.past, labels, 'a', 4, 'b', 1000), true);
  });
  check('freeze advances ledgers, JSON continuation is exact, invalid windows rejected', () => {
    const p = new PredictionLearning(['a', 'b'], { downward: { weights: [rule('a', 6, 'b')] } }).freeze();
    const before = structuredClone(p.downward);
    for (let t = 0; t <= 3000; t += 100) p.step(t, t === 0 ? [event('a')] : []);
    const q = new PredictionLearning(['a', 'b']).loadState(JSON.parse(JSON.stringify(p.saveState())));
    assert.throws(() => p.step(3000, [])); assert.throws(() => p.step(3200, []));
    for (let t = 3100; t <= 3900; t += 100) for (const r of [p, q]) r.step(t, t === 3200 ? [event('b')] : []);
    assert.deepEqual(p.saveState(), q.saveState()); assert.deepEqual(p.downward, before);
    assert.equal(p.factor.predictions.length, 0); assert.equal(p.novelty.pending.length, 0);
    assert.ok(p.future.records.length > 0);
    const bad = p.saveState(); bad.novelty.pending = [{ B: 'b', tArrive: 4000, strength: 1, matched: .5 }];
    assert.throws(() => q.loadState(bad));
    assert.throws(() => q.loadState({ ...q.saveState(), schema: 2 }));
    return { windows: p.windows, records: p.future.records.length };
  });
  check('goals: binary deficits, graded pending, cancellation, recursion and same-object reverse chain', () => {
    const ids = ['motor', 'x', 'y', 'change', 'z'];
    const weights = [rule('motor', 6, 'x', .1), rule('x', 6, 'y', .1), rule('y', 6, 'change', .1), rule('z', 6, 'motor', .1)];
    const f = new FutureSlices(ids, { weights }), g = new GoalActions(f, [{ id: 'motor', action: 'press' }], ids.slice(1));
    const before = f.past.saveState(); g.goals.write('change'); const result = g.step(0, []);
    assert.deepEqual([...g.goals.entries.keys()], ['change', 'y', 'x']);
    assert.equal(Math.max(...result.written.map(l => l.depth)), 3);
    assert.equal(actionRequest(g).action, 'press');
    assert.equal(reverseLookup(f.downward, 'change')[0], weights[2]);
    assert.equal(predictedOutcomes(f.downward, 'y')[0], weights[2]);
    assert.throws(() => reverseLookup(f.downward, 'change', .29));
    const restored = new GoalActions(f, [{ id: 'motor', action: 'press' }], ids.slice(1))
      .loadState(JSON.parse(JSON.stringify(g.saveState())));
    assert.deepEqual(restored.saveState(), g.saveState());
    assert.deepEqual(actionRequest(restored), actionRequest(g));
    g.goals.cancel('change'); assert.equal(actionRequest(g).action, null); assert.equal(g.goals.entries.size, 0);
    assert.deepEqual(f.past.saveState(), before);
    const pending = [];
    for (const strength of [0, .25, .5, .75, 1]) {
      const f = new FutureSlices(['motor', 'change'], { weights: [rule('motor', 6, 'change', .1)] });
      const g = new GoalActions(f, [{ id: 'motor', action: 'press' }], ['change']); g.goals.write('change');
      const { counts, drive } = g.step(0, [], [{ B: 'change', strength }]);
      assert.equal(counts[0].M, 1); near(counts[0].effective, 1 - strength);
      near(drive[0], Math.min(1, 3 * (1 - strength) / (2 - strength)));
      pending.push({ strength, effective: counts[0].effective, drive: drive[0] });
      g.step(100, [event('change', .5)]); assert.equal(actionRequest(g).action, null);
      assert.equal(g.goals.entries.size, 0);
    }
    for (const W of [.029999, .03, .05, .1]) {
      const w = rule('motor', 6, 'change', W), f = new FutureSlices(['motor', 'change'], { weights: [w] });
      const g = new GoalActions(f, [{ id: 'motor', action: 'press' }], ['change']); g.goals.write('change'); g.step(0, []);
      assert.equal(g.rulesFor('change').length, Number(W / .1 >= .3));
      assert.equal(actionRequest(g).action, W / .1 >= .5 ? 'press' : null);
      if (W === .1) { w.W = .02; assert.equal(actionRequest(g).action, null); }
    }
    // A partial branch retains the binary deficit but smaller rule-derived drive.
    const f2 = new FutureSlices(ids, { weights: [rule('motor', 6, 'x', .06), rule('x', 6, 'change', .06)] });
    const g2 = new GoalActions(f2, [{ id: 'motor', action: 'press' }], ids.slice(1));
    g2.goals.write('change'); g2.step(0, []); assert.equal(g2.counts.find(c => c.id === 'x').M, 1);
    near(g2.motorDrive()[0], .9);
    f2.downward.weights[1] = registerConnection(f2.downward, rule('x', 6, 'change', .06));
    assert.equal(actionRequest(g2).action, null); // old descendant ownership is pruned
    return { pending, maximumDepth: 3, hypotheticalPastEntries: f.past.entries.length };
  });
  return rows;
}
