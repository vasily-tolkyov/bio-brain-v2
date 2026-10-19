/** Downward calibration, once per P7/error window, never inside a neural tick.
 * Arrival-centred credit, one bounded update per event; no neural tick hooks.
 */
import { DOWNWARD, newConnection, registerConnection, strengthenDownward } from './downward.mjs';
import { WINDOW_MS } from './readout.mjs';
import { NOVELTY, effectiveNovelty } from './novelty.mjs';

// N creates; real matched events strengthen; unmatched events subtract weight.
export const THREE_FACTOR = Object.freeze({ etaMissByLayer: Object.freeze({ 2: 0.24 }),
  gFloor: 0.2, E0: 100, tauE: 400, kGate: 3,
  // User-selected exact-zero deletion. No positive detection floor or epsilon.
  pruneThreshold: 0 });
// Saturation is retained solely for the unchanged goal-M consumer.
export const sat = E => E / (Math.abs(E) + THREE_FACTOR.E0);
export const trace = (e, a, elapsed) => e * Math.exp(-elapsed / THREE_FACTOR.tauE) + a;
// Linear layer-2 credit: activation at arrival, zero at both tolerance edges.
// Miss uses the same trace peak, independently of deadline lateness.
export const predictionCredit = (activation, tArrive, t) =>
  activation * Math.max(0, 1 - Math.abs(t - tArrive) / NOVELTY.toleranceMs);
export const missShape = u => THREE_FACTOR.gFloor + (1 - THREE_FACTOR.gFloor) * (1 - u);
export function missDelta(W, wMax, activation) {
  if (arguments.length !== 3) throw new Error('Event missDelta takes no neural M gate');
  return -wMax * THREE_FACTOR.etaMissByLayer[2] * missShape(W / wMax) * activation;
}
export function calibrateWeight(W, wMax, activation) {
  if (arguments.length !== 3) throw new Error('Event calibrateWeight takes no neural M gate');
  return Math.max(0, W + missDelta(W, wMax, activation));
}

/** Legacy signed surprise statistic for comparator/rest audits only; never gates STDP. */
export class SurpriseGate {
  constructor() { this.value = 0; }
  step(counts) {
    this.value = trace(this.value, counts.reduce((sum, c) => sum + c.N, 0), WINDOW_MS);
    // Independent Poisson rest: Var(sum dev)=populations*lambda. For T=d*T+dev,
    // stationary Var(T)=Var(dev)/(1-d²), d=exp(-window/tauE); no measured baseline.
    const rest = NOVELTY.targetHz * NOVELTY.cells * WINDOW_MS / 1000;
    const sigma = Math.sqrt(counts.length * rest / (1 - Math.exp(-2 * WINDOW_MS / THREE_FACTOR.tauE)));
    return this.value > THREE_FACTOR.kGate * sigma;
  }
}

export class ThreeFactor {
  constructor(future) {
    this.future = future;
    for (const w of future.downward.weights) {
      if (w.deltas && 'M' in w.deltas) throw new Error('Legacy M delta ledger requires explicit migration');
      w.deltas ??= { STDP: 0, N: 0, miss: 0, clamp: 0 };
      registerConnection(future.downward, w);
      w.createdAt ??= future.t;
    }
    this.t = null;
    this.predictions = [];
  }

