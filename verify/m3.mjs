import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { FEATURES, FEATURE_LINES, INPUT_LINES, activeEvents, stormWorld, stormEnv } from '../src/world.mjs';
import { advance, makePipeline, teachFeatures, weightProfile } from '../experiments/m3-pipeline.mjs';
import { AttractorLayer } from '../src/layer.mjs';

export function verifyM3() {
  const c = checker('M3 two-layer pipeline smoke'), start = performance.now();
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.message); }
  };
  test('Paired worlds preserve counts/durations and independent distractors with isolated trials', () => {
    const causal = stormWorld({ seed: 7, count: 64 });
    const shuffled = stormWorld({ seed: 7, count: 64, shuffled: true });
    assert.deepEqual(causal.trials, stormWorld({ seed: 7, count: 64 }).trials);
    assert.equal(causal.duration, shuffled.duration);
    const durations = w => FEATURES.map(g => w.events.filter(e => e.g === g).map(e => e.duration));
    assert.deepEqual(durations(causal), durations(shuffled));
    assert.deepEqual(causal.events.filter(e => e.g !== 'thunder'), shuffled.events.filter(e => e.g !== 'thunder'));
    assert.deepEqual(Object.values(FEATURE_LINES).flat(), Array.from({ length: INPUT_LINES }, (_, i) => i));
    const delays = shuffled.trials.map(t => t.events[1].start - t.events[0].start);
    assert.ok(delays.some(d => d < 0) && delays.some(d => d > 4525));
    for (const world of [causal, shuffled]) for (const [i, trial] of world.trials.entries()) {
      if (!world.shuffled) assert.equal(trial.events[1].start - trial.events[0].start, 3000);
      if (i) assert.ok(Math.min(...trial.events.map(e => e.start)) -
        Math.max(...world.trials[i - 1].events.map(e => e.start + e.duration)) >= 20000);
      for (const e of trial.events) {
        assert.ok(activeEvents(world, e.start).has(e.g));
        assert.ok(!activeEvents(world, e.start + e.duration).has(e.g));
      }
    }
    assert.throws(() => stormWorld({ count: 0 }));
  });
  test('Real P7 → onset unroll → layer 2 has lightning@6 + thunder@0 at both thunder onsets', () => {
    const teacher = teachFeatures(7), pipeline = makePipeline(teacher, 7);
    // Compact fixture retains the 3 s delay, durations and 20 s inter-trial gap.
    // Generator statistics are checked above; this test exercises neural wiring.
    const trials = [0, 25000].map((start, index) => ({ index, events: [
      { g: 'lightning', start, duration: 100 },
      { g: 'thunder', start: start + 3000, duration: 2000 },
      { g: 'bird', start: start + (index ? 1700 : 600), duration: 200 },
    ] }));
    const events = trials.flatMap(t => t.events);
    const world = { trials, events, duration: 30000, ...stormEnv(events) }, hits = new Set();
    assert.equal(pipeline.layer2.n, teacher.mapping.length * 9);
    assert.deepEqual(pipeline.unroll.ids, teacher.mapping.map(a => a.id));
    assert.deepEqual(pipeline.unroll.ids, [0, 6, 12]); // IDs are NOT flattened row indices.
    const flash = pipeline.line('lightning', 6), thunder = pipeline.line('thunder', 0);
    assert.equal(flash, 6); assert.equal(thunder, 9);
    for (const layer of [pipeline.layer1, pipeline.layer2]) for (const r of layer.replicas) {
      assert.ok(r.EE.stdp && !r.EE.frozen && !r.IE.frozen);
    }
    while (pipeline.t < world.duration) {
      const { t, lit, lines } = advance(pipeline, world);
      assert.ok(lines instanceof Float64Array); assert.equal(lines.length, 27);
      assert.ok(lines.every(x => Number.isFinite(x) && x >= 0 && x <= 1));
      for (const item of lit) assert.ok(pipeline.unroll.ids.includes(item.id));
      for (const trial of world.trials) {
        const onset = trial.events[1].start;
        if (t <= onset + 100 && t + 100 > onset && lines[flash] > 0 && lines[thunder] > 0) {
          hits.add(trial.index);
        }
      }
    }
    assert.equal(hits.size, 2);
    assert.ok(pipeline.totalN > 0 && pipeline.learningWindows > 0);
    assert.equal(pipeline.learningWindows, pipeline.t / 100); // M11e: STDP is ungated.
    assert.equal(pipeline.layer1.t, teacher.durationMs + pipeline.t);
    assert.equal(pipeline.layer2.t, pipeline.t);
    assert.ok(pipeline.layer2.replicas.every(r => r.EE.stdp.rho.every(Number.isFinite)));
    return `${hits.size}/2 onsets co-active; 18 → 3 × 9 → 27 lines; teacher ${teacher.epochs} epochs`;
  });
  test('Weight profiles pool E cells by line, count actual edges, and own their baseline', () => {
    for (const seed of [7, 19, 31]) {
      const mapping = FEATURES.map((feature, i) => ({ feature, id: i * 6 }));
      const p = makePipeline({ layer: new AttractorLayer({ n: 18, R: 1 }), mapping }, seed);
      const before = weightProfile(p, 'lightning', 'thunder');
      assert.ok(before.edgeCounts.every(n => n > 0));
      const { EE } = p.layer2.replicas[0], cells = p.layer2.cellsPerLine;
      const source = p.line('lightning', 6), target = p.line('thunder', 0);
      const k = [...EE.pre.keys()].find(k => Math.floor(EE.pre[k] / cells) === source &&
        Math.floor(EE.post[k] / cells) === target);
      assert.notEqual(k, undefined);
      EE.stdp.rho[k] = 0.8;
      const after = weightProfile(p, 'lightning', 'thunder');
      assert.ok(Math.abs((after.rho[6] - before.rho[6]) * before.edgeCounts[6] - 0.79) < 1e-12);
      assert.ok(before.rho.every(x => Math.abs(x - 0.01) < 1e-12));
      assert.ok(after.rho.every((x, col) => col === 6 || x === before.rho[col]));
    }
  });
  test('M3 smoke finishes within 20 seconds', () => {
    const elapsed = (performance.now() - start) / 1000;
    assert.ok(elapsed < 20, `${elapsed.toFixed(2)} s`); return `${elapsed.toFixed(2)} s`;
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyM3() ? 0 : 1;
}
