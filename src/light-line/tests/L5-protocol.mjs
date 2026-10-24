import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeLightRng } from '../core/light-base.mjs';
import { TemporalStack } from '../temporal-stack.mjs';
import { PredictionLearning } from '../learning.mjs';
import { FutureSlices } from '../predict.mjs';
import { GoalActions } from '../goals.mjs';
import { actionRequest, reverseLookup, predictedOutcomes } from '../reverse-chain.mjs';
import { p7 } from '../readout.mjs';

export const PROTOCOL = Object.freeze({ seeds: [7, 19, 31], developmentSeed: 101,
  ambientSnapshots: 1500, acquisitionEpisodes: 320, slotMs: 25000, delayMs: 3000,
  sourceDurationMs: 27, targetDurationMs: 100, probes: 20,
  phases: { paired: 10, omitted: 60, recovery: 60, jitter: 30, alternating: 30 },
  jitterMs: [-300, -200, -100, 0, 100, 200, 300],
  description: 'Independent ambient snapshots; external paired events and an independent distractor per slot. Shuffled delay is drawn independently from all eight positive bins. Fixed physical 27 ms source exposure in a 100 ms readout window keeps source P7 just above its established threshold; no W/rho/eta tuning. Jitter and alternating branches restore paired10, as in M6.',
});
export const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clone = x => structuredClone(x);
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12, `${a} != ${b}`);
const zero = () => Array(27).fill(0);
export const snapshot = (support, probe = 0) => Array.from({ length: 27 }, (_, i) =>
  support.includes(i) ? .9 + probe * .004 : .1 + probe * .01 + .02 * ((i % 9) + 1) / 10);

export function supports(seed) {
  const rng = makeLightRng(seed ^ 0x4a31), columns = Array.from({ length: 9 }, (_, i) => i);
  for (let i = 8; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1)); [columns[i], columns[j]] = [columns[j], columns[i]];
  }
  const row = Math.floor(rng.uniform() * 3);
  return Array.from({ length: 5 }, (_, i) => i < 4
    ? columns.slice(i * 2, i * 2 + 2).map(c => row * 9 + c)
    : columns.slice(0, 2).map(c => ((row + 1) % 3) * 9 + c));
}
export function segments(input, duration = 100) {
  return [...(duration < 100 ? [{ input: zero(), durationMs: 100 - duration }] : []),
    { input, durationMs: duration }];
}
function measured(stack, input, duration) {
  const parts = segments(input, duration), optical = stack.replaySnapshot(parts);
  return { segments: parts, optical, observations: optical.readout };
}
const weight = (p, A, B, k = 6) => p.downward.weights.find(w => w.A === A && w.B === B && w.k === k);
const ledgerSum = changes => Object.fromEntries(['STDP', 'N', 'miss', 'clamp'].map(k =>
  [k, changes.reduce((sum, c) => sum + c.deltas[k], 0)]));
function auditChanges(changes) {
  for (const c of changes) near(c.after - c.before, Object.values(c.deltas).reduce((a, b) => a + b, 0));
}
function observed(p, t, readouts, changes) {
  const r = p.step(t, readouts);
  changes.push(...clone(r.changes));
  return r;
}

/** Freeze/discover precedes evaluator names. No fixture name enters optics. */
export function opticalBase(seed) {
  const stack = new TemporalStack({ seed }), spatial = supports(seed), rng = makeLightRng(seed ^ 0x4b42);
  const ambient = [];
  for (let i = 0; i < PROTOCOL.ambientSnapshots; i++) {
    const event = Math.floor(rng.uniform() * 5), input = snapshot(spatial[event]);
    ambient.push(event); stack.presentSnapshot(input);
  }
  stack.freezeSnapshot();
  const catalogue = stack.discoverSnapshot();
  const measurements = spatial.map(s => measured(stack, snapshot(s), 100));
  const ids = measurements.map(m => {
    const identified = m.optical.identification.filter(e => e.id !== null);
    assert.equal(identified.length, 1); return identified[0].id;
  });
  assert.equal(new Set(ids).size, 5);
  return { stack, spatial, ambient, catalogue, ids, measurements };
}

