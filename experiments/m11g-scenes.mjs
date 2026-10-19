/** Fresh, independently checkpointed neural/world scenes. This file contains no
 * recovered results. --plan is read-only; a neural phase requires explicit --run.
 * Upload each completed phase (including state and source snapshot) before the
 * next long phase. No historical cache helper is invoked. No phase auto-chains.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AttractorLayer, LAYER2 } from '../src/layer.mjs';
import { OutputLayer } from '../src/output.mjs';
import { LINES_PER_GROUP } from '../src/io.mjs';
import { attachLearning, saveLearning, loadLearning } from '../src/learning.mjs';
import { stormWorld, stormEnv } from '../src/world.mjs';
import { actionsEnv, chainEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { DOWNWARD } from '../src/downward.mjs';
import { THREE_FACTOR, predictionCredit } from '../src/three-factor.mjs';
import { ERRORS, effectiveMiss, effectiveNovelty } from '../src/errors.mjs';
import { WINDOW_MS } from '../src/readout.mjs';
import { teachFeatures, makePipeline, advance, weightProfile, describeAttractors } from './m3-pipeline.mjs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';
import { saveLayer, loadLayer } from './m8-cache.mjs';
import { teacherSchedule } from './m11a-runtime.mjs';
import { measurements, slope } from './m11a-measure.mjs';
import { calibrationTrial } from './m6-trial.mjs';
import { probe as probeStorm } from './m4-probe.mjs';
import { probeChain } from './m10-probe.mjs';
import { goalPipeline } from './m9-pipeline.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const phase = process.argv[2] ?? '--plan';
const arg = (name, fallback) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const seed = Number(arg('seed', 7));
assert.ok(Number.isInteger(seed) && seed >= 0);
const outputRoot = resolve(ROOT, arg('out', `out/m11g-scenes/seed-${seed}`));
const calibrationFile = arg('calibration', null);
const progressLog = process.env.BIO_BRAIN_PROGRESS_LOG;
const note = message => { console.log(message); if (progressLog) appendFileSync(progressLog, `${new Date().toISOString()} ${message}\n`); };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = x => structuredClone(x);
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const jsonHash = x => hash(JSON.stringify(x));
const PHASES = {
  teachers: [], 'storm-causal': ['teachers'], 'storm-shuffled': ['teachers'],
  'm4-causal': ['storm-causal'], 'm4-shuffled': ['storm-shuffled'],
  'storm-A': ['storm-causal'], 'storm-B': ['storm-A'], 'storm-C': ['storm-B'],
  'storm-D': ['storm-A'], 'storm-E': ['storm-A'],
  'action-M8': ['teachers'], 'action-T1': ['action-M8'], 'action-T2': ['action-T1'],
  'action-natural': ['action-T2'], 'gate-0.2': ['action-natural'], 'gate-0.3': ['action-natural'],
  'gate-0.4': ['action-natural'], rest: ['storm-causal'], report: [],
};
const PLAN = { seed, outputRoot, protocol: {
  storm: 'Fresh matched causal30/shuffled30; frozen M4 10 probes per kind per world.',
  adaptation: 'A10 paired; B60 omitted; C60 paired recovery from B. D30 jitter ±300ms and E30 alternating50/50 each branch from exactly saved end A.',
  actions: 'Fresh isolated teachers, M8 causal30 sensory/motor prehistory, fresh rule-layer T1-30, T2-30, natural-world teacher-scheduled continuation60. No natural goal-driven validation is implied.',
  gates: 'Separate .2/.3/.4 phases, each restored from identical end-natural neural/motor/downward/error state, matched environment seeds, three repeats of five frozen conditions. No default selected from this screen.',
  rest: '300s zero external input from the freshly trained causal state; actual neural populations and learner remain on.',
  checkpoints: 'One phase per invocation. Source bytes/hashes and git provenance before any neural work; full states, genuine deadlines, generation lifecycle, comparator scales, exact-boundary samples and artifact manifest at completion.',
  limitations: 'No historical lost result counts as fresh evidence. Legacy all-negative false-weight slopes and removed separate-hit ratios are retained diagnostics, not current mandatory acceptance.',
}, phases: PHASES };
if (phase === '--plan' || phase === '--help') { console.log(JSON.stringify(PLAN, null, 2)); process.exit(0); }
assert.ok(Object.hasOwn(PHASES, phase), `Unknown phase ${phase}; use --plan`);
const preflightOnly = process.argv.includes('--preflight');
if (phase !== 'report') assert.ok(preflightOnly || process.argv.includes('--run'), 'No neural work starts without explicit --run. Save the code checkpoint first.');
if (phase !== 'report') assert.ok(calibrationFile && existsSync(resolve(ROOT, calibrationFile)),
  'Provide --calibration=PATH to the freshly saved comparator calibration evidence; a recovered constant alone is not fresh validation.');
const started = performance.now(), directory = resolve(outputRoot, phase);
function write(name, value) {
  const path = resolve(directory, name), tmp = `${path}.tmp`;
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(tmp, JSON.stringify(value, null, 2)); renameSync(tmp, path);
}
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesUnder(resolve(dir, e.name)) : [resolve(dir, e.name)]);
}
const sourceFiles = ['src', 'experiments'].flatMap(d => filesUnder(resolve(ROOT, d))).filter(f => /\.(mjs|md)$/.test(f));
sourceFiles.push(resolve(ROOT, 'package.json'));
const sourceHashes = Object.fromEntries(sourceFiles.sort().map(f => [relative(ROOT, f), hash(readFileSync(f))]));
const helperNames = ['m3-pipeline', 'm4-probe', 'm8-pipeline', 'm8-cache', 'm9-pipeline', 'm10-probe', 'm11a-runtime', 'm11a-measure', 'm6-trial', 'm11e-action-blocks'];
const runtimeHashes = Object.fromEntries(Object.entries(sourceHashes).filter(([f]) => f.startsWith('src/') || helperNames.some(n => f === `experiments/${n}.mjs`)));
const runtimeSignature = jsonHash(runtimeHashes);
function validateCalibration(path) {
  const bytes = readFileSync(resolve(ROOT, path)), a = JSON.parse(bytes);
  assert.equal(a.schema, 'm11g-isolated-comparator-v2', 'Expected fresh rebuilt comparator protocol');
  assert.equal(a.complete, true, 'Calibration is incomplete');
  assert.equal(a.calibrationPass, true, 'Calibration or held-out matching did not pass');
  assert.deepEqual(a.sourceChangedDuringRun, [], 'Calibration sources changed during its run');
  assert.ok(Number.isFinite(Date.parse(a.startedAt)) && Number.isFinite(Date.parse(a.finishedAt)) &&
    Date.parse(a.finishedAt) >= Date.parse(a.startedAt), 'Calibration needs valid run timestamps');
  assert.ok(Array.isArray(a.seeds) && a.seeds.length > 0 && new Set(a.seeds).size === a.seeds.length);
  assert.deepEqual(a.runs.map(r => r.seed), a.seeds, 'Calibration is missing a declared seed');
  assert.ok(a.runs.every(r => r.calibration.converged && r.matching.pass &&
    r.weightsFrozenDuringMatching && r.weightsFrozenDuringOmissions && Number.isFinite(r.floor.floor)));
  assert.deepEqual(a.parameters.ERRORS, ERRORS, 'Comparator constants differ from calibration');
  assert.equal(a.parameters.WINDOW_MS, WINDOW_MS);
  assert.equal(a.pooled.floor, THREE_FACTOR.detectionFloor, 'Runtime floor differs from fresh pooled calibration');
  const required = ['src/core/rng.mjs', 'src/core/state.mjs', 'src/errors.mjs', 'src/network.mjs',
    'src/neuron/lif.mjs', 'src/readout.mjs', 'src/stdp.mjs', 'src/synapse.mjs', 'src/unroll.mjs'];
  assert.deepEqual(Object.keys(a.comparatorSourceHashes).sort(), required.sort(), 'Incomplete comparator import-closure hashes');
  for (const [file, expected] of Object.entries(a.comparatorSourceHashes))
    assert.equal(sourceHashes[file], expected, `Calibration is stale for ${file}`);
  const manifestBytes = readFileSync(resolve(ROOT, a.manifest)), manifest = JSON.parse(manifestBytes);
  assert.equal(hash(manifestBytes), a.manifestSHA256, 'Calibration start-source manifest hash mismatch');
  assert.deepEqual(manifest.comparatorSourceHashes, a.comparatorSourceHashes);
  assert.equal(manifest.startedAt, a.startedAt);
  const sha256 = hash(bytes), archive = `calibration/${sha256}.json`;
  return { bytes, manifestBytes, reference: { suppliedPath: path, archive, sha256,
    bytes: bytes.length, manifestArchive: `calibration/${a.manifestSHA256}.manifest.json`,
    manifestSHA256: a.manifestSHA256, startedAt: a.startedAt, finishedAt: a.finishedAt,
    seeds: a.seeds, calibrationPass: a.calibrationPass, pooledFloor: a.pooled.floor,
    comparatorSourceHashes: a.comparatorSourceHashes,
    interpretation: 'Complete fresh rebuilt calibration and held-out matching verified, runtime floor and comparator source closure match. Raw evidence is archived once at run root, not duplicated in each phase.' } };
}
const calibration = phase !== 'report' ? validateCalibration(calibrationFile) : null;
if (preflightOnly) {
  console.log(JSON.stringify({ phase, seed, runtimeSignature, calibration: calibration?.reference, neuralWorkStarted: false }, null, 2));
  process.exit(0);
}
assert.ok(!existsSync(directory), `Refusing to overwrite ${directory}; use a new --out root.`);
mkdirSync(directory, { recursive: true });
if (calibration) {
  for (const [file, bytes, expected] of [
    [calibration.reference.archive, calibration.bytes, calibration.reference.sha256],
    [calibration.reference.manifestArchive, calibration.manifestBytes, calibration.reference.manifestSHA256],
  ]) {
    const target = resolve(outputRoot, file);
    if (existsSync(target)) assert.equal(hash(readFileSync(target)), expected, 'Run-root calibration archive changed');
    else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: 'wx' }); }
  }
  write('calibration-reference.json', calibration.reference);
}
for (const file of sourceFiles) {
  const dest = resolve(directory, 'source-snapshot', relative(ROOT, file)); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, readFileSync(file));
}
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const provenance = { schema: 1, seed, phase, started: new Date().toISOString(), argv: process.argv.slice(2),
  gitHead: git(['rev-parse', 'HEAD']).trim(), gitStatus: git(['status', '--short']), sourceHashes, runtimeHashes, runtimeSignature,
  runnerSha256: sourceHashes['experiments/m11g-scenes.mjs'], historicalResultImported: false, inputs: [],
  calibrationEvidence: calibration?.reference ?? null, constants: { DOWNWARD, THREE_FACTOR, ERRORS } };
write('provenance.json', provenance); writeFileSync(resolve(directory, 'source-diff.patch'), git(['diff']));
function input(from, name = 'state.json') {
  const base = resolve(outputRoot, from), manifestBytes = readFileSync(resolve(base, 'artifact-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, 1); assert.equal(manifest.phase, from);
  const verified = file => {
    const entries = manifest.files.filter(e => e.path === file);
    assert.equal(entries.length, 1, `Input artifact ${from}/${file} needs one manifest entry`);
    const bytes = readFileSync(resolve(base, file)), expected = entries[0];
    assert.equal(bytes.length, expected.bytes, `Input artifact size mismatch: ${from}/${file}`);
    assert.equal(hash(bytes), expected.sha256, `Input artifact hash mismatch: ${from}/${file}`);
    return { bytes, sha256: expected.sha256 };
  };
  const completion = JSON.parse(verified('complete.json').bytes);
  assert.equal(completion.valid, true, `Invalid or unfinished input phase ${from}`);
  const prior = JSON.parse(verified('provenance.json').bytes);
  assert.equal(prior.runtimeSignature, runtimeSignature, `Runtime/helper sources changed since ${from}; start a new run, do not silently mix states.`);
  if (calibration) assert.equal(prior.calibrationEvidence.sha256, calibration.reference.sha256, `Calibration evidence changed since ${from}`);
  const artifact = verified(name);
  provenance.inputs.push({ phase: from, name, bytes: artifact.bytes.length, sha256: artifact.sha256,
    artifactManifestSHA256: hash(manifestBytes) }); write('provenance.json', provenance);
  return JSON.parse(artifact.bytes);
}
function checkpoint(p) {
  return { schema: 1, seed, kind: p.kind, t: p.t, mapping: clone(p.mapping), baseline: clone(p.baseline),
    sensoryTeacher: clone(p.sensoryTeacher), layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), learning: saveLearning(p),
    output: p.output ? { actions: [...p.output.actions], mapping: clone(p.output.mapping), epochs: p.output.epochs,
      durationMs: p.output.durationMs, previous: p.output.previous, layer: saveLayer(p.output.layer) } : null };
}
function restore(s) {
  assert.equal(s.seed, seed); assert.equal(s.schema, 1);
  const sensory = new AttractorLayer({ n: s.sensoryTeacher.mapping.length * LINES_PER_GROUP, seed });
  const p = makePipeline({ layer: sensory, mapping: clone(s.mapping) }, seed);
  p.kind = s.kind; p.sensoryTeacher = clone(s.sensoryTeacher); p.teacher = { ...clone(s.sensoryTeacher), layer: sensory };
  p.t = s.t; p.baseline = clone(s.baseline);
  loadLayer(p.layer1, s.layer1); loadLayer(p.layer2, s.layer2); loadLearning(p, s.learning);
  if (s.output) {
    p.output = Object.assign(Object.create(OutputLayer.prototype), { actions: [...s.output.actions], mapping: clone(s.output.mapping),
      epochs: s.output.epochs, durationMs: s.output.durationMs, previous: s.output.previous,
      layer: new AttractorLayer({ n: s.output.actions.length * LINES_PER_GROUP, seed }) });
    loadLayer(p.output.layer, s.output.layer);
  }
  assert.deepEqual(checkpoint(p), s, 'Full neural/learning state restore differs from checkpoint');
  return p;
}
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, min: sorted[0] ?? null, mean: mean(sorted), max: sorted.at(-1) ?? null,
    median: sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null,
    p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null };
};
function comparatorScales(p) {
  return p.errors.rows.map(r => ({ id: r.id, Minh: { ...stats(r.Minh.scale), values: [...r.Minh.scale] },
    Ninh: { ...stats(r.Ninh.scale), values: [...r.Ninh.scale] } }));
}
/** Read-only instrumentation around the real ThreeFactor call. Matched/consumed
 * events are distinguished from positive STDP: zero-credit boundary hits count.
 * Counts are actual neural outputs; nothing from this audit enters learning.
 */
