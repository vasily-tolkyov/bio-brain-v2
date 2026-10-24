import assert from 'node:assert/strict';
import { ObservedStream } from '../observed-stream.mjs';
import { ActionPipeline } from '../action-pipeline.mjs';
import { LightCheckpoint } from '../persistence.mjs';
import { VisualAttractorLayer } from '../visual-layer.mjs';
import { TemporalStack } from '../temporal-stack.mjs';
import { PredictionLearning } from '../learning.mjs';
import { FutureSlices } from '../predict.mjs';
import { TimeUnroll } from '../unroll.mjs';
import { CORE_OPTIONS } from '../config.mjs';
import { LightBaseColorV2, deriveMembers, makeLightRng } from '../core/light-base-color-v2.mjs';
import { twoQuantities } from '../envs/two-quantities.mjs';
import { bodyVariables, binIndex } from '../interoception.mjs';
import { FEATURES, ACTIONS, vector } from './L7-world.mjs';
import { AcceptanceWorld } from './L8-world.mjs';
import { protocol, read, write, hash, clone } from './L8-common.mjs';
// Pure boundary fixtures only; no predecessor acquisition or campaign runner.
import { ledgerChecks } from './L5-ledgers.mjs';
import { boundaryChecks } from './L6-checks.mjs';

export function naturalFixture(seed) {
  const evidence = read(protocol.naturalEvidence);
  const streams = [new ObservedStream(FEATURES, seed), new ObservedStream(ACTIONS, seed),
    new ObservedStream(Array.from({ length: 5 }, (_, i) => `body:0:${i}`), seed)];
  for (const row of evidence.formation.frames) {
    const bin = Math.min(4, Math.floor(row.sample.interoception.energy / 20));
    const vectors = [FEATURES.map(f => row.sample.features[f]), vector(row.action), Array.from({ length: 5 }, (_, b) => Number(b === bin))];
    streams.forEach((s, i) => s.window([{ values: vectors[i], durationMs: .5 }, { values: vectors[i].map(() => 0), durationMs: 99.5 }]));
  }
  streams.forEach(s => s.freeze());
  const downward = clone(evidence.rules.downward);
  for (const w of downward.weights) w.createdAt = 0;
  return { optics: { sensory: streams[0], motor: streams[1], body: [streams[2]] }, downward,
    evidence: { seed, provenance: protocol.naturalEvidence, rawNaturalSamples: evidence.formation.frames,
      inheritedW: downward, clockRebase: 'createdAt=0 for inherited rules; original deltas retained; no new acquisition claim',
      streams: streams.map(s => ({ names: s.names, parameters: s.layer.parameters, ports: s.ports,
        channels: s.layer.channels()[0], presentations: s.layer.presentations, state: s.saveDiskState(),
        M2: s.mapping.map(e => s.layer.auditMembership(e.id)) })) } };
}

export function opticalProbes(fixture) {
  return [fixture.optics.sensory, fixture.optics.motor, ...fixture.optics.body].map(s => {
    const stream = s.fork(), before = hash(stream.layer.saveDiskState()), mixtures = [], partial = [], amplitudes = [];
    for (let mask = 0; mask < 2 ** s.names.length; mask++) {
      const values = s.names.map((_, i) => Number(Boolean(mask & (1 << i))));
      mixtures.push({ mask, values, optical: stream.window([{ values, durationMs: 100 }]) });
    }
    for (let i = 0; i < s.names.length; i++) for (let rotation = 0; rotation < 6; rotation++) {
      for (const count of [2, 3, 6]) {
        const sources = Array.from({ length: count }, (_, j) => s.ports[i].sources[(rotation + j) % 6]);
        const input = s.names.map((_, j) => j === i ? { amplitude: 1, sources } : 0);
        // Layer query is frozen and has its own local time; these are probes,
        // never action requests or samples fed back into reality.
        const optical = stream.window([{ values: input, durationMs: 100 }]);
        partial.push({ port: i, rotation, count, input, optical });
      }
    }
    for (let i = 0; i < 20; i++) {
      const amplitude = [0, .001, .25, .5, 1][i % 5], values = s.names.map((_, j) => j === i % s.names.length ? amplitude : 0);
      amplitudes.push({ values, optical: stream.window([{ values, durationMs: 100 }]) });
    }
    const blank = Array.from({ length: 10 }, () => stream.window([{ values: s.names.map(() => 0), durationMs: 100 }]));
    return { names: s.names, before, after: hash(stream.layer.saveDiskState()), mixtures, partial, amplitudes, blank };
  });
}

