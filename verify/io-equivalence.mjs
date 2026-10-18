/** Compare the pre-M8 event-boundary presenter with the fixed IO path. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { learnWindow } from '../src/learning.mjs';
import { checker } from '../src/core/check.mjs';
import { stormEnv, featureInput, activeEvents } from '../src/world.mjs';
import { advance, makePipeline, teachFeatures, discardHistory } from '../experiments/m3-pipeline.mjs';

export function verifyIOEquivalence() {
  const c = checker('M8 deterministic storm equivalence');
  const events = [{ g: 'lightning', start: 23.5, duration: 100 },
    { g: 'thunder', start: 3023.5, duration: 2000 }, { g: 'bird', start: 760.5, duration: 200 }];
  const old = makePipeline(teachFeatures(7), 7), current = makePipeline(teachFeatures(7), 7);
  const env = stormEnv(events);
  try {
    while (current.t < 5400) {
      const t = old.t, start = old.layer1.t, boundaries = new Set([t, t + 100]);
      for (const e of events) for (const at of [e.start, e.start + e.duration]) {
        if (at > t && at < t + 100) boundaries.add(at);
      }
      const times = [...boundaries].sort((a, b) => a - b);
      for (let i = 0; i < times.length - 1; i++) old.layer1.run(times[i + 1] - times[i],
        featureInput(activeEvents({ events }, times[i])));
      const lit = old.layer1.readout(start), { lines } = learnWindow(old, lit);
      discardHistory(old.layer1); discardHistory(old.layer2); old.t += 100;
      assert.deepEqual(advance(current, env), { t, lit, lines });
    }
    for (const key of ['layer1', 'layer2']) assert.deepEqual(
      current[key].replicas.map(r => r.net.saveState()), old[key].replicas.map(r => r.net.saveState()));
    assert.deepEqual(current.errors.saveState(), old.errors.saveState());
    assert.deepEqual(current.unroll.saveState(), old.unroll.saveState());
    assert.equal(current.gate.value, old.gate.value);
    c.check('54 windows: P7, unroll, full networks, RNG, weights, N/M and gate match exactly', true);
  } catch (e) { c.check('Pre-M8 versus env interface', false, e.message); }
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyIOEquivalence() ? 0 : 1;
}
