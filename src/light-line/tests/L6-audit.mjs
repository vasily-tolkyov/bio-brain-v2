import assert from 'node:assert/strict';
import { auditLedger } from './L6-ledger-audit.mjs';
import { auditLearning } from './L5-optics.mjs';
const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 1e-12, `${a} != ${b}`);

export function auditP7(o) {
  for (const r of o.readings) {
    const entry = o.mapping.find(e => e.id === r.localId);
    let integral = 0;
    for (const h of o.history) {
      const dt = Math.max(0, Math.min(o.end, h.end) - Math.max(o.end - 100, h.start));
      const field = h.fields.find(f => f.carrier === entry.carrier);
      for (const [replica, members] of entry.members.entries()) for (const cell of members) {
        integral += dt * (field?.replicas[replica].brightness[cell] ?? 0) / (100 * entry.members.length * members.length);
      }
    }
    near(r.strength, integral);
  }
  for (const r of o.readout) near(r.strength, Math.max(0, ...o.readings.filter(e => e.id === r.id).map(e => e.strength)));
}

/** Check source emissions, max-product fixed point and every positive path
 * directly against saved rho/color samples. No production solver is called. */
export function fieldAuditor(streams) {
  const checked = new Set();
  return o => {
    auditP7(o);
    const stream = streams.find(s => JSON.stringify(s.names) === JSON.stringify(o.readout.map(r => r.id)));
    assert.ok(stream);
    let at = o.end - 100;
    for (const segment of o.segments) {
      const h = o.history.find(h => h.start === at);
      assert.ok(h && h.end === at + segment.durationMs);
      const signature = JSON.stringify([stream.names, segment.values, h.fields]);
      at += segment.durationMs;
      if (checked.has(signature)) continue;
      checked.add(signature);
      const active = stream.ports.filter((p, i) => segment.values[i] > 0);
      assert.deepEqual(h.fields.map(f => f.carrier), active.map(p => p.carrier).sort((a, b) => a - b));
      for (const field of h.fields) {
        const emitted = Array(250).fill(0);
        for (const p of active.filter(p => p.carrier === field.carrier)) for (const cell of p.sources) emitted[cell] = segment.values[p.port];
        const B = field.replicas[0].brightness, next = [...emitted], edgeWeights = new Map();
        for (const e of stream.channels) {
          const color = Math.min(1, e.samples.reduce((s, x) => s + Math.exp(-.5 * ((x - field.carrier) / .05) ** 2), 0));
          const weight = color * e.rho ** 4 / (e.rho ** 4 + (1.5 * (1 - e.rho)) ** 4);
          edgeWeights.set(e.i * 250 + e.j, weight);
          next[e.i] = Math.max(next[e.i], weight * B[e.j]); next[e.j] = Math.max(next[e.j], weight * B[e.i]);
        }
        for (let cell = 0; cell < 250; cell++) {
          near(B[cell], next[cell]);
          const path = field.replicas[0].paths[cell];
          let value = path.length ? emitted[path[0]] : 0;
          if (path.length) assert.equal(path.at(-1), cell);
          for (let j = 1; j < path.length; j++) value *= edgeWeights.get(Math.min(path[j - 1], path[j]) * 250 + Math.max(path[j - 1], path[j]));
          near(B[cell], value);
        }
      }
    }
  };
}

function auditBody(events, rows) {
  for (const event of events) {
    assert.ok(event.age <= 500 && event.age > 0 && !event.missingTrace);
    near(event.t - event.trace.t, event.age);
    near(event.strength, Math.min(event.onsetStrength, event.trace.strength * Math.exp(-event.age / 400)));
    const row = rows.find(r => r.t === event.t);
    assert.ok(row, 'Missing physical body witness');
    const bin = row.body.bins.find(b => b.id === event.onsetId);
    near(bin.strength, event.onsetStrength);
    assert.ok(row.body.changes.some(c => c.id === event.id && c.strength === event.strength));
    row.optical.forEach(auditP7);
  }
}

export function auditRho(stream) {
  const state = new Map();
  for (const event of stream.presentations) {
    const supplied = new Set(event.sources);
    for (const i of supplied) for (const j of supplied) if (i < j && !state.has(i * 250 + j)) {
      state.set(i * 250 + j, { i, j, rho: 0, samples: [] });
    }
    for (const edge of state.values()) {
      const a = supplied.has(edge.i), b = supplied.has(edge.j);
      if (a && b) { edge.rho = 1 - (1 - edge.rho) * .8 ** event.strengthScale; edge.samples.push(event.carrier); }
      else if (a !== b) edge.rho *= .96 ** event.strengthScale;
    }
  }
  assert.equal(state.size, stream.channels.length);
  for (const e of stream.channels) {
    const r = state.get(e.i * 250 + e.j); near(e.rho, r.rho); assert.deepEqual(e.samples, r.samples);
    e.H.forEach((x, bin) => near(x, r.samples.reduce((s, c) => s + Math.exp(-.5 * ((bin / 199 - c) / .05) ** 2), 0)));
  }
  return { events: stream.presentations.length, channels: state.size };
}