export function coreFixtures(seed) {
  const c = new LightBaseColorV2({ ...CORE_OPTIONS, seed }), stages = [];
  c.learnSources([0, 1], .2); stages.push(c.colorEntries());
  c.learnSources([0], .2); stages.push(c.colorEntries());
  c.learnSources([2], .2); stages.push(c.colorEntries());
  const sourceOnly = new LightBaseColorV2({ ...CORE_OPTIONS, seed }).propagate([0, 1], .2);
  // Physical scalar fixture: five noisy external values, with no group IDs
  // passed to the core. Evaluator labels exist only in this saved fixture.
  const b = new LightBaseColorV2({ ...CORE_OPTIONS, seed }), random = makeLightRng(seed ^ 0x9e3779b9);
  const samples = [.1, .3, .5, .7, .9].flatMap((center, classIndex) => Array.from({ length: 20 }, () =>
    ({ classIndex, input: Math.max(0, Math.min(1, center + .03 * random.normal())), order: random.uniform() })))
    .sort((a, b) => a.order - b.order).map((s, presentation) => ({ ...s, presentation, sources: b.inputSources(s.input) }));
  for (const s of samples) b.learnSources(s.sources, s.input);
  const M2 = deriveMembers(b, { schedule: samples }, { kind: 'M2' });
  const probes = M2.members.map(m => ({ center: m.center, full: b.propagate(b.inputSources(m.center), m.center),
    half: b.propagate(b.inputSources(m.center).slice(0, 3), m.center) }));
  const nearFar = [.1, .3, .5, .7].map(v => ({ v, fields: [v, v + .03, v + .3].map(x => ({ x, sources: b.inputSources(x), field: b.propagate(b.inputSources(x), x) })) }));
  return { parameters: c.parameters, stages, sourceOnly, scalar: { samples, channels: b.colorEntries(), M2, probes, nearFar } };
}

export function unrollFixtures() {
  const rows = [];
  for (const strength of [.2, .4, .7, .9, 1]) {
    const u = new TimeUnroll(['a', 'b']), samples = [];
    for (const [t, input] of [[0, [{ id: 'a', strength }]], [50, [{ id: 'a', strength }]],
      [100, []], [200, [{ id: 'a', strength }, { id: 'b', strength }]], [3000, []],
      [12800 * Math.SQRT2 - .001, []], [12800 * Math.SQRT2, []], [20000, []]]) {
      u.update(t, input); samples.push({ t, input, state: u.saveState(), lines: [...u.lines(t)] });
    }
    rows.push({ strength, samples });
  }
  return rows;
}

const visualInput = (spatial, probe = 0) => Array.from({ length: 27 }, (_, i) =>
  spatial.includes(i) ? .9 + probe * .004 : .1 + probe * .01 + .02 * ((i % 9) + 1) / 10);
