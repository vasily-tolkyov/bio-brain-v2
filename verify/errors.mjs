import { DOWNWARD } from '../src/downward.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { SpikingNetwork } from '../src/network.mjs';
import { ERRORS, SpikingErrors, effectiveMiss, effectiveNovelty, restCount } from '../src/errors.mjs';
import { FutureSlices } from '../src/predict.mjs';
import { SurpriseGate } from '../src/three-factor.mjs';
import { makeRng } from '../src/core/rng.mjs';
import { restRecorder, predictionCounts, summarizeRest } from '../experiments/m5-statistics.mjs';
import { calibrationRate, calibrationConverged, MATCHED_OFFSETS, PROTOCOL } from '../experiments/m5-probe.mjs';
import { restDrift } from '../experiments/m5-rest-audit.mjs';

const weights = e => e.net.groups.map(g => [...g.scale]);
function poisson(lambda, rng) {
  let k = 0, product = rng.uniform();
  while (product > Math.exp(-lambda)) { k++; product *= rng.uniform(); }
  return k;
}
// Short synthetic schedule exercises the full tolerance span without layer learning.
function trial(e, onset, learn = false, predict = true, strength = 1) {
  const start = e.t === null ? 0 : e.t + 100, windows = [];
  for (let offset = 0; offset < 3000; offset += 100) {
    const [r] = e.step(start + offset, [offset === onset ? strength : 0],
      offset === 0 && predict ? [{ B: e.ids[0], tArrive: start + 600, strength }] : [], { learn });
    windows.push([r]);
  }
  return predictionCounts(windows, [{ B: e.ids[0], tArrive: start + 600 }])[0];
}

