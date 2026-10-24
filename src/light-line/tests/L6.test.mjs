import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionPipeline } from '../action-pipeline.mjs';
import { OutputLayer } from '../output.mjs';
import { BodyInput } from '../body-input.mjs';
import { ActionTemporal } from '../action-temporal.mjs';
import { twoQuantities, TWO_DECLARATIONS } from '../envs/two-quantities.mjs';

test('cold motor .75 execution, held suppression, weaker output and action-order ties', () => {
  const motor = new OutputLayer(['first', 'second'], 101);
  assert.equal(motor.step([.75, 0]).action, 'first');
  assert.equal(motor.step([.75, 0]).action, null);
  assert.equal(motor.step([.749, 0]).action, null);
  assert.equal(motor.step([.001, 0]).action, null);
  // Actual observations form both maps; ties follow declaration order.
  motor.step([0, 1]); motor.stream.freeze();
  assert.equal(motor.step([1, 1]).action, 'first');
});

test('only a sent onset reaches the action-copy and future past', () => {
  const calls = [];
  const env = { features: ['signal'], actions: ['go'], step(ms, action) {
    if (action) calls.push(action); return { features: {} };
  } };
  const p = new ActionPipeline(env, 101, { innate: false });
  const a = p.step([.75]), b = p.step([.75]), c = p.step([.749]);
  assert.deepEqual(calls, ['go']); assert.equal(a.copy.length, 1);
  assert.equal(b.copy.length + c.copy.length, 0);
  assert.equal(p.learning.future.past.entries.filter(e => e.id === 'action:go').length, 1);
});

test('raw body readings cannot create decoded evidence without an optical catalogue', () => {
  const body = new BodyInput([{ name: 'x', min: -5, max: 5, setpoint: 0 }], 101);
  body.streams[0].freeze();
  for (const [i, x] of [-4, 4].entries()) {
    const result = body.window([{ readings: { x }, durationMs: 100 }], i * 100);
    assert.deepEqual(result.observations, []);
  }
});

test('second adapter retains independent quantities and exact physical effects', () => {
  assert.deepEqual(TWO_DECLARATIONS, [
    { name: 'pressure', min: -10, max: 10, setpoint: 0, bins: 4 },
    { name: 'charge', min: 0, max: 200, setpoint: 150, bins: 5 },
  ]);
  const env = twoQuantities();
  assert.deepEqual(env.step(100, 'pump').interoception, { pressure: -3, charge: 30 });
  assert.deepEqual(env.step(100, 'connect').interoception, { pressure: -3.002, charge: 69.98 });
  assert.throws(() => new ActionTemporal(Array.from({ length: 28 }, (_, i) => i), 101), /capacity/);
});
