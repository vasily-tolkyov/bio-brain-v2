import { createHash } from 'node:crypto';
import { ActionPipeline } from '../action-pipeline.mjs';
import { ObservedStream } from '../observed-stream.mjs';
import { twoQuantities } from '../envs/two-quantities.mjs';
import { bodyVariables, binIndex } from '../interoception.mjs';
import { fixtureWorld, ambientWorld, random, ACTIONS } from './L6-fixtures.mjs';

export const PROTOCOL = Object.freeze({ seeds: [7, 19, 31], developmentSeed: 101,
  ambientWindows: 512, ambientExposureMs: .5, experienceTrials: 48, slotMs: 26000, actionAt: 600,
  motorTrials: 20, episodes: 10, rewardMs: 60000, setpointMs: 10000 });
export const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const vector = action => Float64Array.from(ACTIONS, a => Number(a === action));

export function acquireOptics(seed) {
  const env = ambientWorld(seed), rng = random(seed + 9801);
  // Optical formation needs no temporal model or W: it observes env samples.
  const sensory = new ObservedStream(env.features, seed), motor = new ObservedStream(env.actions, seed);
  const body = new ObservedStream(['body:0:0', 'body:0:1', 'body:0:2', 'body:0:3', 'body:0:4'], seed);
  const frames = [];
  for (let i = 0; i < PROTOCOL.ambientWindows; i++) {
    const action = ACTIONS[Math.floor(rng() * ACTIONS.length)];
    const sample = env.step(100, action);
    const bin = Math.min(4, Math.floor(sample.interoception.energy / 20));
    const pulse = values => [{ values, durationMs: PROTOCOL.ambientExposureMs },
      { values: values.map(() => 0), durationMs: 100 - PROTOCOL.ambientExposureMs }];
    sensory.window(pulse(env.features.map(f => sample.features[f])));
    // This is a recorded env execution, not a requested/hypothetical action.
    motor.window(pulse(Array.from(vector(action))));
    body.window(pulse(Array.from({ length: 5 }, (_, b) => Number(b === bin))));
    frames.push({ t: i * 100, action, sample });
  }
  [sensory, motor, body].forEach(s => s.freeze());
  return { optics: { sensory, motor, body: [body] }, evidence: { frames, executed: env.executed,
    streams: [sensory, motor, body].map(s => ({ names: s.names, parameters: s.layer.parameters,
      ports: s.layer.ports, channels: s.layer.channels()[0], mapping: s.mapping, presentations: s.layer.presentations })) } };
}

export function compact(row, { optical = false } = {}) {
  return { t: row.t, executed: { action: row.executed.action, strength: row.executed.strength, winner: row.executed.winner },
    copy: row.copy, observations: row.observations, temporal: { lines: row.temporal.lines,
      onsets: row.temporal.onsets, peak: Math.max(0, ...row.temporal.fields.flatMap(f => f.replicas.map(r => r.lit.length))) },
    learning: row.learning, goal: row.goal,
    drive: row.drive && { source: row.drive.source, written: row.drive.written,
      requestedId: row.drive.request?.id ?? null,
      best: row.drive.best && { ruleKey: row.drive.best.rule.ruleKey, W: row.drive.best.rule.W,
        magnitude: row.drive.best.magnitude, relief: row.drive.best.relief, score: row.drive.best.score } },
    body: row.body && { bins: row.body.bins, changes: row.body.changes },
    ...(optical ? { optical: [row.executed.optical, row.sensory, ...(row.body?.optical ?? [])] } : {}) };
}

export function acquireRules(seed, optics) {
  const env = fixtureWorld(), p = new ActionPipeline(env, seed, { optics, innate: false });
  const rng = random(seed + 777), windows = [], events = [], checks = [];
  for (let trial = 0; trial < PROTOCOL.experienceTrials; trial++) {
    // Each bout samples all physical action effects in a seeded random order.
    const order = ACTIONS.map(action => ({ action, key: rng() })).sort((a, b) => a.key - b.key).map(a => a.action);
    for (const action of order) {
      env.reset(30); const start = p.t;
      for (let dt = 0; dt < PROTOCOL.slotMs; dt += 100) {
        const row = p.step(vector(dt === PROTOCOL.actionAt ? action : null));
        // All real observations are retained; physical P7 witnesses at changes
        // and actions suffice to audit every new body/action onset.
        windows.push({ t: row.t, observations: row.observations, changes: row.learning.changes,
          onsets: row.learning.onsets, created: row.learning.created,
          temporalLit: Math.max(0, ...row.temporal.fields.map(f => f.replicas[0].lit.length)) });
        if (row.copy.length || row.body.changes.length || row.sensory.readout.some(r => r.strength > 0)) events.push(compact(row, { optical: true }));
      }
      checks.push({ trial, action, start, end: p.t, energy: env.energy });
    }
  }
  p.temporal.layer.freeze();
  return { p, evidence: { windows, events, checks, executed: env.executed, effects: env.effects,
    bodyEvents: p.body.changes.events, downward: structuredClone(p.learning.downward),
    state: p.learning.saveState(), ids: p.ids, labels: [...p.labels],
    temporal: { parameters: p.temporal.layer.parameters, channels: p.temporal.layer.channels()[0],
      blankFields: p.temporal.layer.query(Array(p.ids.length * 9).fill(0)).carrierFields,
      presentations: p.temporal.layer.presentations } } };
}

