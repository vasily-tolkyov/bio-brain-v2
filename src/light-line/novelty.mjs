import { TimeUnroll } from './unroll.mjs';
import { WINDOW_MS, present, strengthOK, checkWindow } from './presence.mjs';

export const NOVELTY = Object.freeze({ toleranceMs: 500 });
export const effectiveNovelty = N => {
  if (![0, 1].includes(N)) throw new RangeError('Novelty must be binary');
  return N;
};

/** Only comparator transduction changes. Each contributor keeps its own
 * inclusive window, matched latch, strength, rule key and generation. Forecast
 * strength remains graded scheduler metadata; comparator R/P/N are bits. */
export class BinaryNovelty {
  constructor(ids) {
    this.ids = new TimeUnroll(ids).ids;
    this.pending = []; this.t = null;
  }

  step(t, now, created = []) {
    checkWindow(t, this.t, this.ids, now);
    if (created.some(e => !this.ids.includes(e.B) || !Number.isFinite(e.tArrive) ||
        e.tArrive < t || e.tArrive % WINDOW_MS || !strengthOK(e.strength))) {
      throw new Error('Invalid pending prediction');
    }
    this.pending = [...this.pending, ...created.map(e => ({ ...e, matched: 0 }))]
      .filter(e => t <= e.tArrive + NOVELTY.toleranceMs);
    const counts = this.ids.map((id, i) => {
      const entries = this.pending.filter(e => e.B === id && t >= e.tArrive - NOVELTY.toleranceMs);
      const reality = present(now[i]);
      for (const e of entries) e.matched = Math.max(e.matched, reality);
      const prediction = present(Math.max(0, ...entries.map(e => e.strength)));
      return { kind: 'novelty', id, t, reality, prediction, N: reality * (1 - prediction) };
    });
    this.t = t;
    return counts;
  }

  saveState() {
    return structuredClone({ schema: 'light-binary-novelty-v1', ids: this.ids, t: this.t, pending: this.pending });
  }
  loadState(state) {
    const s = structuredClone(state);
    if (s?.schema !== 'light-binary-novelty-v1' || JSON.stringify(s.ids) !== JSON.stringify(this.ids) ||
        !(s.t === null || (Number.isFinite(s.t) && s.t >= 0 && s.t % WINDOW_MS === 0)) ||
        !Array.isArray(s.pending) || s.pending.some(e => !this.ids.includes(e.B) ||
          !Number.isFinite(e.tArrive) || e.tArrive < 0 || e.tArrive % WINDOW_MS ||
          !strengthOK(e.strength) || ![0, 1].includes(e.matched))) throw new Error('Invalid binary novelty state');
    this.t = s.t; this.pending = s.pending;
    return this;
  }
}