export function temporalStorm(seed, schedule) {
  const natural = read(protocol.predictionEvidence), arms = [];
  for (const name of ['causal', 'shuffled', 'reverse']) {
    const stack = new TemporalStack({ seed });
    // Byte-identical saved natural image stream before the branches diverge.
    for (const i of natural.ambient) stack.presentSnapshot(visualInput(natural.spatial[i]));
    stack.freezeSnapshot(); const lowerCatalogue = stack.discoverSnapshot();
    const initial = { channels: stack.channels(), catalogue: lowerCatalogue, copies: stack.copyState(),
      naturalInputHash: hash([natural.spatial, natural.ambient]) };
    const frames = [];
    for (const trial of schedule.storm) {
      const delay = name === 'shuffled' ? trial.shuffledDelay : trial.causalDelay;
      const slot = [{ time: trial.start, event: name === 'reverse' ? 1 : 0 },
        { time: trial.start + delay, event: name === 'reverse' ? 0 : 1 },
        { time: trial.start + trial.distractor, event: 2 }];
      for (const t of [...new Set(slot.flatMap(e => [e.time, e.time + 100]))].sort((a, b) => a - b)) {
        const active = slot.filter(e => e.time <= t && t < e.time + 100);
        frames.push(stack.observe(t, active.length ? visualInput(active.flatMap(e => natural.spatial[e.event])) : Array(27).fill(0)));
      }
    }
    stack.freeze(); const catalogue = stack.discover(), probes = [];
    for (let probe = 0; probe < 20; probe++) for (let k = 0; k < 9; k++) {
      for (const event of [0, 2]) probes.push({ probe, k, event, result: stack.query(visualInput(natural.spatial[event], probe), k) });
    }
    const target = stack.query(visualInput(natural.spatial[1]), 0), cleared = stack.query(visualInput(natural.spatial[0]), 6, { cleared: true });
    const M2 = catalogue.filter(e => e.mature).map(e => stack.auditMembership(e.id));
    arms.push({ name, initial, lowerCatalogue, lowerPresentations: stack.snapshotPresentations,
      channels: stack.channels(), frames, presentations: stack.presentations,
      training: stack.higherTrainingFrames, replayTraining: stack.replayTraining(), catalogue, M2, target, probes, cleared });
  }
  return { naturalInput: { spatial: natural.spatial, ambient: natural.ambient }, arms };
}

function forecast(p, A, B, strength) {
  const f = new FutureSlices(p.future.past.ids, clone(p.downward));
  f.update(p.future.t + 100, [{ id: A, strength }]);
  const created = f.created.filter(e => e.B === B);
  return { F: created.find(e => e.A === A && e.k === 6)?.strength ?? 0, created };
}
export function predictionSuite(schedule) {
  const natural = read(protocol.predictionEvidence), [A, B, C] = natural.ids;
  const strength = natural.source.observations.find(e => e.id === A).strength;
  const fresh = state => new PredictionLearning(natural.ids).loadState(clone(state));
  let p = fresh(natural.state), branches = [];
  const key = JSON.stringify([A, 6, B]);
  function phase(name, count, paired) {
    const initialState = p.saveState(), initial = forecast(p, A, B, strength), trials = [], rows = [];
    for (let i = 0; i < count; i++) {
      const start = p.future.t + 100, hasTarget = typeof paired === 'function' ? paired(i) : paired,
        delay = 3000 + (name === 'jitter' ? schedule.jitter[i] : 0);
      for (let t = start; t < start + protocol.slotMs; t += 100) {
        const observations = t === start ? natural.source.observations : hasTarget && t === start + delay ? natural.target.observations : [];
        const result = p.step(t, observations);
        // Empty windows are implicit in the fixed 100 ms grid; all events kept.
        if (observations.length || result.created.length || result.arrivals.length || result.changes.length)
          rows.push({ t, observations, ...clone(result) });
      }
      trials.push({ start, paired: hasTarget, delay, forecast: forecast(p, A, B, strength),
        W: p.downward.weights.find(w => w.ruleKey === key)?.W ?? 0 });
    }
    return { name, initialState, initial, trials, rows, finalState: p.saveState() };
  }
  branches.push(phase('paired', 10, true)); const paired = p.saveState();
  branches.push(phase('omitted', 60, false)); branches.push(phase('recovery', 60, true));
  p = fresh(paired); branches.push(phase('jitter', 30, true));
  p = fresh(paired); branches.push(phase('alternating', 30, i => i % 2 === 0));
  const probes = [];
  for (const index of schedule.probeOrder) {
    p = fresh(natural.state).freeze(); const start = p.future.t + 100, rows = [], before = hash(p.downward);
    for (let t = start; t <= start + 3800; t += 100) rows.push({ t, ...clone(p.step(t,
      t === start ? natural.source.observations : t === start + 3000 ? natural.target.observations : [])), pending: clone(p.novelty.pending) });
    probes.push({ index, start, rows, before, after: hash(p.downward) });
  }
  // New L8 temporal schedules, with exactly equal natural evidence and empty W.
  const controls = [];
  for (const kind of ['causal', 'shuffled']) {
    const model = new PredictionLearning(natural.ids), initialState = model.saveState(), rows = [];
    for (const trial of schedule.storm) for (let t = trial.start; t < trial.start + protocol.slotMs; t += 100) {
      const observations = [];
      if (t === trial.start) observations.push(...natural.source.observations);
      if (t === trial.start + (kind === 'causal' ? 3000 : trial.shuffledDelay)) observations.push(...natural.target.observations);
      if (t === trial.start + trial.distractor) observations.push(...natural.distractor.observations);
      const r = model.step(t, observations);
      if (observations.length || r.created.length || r.arrivals.length || r.changes.length) rows.push({ t, observations, ...clone(r) });
    }
    controls.push({ kind, initialState, rows, finalState: model.saveState(),
      causal: forecast(model, A, B, strength), distractor: forecast(model, C, B, strength) });
  }
  return { fixture: { file: protocol.predictionEvidence, optical: { source: natural.source, target: natural.target,
    distractor: natural.distractor, catalogue: natural.catalogue, channels: natural.audit.channels.lower } },
    ids: natural.ids, A, B, C, fixedSourceP7: strength, ruleKey: key, branches, probes, controls };
}

