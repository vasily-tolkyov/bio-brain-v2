/** Goal-only neural error. Prediction learning uses novelty.mjs, not this circuit.
 * Retain the previous goal topology/RNG and amplitude; its unused N cells are not
 * a learning source. Removing them is a separate action-path change. */
import { SpikingNetwork } from './network.mjs';
import { TimeUnroll } from './unroll.mjs';
import { WINDOW_MS } from './readout.mjs';

// Independent external Poisson input uses the network's fixed 60 afferents/cell,
// 10 contacts, release=0.3, recovery=100 ms. 10.3 Hz/afferent gives ~1.5 Hz/cell
// at rest. This one tonic setting applies to every N/M cell, feature and seed.
const toleranceMs = 500;
export const GOAL_ERRORS = Object.freeze({ cells: 10, fibers: 8, dt: 0.5, rateHz: 120,
  toleranceMs, excScale: 3, inhScale: 0.05, tauRec: 5,
  slowRiseMs: 5, slowDecayMs: toleranceMs, eta: 0.2, targetHz: 1.5, tonicHz: 10.3, wMax: 40 });

// Analytic population rest count for this layer; never estimated from probes.
export const restCount = durationMs => GOAL_ERRORS.targetHz * GOAL_ERRORS.cells * durationMs / 1000;

export class GoalErrors {
  constructor(ids, seed = 1) {
    this.ids = new TimeUnroll(ids).ids;
    this.t = null;
    const pops = this.ids.flatMap((_, r) => [
      ...['N', 'M'].map(k => ({ name: `${k}${r}`, n: GOAL_ERRORS.cells })),
      ...['R', 'P', 'D'].map(k => ({ name: `${k}${r}`, n: GOAL_ERRORS.fibers, source: true })),
    ]);
    this.net = new SpikingNetwork({ pops, seed, dt: GOAL_ERRORS.dt });
    const connect = options => this.net.connect({ contacts: 10, pRelease: 0.3,
      tauRec: GOAL_ERRORS.tauRec, ...options });
    this.rows = this.ids.map((id, r) => {
      const names = Object.fromEntries(['N', 'M', 'R', 'P', 'D'].map(k => [k, `${k}${r}`]));
      for (const [from, to] of [['R', 'N'], ['D', 'M']]) {
        connect({ from: names[from], to: names[to], scale: GOAL_ERRORS.excScale });
      }
      const istdp = { eta: GOAL_ERRORS.eta, target: GOAL_ERRORS.targetHz, wMax: GOAL_ERRORS.wMax };
      const Ninh = connect({ from: names.P, to: names.N, kind: 'inh',
        scale: GOAL_ERRORS.inhScale, istdp });
      const Minh = connect({ from: names.R, to: names.M, kind: 'slow', E: -75,
        tauR: GOAL_ERRORS.slowRiseMs, tauD: GOAL_ERRORS.slowDecayMs,
        scale: GOAL_ERRORS.inhScale, istdp: { ...istdp, tauPre: GOAL_ERRORS.slowDecayMs } });
      return { id, ...Object.fromEntries(Object.entries(names).map(([k, v]) => [k, this.net.idx(v)])), Ninh, Minh };
    });
  }

  /** Goal comparator: persistent goal excites M directly; reality inhibits M.
   * Preserved goal-only topology, slow inhibition and afferent-gated iSTDP.
   * Goal counts never enter prediction learning.
   */
  stepGoals(t, now, goals, { learn = false } = {}) {
    if (!Number.isFinite(t) || t < 0 || t % WINDOW_MS ||
        (this.t !== null && t !== this.t + WINDOW_MS) ||
        [now, goals].some(xs => xs.length !== this.ids.length ||
          !Array.from(xs).every(s => Number.isFinite(s) && s >= 0 && s <= 1))) {
      throw new Error('Invalid goal error window or drives');
    }
    return this.runDrives(t, now, Array.from(goals, strength =>
      ({ prediction: strength, deadline: strength })), learn);
  }

  runDrives(t, now, drives, learn) {
    this.t = t;
    const rates = new Float64Array(this.net.N);
    this.rows.forEach((row, i) => {
      const { prediction, deadline } = drives[i];
      for (const kind of ['N', 'M']) for (const cell of row[kind]) rates[cell] = GOAL_ERRORS.tonicHz;
      for (const [kind, strength] of [['R', now[i]], ['P', prediction], ['D', deadline]]) {
        for (const cell of row[kind]) rates[cell] = GOAL_ERRORS.rateHz * strength;
      }
      // Each group targets only one feature/population, hence one afferent gate.
      // Frozen groups still advance Vogels traces and synaptic dynamics in M0.
      row.Ninh.frozen = !learn || now[i] === 0;
      row.Minh.frozen = !learn || deadline === 0;
    });
    for (const spikes of this.net.spikes) spikes.length = 0;
    this.net.run(WINDOW_MS, { rate: i => rates[i], learn });
    const rest = restCount(WINDOW_MS);
    return this.rows.map((row, i) => {
      const Nraw = row.N.reduce((n, cell) => n + this.net.spikes[cell].length, 0);
      const Mraw = row.M.reduce((n, cell) => n + this.net.spikes[cell].length, 0);
      return { id: row.id, t, reality: now[i], ...drives[i], Nraw, Mraw,
        N: Nraw - rest, M: Mraw - rest };
    });
  }

  saveState() {
    return structuredClone({ schema: 'goal-errors-v1', ids: this.ids, t: this.t, net: this.net.saveState() });
  }

  loadState(state) {
    if (state?.schema !== 'goal-errors-v1') throw new Error('Unsupported goal error state');
    const s = structuredClone(state);
    if (JSON.stringify(s.ids) !== JSON.stringify(this.ids) ||
        !(s.t === null || (Number.isFinite(s.t) && s.t >= 0 && s.t % WINDOW_MS === 0))) {
      throw new Error('Invalid goal error state');
    }
    this.net.loadState(s.net); this.t = s.t;
    return this;
  }
}
