/** Downward calibration, once per P7/error window, never inside a neural tick.
 * Arrival-centred credit, one bounded update per event; no neural tick hooks.
 */
import { DOWNWARD, newConnection, strengthenDownward } from './downward.mjs';
import { WINDOW_MS } from './readout.mjs';
import { ERRORS, effectiveMiss, effectiveNovelty } from './errors.mjs';

// Fixed layer-2 roles: N creates, STDP strengthens, M subtracts normalized weight.
export const THREE_FACTOR = Object.freeze({ etaMissByLayer: Object.freeze({ 2: 0.24 }),
  gFloor: 0.2, E0: 100, tauE: 400, kGate: 3 });
// Saturation is retained solely for the unchanged goal-M consumer.
export const sat = E => E / (Math.abs(E) + THREE_FACTOR.E0);
export const trace = (e, a, elapsed) => e * Math.exp(-elapsed / THREE_FACTOR.tauE) + a;
// Linear layer-2 credit: activation at arrival, zero at both tolerance edges.
// Miss uses the same trace peak, independently of deadline lateness.
export const predictionCredit = (activation, tArrive, t) =>
  activation * Math.max(0, 1 - Math.abs(t - tArrive) / ERRORS.toleranceMs);
export const missShape = u => THREE_FACTOR.gFloor + (1 - THREE_FACTOR.gFloor) * (1 - u);
export const missDelta = (W, wMax, a, Meff) => Meff > 0 ?
  -wMax * THREE_FACTOR.etaMissByLayer[2] * missShape(W / wMax) * a : 0;
export const calibrateWeight = (W, wMax, a, Meff) => Math.max(0, W + missDelta(W, wMax, a, Meff));

/** Legacy signed surprise statistic for comparator/rest audits only; never gates STDP. */
export class SurpriseGate {
  constructor() { this.value = 0; }
  step(counts) {
    this.value = trace(this.value, counts.reduce((sum, c) => sum + c.N, 0), WINDOW_MS);
    // Independent Poisson rest: Var(sum dev)=populations*lambda. For T=d*T+dev,
    // stationary Var(T)=Var(dev)/(1-d²), d=exp(-window/tauE); no measured baseline.
    const rest = ERRORS.targetHz * ERRORS.cells * WINDOW_MS / 1000;
    const sigma = Math.sqrt(counts.length * rest / (1 - Math.exp(-2 * WINDOW_MS / THREE_FACTOR.tauE)));
    return this.value > THREE_FACTOR.kGate * sigma;
  }
}

export class ThreeFactor {
  constructor(future) {
    this.future = future;
    for (const w of future.downward.weights) {
      w.deltas ??= { STDP: 0, N: 0, M: 0, clamp: 0 };
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
          !future.past.indices.has(c.id) || ![c.M, c.N].every(Number.isFinite))) {
      throw new Error('Invalid three-factor window or counts');
    }
    const errors = new Map(counts.map(c => [c.id, c]));
    const weights = future.downward.weights;
    const existing = new Map(weights.map(w => [w.ruleKey, w]));
    for (const p of pending) {
      if (!Number.isFinite(p.activation) || p.activation < 0 ||
          p.activation > 1 || !Number.isFinite(p.tArrive)) throw new Error('Invalid eligibility source');
      const w = existing.get(p.ruleKey);
      // Comparator consumption is unchanged; deleted generations have no credit.
      if (!w || p.createdAt !== w.createdAt) continue;
      if (t >= p.tArrive - ERRORS.toleranceMs && t <= p.tArrive + ERRORS.toleranceMs) {
        let credit = this.predictions.find(c => c.ruleKey === p.ruleKey && c.tArrive === p.tArrive);
        if (!credit) {
          // Retain each prediction's peak; evaluate hit timing at its first matched onset.
          credit = { ruleKey: p.ruleKey, createdAt: w.createdAt, tArrive: p.tArrive,
            M: p.activation, matched: false };
          this.predictions.push(credit);
        }
        if (!credit.matched && p.matched > 0) {
          if (learn) strengthenDownward(w, predictionCredit(credit.M, credit.tArrive, t), t);
          credit.matched = true;
        }
      }
    }
    // Each deadline uses only its own prediction's trace, never another entry's
    // residual credit. Consumed predictions never receive an M decrement.
    const due = this.predictions.filter(c => t === c.tArrive + ERRORS.toleranceMs);
    this.predictions = this.predictions.filter(c => t < c.tArrive + ERRORS.toleranceMs);
    const lines = future.past.lines(t);
    for (const w of [...weights]) {
      if (w.A === w.B) continue;
      const error = errors.get(w.B);
      if (!learn || !error) continue;
      const credit = due.find(c => c.ruleKey === w.ruleKey);
      const Meff = credit && !credit.matched ? effectiveMiss(error.M) : 0;
      const delta = missDelta(w.W, DOWNWARD.wMax, credit?.M ?? 0, Meff);
      const raw = w.W + delta;
      w.W = Math.max(0, raw); w.deltas.M += delta; w.deltas.clamp += w.W - raw;
      if (w.W === 0) {
        weights.splice(weights.indexOf(w), 1);
        existing.delete(w.ruleKey);
        this.predictions = this.predictions.filter(c => c.ruleKey !== w.ruleKey);
      }
    }
    if (learn) for (const error of counts) {
      if (effectiveNovelty(error.N, WINDOW_MS) <= 0) continue;
      for (const A of future.past.ids) if (A !== error.id) for (let k = 1; k <= 8; k++) {
        if (lines[future.past.indices.get(A) * 9 + k] <= 0 || existing.has(JSON.stringify([A, k, error.id]))) continue;
        weights.push(newConnection(A, k, error.id, t));
      }
    }
    this.t = t;
  }

  saveState() {
    return structuredClone({ t: this.t, predictions: this.predictions });
  }

  loadState(state) {
    const s = structuredClone(state);
    if (!(s.t === null || (s.t === this.future.t && Number.isFinite(s.t) && s.t >= 0 && s.t % WINDOW_MS === 0)) ||
        !Array.isArray(s.predictions) || s.predictions.some(c => !this.future.downward.weights.some(w =>
          w.ruleKey === c.ruleKey && w.createdAt === c.createdAt) ||
          !Number.isFinite(c.tArrive) || c.tArrive % WINDOW_MS || c.tArrive + ERRORS.toleranceMs <= s.t ||
          !Number.isFinite(c.M) || c.M < 0 || typeof c.matched !== 'boolean')) {
      throw new Error('Invalid three-factor state');
    }
    this.t = s.t; this.predictions = s.predictions;
    return this;
  }
}