export function auditOptical(data, windows) {
  const streams = data.controls.map(({ names, samples }) => {
    let maxCprime = 0, litPeak = 0, sum = 0, fields = 0, colorLitPeak = 0, unionLitPeak = 0, unionSum = 0;
    const members = names.map((_, i) => samples.find(s => s.mask === 1 << i).optical.history.at(-1).fields[0].replicas[0].lit);
    const shared = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const exclusive = members[j].filter(c => !members[i].includes(c));
      assert.ok(exclusive.length >= 3, 'Collapsed isolated optical groups');
      shared.push({ a: names[i], b: names[j], cells: members[i].filter(c => members[j].includes(c)) });
    }
    const measured = [];
    for (const sample of samples) {
      auditP7(sample.optical);
      const opticalFields = sample.optical.history.at(-1).fields;
      const union = new Set(opticalFields.flatMap(f => f.replicas[0].lit));
      unionLitPeak = Math.max(unionLitPeak, union.size); unionSum += union.size;
      colorLitPeak = Math.max(colorLitPeak, opticalFields.reduce((s, f) => s + f.replicas[0].lit.length, 0));
      if (sample.mask === 0) assert.equal(opticalFields.length, 0);
      const active = sample.values.flatMap((v, i) => v ? [i] : []), activeMembers = new Set(active.flatMap(i => members[i]));
      for (const field of opticalFields) {
        const B = field.replicas[0].brightness, lit = B.filter(b => b > .3).length;
        litPeak = Math.max(litPeak, lit); sum += lit; fields++;
        for (let i = 0; i < names.length; i++) if (!active.includes(i)) {
          const exclusive = members[i].filter(c => !activeMembers.has(c));
          assert.ok(exclusive.length >= 3);
          const Cprime = exclusive.filter(c => B[c] > .3).length / exclusive.length;
          maxCprime = Math.max(maxCprime, Cprime); measured.push({ mask: sample.mask, carrier: field.carrier, target: names[i], Cprime });
        }
      }
      if (active.length === 1) assert.ok(sample.optical.readout.filter(r => r.strength > .25).length < names.length || names.length === 1);
    }
    assert.ok(maxCprime <= .05);
    return { names, blankLight: 0, maxCprime, litPeak, meanLitOccupancy: sum / Math.max(1, fields) / 250,
      colorLitPeak, unionLitPeak, meanUnionOccupancy: unionSum / samples.length / 250, shared, measured };
  });
  const peaks = windows.map(w => w.temporalLit), temporalPeak = Math.max(...peaks);
  assert.ok(temporalPeak < 125);
  return { streams, temporalPeak, temporalMeanOccupancy: peaks.reduce((s, x) => s + x, 0) / peaks.length / 250 };
}

