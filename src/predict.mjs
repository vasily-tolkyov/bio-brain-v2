/** Downward readout and future bookkeeping; never called from the spiking tick. */
import { TimeUnroll } from './unroll.mjs';
import { WINDOW_MS } from './readout.mjs';
import { DOWNWARD, registerConnection } from './downward.mjs';
export { readDownward } from './downward.mjs';

const COLUMNS = 9, LIMIT = 12800 * Math.SQRT2;
const BOUNDARIES = Array.from({ length: 8 }, (_, k) => 100 * 2 ** k / Math.SQRT2);
const strengthOK = x => Number.isFinite(x) && x >= 0 && x <= 1;
const centre = k => 100 * 2 ** (k - 1);
const key = (A, k, B) => JSON.stringify([A, k, B]);

/** The other future branch: caller-written working memory, never a past input.
 * No timeout or propagation. Only a reality onset or explicit cancellation clears it.
 */
export class GoalRow {
  constructor(ids) {
    this.ids = new TimeUnroll(ids).ids;
    this.entries = new Map();
    this.parents = new Map(); // Derived-goal ownership, not a second strength store.
  }

  write(id, strength = 1, parent = null) {
    if (!this.ids.includes(id) || !strengthOK(strength)) throw new Error('Invalid goal');
    if (strength === 0) this.cancel(id);
    else {
      this.entries.set(id, strength);
      if (parent === null) this.parents.delete(id);
      else this.parents.set(id, parent);
    }
    return this;
  }

  cancel(id) {
    if (!this.ids.includes(id)) throw new Error('Unknown goal feature');
    this.entries.delete(id);
    this.parents.delete(id);
  }

  observe(onsets) {
    for (const { id, strength } of onsets) if (strength > 0 && this.ids.includes(id)) this.cancel(id);
  }

  strengths() { return Float64Array.from(this.ids, id => this.entries.get(id) ?? 0); }
}

export class FutureSlices {
  constructor(ids, downward = { weights: [] }) {
    this.past = new TimeUnroll(ids);
    // These are the plastic connections themselves, shared with learning and U.
    this.downward = downward;
    downward.nextGeneration ??= 1;
    if (!Number.isSafeInteger(downward.nextGeneration) || downward.nextGeneration < 1) throw new Error('Invalid connection generation counter');
    const { weights } = downward;
    if (!Array.isArray(weights) || new Set(weights.map(w => w.ruleKey)).size !== weights.length || weights.some(w =>
      !this.past.indices.has(w.A) || !this.past.indices.has(w.B) || !Number.isInteger(w.k) ||
      w.k < 1 || w.k > 8 || !strengthOK(w.W) || w.W === 0 || w.W > DOWNWARD.wMax || w.ruleKey !== key(w.A, w.k, w.B))) {
      throw new Error('Invalid downward weights');
    }
    for (const w of weights) { w.createdAt ??= 0; registerConnection(downward, w); }
    if (new Set(weights.map(w => w.generation)).size !== weights.length) throw new Error('Duplicate connection generation');
    this.t = 0; this.started = false;
    this.entries = []; this.created = []; this.arrivals = [];
    this.windows = []; this.records = [];
  }

  validEntry(e) {
    return e && Number.isSafeInteger(e.generation) && e.generation > 0 && this.past.indices.has(e.A) && this.past.indices.has(e.B) && e.A !== e.B &&
      Number.isInteger(e.k) && e.k >= 1 && e.k <= 8 && strengthOK(e.strength) && strengthOK(e.activation) &&
      Number.isFinite(e.tOnset) && e.tOnset >= 0 && Number.isFinite(e.tArrive) &&
      e.tArrive === e.tOnset + centre(e.k) && e.ruleKey === key(e.A, e.k, e.B);
  }

  /** Entries keep their source A,k and ruleKey even when comparison uses a max. */
  push(entry) {
    if (!this.validEntry(entry) || entry.tOnset > this.t || entry.tArrive < this.t) {
      throw new Error('Invalid prediction');
    }
    const e = { ...entry };
    this.entries.push(e);
    return e;
  }

