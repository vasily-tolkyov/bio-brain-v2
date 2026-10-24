import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { read, hash, protocol } from './L8-common.mjs';
// Independent reference ledger: imports no production learning/model modules.
import { auditLedger } from './L6-ledger-audit.mjs';

const intersection = (a, b) => a.filter(x => b.includes(x));
const jaccard = (a, b) => intersection(a, b).length / new Set([...a, ...b]).size;
const slope = xs => { const mid = (xs.length - 1) / 2; return xs.reduce((s, x, i) => s + (i - mid) * x, 0) / xs.reduce((s, _, i) => s + (i - mid) ** 2, 0); };
const empty = () => Array(250).fill(0);

/** Independent arithmetic on saved arrays only. No production solver, reader,
 * discovery, predictor, checkpoint or acceptance helper is invoked here. */
export class SavedAudit {
  constructor() { this.maxError = 0; this.arithmetic = 0; this.fields = 0; this.memberships = 0; this.seenFields = new Set(); this.weightCache = new Map(); }
  near(a, b) { assert.ok(Number.isFinite(a) && Number.isFinite(b)); const e = Math.abs(a - b);
    this.maxError = Math.max(this.maxError, e); this.arithmetic++; assert.ok(e <= 1e-12, `arithmetic discrepancy ${e}`); }
  weights(channels, carrier) {
    let byCarrier = this.weightCache.get(channels); if (!byCarrier) this.weightCache.set(channels, byCarrier = new Map());
    if (!byCarrier.has(carrier)) byCarrier.set(carrier, new Map(channels.map(e => {
      const color = Math.min(1, e.samples.reduce((s, x) => s + Math.exp(-.5 * ((x - carrier) / .05) ** 2), 0));
      return [e.i * 250 + e.j, color * e.rho ** 4 / (e.rho ** 4 + (1.5 * (1 - e.rho)) ** 4)];
    })));
    return byCarrier.get(carrier);
  }
  field(channels, emission, carrier, f) {
    const signature = hash([emission, carrier, f]);
    // Same field must still be checked against a different learned channel state.
    const weights = this.weights(channels, carrier);
    const id = `${[...this.weightCache.keys()].indexOf(channels)}:${signature}`;
    if (this.seenFields.has(id)) return;
    this.seenFields.add(id); this.fields++;
    const next = [...emission], B = f.brightness;
    assert.equal(B.length, 250); assert.equal(f.paths.length, 250);
    for (const e of channels) {
      const q = weights.get(e.i * 250 + e.j);
      next[e.i] = Math.max(next[e.i], q * B[e.j]); next[e.j] = Math.max(next[e.j], q * B[e.i]);
    }
    for (let i = 0; i < 250; i++) {
      assert.ok(B[i] >= 0 && B[i] <= 1); this.near(next[i], B[i]);
      const path = f.paths[i]; let product = path.length ? emission[path[0]] : 0;
      if (path.length) { assert.ok(product > 0); assert.equal(path.at(-1), i); }
      for (let j = 1; j < path.length; j++) product *= weights.get(Math.min(path[j - 1], path[j]) * 250 + Math.max(path[j - 1], path[j]));
      this.near(product, B[i]);
    }
    assert.deepEqual(f.lit, B.flatMap((v, i) => v > .3 ? [i] : []));
  }
  p7(o) {
    for (const r of o.readings) {
      const entry = o.mapping.find(e => e.id === r.localId); assert.ok(entry);
      let sum = 0;
      for (const h of o.history) {
        const dt = Math.max(0, Math.min(o.end, h.end) - Math.max(o.end - 100, h.start));
        const field = h.fields.find(f => f.carrier === entry.carrier);
        for (const [replica, members] of entry.members.entries()) for (const cell of members)
          sum += dt * (field?.replicas[replica].brightness[cell] ?? 0) / (100 * entry.members.length * members.length);
      }
      this.near(r.strength, sum);
    }
    for (const r of o.readout) this.near(r.strength, Math.max(0, ...o.readings.filter(x => x.id === r.id).map(x => x.strength)));
  }
  optical(o, stream) {
    this.p7(o); let t = o.end - 100;
    for (const s of o.segments) {
      const history = o.history.find(h => h.start === t); assert.ok(history); assert.equal(history.end, t + s.durationMs); t += s.durationMs;
      const active = stream.ports.filter((p, i) => s.values[i] > 0);
      assert.deepEqual(history.fields.map(f => f.carrier), active.map(p => p.carrier).sort((a, b) => a - b));
      for (const field of history.fields) {
        const emission = empty();
        for (const p of active.filter(p => p.carrier === field.carrier)) for (const cell of p.sources) emission[cell] = s.values[p.port];
        this.field(stream.channels, emission, field.carrier, field.replicas[0]);
      }
    }
  }
  rho(events, channels) {
    const state = new Map();
    for (const event of events) {
      const s = new Set(event.sources);
      for (const i of s) for (const j of s) if (i < j && !state.has(i * 250 + j)) state.set(i * 250 + j,
        { i, j, rho: 0, samples: [], coLit: 0, oneEnd: 0, neither: 0 });
      for (const edge of state.values()) {
        if (s.has(edge.i) && s.has(edge.j)) { edge.rho = 1 - (1 - edge.rho) * .8 ** event.strengthScale; edge.samples.push(event.carrier); edge.coLit++; }
        else if (s.has(edge.i) !== s.has(edge.j)) { edge.rho *= .96 ** event.strengthScale; edge.oneEnd++; }
        else edge.neither++;
      }
    }
    assert.equal(state.size, channels.length);
    for (const e of channels) {
      assert.ok(e.i < e.j && e.rho >= 0 && e.rho <= 1); const expected = state.get(e.i * 250 + e.j);
      this.near(e.rho, expected.rho); assert.deepEqual(e.samples, expected.samples);
      e.H.forEach((v, b) => this.near(v, expected.samples.reduce((s, c) => s + Math.exp(-.5 * ((b / 199 - c) / .05) ** 2), 0)));
    }
    return { events: events.length, channels: channels.length, exposure: [...state.values()].map(({ i, j, coLit, oneEnd, neither }) => ({ i, j, coLit, oneEnd, neither })) };
  }
  contrast(B) {
    const sorted = [...B].sort((a, b) => a - b), background = (sorted[124] + sorted[125]) / 2,
      peak = sorted[249], span = peak - background;
    const members = span > .3 ? B.flatMap((v, i) => v > .3 && (v - background) / span >= .5 ? [i] : []) : [];
    return { accepted: members.length >= 2, members, background, peak, span };
  }
  catalogue(frames) {
    const entries = []; let id = 1;
    for (const frame of frames) for (const field of frame.fields) {
      const contrast = field.replicas.map(r => this.contrast(r.brightness)); if (!contrast.every(c => c.accepted)) continue;
      const members = contrast.map(c => c.members);
      const matches = entries.filter(e => e.carrier === field.carrier).map(e => ({ e,
        J: e.members.reduce((s, m, i) => s + jaccard(m, members[i]), 0) / members.length }))
        .filter(e => e.J >= .8).sort((a, b) => b.J - a.J || a.e.id - b.e.id);
      let entry = matches[0]?.e;
      if (!entry) { entry = { id: id++, carrier: field.carrier, members, contrast, frameIndices: [], mature: false }; entries.push(entry); }
      entry.members = members; entry.contrast = contrast; entry.frameIndices.push(frame.index); entry.mature = entry.frameIndices.length >= 20;
    }
    this.memberships += entries.length; return entries;
  }
  lowerMembers(s) {
    const actual = s.state.layer.state.catalogue.entries, expected = this.catalogue(s.state.layer.state.frames);
    assert.deepEqual(actual, expected);
    for (const m of s.M2) {
      assert.equal(m.replays.length, 20); assert.equal(new Set(m.frameIndices).size, 20);
      for (const [r, expected] of m.M2.entries()) {
        const counts = empty(); for (const replay of m.replays) for (let i = 0; i < 250; i++) if (replay.field.replicas[r].brightness[i] > .3) counts[i]++;
        assert.deepEqual(counts, expected.counts); assert.deepEqual(expected.members, counts.flatMap((n, i) => n >= 10 ? [i] : []));
        assert.deepEqual(expected.members, m.contrastMembers[r]);
      }
    }
  }
  higherMembers(data) {
    const expected = this.catalogue(data.replayTraining);
    assert.equal(expected.length, data.catalogue.length);
    expected.forEach((entry, i) => { for (const k of Object.keys(entry)) assert.deepEqual(entry[k], data.catalogue[i][k]); });
    for (const m of data.M2) {
      assert.equal(m.replays.length, 20);
      const counts = empty(); for (const r of m.replays) for (const cell of r.fields.find(f => f.carrier === m.entry.carrier).replicas[0].lit) counts[cell]++;
      assert.deepEqual(counts, m.entry.m2[0].counts);
      assert.deepEqual(m.entry.m2[0].members, counts.flatMap((n, i) => n >= 10 ? [i] : []));
      assert.deepEqual(m.entry.members[0], m.entry.m2[0].members);
    }
  }
}