export function motorChecks(seed, optics, downward, temporal) {
  const cases = [];
  for (const [name, values] of [['at-gate', [.75, 0, 0, 0, 0]], ['below-gate', [.749, 0, 0, 0, 0]],
    ['weak', [.001, 0, 0, 0, 0]], ['sustained', [1, 0, 0, 0, 0]], ['tie', [1, 1, 0, 0, 0]]]) {
    const p = new ActionPipeline(fixtureWorld(), seed, { optics, downward, temporal, innate: false }).freeze();
    const trials = [];
    for (let trial = 0; trial < 20; trial++) {
      p.step(vector(null));
      const rows = Array.from({ length: 5 }, () => compact(p.step(values), { optical: true }));
      trials.push({ trial, rows });
    }
    cases.push({ name, values, trials, executed: p.actions, copies: p.copies, envActions: p.env.executed });
  }
  return cases;
}

export function goalEpisodes(seed, optics, downward, temporal) {
  const result = [];
  for (const spec of [
    { name: 'direct', initial: 70, command: 'light', action: 'press', outcome: 'light', duration: 5200 },
    { name: 'two-step', initial: 70, command: 'bell', action: 'press', outcome: 'bell', duration: 5200 },
    { name: 'innate', initial: 30, action: 'eat', outcome: 'change:0:rise:2', duration: 2200 },
    { name: 'ranking', initial: 10, action: 'eat', outcome: 'change:0:rise:2', duration: 2200 },
    { name: 'override', initial: 30, command: 'tone', action: 'wave', outcome: 'tone', duration: 2200 },
  ]) {
    const episodes = [];
    for (let episode = 0; episode < 10; episode++) {
      const p = new ActionPipeline(fixtureWorld({ initial: spec.initial }), seed, { optics, downward, temporal }).freeze();
      if (spec.command) p.command(spec.command);
      const before = digest(p.learning.downward), rows = [];
      while (p.t < spec.duration) rows.push(compact(p.step(), { optical: true }));
      episodes.push({ episode, rows, actions: p.actions, envActions: p.env.executed,
        bodyEvents: p.body.changes.events, effects: p.env.effects,
        WBefore: before, WAfter: digest(p.learning.downward) });
    }
    result.push({ ...spec, episodes });
  }
  const p = new ActionPipeline(fixtureWorld({ initial: 70 }), seed, { optics, downward, temporal }).freeze();
  const rows = [];
  while (p.t < PROTOCOL.setpointMs) rows.push(compact(p.step()));
  return { groups: result, setpoint: { duration: p.t, rows, actions: p.actions } };
}

export function reliefProbes(p) {
  return ['change:0:rise:1', 'change:0:rise:2'].map((target, index) => {
    const cause = `action:${index ? 'eat' : 'nibble'}`;
    const probes = ACTIONS.map(a => {
      const actual = new ActionPipeline(fixtureWorld(), p.output.stream.layer.parameters.seed,
        { optics: p.optics, downward: p.learning.downward, temporal: p.temporal, innate: false }).freeze();
      // Establish the identical real body context before the action probe;
      // its initial bin onset must not be mistaken for an action contributor.
      actual.step(vector(null));
      const row = actual.step(vector(a)), future = actual.learning.future;
      const A = `action:${a}`;
      return { A, strength: row.executed.strength, executed: actual.env.executed, copy: row.copy, motor: row.executed.optical,
        rules: future.downward.weights.filter(w => w.A === A && w.B === target),
        forecasts: future.created.filter(e => e.B === target) };
    });
    const causal = probes.find(p => p.A === cause), controls = probes.filter(p => p.A !== cause);
    const W = Math.max(0, ...causal.rules.map(w => w.W)), noncausalW = Math.max(0, ...controls.flatMap(p => p.rules.map(w => w.W)));
    const F = Math.max(0, ...causal.forecasts.map(e => e.strength)), noncausalF = Math.max(0, ...controls.flatMap(p => p.forecasts.map(e => e.strength)));
    return { target, cause, probes, W, normalizedW: W / .1, F, maxNoncausalW: noncausalW, maxNoncausalF: noncausalF,
      exactSingleEdgeWRatio: noncausalW ? W / noncausalW : 'Infinity',
      singleContributorForecastRatio: noncausalF ? F / noncausalF : 'Infinity',
      zeroDenominator: !noncausalW && !noncausalF };
  });
}

