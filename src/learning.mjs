/** Shared online layer-2 learning; called once per readout, outside neural ticks. */
import { FutureSlices } from './predict.mjs';
import { createDownward } from './downward.mjs';
import { ThreeFactor, SurpriseGate } from './three-factor.mjs';
import { SpikingNovelty } from './novelty.mjs';
import { WINDOW_MS } from './readout.mjs';

export function attachLearning(p, seed) {
  const ids = p.mapping.map(a => a.id);
  p.downward = createDownward(ids);
  p.baseline = p.layer2.replicas.map(r => Array.from(r.EE.stdp.rho));
  p.future = new FutureSlices(ids, p.downward);
  p.unroll = p.future.past;
  p.factor = new ThreeFactor(p.future);
  p.errors = new SpikingNovelty(ids, seed);
  p.gate = new SurpriseGate();
  p.learningWindows = 0; p.totalN = 0;
  return p;
}

export function learnWindow(p, lit, p7 = lit) {
  const { t, future, layer2, errors } = p;
  future.update(t, lit, p7);
  const lines = future.past.lines(t);
  const counts = errors.step(t, future.past.ids.map((_, i) => lines[i * 9]), future.created, { learn: true });
  p.factor.step(t, counts, errors.pending);
  p.gate.step(counts); // Retain the gate5 rest statistic; it no longer gates learning.
  const learn = true;
  for (const { EE } of layer2.replicas) EE.frozen = !learn;
  p.learningWindows += Number(learn); p.totalN += counts.reduce((sum, c) => sum + c.N, 0);
  layer2.run(WINDOW_MS, lines);
  return { lines, counts, learn };
}

export function saveLearning(p) {
  return { schema: 'event-learning-v1', future: p.future.saveState(), factor: p.factor.saveState(), errors: p.errors.saveState(),
    surprise: p.gate.value, learningWindows: p.learningWindows, totalN: p.totalN };
}
export function loadLearning(p, state) {
  if (state?.schema !== 'event-learning-v1') throw new Error('Unsupported learning snapshot: legacy M states require explicit migration');
  p.future.loadState(state.future); p.downward = p.future.downward; p.unroll = p.future.past;
  p.factor = new ThreeFactor(p.future).loadState(state.factor);
  p.errors.loadState(state.errors); p.gate.value = state.surprise;
  p.learningWindows = state.learningWindows; p.totalN = state.totalN;
}
