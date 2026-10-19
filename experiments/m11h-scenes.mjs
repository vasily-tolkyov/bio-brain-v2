/** Fresh N-only/event-learning scenes. One explicit phase per invocation; no cache
 * reuse, calibration, action curriculum, goal changes, or automatic chaining.
 * --plan / --preflight do not construct neural populations or create artifacts.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const phase = process.argv[2] ?? '--plan';
const args = process.argv.slice(3);
assert.ok(args.every(a => /^(--seed=\d+|--out=.+|--run|--preflight)$/.test(a)), 'Unknown option; use --plan');
assert.equal(new Set(args.map(a => a.split('=')[0])).size, args.length, 'Duplicate option');
assert.ok(!(args.includes('--run') && args.includes('--preflight')), 'Choose --run or --preflight');
const option = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seed = Number(option('seed', 7));
assert.ok(Number.isSafeInteger(seed) && seed >= 0, 'Seed must be a nonnegative safe integer');
const outputRoot = resolve(ROOT, option('out', `out/m11h-scenes/seed-${seed}`));
const PHASES = Object.freeze({ teachers: [], 'storm-causal': ['teachers'], 'storm-shuffled': ['teachers'],
  'm4-causal': ['storm-causal'], 'm4-shuffled': ['storm-shuffled'], omission: ['storm-causal'], rest: ['storm-causal'], report: [] });
const COUNTS = Object.freeze({ stormTrials: 30, omissionTrials: 15, omissionSlotMs: 25000, restMs: 300000 });
const PLAN = { schema: 'm11h-scenes-v1', seed, outputRoot, phases: PHASES, counts: COUNTS,
  protocol: {
    teachers: 'Fresh isolated storm sensory teacher only. Causal and shuffled branches restore exactly the same checkpoint.',
    storm: '30 causal and 30 shuffled trials with normal sensory, layer-2, novelty and event learning.',
    m4: 'Unchanged m4-probe: 10 each lightning, lightning+thunder and bird, per condition. Frozen weights; no online novelty measurements in these probes.',
    omission: '15 lightning-only 25 s slots from causal training. Observe the learned lightning@6->thunder generation; do not plant a missing edge or fabricate misses. Normal learning stays on.',
    rest: '300 s with no external events. Actual sensory/layer-2/novelty networks and learner stay on; record raw N, per-cell rates, 10 ms Fano, bursts, and weight drift.',
    provenance: 'Refuse existing phase directories. Snapshot exact source bytes and hashes before neural work; validate dependency manifests and state hashes. Recheck source set and bytes at completion.',
    limits: 'Single-seed representative scenes, not full acceptance. No goal or pruning-threshold changes. Old M4 causal/bird ratio below 5 is historical, not a fresh result; the new ratio remains unknown until these phases run.',
  }, command: `node experiments/m11h-scenes.mjs PHASE --seed=${seed} --out=${relative(ROOT, outputRoot)} --run` };
if (phase === '--plan' || phase === '--help') { console.log(JSON.stringify(PLAN, null, 2)); process.exit(0); }
assert.ok(Object.hasOwn(PHASES, phase), `Unknown phase ${phase}; use --plan`);
const preflight = args.includes('--preflight');
assert.ok(phase === 'report' || preflight || args.includes('--run'), 'Neural phases require --run after the code checkpoint is saved.');
for (const name of ['src', 'experiments']) {
  const inside = relative(resolve(ROOT, name), outputRoot);
  assert.ok(inside === '..' || inside.startsWith(`..${sep}`), 'Keep output outside source directories');
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = x => structuredClone(x);
const jsonHash = value => hash(JSON.stringify(value));
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]);
const sourceNames = () => [...walk(resolve(ROOT, 'src')).filter(f => f.endsWith('.mjs')).map(f => relative(ROOT, f)),
  'experiments/m3-pipeline.mjs', 'experiments/m4-probe.mjs', 'experiments/m11h-scenes.mjs', 'package.json'].sort();
const sourceBytes = new Map(sourceNames().map(file => [file, readFileSync(resolve(ROOT, file))]));
const sourceHashes = Object.fromEntries([...sourceBytes].map(([file, bytes]) => [file, hash(bytes)]));
const sourceSignature = jsonHash(sourceHashes);
const changedSources = () => [...new Set([...Object.keys(sourceHashes), ...sourceNames()])].filter(file =>
  !Object.hasOwn(sourceHashes, file) || !existsSync(resolve(ROOT, file)) || hash(readFileSync(resolve(ROOT, file))) !== sourceHashes[file]);
const directory = resolve(outputRoot, phase);
assert.ok(!existsSync(directory), `Refusing to overwrite ${directory}; use a fresh output root.`);
const inputs = [], verifiedPhases = new Map();
function validatePhase(from) {
  if (verifiedPhases.has(from)) return verifiedPhases.get(from);
  const base = resolve(outputRoot, from), manifestBytes = readFileSync(resolve(base, 'artifact-manifest.json'));
  const seal = JSON.parse(readFileSync(resolve(base, 'artifact-manifest.sha256.json')));
  assert.equal(seal.schema, 'm11h-manifest-seal-v1'); assert.equal(seal.phase, from);
  assert.equal(manifestBytes.length, seal.bytes, `Manifest size mismatch: ${from}`);
  assert.equal(hash(manifestBytes), seal.sha256, `Manifest hash mismatch: ${from}`);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, 'm11h-artifacts-v1'); assert.equal(manifest.phase, from); assert.equal(manifest.seed, seed);
  assert.ok(Array.isArray(manifest.files));
  const artifacts = new Map();
  for (const entry of manifest.files) {
    assert.ok(typeof entry.path === 'string' && entry.path.length > 0 && !artifacts.has(entry.path), 'Invalid or duplicate manifest path');
    const path = resolve(base, entry.path), local = relative(base, path);
    assert.ok(local && local !== '..' && !local.startsWith(`..${sep}`) && !local.startsWith(sep), 'Artifact outside its phase directory');
    const bytes = readFileSync(path);
    assert.equal(bytes.length, entry.bytes, `Input size mismatch: ${from}/${entry.path}`);
    assert.equal(hash(bytes), entry.sha256, `Input hash mismatch: ${from}/${entry.path}`);
    artifacts.set(entry.path, { bytes, sha256: entry.sha256 });
  }
  const parse = name => {
    assert.ok(artifacts.has(name), `Missing manifested input ${from}/${name}`);
    return JSON.parse(artifacts.get(name).bytes);
  };
  const complete = parse('complete.json'), provenance = parse('provenance.json');
  assert.equal(complete.valid, true, `Invalid or unfinished input phase ${from}`);
  assert.deepEqual(complete.sourceChangedDuringPhase, []);
  assert.deepEqual(complete.inputChangedDuringPhase, []);
  assert.equal(complete.phase, from); assert.equal(complete.seed, seed);
  assert.equal(provenance.schema, 'm11h-provenance-v1'); assert.equal(provenance.phase, from); assert.equal(provenance.seed, seed);
  assert.equal(provenance.sourceSignature, sourceSignature, `Sources changed since ${from}; start a fresh run rather than mix checkpoints.`);
  assert.deepEqual(provenance.sourceHashes, sourceHashes);
  const value = { artifacts, provenance, manifestSHA256: seal.sha256, manifestBytes: seal.bytes };
  verifiedPhases.set(from, value);
  return value;
}
function input(from, name = 'state.json') {
  const prior = validatePhase(from), artifact = prior.artifacts.get(name);
  assert.ok(artifact, `Missing manifested input ${from}/${name}`);
  if (!inputs.some(i => i.phase === from && i.name === name)) inputs.push({ phase: from, name,
    sha256: artifact.sha256, bytes: artifact.bytes.length, manifestSHA256: prior.manifestSHA256, manifestBytes: prior.manifestBytes });
  return JSON.parse(artifact.bytes);
}
for (const from of PHASES[phase]) input(from);
if (preflight) {
  console.log(JSON.stringify({ phase, seed, sourceSignature, inputs, neuralWorkStarted: false, filesCreated: false }, null, 2));
  process.exit(0);
}

const started = performance.now(), startedAt = new Date().toISOString();
mkdirSync(outputRoot, { recursive: true }); mkdirSync(directory); // Atomic refusal if another invocation claimed this phase.
const write = (name, value) => writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
for (const [file, bytes] of sourceBytes) {
  const target = resolve(directory, 'source-snapshot', file);
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: 'wx' });
}
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const provenance = { schema: 'm11h-provenance-v1', phase, seed, startedAt, argv: process.argv.slice(2),
  gitHead: git(['rev-parse', 'HEAD']).trim(), gitStatus: git(['status', '--short']),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  sourceHashes, sourceSignature, inputs, historicalResultsImported: false, plan: PLAN };
write('provenance-start.json', provenance);
writeFileSync(resolve(directory, 'source-diff.patch'), git(['diff', '--binary']), { flag: 'wx' });

// No neural object is constructed until the exact sources above are archived.
const [{ AttractorLayer }, { DOWNWARD }, { NOVELTY },
  { THREE_FACTOR, predictionCredit }, { saveLearning, loadLearning }, { stormWorld, stormEnv },
  { teachFeatures, makePipeline, advance, weightProfile }, { probe, PROBES, PROBE_TRIALS }] = await Promise.all([
  import('../src/layer.mjs'), import('../src/downward.mjs'), import('../src/novelty.mjs'),
  import('../src/three-factor.mjs'), import('../src/learning.mjs'), import('../src/world.mjs'),
  import('./m3-pipeline.mjs'), import('./m4-probe.mjs'),
]);
const saveLayer = layer => ({ ticks: layer.ticks, attractors: clone(layer.attractors), replicas: layer.replicas.map(r => r.net.saveState()) });
function loadLayer(layer, state) {
  assert.equal(layer.replicas.length, state.replicas.length);
  layer.ticks = state.ticks; layer.attractors = clone(state.attractors);
  layer.replicas.forEach((r, i) => r.net.loadState(state.replicas[i]));
}
function checkpoint(p) {
  const learning = saveLearning(p);
  assert.equal(learning.schema, 'event-learning-v1', 'Fresh event-learning state required; legacy caches are not migrated here.');
  assert.equal(learning.future.schema, 2); assert.equal(learning.factor.schema, 2);
  assert.equal(learning.errors.schema, 'novelty-only-v1');
  return { schema: 'm11h-storm-state-v1', seed, t: p.t, mapping: clone(p.mapping), baseline: clone(p.baseline),
    teacher: clone(p.teacherMetadata), layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), learning };
}
function restore(state) {
  assert.equal(state.schema, 'm11h-storm-state-v1'); assert.equal(state.seed, seed);
  assert.equal(state.learning.schema, 'event-learning-v1');
  const layer = new AttractorLayer({ n: state.mapping.length * 6, seed });
  const p = makePipeline({ layer, mapping: clone(state.mapping) }, seed);
  p.t = state.t; p.baseline = clone(state.baseline); p.teacherMetadata = clone(state.teacher);
  loadLayer(p.layer1, state.layer1); loadLayer(p.layer2, state.layer2); loadLearning(p, state.learning);
  assert.deepEqual(checkpoint(p), state, 'Full neural and event-learning checkpoint round trip differs');
  return p;
}

/** Observational wrapper only. Each generation keeps emitted predictions, actual
 * matched onsets, unmatched deadlines and ledger changes, including deleted edges.
 * A match with zero timing credit is still a match. N never substitutes for a miss.
 */