export function pipeline(seed, schedule, fixture, reward = 'off') {
  const createEnvironment = () => new AcceptanceWorld(seed, schedule, reward);
  const p = new ActionPipeline(createEnvironment(), seed, { optics: fixture.optics, downward: fixture.downward, innate: true });
  return new LightCheckpoint(p, { createEnvironment, schedule });
}
export function scheduledStep(c) {
  const p = c.pipeline, schedule = c.schedule;
  if (!p.partial) {
    const beginning = schedule.episodes.find(e => e.start === p.t);
    if (beginning || p.t === schedule.episodes.length * protocol.episodeMs) {
      // Ordinary external command cancellation, no reset of internal state.
      for (const id of [...p.goals.goals.entries.keys()]) p.goals.goals.cancel(id);
    }
    const e = schedule.episodes.find(e => e.start + e.commandOffset === p.t);
    if (e?.command) p.command(e.command);
  }
  return p.step();
}
function rowEvidence(c, row) {
  const p = c.pipeline;
  return clone({ ...row, pending: p.learning.novelty.pending, credits: p.learning.factor.predictions,
    goalState: p.goals.saveState(), bodyEvents: p.body.changes.events.filter(e => e.t === row.t),
    environment: { t: p.env.time, energy: p.env.state.energy, effects: p.env.state.effects.filter(e => e.t >= row.t),
      executed: p.env.executed.filter(e => e.t >= row.t) } });
}
export function continuous(seed, schedule, fixture, dir, progress) {
  const c = pipeline(seed, schedule, fixture); write(`${dir}/initial.json.gz`, c.saveState());
  const references = new Map(), chunks = []; let rows = [];
  for (let window = 0; window < schedule.duration / 100; window++) {
    if (schedule.snapshotCuts.includes(window)) {
      // Cut 1 is inside IO, other cuts are committed window boundaries.
      if (window === 1) { c.pipeline.beginWindow(); for (let i = 0; i < 73; i++) c.pipeline.advanceWindow(); }
      write(`${dir}/cut-${window}/initial.json.gz`, c.saveState());
    }
    const row = rowEvidence(c, scheduledStep(c)); rows.push(row);
    for (const cut of schedule.snapshotCuts) if (window >= cut && window < cut + 100) {
      if (!references.has(cut)) references.set(cut, []); references.get(cut).push(hash(row));
    }
    for (const cut of schedule.snapshotCuts) if (window === cut + 99) write(`${dir}/cut-${cut}/reference-final.json.gz`, c.saveState());
    if (rows.length === 100) {
      const file = `windows-${window - 99}.json.gz`; write(`${dir}/${file}`, rows); chunks.push(file); rows = [];
    }
    if (window % 1000 === 999) progress(`L8 ${seed}: continuous ${window + 1}/${schedule.duration / 100} windows`);
  }
  if (rows.length) { const file = `windows-tail.json.gz`; write(`${dir}/${file}`, rows); chunks.push(file); }
  write(`${dir}/final.json.gz`, c.saveState());
  const higher = c.pipeline.temporal.layer.fork().freeze();
  higher.discover();
  write(`${dir}/higher.json.gz`, { channels: higher.channels()[0], presentations: higher.presentations,
    training: higher.trainingFrames, replayTraining: higher.replayTraining(), catalogue: higher.catalogue,
    M2: higher.catalogue.filter(e => e.mature).map(e => higher.auditMembership(e.id)) });
  write(`${dir}/index.json`, { seed, chunks, windows: schedule.duration / 100, continuous: true, resets: 0 });
  for (const cut of schedule.snapshotCuts) {
    const branch = new LightCheckpoint(c.pipeline, { createEnvironment: c.createEnvironment, schedule });
    const initial = read(`${dir}/cut-${cut}/initial.json.gz`);
    try {
      branch.loadState(initial); const restored = branch.saveState(), rows = [];
      for (let i = 0; i < 100; i++) rows.push(rowEvidence(branch, scheduledStep(branch)));
      write(`${dir}/cut-${cut}/resumed.json.gz`, { restored, rows, final: branch.saveState(), referenceRowHashes: references.get(cut) });
    } catch (error) { write(`${dir}/cut-${cut}/failure.json`, { classification: 'model', message: error.message }); }
  }
  const initial = read(`${dir}/cut-52/initial.json.gz`), rejected = [], live = new LightCheckpoint(c.pipeline, { createEnvironment: c.createEnvironment, schedule });
  live.loadState(initial);
  const mutations = [
    ['schema', s => s.schema = 'legacy'], ['source', s => s.binding.sourceHash = 'changed'],
    ['schedule', s => s.binding.scheduleHash = 'changed'], ['config', s => s.binding.opticalRule.N = 251],
    ['cursor', s => s.scheduleState.cursor++], ['time', s => s.pipeline.t += 100],
    ['nonfinite-null', s => s.pipeline.learning.trace = null], ['unknown-id', s => s.pipeline.ids[0] = 'unknown'],
    ['body-range', s => s.pipeline.environment.state.energy = 101], ['motor-previous', s => s.pipeline.output.previous = 'unknown'],
    ['negative-rho', s => s.pipeline.sensory.layer.cores[0][0].rho = -.1],
    ['missing-samples', s => s.pipeline.sensory.layer.cores[0][0].samples.pop()],
    ['port-map', s => s.pipeline.sensory.ports[0].sources[0] = 249],
    ['generation', s => s.pipeline.learning.future.downward.weights[0].generation = 0],
    ['negative-W', s => s.pipeline.learning.future.downward.weights[0].W = -.01],
    ['catalogue-id', s => s.pipeline.sensory.layer.state.catalogue.entries[0].id = -1],
  ];
  for (const [name, mutate] of mutations) {
    const malformed = clone(initial); mutate(malformed); const { digest, ...payload } = malformed; malformed.digest = hash(payload);
    const root = live.pipeline, before = hash(live.saveState()); let reason = null;
    try { live.loadState(malformed); } catch (e) { reason = e.message; }
    rejected.push({ name, malformedHash: hash(malformed), before, after: hash(live.saveState()), rootRetained: live.pipeline === root, reason });
  }
  write(`${dir}/malformed.json.gz`, { initial, rejected, final: live.saveState() });
  return c;
}

