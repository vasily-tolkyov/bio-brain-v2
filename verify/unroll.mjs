import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { TimeUnroll } from '../src/unroll.mjs';

function expectLines(unroll, t, cells) {
  const actual = unroll.lines(t), expected = new Float64Array(actual.length);
  for (const [index, column, strength] of cells) expected[index * 9 + column] = strength;
  assert.ok(actual instanceof Float64Array);
  assert.deepEqual(actual, expected);
}

export function verifyUnroll() {
  const c = checker('M2 onset time unrolling');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.message); }
  };
  test('Onsets occupy exactly one half-open log bin, including every boundary', () => {
    const u = new TimeUnroll(1).update(0, [{ id: 0, strength: 0.7 }]);
    expectLines(u, 0, [[0, 0, 0.7]]);
    expectLines(u, 150, [[0, 2, 0.7]]);
    expectLines(u, 3000, [[0, 6, 0.7]]);
    for (let column = 1; column <= 8; column++) {
      const center = 100 * 2 ** (column - 1), boundary = center / Math.SQRT2;
      expectLines(u, boundary - boundary * Number.EPSILON, [[0, column - 1, 0.7]]);
      expectLines(u, boundary, [[0, column, 0.7]]);
      expectLines(u, boundary + boundary * Number.EPSILON, [[0, column, 0.7]]);
      expectLines(u, center, [[0, column, 0.7]]);
      expectLines(u, center * Math.SQRT2, column === 8 ? [] : [[0, column + 1, 0.7]]);
    }
  });
  test('Sustained lighting retains one onset and its original strength, even after expiry', () => {
    const u = new TimeUnroll(1).update(0, [{ id: 0, strength: 0.4 }]);
    for (let t = 100; t <= 1000; t += 100) u.update(t, [{ index: 0, strength: 0.9 }]);
    assert.equal(u.saveState().entries.length, 1);
    expectLines(u, 1000, [[0, 4, 0.4]]);
    u.update(20000, [{ id: 0, strength: 1 }]);
    expectLines(u, 20000, []);
    assert.equal(u.saveState().entries.length, 0);
    u.update(20100, []).update(20200, [{ id: 0, strength: 0.6 }]);
    expectLines(u, 20200, [[0, 0, 0.6]]);
  });
  test('Two onsets five seconds apart coexist; collisions use max and preserve both entries', () => {
    for (const strengths of [[0.8, 0.3], [0.3, 0.8]]) {
      const u = new TimeUnroll(1).update(0, [{ id: 0, strength: strengths[0] }]);
      u.update(100, []).update(5000, [{ id: 0, strength: strengths[1] }]);
      expectLines(u, 5000, [[0, 7, strengths[0]], [0, 0, strengths[1]]]);
      expectLines(u, 15000, [[0, 8, 0.8]]);
      // The first onset expires independently, exposing the surviving strength.
      expectLines(u, 12800 * Math.SQRT2, [[0, 8, strengths[1]]]);
      assert.equal(u.saveState().entries.length, 2);
    }
    const u = new TimeUnroll(1).update(0, [{ id: 0, strength: 0.9 }]);
    u.update(100, []).update(200, [{ id: 0, strength: 0.4 }]);
    expectLines(u, 1000, [[0, 4, 0.9]]);
    expectLines(u, 1200, [[0, 5, 0.9], [0, 4, 0.4]]);
  });
  test('Expiry is exact and updates prune expired entries', () => {
    const u = new TimeUnroll(1).update(0, [{ id: 0, strength: 1 }]);
    const expiry = 12800 * Math.SQRT2;
    expectLines(u, expiry - expiry * Number.EPSILON, [[0, 8, 1]]);
    expectLines(u, expiry, []);
    expectLines(u, expiry + 1, []);
    u.update(expiry, []);
    assert.deepEqual(u.saveState().entries, []);
  });
  test('ID order and explicit indices flatten as attrIndex * 9 + column', () => {
    const u = new TimeUnroll([42, 7, 'third']);
    u.update(0, [{ id: 7, strength: 0.2 }, { index: 2, strength: 1 }]);
    u.update(100, [{ id: 42, strength: 0.6 }]);
    assert.equal(u.lines(100).length, 27);
    expectLines(u, 100, [[0, 0, 0.6], [1, 1, 0.2], [2, 1, 1]]);
    const lines = u.lines(100); lines.fill(1);
    expectLines(u, 100, [[0, 0, 0.6], [1, 1, 0.2], [2, 1, 1]]);
  });
  test('JSON save/load preserves mapping, independent onsets and previous lighting', () => {
    const a = new TimeUnroll(['a', 'b']).update(0, [{ id: 'a', strength: 0.8 }]);
    a.update(100, []).update(5000, [{ id: 'a', strength: 0.3 }, { id: 'b', strength: 1 }]);
    const saved = JSON.parse(JSON.stringify(a.saveState()));
    const b = new TimeUnroll(['a', 'b']).loadState(saved);
    saved.entries[0].strength = 0;
    assert.deepEqual(b.saveState(), a.saveState());
    for (const [t, lit] of [[5100, [{ id: 'a', strength: 1 }]], [5200, []],
      [5300, [{ id: 'a', strength: 0.6 }]], [20000, []]]) {
      a.update(t, lit); b.update(t, lit);
      assert.deepEqual(b.lines(t), a.lines(t));
      assert.deepEqual(b.saveState(), a.saveState());
    }
    assert.throws(() => new TimeUnroll(['b', 'a']).loadState(a.saveState()));
  });
  test('Invalid inputs fail before changing onset state', () => {
    const u = new TimeUnroll([7]).update(100, [{ id: 7, strength: 0.5 }]);
    const before = u.saveState();
    for (const item of [{ id: 8, strength: 1 }, { index: 1, strength: 1 },
      { id: 7, strength: NaN }, { id: 7, strength: -1 }, { id: 7, strength: 1.1 }]) {
      assert.throws(() => u.update(200, [item]));
    }
    assert.throws(() => u.update(99, []));
    assert.throws(() => u.lines(Infinity));
    assert.throws(() => u.loadState({ ...before, entries: [{ id: 7, strength: 2, tOnset: 0 }] }));
    assert.deepEqual(u.saveState(), before);
    assert.throws(() => new TimeUnroll([7, 7]));
    assert.throws(() => new TimeUnroll(-1));
  });
  test('60 s at 100 ms steps, including flattening, takes less than 50 ms', () => {
    const u = new TimeUnroll(24);
    const lit = Array.from({ length: 24 }, (_, id) => ({ id, strength: (id + 1) / 24 }));
    const start = performance.now();
    for (let t = 0; t < 60000; t += 100) {
      u.update(t, t % 200 === 0 ? lit : []);
      u.lines(t);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `${elapsed.toFixed(2)} ms`);
    return `${elapsed.toFixed(2)} ms (24 attractors, alternating on/off windows)`;
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyUnroll() ? 0 : 1;
}
