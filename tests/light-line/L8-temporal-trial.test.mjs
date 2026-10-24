import test from 'node:test';
import assert from 'node:assert/strict';
import { TemporalStack } from '../../src/light-line/temporal-stack.mjs';
import { temporalTrialGate } from '../../src/light-line/tests/L8-temporal-gate.mjs';

const pixels = (...ids) => Array.from({ length: 27 }, (_, i) => Number(ids.includes(i)));

test('actual temporal channels reach .75 at ten co-lit onsets and saturate with decreasing increments', () => {
  const stack = new TemporalStack({ seed: 101 }).freezeSnapshot();
  assert.equal(stack.parameters.lower.continuous.strengthScale, .1);
  let prior = 0, lastIncrement = 1;
  for (let n = 1; n <= 100; n++) {
    stack.observe((n - 1) * 25000, pixels(0, 1));
    stack.observe((n - 1) * 25000 + 100, pixels());
    const rho = stack.channels().upper.find(e => e.i === 0 && e.j === 1).rho;
    assert.ok(rho > prior && rho < 1);
    assert.ok(rho - prior < lastIncrement);
    if (n === 10) assert.ok(Math.abs(rho - .75) < 1e-12);
    if (n === 20) assert.ok(Math.abs(rho - .9375) < 1e-12);
    if (n === 30) assert.ok(Math.abs(rho - .984375) < 1e-12);
    lastIncrement = rho - prior; prior = rho;
  }
  assert.ok(prior > .999999);
  assert.equal(stack.presentations.length, 100, 'Blank and held time create no learning opportunities');
  stack.observe(2500000, pixels(0));
  const depressed = stack.channels().upper.find(e => e.i === 0 && e.j === 1);
  assert.ok(Math.abs(depressed.rho - prior * .96 ** stack.parameters.upper.continuous.strengthScale) < 1e-12);
  assert.equal(depressed.samples.length, 100, 'Depression adds no color samples');
  assert.deepEqual(stack.channels().lower, []);
});

function fixture({ exclusive = true, targetBrightness = .4 } = {}) {
  const brightness = (value = 0) => [1, value, 0, 0];
  return { arms: ['causal', 'shuffled', 'reverse'].map(name => ({ name,
    // A completed target field includes an extra cell; that cell must not enter membership.
    target: { selected: { values: [0, 1, 0, 0] }, field: { lit: [1, 3] } },
    probes: Array.from({ length: 20 }, (_, probe) => Array.from({ length: 9 }, (_, k) => [0, 2].map(event => ({
      probe, k, event, result: { selected: { values: exclusive ? [1, 0, 0, 0] : [0, 1, 0, 0] },
        field: { brightness: brightness(name === 'causal' && event === 0 && k === 6 ? targetBrightness : 0) } },
    })))).flat(2),
  })) };
}

test('one exclusive radiating input cell passes, with input membership and unchanged completion threshold', () => {
  const result = temporalTrialGate(fixture());
  assert.equal(result.minimumExclusiveCells, 1);
  assert.equal(result.pass, true);
  assert.deepEqual(result.metrics[0].target, [1]);
  const historical = temporalTrialGate(fixture(), 3);
  assert.equal(historical.pass, false);
  assert.equal(historical.checks.find(c => c.name === 'A@6-completion').pass, true,
    'Failed denominator must not hide independent numeric outcomes');
  const dim = temporalTrialGate(fixture({ targetBrightness: .3 }));
  assert.equal(dim.checks.find(c => c.name === 'A@6-completion').pass, false);
  assert.ok(Math.abs(dim.metrics[0].gains.find(g => g.k === 6 && g.event === 0).meanB - .3) < 1e-12);
});

test('empty exclusive denominator fails without suppressing control measurements', () => {
  const result = temporalTrialGate(fixture({ exclusive: false }));
  assert.equal(result.pass, false);
  assert.equal(result.checks[0].pass, false);
  assert.equal(result.metrics.length, 3);
  assert.equal(result.metrics[0].gains[0].rows[0].coverage, null);
});
