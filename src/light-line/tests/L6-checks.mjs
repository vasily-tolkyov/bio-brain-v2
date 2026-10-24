import assert from 'node:assert/strict';
import { BodyInput } from '../body-input.mjs';
import { BodyChanges } from '../body-changes.mjs';
import { bodyVariables } from '../interoception.mjs';
import { FutureSlices } from '../predict.mjs';
import { ThreeFactor } from '../three-factor.mjs';
import { upwardDrive } from '../goals.mjs';
import { ActionTemporal } from '../action-temporal.mjs';

export function boundaryChecks(seed, optics) {
  const declarations = [{ name: 'energy', min: 0, max: 100, setpoint: 70, bins: 5 }];
  const blank = new BodyInput(declarations, seed);
  blank.streams.forEach(s => s.freeze());
  const blankRows = [10, 30, 50, 70, 90].map((energy, i) => blank.window([{ readings: { energy }, durationMs: 100 }], i * 100));
  assert.ok(blankRows.every(r => !r.bins.length && !r.changes.length), 'Raw reading bypass');
  const body = new BodyInput(declarations, seed, optics.body.map(s => s.fork()));
  const rows = [30, 30, 70, 70].map((energy, i) => body.window([{ readings: { energy }, durationMs: 100 }], i * 100));
  assert.equal(rows[2].changes[0].id, 'change:0:rise:2');
  assert.equal(body.changes.events[0].age, 100);
  const variables = bodyVariables(declarations), stale = new BodyChanges(variables);
  stale.update(0, [{ id: 'body:0:1', strength: 1 }]);
  stale.update(100, []);
  assert.deepEqual(stale.update(600, [{ id: 'body:0:3', strength: 1 }]), []);
  assert.equal(stale.events.length, 0); assert.equal(stale.rejected.length, 1);
  const A = 'body:0:3', B = 'change:0:rise:2', labels = new Map([[A, 'energy'], [B, 'energy']]);
  const cases = [];
  for (const kind of ['same-time', 'missing-target', 'distinct-time']) {
    const future = new FutureSlices([A, B]);
    future.update(0, [{ id: A, strength: 1 }, ...(kind === 'same-time' ? [{ id: B, strength: 1 }] : [])]);
    future.update(100, kind === 'distinct-time' ? [{ id: B, strength: 1 }] : []);
    const factor = new ThreeFactor(future, labels);
    factor.step(100, [{ kind: 'novelty', id: B, N: 1 }], []);
    const count = future.downward.weights.length;
    assert.equal(count, Number(kind === 'distinct-time'));
    cases.push({ kind, connections: structuredClone(future.downward.weights), past: future.past.saveState() });
  }
  const threshold = [.029999999, .03].map(W => ({ W, drive: Array.from(upwardDrive({ weights: [{ A: 'a', B: 'b', W }] },
    [{ id: 'a' }], [{ id: 'b', effective: 1 }])) }));
  assert.equal(threshold[0].drive[0], 0); assert.ok(Math.abs(threshold[1].drive[0] - .45) < 1e-12);
  assert.throws(() => new ActionTemporal(Array.from({ length: 28 }, (_, i) => i), seed), /capacity/);
  return { pass: true, blankRows, decodedRows: rows, bodyEvents: body.changes.events,
    rejected: stale.rejected, sourceGuards: cases, threshold, capacityReject: true };
}
