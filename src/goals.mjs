/** Goal-M -> symmetric upward index -> M8 motors, once per P7 window. */
import { DOWNWARD } from './downward.mjs';
import { GoalRow } from './predict.mjs';
import { SpikingErrors } from './errors.mjs';
import { sat } from './three-factor.mjs';
import { actionId } from './io.mjs';

const clip = x => Math.max(0, Math.min(1, x));
export const GOALS = Object.freeze({ maxDepth: 3, gain: 3 }); // Includes the caller's root.

/** U is a view of the very same W objects, with no second weights or learning.
 * Prediction, subgoals and motor drive use the same fixed layer scale.
 */
export function upwardDrive(downward, actions, counts) {
  const drive = new Float64Array(actions.length);
  const indices = new Map(actions.map((a, i) => [actionId(a), i]));
  const errors = new Map(counts.map(c => [c.id, sat(c.effective)]));
  for (const w of downward.weights) {
    const i = indices.get(w.A);
    if (i !== undefined) drive[i] += (errors.get(w.B) ?? 0) * w.W / DOWNWARD.wMax;
  }
  return drive.map(x => clip(GOALS.gain * x));
}

export class GoalActions {
  constructor(future, actions, featureIds, seed = 1) {
    this.future = future;
    this.actions = [...actions];
    this.goals = new GoalRow(featureIds);
    this.errors = new SpikingErrors(featureIds, seed);
    this.counts = [];
    this.recursion = true;
    this.links = new Map(); // parent -> SUBGOAL; retain satisfaction until parent clears.
    this.written = [];
  }

  /** Removing a parent also removes its remaining descendants. Map insertion is
   * root-first, so cancellation cascades before any queued motor drive is used.
   */
  prune() {
    for (const [parent, link] of this.links) if (!this.goals.entries.has(parent)) {
      if (!link.satisfied) this.goals.cancel(link.id);
      this.links.delete(parent);
    }
  }

  expand(id, stack = [id]) {
    if (!this.goals.entries.has(id) || stack.length >= GOALS.maxDepth) return;
    const old = this.links.get(id);
    if (old) {
      if (!old.satisfied) this.expand(old.id, [...stack, old.id]);
      return;
    }
    const down = this.future.downward;
    const rules = down.weights.filter(w => w.B === id);
    const best = rules.filter(w => this.goals.ids.includes(w.A))
      .reduce((best, w) => !best || w.W > best.W ? w : best, null);
    if (!best || stack.includes(best.A) || this.goals.entries.has(best.A)) return;
    const strength = this.goals.entries.get(id) * best.W / DOWNWARD.wMax;
    const link = { kind: 'SUBGOAL', id: best.A, parent: id, strength,
      depth: stack.length + 1, satisfied: false };
    this.goals.write(best.A, strength);
    this.links.set(id, link); this.written.push({ ...link });
    this.expand(best.A, [...stack, best.A]);
  }

  observe(onsets) {
    for (const link of this.links.values()) if (onsets.some(e => e.id === link.id && e.strength > 0)) {
      link.satisfied = true;
    }
    this.goals.observe(onsets);
    this.prune();
  }

  /** Recheck caller cancellations before executing the previous window's drive. */
  motorDrive() {
    this.prune();
    return upwardDrive(this.future.downward, this.actions, this.counts.map(c =>
      ({ ...c, effective: this.goals.entries.has(c.id) ? c.effective : 0 })));
  }

  /** Reality onsets satisfy goals BEFORE computing next window's action drive.
   * M10c supervisor decision: hold motor drive while an outcome is pending.
   * Hold is graded by prediction strength, with no pending flag cutoff.
   * M5's pending predictions retain arrival tolerance after leaving future bins.
   * Before arrival, include future entries too: the outcome is already on its way.
   * Goal counts never reach ThreeFactor or the layer's STDP inputs.
   */
  step(t, onsets, pending = []) {
    this.written = [];
    this.observe(onsets);
    if (this.recursion) {
      const children = new Set([...this.links.values()].map(e => e.id));
      for (const id of [...this.goals.entries.keys()]) if (!children.has(id)) this.expand(id);
    }
    this.observe(onsets); // A newly requested precondition may be real in this window.
    const now = this.goals.ids.map(id => Math.max(0,
      ...onsets.filter(e => e.id === id).map(e => e.strength)));
    const counts = this.errors.stepGoals(t, now, this.goals.strengths());
    const predictions = [...this.future.entries, ...this.future.arrivals, ...pending];
    for (const c of counts) {
      c.pendingStrength = clip(Math.max(0, ...predictions.filter(e => e.B === c.id).map(e => e.strength)));
      // Cancellation/satisfaction also gates any residual synaptic spikes.
      c.effective = this.goals.entries.has(c.id) ? c.M * (1 - c.pendingStrength) : 0;
    }
    this.counts = counts;
    return { counts, drive: this.motorDrive(), written: this.written };
  }
}
