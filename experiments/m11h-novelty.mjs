/** Fresh, bounded N-only direct-afferent evidence; not a neural-world pass.
 * No legacy comparator helpers, M floor, target-W fitting or training extension.
 * Run: node experiments/m11h-novelty.mjs
 * Refuses an existing output directory. Importing this file does not run trials.
 */
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT = resolve(ROOT, 'out/m11h/novelty-calibration');
const SCHEMA = 'm11h-novelty-calibration-v1';
const CONFIG = Object.freeze({ seeds: [7, 19, 31], id: 'target', slotMs: 3000,
  arrivalMs: 600, onsetStrength: 1, predictionStrength: 1,
  trainingTrials: 100, trainingEta: 0.2, trainingSchedule: '0.2 / sqrt(one-based training trial)',
  heldoutTrials: 110, heldoutRepeatsPerOffset: 10, quietFractionRequired: 0.9,
  offsetsMs: Array.from({ length: 11 }, (_, i) => i * 100 - 500),
  unexpectedFrozenTrials: 10, restFrozenMs: 30000, maximumWallSeconds: 60,
  Ncriteria: 'Neff = max(0, sum(Nraw - targetHz*cells*0.1) over 11 inclusive windows - 3*sqrt(restCount(1100))); quiet iff Neff=0',
  acceptance: 'Each seed: training quiet>=90/100, held-out quiet>=99/110, all held-out weights unchanged, source closure unchanged.',
  limitations: ['Isolated actual spiking N circuit, not whole-world or sensory/P7 acceptance.',
    'Training is in-sample; only the 110 subsequent frozen trials are held-out.',
    'Held-out trials are fresh continuation, not independent reset replications.',
    'Per-offset quiet fractions are reported; the unchanged 90% criterion is pooled within each seed.',
    'Unexpected/rest probes are diagnostics and do not tune constants or extend training.'] });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const variance = xs => { const m = mean(xs); return mean(xs.map(x => (x - m) ** 2)); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const clone = value => structuredClone(value);

/** Exact local import closure, including literal dynamic imports below. */
function sourceSnapshot(entry = 'experiments/m11h-novelty.mjs') {
  const sources = new Map();
  function collect(file) {
    if (sources.has(file)) return;
    const bytes = readFileSync(resolve(ROOT, file)), text = bytes.toString('utf8');
    sources.set(file, { bytes: bytes.length, sha256: hash(bytes), text });
    for (const match of text.matchAll(/\b(?:from|import)\s*(?:\(\s*)?['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) collect(relative(ROOT, resolve(ROOT, dirname(file), match[1])));
    }
  }
  collect(entry);
  return Object.fromEntries([...sources].sort(([a], [b]) => a.localeCompare(b)));
}
const sourceHashes = sources => Object.fromEntries(Object.entries(sources).map(([p, source]) => [p, source.sha256]));
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]);

export async function runBatch() {
  assert.ok(!existsSync(OUTPUT), `Refusing to overwrite ${relative(ROOT, OUTPUT)}; preserve the existing batch.`);
  const wallStart = performance.now(), startedAt = new Date().toISOString(), sources = sourceSnapshot();
  mkdirSync(OUTPUT, { recursive: true });
  const write = (file, data) => {
    const destination = resolve(OUTPUT, file); mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, json(data));
  };
  const log = data => { const line = JSON.stringify(data); console.log(line); appendFileSync(resolve(OUTPUT, 'run.log'), `${line}\n`); };
  const elapsed = () => (performance.now() - wallStart) / 1000;
  const guard = () => assert.ok(elapsed() < CONFIG.maximumWallSeconds, `Bounded batch exceeded ${CONFIG.maximumWallSeconds} s; no training extension permitted`);
  const preRun = { schema: SCHEMA, startedAt, node: process.version, platform: process.platform,
    architecture: process.arch, command: ['node', 'experiments/m11h-novelty.mjs'], config: CONFIG,
    sourceHashes: sourceHashes(sources), sources,
    provenance: 'Exact import-closure source text/hashes captured before runtime import and before any neural simulation. Fresh constructors, no earlier numeric artifacts or checkpoints read.' };
  write('pre-run-manifest.json', preRun);
  for (const [file, data] of Object.entries(sources)) {
    const dest = resolve(OUTPUT, 'sources', file); mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data.text);
    assert.equal(hash(readFileSync(dest)), data.sha256);
  }
  const preRunSHA256 = hash(readFileSync(resolve(OUTPUT, 'pre-run-manifest.json')));
  log({ stage: 'pre-run-manifest-saved', startedAt, preRunSHA256, sourceFiles: Object.keys(sources).length, seeds: CONFIG.seeds });
  write('complete.json', { schema: SCHEMA, complete: false, valid: false, startedAt, preRunSHA256, config: CONFIG });

  const runs = [];
  let failure = null, actualSimulationMs = 0, actualWindows = 0;
  try {
    // Deferred until exact executable bytes have been durably archived above.
    const { SpikingNovelty, NOVELTY, effectiveNovelty, restCount } = await import('../src/novelty.mjs');
    const { WINDOW_MS } = await import('../src/readout.mjs');
    assert.equal(WINDOW_MS, 100); assert.equal(NOVELTY.toleranceMs, 500); assert.equal(NOVELTY.eta, 0.2);
    write('parameters.json', { NOVELTY, WINDOW_MS, config: CONFIG,
      readSpanMs: 1100, expectedNRestCount: restCount(1100), Ndeadband: 3 * Math.sqrt(restCount(1100)) });
    const scales = e => ({ N: [...e.rows[0].Ninh.scale], allGroups: e.net.groups.map(g => [...g.scale]) });
    const position = e => ({ t: e.t, netT: e.net.t, rng: e.net.rng.exportState(), scales: scales(e) });
    const summarize = trials => ({ trials: trials.length, quiet: trials.filter(t => t.quiet).length,
      quietFraction: trials.filter(t => t.quiet).length / trials.length,
      N: { mean: mean(trials.map(t => t.N)), min: Math.min(...trials.map(t => t.N)), max: Math.max(...trials.map(t => t.N)) },
      Neff: { mean: mean(trials.map(t => t.Neff)), min: Math.min(...trials.map(t => t.Neff)), max: Math.max(...trials.map(t => t.Neff)) },
      perOffset: CONFIG.offsetsMs.map(offsetMs => { const rows = trials.filter(t => t.offsetMs === offsetMs); return {
        offsetMs, trials: rows.length, quiet: rows.filter(t => t.quiet).length,
        quietFraction: rows.length ? rows.filter(t => t.quiet).length / rows.length : null,
        meanN: rows.length ? mean(rows.map(t => t.N)) : null, meanNeff: rows.length ? mean(rows.map(t => t.Neff)) : null }; }) });

    function trial(e, stage, number, offsetMs, learn, predict = true) {
      guard();
      const start = e.t === null ? 0 : e.t + WINDOW_MS, tArrive = start + CONFIG.arrivalMs;
      const before = position(e), windows = [];
      const prediction = { B: CONFIG.id, tArrive, strength: CONFIG.predictionStrength };
      for (let offset = 0; offset < CONFIG.slotMs; offset += WINDOW_MS) {
        const now = [offset === CONFIG.arrivalMs + offsetMs ? CONFIG.onsetStrength : 0];
        const created = offset === 0 && predict ? [prediction] : [];
        const counts = e.step(start + offset, now, created, { learn });
        actualSimulationMs += WINDOW_MS; actualWindows++;
        assert.equal(counts.length, 1); assert.equal(counts[0].N, counts[0].Nraw - restCount(WINDOW_MS));
        assert.equal(Object.hasOwn(counts[0], 'M'), false);
        windows.push({ ...counts[0], learn, eta: e.rows[0].Ninh.istdp.eta,
          inReadSpan: offset >= 100 && offset <= 1100,
          pending: clone(e.pending), NcellCounts: e.rows[0].N.map(cell => e.net.spikes[cell].length) });
      }
      const read = windows.filter(w => w.inReadSpan), N = read.reduce((sum, w) => sum + w.N, 0);
      assert.equal(read.length, 11);
      const Neff = effectiveNovelty(N, 1100), after = position(e);
      const weightsUnchanged = JSON.stringify(before.scales) === JSON.stringify(after.scales);
      if (!learn) assert.equal(weightsUnchanged, true, `Frozen ${stage} weights changed`);
      return { stage, number, offsetMs, start, endExclusive: start + CONFIG.slotMs, tArrive,
        onsetAt: start + CONFIG.arrivalMs + offsetMs, predict, learn, eta: e.rows[0].Ninh.istdp.eta,
        Nraw: read.reduce((sum, w) => sum + w.Nraw, 0), N, Neff, quiet: Neff === 0,
        NscalesBefore: before.scales.N, NscalesAfter: after.scales.N, weightsUnchanged,
        rngBefore: before.rng, rngAfter: after.rng, windows };
    }

    for (const seed of CONFIG.seeds) {
      guard();
      const seedStart = performance.now(), e = new SpikingNovelty([CONFIG.id], seed);
      const dir = `seed-${seed}`, initial = position(e), run = { seed, complete: false, valid: false };
      runs.push(run);
      write(`${dir}/initial-state.json`, e.saveState());
      const training = [];
      for (let i = 0; i < CONFIG.trainingTrials; i++) {
        e.rows[0].Ninh.istdp.eta = CONFIG.trainingEta / Math.sqrt(i + 1);
        training.push(trial(e, 'training', i + 1, CONFIG.offsetsMs[i % CONFIG.offsetsMs.length], true));
      }
      const trainingEnd = position(e);
      write(`${dir}/training.json`, { seed, label: 'in-sample training; not held-out', trials: training });
      write(`${dir}/training-end-state.json`, e.saveState());
      run.training = summarize(training);
      run.training.pass = run.training.quiet >= CONFIG.trainingTrials * CONFIG.quietFractionRequired;
      run.initialNMean = mean(initial.scales.N); run.trainedNMean = mean(trainingEnd.scales.N);
      write(`${dir}/summary.json`, run);
      log({ stage: 'training-complete', seed, quiet: run.training.quiet, trials: training.length,
        pass: run.training.pass, initialNMean: run.initialNMean, trainedNMean: run.trainedNMean });
      assert.equal(run.training.pass, true, `Seed ${seed}: unchanged training threshold failed; stop without extending or retuning`);

      const heldoutStart = position(e), heldout = [];
      assert.deepEqual(heldoutStart, trainingEnd, 'No reset/reseed/state replacement between training and held-out');
      for (let i = 0; i < CONFIG.heldoutTrials; i++) {
        heldout.push(trial(e, 'frozen-held-out', i + 1, CONFIG.offsetsMs[i % CONFIG.offsetsMs.length], false));
      }
      const heldoutEnd = position(e);
      assert.deepEqual(heldoutEnd.scales, trainingEnd.scales);
      write(`${dir}/heldout.json`, { seed, label: 'fresh held-out frozen continuation; 10 trials per offset',
        resetBetweenPhases: false, initial: heldoutStart, final: heldoutEnd, trials: heldout });
      write(`${dir}/heldout-end-state.json`, e.saveState());
      run.heldout = summarize(heldout);
      run.heldout.weightsFrozen = true; run.heldout.continuationExact = true;
      run.heldout.pass = run.heldout.quiet >= CONFIG.heldoutTrials * CONFIG.quietFractionRequired;
      assert.ok(run.heldout.perOffset.every(row => row.trials === CONFIG.heldoutRepeatsPerOffset));
      write(`${dir}/summary.json`, run);
      log({ stage: 'held-out-complete', seed, quiet: run.heldout.quiet, trials: heldout.length,
        pass: run.heldout.pass, perOffset: run.heldout.perOffset, weightsFrozen: true, continuationExact: true });
      assert.equal(run.heldout.pass, true, `Seed ${seed}: unchanged held-out threshold failed; stop without retraining or retuning`);

      const unexpected = Array.from({ length: CONFIG.unexpectedFrozenTrials }, (_, i) => trial(e, 'frozen-unexpected', i + 1, 0, false, false));
      write(`${dir}/unexpected.json`, { seed, diagnosticOnly: true, trials: unexpected });
      run.unexpected = { trials: unexpected.length, meanNeff: mean(unexpected.map(t => t.Neff)),
        minNeff: Math.min(...unexpected.map(t => t.Neff)), allNeffAtLeast10: unexpected.every(t => t.Neff >= 10) };

      const restBefore = position(e), restStart = e.net.t, rest = [], bins = new Uint32Array(CONFIG.restFrozenMs / 10);
      const cells = e.rows[0].N.map(cell => ({ cell, count: 0, bursts: 0, last: [] }));
      for (let offset = 0; offset < CONFIG.restFrozenMs; offset += WINDOW_MS) {
        guard();
        const [r] = e.step(e.t + WINDOW_MS, [0], [], { learn: false });
        actualSimulationMs += WINDOW_MS; actualWindows++;
        rest.push({ ...r, learn: false, NcellCounts: cells.map(c => e.net.spikes[c.cell].length) });
        for (const cell of cells) for (const at of e.net.spikes[cell.cell]) {
          cell.count++;
          if (cell.last.length === 2 && at - cell.last[0] <= 20 + 1e-7) cell.bursts++;
          cell.last.push(at); if (cell.last.length > 2) cell.last.shift();
          bins[Math.floor((at - restStart - 1e-7) / 10)]++;
        }
      }
      assert.deepEqual(scales(e), trainingEnd.scales);
      const restEnd = position(e);
      run.rest = { durationMs: CONFIG.restFrozenMs,
        meanHz: mean(cells.map(c => c.count / (CONFIG.restFrozenMs / 1000))),
        bursts: cells.reduce((sum, c) => sum + c.bursts, 0), fano10ms: variance([...bins]) / mean([...bins]), weightsFrozen: true };
      write(`${dir}/rest.json`, { seed, diagnosticOnly: true, initial: restBefore, final: restEnd,
        summary: run.rest, cells, bins10ms: [...bins], windows: rest });
      write(`${dir}/final-state.json`, e.saveState());
      Object.assign(run, { complete: true, valid: true, initial, trainingEnd, heldoutStart, heldoutEnd, final: position(e),
        simulatedMs: e.net.t, windows: e.net.t / WINDOW_MS, wallSeconds: (performance.now() - seedStart) / 1000 });
      write(`${dir}/summary.json`, run);
      log({ stage: 'seed-complete', seed, trainingQuiet: run.training.quiet, heldoutQuiet: run.heldout.quiet,
        unexpected: run.unexpected, rest: run.rest, simulatedMs: run.simulatedMs, wallSeconds: run.wallSeconds });
    }
  } catch (error) {
    failure = { name: error.name, message: error.message, stack: error.stack };
    log({ stage: 'stopped-on-failure', failure });
  }

  let afterSources = {}, sourceCheckFailure = null;
  try { afterSources = sourceSnapshot(); }
  catch (error) { sourceCheckFailure = error.message; }
  const beforeHashes = sourceHashes(sources), afterHashes = sourceHashes(afterSources);
  const changedSources = [...new Set([...Object.keys(beforeHashes), ...Object.keys(afterHashes)])]
    .filter(file => beforeHashes[file] !== afterHashes[file]);
  write('post-run-source-check.json', { checkedAt: new Date().toISOString(), beforeHashes, afterHashes,
    changedSources, sourceCheckFailure, unchanged: changedSources.length === 0 && sourceCheckFailure === null });
  const valid = failure === null && runs.length === CONFIG.seeds.length && runs.every(r => r.valid) && changedSources.length === 0 && sourceCheckFailure === null;
  const result = { schema: SCHEMA, complete: failure === null && runs.length === CONFIG.seeds.length && runs.every(r => r.complete),
    valid, startedAt, finishedAt: new Date().toISOString(), wallSeconds: elapsed(),
    simulatedMs: actualSimulationMs, rawWindowCount: actualWindows, seeds: CONFIG.seeds, config: CONFIG,
    preRunManifest: 'pre-run-manifest.json', preRunSHA256, sourceHashes: beforeHashes, changedSources, sourceCheckFailure, failure,
    runs: runs.map(({ initial, trainingEnd, heldoutStart, heldoutEnd, final, ...run }) => run) };
  write('complete.json', result);
  log({ stage: 'batch-complete', valid, complete: result.complete, wallSeconds: result.wallSeconds,
    simulatedMs: actualSimulationMs, rawWindowCount: actualWindows, changedSources,
    seeds: runs.map(r => ({ seed: r.seed, trainingQuiet: r.training?.quiet, heldoutQuiet: r.heldout?.quiet, valid: r.valid })) });
  const artifacts = walk(OUTPUT).sort().map(file => { const bytes = readFileSync(file); return {
    path: relative(OUTPUT, file), bytes: bytes.length, sha256: hash(bytes) }; });
  write('artifact-manifest.json', { schema: 'm11h-novelty-artifacts-v1', createdAt: new Date().toISOString(), valid, files: artifacts });
  const manifestBytes = readFileSync(resolve(OUTPUT, 'artifact-manifest.json'));
  write('artifact-manifest.sha256.json', { schema: 'm11h-novelty-artifact-seal-v1',
    path: 'artifact-manifest.json', bytes: manifestBytes.length, sha256: hash(manifestBytes) });
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, 'This bounded batch accepts no retuning or output override arguments.');
  process.exitCode = (await runBatch()).valid ? 0 : 1;
}
