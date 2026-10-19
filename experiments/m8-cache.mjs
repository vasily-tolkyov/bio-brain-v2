import { saveLearning, loadLearning } from '../src/learning.mjs';
/** Replay the unchanged M8 causal teacher once; retain full nets and edge baseline. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { saveCheckpoint } from '../src/checkpoint.mjs';
import { makeRng } from '../src/core/rng.mjs';
import { actionsEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';

export const SEEDS = [7, 19, 31], TRAIN_TRIALS = 30;
const COMMAND_GAP_MS = 400;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = ['src/downward.mjs', 'src/predict.mjs', 'src/learning.mjs', 'experiments/m8-cache.mjs', 'experiments/m8-pipeline.mjs',
  'src/io.mjs', 'src/output.mjs', 'src/envs/actions.mjs', 'src/layer.mjs',
  'src/unroll.mjs', 'src/readout.mjs', 'src/network.mjs', 'src/synapse.mjs',
  'src/stdp.mjs', 'src/neuron/lif.mjs', 'src/core/rng.mjs', 'src/core/state.mjs',
  'src/novelty.mjs', 'src/three-factor.mjs'];
const signature = hash(sources.map(p => readFileSync(new URL(`../${p}`, import.meta.url))).join('\n'));
export const saveLayer = layer => ({ ticks: layer.ticks, attractors: structuredClone(layer.attractors),
  replicas: layer.replicas.map(r => r.net.saveState()) });
export function loadLayer(layer, state) {
  layer.ticks = state.ticks; layer.attractors = structuredClone(state.attractors);
  layer.replicas.forEach((r, i) => r.net.loadState(state.replicas[i]));
}

export function cachedActions(seed) {
  const file = fileURLToPath(new URL(`../out/m11c-graded/m8-cache/${seed}-causal.json`, import.meta.url));
  const p = actionPipeline(actionsEnv({ seed, count: TRAIN_TRIALS }), seed);
  let state;
  if (existsSync(file)) {
    state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.signature !== signature || state.seed !== seed || state.condition !== 'causal') {
      throw new Error(`Stale M8 cache: ${file}; remove it to replay training`);
    }
    loadLayer(p.layer1, state.layer1); loadLayer(p.layer2, state.layer2);
    loadLayer(p.output.layer, state.motor); p.output.previous = state.previous;
    p.baseline = state.baseline; p.t = state.t;
    loadLearning(p, state.learning);
    console.log(`Loaded M8 causal seed ${seed}: ${file}`);
  } else {
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
    console.log(`Replaying M8 causal seed ${seed}`);
    while (p.t < p.env.duration) {
      const action = schedule.get(p.t), drive = new Float64Array(p.env.actions.length);
      if (action) drive[p.env.actions.indexOf(action)] = 1;
      assert.equal(advanceActions(p, drive).executed.action, action ?? null);
      if (p.t % (5 * ACTION_WORLD.slotMs) === 0) console.log(
        `  seed ${seed}: ${p.t / ACTION_WORLD.slotMs}/${TRAIN_TRIALS}, ${((performance.now() - started) / 1000).toFixed(1)} s`);
    }
    assert.equal(p.env.executed.length, TRAIN_TRIALS * p.env.actions.length);
    state = { signature, seed, condition: 'causal', baseline, mapping: p.mapping,
      learning: saveLearning(p), trainingSeconds: (performance.now() - started) / 1000, t: p.t,
      layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), motor: saveLayer(p.output.layer),
      previous: p.output.previous, unroll: p.unroll.saveState(), errors: p.errors.saveState(),
      surprise: p.gate.value, learningWindows: p.learningWindows, totalN: p.totalN,
      executed: p.env.executed };
    saveCheckpoint(file, { saveState: () => state });
  }
  return { pipeline: p, baseline: state.baseline, cache: { file, signature,
    sha256: hash(readFileSync(file)), trainingSeconds: state.trainingSeconds } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const seed of process.argv[2] ? [Number(process.argv[2])] : SEEDS) cachedActions(seed);
}
