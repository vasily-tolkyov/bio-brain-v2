import { saveLearning, loadLearning } from '../src/learning.mjs';
/** Reuse M8 sensory/motor states; learn a fresh rule layer with separated teachers. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chainEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { makeRng } from '../src/core/rng.mjs';
import { actionId } from '../src/io.mjs';
import { saveCheckpoint } from '../src/checkpoint.mjs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';
import { saveLayer, loadLayer, SEEDS, TRAIN_TRIALS } from './m8-cache.mjs';
import { weightProfile } from './m3-pipeline.mjs';
import { directedProfile } from './m10-diagnostics.mjs';

const COMMAND_GAP_MS = 400;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = ['src/downward.mjs', 'src/predict.mjs', 'src/learning.mjs', 'experiments/m10-cache.mjs', 'experiments/m8-pipeline.mjs',
  'src/io.mjs', 'src/output.mjs', 'src/envs/actions.mjs', 'src/layer.mjs',
  'src/unroll.mjs', 'src/readout.mjs', 'src/network.mjs', 'src/synapse.mjs',
  'src/stdp.mjs', 'src/neuron/lif.mjs', 'src/core/rng.mjs', 'src/core/state.mjs',
  'src/novelty.mjs', 'src/three-factor.mjs'];
const signature = hash(sources.map(p => readFileSync(new URL(`../${p}`, import.meta.url))).join('\n'));
const pairs = [[actionId('press'), 'light'], ['light', 'bell'], [actionId('press'), 'bell']];

export function cachedChain(seed) {
  const file = fileURLToPath(new URL(`../out/m11c-graded/m10-cache/${seed}.json`, import.meta.url));
  const p = actionPipeline(chainEnv({ seed, count: TRAIN_TRIALS, phase: 'T1' }), seed);
  const source = fileURLToPath(new URL(`../out/m11c-graded/m8-cache/${seed}-causal.json`, import.meta.url));
  const bytes = readFileSync(source), reused = JSON.parse(bytes);
  assert.equal(reused.seed, seed); assert.equal(reused.condition, 'causal');
  assert.deepEqual(reused.mapping, p.mapping);
  // These are pretrained input/output artifacts, not M8's incompatible rule layer.
  // loadState checks topology/parameters. Record the exact artifact and provenance.
  const reuse = { file: source, sha256: hash(bytes), signature: reused.signature };
  let state;
  if (existsSync(file)) {
    state = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(state.signature, signature, `Stale chain cache: ${file}`);
    assert.equal(state.reuse.sha256, reuse.sha256, 'M8 source artifact changed');
    assert.equal(state.seed, seed);
    console.log(`Loaded M10 teacher seed ${seed}: ${file}`);
  } else {
    loadLayer(p.layer1, reused.layer1); loadLayer(p.output.layer, reused.motor);
    p.output.previous = reused.previous;
    const started = performance.now(), rng = makeRng(seed), schedule = new Map();
    for (let trial = 0; trial < TRAIN_TRIALS; trial++) {
      const used = [];
      for (const action of p.env.actions) {
        let offset;
        do { offset = 100 * Math.floor(rng.uniform() * ACTION_WORLD.onsetSpanMs / 100); }
        while (used.some(t => Math.abs(t - offset) < COMMAND_GAP_MS));
        used.push(offset); schedule.set(trial * ACTION_WORLD.slotMs + offset, action);
      }
    }
    const baseline = p.layer2.replicas.map(r => Array.from(r.EE.stdp.rho));
    const initial = pairs.map(([a, b]) => weightProfile(p, a, b).rho);
    const profiles = () => pairs.map(([a, b], i) => {
      const { rho, edgeCounts } = weightProfile(p, a, b);
      return { A: a, B: b, edgeCounts, W: rho.map((x, k) =>
        x === null ? null : Math.max(0, x - initial[i][k])) };
    });
    const phases = [];
    for (const phase of ['T1', 'T2']) {
      if (phase === 'T2') p.env = chainEnv({ seed, count: TRAIN_TRIALS, phase });
      const start = p.t, copies = [], observations = [];
      while (p.t < start + p.env.duration) {
        const action = phase === 'T1' ? schedule.get(p.t - start) : null;
        const drive = new Float64Array(p.env.actions.length);
        if (action) drive[p.env.actions.indexOf(action)] = 1;
        const r = advanceActions(p, drive);
        assert.equal(r.executed.action, action ?? null);
        for (const e of p.unroll.entries.filter(e => e.tOnset === r.t)) {
          if (typeof e.id === 'string') copies.push({ t: r.t - start, action: e.id.slice(7) });
          else observations.push({ feature: p.mapping.find(a => a.id === e.id).feature, t: r.t - start });
        }
        if ((p.t - start) % (5 * ACTION_WORLD.slotMs) === 0) console.log(
          `  seed ${seed} ${phase}: ${(p.t - start) / ACTION_WORLD.slotMs}/${TRAIN_TRIALS}, ${((performance.now() - started) / 1000).toFixed(1)} s`);
      }
      assert.deepEqual(copies, p.env.executed.map(({ t, action }) => ({ t, action })));
      assert.equal(copies.length, phase === 'T1' ? TRAIN_TRIALS * p.env.actions.length : 0);
      if (phase === 'T1') {
        assert.ok(!p.env.events.some(e => e.g === 'bell'));
        assert.ok(!observations.some(e => e.feature === 'bell'));
      }
      phases.push({ phase, profiles: profiles(), directed: directedProfile(p, actionId('press'), 'light'),
        events: p.env.events, executed: p.env.executed,
        observations, copies, downward: structuredClone(p.downward) });
    }
    state = { learning: saveLearning(p), t: p.t, seed, signature, reuse, baseline, phases, profiles: profiles(),
      trainingSeconds: (performance.now() - started) / 1000,
      layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), motor: saveLayer(p.output.layer),
      previous: p.output.previous, mapping: p.mapping,
      learningWindows: p.learningWindows, totalN: p.totalN };
    saveCheckpoint(file, { saveState: () => state });
    console.log(`Saved M10 teacher seed ${seed}: ${JSON.stringify(state.profiles)}`);
  }
  p.baseline = state.baseline; p.t = state.t; loadLearning(p, state.learning);
  loadLayer(p.layer1, state.layer1); loadLayer(p.layer2, state.layer2);
  loadLayer(p.output.layer, state.motor); p.output.previous = state.previous;
  return { pipeline: p, baseline: state.baseline, training: { phases: state.phases,
    profiles: state.profiles, learningWindows: state.learningWindows, totalN: state.totalN },
  cache: { file, signature, sha256: hash(readFileSync(file)), reuse, trainingSeconds: state.trainingSeconds } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = process.argv[2] === undefined ? SEEDS : [Number(process.argv[2])];
  for (const seed of seeds) { assert.ok(SEEDS.includes(seed)); cachedChain(seed); }
}
