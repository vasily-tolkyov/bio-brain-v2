/** Shared M3 experiment/smoke wiring. Neural parameters stay in M1's modules. */
import { AttractorLayer } from '../src/layer.mjs';
import { attachLearning, learnWindow } from '../src/learning.mjs';
import { FEATURES } from '../src/world.mjs';
import { teachGroups, presentWindow, discardHistory } from '../src/io.mjs';
export { discardHistory } from '../src/io.mjs';

export const STEP_MS = 100, COLUMNS = 9;

export function teachFeatures(seed) {
  return teachGroups(FEATURES, seed);
}

export function makePipeline(teacher, seed) {
  const { layer, mapping } = teacher;
  // M3 reads layer-2 weights, not a replica completion probability. Keep the
  // input layer's three-replica P7, spending the upper-layer budget on trials.
  return attachLearning({ layer1: layer, layer2: new AttractorLayer({ n: mapping.length * COLUMNS, R: 1, seed: seed + 30000, level: 2 }),
    mapping, t: 0,
    line: (feature, col) => mapping.findIndex(a => a.feature === feature) * COLUMNS + col }, seed);
}

export function advance(pipeline, world) {
  const { layer1, layer2, unroll, t } = pipeline, start = layer1.t;
  presentWindow(layer1, world, STEP_MS);
  const lit = layer1.readout(start);
  const { lines } = learnWindow(pipeline, lit);
  // P7 needs only the latest window. Keep exact-end spikes for the NEXT half-open
  // window; logging cleanup never changes neuron, trace, RNG or weight state.
  discardHistory(layer1); discardHistory(layer2);
  pipeline.t += STEP_MS;
  return { t, lit, lines };
}

/** Mean rho over existing directed edges in both directions and all replicas.
 * Absent wiring is null, never a fabricated zero weight. Counts expose sparsity.
 */
export function weightProfile(pipeline, past, now) {
  const { layer2, line } = pipeline, target = line(now, 0), rho = [], edgeCounts = [];
  for (let col = 0; col < COLUMNS; col++) {
    const source = line(past, col);
    let total = 0, count = 0;
    for (const { EE, E } of layer2.replicas) for (let k = 0; k < EE.pre.length; k++) {
      const a = Math.floor((EE.pre[k] - E) / layer2.cellsPerLine);
      const b = Math.floor((EE.post[k] - E) / layer2.cellsPerLine);
      if ((a === source && b === target) || (a === target && b === source)) {
        total += EE.stdp.rho[k]; count++;
      }
    }
    rho.push(count ? total / count : null);
    edgeCounts.push(count / layer2.R);
  }
  const peak = Math.max(...rho.filter(x => x !== null));
  return { rho, edgeCounts, argmax: rho.indexOf(peak) };
}

export function describeAttractors(pipeline) {
  return pipeline.layer2.identify().map(a => ({ id: a.id, cellCount: a.members.length,
    members: [...new Set(a.members.map(cell => {
      const i = Math.floor(cell / pipeline.layer2.cellsPerLine);
      return `${pipeline.mapping[Math.floor(i / COLUMNS)].feature}@${i % COLUMNS}`;
    }))] }));
}
