/** Fresh actual-SpikingErrors calibration in an isolated direct-onset fixture.
 * NOT a gate5 neural-world pass: no sensory network, layer 2, or P7 onset noise.
 * No historical artifacts, synthetic error outcomes, or strength fitting.
 * Run only after reviewing this code: node experiments/m11g-comparator.mjs
 * Optional: --seeds=7,19,31. Imports never train or start an experiment.
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { SpikingErrors, ERRORS, restCount } from '../src/errors.mjs';
import { WINDOW_MS } from '../src/readout.mjs';
import { makeRng } from '../src/core/rng.mjs';
import { PROTOCOL, MATCHED_OFFSETS, calibrationRate, calibrationConverged } from './m5-probe.mjs';
import { predictionCounts, mean, variance, calibrationSummary, matchedSummary } from './m5-statistics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CALIBRATION_PATH = resolve(ROOT, 'out/m11g/calibration.json');
export const FIXTURE = Object.freeze({
  label: 'isolated actual-comparator fixture, not a full gate5 neural-world pass',
  id: 'target', slotMs: 3000, arrivalMs: 600, onsetStrength: 1, predictionStrength: 1,
  matchedRepeatsPerOffset: 20, omissionsPerStrength: 200,
  strengths: Object.freeze([0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.1]),
  bootstrapReplicates: 2000, bootstrapSeed: 1107007,
});
const SCHEMA = 'm11g-isolated-comparator-v2';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJSON = (path, object) => writeFileSync(path, JSON.stringify(object, null, 2));
const weights = e => ({ id: e.rows.at(-1).id,
  N: [...e.rows.at(-1).Ninh.scale], M: [...e.rows.at(-1).Minh.scale] });
const fingerprint = e => JSON.stringify(e.net.groups.map(g => [...g.scale]));
const nextTime = e => e.t === null ? 0 : e.t + WINDOW_MS;

/** Exact import closure, not merely hashes: saved before any neural trial.
 * The imported historical probe supplies only its unchanged rate schedule and
 * convergence predicate. No old gate5 result or teacher checkpoint is opened.
 */
function sourceSnapshot(entryFiles) {
  const sources = {};
  function collect(file) {
    if (Object.hasOwn(sources, file)) return;
    const bytes = readFileSync(resolve(ROOT, file)), text = bytes.toString('utf8');
    sources[file] = { sha256: sha256(bytes), text };
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) collect(relative(ROOT, resolve(ROOT, dirname(file), match[1])));
    }
  }
  for (const file of entryFiles) collect(file);
  return Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)));
}

function meanUncertainty(xs) {
  const average = mean(xs), sd = Math.sqrt(variance(xs));
  const sem = xs.length > 1 ? sd / Math.sqrt(xs.length - 1) : 0;
  return { n: xs.length, mean: average, populationSD: sd, sem,
    normal95CI: [average - 1.96 * sem, average + 1.96 * sem] };
}

