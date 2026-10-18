/** Per-feature spiking errors. Scheduling/rate conversion runs only between windows. */
import { SpikingNetwork } from './network.mjs';
import { TimeUnroll } from './unroll.mjs';
import { WINDOW_MS } from './readout.mjs';

// Independent external Poisson input uses the network's fixed 60 afferents/cell,
// 10 contacts, release=0.3, recovery=100 ms. 10.3 Hz/afferent gives ~1.5 Hz/cell
// at rest. This one tonic setting applies to every N/M cell, feature and seed.
const toleranceMs = 500;
export const ERRORS = Object.freeze({ cells: 10, fibers: 8, dt: 0.5, rateHz: 120,
  toleranceMs, excScale: 3, inhScale: 0.05, tauRec: 5,
  slowRiseMs: 5, slowDecayMs: toleranceMs, eta: 0.2, targetHz: 1.5, tonicHz: 10.3, wMax: 40 });

// Analytic population rest count for this layer; never estimated from probes.
export const restCount = durationMs => ERRORS.targetHz * ERRORS.cells * durationMs / 1000;
export const effectiveMiss = Mdev => Math.max(0, Mdev - 3 * Math.sqrt(restCount(WINDOW_MS)));
export const effectiveNovelty = (Ndev, durationMs) => Math.max(0, Ndev - 3 * Math.sqrt(restCount(durationMs)));

export class SpikingErrors {
  constructor(ids, seed = 1) {
    this.ids = new TimeUnroll(ids).ids;
    this.pending = []; this.t = null;
    const pops = this.ids.flatMap((_, r) => [
      ...['N', 'M'].map(k => ({ name: `${k}${r}`, n: ERRORS.cells })),
      ...['R', 'P', 'D'].map(k => ({ name: `${k}${r}`, n: ERRORS.fibers, source: true })),
    ]);
    this.net = new SpikingNetwork({ pops, seed, dt: ERRORS.dt });
    const connect = options => this.net.connect({ contacts: 10, pRelease: 0.3,
      tauRec: ERRORS.tauRec, ...options });
    this.rows = this.ids.map((id, r) => {
      const names = Object.fromEntries(['N', 'M', 'R', 'P', 'D'].map(k => [k, `${k}${r}`]));
      for (const [from, to] of [['R', 'N'], ['D', 'M']]) {
        connect({ from: names[from], to: names[to], scale: ERRORS.excScale });
      }
      const istdp = { eta: ERRORS.eta, target: ERRORS.targetHz, wMax: ERRORS.wMax };
      const Ninh = connect({ from: names.P, to: names.N, kind: 'inh',
        scale: ERRORS.inhScale, istdp });
      const Minh = connect({ from: names.R, to: names.M, kind: 'slow', E: -75,
        tauR: ERRORS.slowRiseMs, tauD: ERRORS.slowDecayMs,
        scale: ERRORS.inhScale, istdp: { ...istdp, tauPre: ERRORS.slowDecayMs } });
      return { id, ...Object.fromEntries(Object.entries(names).map(([k, v]) => [k, this.net.idx(v)])), Ninh, Minh };
    });
  }

  /** now: one onset strength per ordered ID (TimeUnroll col 0).
   * created: FutureSlices.created, supplied exactly once, at creation.
   * Integer window starts are inclusive: arrival 3200 => [2700,3700],
   * deadline occupies the final labeled window [3700,3800).
   * A matched onset sustains a shunt of that entry's deadline afferent until due.
   * This bookkeeping is outside the neural tick, just like prediction scheduling.
   */
  step(t, now, created = [], { learn = false } = {}) {
    if (!Number.isFinite(t) || t < 0 || t % WINDOW_MS ||
        (this.t !== null && t !== this.t + WINDOW_MS) || now.length !== this.ids.length ||
        !Array.from(now).every(s => Number.isFinite(s) && s >= 0 && s <= 1) ||
        created.some(e => !this.ids.includes(e.B) || !Number.isFinite(e.tArrive) ||
          e.tArrive < t || e.tArrive % WINDOW_MS || !Number.isFinite(e.strength) || e.strength < 0 || e.strength > 1)) {
      throw new Error('Invalid error window or drives');
    }
    this.pending = [...this.pending, ...created.map(e => ({ ...e, matched: 0, remaining: e.strength }))]
      .filter(e => t <= e.tArrive + ERRORS.toleranceMs);
    const drives = this.rows.map((row, i) => {
      const entries = this.pending.filter(e => e.B === row.id && t >= e.tArrive - ERRORS.toleranceMs);
      for (const e of entries) {
        e.matched = Math.max(e.matched, now[i]);
        e.remaining = e.strength * Math.max(0, 1 - e.matched);
      }
      const prediction = Math.max(0, ...entries.map(e => e.strength));
      const deadline = Math.max(0, ...entries.filter(e => t === e.tArrive + ERRORS.toleranceMs).map(e => e.remaining));
      return { prediction, deadline };
    });
    return this.runDrives(t, now, drives, learn);
  }

  /** Goal comparator: persistent goal excites M directly; reality inhibits M.
   * Same populations, slow inhibition and afferent-gated iSTDP as prediction M.
   * Use a separate instance: goals never join prediction eligibility/pending.
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
      for (const kind of ['N', 'M']) for (const cell of row[kind]) rates[cell] = ERRORS.tonicHz;
      for (const [kind, strength] of [['R', now[i]], ['P', prediction], ['D', deadline]]) {
        for (const cell of row[kind]) rates[cell] = ERRORS.rateHz * strength;
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
    return structuredClone({ ids: this.ids, t: this.t, pending: this.pending, net: this.net.saveState() });
  }

  loadState(state) {
    const s = structuredClone(state);
    if (JSON.stringify(s.ids) !== JSON.stringify(this.ids) ||
        !(s.t === null || (Number.isFinite(s.t) && s.t >= 0 && s.t % WINDOW_MS === 0)) ||
        !Array.isArray(s.pending) || s.pending.some(e => !this.ids.includes(e.B) ||
          !Number.isFinite(e.tArrive) || e.tArrive < 0 || e.tArrive % WINDOW_MS ||
          !Number.isFinite(e.strength) || e.strength < 0 || e.strength > 1 ||
          !Number.isFinite(e.matched) || e.matched < 0 || e.matched > 1 ||
          e.remaining !== e.strength * Math.max(0, 1 - e.matched))) {
      throw new Error('Invalid error state');
    }
    this.net.loadState(s.net); this.t = s.t; this.pending = s.pending;
    return this;
  }
}