function observe(p) {
  const generations = new Map(), predictions = new Map(), weightChanges = [], windows = [];
  const register = (w, t, presentAtStart = false) => {
    if (!generations.has(w.generation)) generations.set(w.generation, { generation: w.generation, ruleKey: w.ruleKey,
      A: w.A, B: w.B, k: w.k, createdAt: w.createdAt, presentAtStart, observedFrom: t,
      initialW: w.W, lastMeasuredW: w.W, initialDeltas: clone(w.deltas), finalDeltas: clone(w.deltas),
      predictionsEmitted: 0, matches: 0, unmatchedDeadlines: 0, deletedAt: null });
    return generations.get(w.generation);
  };
  for (const w of p.downward.weights) register(w, p.t, true);
  const key = e => JSON.stringify([e.generation, e.tOnset, e.tArrive]);
  const registerPrediction = (e, t, emittedHere = false) => {
    if (!predictions.has(key(e))) {
      predictions.set(key(e), { ...clone(e), observedFrom: t, emittedHere, firstMatchedAt: null, deadlineAt: null,
        matchObserved: e.matched > 0, matchedBeforeObservation: e.matched > 0 });
      if (emittedHere) generations.get(e.generation).predictionsEmitted++;
    }
    return predictions.get(key(e));
  };
  for (const e of p.errors.pending) registerPrediction(e, p.t);
  const original = p.factor.step;
  p.factor.step = function(t, counts, pending, options) {
    const before = new Map(p.downward.weights.map(w => {
      register(w, t); return [w.generation, { w, W: w.W, deltas: clone(w.deltas) }];
    }));
    for (const e of p.future.created) registerPrediction(e, t, true);
    const deadlines = [];
    for (const e of pending) {
      const event = registerPrediction(e, t), g = generations.get(e.generation);
      event.matched = e.matched;
      if (e.matched > 0 && !event.matchObserved) {
        event.matchObserved = true; event.firstMatchedAt = t; event.matchedStrength = e.matched;
        event.timingCredit = predictionCredit(e.activation, e.tArrive, t);
        event.generationLiveAtMatch = before.has(e.generation);
        if (g) g.matches++;
      }
      if (t === e.tArrive + NOVELTY.toleranceMs) {
        event.deadlineAt = t; event.unmatched = !(e.matched > 0); event.generationLiveAtDeadline = before.has(e.generation);
        event.learnerCreditBeforeDeadline = clone(this.predictions.find(c => c.generation === e.generation && c.tArrive === e.tArrive) ?? null);
        event.targetNovelty = clone(counts.find(c => c.id === e.B));
        if (event.unmatched && g) g.unmatchedDeadlines++;
        deadlines.push(event);
      }
    }
    const result = original.call(this, t, counts, pending, options);
    const after = new Map(p.downward.weights.map(w => [w.generation, w]));
    const deltas = new Map();
    for (const [generation, b] of before) {
      const g = generations.get(generation), w = b.w, live = after.has(generation);
      const ledgerDelta = Object.fromEntries(Object.keys(w.deltas).map(k => [k, w.deltas[k] - b.deltas[k]]));
      g.lastMeasuredW = w.W; g.finalDeltas = clone(w.deltas);
      if (!live) g.deletedAt ??= t;
      deltas.set(generation, ledgerDelta);
      if (!live || w.W !== b.W || Object.values(ledgerDelta).some(v => v !== 0)) weightChanges.push({
        t, generation, ruleKey: w.ruleKey, beforeW: b.W, afterW: w.W, deltaW: w.W - b.W,
        liveAfter: live, ledgerDelta, structuralRemoval: !live });
    }
    for (const w of after.values()) if (!before.has(w.generation)) {
      const g = register(w, t);
      g.birthNovelty = clone(counts.find(c => c.id === w.B));
      g.birthSourceActivity = p.unroll.lines(t)[p.unroll.indices.get(w.A) * 9 + w.k];
      weightChanges.push({ t, generation: w.generation, ruleKey: w.ruleKey, beforeW: 0, afterW: w.W,
        deltaW: w.W, liveAfter: true, birth: true, ledgerDelta: clone(w.deltas) });
    }
    for (const e of deadlines) e.generationLedgerDeltaAtDeadline = deltas.get(e.generation) ?? null;
    windows.push({ t, counts: clone(counts) });
    return result;
  };
  return { finish() {
    const live = new Set(p.downward.weights.map(w => w.generation));
    return { generations: [...generations.values()].map(g => ({ ...g, live: live.has(g.generation) })),
      predictions: [...predictions.values()], weightChanges, windows,
      semantics: 'Generation identity is the persisted monotonic generation ID, not rule key or birth time. Removed edges retain last measured residual W. Unmatched deadlines are actual observed prediction events, including events whose generation was already deleted; ledger changes show which events could affect learning. Preexisting pending predictions have observation bounds, not reconstructed match times.' };
  } };
}
const scales = p => p.errors.rows.map(row => ({ id: row.id, Ninh: [...row.Ninh.scale] }));
function saveOnline(p, result, audit) {
  write('state.json', checkpoint(p)); write('result.json', result); write('audit.json', audit.finish()); write('novelty-scales.json', scales(p));
}
function teachers() {
  const teacher = teachFeatures(seed), p = makePipeline(teacher, seed);
  p.teacherMetadata = { epochs: teacher.epochs, durationMs: teacher.durationMs, mapping: clone(teacher.mapping) };
  write('state.json', checkpoint(p));
  write('result.json', { freshTeacher: true, onlineTrials: 0, teacher: p.teacherMetadata });
}
const PAIRS = [['lightning', 'thunder'], ['bird', 'thunder'], ['thunder', 'lightning']];
function storm(shuffled) {
  const p = restore(input('teachers')), audit = observe(p), world = stormWorld({ seed, count: COUNTS.stormTrials, shuffled });
  const initial = Object.fromEntries(PAIRS.map(([A, B]) => [`${A}->${B}`, weightProfile(p, A, B)]));
  const profiles = () => Object.fromEntries(PAIRS.map(([A, B]) => {
    const key = `${A}->${B}`, value = weightProfile(p, A, B);
    const delta = value.rho.map((v, k) => v === null ? null : v - initial[key].rho[k]);
    return [key, { ...value, delta, deltaArgmax: delta.indexOf(Math.max(...delta.filter(v => v !== null))) }];
  }));
  const trials = [], onsets = [];
  while (p.t < world.duration) {
    const r = advance(p, world); onsets.push(...p.unroll.entries.filter(e => e.tOnset === r.t).map(clone));
    if (trials.length < world.trials.length && p.t >= world.trials[trials.length].end) {
      trials.push({ trial: trials.length + 1, t: p.t, downward: clone(p.downward), profiles: profiles() });
      if (trials.length % 5 === 0) console.log(`${phase}: ${trials.length}/${COUNTS.stormTrials}`);
    }
  }
  saveOnline(p, { seed, shuffled, trials, world: { events: world.events, trials: world.trials, duration: world.duration },
    initial, profiles: profiles(), onsets, finalDownward: clone(p.downward), mapping: p.mapping }, audit);
}
function m4(shuffled) {
  assert.equal(PROBE_TRIALS, 10); assert.deepEqual(PROBES, ['lightning', 'lightning+thunder', 'bird']);
  const p = restore(input(shuffled ? 'storm-shuffled' : 'storm-causal'));
  const beforeLearning = jsonHash(saveLearning(p)), beforeDownward = jsonHash(p.downward);
  const result = probe(p, p.baseline);
  assert.equal(jsonHash(saveLearning(p)), beforeLearning, 'Frozen probe changed online learning state');
  assert.equal(jsonHash(p.downward), beforeDownward, 'Frozen probe changed downward weights');
  const thunder = p.mapping.find(a => a.feature === 'thunder').id;
  const thunderStrengthPerProbe = Object.fromEntries(result.summaries.map(s => [s.kind,
    result.trials.filter(t => t.kind === s.kind).flatMap(t => t.created).filter(e => e.B === thunder)
      .reduce((sum, e) => sum + e.strength, 0) / s.trials]));
  write('result.json', { ...result, mapping: p.mapping, thunderStrengthPerProbe, frozenOnlineLearning: true,
    noveltyMeasured: false, noveltyReason: 'Unchanged frozen M4 helper does not advance the online novelty network.' });
  write('probe-state.json', { schema: 'm11h-frozen-probe-v1', seed, t: p.t, mapping: p.mapping,
    layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), frozenTrainingLearning: saveLearning(p), probeFuture: result.finalFuture,
    continuation: 'Not an online-learning checkpoint: sensory/probe time advanced while training learning stayed frozen.' });
}
function omission() {
  const p = restore(input('storm-causal')), audit = observe(p), id = feature => p.mapping.find(a => a.feature === feature).id;
  const ruleKey = JSON.stringify([id('lightning'), 6, id('thunder')]);
  const original = p.downward.weights.find(w => w.ruleKey === ruleKey && w.W > DOWNWARD.wInit && w.deltas.STDP > 0);
  if (!original) {
    saveOnline(p, { performed: false, ruleKey, reason: 'Causal training did not leave a strengthened true edge. No weight was planted; omission-on-learned-edge condition was not established.' }, audit);
    return;
  }
  const originalGeneration = original.generation, initialW = original.W, trials = [], onsets = [], events = [];
  for (let trial = 1; trial <= COUNTS.omissionTrials; trial++) {
    const start = p.t, stimulus = { g: 'lightning', start, duration: 100, trial }; events.push(stimulus);
    const world = stormEnv([stimulus], start);
    while (p.t < start + COUNTS.omissionSlotMs) {
      const r = advance(p, world); onsets.push(...p.unroll.entries.filter(e => e.tOnset === r.t).map(clone));
    }
    const current = p.downward.weights.find(w => w.ruleKey === ruleKey);
    trials.push({ trial, start, end: p.t, currentGeneration: current?.generation ?? null, currentW: current?.W ?? 0,
      originalGenerationLive: current?.generation === originalGeneration,
      originalGenerationW: current?.generation === originalGeneration ? current.W : 0,
      originalLastMeasuredW: original.W, originalDeltas: clone(original.deltas) });
    if (trial % 5 === 0) console.log(`omission: ${trial}/${COUNTS.omissionTrials}, current W=${current?.W ?? 0}`);
  }
  saveOnline(p, { performed: true, count: COUNTS.omissionTrials, ruleKey, originalGeneration, initialW,
    originalFinalActiveW: trials.at(-1).originalGenerationW, finalRuleW: trials.at(-1).currentW, trials, events, onsets,
    finalDownward: clone(p.downward), interpretation: 'Short representative omission run, not the old 60-trial extinction/recovery acceptance. Physical omission does not assume an unmatched neural prediction; inspect the actual event audit.' }, audit);
}
function rest() {
  const p = restore(input('storm-causal')), audit = observe(p), start = p.t, initialDownward = clone(p.downward);
  const rho = layer => layer.replicas.map(r => [...r.EE.stdp.rho]);
  const initialRho = { sensory: rho(p.layer1), layer2: rho(p.layer2) };
  const netStart = p.errors.net.t;
  const populations = p.errors.rows.map(row => ({ id: row.id, bins: new Uint32Array(COUNTS.restMs / 10),
    cells: row.N.map(cell => ({ cell, count: 0, bursts: 0, last: [] })) }));
  const onsets = [], world = stormEnv([], start); let opened = 0, windows = 0;
  const originalGate = p.gate.step;
  p.gate.step = function(counts) { const open = originalGate.call(this, counts); opened += Number(open); windows++; return open; };
  while (p.t < start + COUNTS.restMs) {
    const r = advance(p, world); onsets.push(...p.unroll.entries.filter(e => e.tOnset === r.t).map(clone));
    for (const pop of populations) for (const c of pop.cells) for (const t of p.errors.net.spikes[c.cell]) {
      c.count++;
      if (c.last.length === 2 && t - c.last[0] <= 20 + 1e-7) c.bursts++;
      c.last.push(t); if (c.last.length > 2) c.last.shift();
      const bin = Math.floor((t - netStart - 1e-7) / 10);
      assert.ok(bin >= 0 && bin < pop.bins.length, 'Rest spike outside recorded interval'); pop.bins[bin]++;
    }
  }
  const seconds = COUNTS.restMs / 1000;
  const stats = populations.map(pop => {
    const cells = pop.cells.map(({ last, ...c }) => ({ ...c, rateHz: c.count / seconds }));
    const bins = [...pop.bins], average = mean(bins), variance = mean(bins.map(v => (v - average) ** 2));
    const meanHz = mean(cells.map(c => c.rateHz)), burstsPerSecond = cells.reduce((s, c) => s + c.bursts, 0) / seconds;
    const fano = average > 0 ? variance / average : null;
    return { id: pop.id, cells, bins, meanHz, burstsPerSecond, fano,
      originalPopulationCriteriaPass: meanHz >= 0.5 && meanHz <= 3 && burstsPerSecond <= 0.5 && fano !== null && fano <= 1.5 };
  });
  const drift = (before, after) => {
    const delta = before.flatMap((xs, r) => xs.map((v, i) => after[r][i] - v));
    return { meanDeltaRho: mean(delta), maximumAbsoluteDeltaRho: Math.max(...delta.map(Math.abs)),
      sumPositiveDeltaRho: delta.filter(x => x > 0).reduce((a, b) => a + b, 0),
      sumNegativeDeltaRho: delta.filter(x => x < 0).reduce((a, b) => a + b, 0) };
  };
  saveOnline(p, { simulatedMs: COUNTS.restMs, externalEvents: [], actualNeuralLearningOn: true, onsets,
    populations: stats, gateOpenFraction: opened / windows, originalGateCriterionPass: opened / windows < 0.01,
    initialDownward, finalDownward: clone(p.downward),
    drift: { sensory: drift(initialRho.sensory, rho(p.layer1)), layer2: drift(initialRho.layer2, rho(p.layer2)) },
    interpretation: 'Population criteria are unchanged: 0.5..3 Hz/cell, <=0.5 bursts/s/population, Fano <=1.5; signed surprise gate <1%. This is actual learned-network rest, not the historical synthetic-source consumer drift test. No new drift threshold or overall acceptance is inferred.' }, audit);
}
const ratio = (numerator, denominator) => ({ numerator, denominator,
  value: denominator > 0 ? numerator / denominator : null,
  zeroDenominator: denominator === 0,
  interpretation: denominator > 0 ? 'Finite measured ratio' : numerator > 0 ? 'Positive numerator / zero denominator' : 'No signal in either condition' });
