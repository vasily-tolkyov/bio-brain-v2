/** N-only spiking comparator and per-prediction reality ledger, between windows. */
import { SpikingNetwork } from './network.mjs';
import { TimeUnroll } from './unroll.mjs';
import { WINDOW_MS } from './readout.mjs';

// The original N circuit and constants. No M/D cells, slow inhibition or M gate.
export const NOVELTY = Object.freeze({ cells: 10, fibers: 8, dt: 0.5, rateHz: 120,
  toleranceMs: 500, excScale: 3, inhScale: 0.05, tauRec: 5,
  eta: 0.2, targetHz: 1.5, tonicHz: 10.3, wMax: 40 });
export const restCount = durationMs => NOVELTY.targetHz * NOVELTY.cells * durationMs / 1000;
export const effectiveNovelty = (Ndev, durationMs) => Math.max(0, Ndev - 3 * Math.sqrt(restCount(durationMs)));

export class SpikingNovelty {
  constructor(ids, seed = 1) {
    this.ids = new TimeUnroll(ids).ids;
    this.pending = []; this.t = null;
    this.net = new SpikingNetwork({ seed, dt: NOVELTY.dt, pops: this.ids.flatMap((_, r) => [
      { name: `N${r}`, n: NOVELTY.cells },
      ...['R', 'P'].map(k => ({ name: `${k}${r}`, n: NOVELTY.fibers, source: true })),
    ]) });
    const connect = options => this.net.connect({ contacts: 10, pRelease: 0.3,
      tauRec: NOVELTY.tauRec, ...options });
    this.rows = this.ids.map((id, r) => {
      const names = Object.fromEntries(['N', 'R', 'P'].map(k => [k, `${k}${r}`]));
      connect({ from: names.R, to: names.N, scale: NOVELTY.excScale });
      const Ninh = connect({ from: names.P, to: names.N, kind: 'inh', scale: NOVELTY.inhScale,
        istdp: { eta: NOVELTY.eta, target: NOVELTY.targetHz, wMax: NOVELTY.wMax } });
      return { id, ...Object.fromEntries(Object.entries(names).map(([k, v]) => [k, this.net.idx(v)])), Ninh };
    });
  }

  /** A real onset matches every prediction of that target within its own window.
   * The inclusive right-edge window is processed before the learner settles it.
   * Matching is event bookkeeping; it does not depend on N's spikes or weights.
   */
  step(t, now, created = [], { learn = false } = {}) {
    if (!Number.isFinite(t) || t < 0 || t % WINDOW_MS ||
        (this.t !== null && t !== this.t + WINDOW_MS) || now.length !== this.ids.length ||
        !Array.from(now).every(s => Number.isFinite(s) && s >= 0 && s <= 1) ||
        created.some(e => !this.ids.includes(e.B) || !Number.isFinite(e.tArrive) ||
          e.tArrive < t || e.tArrive % WINDOW_MS || !Number.isFinite(e.strength) || e.strength < 0 || e.strength > 1)) {
      throw new Error('Invalid novelty window or drives');
    }
    this.pending = [...this.pending, ...created.map(e => ({ ...e, matched: 0 }))]
      .filter(e => t <= e.tArrive + NOVELTY.toleranceMs);
    const rates = new Float64Array(this.net.N);
    const predictions = this.rows.map((row, i) => {
      const entries = this.pending.filter(e => e.B === row.id && t >= e.tArrive - NOVELTY.toleranceMs);
      for (const e of entries) e.matched = Math.max(e.matched, now[i]);
      const prediction = Math.max(0, ...entries.map(e => e.strength));
      for (const cell of row.N) rates[cell] = NOVELTY.tonicHz;
      for (const cell of row.R) rates[cell] = NOVELTY.rateHz * now[i];
      for (const cell of row.P) rates[cell] = NOVELTY.rateHz * prediction;
      row.Ninh.frozen = !learn || now[i] === 0;
      return prediction;
    });
    for (const spikes of this.net.spikes) spikes.length = 0;
    this.net.run(WINDOW_MS, { rate: i => rates[i], learn });
    this.t = t;
    return this.rows.map((row, i) => {
      const Nraw = row.N.reduce((n, cell) => n + this.net.spikes[cell].length, 0);
      return { id: row.id, t, reality: now[i], prediction: predictions[i], Nraw, N: Nraw - restCount(WINDOW_MS) };
    });
  }

  saveState() {
    return structuredClone({ schema: 'novelty-only-v1', ids: this.ids, t: this.t,
      pending: this.pending, net: this.net.saveState() });
  }

  loadState(state) {
    if (state?.schema !== 'novelty-only-v1') throw new Error('Unsupported novelty state: legacy N/M snapshots require explicit migration');
    const s = structuredClone(state);
    if (JSON.stringify(s.ids) !== JSON.stringify(this.ids) ||
        !(s.t === null || (Number.isFinite(s.t) && s.t >= 0 && s.t % WINDOW_MS === 0)) ||
        !Array.isArray(s.pending) || s.pending.some(e => !this.ids.includes(e.B) ||
          !Number.isFinite(e.tArrive) || e.tArrive < 0 || e.tArrive % WINDOW_MS ||
          !Number.isFinite(e.strength) || e.strength < 0 || e.strength > 1 ||
          !Number.isFinite(e.matched) || e.matched < 0 || e.matched > 1)) {
      throw new Error('Invalid novelty state');
    }
    this.net.loadState(s.net); this.t = s.t; this.pending = s.pending;
    return this;
  }
}