export function motorSuite(seed, schedule, fixture) {
  return [0, .001, .749, .75, 1].map(amplitude => {
    const c = pipeline(seed, schedule, fixture), p = c.pipeline; p.freeze(); p.innate = false;
    const trials = [];
    for (let i = 0; i < protocol.motorTrials; i++) {
      p.step(vector(null)); const rows = [];
      for (let j = 0; j < 5; j++) rows.push(rowEvidence(c, p.step([amplitude, 0, 0, 0, 0])));
      trials.push({ i, rows });
    }
    return { amplitude, trials, actions: p.actions, copies: p.copies, environment: p.env.executed };
  });
}

export function rewardSuite(seed, schedule, fixture) {
  return ['off', 'on', 'positive', 'negative'].map(mode => {
    const c = pipeline(seed, schedule, fixture, mode), rows = [], hashes = [];
    let samples = 0, minReward = Infinity, maxReward = -Infinity;
    const step = c.pipeline.env.step.bind(c.pipeline.env);
    c.pipeline.env.step = (...args) => { const sample = step(...args); samples++;
      minReward = Math.min(minReward, sample.reward); maxReward = Math.max(maxReward, sample.reward); return sample; };
    while (c.pipeline.t < protocol.rewardMs) {
      const row = rowEvidence(c, scheduledStep(c));
      // Full rows retained; exact equality is verified from arrays, not flags.
      rows.push(row); hashes.push(hash([c.pipeline.learning.downward, c.pipeline.temporal.layer.channels()]));
    }
    return { mode, duration: c.pipeline.t, samples, rewardRange: [minReward, maxReward], rows, hashes, channels: c.pipeline.temporal.layer.channels(),
      downward: c.pipeline.learning.downward, actions: c.pipeline.actions };
  });
}