export function acquire(seed, shuffled = false) {
  const base = opticalBase(seed), { stack, spatial, ids } = base;
  const p = new PredictionLearning(ids), rng = makeLightRng(seed ^ 0x5312), timing = makeLightRng(seed ^ 0x6323);
  const source = measured(stack, snapshot(spatial[0]), PROTOCOL.sourceDurationMs);
  const target = base.measurements[1], distractor = measured(stack, snapshot(spatial[2]), PROTOCOL.sourceDurationMs);
  const events = [], changes = [], launches = [], observations = [], concurrent = [];
  let partialState;
  for (let episode = 0; episode < PROTOCOL.acquisitionEpisodes; episode++) {
    const start = episode * PROTOCOL.slotMs;
    const delay = shuffled ? 100 * 2 ** Math.floor(timing.uniform() * 8) : PROTOCOL.delayMs;
    const bird = 100 * Math.floor(rng.uniform() * 240);
    const slot = [{ time: start, event: 0, duration: 27, reading: source },
      { time: start + delay, event: 1, duration: 100, reading: target },
      { time: start + bird, event: 2, duration: 27, reading: distractor }];
    events.push(...slot.map(({ reading, ...e }) => e));
    // The actual optical stack receives every onset and offset in time order.
    const boundaries = [...new Set(slot.flatMap(e => [e.time, e.time + e.duration]))].sort((a, b) => a - b);
    for (const t of boundaries) {
      const active = slot.filter(e => t >= e.time && t < e.time + e.duration);
      const supplied = active.flatMap(e => spatial[e.event]);
      stack.observe(t, supplied.length ? snapshot(supplied) : zero());
    }
    for (let t = start; t < start + PROTOCOL.slotMs; t += 100) {
      const active = slot.filter(e => e.time === t);
      // Concurrent events are measured together, not merged semantic strengths.
      let readouts = active.flatMap(e => e.reading.observations);
      if (active.length > 1) {
        const bounds = [...new Set([0, 100, ...active.map(e => e.duration)])].sort((a, b) => a - b);
        const parts = bounds.slice(0, -1).map((b, i) => ({ durationMs: bounds[i + 1] - b,
          input: snapshot(active.filter(e => e.duration > b).flatMap(e => spatial[e.event])) }));
        const optical = stack.replaySnapshot(parts);
        readouts = optical.readout; concurrent.push({ t, segments: parts, optical });
      }
      if (readouts.length) observations.push({ t, readouts: clone(readouts) });
      const r = observed(p, t, readouts, changes);
      if (r.created.length) launches.push(...clone(r.created));
    }
    if (episode === 11) partialState = p.saveState();
  }
  stack.freeze();
  const higherCatalogue = stack.discover();
  const state = p.saveState(); auditChanges(changes);
  return { ...base, p, source, target, distractor, events, changes, launches, observations, concurrent, state, partialState, higherCatalogue,
    audit: { snapshotCatalogue: base.catalogue, higherCatalogue, channels: stack.channels(),
      opticalParameters: stack.parameters, source, target, distractor,
      lowerPresentations: stack.snapshotPresentations, upperPresentations: stack.presentations,
      trainingFrames: stack.higherTrainingFrames } };
}

/** F is one actual launched contributor on a fixed, measured source P7. */
export function forecast(p, A, B, strength, k = 6) {
  const future = new FutureSlices(p.future.past.ids, clone(p.downward));
  const t = p.future.t + 100;
  future.update(t, [{ id: A, strength }]);
  const all = future.created.filter(e => e.B === B);
  return { F: all.find(e => e.A === A && e.k === k)?.strength ?? 0,
    strongest: Math.max(0, ...all.map(e => e.strength)), total: all.reduce((sum, e) => sum + e.strength, 0), created: all };
}
function resumed(state) { return new PredictionLearning(state.future.past.ids).loadState(clone(state)); }