export function verifyErrors() {
  const c = checker('M5 spiking N/M errors');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.stack); }
  };
  const e = new SpikingErrors(['arbitrary-id'], 7), initial = weights(e);
  test('Analytic N/M deadbands use the population rest count over each read span', () => {
    assert.equal(restCount(100), 1.5);
    assert.equal(restCount(1100), 16.5);
    const boundary = 3 * Math.sqrt(1.5);
    assert.equal(effectiveMiss(-1.5), 0);
    assert.equal(effectiveMiss(boundary), 0);
    assert.ok(Math.abs(effectiveMiss(boundary + 2) - 2) < 1e-12);
    for (const duration of [100, 1100]) {
      const limit = 3 * Math.sqrt(restCount(duration));
      assert.equal(effectiveNovelty(-restCount(duration), duration), 0);
      assert.equal(effectiveNovelty(limit, duration), 0);
      assert.ok(Math.abs(effectiveNovelty(limit + 2, duration) - 2) < 1e-12);
    }
    assert.equal(ERRORS.slowDecayMs, ERRORS.toleranceMs);
    assert.equal(e.rows[0].Minh.istdp.tauPre, ERRORS.slowDecayMs);
  });
  test('Calibration reaches joint N/M silence in at least 90 of the last 100 full-span matches', () => {
    const history = [];
    for (let i = 0; i < PROTOCOL.matchedTrials; i++) {
      assert.equal(calibrationRate(e, i + 1), ERRORS.eta / Math.sqrt(i + 1));
      const r = trial(e, 600 + MATCHED_OFFSETS[i % MATCHED_OFFSETS.length], true);
      history.push({ qualified: r.nearRest });
    }
    const qualified = history.filter(t => t.qualified).length;
    assert.ok(calibrationConverged(history), `${qualified}/100 jointly silent`);
    assert.equal(calibrationConverged(history.slice(1)), false);
    assert.equal(calibrationConverged(Array.from({ length: 100 }, (_, i) => ({ qualified: i < 89 }))), false);
    assert.equal(calibrationConverged(Array.from({ length: 100 }, (_, i) => ({ qualified: i < 90 }))), true);
    assert.notDeepEqual(weights(e), initial);
    assert.ok(e.rows[0].Ninh.scale[0] > initial[2][0]);
    // Consumed D is silent, so the existing excitatory-afferent gate freezes M iSTDP.
    assert.deepEqual([...e.rows[0].Minh.scale], initial[3]);
    return `${qualified}/100 matched trials have Neff=Meff=0; all 11 offsets covered`;
  });
  test('Frozen synthetic probes distinguish unexpected, matched, missed and resting inputs', () => {
    const before = weights(e);
    const matched = trial(e, 600), early = trial(e, 100), late = trial(e, 1100);
    const unexpected = trial(e, 600, false, false), missed = trial(e, -1);
    const rest = trial(e, -1, false, false);
    for (const r of [matched, early, late, rest]) assert.ok(r.nearRest, JSON.stringify(r));
    assert.ok(unexpected.Neff >= 10 && unexpected.Neff >= 5 * matched.Neff);
    assert.ok(missed.Meff >= 10 && missed.Meff >= 5 * matched.Meff);
    assert.deepEqual(weights(e), before);
    return `matched N/M=${matched.N}/${matched.M}; unexpected N=${unexpected.N}, missed M=${missed.M}`;
  });
  test('Weak 0.1 omission and unpredicted reality both exceed rest noise', () => {
    // Read only the stimulus window, so idle-window fluctuations cannot pass this.
    const weak = new SpikingErrors(['x'], 19), totals = { N: 0, M: 0 };
    for (let n = 0; n < 10; n++) for (let offset = 0; offset < 3000; offset += 100) {
      const start = n * 3000;
      const [r] = weak.step(start + offset, [offset === 2100 ? 0.1 : 0],
        offset === 0 ? [{ B: 'x', tArrive: start + 600, strength: 0.1 }] : []);
      if (offset === 1100) totals.M += r.M;
      if (offset === 2100) totals.N += r.N;
    }
    assert.ok(totals.M / 10 >= 2 && totals.N / 10 >= 2, JSON.stringify(totals));
    return `active-window mean N/M=${totals.N / 10}/${totals.M / 10}`;
  });
  const resting = new SpikingErrors(['a', 'b', 'c'], 7), restWindows = [];
  test('Independent tonic rest is near target, without triplet bursts or recurrence', () => {
    const rec = restRecorder(resting, 30000), before = weights(resting);
    for (let t = 0; t < 30000; t += 100) {
      const counts = resting.step(t, [0, 0, 0], [], { learn: true });
      for (const c of counts) {
        assert.equal(c.N, c.Nraw - ERRORS.targetHz * ERRORS.cells * 0.1);
        assert.equal(c.M, c.Mraw - ERRORS.targetHz * ERRORS.cells * 0.1);
      }
      restWindows.push(counts); rec.record();
    }
    const stats = summarizeRest([{ kind: 'rest', duration: 30000, populations: rec.finish() }]);
    assert.ok(stats.every(p => Math.abs(p.meanHz - ERRORS.targetHz) < 0.3 && p.burstsPerSecond === 0 && p.fano <= 1.5));
    assert.deepEqual(weights(resting), before);
    assert.ok(resting.net.groups.every(g => g.sources.every(i => resting.net.source[i])));
    return stats.map(p => `${p.id}:${p.kind}=${p.meanHz.toFixed(3)} Hz`).join(', ');
  });
  test('Tonic rest opens the analytic three-SD surprise gate in under 1% of windows', () => {
    const gate = new SurpriseGate();
    const opened = restWindows.filter(counts => gate.step(counts)).length;
    assert.ok(opened / restWindows.length < 0.01, `Rest opened gate ${opened}/${restWindows.length} windows`);
    return `${opened}/${restWindows.length} windows`;
  });
  test('Strengthening-only rest drift stays within Poisson noise at W=0.1 and 0', () => {
    for (const seed of [7, 19, 31]) {
      const rng = makeRng(seed), lambda = ERRORS.targetHz * ERRORS.cells * 0.1;
      const windows = Array.from({ length: 3000 }, () => resting.ids.map(id =>
        ({ id, N: poisson(lambda, rng) - lambda, M: poisson(lambda, rng) - lambda })));
      const samples = windows.flatMap(w => w.flatMap(c => [c.N, c.M]));
      assert.ok(Math.abs(samples.reduce((a, b) => a + b, 0)) < 3 * Math.sqrt(samples.length * lambda));
      for (const d of restDrift(windows)) assert.ok(d.pass, JSON.stringify({ ...d, trajectory: undefined }));
    }
    for (const d of restDrift(restWindows)) assert.ok(d.pass, JSON.stringify({ ...d, trajectory: undefined }));
  });
  test('Silent excitatory afferents freeze iSTDP despite inhibitory spikes and residual postsynaptic traces', () => {
    const gated = new SpikingErrors(['x'], 31), row = gated.rows[0];
    // Seed an above-target post trace so an ungated pre event would change weights
    // despite the nonzero target. Idle weights alone cannot detect a missing gate.
    row.Ninh.y.fill(2); row.Minh.y.fill(2);
    const before = weights(gated);
    gated.step(0, [0], [{ B: 'x', tArrive: 500, strength: 1 }], { learn: true });
    assert.ok(row.P.some(cell => gated.net.spikes[cell].length > 0));
    assert.deepEqual(weights(gated), before);
    row.Minh.y.fill(2);
    const oldM = [...row.Minh.scale];
    gated.step(100, [1], [], { learn: true });
    assert.ok(row.R.some(cell => gated.net.spikes[cell].length > 0));
    assert.deepEqual([...row.Minh.scale], oldM);
    assert.ok(row.Minh.x.some(x => x > 0)); // Gating preserves eligibility traces.
    assert.notDeepEqual([...row.Ninh.scale], before[2]); // Its afferent is now active.
    assert.ok(row.Ninh.R[row.P[0]] > 0.4, 'Fast STD must retain substantial resources');
  });
  test('Future creation retains provenance through inclusive expectation/deadline windows', () => {
    const w = { A: 'a', B: 'b', k: 6, W: DOWNWARD.wMax, ruleKey: '["a",6,"b"]' };
    const f = new FutureSlices(['a', 'b'], { weights: [w] });
    const net = new SpikingErrors(['a', 'b'], 19);
    let deadlineSpikes = 0, maxRest = 0;
    for (let t = 0; t <= 3900; t += 100) {
      f.update(t, t === 0 ? [{ id: 'a', strength: 1 }] : []);
      const lines = f.past.lines(t);
      const [a, b] = net.step(t, [lines[0], lines[9]], f.created);
      assert.equal(b.prediction, t >= 2700 && t <= 3700 ? 1 : 0);
      assert.equal(b.deadline, t === 3700 ? 1 : 0);
      if (t < 3700) maxRest = Math.max(maxRest, b.M);
      if (t === 3700) deadlineSpikes = b.M;
      for (const r of [a, b]) {
        assert.equal(r.N, r.Nraw - 1.5);
        assert.equal(r.M, r.Mraw - 1.5);
      }
      if (t === 3300) {
        assert.equal(f.entries.length, 0); assert.equal(net.pending[0].ruleKey, w.ruleKey);
        assert.equal(net.pending[0].tArrive, 3200);
      }
    }
    assert.ok(deadlineSpikes >= 10 && deadlineSpikes > maxRest); assert.equal(net.pending.length, 0);
    assert.equal(ERRORS.toleranceMs, 500);
    assert.throws(() => net.step(4100, [0, 0])); // No silent skipped dynamics.
    assert.throws(() => net.step(4000, [0, NaN]));
  });
  test('Slow inhibitory conductance persists, never excites, and round-trips with its reversal', () => {
    const make = (E = -75) => {
      const net = new SpikingNetwork({ dt: 0.5, pops: [{ name: 'X', n: 1, source: true }, { name: 'M', n: 1 }] });
      net.connect({ from: 'X', to: 'M', kind: 'slow', E, tauR: 5, tauD: 500,
        tauRec: 5, contacts: 10, scale: 5 });
      return net;
    };
    const a = make();
    a.run(100, { rate: i => i === 0 ? 120 : 0 });
    a.run(500);
    assert.ok(a.V[1] < -65 && a.V[1] >= -75); assert.equal(a.spikes[1].length, 0);
    const saved = JSON.parse(JSON.stringify(a.saveState())), b = make().loadState(saved);
    a.run(100); b.run(100);
    assert.deepEqual(a.saveState(), b.saveState());
    assert.throws(() => make(0).loadState(saved), /topology/);
    assert.throws(() => make().connect({ from: 'X', to: 'M', kind: 'slow', E: 0, istdp: {} }));
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyErrors() ? 0 : 1;
}