export function opticalControls(optics, temporalEvidence) {
  const streams = [optics.sensory, optics.motor, ...optics.body];
  const controls = streams.map(stream => {
    const samples = [];
    // Every nonempty proper mixture, plus all-active and blank controls.
    for (let mask = 0; mask < 2 ** stream.names.length; mask++) {
      const values = stream.names.map((_, i) => Number((mask & (1 << i)) !== 0));
      samples.push({ mask, values, optical: stream.window([{ values, durationMs: 100 }]) });
    }
    return { names: stream.names, samples };
  });
  return { controls, temporal: temporalEvidence };
}

export function secondOptics(seed) {
  const env = twoQuantities(), rng = random(seed + 2323), variables = bodyVariables(env.interoception);
  const sensory = new ObservedStream(env.features, seed), motor = new ObservedStream(env.actions, seed);
  const body = variables.map(v => new ObservedStream(v.ids, seed)), samples = [];
  for (let i = 0; i < 512; i++) {
    const action = rng() < .035 ? env.actions[Math.floor(rng() * 2)] : null;
    const sample = env.step(100, action);
    const pulse = values => [{ values, durationMs: .5 }, { values: values.map(() => 0), durationMs: 99.5 }];
    sensory.window(pulse(env.features.map(f => sample.features[f] ?? 0)));
    const motorValues = env.actions.map(a => Number(a === action));
    motor.window([{ values: motorValues, durationMs: 10 }, { values: motorValues.map(() => 0), durationMs: 90 }]);
    for (const v of variables) body[v.index].window(pulse(v.ids.map((_, b) => Number(b === binIndex(v, sample.interoception[v.name])))));
    samples.push({ i, action, sample });
  }
  [sensory, motor, ...body].forEach(s => s.freeze());
  return { optics: { sensory, motor, body }, samples, declarations: env.interoception };
}

export function rewardReplays(seed, optics, downward, second) {
  const worlds = [];
  for (const world of ['body-actions', 'two-quantities']) {
    const replays = [];
    for (const mode of ['off', 'on', 'positive', 'negative']) {
      let env;
      if (world === 'body-actions') env = fixtureWorld({ reward: mode });
      else {
        const original = twoQuantities(); let t = 0;
        env = { ...original, step(ms, action) {
          const sample = original.step(ms, action);
          const reward = mode === 'positive' ? 17 : mode === 'negative' ? -23 : mode === 'on' ? Math.sin(t / 777) : 0;
          t += ms; return { ...sample, reward };
        } };
      }
      const inputHash = createHash('sha256'); let sampleCount = 0, minReward = Infinity, maxReward = -Infinity;
      const sampleStep = env.step.bind(env);
      env.step = (ms, action) => {
        const sample = sampleStep(ms, action), reward = sample.reward ?? 0;
        inputHash.update(JSON.stringify({ features: sample.features, body: sample.interoception }));
        sampleCount++; minReward = Math.min(minReward, reward); maxReward = Math.max(maxReward, reward);
        return sample;
      };
      const p = new ActionPipeline(env, seed, { optics: world === 'body-actions' ? optics : second.optics,
        ...(world === 'body-actions' ? { downward } : {}), innate: world === 'body-actions' });
      const histories = [], weights = [], temporalPeaks = [], input = [], actions = [], channelTimeline = [];
      while (p.t < PROTOCOL.rewardMs) {
        if (world === 'body-actions' && p.t % 10000 === 0) p.command('light');
        const drive = world === 'two-quantities' ? env.actions.map((_, i) => Number(p.t % 5000 === 0 && (p.t / 5000) % 2 === i)) : undefined;
        const row = p.step(drive);
        const optical = [row.executed.optical, row.sensory, ...(row.body?.optical ?? [])];
        histories.push(digest([optical.map(o => o.history), row.temporal.fields]));
        weights.push(digest(p.learning.downward));
        input.push(digest([optical.map(o => o.segments), row.observations]));
        temporalPeaks.push(Math.max(0, ...row.temporal.fields.map(f => f.replicas[0].lit.length)));
        if (row.executed.action) actions.push({ t: row.t, action: row.executed.action });
        if (row.temporal.learned) channelTimeline.push({ t: row.t, hash: digest(p.temporal.layer.channels()) });
      }
      const channels = [p.sensory.layer.channels(), p.output.stream.layer.channels(),
        ...p.body.streams.map(s => s.layer.channels()), p.temporal.layer.channels()];
      replays.push({ mode, duration: p.t, histories, weights, input, temporalPeaks, actions,
        channelTimeline, rawInputHash: inputHash.digest('hex'), rewardRange: [minReward, maxReward], sampleCount,
        copies: p.copies, channelsHash: digest(channels), finalW: p.learning.downward,
        bodyEvents: p.body.changes.events });
    }
    worlds.push({ world, replays });
  }
  return worlds;
}