export function nextItem(causal, shuffled) {
  const { ids: [A, B, C], stack, spatial } = causal;
  const strength = causal.source.observations.find(e => e.id === A).strength;
  const control = { shuffled: forecast(shuffled.p, A, B, strength), distractor: forecast(causal.p, C, B, strength) };
  const trials = [];
  const opticalBefore = hash([stack.channels(), stack.catalogue, stack.copyState(), stack.higherTrainingFrames]);
  for (let probe = 0; probe < 20; probe++) {
    const p = resumed(causal.state).freeze(), before = hash(p.downward), start = p.future.t + 100;
    const sourceInput = snapshot(spatial[0], probe), targetInput = snapshot(spatial[1], probe);
    const launch = p.stepVisual(start, stack, segments(sourceInput, 27));
    const contributor = launch.created.find(e => e.A === A && e.B === B && e.k === 6);
    const history = [], arrivals = []; let matched = null;
    for (let t = start + 100; t <= start + 3800; t += 100) {
      const result = t === start + 3000 ? p.stepVisual(t, stack, segments(targetInput)) : p.step(t, []);
      if (result.optical) history.push(result.optical);
      arrivals.push(...result.arrivals.filter(e => e.ruleKey === contributor?.ruleKey).map(e => ({ ...e, observedAt: t })));
      const pending = p.novelty.pending.find(e => e.generation === contributor?.generation && e.tOnset === start);
      if (pending?.matched) matched = clone(pending);
    }
    assert.equal(hash(p.downward), before);
    trials.push({ probe, source: launch.optical, target: history, contributor, arrivals, matched,
      timely: !!contributor && contributor.tArrive === start + 3200 && arrivals.some(e => e.observedAt === start + 3200),
      match: matched?.matched === 1, frozen: before === hash(p.downward),
      pendingAfter: p.novelty.pending.length, creditsAfter: p.factor.predictions.length });
  }
  const causalF = forecast(causal.p, A, B, strength);
  const flags = { positive: causalF.F > 0, timely: trials.filter(t => t.timely).length >= 18,
    matched: trials.filter(t => t.match).length >= 18,
    shuffled: causalF.F >= 5 * control.shuffled.strongest,
    distractor: causalF.F >= 5 * control.distractor.strongest,
    opticalFrozen: opticalBefore === hash([stack.channels(), stack.catalogue, stack.copyState(), stack.higherTrainingFrames]) };
  return { sourceStrength: strength, causal: causalF, control, trials, flags };
}

export function calibration(causal) {
  const { ids: [A, B], source, target } = causal;
  const strength = source.observations.find(e => e.id === A).strength, key = JSON.stringify([A, 6, B]);
  let p = resumed(causal.state);
  function phase(name, count, paired, jitter = false) {
    const trials = [], initialState = p.saveState(), initial = forecast(p, A, B, strength).F;
    for (let i = 0; i < count; i++) {
      const start = p.future.t + 100, changes = [], pair = typeof paired === 'function' ? paired(i) : paired;
      const delay = 3000 + (jitter ? PROTOCOL.jitterMs[i % 7] : 0), before = weight(p, A, B)?.W ?? 0;
      for (let t = start; t < start + PROTOCOL.slotMs; t += 100) observed(p, t,
        t === start ? source.observations : pair && t === start + delay ? target.observations : [], changes);
      const selected = changes.filter(c => c.ruleKey === key), W = weight(p, A, B)?.W ?? 0;
      auditChanges(changes); const deltas = ledgerSum(selected);
      near(W - before, Object.values(deltas).reduce((a, b) => a + b, 0));
      trials.push({ start, paired: pair, delay, before, W, F: forecast(p, A, B, strength).F, deltas, changes: selected });
    }
    return { name, initial, initialState, finalState: p.saveState(), trials, trajectory: [initial, ...trials.map(t => t.F)],
      deltas: ledgerSum(trials.flatMap(t => t.changes)) };
  }
  const Aphase = phase('paired', 10, true), branch = p.saveState();
  const Bphase = phase('omitted', 60, false), Cphase = phase('recovery', 60, true);
  p = resumed(branch); const Dphase = phase('jitter', 30, true, true);
  p = resumed(branch); const Ephase = phase('alternating', 30, i => i % 2 === 0);
  const last = phase => phase.trajectory.at(-1), F0 = last(Aphase);
  const slope = xs => { const mid = (xs.length - 1) / 2;
    return xs.reduce((s, x, i) => s + (i - mid) * x, 0) / xs.reduce((s, _, i) => s + (i - mid) ** 2, 0); };
  const metrics = { F_paired10: F0, F_omission30: Bphase.trajectory[30], F_omission60: last(Bphase),
    F_recovery60: last(Cphase), F_jitter30: last(Dphase), mixedInitial: Ephase.initial, mixedFinal: last(Ephase),
    mixedSlope: slope(Ephase.trajectory), mixedLast10Slope: slope(Ephase.trajectory.slice(-10)) };
  const flags = { positive: F0 > 0, extinction: last(Bphase) <= .1 * F0 && last(Bphase) < Bphase.trajectory[30],
    recovery: last(Cphase) >= .85 * F0, jitter: last(Dphase) >= .8 * F0,
    mixed: last(Ephase) <= .95 * Ephase.initial && metrics.mixedSlope < 0 && metrics.mixedLast10Slope < 0 };
  return { fixedSourceP7: strength, ruleKey: key, metrics, flags, phases: [Aphase, Bphase, Cphase, Dphase, Ephase] };
}

