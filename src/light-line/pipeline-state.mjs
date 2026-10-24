/** Build and validate a detached graph. The caller replaces a single root only
 * after all layers, ledgers, caches and the environment have passed. */
import { ActionPipeline } from './action-pipeline.mjs';
import { ObservedStream } from './observed-stream.mjs';
import { ActionTemporal } from './action-temporal.mjs';
import { VisualAttractorLayer } from './visual-layer.mjs';
import { PredictionLearning } from './learning.mjs';
import { GoalActions } from './goals.mjs';
import { DriveGoals } from './drive.mjs';
import { bodyReading } from './interoception.mjs';
import { equal, check, keys, integer, unique, unit, jsonData } from './state-validation.mjs';
const copy = x => structuredClone(x);
// Arrays are explicit in the disk schema; never rely on JSON's typed-array object conversion.
const plain = x => x instanceof Float64Array ? [...x] : Array.isArray(x) ? x.map(plain) :
  x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)])) : x;
export function savePipeline(p) {
  check(typeof p.env.saveState === 'function', 'environment persistence adapter');
  return plain({ seed: p.seed, t: p.t, innate: p.innate, ids: p.ids, mapping: p.mapping, labels: [...p.labels],
    sensory: p.sensory.saveDiskState(), output: { actions: p.output.actions, previous: p.output.previous, stream: p.output.stream.saveDiskState() },
    body: p.body ? { variables: p.body.variables, streams: p.body.streams.map(s => s.saveDiskState()),
      readings: p.body.readings, changes: p.body.changes.saveState() } : null,
    temporal: { past: p.temporal.past.saveState(), layer: p.temporal.layer.saveDiskState(), last: p.temporal.last },
    learning: p.learning.saveState(), goals: p.goals.saveState(),
    drive: p.drive ? { owned: p.drive.owned, request: p.goals.driveRequest ?? null } : null,
    actions: p.actions, copies: p.copies, partial: p.partial,
    environment: { descriptor: p.env.descriptor, state: p.env.saveState() } });
}
function validateLearning(p, s) {
  const { future: f, novelty: n, factor } = s, ids = p.ids;
  const t = p.t === 0 ? null : p.t - 100;
  check(s.windows === p.t / 100 && n.t === t && factor.t === t && f.t === (t ?? 0) && f.started === (t !== null), 'pipeline/learning cursor');
  equal(f.past, p.temporal.past.saveState(), 'shared observation unroll');
  unique(f.past.previous); unique(f.past.entries, e => JSON.stringify([e.id, e.tOnset]));
  for (const e of f.past.entries) check(e.tOnset % 100 === 0 && e.strength > .25, 'onset time/strength');
  const generations = new Map();
  const bind = e => {
    check(integer(e.generation, 1) && e.generation < f.downward.nextGeneration && ids.includes(e.A) && ids.includes(e.B) &&
      e.A !== e.B && integer(e.k, 1) && e.k <= 8 && e.ruleKey === JSON.stringify([e.A, e.k, e.B]), 'generation/ID');
    const identity = [e.ruleKey, e.createdAt];
    if (generations.has(e.generation)) equal(generations.get(e.generation), identity, 'generation identity');
    else generations.set(e.generation, identity);
    check(Number.isFinite(e.createdAt) && e.createdAt >= 0 && e.createdAt <= (t ?? 0) && e.createdAt % 100 === 0, 'connection creation clock');
  };
  for (const w of f.downward.weights) {
    bind(w); keys(w, ['A', 'B', 'k', 'ruleKey', 'W', 'createdAt', 'generation', 'deltas']);
    keys(w.deltas, ['STDP', 'N', 'miss', 'clamp']);
    check(w.W > 0 && w.W <= .1 && w.deltas.STDP >= 0 && w.deltas.N >= 0 && w.deltas.miss <= 0 && w.deltas.clamp >= 0, 'W ledger ranges');
  }
  const prediction = e => {
    bind(e); check(p.learning.future.validEntry(e) && e.tOnset <= (t ?? 0) && e.tOnset % 100 === 0 && e.tArrive % 100 === 0, 'prediction');
  };
  for (const list of [f.entries, f.created, f.arrivals, n.pending]) {
    unique(list, e => JSON.stringify([e.generation, e.tOnset])); list.forEach(prediction);
  }
  for (const e of n.pending) check(e.tArrive + 500 >= t && [0, 1].includes(e.matched), 'pending deadline/bit');
  for (const c of factor.predictions) {
    const e = n.pending.find(e => e.generation === c.generation && e.tArrive === c.tArrive);
    check(e && c.ruleKey === e.ruleKey && c.sourceActivation === e.activation && c.matched === Boolean(e.matched), 'prediction credit link');
  }
  let time = -1;
  for (const w of f.windows) {
    check(w.t > time && w.t <= t && w.t % 100 === 0 && typeof w.done === 'boolean', 'future window cursor'); time = w.t;
    unique(w.real, e => e[0]); check(w.real.every(([id, v]) => ids.includes(id) && unit(v)), 'window reality IDs');
    w.arrivals.forEach(prediction);
    for (const e of w.onsets) check(ids.includes(e.id) && e.tOnset === w.t && unit(e.strength), 'window onset');
  }
  unique(f.records, r => JSON.stringify([r.t, r.B]));
  for (const r of f.records) {
    check(ids.includes(r.B) && unit(r.predStrength) && unit(r.realStrength) && integer(r.t / 100) && r.t < t, 'future record');
    r.entries.forEach(prediction); check(r.entries.every(e => e.B === r.B), 'record target');
  }
  const emitted = new Map();
  for (const e of [...f.entries, ...f.arrivals, ...f.created, ...f.windows.flatMap(w => w.arrivals), ...f.records.flatMap(r => r.entries)]) {
    const key = JSON.stringify([e.generation, e.tOnset]);
    if (emitted.has(key)) equal(emitted.get(key), e, 'shared forecast instance'); else emitted.set(key, e);
  }
  const expected = [...emitted.values()].filter(e => e.tArrive + 500 >= t);
  equal(n.pending.length, expected.length, 'pending forecast inventory');
  for (const { matched, ...e } of n.pending) equal(emitted.get(JSON.stringify([e.generation, e.tOnset])), e, 'pending forecast reference');
  for (const e of f.entries) check(e.tArrive - t >= 100 / Math.SQRT2, 'future arrival cursor');
}

