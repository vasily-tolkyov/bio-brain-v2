/** Focused N-only verification. No legacy M-dependent probe/calibration helpers. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { NOVELTY, SpikingNovelty, effectiveNovelty, restCount } from '../src/novelty.mjs';
import { WINDOW_MS } from '../src/readout.mjs';

const weights = e => e.net.groups.map(g => [...g.scale]);
const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const variance = xs => { const m = mean(xs); return mean(xs.map(x => (x - m) ** 2)); };
// Preserve the old focused verification's exact 100-trial budget, 3 s slots,
// all eleven offsets, eta/sqrt(trial) schedule and >=90/100 silence threshold.
const MATCHED_OFFSETS = Array.from({ length: 11 }, (_, i) => i * WINDOW_MS - 500);
const CALIBRATION_TRIALS = 100, REQUIRED_QUIET = 90;

function trial(e, onset, { learn = false, predict = true, strength = 1 } = {}) {
  const start = e.t === null ? 0 : e.t + WINDOW_MS, rows = [];
  for (let offset = 0; offset < 3000; offset += WINDOW_MS) {
    const [r] = e.step(start + offset, [offset === onset ? strength : 0],
      offset === 0 && predict ? [{ B: e.ids[0], tArrive: start + 600, strength }] : [], { learn });
    if (offset >= 100 && offset <= 1100) rows.push(r);
  }
  assert.equal(rows.length, 11);
  const N = rows.reduce((sum, r) => sum + r.N, 0);
  const Neff = effectiveNovelty(N, rows.length * WINDOW_MS);
  return { N, Nraw: rows.reduce((sum, r) => sum + r.Nraw, 0), Neff, nearRest: Neff === 0 };
}

export function verifyNovelty() {
  const c = checker('M11h N-only spiking novelty'), started = performance.now();
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.stack); }
  };

  test('Original N constants and R/P afferents remain; no M, D, Minh or slow circuit/readout', () => {
    assert.deepEqual(NOVELTY, { cells: 10, fibers: 8, dt: 0.5, rateHz: 120,
      toleranceMs: 500, excScale: 3, inhScale: 0.05, tauRec: 5,
      eta: 0.2, targetHz: 1.5, tonicHz: 10.3, wMax: 40 });
    const e = new SpikingNovelty(['named-feature', 3], 7);
    assert.deepEqual(e.ids, ['named-feature', 3]);
    assert.deepEqual(Object.keys(e.net.pops), ['N0', 'R0', 'P0', 'N1', 'R1', 'P1']);
    assert.equal(e.net.N, 52); assert.equal(e.net.dt, 0.5);
    assert.equal(e.net.groups.length, 4);
    assert.equal('stepGoals' in e, false);
    e.rows.forEach((row, i) => {
      assert.deepEqual(Object.keys(row).sort(), ['N', 'Ninh', 'P', 'R', 'id'].sort());
      assert.equal(row.N.length, 10); assert.equal(row.R.length, 8); assert.equal(row.P.length, 8);
      assert.ok(row.N.every(cell => !e.net.source[cell]));
      assert.ok([...row.R, ...row.P].every(cell => e.net.source[cell]));
      const [exc, inh] = e.net.groups.slice(2 * i, 2 * i + 2);
      for (const [group, sources] of [[exc, row.R], [inh, row.P]]) {
        assert.deepEqual(group.sources, sources); assert.deepEqual(group.targets, row.N);
        assert.equal(group.pre.length, 80); assert.equal(group.contacts, 10);
        assert.equal(group.pRelease, 0.3); assert.equal(group.tauRec, 5); assert.equal(group.slow, null);
      }
      assert.equal(exc.kind, 'exc'); assert.equal(exc.istdp, null);
      assert.ok(exc.scale.every(w => w === 3));
      assert.equal(inh, row.Ninh); assert.equal(inh.kind, 'inh');
      assert.ok(inh.scale.every(w => w === 0.05));
      assert.deepEqual(inh.istdp, { eta: 0.2, target: 1.5, tau: 20, wMax: 40 });
    });
    for (const row of e.step(0, [0, 0])) {
      assert.deepEqual(Object.keys(row).sort(), ['id', 't', 'reality', 'prediction', 'Nraw', 'N'].sort());
      assert.equal(row.N, row.Nraw - 1.5);
    }
  });

  test('Analytic N deadband uses the population rest count over each read span', () => {
    assert.equal(restCount(0), 0); assert.equal(restCount(100), 1.5); assert.equal(restCount(1100), 16.5);
    for (const duration of [100, 1100]) {
      const boundary = 3 * Math.sqrt(restCount(duration));
      assert.equal(effectiveNovelty(-restCount(duration), duration), 0);
      assert.equal(effectiveNovelty(boundary, duration), 0);
      assert.ok(Math.abs(effectiveNovelty(boundary + 2, duration) - 2) < 1e-12);
    }
  });

  const calibrated = new SpikingNovelty(['arbitrary-id'], 7), initial = weights(calibrated), history = [];
  test('Actual P→N learning runs 100 matched trials across every inclusive ±500 ms offset', () => {
    for (let i = 0; i < CALIBRATION_TRIALS; i++) {
      const eta = NOVELTY.eta / Math.sqrt(i + 1), offset = MATCHED_OFFSETS[i % MATCHED_OFFSETS.length];
      calibrated.rows[0].Ninh.istdp.eta = eta;
      history.push({ offset, eta, ...trial(calibrated, 600 + offset, { learn: true }) });
    }
    assert.equal(history.length, 100);
    assert.deepEqual([...new Set(history.map(r => r.offset))], MATCHED_OFFSETS);
    assert.deepEqual(weights(calibrated)[0], initial[0]);
    assert.notDeepEqual(weights(calibrated)[1], initial[1]);
    assert.ok(calibrated.rows[0].Ninh.scale[0] > initial[1][0]);
    assert.ok(calibrated.rows[0].Ninh.scale.every(w => w >= 0 && w <= NOVELTY.wMax));
    return `mean P→N weight ${mean(initial[1]).toFixed(6)} → ${mean(weights(calibrated)[1]).toFixed(6)}; eta=${history.at(-1).eta}`;
  });
  test('Unchanged calibration criterion: at least 90/100 matched trials have Neff=0', () => {
    const quiet = history.filter(r => r.nearRest).length;
    const offsets = MATCHED_OFFSETS.map(offset => {
      const rows = history.filter(r => r.offset === offset);
      return `${offset}:${rows.filter(r => r.nearRest).length}/${rows.length}`;
    }).join(', ');
    console.log(`  Calibration: ${quiet}/100 quiet; offset quiet/trials = ${offsets}`);
    console.log(`  Nonquiet trials: ${JSON.stringify(history.flatMap((r, i) => r.nearRest ? [] : [{ trial: i + 1, offset: r.offset, N: r.N, Neff: r.Neff }]))}`);
    assert.equal(history.length, CALIBRATION_TRIALS);
    assert.ok(quiet >= REQUIRED_QUIET, `${quiet}/100 N-silent; unchanged required minimum is ${REQUIRED_QUIET}/100`);
    return `${quiet}/100; no extended calibration, changed seeds or relaxed threshold`;
  });
  test('Frozen centre/early/late matches are quiet and unexpected reality exceeds the original contrast threshold', () => {
    const before = weights(calibrated);
    const matched = trial(calibrated, 600), early = trial(calibrated, 100), late = trial(calibrated, 1100);
    const unexpected = trial(calibrated, 600, { predict: false });
    const omission = trial(calibrated, -1), rest = trial(calibrated, -1, { predict: false });
    const probes = { matched, early, late, unexpected, omission, rest };
    console.log(`  Frozen probes: ${JSON.stringify(probes)}`);
    assert.deepEqual(weights(calibrated), before);
    for (const [kind, r] of Object.entries({ matched, early, late, omission, rest })) assert.ok(r.nearRest, `${kind}: ${JSON.stringify(r)}`);
    assert.ok(unexpected.Neff >= 10 && unexpected.Neff >= 5 * matched.Neff, JSON.stringify(probes));
    return `unexpected Neff=${unexpected.Neff.toFixed(3)}; weights unchanged`;
  });

  test('Weak 0.1 unexpected reality exceeds rest noise in its active window', () => {
    const e = new SpikingNovelty(['x'], 19), before = weights(e);
    let total = 0;
    for (let n = 0; n < 10; n++) for (let offset = 0; offset < 3000; offset += WINDOW_MS) {
      const start = n * 3000;
      const [r] = e.step(start + offset, [offset === 2100 ? 0.1 : 0],
        offset === 0 ? [{ B: 'x', tArrive: start + 600, strength: 0.1 }] : []);
      if (offset === 2100) total += r.N;
    }
    assert.ok(total / 10 >= 2, `active-window mean N=${total / 10}`);
    assert.deepEqual(weights(e), before);
    return `active-window mean N=${total / 10}`;
  });

  test('Independent tonic N rest stays near target without bursts, recurrence or weight drift', () => {
    const e = new SpikingNovelty(['a', 'b', 'c'], 7), before = weights(e), duration = 30000;
    const populations = e.rows.map(row => ({ id: row.id, bins: new Uint32Array(duration / 10),
      cells: row.N.map(cell => ({ cell, count: 0, bursts: 0, last: [] })) }));
    let trace = 0, opened = 0;
    const decay = Math.exp(-WINDOW_MS / 400);
    const limit = 3 * Math.sqrt(e.ids.length * restCount(WINDOW_MS) / (1 - decay ** 2));
    for (let t = 0; t < duration; t += WINDOW_MS) {
      const counts = e.step(t, [0, 0, 0], [], { learn: true });
      for (const r of counts) assert.equal(r.N, r.Nraw - restCount(WINDOW_MS));
      trace = trace * decay + counts.reduce((sum, r) => sum + r.N, 0);
      opened += Number(trace > limit);
      for (const pop of populations) for (const cell of pop.cells) for (const at of e.net.spikes[cell.cell]) {
        cell.count++;
        if (cell.last.length === 2 && at - cell.last[0] <= 20 + 1e-7) cell.bursts++;
        cell.last.push(at); if (cell.last.length > 2) cell.last.shift();
        pop.bins[Math.floor((at - 1e-7) / 10)]++;
      }
    }
    const stats = populations.map(pop => ({ id: pop.id,
      meanHz: mean(pop.cells.map(cell => cell.count / (duration / 1000))),
      bursts: pop.cells.reduce((sum, cell) => sum + cell.bursts, 0),
      fano: variance([...pop.bins]) / mean([...pop.bins]) }));
    console.log(`  Rest: ${JSON.stringify(stats)}; signed analytic three-SD trace opened ${opened}/300 windows`);
    assert.ok(stats.every(p => Math.abs(p.meanHz - NOVELTY.targetHz) < 0.3 && p.bursts === 0 && p.fano <= 1.5), JSON.stringify(stats));
    assert.ok(opened / (duration / WINDOW_MS) < 0.01, `Rest analytic trace opened ${opened}/300 windows`);
    assert.deepEqual(weights(e), before);
    assert.ok(e.net.groups.every(g => g.sources.every(cell => e.net.source[cell])));
    return '30 s × 3 N populations; unchanged rest and analytic-noise criteria';
  });

  test('Silent reality freezes P→N iSTDP despite prediction spikes and residual post traces', () => {
    const e = new SpikingNovelty(['x'], 31), row = e.rows[0];
    row.Ninh.y.fill(2);
    const before = weights(e);
    e.step(0, [0], [{ B: 'x', tArrive: 500, strength: 1 }], { learn: true });
    assert.ok(row.P.some(cell => e.net.spikes[cell].length > 0));
    assert.ok(row.Ninh.x.some(x => x > 0)); // Eligibility continues while weights are frozen.
    assert.equal(row.Ninh.frozen, true); assert.deepEqual(weights(e), before);
    e.step(100, [1], [], { learn: true });
    assert.ok(row.R.some(cell => e.net.spikes[cell].length > 0));
    assert.equal(row.Ninh.frozen, false); assert.notDeepEqual([...row.Ninh.scale], before[1]);
    assert.deepEqual(weights(e)[0], before[0]);
    assert.ok(row.Ninh.R[row.P[0]] > 0.4, 'Original fast STD retains substantial resources');
    const learned = weights(e);
    e.step(200, [1], [], { learn: false });
    assert.equal(row.Ninh.frozen, true); assert.deepEqual(weights(e), learned);
  });

  test('Prediction matching includes both ±500 ms edges, excludes outside onsets and retains deadline provenance', () => {
    for (const offset of [-600, -500, -300, 500, 600, null]) {
      const e = new SpikingNovelty(['b'], 7);
      const p = { B: 'b', tArrive: 600, strength: 0.8, ruleKey: '["a",3,"b"]', activation: 0.7, generation: 8 };
      for (let t = 0; t <= 1200; t += WINDOW_MS) {
        const [r] = e.step(t, [offset !== null && t === 600 + offset ? 1 : 0], t === 0 ? [p] : []);
        assert.equal(r.prediction, t >= 100 && t <= 1100 ? 0.8 : 0);
        if (t <= 1100) {
          const matched = offset !== null && Math.abs(offset) <= 500 && t >= 600 + offset;
          assert.deepEqual(e.pending, [{ ...p, matched: Number(matched) }]);
        } else assert.equal(e.pending.length, 0);
      }
    }
  });

  test('One reality matches every eligible instance, not other targets or future-created predictions', () => {
    const e = new SpikingNovelty(['b', 'c'], 19);
    const entries = [
      { B: 'b', tArrive: 600, strength: 0.8, ruleKey: 'same-rule', generation: 1 },
      { B: 'b', tArrive: 700, strength: 0.4, ruleKey: 'same-rule', generation: 1 },
      { B: 'b', tArrive: 1200, strength: 1, ruleKey: 'outside', generation: 2 },
      { B: 'c', tArrive: 600, strength: 1, ruleKey: 'other-target', generation: 3 },
    ];
    for (let t = 0; t <= 500; t += WINDOW_MS) {
      const created = t === 0 ? entries : t === 300 ? [{ ...entries[0], ruleKey: 'created-after-onset' }] : [];
      const counts = e.step(t, [t === 200 ? 0.75 : t === 400 ? 0.25 : 0, 0], created);
      if (t === 200) {
        assert.deepEqual(e.pending.map(p => p.matched), [0.75, 0.75, 0, 0]);
        assert.equal(counts[0].prediction, 0.8); // max, not sum, and matching does not remove P.
      }
      if (t === 300) assert.deepEqual(e.pending.map(p => p.matched), [0.75, 0.75, 0, 0, 0]);
      if (t >= 400) assert.deepEqual(e.pending.map(p => p.matched), [0.75, 0.75, 0, 0, 0.25]);
    }
  });

  test('JSON continuation preserves all neural dynamics, RNG, learned weights and pending provenance', () => {
    const a = new SpikingNovelty(['b', 9], 31);
    const first = [0.8, 0.4].map((strength, i) => ({ B: 'b', tArrive: 600 + i * 100, strength,
      ruleKey: `rule-${i}`, activation: 0.9, generation: i + 1 }));
    for (let t = 0; t <= 500; t += WINDOW_MS) {
      a.step(t, [t === 300 ? 0.5 : 0, t === 400 ? 1 : 0], t === 0 ? first : [], { learn: true });
    }
    const saved = JSON.parse(JSON.stringify(a.saveState()));
    assert.equal(saved.schema, 'novelty-only-v1');
    const b = new SpikingNovelty(['b', 9], 999).loadState(saved);
    assert.deepEqual(b.saveState(), a.saveState());
    for (let t = 600; t <= 1600; t += WINDOW_MS) {
      const now = [t === 1100 ? 0.75 : 0, t === 1200 ? 0.6 : 0];
      const created = t === 800 ? [{ B: 9, tArrive: 1300, strength: 0.6, ruleKey: 'new', activation: 0.6, generation: 3 }] : [];
      assert.deepEqual(b.step(t, now, created, { learn: t % 200 === 0 }), a.step(t, now, created, { learn: t % 200 === 0 }));
      assert.deepEqual(b.saveState(), a.saveState());
    }
    assert.deepEqual(saved.pending.map(p => p.matched), [0.5, 0.5]); // Load does not alias the input snapshot.
    assert.throws(() => new SpikingNovelty([9, 'b'], 31).loadState(saved), /Invalid novelty state/);
  });

  test('Legacy unversioned N/M snapshots are explicitly rejected without mutating the destination', () => {
    const e = new SpikingNovelty(['x'], 7), before = e.saveState();
    // Legacy SpikingErrors snapshots used this unversioned outer envelope.
    // The legacy net is intentionally opaque: reject before any network load.
    const legacy = { ids: ['x'], t: 0, pending: [{ B: 'x', tArrive: 600, strength: 1, matched: 0, remaining: 1 }], net: {} };
    for (const state of [legacy, { ...legacy, schema: 'spiking-errors-v1' }, null]) {
      assert.throws(() => e.loadState(state), /legacy N\/M snapshots require explicit migration/);
      assert.deepEqual(e.saveState(), before);
    }
    const invalid = structuredClone(before); invalid.pending = [{ B: 'x', tArrive: 600, strength: 1, matched: 1.1 }];
    assert.throws(() => e.loadState(invalid), /Invalid novelty state/);
    assert.deepEqual(e.saveState(), before);
  });

  test('Skipped windows and invalid drives/predictions fail without advancing or mutating state', () => {
    const e = new SpikingNovelty(['x'], 7);
    e.step(0, [0]);
    const before = e.saveState();
    for (const args of [[200, [0]], [100, [NaN]], [100, [1.1]], [100, []],
      [100, [0], [{ B: 'other', tArrive: 600, strength: 1 }]],
      [100, [0], [{ B: 'x', tArrive: 0, strength: 1 }]],
      [100, [0], [{ B: 'x', tArrive: 650, strength: 1 }]]]) {
      assert.throws(() => e.step(...args), /Invalid novelty window or drives/);
      assert.deepEqual(e.saveState(), before);
    }
  });

  console.log(`  Focused runtime: ${((performance.now() - started) / 1000).toFixed(3)} s`);
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyNovelty() ? 0 : 1;
}
