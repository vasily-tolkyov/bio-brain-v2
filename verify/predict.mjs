import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { TimeUnroll } from '../src/unroll.mjs';
import { FutureSlices, readDownward } from '../src/predict.mjs';
import { DOWNWARD } from '../src/downward.mjs';

const ids = ['a', 'b', 'c'];
const rule = (A, k, B, W) => ({ A, k, B, W: W * DOWNWARD.wMax, ruleKey: JSON.stringify([A, k, B]) });
const downward = weights => ({ weights });
const prediction = (k = 8) => ({ A: 'a', B: 'b', k, strength: 0.8, activation: 1, tOnset: 0,
  tArrive: 100 * 2 ** (k - 1), createdAt: 0, generation: 1, ruleKey: JSON.stringify(['a', k, 'b']) });
const lit = (id, strength = 1) => ({ id, strength });

export function verifyPredict() {
  const c = checker('M4 downward prediction');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.stack); }
  };
  test('All reachable future bin boundaries mirror TimeUnroll, including the strict now boundary', () => {
    const f = new FutureSlices(ids); f.push(prediction());
    const past = new TimeUnroll(ids).update(0, [lit('b', 0.8)]);
    for (let k = 1; k <= 8; k++) {
      const boundary = 100 * 2 ** (k - 1) / Math.SQRT2;
      for (const remaining of [boundary - 1e-8, boundary, boundary + 1e-8, 100 * 2 ** (k - 1)]) {
        const t = 12800 - remaining, actualRemaining = 12800 - t;
        // Subtracting the two clocks can round a boundary; compare the actual remainder.
        assert.deepEqual(f.lines(t), past.lines(actualRemaining));
      }
    }
    const edge = 100 / Math.SQRT2;
    // Choose clocks whose subtraction represents the exact boundary.
    const exact = new FutureSlices(ids);
    exact.t = edge; exact.past.t = edge;
    exact.push({ ...prediction(1), tOnset: edge, tArrive: edge + 100 });
    const tBoundary = exact.entries[0].tArrive - edge;
    assert.equal(exact.entries[0].tArrive - tBoundary, edge);
    exact.update(tBoundary, []);
    assert.equal(exact.arrivals.length, 0);
    assert.equal(exact.lines()[10], 0.8);
    exact.update(tBoundary + 1e-8, []);
    assert.equal(exact.arrivals.length, 1);
    assert.equal(exact.entries.length, 0);
    assert.equal(exact.lines()[9], 0.8);
    exact.update(200, []);
    assert.equal(exact.arrivals.length, 0);
    assert.ok(exact.lines().every(x => x === 0));
  });
  test('Directed multi-cell/multi-replica means pool signed gains and exclude reverse, now and self edges', () => {
    const cell = (row, col, member = 0) => 11 + (row * 9 + col) * 2 + member;
    const pairs = [[cell(0, 6), cell(1, 0)], [cell(0, 6, 1), cell(1, 0, 1)],
      [cell(1, 0), cell(0, 6)], [cell(0, 6), cell(0, 0)], [cell(0, 0), cell(1, 0)],
      [cell(2, 2), cell(1, 0)]];
    const replicas = [0.3, 0.1].map(gain => ({ E: 11, EE: {
      pre: pairs.map(p => p[0]), post: pairs.map(p => p[1]),
      stdp: { rho: [0.1 + gain, 0, 0.9, 0.9, 0.9, 0.14] } } }));
    const baseline = replicas.map(() => Array(pairs.length).fill(0.1));
    const layer = { n: 27, cellsPerLine: 2, replicas }, before = structuredClone(layer);
    const down = readDownward(layer, baseline, ids);
    assert.equal(down.weights.length, 2);
    const w = down.weights.find(w => w.A === 'a');
    assert.equal(w.B, 'b'); assert.equal(w.k, 6); assert.equal(w.edges, 4);
    assert.ok(Math.abs(w.W - 0.05) < 1e-12);
    assert.deepEqual(layer, before);
    assert.deepEqual(baseline, replicas.map(() => Array(pairs.length).fill(0.1)));
    assert.throws(() => readDownward(layer, [[]], ids));
  });
  test('Every positive weight predicts proportionally, independent of other weights', () => {
    for (const W of [1e-9, 0.01, 0.1, 0.8]) {
      const down = downward([rule('a', 6, 'b', W), rule('b', 2, 'c', 1)]);
      const f = new FutureSlices(ids, down).update(0, [lit('a', 0.7)]);
      assert.equal(f.created.length, 1);
      assert.ok(Math.abs(f.created[0].strength - 0.7 * W) < 1e-12);
      down.weights[0].W = W / 2 * DOWNWARD.wMax;
      f.update(100, []); f.update(200, [lit('a', 0.7)]);
      assert.equal(f.created.length, 1);
      if (f.created.length) assert.ok(Math.abs(f.created[0].strength - 0.7 * W / 2) < 1e-12);
    }
  });
  test('An observed onset triggers all qualifying rules, retains source, and arrives at 3200 ms', () => {
    const f = new FutureSlices(ids, downward([rule('a', 6, 'b', 0.2), rule('b', 2, 'c', 0.4)]));
    f.update(0, [lit('a', 0.8)]);
    assert.deepEqual(f.created, [{ ...prediction(6), strength: 0.8 * 0.2, activation: 0.8 }]);
    assert.equal(f.lines()[9 + 6], 0.8 * 0.2);
    for (let t = 100; t <= 3100; t += 100) {
      f.update(t, [lit('a')]);
      assert.equal(f.created.length, 0); assert.equal(f.arrivals.length, 0);
    }
    f.update(3200, []);
    assert.equal(f.arrivals.length, 1); assert.equal(f.lines()[9], 0.8 * 0.2);
    assert.equal(f.entries.length, 0);
    f.update(3300, []);
    const record = f.records.find(r => r.B === 'b');
    assert.equal(record.t, 3200); assert.equal(record.predStrength, 0.8 * 0.2);
    assert.equal(record.realStrength, 0); assert.equal(record.entries[0].k, 6);
    assert.equal(f.created.length, 0); // Predicted B never creates a B -> C onset.
    assert.ok(f.past.entries.every(e => e.id === 'a'));
    f.update(3400, [lit('a')]);
    assert.equal(f.created.length, 1); // A fresh observed rising edge can trigger again.
  });
  test('Tiny onsets and weights remain graded with no prediction cutoff', () => {
    const f = new FutureSlices(ids, downward([rule('a', 1, 'b', 1e-9)]));
    f.update(0, [lit('a', 0.001)]);
    assert.equal(f.created[0].strength, 0.001 * 1e-9);
  });
  test('Absent connections and self exclusion skip predictions; zero store entries are rejected', () => {
    const f = new FutureSlices(ids, downward([rule('a', 6, 'a', 0.9)]));
    assert.throws(() => new FutureSlices(ids, downward([rule('a', 1, 'b', 0)])));
    f.update(0, [lit('a')]);
    assert.equal(f.created.length, 0);
    assert.throws(() => f.push({ ...prediction(), B: 'a' }));
    assert.ok(new FutureSlices(ids).update(0, [lit('a')]).lines().every(x => x === 0));
    assert.throws(() => new FutureSlices(ids, downward([rule('a', 1, 'b', NaN)])));
    assert.throws(() => new FutureSlices(ids, downward([rule('a', 1, 'b', -1)])));
  });
  test('Colliding predictions use max, retain both sources, and compare with P7 in either adjacent window', () => {
    for (const offset of [-100, 0, 100]) {
      const f = new FutureSlices(ids, downward([rule('a', 6, 'b', 0.4), rule('c', 6, 'b', 0.4)]));
      f.update(0, [lit('a', 0.4), lit('c', 0.8)]);
      assert.equal(f.entries.length, 2); assert.equal(f.lines()[15], 0.8 * 0.4);
      for (let t = 100; t <= 3400; t += 100) f.update(t, t === 3200 + offset ? [lit('b', 0.7)] : []);
      const records = f.records.filter(r => r.B === 'b');
      assert.equal(records.length, 1); assert.equal(records[0].t, 3200);
      assert.equal(records[0].predStrength, 0.8 * 0.4); assert.equal(records[0].realStrength, 0.7);
      assert.equal(records[0].entries.length, 2);
      assert.deepEqual(records[0].entries.map(e => e.A), ['a', 'c']);
    }
  });
  test('Unpredicted reality is recorded; full sub-lit P7 remains available without creating onsets', () => {
    const f = new FutureSlices(ids, downward([rule('a', 1, 'b', 0.2)]));
    f.update(0, [lit('a')]); f.update(100, [], [lit('b', 0.2)]);
    assert.ok(!f.records.some(r => r.B === 'b')); // Wait for the +1 window.
    f.update(200, []); f.update(300, [lit('c', 0.6)]); f.update(400, []);
    assert.deepEqual(f.records.filter(r => r.predStrength === 0).map(r => r.B), ['a', 'c']);
    assert.equal(f.records.find(r => r.B === 'b').realStrength, 0.2);
    assert.ok(!f.past.entries.some(e => e.id === 'b'));
  });
  test('JSON round trip preserves pending comparisons, source entries, weights and onset detection', () => {
    const a = new FutureSlices(ids, downward([rule('a', 6, 'b', 0.2), rule('c', 1, 'b', 0.1)]));
    a.update(0, [lit('a'), lit('c', 0.7)]); a.update(100, [lit('a')]);
    const saved = JSON.parse(JSON.stringify(a.saveState()));
    const b = new FutureSlices(ids).loadState(saved);
    saved.entries[0].strength = 0; saved.downward.weights[0].W = 0;
    assert.deepEqual(b.saveState(), a.saveState());
    for (let t = 200; t <= 3400; t += 100) {
      const input = t === 3300 ? [lit('b', 0.6)] : [];
      a.update(t, input); b.update(t, input);
      assert.deepEqual(b.saveState(), a.saveState()); assert.deepEqual(b.lines(), a.lines());
    }
    assert.throws(() => new FutureSlices(['b', 'a', 'c']).loadState(a.saveState()));
    assert.throws(() => b.update(3400, []));
    assert.throws(() => b.update(3500, [lit('unknown')]));
    assert.deepEqual(b.saveState(), a.saveState());
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyPredict() ? 0 : 1;
}