function fraction(xs) {
  const n = xs.length, successes = xs.filter(Boolean).length, p = successes / n, z = 1.96;
  const denominator = 1 + z * z / n, center = (p + z * z / (2 * n)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return { successes, trials: n, fraction: p, wilson95CI: [center - half, center + half] };
}

/** Prescribed onsets drive actual R afferents, not substitute error flags.
 * All 30 raw population-count windows are retained. N is read across the full
 * inclusive tolerance span and M only at the actual deadline, via the existing
 * predictionCounts implementation.
 */
function trial(e, { offsetMs = null, strength = FIXTURE.predictionStrength, learn = false } = {}) {
  const start = nextTime(e), tArrive = start + FIXTURE.arrivalMs;
  const prediction = { B: e.ids.at(-1), tArrive, strength }, windows = [];
  for (let dt = 0; dt < FIXTURE.slotMs; dt += WINDOW_MS) {
    const now = e.ids.map(() => 0);
    if (offsetMs !== null && dt === FIXTURE.arrivalMs + offsetMs) now[now.length - 1] = FIXTURE.onsetStrength;
    windows.push(e.step(start + dt, now, dt === 0 ? [prediction] : [], { learn }).at(-1));
  }
  return { start, offsetMs, strength, counts: predictionCounts(windows, [prediction])[0], windows };
}

function crossing(rows, deadband) {
  const hi = rows.findIndex(r => r.M >= deadband);
  if (hi < 0) return { floor: null, bracket: null, status: 'no sampled mean crossing' };
  if (hi === 0) return { floor: rows[0].strength, bracket: [rows[0].strength, rows[0].strength],
    status: 'zero-strength mean already crosses deadband' };
  const a = rows[hi - 1], b = rows[hi];
  return { floor: a.strength + (deadband - a.M) * (b.strength - a.strength) / (b.M - a.M),
    bracket: [a.strength, b.strength], bracketMeans: [a.M, b.M],
    status: 'interpolated first sampled mean crossing' };
}

function floorUncertainty(rows, seed = FIXTURE.bootstrapSeed) {
  const rng = makeRng(seed), sampledFloors = [], deadband = 3 * Math.sqrt(restCount(WINDOW_MS));
  let missingCrossings = 0;
  for (let b = 0; b < FIXTURE.bootstrapReplicates; b++) {
    const boot = rows.map(row => {
      let sum = 0;
      for (let i = 0; i < row.deviations.length; i++) sum += row.deviations[Math.floor(rng.uniform() * row.deviations.length)];
      return { strength: row.strength, M: sum / row.deviations.length };
    });
    const result = crossing(boot, deadband);
    if (result.floor === null) missingCrossings++;
    else sampledFloors.push(result.floor);
  }
  sampledFloors.sort((a, b) => a - b);
  const percentile = p => sampledFloors.length ? sampledFloors[Math.floor((sampledFloors.length - 1) * p)] : null;
  return { method: 'within-strength independent nonparametric trial bootstrap, conditional on frozen scales and recorded seed; not calibration uncertainty',
    seed, replicates: FIXTURE.bootstrapReplicates, missingCrossings,
    percentile95CI: [percentile(0.025), percentile(0.975)] };
}

function rowSummary(strength, samples) {
  const deviations = samples.map(s => s.counts.M), effective = samples.map(s => s.counts.Meff);
  const detection = fraction(effective.map(x => x > 0));
  return { strength, trials: samples.length, M: mean(deviations),
    Mraw: mean(samples.map(s => s.counts.Mraw)), Meff: mean(effective),
    meanDeviationUncertainty: meanUncertainty(deviations), meanEffectiveUncertainty: meanUncertainty(effective),
    positiveFraction: detection.fraction, detection, deviations, effective, samples };
}

function runSeed(seed, log) {
  const e = new SpikingErrors([FIXTURE.id], seed), initialWeights = weights(e), history = [];
  for (let i = 0; i < PROTOCOL.maxCalibrationTrials && !calibrationConverged(history); i++) {
    const eta = calibrationRate(e, i + 1), offsetMs = MATCHED_OFFSETS[i % MATCHED_OFFSETS.length];
    const result = trial(e, { offsetMs, learn: true });
    const matched = result.windows.some(w => w.reality === 1 && Math.abs(w.t - result.counts.tArrive) <= ERRORS.toleranceMs);
    history.push({ trial: i + 1, eta, delay: FIXTURE.arrivalMs + offsetMs, offsetMs,
      matched, qualified: matched && result.counts.nearRest, counts: [result.counts],
      weights: [weights(e)], samples: result.windows });
    if ((i + 1) % 10 === 0) log({ stage: 'calibration', seed, trial: i + 1,
      qualifiedLast100: history.slice(-PROTOCOL.matchedTrials).filter(t => t.qualified).length });
  }
  const finalWeights = weights(e), calibration = { converged: calibrationConverged(history),
    summary: calibrationSummary(history), initialWeights, finalWeights,
    NChanged: JSON.stringify(initialWeights.N) !== JSON.stringify(finalWeights.N),
    MChanged: JSON.stringify(initialWeights.M) !== JSON.stringify(finalWeights.M),
    actualISTDP: true, inhibitoryEtaSchedule: 'ERRORS.eta / sqrt(trial), existing calibrationRate',
    MExplanation: 'Fully matching onsets shunt deadline drive to zero; actual runDrives freezes Minh. Unchanged M scales are expected and are not claimed to have learned.',
    history };
  const frozenStart = fingerprint(e), matchingSamples = [];
  for (let i = 0; i < MATCHED_OFFSETS.length * FIXTURE.matchedRepeatsPerOffset; i++) {
    matchingSamples.push(trial(e, { offsetMs: MATCHED_OFFSETS[i % MATCHED_OFFSETS.length] }));
  }
  const matching = { heldOut: true,
    note: 'New RNG draws continue the trained network state, with learning frozen; calibration samples are not reused.',
    summary: matchedSummary(matchingSamples.map(s => s.counts)),
    silence: fraction(matchingSamples.map(s => s.counts.nearRest)),
    pass: matchingSamples.filter(s => s.counts.nearRest).length / matchingSamples.length >= PROTOCOL.matchedFraction,
    rows: MATCHED_OFFSETS.map(offsetMs => {
      const samples = matchingSamples.filter(s => s.offsetMs === offsetMs);
      return { offsetMs, ...matchedSummary(samples.map(s => s.counts)),
        silence: fraction(samples.map(s => s.counts.nearRest)), samples };
    }) };
  log({ stage: 'held-out-matching', seed, calibrationConverged: calibration.converged,
    trials: history.length, MChanged: calibration.MChanged,
    frozenQuietFraction: matching.silence.fraction, pass: matching.pass });

  // Explicit, separately declared initialization for floor measurement, as in
  // the earlier isolated floor protocol. No reset within or between strengths.
  const probe = new SpikingErrors([FIXTURE.id], seed);
  probe.rows.at(-1).Ninh.scale.set(finalWeights.N);
  probe.rows.at(-1).Minh.scale.set(finalWeights.M);
  const probeWeights = fingerprint(probe), rows = [];
  for (const strength of FIXTURE.strengths) {
    const samples = Array.from({ length: FIXTURE.omissionsPerStrength }, () => trial(probe, { strength }));
    const row = rowSummary(strength, samples); rows.push(row);
    log({ stage: 'omission', seed, strength, M: row.M, positiveFraction: row.positiveFraction });
  }
  const deadband = 3 * Math.sqrt(restCount(WINDOW_MS));
  const floor = { deadband,
    method: 'First mean deadline-M-deviation crossing of analytic 3 sigma rest, interpolated between adjacent sampled strengths; no strength fitting.',
    ...crossing(rows, deadband), uncertainty: floorUncertainty(rows, FIXTURE.bootstrapSeed + seed), rows };
  const result = { seed, calibration, matching, floor,
    weightsFrozenDuringMatching: frozenStart === fingerprint(e),
    weightsFrozenDuringOmissions: probeWeights === fingerprint(probe),
    omissionInitialization: 'New SpikingErrors at this seed, with final fresh inhibitory scales copied to its target; continuous 3 s slots and no reset across 2000 omissions.',
    zeroDriveControl: { strength: 0, M: rows[0].M, detection: rows[0].detection,
      uncertainty: rows[0].meanDeviationUncertainty },
    interpretation: 'Mean-crossing estimate, not a hard single-trial boundary: sub-floor misses may detect and above-floor misses may remain silent.' };
  log({ stage: 'seed-result', seed, converged: calibration.converged,
    calibrationTrials: history.length, matchedFrozenPass: matching.pass,
    floor: floor.floor, bracket: floor.bracket, bootstrap95CI: floor.uncertainty.percentile95CI });
  return result;
}

/** Strict artifact load, with no fallback to historical results or training. */
export function readCalibration(path = CALIBRATION_PATH) {
  const a = JSON.parse(readFileSync(path, 'utf8'));
  if (a.schema !== SCHEMA || !a.complete || !Array.isArray(a.runs) || !a.runs.length) {
    throw new Error('Fresh comparator artifact is missing or incomplete; explicitly run experiments/m11g-comparator.mjs first');
  }
  if (JSON.stringify(a.parameters.ERRORS) !== JSON.stringify(ERRORS)) throw new Error('Comparator constants differ from the measured artifact');
  for (const [file, expected] of Object.entries(a.comparatorSourceHashes)) {
    if (sha256(readFileSync(resolve(ROOT, file))) !== expected) throw new Error(`Comparator measurement is stale for ${file}; regenerate explicitly`);
  }
  return a;
}

/** Copy freshly measured inhibition to the last target row of a new network.
 * Seed selects a measured calibration and the network RNG. No training, neural
 * warm-up, floor installation, or other runtime adaptation is hidden here.
 */
export function calibratedComparator(ids = ['a', 'b'], seed = 7) {
  const artifact = readCalibration(), run = artifact.runs.find(r => r.seed === seed);
  if (!artifact.calibrationPass || !run?.calibration.converged || !run.matching.pass) {
    throw new Error(`No passing fresh calibration and held-out matching for seed ${seed}`);
  }
  const e = new SpikingErrors(ids, seed), target = e.rows.at(-1), scale = run.calibration.finalWeights;
  if (!target || target.Ninh.scale.length !== scale.N.length || target.Minh.scale.length !== scale.M.length) {
    throw new Error('Comparator target shape differs from calibration');
  }
  target.Ninh.scale.set(scale.N); target.Minh.scale.set(scale.M);
  return e;
}

export function measuredDetectionFloor() {
  const a = readCalibration();
  if (!a.calibrationPass || !Number.isFinite(a.pooled.floor)) throw new Error('No validated fresh pooled detection floor');
  return a.pooled.floor;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = process.argv.slice(2);
  if (options.length > 1 || options.some(a => !/^--seeds=\d+(,\d+)*$/.test(a))) {
    throw new Error('Usage: node experiments/m11g-comparator.mjs [--seeds=7,19,31]');
  }
  const seeds = options[0]?.slice(8).split(',').map(Number) ?? [7, 19, 31];
  if (new Set(seeds).size !== seeds.length || seeds.some(s => !Number.isSafeInteger(s) || s > 0xffffffff)) {
    throw new Error('Seeds must be unique unsigned 32-bit integers');
  }
  mkdirSync(dirname(CALIBRATION_PATH), { recursive: true });
  const logPath = resolve(ROOT, 'out/m11g/calibration.log');
  writeFileSync(logPath, '');
  const log = row => { const line = JSON.stringify(row); console.log(line); appendFileSync(logPath, `${line}\n`); };
  const startedAt = new Date().toISOString(), startMs = performance.now();
  const parameters = { ERRORS, WINDOW_MS, fixture: FIXTURE, calibration: {
    matchedTrials: PROTOCOL.matchedTrials, matchedFraction: PROTOCOL.matchedFraction,
    maxCalibrationTrials: PROTOCOL.maxCalibrationTrials, offsets: MATCHED_OFFSETS,
    protocolDifference: 'Direct onset fixture uses 3 s slots, not the full neural-world probe 25 s slots; same actual comparator, eta/sqrt(trial), 11 inclusive offsets and last-100 joint-silence predicate.' } };
  const sources = sourceSnapshot(['experiments/m11g-comparator.mjs']);
  const comparatorSources = sourceSnapshot(['src/errors.mjs']);
  const sourceHashes = Object.fromEntries(Object.entries(sources).map(([file, data]) => [file, data.sha256]));
  const comparatorSourceHashes = Object.fromEntries(Object.entries(comparatorSources).map(([file, data]) => [file, data.sha256]));
  const contextFiles = Object.fromEntries(['ARCHITECTURE.md', 'docs/multilayer-architecture-narrative.md', 'docs/m11f-pilot.md']
    .map(file => { const text = readFileSync(resolve(ROOT, file), 'utf8'); return [file, { sha256: sha256(text), text }]; }));
  const manifestPath = resolve(ROOT, 'out/m11g/calibration-manifest.json');
  const manifest = { schema: SCHEMA, scope: FIXTURE.label, startedAt, node: process.version,
    platform: process.platform, architecture: process.arch, command: ['node', 'experiments/m11g-comparator.mjs', ...options],
    seeds, parameters, sourceHashes, comparatorSourceHashes, sources, contextFiles,
    provenance: 'Saved before any neural trial. Fresh construction only. Earlier results are not used as evidence or input.' };
  writeJSON(manifestPath, manifest);
  const manifestSHA256 = sha256(readFileSync(manifestPath));
  const shared = { schema: SCHEMA, scope: FIXTURE.label, parameters, seeds, sourceHashes,
    comparatorSourceHashes, startedAt, manifest: 'out/m11g/calibration-manifest.json', manifestSHA256 };
  // Invalidate an older result immediately so helpers cannot mistake it for
  // this in-progress run, even if execution is interrupted between seeds.
  writeJSON(CALIBRATION_PATH, { ...shared, complete: false, runs: [] });
  log({ stage: 'pre-run-manifest-saved', manifest: shared.manifest, manifestSHA256, seeds,
    exactExecutableSourceFiles: Object.keys(sources).length });

  const runs = [];
  for (const seed of seeds) {
    const run = runSeed(seed, log); runs.push(run);
    writeJSON(resolve(ROOT, `out/m11g/calibration-${seed}.json`), { ...shared, complete: true, runs: [run] });
    writeJSON(CALIBRATION_PATH, { ...shared, complete: false, runs });
  }
  const rows = FIXTURE.strengths.map((strength, i) => rowSummary(strength, runs.flatMap(r => r.floor.rows[i].samples)));
  const deadband = 3 * Math.sqrt(restCount(WINDOW_MS));
  const validFloors = runs.map(r => r.floor.floor).filter(Number.isFinite);
  const pooled = { ...crossing(rows, deadband), deadband, uncertainty: floorUncertainty(rows),
    seedFloors: runs.map(r => ({ seed: r.seed, floor: r.floor.floor, bootstrap95CI: r.floor.uncertainty.percentile95CI })),
    seedFloorRange: validFloors.length ? [Math.min(...validFloors), Math.max(...validFloors)] : null,
    note: 'Equal trial counts weight seeds equally. One layer-wide measurement, not seed-specific fitted constants. Bootstrap is conditional Monte Carlo uncertainty, not population-wide calibration precision from three seeds.',
    rows: rows.map(({ samples, ...r }) => r) };
  const sourceChangedDuringRun = Object.keys(sourceHashes).filter(file => sha256(readFileSync(resolve(ROOT, file))) !== sourceHashes[file]);
  const artifact = { ...shared, sourceChangedDuringRun, finishedAt: new Date().toISOString(),
    wallSeconds: (performance.now() - startMs) / 1000, complete: true,
    calibrationPass: runs.every(r => r.calibration.converged && r.matching.pass &&
      r.weightsFrozenDuringMatching && r.weightsFrozenDuringOmissions && Number.isFinite(r.floor.floor)) &&
      Number.isFinite(pooled.floor) && sourceChangedDuringRun.length === 0,
    provenance: 'Fresh actual-SpikingErrors runs; no historical gate5 artifact or earlier numeric result read. Full executable source and configuration were saved before starting.',
    runs, pooled, limits: [
      'Not a full gate5 pass: no sensory/layer-2 networks, P7 uncertainty, full neural-world contrast, or world-level acceptance.',
      'Matching shunts all M deadline drive; N iSTDP learns, while M inhibition remains explicitly unchanged.',
      'Analytic rest reference stays targetHz*cells*duration; measured zero-drive mean never replaces it.',
      'Mean crossing is not an absolute detection boundary; raw observations and exact detection fractions are retained.',
      'Conditional bootstrap excludes full calibration/seed uncertainty and possible residual serial dependence.',
      'No runtime constants, learning balance, g(w), saturating rules, or target-strength fitting are changed.' ] };
  writeJSON(CALIBRATION_PATH, artifact);
  log({ stage: 'complete', calibrationPass: artifact.calibrationPass, seeds,
    floor: pooled.floor, bracket: pooled.bracket, bootstrap95CI: pooled.uncertainty.percentile95CI,
    seedFloorRange: pooled.seedFloorRange, sourceChangedDuringRun, wallSeconds: artifact.wallSeconds });
  if (!artifact.calibrationPass) process.exitCode = 1;
}