export function loadPipeline(s, createEnvironment, expected) {
  jsonData(s); keys(s, ['seed', 't', 'innate', 'ids', 'mapping', 'labels', 'sensory', 'output', 'body', 'temporal',
    'learning', 'goals', 'drive', 'actions', 'copies', 'partial', 'environment']);
  check(integer(s.t / 100) && integer(s.seed) && typeof s.innate === 'boolean', 'pipeline time/seed');
  equal(s.environment.descriptor, expected.environment, 'environment identity');
  const env = createEnvironment();
  check(env !== expected.liveEnvironment && typeof env.loadState === 'function', 'detached environment factory');
  equal(env.descriptor, s.environment.descriptor); env.loadState(copy(s.environment.state));
  equal(env.saveState(), s.environment.state, 'environment lossless restore');
  const p = new ActionPipeline(env, s.seed, { innate: s.innate });
  equal(s.ids, p.ids); equal(s.mapping, p.mapping); equal(s.labels, [...p.labels]);
  equal(s.seed, expected.seed); equal(s.output.actions, p.output.actions);
  p.t = s.t; p.sensory = ObservedStream.fromDisk(s.sensory); p.output.stream = ObservedStream.fromDisk(s.output.stream);
  equal(p.sensory.names, env.features); equal(p.output.stream.names, env.actions);
  check(s.output.previous === null || env.actions.includes(s.output.previous), 'motor.previous'); p.output.previous = s.output.previous;
  if (p.body) {
    check(s.body !== null && s.body.streams.length === p.body.streams.length, 'body inventory');
    equal(s.body.variables, p.body.variables); p.body.streams = s.body.streams.map(ObservedStream.fromDisk);
    p.body.streams.forEach((stream, i) => equal(stream.names, p.body.variables[i].ids));
    if (s.body.readings !== null) bodyReading(p.body.variables, s.body.readings);
    p.body.readings = copy(s.body.readings);
    const c = s.body.changes;
    keys(c, ['previous', 'traces', 't', 'events', 'rejected']);
    check(c.t === (s.t ? s.t - 100 : null) && c.traces.length === p.body.variables.length, 'body trace clock');
    unique(c.previous); check(c.previous.every(id => p.body.variables.some(v => v.ids.includes(id))), 'body trace IDs');
    c.traces.forEach((trace, i) => { if (trace) check(integer(trace.bin) && trace.bin < p.body.variables[i].bins &&
      integer(trace.t / 100) && trace.t <= c.t && unit(trace.strength), 'body trace'); });
    for (const e of [...c.events, ...c.rejected]) check(p.body.variables[e.variable]?.featureIds.includes(e.id) &&
      integer(e.t / 100) && e.t <= c.t && e.age === e.t - e.trace.t && unit(e.strength), 'body change event');
    p.body.changes.loadState(c);
  } else equal(s.body, null);
  p.temporal = new ActionTemporal(p.ids, s.seed);
  p.temporal.layer = new VisualAttractorLayer(s.temporal.layer.identity.options).loadDiskState(s.temporal.layer);
  p.temporal.past.loadState(s.temporal.past); p.temporal.last = copy(s.temporal.last);
  if (p.temporal.last) {
    equal(p.temporal.last.t, s.t - 100); equal(p.temporal.last.lines, [...p.temporal.past.lines(p.temporal.last.t)]);
    equal(p.temporal.last.fields, p.temporal.layer.query(p.temporal.last.lines).carrierFields);
  } else check(s.t === 0, 'temporal last');
  p.learning = new PredictionLearning(p.ids).loadState(s.learning); equal(s.learning.sourceLabels, s.labels);
  validateLearning(p, s.learning);
  p.goals = new GoalActions(p.learning.future, p.output.actions.map(action => ({ action, id: `action:${action}` })),
    p.ids.filter(id => !id.startsWith('action:'))).loadState(s.goals);
  equal(s.goals.errors.t, s.t ? s.t - 100 : null);
  for (const name of ['entries', 'parents', 'links']) unique(s.goals[name], e => e[0]);
  for (const [id, parent] of s.goals.parents) {
    check(p.goals.goals.entries.has(parent) && p.goals.links.get(parent)?.id === id, 'goal ownership');
    const seen = new Set([id]); let x = parent;
    while (x !== undefined) { check(!seen.has(x), 'goal cycle'); seen.add(x); x = p.goals.goals.parents.get(x); }
  }
  for (const [parent, link] of s.goals.links) check(p.goals.goals.entries.has(parent) &&
    p.learning.downward.weights.some(w => w.ruleKey === link.ruleKey && w.generation === link.generation && w.createdAt === link.createdAt && w.B === parent && w.A === link.id), 'live goal link');
  for (const c of s.goals.counts) check(c.t === s.goals.errors.t && [0, 1].includes(c.goal) && [0, 1].includes(c.reality) &&
    c.M === c.goal * (1 - c.reality) && unit(c.pendingStrength), 'binary goal counts');
  if (p.body) {
    keys(s.drive, ['owned', 'request']); p.drive = new DriveGoals(p.goals, p.body.variables);
    check(s.drive.owned === null || p.goals.goals.entries.has(s.drive.owned), 'drive ownership');
    if (s.drive.request) {
      equal(s.drive.request.id, s.drive.owned);
      equal(s.drive.request.variable, p.body.variables[s.drive.request.variable.index]);
      check(unit(s.drive.request.drive), 'drive request');
    } else equal(s.drive.owned, null);
    p.drive.owned = s.drive.owned; p.goals.driveRequest = copy(s.drive.request);
  } else equal(s.drive, null);
  p.actions = copy(s.actions); p.copies = copy(s.copies); p.partial = copy(s.partial);
  equal(s.actions.map(e => ({ t: e.t, id: `action:${e.action}`, strength: e.strength })), s.copies, 'actual action/copy pairing');
  for (const a of s.actions) check(integer(a.t / 100) && a.t < s.t && env.actions.includes(a.action) && unit(a.strength) && a.strength >= .75, 'actual action event');
  if (s.partial) {
    const q = s.partial; keys(q, ['phase', 'ticks', 'executed', 'sensory', 'body', 'sensoryOptical']);
    check(['sample', 'sensory', 'upper'].includes(q.phase) && integer(q.ticks) && q.ticks <= 200 &&
      (q.phase === 'sample' ? q.ticks < 200 : q.ticks === 200), 'partial pipeline cursor');
    equal(q.executed.winner, p.output.previous); equal(q.executed.optical, p.output.stream.last);
    check(q.executed.action === null || (q.executed.action === q.executed.winner && q.executed.strength >= .75), 'partial action');
    for (const row of q.sensory) check(row.value.length === env.features.length && row.value.every(unit) && integer(row.durationMs * 2, 1), 'partial sensory readings');
    if (p.body) for (const row of q.body) { bodyReading(p.body.variables, row.value); check(integer(row.durationMs * 2, 1), 'partial body duration'); }
    for (const rows of [q.sensory, ...(p.body ? [q.body] : [])]) check(rows.reduce((n, r) => n + r.durationMs, 0) === q.ticks * .5, 'sample batch duration');
    equal(p.sensory.partial !== null, q.phase === 'sensory');
    equal(p.sensory.clock, s.t + (q.phase === 'upper' ? 100 : 0));
    equal(p.output.stream.clock, s.t + 100);
    if (q.phase === 'upper') equal(q.sensoryOptical, p.sensory.last);
  } else { equal(p.sensory.clock, s.t); equal(p.output.stream.clock, s.t); check(p.sensory.partial === null, 'orphan sensory window'); }
  for (const stream of p.body?.streams ?? []) equal(stream.clock, s.t);
  if (Array.isArray(env.executed)) {
    const executed = s.actions.map(({ t, action }) => ({ t, action }));
    if (s.partial?.executed.action !== null && s.partial?.executed.action !== undefined && s.partial.ticks > 0) executed.push({ t: s.t, action: s.partial.executed.action });
    equal(env.executed, executed, 'environment action exactly once');
  }
  equal(env.time, s.t + (s.partial?.ticks ?? 0) * .5, 'environment/sample clock');
  equal(savePipeline(p), s, 'lossless pipeline graph');
  return p;
}