  /** Once per P7 window. Optional full P7 includes sub-lit strengths for comparison.
   * Comparisons finalize one window later, after the +1 window is observable.
   * created/arrivals describe this update; records retain finalized comparisons.
   */
  update(t, lit, p7 = lit) {
    this.past.checkTime(t);
    if (this.started && t <= this.t) throw new Error('Future updates must advance time');
    const real = new Map();
    for (const item of p7) {
      const id = item.id !== undefined ? item.id : this.past.ids[item.index];
      if (!this.past.indices.has(id) || !strengthOK(item.strength)) throw new Error('Invalid P7 strength');
      real.set(id, Math.max(real.get(id) ?? 0, item.strength));
    }
    this.past.update(t, lit);
    const onsets = this.past.entries.filter(e => e.tOnset === t);
    this.t = t; this.started = true; this.created = [];
    for (const w of this.downward.weights) registerConnection(this.downward, w);
    for (const onset of onsets) for (const w of this.downward.weights) {
      if (w.A !== onset.id || w.A === w.B) continue;
      this.created.push(this.push({ A: w.A, B: w.B, k: w.k, ruleKey: w.ruleKey,
        strength: onset.strength * w.W / DOWNWARD.wMax, activation: onset.strength,
        tOnset: t, tArrive: t + centre(w.k), createdAt: w.createdAt, generation: w.generation }));
    }
    this.arrivals = this.entries.filter(e => e.tArrive - t < BOUNDARIES[0]);
    this.entries = this.entries.filter(e => e.tArrive - t >= BOUNDARIES[0]);
    this.windows.push({ t, real: [...real], onsets, arrivals: this.arrivals, done: false });
    for (const window of this.windows) {
      if (window.done || t < window.t + WINDOW_MS) continue;
      const adjacent = this.windows.filter(w => Math.abs(w.t - window.t) <= WINDOW_MS);
      const reality = B => Math.max(0, ...adjacent.flatMap(w => w.real.filter(([id]) => id === B).map(([, s]) => s)));
      const targets = new Set(window.arrivals.map(e => e.B));
      for (const B of targets) {
        const entries = window.arrivals.filter(e => e.B === B);
        this.records.push({ t: window.t, B, predStrength: Math.max(...entries.map(e => e.strength)),
          realStrength: reality(B), entries: entries.map(e => ({ ...e })) });
      }
      for (const onset of window.onsets) {
        if (adjacent.some(w => w.arrivals.some(e => e.B === onset.id))) continue;
        this.records.push({ t: window.t, B: onset.id, predStrength: 0,
          realStrength: reality(onset.id), entries: [] });
      }
      window.done = true;
    }
    this.windows = this.windows.filter(w => !w.done || w.t >= t - WINDOW_MS);
    return this;
  }

  /** Same bins as TimeUnroll, traversed toward now. Arrivals occupy col 0 for this update. */
  lines(t = this.t) {
    this.past.checkTime(t);
    const result = new Float64Array(this.past.ids.length * COLUMNS);
    for (const e of [...this.entries, ...(t === this.t ? this.arrivals : [])]) {
      const remaining = e.tArrive - t;
      if (remaining >= LIMIT) continue;
      let column = 0;
      while (column < BOUNDARIES.length && remaining >= BOUNDARIES[column]) column++;
      const line = this.past.indices.get(e.B) * COLUMNS + column;
      result[line] = Math.max(result[line], e.strength);
    }
    return result;
  }

  saveState() {
    return structuredClone({ schema: 2, past: this.past.saveState(), downward: this.downward,
      t: this.t, started: this.started, entries: this.entries, created: this.created,
      arrivals: this.arrivals, windows: this.windows, records: this.records });
  }

  loadState(state) {
    if (state?.schema !== 2) throw new Error('Unsupported future state: explicit legacy migration required');
    if (!Number.isSafeInteger(state.downward?.nextGeneration) || state.downward.nextGeneration < 1 ||
        !Array.isArray(state.downward.weights) || state.downward.weights.some(w =>
          !Number.isSafeInteger(w.generation) || w.generation < 1 || w.generation >= state.downward.nextGeneration)) {
      throw new Error('Invalid persisted connection generations');
    }
    const s = structuredClone(state), p = new TimeUnroll(this.past.ids).loadState(s.past);
    const f = new FutureSlices(p.ids, s.downward);
    if (s.t !== p.t || typeof s.started !== 'boolean' ||
        !['entries', 'created', 'arrivals'].every(name => Array.isArray(s[name]) && s[name].every(e =>
          f.validEntry(e) && e.tOnset <= s.t)) || !Array.isArray(s.windows) || !Array.isArray(s.records)) {
      throw new Error('Invalid future state');
    }
    this.past = p; this.downward = f.downward;
    for (const name of ['t', 'started', 'entries', 'created', 'arrivals', 'windows', 'records']) this[name] = s[name];
    return this;
  }
}
