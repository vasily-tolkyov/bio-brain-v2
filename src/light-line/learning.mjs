import { createDownward } from './downward.mjs';
import { FutureSlices } from './predict.mjs';
import { BinaryNovelty } from './novelty.mjs';
import { ThreeFactor, NoveltyTrace } from './three-factor.mjs';
import { WINDOW_MS, present, strengthOK } from './presence.mjs';

/** B-readout -> actual onsets -> future -> binary N -> per-instance W ledger.
 * Optical co-light learning has no dependency on this class or its weights.
 * Caller supplies observed P7, never forecasts or goal rows as observations. */
export class PredictionLearning {
  constructor(ids, { sourceLabels = new Map(), downward = createDownward(ids) } = {}) {
    this.future = new FutureSlices(ids, downward);
    this.novelty = new BinaryNovelty(ids);
    this.factor = new ThreeFactor(this.future, sourceLabels);
    this.diagnostic = new NoveltyTrace();
    this.frozen = false; this.windows = 0;
  }
  get downward() { return this.future.downward; }
  freeze(value = true) {
    if (typeof value !== 'boolean') throw new TypeError('Freeze takes a boolean');
    this.frozen = value; return this;
  }
  step(t, observations) {
    if (!Number.isFinite(t) || t < 0 || t % WINDOW_MS ||
        (this.novelty.t !== null && t !== this.novelty.t + WINDOW_MS) ||
        !Array.isArray(observations) || observations.some(e => !this.future.past.indices.has(e.id) ||
          !strengthOK(e.strength) || (e.origin !== undefined && e.origin !== 'reality'))) {
      throw new Error('Learning requires consecutive windows of real observed P7');
    }
    const before = this.downward.weights.map(rule => ({ rule, W: rule.W, deltas: { ...rule.deltas } }));
    this.future.update(t, observations.filter(e => present(e.strength)), observations);
    const lines = this.future.past.lines(t);
    const counts = this.novelty.step(t, this.future.past.ids.map((_, i) => lines[i * 9]), this.future.created);
    this.factor.step(t, counts, this.novelty.pending, { learn: !this.frozen });
    this.diagnostic.step(counts); this.windows++;
    // Keep removed objects long enough to account for their final miss/clamp.
    const rules = new Set([...before.map(e => e.rule), ...this.downward.weights]);
    const changes = [...rules].flatMap(rule => {
      const old = before.find(e => e.rule === rule);
      if (old && old.W === rule.W) return [];
      const deltas = Object.fromEntries(['STDP', 'N', 'miss', 'clamp'].map(k =>
        [k, rule.deltas[k] - (old?.deltas[k] ?? 0)]));
      return [{ t, ruleKey: rule.ruleKey, generation: rule.generation, before: old?.W ?? 0,
        after: rule.W, live: this.downward.weights.includes(rule), deltas }];
    });
    return { counts, changes, onsets: this.future.past.entries.filter(e => e.tOnset === t),
      created: this.future.created, arrivals: this.future.arrivals };
  }
  /** Actual L3b/L4 snapshot fields, measured over exactly one 100 ms window. */
  stepVisual(t, stack, segments) {
    if (segments.reduce((sum, s) => sum + s.durationMs, 0) !== WINDOW_MS) {
      throw new Error('A visual observation must cover one P7 window');
    }
    const optical = stack.replaySnapshot(segments);
    return { optical, ...this.step(t, optical.readout) };
  }
  saveState() {
    return structuredClone({ schema: 'light-prediction-learning-v1', future: this.future.saveState(),
      novelty: this.novelty.saveState(), factor: this.factor.saveState(),
      sourceLabels: [...this.factor.sourceLabels], trace: this.diagnostic.value,
      windows: this.windows, frozen: this.frozen });
  }
  loadState(s) {
    if (s?.schema !== 'light-prediction-learning-v1' || typeof s.frozen !== 'boolean' ||
        !Number.isSafeInteger(s.windows) || s.windows < 0 || !Number.isFinite(s.trace)) {
      throw new Error('Invalid light learning state');
    }
    const future = new FutureSlices(this.future.past.ids).loadState(s.future);
    const novelty = new BinaryNovelty(future.past.ids).loadState(s.novelty);
    const factor = new ThreeFactor(future, new Map(s.sourceLabels)).loadState(s.factor);
    if (novelty.t !== factor.t || (novelty.t !== null && novelty.t !== future.t)) {
      throw new Error('Inconsistent learning clocks');
    }
    this.future = future; this.novelty = novelty; this.factor = factor;
    this.diagnostic.value = s.trace; this.windows = s.windows; this.frozen = s.frozen;
    return this;
  }
}