function observeLearning(p) {
  const generations = new Map(), deaths = [], deadlines = [], matchedPredictions = [], eventsSeen = new Set();
  const generationKey = w => JSON.stringify([w.ruleKey, w.createdAt]);
  function register(w, t, presentAtStart = false) {
    const key = generationKey(w);
    if (!generations.has(key)) generations.set(key, { ruleKey: w.ruleKey, createdAt: w.createdAt, presentAtStart,
      observedFrom: t, initialW: w.W, peakW: w.W, finalW: w.W, positiveSTDPUpdates: 0,
      priorStrengthening: (w.deltas?.STDP ?? 0) > 0, matchedPredictions: 0, zeroCreditMatches: 0,
      actualUnmatchedDeadlines: 0, eligibleMissDeadlines: 0, positiveMeff: 0, zeroMeff: 0,
      firstObservedEligibility: Object.fromEntries([0.2, 0.3, 0.4].map(g => [g, w.W / DOWNWARD.wMax >= g ? t : null])), deadAt: null });
    return generations.get(key);
  }
  p.downward.weights.forEach(w => register(w, p.t, true));
  const original = Object.getPrototypeOf(p.factor).step;
  p.factor.step = function(t, counts, pending, options) {
    const before = [...p.downward.weights].map(w => ({ w, stdp: w.deltas?.STDP ?? 0 }));
    for (const prediction of pending) {
      const w = before.find(x => x.w.ruleKey === prediction.ruleKey && x.w.createdAt === prediction.createdAt)?.w;
      if (!w) continue;
      const g = register(w, t), eventKey = JSON.stringify([prediction.ruleKey, prediction.createdAt, prediction.tOnset, prediction.tArrive]);
      if (prediction.matched > 0 && !eventsSeen.has(eventKey)) {
        eventsSeen.add(eventKey); g.matchedPredictions++;
        const credit = predictionCredit(prediction.activation, prediction.tArrive, t);
        g.zeroCreditMatches += Number(credit === 0);
        matchedPredictions.push({ t, ruleKey: w.ruleKey, createdAt: w.createdAt, tOnset: prediction.tOnset,
          tArrive: prediction.tArrive, matchedStrength: prediction.matched, timingCredit: credit });
      }
      if (t !== prediction.tArrive + ERRORS.toleranceMs) continue;
      const count = counts.find(c => c.id === w.B), credit = this.predictions.find(c =>
        c.ruleKey === w.ruleKey && c.createdAt === w.createdAt && c.tArrive === prediction.tArrive);
      const unmatched = !(prediction.matched > 0), missEligible = unmatched && !!credit && !credit.matched;
      const Meff = effectiveMiss(count.M), recentRealityMs = Math.min(Infinity,
        ...p.unroll.entries.filter(e => e.id === w.B).map(e => t - e.tOnset));
      const record = { t, ruleKey: w.ruleKey, createdAt: w.createdAt, tArrive: prediction.tArrive,
        W: w.W, u: w.W / DOWNWARD.wMax, activation: prediction.activation, predictionStrength: prediction.strength,
        matchedStrength: prediction.matched, unmatched, missEligible, Mraw: count.Mraw, Mdev: count.M,
        Meff, appliedMeff: missEligible ? Meff : 0, aggregateDeadlineStrength: count.deadline,
        recentRealityMs: Number.isFinite(recentRealityMs) ? recentRealityMs : null,
        liveMinh: stats(p.errors.rows.find(r => r.id === w.B).Minh.scale) };
      deadlines.push(record);
      if (unmatched) { g.actualUnmatchedDeadlines++; g.eligibleMissDeadlines += Number(missEligible);
        g[Meff > 0 ? 'positiveMeff' : 'zeroMeff']++; }
    }
    const result = original.call(this, t, counts, pending, options);
    for (const { w, stdp } of before) {
      const g = register(w, t); g.positiveSTDPUpdates += Number((w.deltas?.STDP ?? 0) > stdp);
      g.finalW = w.W; g.peakW = Math.max(g.peakW, w.W); g.deltas = { ...w.deltas };
      for (const gate of [0.2, 0.3, 0.4]) if (w.W / DOWNWARD.wMax >= gate) g.firstObservedEligibility[gate] ??= t;
      if (!p.downward.weights.includes(w)) {
        g.deadAt = t; deaths.push({ t, ruleKey: w.ruleKey, createdAt: w.createdAt, residualW: w.W,
          belowDetectionFloor: w.W / DOWNWARD.wMax < THREE_FACTOR.detectionFloor, deltas: { ...w.deltas } });
      }
    }
    for (const w of p.downward.weights) if (!generations.has(generationKey(w))) {
      const g = register(w, t), c = counts.find(c => c.id === w.B);
      g.birthEvidence = { Nraw: c?.Nraw, Ndev: c?.N, Neff: c ? effectiveNovelty(c.N, WINDOW_MS) : null,
        sourceActivity: p.unroll.lines(t)[p.unroll.indices.get(w.A) * 9 + w.k], deltas: { ...w.deltas } };
    }
    return result;
  };
  return { finish() {
    const live = new Set(p.downward.weights.map(generationKey));
    return { generations: [...generations].map(([key, g]) => ({ ...g, live: live.has(key) })), deaths, deadlines, matchedPredictions,
      semantics: 'No positive STDP update is NOT no matched onset. Inclusive-edge zero-credit matches are logged separately. Unmatched deadlines report real Mraw spikes, signed Mdev, Meff and live inhibitory scales. First eligibility is exact at window resolution for generations born under this audit; preexisting generations are only observation bounds.' };
  } };
}
function saveOnline(p, result, audit) {
  write('state.json', checkpoint(p)); write('audit.json', audit.finish()); write('comparator-scales.json', comparatorScales(p)); write('result.json', result);
}
function finish() {
  const changed = Object.entries(sourceHashes).filter(([file, h]) =>
    !existsSync(resolve(ROOT, file)) || hash(readFileSync(resolve(ROOT, file))) !== h).map(([f]) => f);
  write('complete.json', { valid: changed.length === 0, phase, seed, completed: new Date().toISOString(), wallSeconds: (performance.now() - started) / 1000,
    sourceChangedDuringPhase: changed, runnerChangedDuringPhase: changed.includes('experiments/m11g-scenes.mjs'),
    runtimeChangedDuringPhase: changed.filter(f => Object.hasOwn(runtimeHashes, f)), nextStep: 'Save this phase and its full evidence package durably before the next long phase.' });
  const entries = filesUnder(directory).filter(f => !f.endsWith('/artifact-manifest.json')).sort().map(f =>
    ({ path: relative(directory, f), bytes: readFileSync(f).length, sha256: hash(readFileSync(f)) }));
  write('artifact-manifest.json', { schema: 1, phase, files: entries });
  assert.equal(changed.length, 0, 'Archived source changed during phase; result marked invalid.');
  note(`${phase} complete in ${((performance.now() - started) / 1000).toFixed(1)} s. Save ${directory} before continuing.`);
}
function teachers() {
  const teacher = teachFeatures(seed), storm = makePipeline(teacher, seed);
  storm.kind = 'storm'; storm.sensoryTeacher = { mapping: clone(teacher.mapping), epochs: teacher.epochs, durationMs: teacher.durationMs };
  const actions = actionPipeline(actionsEnv({ seed, count: 30 }), seed);
  actions.kind = 'actions'; actions.sensoryTeacher = { mapping: clone(actions.teacher.mapping), epochs: actions.teacher.epochs, durationMs: actions.teacher.durationMs };
  write('storm-state.json', checkpoint(storm)); write('action-state.json', checkpoint(actions));
  write('result.json', { freshIsolatedTeachers: true, onlineTrials: 0, storm: storm.sensoryTeacher, actions: actions.sensoryTeacher,
    motor: { mapping: actions.output.mapping, epochs: actions.output.epochs, durationMs: actions.output.durationMs } });
}
const PAIRS = [['lightning', 'thunder'], ['bird', 'thunder'], ['thunder', 'lightning']];
function stormTraining(shuffled) {
  const p = restore(input('teachers', 'storm-state.json')), world = stormWorld({ seed, count: 30, shuffled }), a = observeLearning(p);
  const initial = Object.fromEntries(PAIRS.map(([A, B]) => [`${A}->${B}`, weightProfile(p, A, B)]));
  const profiles = () => Object.fromEntries(PAIRS.map(([A, B]) => {
    const key = `${A}->${B}`, profile = weightProfile(p, A, B), delta = profile.rho.map((v, k) => v === null ? null : v - initial[key].rho[k]);
    return [key, { ...profile, delta, argmax: delta.indexOf(Math.max(...delta.filter(x => x !== null))) }];
  }));
  const trials = [], onsets = []; let n = 0;
  while (p.t < world.duration) {
    const r = advance(p, world); onsets.push(...p.unroll.entries.filter(e => e.tOnset === r.t).map(clone));
    if (n < world.trials.length && p.t >= world.trials[n].end) {
      trials.push({ trial: ++n, t: p.t, profiles: profiles(), downward: clone(p.downward) });
      if (n % 5 === 0) note(`${phase} ${n}/30`);
    }
  }
  const state = checkpoint(p), finalLayer1 = p.layer1.identify(), layer2Attractors = describeAttractors(p);
  write('state.json', state); write('audit.json', a.finish()); write('comparator-scales.json', comparatorScales(p));
  write('result.json', { seed, shuffled, count: 30, world, onsets, initial, profiles: profiles(), trials, finalLayer1, layer2Attractors });
}
function m4(shuffled) {
  const p = restore(input(shuffled ? 'storm-shuffled' : 'storm-causal')), result = probeStorm(p, p.baseline);
  const T = p.mapping.find(x => x.feature === 'thunder').id;
  result.strength = Object.fromEntries(result.summaries.map(s => [s.kind, result.trials.filter(t => t.kind === s.kind)
    .flatMap(t => t.created).filter(e => e.B === T).reduce((sum, e) => sum + e.strength, 0) / s.trials]));
  write('result.json', { ...result, mapping: p.mapping, frozenProbeOnly: true });
}
function adaptation(letter) {
  const from = { A: 'storm-causal', B: 'storm-A', C: 'storm-B', D: 'storm-A', E: 'storm-A' }[letter];
  const p = restore(input(from)), a = observeLearning(p), id = name => p.mapping.find(x => x.feature === name).id;
  const ruleKey = JSON.stringify([id('lightning'), 6, id('thunder')]), trial = calibrationTrial(p, ruleKey);
  const n = { A: 10, B: 60, C: 60, D: 30, E: 30 }[letter], jitter = [-300, -200, -100, 0, 100, 200, 300], trials = [];
  for (let i = 0; i < n; i++) {
    const paired = letter !== 'B' && (letter !== 'E' || i % 2 === 0);
    trials.push(trial(paired, 3000 + (letter === 'D' ? jitter[i % jitter.length] : 0)));
    if ((i + 1) % 10 === 0) note(`${phase} ${i + 1}/${n}: u=${trials.at(-1).W / DOWNWARD.wMax}`);
  }
  saveOnline(p, { letter, ruleKey, trials, trajectory: [trials[0].before, ...trials.map(t => t.W)], branchSource: from }, a);
}
function actionTraining(name) {
  const from = { M8: 'teachers', T1: 'action-M8', T2: 'action-T1', natural: 'action-T2' }[name];
  const p = restore(input(from, name === 'M8' ? 'action-state.json' : 'state.json'));
  if (name === 'T1') {
    p.t = 0; p.layer2 = new AttractorLayer({ n: p.mapping.length * 9, R: 1, seed: seed + 30000, level: 2 });
    attachLearning(p, seed); // Same M10 reset: retain fresh-M8 sensory/motor, not M8 rules.
  }
  const count = name === 'natural' ? 60 : 30;
  p.env = name === 'M8' ? actionsEnv({ seed, count }) : chainEnv({ seed: name === 'natural' ? seed + 60000 : seed, count, phase: name === 'natural' ? 'goal' : name });
  const schedule = name === 'T2' ? new Map() : teacherSchedule(seed, p.env.actions, name === 'natural' ? 30 : 0, count);
  const a = observeLearning(p), measure = name === 'natural' ? measurements(p) : null;
  const start = p.t, copies = [], observations = [], trials = [];
  for (let trial = 1; trial <= count; trial++) {
    while (p.t < start + trial * ACTION_WORLD.slotMs) {
      const action = schedule.get(p.t - start), drive = new Float64Array(p.output.actions.length);
      if (action) drive[p.output.actions.indexOf(action)] = 1;
      const r = advanceActions(p, drive); assert.equal(r.executed.action, action ?? null);
      for (const e of p.unroll.entries.filter(e => e.tOnset === r.t)) {
        if (typeof e.id === 'string') copies.push({ t: r.t - start, action: e.id.slice(7) });
        else observations.push({ t: r.t - start, ...e });
      }
      measure?.observe(trial, r.t);
    }
    measure?.sample(); // Exact phase/trial boundary, BEFORE the next neural window.
    trials.push({ trial, t: p.t, downward: clone(p.downward) });
    if (trial % 5 === 0) note(`${phase} ${trial}/${count}`);
  }
  assert.deepEqual(copies, p.env.executed.map(({ t, action }) => ({ t, action })));
  assert.equal(copies.length, name === 'T2' ? 0 : count * p.env.actions.length);
  if (name === 'T1') assert.ok(!p.env.events.some(e => e.g === 'bell'));
  const diagnostics = measure?.finish();
  saveOnline(p, { name, count, events: p.env.events, executed: p.env.executed, copies, observations, trials,
    naturalTeacherDiagnostics: diagnostics ? { ...diagnostics, legacyDiagnosticOnly: true,
      interpretation: 'All-negative false-weight slopes are retained legacy diagnostics, not current mandatory acceptance. Per-generation unmatched deadlines and lifecycle govern extinction evidence.' } : null,
    sampling: 'Exact per-trial boundaries', naturalGoalDrivenValidation: 'NOT RUN' }, a);
}
function gateProbe(threshold) {
  const state = input('action-natural'), p = restore(state), beforeHash = jsonHash(checkpoint(p));
  // Fail before long calibration/probing if the rebuilt shared helpers do not
  // support the explicit candidate. The result also verifies the applied gate.
  for (const gate of [0.2, 0.4]) assert.equal(goalPipeline(p, p.baseline, seed, p.downward, { actionThreshold: gate }).goal.actionThreshold, gate,
    'goalPipeline must forward actionThreshold options before gate scenes run');
  assert.match(readFileSync(resolve(ROOT, 'experiments/m10-probe.mjs'), 'utf8'), /actionThreshold/,
    'probeChain must forward and report actionThreshold before gate scenes run');
  const endState = { downward: clone(p.downward), errors: p.errors.saveState() };
  const result = probeChain(p, p.baseline, seed, [], endState, 3, { actionThreshold: threshold });
  assert.equal(result.actionThreshold, threshold, 'Probe used the wrong action gate');
  write('result.json', { ...result, startingStateHash: beforeHash, sourceStateHash: jsonHash(state),
    scope: 'Three-repeat frozen screening only; not legacy twenty-repeat acceptance and not natural goal-driven validation.', acceptedDefault: null });
}
function rest() {
  const p = restore(input('storm-causal')), a = observeLearning(p), initial = clone(p.downward), start = p.t;
  const rho = layer => layer.replicas.map(r => [...r.EE.stdp.rho]);
  const before = { sensory: rho(p.layer1), layer2: rho(p.layer2) }, onsets = [], windows = [];
  const original = p.factor.step;
  p.factor.step = function(t, counts, pending, options) {
    windows.push({ t, Nraw: counts.map(c => c.Nraw), Mraw: counts.map(c => c.Mraw), Ndev: counts.map(c => c.N), Mdev: counts.map(c => c.M) });
    return original.call(this, t, counts, pending, options);
  };
  const world = stormEnv([], start);
  while (p.t < start + 300000) {
    const r = advance(p, world); onsets.push(...p.unroll.entries.filter(e => e.tOnset === r.t).map(clone));
  }
  const drift = (old, next) => {
    const delta = old.flatMap((xs, r) => xs.map((v, i) => next[r][i] - v));
    return { before: old, after: next, meanDeltaRho: mean(delta), maximumAbsoluteDeltaRho: Math.max(...delta.map(Math.abs)),
      sumPositiveDeltaRho: delta.filter(x => x > 0).reduce((a, b) => a + b, 0), sumNegativeDeltaRho: delta.filter(x => x < 0).reduce((a, b) => a + b, 0) };
  };
  saveOnline(p, { simulatedMs: 300000, externalEvents: [], actualNeuralLearnerOn: true, spontaneousOnsets: onsets, windows,
    initialDownward: initial, finalDownward: clone(p.downward), drift: { sensory: drift(before.sensory, rho(p.layer1)), layer2: drift(before.layer2, rho(p.layer2)) } }, a);
}
function report() {
  const available = Object.keys(PHASES).filter(k => k !== 'report' && existsSync(resolve(outputRoot, k, 'complete.json')));
  const results = Object.fromEntries(available.map(k => [k, input(k, 'result.json')]));
  const summary = { seed, available, missing: Object.keys(PHASES).filter(k => k !== 'report' && !available.includes(k)),
    historicalResultsUsed: false, fullMultiSeedAcceptance: 'NOT RUN', acceptedDefaultGate: null, naturalGoalDrivenValidation: 'NOT RUN' };
  if (results['storm-causal'] && results['storm-shuffled']) {
    const a = results['storm-causal'], b = results['storm-shuffled'];
    const expected = input('teachers', 'storm-state.json').sensoryTeacher.mapping.map(({ id, members }) => ({ id, members })).sort((x, y) => x.id - y.id);
    summary.m3SelectedChecks = { peak: a.profiles['lightning->thunder'].argmax === 6,
      versusShuffledMargin: a.profiles['lightning->thunder'].delta[6] - b.profiles['lightning->thunder'].delta[6],
      versusBirdMargin: a.profiles['lightning->thunder'].delta[6] - a.profiles['bird->thunder'].delta[6],
      teacherGroupsPreserved: [a, b].every(r => JSON.stringify(r.finalLayer1) === JSON.stringify(expected)),
      noLayer2Collapse: [a, b].every(r => r.layer2Attractors.every(x => x.cellCount < 27 * LAYER2.cells / 2)),
      crossSeedControlPeakCriterion: 'NOT RUN' };
    const c = summary.m3SelectedChecks;
    c.shuffledMarginPass = c.versusShuffledMargin >= 0.05; c.birdMarginPass = c.versusBirdMargin >= 0.05;
    c.selectedPass = c.peak && c.shuffledMarginPass && c.birdMarginPass && c.teacherGroupsPreserved && c.noLayer2Collapse;
  }
  if (results['m4-causal'] && results['m4-shuffled']) {
    const a = results['m4-causal'], b = results['m4-shuffled'], id = name => a.mapping.find(x => x.feature === name).id;
    const L = id('lightning'), T = id('thunder'), forward = a.downward.weights.filter(w => w.A === L && w.B === T);
    const peak = forward.reduce((x, y) => !x || y.W > x.W ? y : x, null), arrivals = a.trials.flatMap(t => t.arrivals).filter(e => e.ruleKey === peak?.ruleKey);
    const peakArrivalMs = mean(arrivals.map(e => e.observedAt - e.tOnset)), trueColumn = (forward.find(w => w.k === 6)?.W ?? 0) / DOWNWARD.wMax;
    const maximum = (r, A) => Math.max(0, ...r.downward.weights.filter(w => w.A === A && w.B === T).map(w => w.W / DOWNWARD.wMax));
    const singleShuffled = maximum(b, L), singleBird = maximum(a, id('bird'));
    const flags = { peak: peak?.k === 6 && peakArrivalMs === 3200, shuffled: trueColumn > 0 && trueColumn >= 5 * singleShuffled,
      bird: trueColumn >= 5 * singleBird, timely: a.summaries.slice(0, 2).every(s => s.timelyTrialFraction >= 0.9),
      matching: a.summaries[1].matchedOnsetFraction >= 0.9 && a.summaries[1].matchedEventFraction >= 0.9 };
    summary.m4UnchangedAcceptance = { trueColumn, singleShuffled, singleBird, peakArrivalMs, flags, pass: Object.values(flags).every(Boolean) };
  }
  if (['A', 'B', 'C', 'D', 'E'].every(k => results[`storm-${k}`])) {
    const r = Object.fromEntries('ABCDE'.split('').map(k => [k, results[`storm-${k}`]])), end = k => r[k].trajectory.at(-1), start = end('A');
    const stateA = input('storm-A'), original = stateA.learning.future.downward.weights.find(w => w.ruleKey === r.A.ruleKey), auditB = input('storm-B', 'audit.json');
    const generations = auditB.generations.filter(g => g.ruleKey === r.A.ruleKey), originalDeath = generations.find(g => g.createdAt === original?.createdAt)?.deadAt;
    const slopes = { full: slope(r.E.trajectory), last10: slope(r.E.trajectory.slice(-10)) };
    const checks = { extinction: start > 0 && end('B') <= 0.1 * start && originalDeath != null,
      recovery: start > 0 && end('C') / start >= 0.85, jitter: start > 0 && end('D') / start >= 0.8,
      alternatingNotSustainedStrengthening: end('E') <= start && slopes.full <= 0 && slopes.last10 <= 0 };
    summary.adaptation = { checks, pass: Object.values(checks).every(Boolean), startW: start,
      retention: { B_over_A: end('B') / start, C30_over_A: r.C.trajectory[30] / start, C60_over_A: end('C') / start, D_over_A: end('D') / start },
      alternating: { endW: end('E'), slopes }, extinctionGenerations: generations,
      nonzeroExtinctionTrialEnds: r.B.trajectory.flatMap((W, trial) => trial && W > 0 ? [{ trial, W }] : []),
      legacyMetrics: { strictEndBBelowB30: end('B') < r.B.trajectory[30], applicable: false,
        explanation: 'Strict further decay after early deletion and removed separate-hit ratios are obsolete; no deltas.hit is fabricated.' } };
  }
  if (results['action-T1']) {
    const state = input('action-T1'), id = name => state.mapping.find(a => a.feature === name).id;
    const keys = new Set([JSON.stringify(['action:press', 6, id('light')]), JSON.stringify([id('light'), 4, id('bell')])]);
    summary.eligibilityEvidence = ['action-T1', 'action-T2'].filter(k => results[k]).flatMap(k =>
      input(k, 'audit.json').generations.filter(g => keys.has(g.ruleKey)).map(g => ({ phase: k, ...g })));
    summary.eligibilityMeaning = 'First eligible window is measured for generations born under that phase audit; preexisting generations give observation bounds, not reconstructed historical crossings.';
  }
  summary.gateScreening = [0.2, 0.3, 0.4].flatMap(gate => results[`gate-${gate}`] ? [{ gate, ...results[`gate-${gate}`] }] : []);
  summary.sameGateStartingState = summary.gateScreening.length === 3 ? new Set(summary.gateScreening.map(g => g.startingStateHash)).size === 1 : null;
  if (results['action-natural']) {
    const audit = input('action-natural', 'audit.json');
    summary.naturalTeacher = { diagnostics: results['action-natural'].naturalTeacherDiagnostics,
      comparatorScales: input('action-natural', 'comparator-scales.json'),
      survivingUnmatchedEvidence: audit.generations.filter(g => g.live && g.actualUnmatchedDeadlines > 0).map(g => ({ generation: g,
        deadlines: audit.deadlines.filter(d => d.ruleKey === g.ruleKey && d.createdAt === g.createdAt && d.unmatched) })),
      interpretation: 'Actual repeated unmatched deadlines with Meff0 are retained as unresolved contextual comparator-silence evidence. Action gating does not delete or repair prediction edges; no causal perturbation is implied.' };
  }
  if (results.rest) summary.learnedRest = results.rest;
  summary.acceptance = 'No blanket acceptance: inspect fresh criteria and generation-level failures. A three-repeat gate screen cannot select a default; omitted checks remain NOT RUN.';
  write('result.json', summary);
}

if (phase !== 'report') assert.ok(Number.isFinite(THREE_FACTOR.detectionFloor) && THREE_FACTOR.detectionFloor > 0,
  'Rebuild and freshly validate the comparator-floor runtime before neural scenes.');
if (phase === 'teachers') teachers();
else if (phase === 'storm-causal' || phase === 'storm-shuffled') stormTraining(phase.endsWith('shuffled'));
else if (phase === 'm4-causal' || phase === 'm4-shuffled') m4(phase.endsWith('shuffled'));
else if (/^storm-[A-E]$/.test(phase)) adaptation(phase.at(-1));
else if (phase.startsWith('action-')) actionTraining(phase.slice(7));
else if (phase.startsWith('gate-')) gateProbe(Number(phase.slice(5)));
else if (phase === 'rest') rest();
else report();
finish();