export function higherFixture(seed) {
  const saved = read(protocol.predictionEvidence), layer = new VisualAttractorLayer({ seed, pixels: 243, level: 3,
    continuous: { cadenceMs: .5, strengthScale: .1 } });
  for (const frame of saved.audit.trainingFrames) layer.present(frame.input, .5);
  layer.freeze(); const catalogue = layer.discover();
  const M2 = catalogue.filter(e => e.mature).map(e => layer.auditMembership(e.id)), probes = [];
  for (const member of M2.slice(0, 5)) for (let i = 0; i < 20; i++) {
    const full = member.replays[i].input, active = full.flatMap((v, j) => v > 0 ? [j] : []), keep = active.filter((_, j) => j % 2 === i % 2);
    const half = full.map((v, j) => keep.includes(j) ? v : 0);
    probes.push({ id: member.entry.id, index: i, fullInput: full, halfInput: half,
      full: layer.replay([{ input: full, durationMs: 100 }]), half: layer.replay([{ input: half, durationMs: 100 }]) });
  }
  return { parameters: layer.parameters, channels: layer.channels()[0], presentations: layer.presentations,
    training: layer.trainingFrames, replayTraining: layer.replayTraining(), catalogue, M2, probes };
}

export function reliefSuite(seed, schedule, fixture) {
  return ['change:0:rise:1', 'change:0:rise:2'].map((target, index) => ({ target, cause: index ? 'action:eat' : 'action:nibble',
    probes: ACTIONS.map(action => {
      const s = clone(schedule); s.episodes[0].initial = 30;
      const c = pipeline(seed, s, fixture), p = c.pipeline; p.freeze(); p.innate = false;
      p.step(vector(null)); const row = p.step(vector(action));
      return { action, row: rowEvidence(c, row), rules: clone(p.learning.downward.weights.filter(w => w.A === `action:${action}` && w.B === target)),
        forecasts: clone(row.learning.created.filter(f => f.A === `action:${action}` && f.B === target)), executed: p.env.executed };
    }) }));
}

