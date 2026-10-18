/** Onset bookkeeping, called once per readout window, outside the spiking loop. */
const COLUMNS = 9, EXPIRY_MS = 12800 * Math.SQRT2;
// Shared boundaries avoid gaps from separately rounding d/sqrt(2) and d*sqrt(2).
const BOUNDARIES = Array.from({ length: 8 }, (_, k) => 100 * 2 ** k / Math.SQRT2);
const strengthOK = x => Number.isFinite(x) && x >= 0 && x <= 1;

export class TimeUnroll {
  /** A count uses IDs 0..nAttr-1; an ordered ID array defines the row mapping. */
  constructor(nAttr) {
    if (!Array.isArray(nAttr) && (!Number.isInteger(nAttr) || nAttr < 0)) {
      throw new Error('Expected an attractor count or ID array');
    }
    this.ids = Array.isArray(nAttr) ? [...nAttr] : Array.from({ length: nAttr }, (_, i) => i);
    this.indices = new Map(this.ids.map((id, i) => [id, i]));
    if (this.indices.size !== this.ids.length || !this.ids.every(id =>
      typeof id === 'string' || Number.isFinite(id))) throw new Error('Invalid attractor IDs');
    this.t = 0;
    this.previous = new Set();
    this.entries = [];
  }

  checkTime(tMs) {
    if (!Number.isFinite(tMs) || tMs < this.t) throw new Error('Time must be finite and nondecreasing');
  }

  update(tMs, litList) {
    this.checkTime(tMs);
    const current = new Map();
    for (const item of litList) {
      const index = item.id !== undefined ? this.indices.get(item.id) : item.index;
      if (!Number.isInteger(index) || index < 0 || index >= this.ids.length ||
          !strengthOK(item.strength)) throw new Error('Invalid lit attractor or strength');
      const id = this.ids[index];
      current.set(id, Math.max(current.get(id) ?? 0, item.strength));
    }
    this.entries = this.entries.filter(e => tMs - e.tOnset < EXPIRY_MS);
    for (const [id, strength] of current) {
      if (!this.previous.has(id)) this.entries.push({ id, strength, tOnset: tMs });
    }
    this.previous = new Set(current.keys());
    this.t = tMs;
    return this;
  }

  lines(tMs) {
    this.checkTime(tMs);
    const result = new Float64Array(this.ids.length * COLUMNS);
    for (const { id, strength, tOnset } of this.entries) {
      const age = tMs - tOnset;
      if (age >= EXPIRY_MS) continue;
      let column = 0;
      while (column < BOUNDARIES.length && age >= BOUNDARIES[column]) column++;
      const line = this.indices.get(id) * COLUMNS + column;
      result[line] = Math.max(result[line], strength);
    }
    return result;
  }

  saveState() {
    return { ids: [...this.ids], t: this.t, previous: [...this.previous],
      entries: this.entries.map(e => ({ ...e })) };
  }

  loadState(state) {
    if (!Array.isArray(state?.ids) || state.ids.length !== this.ids.length ||
        state.ids.some((id, i) => id !== this.ids[i]) || !Number.isFinite(state.t) || state.t < 0 ||
        !Array.isArray(state.previous) || state.previous.some(id => !this.indices.has(id)) ||
        !Array.isArray(state.entries) || state.entries.some(e => !e || !this.indices.has(e.id) ||
          !strengthOK(e.strength) || !Number.isFinite(e.tOnset) || e.tOnset < 0 || e.tOnset > state.t)) {
      throw new Error('Invalid unroll state or ID mapping');
    }
    this.t = state.t;
    this.previous = new Set(state.previous);
    this.entries = state.entries.map(e => ({ ...e }));
    return this;
  }
}