export function auditSeed(dir, schedule) {
  const a = new SavedAudit(), decisions = [], details = {}, fixture = read(`${dir}/fixture.json.gz`);
  const gate = (name, fn, classification = 'model') => {
    try { const detail = fn(); decisions.push({ name, pass: true }); details[name] = detail ?? null; }
    catch (e) { decisions.push({ name, pass: false, classification: e.code === 'ENOENT' ? 'missing' : classification,
      reason: String(e.message).slice(0, 1200) }); }
  };
  gate('natural-optical-membership-and-learning', () => fixture.streams.map(s => { a.lowerMembers(s); return a.rho(s.presentations, s.channels); }), 'observer');
  gate('optical-core', () => {
    const core = read(`${dir}/core.json.gz`); for (const [k, v] of Object.entries({ N: 250, m: 6, eta: .2, kappa: .2, theta: .3, w: .05 })) assert.equal(core.parameters[k], v);
    [.2, .192, .192].forEach((v, i) => a.near(core.stages[i][0].rho, v));
    for (let i = 0; i < 250; i++) assert.equal(core.sourceOnly.brightness[i], Number(i < 2));
  });
  gate('optical-full-half-mixed-blank', () => {
    const data = read(`${dir}/optics.json.gz`), result = [];
    for (const [index, s] of data.entries()) {
      const f = fixture.streams[index], members = s.names.map((_, i) => s.mixtures.find(x => x.mask === 1 << i).optical.history[0].fields[0].replicas[0].lit);
      const denominators = [];
      for (let i = 0; i < members.length; i++) for (let j = 0; j < members.length; j++) if (i !== j) {
        const exclusive = members[j].filter(c => !members[i].includes(c));
        assert.ok(exclusive.length >= 3); assert.ok(jaccard(members[i], members[j]) <= .2);
        denominators.push({ from: i, to: j, shared: intersection(members[i], members[j]), exclusive, denominator: exclusive.length });
      }
      let maxSpill = 0;
      for (const sample of [...s.mixtures, ...s.amplitudes]) {
        a.optical(sample.optical, f);
        const active = sample.values.flatMap((v, i) => v > 0 ? [i] : []), union = new Set(active.flatMap(i => members[i]));
        for (const field of sample.optical.history.flatMap(h => h.fields)) for (let j = 0; j < members.length; j++) if (!active.includes(j)) {
          const ex = members[j].filter(c => !union.has(c)); assert.ok(ex.length > 0);
          const spill = ex.filter(c => field.replicas[0].brightness[c] > .3).length / ex.length; maxSpill = Math.max(maxSpill, spill);
        }
        for (const r of sample.optical.readout) if (!active.includes(s.names.indexOf(r.id))) assert.ok(r.strength <= .25);
      }
      for (const p of s.partial) {
        const field = p.optical.history[0].fields[0], B = field.replicas[0].brightness;
        a.p7(p.optical);
        const emission = empty(); p.input[p.port].sources.forEach(cell => emission[cell] = 1);
        a.field(f.channels, emission, field.carrier, field.replicas[0]);
        const coverage = intersection(field.replicas[0].lit, members[p.port]).length / members[p.port].length;
        if (p.count === 6) assert.ok(jaccard(field.replicas[0].lit, members[p.port]) >= .8);
        if (p.count === 3) { assert.ok(coverage >= .9); assert.ok(members[p.port].reduce((s, c) => s + B[c], 0) / members[p.port].length > .5); }
      }
      for (const blank of s.blank) { a.optical(blank, f); assert.ok(blank.history.every(h => h.fields.length === 0)); assert.ok(blank.readout.every(r => r.strength === 0)); }
      assert.ok(maxSpill <= .05); assert.equal(s.before, s.after); result.push({ names: s.names, maxSpill, denominators });
    }
    return result;
  });
  gate('time-unroll', () => {
    const data = read(`${dir}/unroll.json.gz`);
    for (const row of data) {
      let entries = [], previous = new Set();
      for (const s of row.samples) {
        const active = new Map(s.input.filter(e => e.strength > 0).map(e => [e.id, e.strength]));
        entries = entries.filter(e => s.t - e.tOnset < 12800 * Math.SQRT2);
        for (const [id, strength] of active) if (!previous.has(id)) entries.push({ id, strength, tOnset: s.t });
        previous = new Set(active.keys()); assert.deepEqual(entries, s.state.entries);
        const lines = Array(18).fill(0);
        for (const e of entries) { let k = 0; while (k < 8 && s.t - e.tOnset >= 100 * 2 ** k / Math.SQRT2) k++;
          const i = (e.id === 'a' ? 0 : 9) + k; lines[i] = Math.max(lines[i], e.strength); }
        assert.deepEqual(lines, s.lines);
      }
    }
    return { strengths: data.map(r => r.strength), expiry: 12800 * Math.SQRT2 };
  });
  gate('binary-ledger-and-body-boundaries', () => {
    const data = read(`${dir}/boundaries.json.gz`);
    // Nine explicit fixture families; the original r1 observer incorrectly
    // required ten. No model predicate or numeric threshold changes here.
    assert.equal(data.ledger.length, 9);
    const binary = data.ledger[0].detail; assert.equal(binary.cases, 441); assert.equal(binary.presenceThreshold, .25); assert.equal(binary.strict, true);
    const offsets = data.ledger.find(e => e.name.startsWith('eleven')).detail;
    assert.equal(offsets.length, 11); offsets.forEach(e => { a.near(e.credit, .6 * (1 - Math.abs(e.offset) / 500)); a.near(e.W, .08 + .1 * .205 * (1 + .05 * Math.exp(-(3200 + e.offset) / 5000)) * e.credit * .2); });
    assert.ok(data.body.blankRows.every(r => !r.bins.length && !r.changes.length));
    for (const c of data.body.sourceGuards) assert.equal(c.connections.length, Number(c.kind === 'distinct-time'));
    const goals = data.ledger.at(-1).detail; assert.ok(goals.maximumDepth <= 3); assert.equal(goals.hypotheticalPastEntries, 0);
    return { deterministicFixtureNames: data.ledger.map(e => e.name), sourceGuards: data.body.sourceGuards.map(c => c.kind) };
  });
  gate('temporal-arithmetic-and-membership', () => {
    const data = read(`${dir}/temporal.json.gz`), result = [];
    assert.equal(hash(data.arms[0].initial), hash(data.arms[1].initial)); assert.equal(hash(data.arms[0].initial), hash(data.arms[2].initial));
    for (const arm of data.arms) {
      a.higherMembers(arm); const exposure = a.rho(arm.presentations, arm.channels.upper);
      for (const p of [...arm.probes.map(p => p.result), arm.target]) a.field(arm.channels.upper,
        [...p.selected.values, ...Array(250 - p.selected.values.length).fill(0)], 1 / 6, p.field);
      const cleared = arm.cleared; for (let i = 0; i < 250; i++) a.near(cleared.field.brightness[i], cleared.selected.values[i] ?? 0);
      result.push({ name: arm.name, ...exposure });
    }
    return result;
  }, 'observer');
  gate('temporal-causal-shuffled-distractor', () => {
    const { arms } = read(`${dir}/temporal.json.gz`), metrics = [];
    for (const arm of arms) {
      const target = arm.target.field.lit, gains = [];
      for (let k = 0; k < 9; k++) for (const event of [0, 2]) {
        const probes = arm.probes.filter(p => p.k === k && p.event === event), rows = probes.map(p => {
          const sources = p.result.selected.values.flatMap((v, i) => v > 0 ? [i] : []), ex = target.filter(i => !sources.includes(i));
          assert.ok(ex.length >= 3, 'identifiable target-exclusive denominator');
          return { exclusive: ex, shared: intersection(target, sources), denominator: ex.length,
            meanB: ex.reduce((s, i) => s + p.result.field.brightness[i], 0) / ex.length,
            coverage: ex.filter(i => p.result.field.brightness[i] > .3).length / ex.length };
        });
        gains.push({ k, event, meanB: rows.reduce((s, r) => s + r.meanB, 0) / rows.length, rows });
      }
      metrics.push({ name: arm.name, gains });
    }
    // Keep measured values even when the numeric predicate rejects.
    details.temporalMeasurements = metrics;
    const gain = (name, event, k) => metrics.find(m => m.name === name).gains.find(g => g.event === event && g.k === k);
    const cause = gain('causal', 0, 6); assert.ok(cause.rows.every(r => r.coverage >= .9), 'A@6 completion < .9');
    assert.ok(cause.meanB >= Math.max(...metrics[0].gains.filter(g => g.event === 0).map(g => g.meanB)));
    assert.ok(cause.meanB - gain('shuffled', 0, 6).meanB >= .05);
    assert.ok(cause.meanB - gain('causal', 2, 6).meanB >= .05);
    assert.ok(gain('reverse', 0, 6).rows.every(r => r.coverage <= .05));
    return metrics;
  });
  gate('higher-level-three-membership', () => {
    const data = read(`${dir}/higher.json.gz`); assert.equal(data.parameters.level, 3); assert.equal(data.parameters.core.N, 250);
    a.higherMembers(data); const rho = a.rho(data.presentations, data.channels);
    assert.ok(data.M2.length >= 5, 'fewer than five mature higher natural patterns');
    assert.ok(data.M2.every(m => m.entry.members[0].length < 125)); return { ...rho, mature: data.M2.length };
  });
  gate('prediction-and-calibration-ledger', () => {
    const data = read(`${dir}/prediction.json.gz`), results = [];
    for (const branch of [...data.branches, ...data.controls]) {
      results.push(auditLedger({ ids: data.ids, observations: branch.rows.map(r => ({ t: r.t, readouts: r.observations })),
        initial: branch.initialState.windows ? branch.initialState : null, end: branch.finalState.future.t,
        expected: branch.finalState, changes: branch.rows.flatMap(r => r.changes) }));
      for (const t of branch.trials ?? []) { a.near(t.forecast.F, data.fixedSourceP7 * t.W / .1);
        const selected = t.forecast.created.find(e => e.ruleKey === data.ruleKey); a.near(t.forecast.F, selected?.strength ?? 0); }
    }
    assert.equal(hash(data.controls[0].initialState), hash(data.controls[1].initialState)); return results;
  }, 'observer');
  gate('prediction-timing-and-selectivity', () => {
    const data = read(`${dir}/prediction.json.gz`); let timely = 0, matched = 0;
    for (const probe of data.probes) {
      const f = probe.rows[0].created.find(e => e.ruleKey === data.ruleKey);
      if (f?.tArrive === probe.start + 3200 && probe.rows.some(r => r.arrivals.some(e => e.ruleKey === data.ruleKey))) timely++;
      if (probe.rows.some(r => r.pending.some(e => e.ruleKey === data.ruleKey && e.matched === 1))) matched++;
      assert.equal(probe.before, probe.after);
    }
    const [causal, shuffled] = data.controls, F = causal.causal.F,
      S = Math.max(0, ...shuffled.causal.created.map(e => e.strength)), D = Math.max(0, ...causal.distractor.created.map(e => e.strength));
    details.predictionMeasurements = { timely, matched, total: data.probes.length, F, shuffled: S, distractor: D };
    assert.ok(timely >= 18 && matched >= 18); assert.ok(F > 0 && F >= 5 * S && F >= 5 * D);
    return details.predictionMeasurements;
  });
  gate('extinction-recovery-jitter-mixed', () => {
    const data = read(`${dir}/prediction.json.gz`), [P, O, R, J, M] = data.branches;
    const last = x => x.trials.at(-1).forecast.F, trajectory = [M.initial.F, ...M.trials.map(t => t.forecast.F)];
    const metrics = { F_paired10: last(P), F_omission30: O.trials[29].forecast.F, F_omission60: last(O),
      F_recovery60: last(R), F_jitter30: last(J), mixedInitial: M.initial.F, mixedFinal: last(M),
      mixedSlope: slope(trajectory), mixedLast10Slope: slope(trajectory.slice(-10)), ruleKey: data.ruleKey, fixedSourceP7: data.fixedSourceP7 };
    details.calibrationMeasurements = metrics;
    assert.ok(last(P) > 0); assert.ok(last(O) <= .1 * last(P) && last(O) < O.trials[29].forecast.F);
    assert.ok(last(R) >= .85 * last(P)); assert.ok(last(J) >= .8 * last(P));
    assert.ok(last(M) <= .95 * M.initial.F && metrics.mixedSlope < 0 && metrics.mixedLast10Slope < 0); return metrics;
  });
  gate('motor-threshold-onsets-and-unsent-actions', () => {
    const data = read(`${dir}/motor.json.gz`), results = [];
    for (const group of data) {
      const n = group.amplitude >= .75 ? 1 : 0; assert.equal(group.trials.length, 20);
      for (const trial of group.trials) {
        assert.equal(trial.rows.filter(r => r.executed.action !== null).length, n); assert.equal(trial.rows.flatMap(r => r.copy).length, n);
        for (const row of trial.rows) {
          a.optical(row.executed.optical, fixture.streams[1]);
          for (const f of row.learning.created.filter(e => e.A.startsWith('action:'))) assert.ok(row.copy.some(e => e.id === f.A));
        }
      }
      assert.equal(group.actions.length, 20 * n); assert.deepEqual(group.actions.map(({ t, action }) => ({ t, action })), group.environment);
      results.push({ amplitude: group.amplitude, trials: 20, executions: group.actions.length });
    }
    return results;
  });
  gate('reward-independence', () => {
    const data = read(`${dir}/reward.json.gz`), first = data[0]; assert.equal(data.length, 4);
    for (const r of data) { assert.equal(r.duration, 60000); assert.equal(r.samples, 120000);
      if (r.mode === 'positive') assert.deepEqual(r.rewardRange, [17, 17]); if (r.mode === 'negative') assert.deepEqual(r.rewardRange, [-23, -23]);
      if (r.mode === 'on') assert.ok(r.rewardRange[0] < 0 && r.rewardRange[1] > 0);
      for (const k of ['rows', 'hashes', 'channels', 'downward', 'actions']) assert.deepEqual(r[k], first[k]); }
    assert.ok(first.actions.length > 0); return { durationMs: 60000, modes: data.map(r => r.mode), actions: first.actions.length };
  });
  const observations = [], changes = [], episodeRows = schedule.episodes.map(() => []); let windows = 0;
  gate('continuous-physical-loop-and-accounting', () => {
    const initial = read(`${dir}/continuous/initial.json.gz`), final = read(`${dir}/continuous/final.json.gz`), index = read(`${dir}/continuous/index.json`);
    for (const file of index.chunks) for (const row of read(`${dir}/continuous/${file}`)) {
      assert.equal(row.t, windows++ * 100);
      a.optical(row.sensory, fixture.streams[0]); a.optical(row.executed.optical, fixture.streams[1]); row.body.optical.forEach((o, i) => a.optical(o, fixture.streams[2 + i]));
      assert.deepEqual(row.temporal.onsets, row.learning.onsets);
      assert.deepEqual(row.observations, [...row.sensory.readout, ...row.body.observations, ...row.copy]);
      assert.ok(row.learning.counts.every(c => [0, 1].includes(c.N))); assert.ok(row.goal.counts.every(c => [0, 1].includes(c.M)));
      assert.equal(row.copy.length, Number(row.executed.action !== null));
      assert.deepEqual(row.environment.executed, row.executed.action === null ? [] : [{ t: row.t, action: row.executed.action }]);
      for (const f of row.learning.created.filter(f => f.A.startsWith('action:'))) assert.ok(row.copy.some(e => e.id === f.A));
      for (const e of row.bodyEvents) { assert.ok(e.age > 0 && e.age <= 500 && !e.missingTrace); a.near(e.t - e.trace.t, e.age);
        a.near(e.strength, Math.min(e.onsetStrength, e.trace.strength * Math.exp(-e.age / 400)));
        assert.ok(row.body.bins.some(b => b.id === e.onsetId && b.strength === e.onsetStrength)); }
      observations.push({ t: row.t, readouts: row.observations }); changes.push(...row.learning.changes);
      const e = schedule.episodes.findIndex(e => row.t >= e.start && row.t < e.start + 20000);
      if (e >= 0) episodeRows[e].push(row);
    }
    assert.equal(windows, schedule.duration / 100); assert.equal(final.pipeline.t, schedule.duration);
    const ledger = auditLedger({ ids: initial.pipeline.ids, labels: initial.pipeline.labels,
      initial: { ...initial.pipeline.learning, future: { ...initial.pipeline.learning.future, t: -100 } },
      observations, changes, end: final.pipeline.learning.future.t, expected: final.pipeline.learning });
    const higher = read(`${dir}/continuous/higher.json.gz`); a.higherMembers(higher); const exposure = a.rho(higher.presentations, higher.channels);
    assert.ok(final.pipeline.actions.length > 0 && final.pipeline.body.changes.events.length > 0);
    return { windows, durationMs: schedule.duration, ledger, higher: exposure, actions: final.pipeline.actions.length, bodyEvents: final.pipeline.body.changes.events.length };
  }, 'observer');
  gate('continuous-goal-body-success', () => {
    assert.equal(windows, schedule.duration / 100); const results = [];
    for (const kind of protocol.kinds) {
      const rows = schedule.episodes.filter(e => e.kind === kind).map(e => {
        const actual = episodeRows[e.index], first = actual.find(r => r.executed.action !== null);
        const outcome = actual.some(r => r.t < e.start + 6000 && r.learning.onsets.some(o => o.id === e.outcome));
        return { index: e.index, firstAction: first?.executed.action ?? null, expected: e.action, outcome, correct: first?.executed.action === e.action && outcome };
      });
      results.push({ kind, correct: rows.filter(e => e.correct).length, total: rows.length, rows });
    }
    details.continuousBehavior = results;
    for (const r of results) assert.ok(r.total === 10 && r.correct / r.total >= .9, `${r.kind}: ${r.correct}/${r.total}`);
    const final = read(`${dir}/continuous/final.json.gz`);
    assert.equal(final.pipeline.actions.filter(e => e.t >= schedule.episodes.length * 20000).length, 0, 'setpoint actions');
    return results;
  });
  gate('continuous-timely-prediction', () => {
    const result = schedule.episodes.map(e => {
      const rows = episodeRows[e.index], first = rows.find(r => r.executed.action !== null);
      const onset = rows.find(r => r.learning.onsets.some(o => o.id === e.outcome));
      // A two-step goal is predicted from the real intermediate sensory onset.
      // Requiring an unlearned direct action->root edge was an r1 observer bug.
      const launched = rows.filter(r => first && onset && r.t >= first.t && r.t < onset.t)
        .flatMap(r => r.learning.created.filter(p => p.B === e.outcome && r.learning.onsets.some(o => o.id === p.A)));
      const timely = Boolean(onset && launched.some(p => Math.abs(p.tArrive - onset.t) <= 500));
      return { episode: e.index, launched, targetOnset: onset?.t ?? null, timely };
    });
    details.continuousPredictions = result;
    const successes = result.filter(r => r.timely).length; assert.ok(successes / result.length >= .9); return { successes, total: result.length };
  });
  gate('exact-snapshot-continuation', () => {
    const rows = [];
    for (const cut of schedule.snapshotCuts) {
      const initial = read(`${dir}/continuous/cut-${cut}/initial.json.gz`), resumed = read(`${dir}/continuous/cut-${cut}/resumed.json.gz`), final = read(`${dir}/continuous/cut-${cut}/reference-final.json.gz`);
      assert.deepEqual(initial, resumed.restored); assert.deepEqual(resumed.final, final); assert.equal(resumed.rows.length, 100);
      assert.deepEqual(resumed.rows.map(hash), resumed.referenceRowHashes);
      // Reopen uninterrupted rows, rather than trusting collector's hash list.
      const index = read(`${dir}/continuous/index.json`), actual = [];
      for (const file of index.chunks) {
        const start = Number(file.match(/windows-(\d+)/)?.[1] ?? Infinity);
        if (start + 100 <= cut || start >= cut + 100) continue;
        actual.push(...read(`${dir}/continuous/${file}`).filter(r => r.t / 100 >= cut && r.t / 100 < cut + 100));
      }
      assert.deepEqual(resumed.rows, actual); rows.push({ cut, windows: 100, exact: true });
    }
    return rows;
  });
  gate('core-five-center-and-near-far', () => {
    const { scalar: s } = read(`${dir}/core.json.gz`), members = s.M2.members.map(m => m.members), result = [];
    for (let i = 0; i < 5; i++) {
      const replays = s.M2.replay.filter(r => r.classIndex === i), counts = empty(); assert.equal(replays.length, 20);
      for (const r of replays) { const sample = s.samples[r.presentation], emission = empty(); sample.sources.forEach(c => emission[c] = 1);
        a.field(s.channels, emission, sample.input, r); r.lit.forEach(c => counts[c]++); }
      assert.deepEqual(counts, s.M2.members[i].propagatedCounts); assert.deepEqual(members[i], counts.flatMap((n, c) => n >= 10 ? [c] : []));
      const p = s.probes[i]; assert.ok(jaccard(p.full.lit, members[i]) >= .8);
      assert.ok(intersection(p.half.lit, members[i]).length / members[i].length >= .9);
      for (let j = 0; j < 5; j++) if (i !== j) {
        assert.ok(jaccard(members[i], members[j]) <= .2); const ex = members[j].filter(c => !members[i].includes(c)); assert.ok(ex.length > 0);
        const spill = intersection(p.full.lit, ex).length / ex.length; assert.ok(spill <= .05);
        result.push({ from: i, to: j, shared: intersection(members[i], members[j]), exclusive: ex, spill });
      }
    }
    for (const r of s.nearFar) assert.ok(jaccard(r.fields[0].field.lit, r.fields[1].field.lit) > jaccard(r.fields[0].field.lit, r.fields[2].field.lit));
    return result;
  });
  gate('higher-five-pattern-full-half-recognition', () => {
    const data = read(`${dir}/higher.json.gz`), ids = [...new Set(data.probes.map(p => p.id))], result = [];
    assert.equal(ids.length, 5);
    for (const id of ids) {
      const member = data.catalogue.find(e => e.id === id).members[0], probes = data.probes.filter(p => p.id === id); assert.equal(probes.length, 20);
      let full = 0, half = 0;
      for (const p of probes) {
        const F = p.full.history[0].fields[0]?.replicas[0], H = p.half.history[0].fields[0]?.replicas[0]; assert.ok(F && H);
        a.field(data.channels, [...p.fullInput, ...Array(7).fill(0)], 1 / 6, F);
        a.field(data.channels, [...p.halfInput, ...Array(7).fill(0)], 1 / 6, H);
        assert.ok(jaccard(F.lit, member) >= .8); assert.ok(intersection(H.lit, member).length / member.length >= .9);
        full += Number(p.full.readout.some(r => r.id === id && r.strength > .25)); half += Number(p.half.readout.some(r => r.id === id && r.strength > .25));
        assert.ok(p.full.readout.every(r => r.id === id)); assert.ok(p.half.readout.every(r => r.id === id));
      }
      assert.ok(full >= 18 && half >= 18); result.push({ id, full, half });
      for (const other of ids.filter(x => x !== id)) assert.ok(jaccard(member, data.catalogue.find(e => e.id === other).members[0]) <= .2);
    }
    return result;
  });
  gate('relief-single-edge-ratios', () => {
    const data = read(`${dir}/relief.json.gz`), result = [];
    for (const group of data) {
      for (const p of group.probes) { a.optical(p.row.executed.optical, fixture.streams[1]); a.near(p.row.executed.strength, 1);
        assert.equal(p.executed.length, 1); assert.equal(p.row.copy[0].id, `action:${p.action}`); }
      const cause = group.probes.find(p => `action:${p.action}` === group.cause), controls = group.probes.filter(p => p !== cause);
      const W = Math.max(0, ...cause.rules.map(w => w.W)), F = Math.max(0, ...cause.forecasts.map(f => f.strength)),
        nonW = Math.max(0, ...controls.flatMap(p => p.rules.map(w => w.W))), nonF = Math.max(0, ...controls.flatMap(p => p.forecasts.map(f => f.strength)));
      assert.ok(W / .1 > .3 && F > 0 && W >= 5 * nonW && F >= 5 * nonF);
      result.push({ target: group.target, W, F, nonW, nonF, WRatio: nonW ? W / nonW : null, FRatio: nonF ? F / nonF : null, zeroDenominator: !nonW && !nonF });
    }
    return result;
  });
  gate('second-adapter-reward-independence', () => {
    const data = read(`${dir}/second-reward.json.gz`), first = data.replays[0];
    for (const r of data.replays) { assert.equal(r.rows.length, 600); assert.equal(r.samples, 120000);
      if (r.mode === 'positive') assert.deepEqual(r.rewardRange, [17, 17]); if (r.mode === 'negative') assert.deepEqual(r.rewardRange, [-23, -23]);
      if (r.mode === 'on') assert.ok(r.rewardRange[0] < 0 && r.rewardRange[1] > 0);
      for (const k of ['rows', 'channels', 'final', 'bodyEvents']) assert.deepEqual(r[k], first[k]); }
    for (const row of first.rows) { a.optical(row.sensory, data.streams[0]); a.optical(row.executed.optical, data.streams[1]);
      row.body.optical.forEach((o, i) => a.optical(o, data.streams[i + 2])); }
    return { durationMs: 60000, modes: 4, declarations: data.declarations };
  });
  gate('malformed-snapshot-atomicity', () => {
    const data = read(`${dir}/continuous/malformed.json.gz`); assert.ok(data.rejected.length >= 12);
    assert.deepEqual(data.initial, data.final);
    for (const r of data.rejected) { assert.ok(r.reason && r.rootRetained); assert.equal(r.before, r.after); assert.notEqual(r.malformedHash, hash(data.initial)); }
    return { rejected: data.rejected.length, atomicChanges: 0 };
  });
  const collection = read(`${dir}/collection.json`);
  for (const failure of collection.failures) decisions.push({ name: `collection:${failure.name}`, pass: false, ...failure });
  const membershipReproduced100Percent = ['natural-optical-membership-and-learning', 'temporal-arithmetic-and-membership', 'higher-level-three-membership', 'continuous-physical-loop-and-accounting']
    .every(name => decisions.find(d => d.name === name)?.pass);
  decisions.push({ name: 'independent-membership-and-arithmetic-acceptance', pass: membershipReproduced100Percent && a.maxError <= 1e-12,
    ...(!membershipReproduced100Percent ? { classification: 'model', reason: 'At least one saved membership cannot be reproduced from its frozen replay fields; 100% membership agreement is not established.' } : {}) });
  return { seed: schedule.seed, pass: decisions.every(d => d.pass), decisions, details,
    audit: { savedFieldsOnly: true, maxArithmeticDiscrepancy: a.maxError, arithmeticComparisons: a.arithmetic,
      fieldsChecked: a.fields, membershipsChecked: a.memberships, membershipReproduced100Percent, decisions: decisions.length } };
}