export function secondReward(seed) {
  const saved = read(protocol.naturalEvidence), env = twoQuantities(), variables = bodyVariables(env.interoception);
  const sensory = new ObservedStream(env.features, seed), motor = new ObservedStream(env.actions, seed),
    body = variables.map(v => new ObservedStream(v.ids, seed));
  const pulse = values => [{ values, durationMs: .5 }, { values: values.map(() => 0), durationMs: 99.5 }];
  for (const row of saved.second.samples) {
    sensory.window(pulse(env.features.map(f => row.sample.features[f] ?? 0)));
    const values = env.actions.map(a => Number(a === row.action));
    motor.window([{ values, durationMs: 10 }, { values: values.map(() => 0), durationMs: 90 }]);
    for (const v of variables) body[v.index].window(pulse(v.ids.map((_, b) => Number(b === binIndex(v, row.sample.interoception[v.name])))));
  }
  [sensory, motor, ...body].forEach(s => s.freeze());
  const replays = [];
  for (const mode of ['off', 'on', 'positive', 'negative']) {
    const original = twoQuantities(); let t = 0, samples = 0, minReward = Infinity, maxReward = -Infinity;
    const environment = { ...original, step(ms, action) { const sample = original.step(ms, action); t += ms; samples++;
      const reward = mode === 'positive' ? 17 : mode === 'negative' ? -23 : mode === 'on' ? Math.sin(t / 777) : 0;
      minReward = Math.min(minReward, reward); maxReward = Math.max(maxReward, reward); return { ...sample, reward }; } };
    const p = new ActionPipeline(environment, seed, { optics: { sensory, motor, body }, innate: false }), rows = [], channels = [];
    while (p.t < 60000) {
      const drive = env.actions.map((_, i) => Number(p.t % 5000 === 0 && (p.t / 5000) % 2 === i));
      rows.push(clone(p.step(drive))); channels.push(hash([p.temporal.layer.channels(), p.learning.downward]));
    }
    replays.push({ mode, samples, rewardRange: [minReward, maxReward], rows, channels, final: p.learning.saveState(), bodyEvents: p.body.changes.events });
  }
  return { samples: saved.second.samples, declarations: env.interoception,
    streams: [sensory, motor, ...body].map(s => ({ names: s.names, ports: s.ports, channels: s.layer.channels()[0] })), replays };
}

export function collectSeed(seed, schedule, dir, progress = console.log) {
  const failures = [], collect = (name, fn) => {
    progress(`L8 ${seed}: ${name}`);
    try { const result = fn(); write(`${dir}/${name}.json.gz`, result); return result; }
    catch (error) { const result = { name, classification: error.code === 'ERR_ASSERTION' ? 'model' : 'observer', message: error.stack };
      failures.push(result); write(`${dir}/${name}-failure.json`, result); return null; }
  };
  const fixture = naturalFixture(seed); write(`${dir}/fixture.json.gz`, fixture.evidence);
  collect('core', () => coreFixtures(seed)); collect('optics', () => opticalProbes(fixture));
  collect('unroll', unrollFixtures);
  collect('boundaries', () => ({ ledger: ledgerChecks(), body: boundaryChecks(seed, fixture.optics) }));
  collect('temporal', () => temporalStorm(seed, schedule));
  collect('higher', () => higherFixture(seed));
  collect('prediction', () => predictionSuite(schedule));
  collect('motor', () => motorSuite(seed, schedule, fixture));
  collect('reward', () => rewardSuite(seed, schedule, fixture));
  collect('relief', () => reliefSuite(seed, schedule, fixture));
  collect('second-reward', () => secondReward(seed));
  progress(`L8 ${seed}: uninterrupted full loop`);
  try { continuous(seed, schedule, fixture, `${dir}/continuous`, progress); }
  catch (error) { const f = { name: 'continuous', classification: 'observer', message: error.stack }; failures.push(f); write(`${dir}/continuous-failure.json`, f); }
  write(`${dir}/collection.json`, { seed, complete: failures.length === 0, failures });
}
