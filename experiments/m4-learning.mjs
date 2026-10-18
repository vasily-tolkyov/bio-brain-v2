import { saveLearning, loadLearning } from '../src/learning.mjs';
/** Exact M3 learning, cached before frozen probes. No aggregate-profile reconstruction. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AttractorLayer } from '../src/layer.mjs';
import { saveCheckpoint } from '../src/checkpoint.mjs';
import { stormWorld, INPUT_LINES } from '../src/world.mjs';
import { advance, makePipeline, teachFeatures } from './m3-pipeline.mjs';

export const SEEDS = [7, 19, 31], TRAIN_TRIALS = 30;
const sources = ['src/downward.mjs', 'src/predict.mjs', 'src/learning.mjs', 'experiments/m4-learning.mjs', 'experiments/m3-pipeline.mjs',
  'src/layer.mjs', 'src/io.mjs', 'src/world.mjs', 'src/unroll.mjs', 'src/readout.mjs',
  'src/network.mjs', 'src/synapse.mjs', 'src/stdp.mjs', 'src/neuron/lif.mjs',
  'src/core/rng.mjs', 'src/core/state.mjs', 'src/errors.mjs', 'src/three-factor.mjs'];
export const signature = createHash('sha256').update(sources.map(path =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).join('\n')).digest('hex');
const saveLayer = layer => ({ ticks: layer.ticks, attractors: structuredClone(layer.attractors),
  replicas: layer.replicas.map(r => r.net.saveState()) });
function loadLayer(layer, state) {
  layer.ticks = state.ticks; layer.attractors = structuredClone(state.attractors);
  layer.replicas.forEach((r, i) => r.net.loadState(state.replicas[i]));
}

export function saveLearnedPipeline(pipeline, baseline, seed, shuffled, trainingSeconds) {
  const condition = shuffled ? 'shuffled' : 'causal';
  const file = fileURLToPath(new URL(`../out/m11c-graded/m4-cache/${seed}-${condition}.json`, import.meta.url));
  const state = { signature, seed, condition, mapping: pipeline.mapping, baseline, trainingSeconds,
    learning: saveLearning(pipeline), t: pipeline.t, unroll: pipeline.unroll.saveState(), errors: pipeline.errors.saveState(),
    surprise: pipeline.gate.value, learningWindows: pipeline.learningWindows, totalN: pipeline.totalN,
    layer1: saveLayer(pipeline.layer1), layer2: saveLayer(pipeline.layer2) };
  saveCheckpoint(file, { saveState: () => state });
  return { file, signature, trainingSeconds };
}

export function learnedPipeline(seed, shuffled) {
  const condition = shuffled ? 'shuffled' : 'causal';
  const file = fileURLToPath(new URL(`../out/m11c-graded/m4-cache/${seed}-${condition}.json`, import.meta.url));
  if (existsSync(file)) {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.signature !== signature) throw new Error(`Stale learning cache: ${file}; remove it to retrain`);
    const teacher = { layer: new AttractorLayer({ n: INPUT_LINES, seed }), mapping: state.mapping };
    const pipeline = makePipeline(teacher, seed);
    loadLayer(pipeline.layer1, state.layer1); loadLayer(pipeline.layer2, state.layer2);
    pipeline.baseline = state.baseline; pipeline.t = state.t;
    loadLearning(pipeline, state.learning);
    console.log(`Loaded ${condition} seed ${seed}: ${file}`);
    return { pipeline, baseline: state.baseline, cache: { file, signature, trainingSeconds: state.trainingSeconds } };
  }
  const started = performance.now(), teacher = teachFeatures(seed);
  const pipeline = makePipeline(teacher, seed), world = stormWorld({ seed, count: TRAIN_TRIALS, shuffled });
  const baseline = pipeline.layer2.replicas.map(r => Array.from(r.EE.stdp.rho));
  let completed = 0;
  console.log(`Learning ${condition} seed ${seed}: teacher ${teacher.epochs} epochs`);
  while (pipeline.t < world.duration) {
    advance(pipeline, world);
    if (completed < world.trials.length && pipeline.t >= world.trials[completed].end) {
      completed++;
      if (completed % 5 === 0) console.log(`  ${condition} ${seed}: ${completed}/${TRAIN_TRIALS}, ${((performance.now() - started) / 1000).toFixed(1)} s`);
    }
  }
  const trainingSeconds = (performance.now() - started) / 1000;
  return { pipeline, baseline, cache: saveLearnedPipeline(pipeline, baseline, seed, shuffled, trainingSeconds) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const seed of process.argv[2] ? [Number(process.argv[2])] : SEEDS) for (const shuffled of [false, true]) learnedPipeline(seed, shuffled);
}
