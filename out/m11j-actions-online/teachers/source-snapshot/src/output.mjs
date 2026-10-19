/** Learned motor attractors, existing lateral inhibition, and P7 argmax. */
import { teachGroups, groupInput, discardHistory } from './io.mjs';
import { WINDOW_MS } from './readout.mjs';

export const OUTPUT = Object.freeze({ thetaExec: 0.75 });

export function motorWinner(lit, mapping) {
  let winner = null;
  for (const item of lit) if (!winner || item.strength > winner.strength) winner = item;
  if (!winner) return { action: null, strength: 0 };
  const action = mapping.find(a => a.id === winner.id)?.feature;
  if (action === undefined) throw new Error('Unmapped motor attractor');
  return { action: winner.strength >= OUTPUT.thetaExec ? action : null, strength: winner.strength };
}

export class OutputLayer {
  constructor(actions, seed = 1) {
    if (!actions.length || new Set(actions).size !== actions.length ||
        actions.some(a => typeof a !== 'string' || !a.length)) throw new Error('Invalid actions');
    this.actions = [...actions];
    Object.assign(this, teachGroups(this.actions, seed));
    this.previous = null;
  }

  /** One 100 ms drive window; sustained winners send only their execution onset.
   * Ties use teacher/action order. Primitives are env action names (identity).
   */
  step(drive = new Float64Array(this.actions.length)) {
    if (!(drive instanceof Float64Array) || drive.length !== this.actions.length ||
        !drive.every(s => Number.isFinite(s) && s >= 0 && s <= 1)) throw new Error('Invalid motor drive');
    const start = this.layer.t;
    this.layer.run(WINDOW_MS, groupInput(this.actions,
      Object.fromEntries(this.actions.map((a, i) => [a, drive[i]]))), { learn: false });
    const winner = motorWinner(this.layer.readout(start), this.mapping);
    const action = winner.action === this.previous ? null : winner.action;
    this.previous = winner.action;
    discardHistory(this.layer);
    return { action, strength: winner.strength };
  }
}