function report() {
  const available = Object.keys(PHASES).filter(p => p !== 'report' && existsSync(resolve(outputRoot, p, 'artifact-manifest.json')));
  const results = Object.fromEntries(available.map(p => [p, input(p, 'result.json')]));
  const summary = { seed, available, missing: Object.keys(PHASES).filter(p => p !== 'report' && !available.includes(p)),
    historicalResultsImported: false, multiSeedAcceptance: 'NOT RUN', goalValidation: 'NOT RUN',
    historicalM4: 'An old causal/bird ratio below 5 belongs to the old mechanism only. It is neither an expectation nor fresh evidence for this run.' };
  if (results['storm-causal'] && results['storm-shuffled']) {
    const teachers = ['storm-causal', 'storm-shuffled'].map(p => validatePhase(p).provenance.inputs.find(i => i.phase === 'teachers' && i.name === 'state.json'));
    assert.ok(teachers.every(Boolean)); assert.equal(teachers[0].sha256, teachers[1].sha256, 'Causal and shuffled branches used different teacher states');
    summary.sameFreshTeacherSHA256 = teachers[0].sha256;
    summary.stormProfiles = Object.fromEntries(['storm-causal', 'storm-shuffled'].map(p => [p, results[p].profiles]));
  }
  if (results['m4-causal'] && results['m4-shuffled']) {
    const a = results['m4-causal'], b = results['m4-shuffled'], id = feature => a.mapping.find(x => x.feature === feature).id;
    const L = id('lightning'), T = id('thunder'), B = id('bird');
    const forward = a.downward.weights.filter(w => w.A === L && w.B === T);
    const peak = forward.reduce((x, w) => !x || w.W > x.W ? w : x, null);
    const trueW = (forward.find(w => w.k === 6)?.W ?? 0) / DOWNWARD.wMax;
    const maxW = (result, A) => Math.max(0, ...result.downward.weights.filter(w => w.A === A && w.B === T).map(w => w.W / DOWNWARD.wMax));
    const shuffledW = maxW(b, L), birdW = maxW(a, B);
    const peakArrivals = a.trials.flatMap(t => t.arrivals).filter(e => e.ruleKey === peak?.ruleKey);
    const peakArrivalMs = mean(peakArrivals.map(e => e.observedAt - e.tOnset));
    const flags = { peak: peak?.k === 6 && peakArrivalMs === 3200,
      shuffled: trueW > 0 && trueW >= 5 * shuffledW, bird: trueW > 0 && trueW >= 5 * birdW,
      timely: a.summaries.filter(s => s.kind !== 'bird').every(s => s.timelyTrialFraction >= 0.9),
      matching: a.summaries.find(s => s.kind === 'lightning+thunder').matchedOnsetFraction >= 0.9 &&
        a.summaries.find(s => s.kind === 'lightning+thunder').matchedEventFraction >= 0.9 };
    const predictionStrength = kind => a.summaries.find(s => s.kind === kind).predictionStrengthPerProbe;
    summary.m4 = { causalVsBirdWeightRatio: ratio(trueW, birdW), causalVsShuffledWeightRatio: ratio(trueW, shuffledW),
      lightningVsBirdPredictionStrengthRatio: ratio(predictionStrength('lightning'), predictionStrength('bird')),
      lightningVsBirdThunderStrengthRatio: ratio(a.thunderStrengthPerProbe.lightning, a.thunderStrengthPerProbe.bird),
      peakColumn: peak?.k ?? null, peakArrivalMs, unchangedM4Flags: flags, selectedM4Pass: Object.values(flags).every(Boolean),
      summaries: { causal: a.summaries, shuffled: b.summaries },
      interpretation: 'Ratios and negative flags are actual fresh observations. The historical 5x criterion was not tuned. A selected M4 pass is not full-system acceptance.' };
  } else summary.m4 = { status: 'NOT RUN: both fresh M4 conditions are required; new causal/bird ratio remains unknown.' };
  if (results.omission) {
    const result = results.omission, audit = input('omission', 'audit.json');
    summary.omission = { ...result, originalGenerationAudit: audit.generations.find(g => g.generation === result.originalGeneration) ?? null,
      originalPredictions: audit.predictions.filter(p => p.generation === result.originalGeneration),
      originalRetention: result.performed ? ratio(result.originalFinalActiveW, result.initialW) : null };
  }
  if (results.rest) summary.rest = results.rest;
  summary.acceptance = 'Representative evidence only. Missing phases and failed checks stay explicit; no old numerical result, new goal gate, or pruning default is inferred.';
  write('result.json', summary);
}
function finish(error = null) {
  const changed = changedSources(), inputChanged = inputs.filter(i => {
    const file = resolve(outputRoot, i.phase, i.name), manifest = resolve(outputRoot, i.phase, 'artifact-manifest.json');
    return !existsSync(file) || !existsSync(manifest) || hash(readFileSync(file)) !== i.sha256 || hash(readFileSync(manifest)) !== i.manifestSHA256;
  }).map(i => `${i.phase}/${i.name}`);
  const valid = error === null && changed.length === 0 && inputChanged.length === 0;
  write('provenance.json', { ...provenance, inputs, constants: { DOWNWARD, NOVELTY, THREE_FACTOR } });
  write('complete.json', { phase, seed, valid, completedAt: new Date().toISOString(),
    wallSeconds: (performance.now() - started) / 1000, sourceChangedDuringPhase: changed,
    inputChangedDuringPhase: inputChanged,
    error: error ? { name: error.name, message: error.message } : null });
  const files = walk(directory).sort().map(path => {
    const bytes = readFileSync(path); return { path: relative(directory, path), bytes: bytes.length, sha256: hash(bytes) };
  });
  write('artifact-manifest.json', { schema: 'm11h-artifacts-v1', phase, seed, files });
  const bytes = readFileSync(resolve(directory, 'artifact-manifest.json'));
  const seal = { schema: 'm11h-manifest-seal-v1', phase, bytes: bytes.length, sha256: hash(bytes) };
  write('artifact-manifest.sha256.json', seal);
  console.log(JSON.stringify({ phase, directory, valid,
    wallSeconds: (performance.now() - started) / 1000, artifactManifest: seal,
    next: 'Save this complete phase package before starting another phase. No next phase was started.' }, null, 2));
  assert.equal(changed.length, 0, 'Sources changed during this phase; artifacts are marked invalid.');
  assert.equal(inputChanged.length, 0, 'Inputs changed during this phase; artifacts are marked invalid.');
}
try {
  assert.deepEqual(changedSources(), [], 'Sources changed while preparing the phase; no neural work started.');
  if (phase === 'teachers') teachers();
  else if (phase.startsWith('storm-')) storm(phase.endsWith('shuffled'));
  else if (phase.startsWith('m4-')) m4(phase.endsWith('shuffled'));
  else if (phase === 'omission') omission();
  else if (phase === 'rest') rest();
  else report();
} catch (error) { finish(error); throw error; }
finish();
