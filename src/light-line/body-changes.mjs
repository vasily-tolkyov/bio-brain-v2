/** Innate change cells. P7 bin activity refreshes a short feature trace; compare
 * a newly lit bin with the last active bin, on the same TimeUnroll clock. */
import { NOVELTY } from './novelty.mjs';
import { trace } from './three-factor.mjs';
import { changeId } from './interoception.mjs';

// Same 500 ms horizon as arrival credit; exponential decay uses existing tauE.
export const BODY_TRACE_MS = NOVELTY.toleranceMs;

export class BodyChanges {
  constructor(variables) {
    this.variables = variables;
    this.previous = [];
    this.traces = variables.map(() => null);
    this.t = null;
    this.events = [];
    this.rejected = [];
  }

  update(t, lit) {
    if (!Number.isFinite(t) || t < 0 || (this.t !== null && t <= this.t)) {
      throw new Error('Invalid body trace clock');
    }
    const current = new Map(lit.map(c => [c.id, c.strength])), changes = [];
    for (const v of this.variables) {
      const old = this.traces[v.index];
      const onset = v.ids.filter(id => current.has(id) && !this.previous.includes(id))
        .sort((a, b) => current.get(b) - current.get(a))[0];
      if (onset !== undefined && (!old || old.bin !== v.ids.indexOf(onset))) {
        const bin = v.ids.indexOf(onset);
        if (old) {
          const age = t - old.t, available = age <= BODY_TRACE_MS;
          const direction = Math.sign(bin - old.bin);
          const magnitude = Math.min(v.maxChange, Math.abs(bin - old.bin));
          const id = changeId(v.index, direction, magnitude);
          const strength = available ? Math.min(current.get(onset), trace(old.strength, 0, age)) : 0;
          const evidence = { t, variable: v.index, from: old.bin, to: bin, age,
            magnitude, id, strength, onsetId: onset, onsetStrength: current.get(onset),
            trace: { ...old }, missingTrace: !available };
          if (available) { this.events.push(evidence); changes.push({ id, strength }); }
          else this.rejected.push(evidence);
        }
        this.traces[v.index] = { bin, t, strength: current.get(onset) };
      } else if (old && current.has(v.ids[old.bin])) {
        this.traces[v.index] = { ...old, t, strength: current.get(v.ids[old.bin]) };
      }
    }
    this.previous = [...current.keys()]; this.t = t;
    return changes;
  }

  saveState() {
    return structuredClone({ previous: this.previous, traces: this.traces, t: this.t, events: this.events, rejected: this.rejected });
  }

  loadState(state) { Object.assign(this, structuredClone(state)); }
}