/** A scoped observed-action/change fixture: no motor/body world is installed.
 * Real efference/outcome visual observations create W by the normal N ledger. */
export function goalFixture(causal) {
  const { ids: [action, change], stack, source, target } = causal;
  const p = resumed(causal.state).freeze();
  const rule = weight(p, action, change), before = hash([p.downward, stack.channels()]);
  const g = new GoalActions(p.future, [{ id: action, action: 'observed-press' }], [change]);
  assert.equal(reverseLookup(p.downward, change)[0], rule);
  assert.equal(predictedOutcomes(p.downward, action).find(w => w.B === change && w.k === 6), rule);
  g.goals.write(change);
  const start = p.future.t + 100;
  p.step(start, []); g.step(start, [], p.novelty.pending);
  const requested = actionRequest(g); assert.equal(requested.action, 'observed-press');
  assert.equal(p.future.past.entries.filter(e => e.tOnset === start).length, 0);
  g.goals.cancel(change); const cancelled = actionRequest(g); assert.equal(cancelled.action, null);
  g.goals.write(change);
  const execution = start + 100, rows = [];
  for (let t = execution; t <= execution + 3800; t += 100) {
    // Only this explicitly observed action is allowed to enter the past.
    const r = p.step(t, t === execution ? source.observations : t === execution + 3000 ? target.observations : []);
    const result = g.step(t, r.onsets, p.novelty.pending);
    if ([execution, execution + 3000, execution + 3700].includes(t)) rows.push({ t, ...clone(result), request: actionRequest(g) });
  }
  assert.equal(g.goals.entries.size, 0); assert.equal(actionRequest(g).action, null);
  assert.equal(hash([p.downward, stack.channels()]), before);
  const ownPast = p.future.past.entries.filter(e => e.tOnset >= start);
  assert.deepEqual(ownPast.map(e => [e.id, e.tOnset]), [[action, execution], [change, execution + 3000]]);
  const partial = resumed(causal.partialState).freeze(), partialRule = weight(partial, action, change);
  const drainEnd = partial.future.t + 25000;
  while (partial.future.t < drainEnd) partial.step(partial.future.t + 100, []);
  const pg = new GoalActions(partial.future, [{ id: action, action: 'observed-press' }], [change]);
  const partialBefore = hash(partial.downward), partialStart = partial.future.t + 100;
  const pendingRows = [];
  for (const [i, pendingStrength] of [0, .25, .5, .75, 1].entries()) {
    const t = partialStart + 100 * i;
    partial.step(t, []); pg.goals.write(change);
    const row = pg.step(t, [], [{ B: change, strength: pendingStrength }]);
    const count = row.counts[0]; assert.equal(count.M, 1); near(count.effective, 1 - pendingStrength);
    pendingRows.push({ pendingStrength, ...clone(row), request: actionRequest(pg) });
    pg.goals.cancel(change); assert.equal(actionRequest(pg).action, null);
  }
  const satisfaction = partial.step(partialStart + 500, target.observations);
  pg.goals.write(change); pg.step(partialStart + 500, satisfaction.onsets, partial.novelty.pending);
  assert.equal(pg.goals.entries.size, 0); assert.equal(actionRequest(pg).action, null);
  assert.equal(hash(partial.downward), partialBefore);
  assert.ok(partialRule.W > 0 && partialRule.W < rule.W);
  return { mapping: { actionId: action, changeCellId: change, goalId: change, predictedOutcomeId: rule.B },
    rule: clone(rule), sameRuleObject: true, eligible: rule.W / .1 >= .3, requested, cancelled, rows,
    partial: { rule: clone(partialRule), pendingRows, observedSatisfaction: satisfaction.onsets,
      frozenBefore: partialBefore, frozenAfter: hash(partial.downward) },
    ownPast, hypotheticalPastCount: 0, frozenBefore: before, frozenAfter: hash([p.downward, stack.channels()]) };
}

export function auditPhysical(measurement, catalogue) {
  const { optical } = measurement;
  for (const row of optical.readout) {
    const entry = catalogue.find(e => e.id === row.id);
    let independent = 0;
    for (const h of optical.history) {
      const field = h.fields.find(f => f.carrier === entry.carrier);
      const mean = entry.members[0].reduce((s, cell) => s + (field?.replicas[0].brightness[cell] ?? 0), 0) / entry.members[0].length;
      independent += (h.end - h.start) * mean / 100;
    }
    near(row.strength, independent); near(p7(optical.history, entry, optical.end), independent);
  }
}