  /** Call AFTER errors.step. pending retains each contributor beyond arrival;
   * comparison max-pooling must not erase its credit. N uses current past-line
   * activity without an eligibility tail. Freeze weights, not prediction traces.
   */
  step(t, counts, pending, { learn = true } = {}) {
    const { future } = this;
    if (!Number.isFinite(t) || t < 0 || t % WINDOW_MS || future.t !== t ||
        (this.t !== null && t !== this.t + WINDOW_MS) ||
        new Set(counts.map(c => c.id)).size !== counts.length || counts.some(c =>
          !future.past.indices.has(c.id) || !Number.isFinite(c.N))) {
      throw new Error('Invalid three-factor window or counts');
    }
    const weights = future.downward.weights;
    const existing = new Map(weights.map(w => [w.ruleKey, w]));
    this.predictions = this.predictions.filter(c => existing.get(c.ruleKey)?.generation === c.generation);
    const remove = w => {
      weights.splice(weights.indexOf(w), 1);
      existing.delete(w.ruleKey);
      this.predictions = this.predictions.filter(c => c.generation !== w.generation);
    };
    // Zero-valued remnants must not be rescued by a coincident hit. Already emitted
    // comparator predictions remain pending, but their deleted credit is gone.
    if (learn) for (const w of [...weights]) {
      if (w.W / DOWNWARD.wMax <= THREE_FACTOR.pruneThreshold) remove(w);
    }
    for (const p of pending) {
      if (!Number.isFinite(p.activation) || p.activation < 0 ||
          p.activation > 1 || !Number.isFinite(p.tArrive)) throw new Error('Invalid eligibility source');
      const w = existing.get(p.ruleKey);
      // Comparator consumption is unchanged; deleted generations have no credit.
      if (!w || p.generation !== w.generation) continue;
      if (t >= p.tArrive - NOVELTY.toleranceMs && t <= p.tArrive + NOVELTY.toleranceMs) {
        let credit = this.predictions.find(c => c.generation === p.generation && c.tArrive === p.tArrive);
        if (!credit) {
          // Retain each prediction's peak; evaluate hit timing at its first matched onset.
          credit = { ruleKey: p.ruleKey, generation: w.generation, tArrive: p.tArrive,
            sourceActivation: p.activation, matched: false };
          this.predictions.push(credit);
        }
        if (!credit.matched && p.matched > 0) {
          if (learn) strengthenDownward(w, predictionCredit(credit.sourceActivation, credit.tArrive, t), t);
          credit.matched = true;
        }
      }
    }
    // Settle every prediction instance exactly once, after the inclusive window.
    // A real hit suppresses only its own miss; no target-wide neural error gate.
    const due = this.predictions.filter(c => t === c.tArrive + NOVELTY.toleranceMs);
    this.predictions = this.predictions.filter(c => t < c.tArrive + NOVELTY.toleranceMs);
    const lines = future.past.lines(t);
    if (learn) for (const credit of due) {
      const w = existing.get(credit.ruleKey);
      if (credit.matched || !w || w.generation !== credit.generation) continue;
      const delta = missDelta(w.W, DOWNWARD.wMax, credit.sourceActivation);
      const raw = w.W + delta;
      w.W = Math.max(0, raw); w.deltas.miss += delta; w.deltas.clamp += w.W - raw;
      if (w.W / DOWNWARD.wMax <= THREE_FACTOR.pruneThreshold) remove(w);
    }
    if (learn) for (const error of counts) {
      if (effectiveNovelty(error.N, WINDOW_MS) <= 0) continue;
      for (const A of future.past.ids) if (A !== error.id) for (let k = 1; k <= 8; k++) {
        if (lines[future.past.indices.get(A) * 9 + k] <= 0 || existing.has(JSON.stringify([A, k, error.id]))) continue;
        const w = registerConnection(future.downward, newConnection(A, k, error.id, t));
        weights.push(w); existing.set(w.ruleKey, w);
      }
    }
    this.t = t;
  }

  saveState() {
    return structuredClone({ schema: 2, t: this.t, predictions: this.predictions });
  }

  loadState(state) {
    if (state?.schema !== 2) throw new Error('Unsupported event-learning state: explicit legacy migration required');
    const s = structuredClone(state);
    if (!(s.t === null || (s.t === this.future.t && Number.isFinite(s.t) && s.t >= 0 && s.t % WINDOW_MS === 0)) ||
        !Array.isArray(s.predictions) || new Set(s.predictions.map(c => JSON.stringify([c.generation, c.tArrive]))).size !== s.predictions.length || s.predictions.some(c => !this.future.downward.weights.some(w =>
          w.ruleKey === c.ruleKey && w.generation === c.generation) ||
          !Number.isFinite(c.tArrive) || c.tArrive % WINDOW_MS || c.tArrive + NOVELTY.toleranceMs <= s.t ||
          !Number.isFinite(c.sourceActivation) || c.sourceActivation < 0 || c.sourceActivation > 1 || typeof c.matched !== 'boolean')) {
      throw new Error('Invalid three-factor state');
    }
    this.t = s.t; this.predictions = s.predictions;
    return this;
  }
}
