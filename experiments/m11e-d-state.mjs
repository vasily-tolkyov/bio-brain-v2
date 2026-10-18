/** Exact saved-state adapters for report experiments, with no training/cache fallback. */
import { readFileSync } from 'node:fs';
import { makePipeline, teachFeatures } from './m3-pipeline.mjs';
import { loadLayer } from './m8-cache.mjs';
import { loadLearning } from '../src/learning.mjs';
export const baseDirectory = seed => seed === 7 ? 'out/m11e-pilot-c' : `out/m11e-roles/${seed}`;
export const readJSON = path => JSON.parse(readFileSync(path));
export function restore(p, s) {
  p.t = s.t; p.baseline = s.baseline;
  loadLayer(p.layer1, s.layer1); loadLayer(p.layer2, s.layer2); loadLearning(p, s.learning);
}
export function cachedCausal(seed) {
  const file = `${baseDirectory(seed)}/causal-state.json`, s = readJSON(file);
  const pipeline = makePipeline(teachFeatures(seed), seed); restore(pipeline, s);
  return { pipeline, baseline: pipeline.baseline, cache: { file } };
}
