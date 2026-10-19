/** Read-only recomputation of sealed evidence. Does not run or tune a network. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const output = 'out/m11h/evidence-audit';
assert.ok(!existsSync(output), 'Refusing to overwrite an evidence audit');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = {};
const read = path => {
  const bytes = readFileSync(path); inputs[path] = { bytes: bytes.length, sha256: hash(bytes) };
  return JSON.parse(bytes);
};
function sealed(dir) {
  const seal = read(`${dir}/artifact-manifest.sha256.json`);
  const bytes = readFileSync(`${dir}/artifact-manifest.json`);
  assert.equal(hash(bytes), seal.sha256); assert.equal(bytes.length, seal.bytes);
  const manifest = read(`${dir}/artifact-manifest.json`);
  for (const f of manifest.files) {
    const b = readFileSync(`${dir}/${f.path}`);
    assert.equal(b.length, f.bytes); assert.equal(hash(b), f.sha256);
  }
  return { files: manifest.files.length, sha256: seal.sha256 };
}
const noveltyRoot = 'out/m11h/novelty-calibration';
const noveltyManifest = sealed(noveltyRoot), novelty = [];
for (const seed of [7, 19, 31]) {
  const data = read(`${noveltyRoot}/seed-${seed}/heldout.json`), trials = data.trials;
  const positive100ms = trials.filter(t => t.windows.some(w => w.inReadSpan && w.N > 3 * Math.sqrt(1.5)));
  novelty.push({ seed, trials: trials.length, integrated1100msQuiet: trials.filter(t => t.quiet).length,
    trialsWithPositive100msNeffInMatchWindow: positive100ms.length,
    positiveTrials: positive100ms.map(t => ({ number: t.number, offsetMs: t.offsetMs,
      windows: t.windows.filter(w => w.inReadSpan && w.N > 3 * Math.sqrt(1.5)).map(w => ({ t: w.t, Nraw: w.Nraw, N: w.N })) })) });
}
const tested = read('out/m11h/quiet-final-review-source.json');
for (const [path, expected] of Object.entries(tested.files)) assert.equal(hash(readFileSync(path)), expected, `Tested source changed: ${path}`);
const goal = read('out/m11h/goal-equivalence/results.json');
assert.equal(goal.exactCountsEqual, true); assert.equal(goal.exactNeuralStatesEqual, true);
const oldRoot = 'out/m11g-fresh/seed-7/action-natural/source-snapshot/';
const oldDependencies = ['src/network.mjs', 'src/core/state.mjs', 'src/core/rng.mjs', 'src/neuron/lif.mjs',
  'src/synapse.mjs', 'src/stdp.mjs', 'src/readout.mjs', 'src/unroll.mjs'].map(path => {
  const old = readFileSync(oldRoot + path), current = readFileSync(path);
  assert.deepEqual(old, current);
  return { historicalPath: oldRoot + path, currentPath: path, sha256: hash(old), byteIdentical: true };
});
const sceneRoot = 'out/m11h-fresh/seed-7', scenes = [];
for (const phase of ['teachers', 'storm-causal', 'storm-shuffled', 'm4-causal', 'm4-shuffled', 'omission', 'rest', 'report']) {
  const dir = `${sceneRoot}/${phase}`, manifest = sealed(dir), complete = read(`${dir}/complete.json`);
  assert.equal(complete.valid, true); assert.deepEqual(complete.sourceChangedDuringPhase, []);
  const result = read(`${dir}/result.json`), entry = { phase, manifest, wallSeconds: complete.wallSeconds };
  if (existsSync(`${dir}/audit.json`)) {
    const audit = read(`${dir}/audit.json`);
    const matches = new Set(audit.predictions.filter(p => p.firstMatchedAt !== null).map(p => JSON.stringify([p.firstMatchedAt, p.B])));
    const births = audit.generations.filter(g => !g.presentAtStart);
    const liveMisses = audit.predictions.filter(p => p.unmatched && p.generationLiveAtDeadline);
    entry.births = births.length;
    entry.birthsWhileSameTargetHadAFirstMatchedPrediction = births.filter(g => matches.has(JSON.stringify([g.observedFrom, g.B]))).length;
    entry.generationsDeleted = audit.generations.filter(g => g.deletedAt !== null).length;
    entry.deletedGenerationsAtExactZero = audit.generations.filter(g => g.deletedAt !== null && g.lastMeasuredW === 0).length;
    entry.liveUnmatchedDeadlines = liveMisses.length;
    entry.liveUnmatchedDeadlinesWithNegativeMissLedger = liveMisses.filter(p => p.generationLedgerDeltaAtDeadline?.miss < 0).length;
    entry.survivingGenerations = audit.generations.filter(g => g.live).length;
    entry.survivingGenerationsWithUnmatchedHistory = audit.generations.filter(g => g.live && g.unmatchedDeadlines > 0);
    entry.originalGeneration = result.originalGeneration ?? null;
  }
  scenes.push(entry);
}
const report = { timestamp: new Date().toISOString(), kind: 'Read-only evidence audit; no new neural runs',
  noveltyManifest, novelty, testedSourceFilesUnchanged: Object.keys(tested.files).length,
  goalEquivalence: { windows: goal.countWindows, neuralCheckpoints: goal.neuralStateCheckpoints, oldDependencies }, scenes,
  limitations: ['Integrated 1100 ms quiet is not the same as a closed 100 ms creation gate.',
    'A positive 100 ms N result alone is not a new connection: source activity and absence of that edge are also required.',
    'Births while another prediction of the same target was matched are measured co-occurrences, not automatically false connections.',
    'Surviving generations with unmatched history can also have matched hits; this list alone does not prove an extinction violation.'],
  inputs, runnerSHA256: hash(readFileSync('experiments/m11h-evidence-audit.mjs')) };
mkdirSync(output); writeFileSync(`${output}/result.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ novelty: novelty.map(({ positiveTrials, ...row }) => row), scenes,
  testedSourceFilesUnchanged: report.testedSourceFilesUnchanged }, null, 2));