export function auditRun(run) {
  const formation = run.formation.streams.map(auditRho);
  const auditFields = fieldAuditor(run.formation.streams);
  const allAreas = [];
  const r = run.rules;
  const ledger = auditLedger({ ids: r.ids, labels: r.labels,
    observations: r.windows.map(w => ({ t: w.t, readouts: w.observations })), end: r.state.future.t,
    expected: r.state, changes: r.windows.flatMap(w => w.changes) });
  const temporal = auditLearning(r.temporal.presentations, r.temporal.channels);
  assert.deepEqual(r.temporal.blankFields, []);
  auditBody(r.bodyEvents, r.events);
  r.events.forEach(row => row.optical.forEach(auditFields));
  const motors = run.motor.map(group => {
    assert.equal(group.trials.length, 20);
    const expected = ['below-gate', 'weak'].includes(group.name) ? 0 : 1;
    for (const trial of group.trials) {
      assert.equal(trial.rows.filter(r => r.executed.action !== null).length, expected);
      assert.equal(trial.rows.flatMap(r => r.copy).length, expected);
      assert.equal(trial.rows.flatMap(r => r.learning.onsets).filter(e => e.id.startsWith('action:')).length, expected);
      for (const row of trial.rows) {
        assert.deepEqual(row.temporal.onsets, row.learning.onsets);
        allAreas.push({ temporalLit: row.temporal.peak });
        row.optical.forEach(auditFields);
        for (const forecast of row.learning.created.filter(e => e.A.startsWith('action:'))) {
          assert.ok(row.copy.some(e => e.id === forecast.A), 'Unsent action forecast');
        }
        if (row.executed.action !== null) { assert.equal(row.executed.action, 'press'); assert.ok(row.executed.strength >= .75); }
      }
    }
    assert.equal(group.envActions.length, expected * 20);
    assert.equal(group.copies.length, group.envActions.length);
    return { name: group.name, trials: 20, executions: group.envActions.length, copies: group.copies.length };
  });
  const episodes = run.goals.groups.map(group => {
    assert.equal(group.episodes.length, 10);
    let correct = 0;
    for (const e of group.episodes) {
      assert.equal(e.WBefore, e.WAfter);
      const outcome = e.rows.flatMap(r => r.learning.onsets).some(o => o.id === group.outcome);
      if (e.actions[0]?.action === group.action && outcome) correct++;
      for (const row of e.rows) {
        assert.deepEqual(row.temporal.onsets, row.learning.onsets);
        allAreas.push({ temporalLit: row.temporal.peak });
        row.optical.forEach(auditFields);
        for (const count of row.goal.counts) assert.ok([0, 1].includes(count.M));
        for (const count of row.learning.counts) assert.ok([0, 1].includes(count.N));
      }
      auditBody(e.bodyEvents, e.rows);
      assert.deepEqual(e.actions.map(a => ({ t: a.t, action: a.action })), e.envActions);
    }
    assert.ok(correct >= 9, `${group.name}: ${correct}/10`);
    return { name: group.name, correct, total: 10 };
  });
  assert.equal(run.goals.setpoint.duration, 10000); assert.equal(run.goals.setpoint.actions.length, 0);
  for (const r of run.relief) {
    const causal = r.probes.find(p => p.A === r.cause), other = r.probes.filter(p => p.A !== r.cause);
    const W = Math.max(0, ...causal.rules.map(w => w.W)), F = Math.max(0, ...causal.forecasts.map(f => f.strength));
    const maxW = Math.max(0, ...other.flatMap(p => p.rules.map(w => w.W))), maxF = Math.max(0, ...other.flatMap(p => p.forecasts.map(f => f.strength)));
    near(W, r.W); near(F, r.F); near(maxW, r.maxNoncausalW); near(maxF, r.maxNoncausalF);
    assert.ok(W / .1 > .3 && F > 0 && W >= 5 * maxW && F >= 5 * maxF);
    for (const p of r.probes) {
      auditFields(p.motor); near(p.strength, 1);
      assert.equal(p.executed.length, 1); assert.equal(p.copy.length, 1);
      assert.equal(p.A, `action:${p.executed[0].action}`); assert.equal(p.copy[0].id, p.A);
      for (const f of p.forecasts) {
        near(f.activation, 1); near(f.strength, p.rules.find(w => w.ruleKey === f.ruleKey).W / .1);
      }
    }
  }
  const produced = [...new Set(r.bodyEvents.filter(e => e.to > e.from).map(e => e.id))];
  assert.deepEqual(produced.sort(), run.relief.map(e => e.target).sort());
  const rewards = run.reward.map(world => {
    const base = world.replays[0];
    assert.deepEqual(world.replays.map(r => r.mode), ['off', 'on', 'positive', 'negative']);
    for (const replay of world.replays) {
      assert.equal(replay.duration, 60000);
      assert.equal(replay.sampleCount, 120000);
      if (replay.mode === 'positive') assert.deepEqual(replay.rewardRange, [17, 17]);
      if (replay.mode === 'negative') assert.deepEqual(replay.rewardRange, [-23, -23]);
      if (replay.mode === 'on') assert.ok(replay.rewardRange[0] < 0 && replay.rewardRange[1] > 0);
      for (const key of ['histories', 'weights', 'input', 'actions', 'copies', 'channelsHash', 'channelTimeline', 'rawInputHash', 'finalW', 'bodyEvents']) assert.deepEqual(replay[key], base[key], `${world.world} ${replay.mode} ${key}`);
      assert.ok(Math.max(...replay.temporalPeaks) < 125);
      allAreas.push(...replay.temporalPeaks.map(temporalLit => ({ temporalLit })));
    }
    assert.ok(base.actions.length > 0);
    return { world: world.world, duration: 60000, modes: 4, identical: true, actions: base.actions.length };
  });
  for (const c of run.optical.controls) for (const s of c.samples) auditFields(s.optical);
  const optics = auditOptical(run.optical, [...r.windows, ...allAreas]);
  return { pass: true, seed: run.seed, formation, ledger, temporal, motors, episodes,
    setpointActions: 0, bodyChanges: r.bodyEvents.length, relief: run.relief.map(({ probes, ...r }) => r), rewards, optics };
}
