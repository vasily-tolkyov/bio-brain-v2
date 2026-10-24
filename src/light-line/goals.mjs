/** Binary goal deficit -> same-rule reverse index -> action drive, once per P7 window. */
import { DOWNWARD } from './downward.mjs';
import { GoalRow } from './predict.mjs';
import { GoalErrors } from './goal-errors.mjs';
import { present } from './presence.mjs';
import { reverseLookup } from './reverse-chain.mjs';
import { sat } from './three-factor.mjs';

const clip = x => Math.max(0, Math.min(1, x));
// Confirmed per-edge action gate (2026-10-20); unchanged from M11j.
export const GOALS = Object.freeze({ maxDepth: 3, gain: 3, actionThreshold: 0.3 });
const checkedThreshold = threshold => {
  if (threshold !== GOALS.actionThreshold) throw new Error('L5 action rule threshold is fixed at .3');
  return threshold;
};
const eligible = (w, threshold) => w.W / DOWNWARD.wMax >= threshold;

/** U is a view of the very same W objects, with no second weights or learning.
 * Prediction, subgoals and motor drive use the same fixed layer scale.
 */
export function upwardDrive(downward, actions, counts, actionThreshold = GOALS.actionThreshold) {
  checkedThreshold(actionThreshold);
  const drive = new Float64Array(actions.length);
  const indices = new Map(actions.map((a, i) => [a.id, i]));
  const errors = new Map(counts.map(c => [c.id, sat(c.effective)]));
  for (const w of downward.weights) {
    if (!eligible(w, actionThreshold)) continue; // Filter each edge BEFORE pooling.
    const i = indices.get(w.A);
    if (i !== undefined) drive[i] += (errors.get(w.B) ?? 0) * w.W / DOWNWARD.wMax;
  }
  return drive.map(x => clip(GOALS.gain * x));
}

export class GoalActions {
  constructor(future, actions, featureIds, seed = 1, { actionThreshold = GOALS.actionThreshold } = {}) {
    this.future = future;
    if (!Array.isArray(actions) || new Set(actions.map(a => a.id)).size !== actions.length ||
        actions.some(a => !future.past.indices.has(a.id) || typeof a.action !== 'string')) {
      throw new Error('Actions require observed attractor IDs and action names');
    }
    this.actions = actions.map(a => ({ ...a }));
    this.actionThreshold = checkedThreshold(actionThreshold);
    this.goals = new GoalRow(featureIds);
    this.errors = new GoalErrors(featureIds, seed);
    this.counts = [];
    this.recursion = true;
    this.links = new Map(); // parent -> SUBGOAL; retain satisfaction until parent clears.
    this.written = [];
  }

  /** Live references: goal ID and predicted outcome ID are exactly the same. */
  rulesFor(id) { return reverseLookup(this.future.downward, id, this.actionThreshold); }

  /** Removing a parent also removes its remaining descendants. Map insertion is
   * root-first, so cancellation cascades before any queued motor drive is used.
   */
  prune() {
    for (const [parent, link] of this.links) {
      const source = this.future.downward.weights.find(w => w.ruleKey === link.ruleKey &&
        w.generation === link.generation && w.createdAt === link.createdAt && eligible(w, this.actionThreshold));
      if (!this.goals.entries.has(parent) || !source) {
        // Explicitly rewritten root goals no longer belong to this path.
        if (this.goals.parents.get(link.id) === parent) this.goals.cancel(link.id);
        this.links.delete(parent);
      }
    }
  }

  expand(id, stack = [id]) {
    this.prune();
    if (!this.goals.entries.has(id) || stack.length >= GOALS.maxDepth) return;
    const old = this.links.get(id);
    if (old) {
      if (!old.satisfied) this.expand(old.id, [...stack, old.id]);
      return;
    }
    const rules = this.rulesFor(id);
    const best = rules.filter(w => this.goals.ids.includes(w.A))
      .reduce((best, w) => !best || w.W > best.W ? w : best, null);
    if (!best || stack.includes(best.A) || this.goals.entries.has(best.A)) return;
    const strength = this.goals.entries.get(id) * best.W / DOWNWARD.wMax;
    const link = { kind: 'SUBGOAL', id: best.A, parent: id, strength,
      depth: stack.length + 1, satisfied: false, ruleKey: best.ruleKey, generation: best.generation, createdAt: best.createdAt };
    this.goals.write(best.A, strength, id);
    this.links.set(id, link); this.written.push({ ...link });
    this.expand(best.A, [...stack, best.A]);
  }

  observe(onsets) {
    for (const link of this.links.values()) if (onsets.some(e => e.id === link.id && present(e.strength))) {
      link.satisfied = true;
    }
    this.goals.observe(onsets);
    this.prune();
  }

  /** Recheck caller cancellations before executing the previous window's drive. */
  motorDrive() {
    this.prune();
    let downward = this.future.downward;
    return upwardDrive(downward, this.actions, this.counts.map(c =>
      ({ ...c, effective: this.goals.entries.has(c.id) ? c.effective : 0 })), this.actionThreshold);
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
      // Cancellation/satisfaction also gates previously computed drive.
      c.effective = this.goals.entries.has(c.id) ? c.M * (1 - c.pendingStrength) : 0;
    }
    this.counts = counts;
    return { counts, drive: this.motorDrive(), written: this.written };
  }

  saveState() {
    return structuredClone({ schema: 'light-goal-actions-v1', actions: this.actions,
      ids: this.goals.ids, entries: [...this.goals.entries], parents: [...this.goals.parents],
      actionThreshold: this.actionThreshold, errors: this.errors.saveState(), counts: this.counts,
      recursion: this.recursion, links: [...this.links], written: this.written });
  }

  loadState(state) {
    const s = structuredClone(state);
    if (s?.schema !== 'light-goal-actions-v1' || JSON.stringify(s.ids) !== JSON.stringify(this.goals.ids) ||
        JSON.stringify(s.actions) !== JSON.stringify(this.actions) || s.actionThreshold !== this.actionThreshold ||
        typeof s.recursion !== 'boolean' || !Array.isArray(s.entries) || !Array.isArray(s.parents) ||
        !Array.isArray(s.links) || !Array.isArray(s.counts) || !Array.isArray(s.written)) {
      throw new Error('Invalid goal actions state');
    }
    const row = new GoalRow(s.ids);
    for (const [id, strength] of s.entries) row.write(id, strength);
    for (const [id, parent] of s.parents) {
      if (!row.entries.has(id) || !s.ids.includes(parent) || id === parent) throw new Error('Invalid goal parent');
      row.parents.set(id, parent);
    }
    for (const [parent, link] of s.links) {
      if (!s.ids.includes(parent) || !s.ids.includes(link.id) || link.parent !== parent ||
          !Number.isInteger(link.depth) || link.depth < 2 || link.depth > GOALS.maxDepth ||
          !Number.isSafeInteger(link.generation) || typeof link.satisfied !== 'boolean') throw new Error('Invalid goal link');
    }
    if (s.counts.some(c => c.kind !== 'goal' || !s.ids.includes(c.id) || ![0, 1].includes(c.M) ||
        !Number.isFinite(c.effective) || c.effective < 0 || c.effective > 1)) throw new Error('Invalid goal counts');
    const errors = new GoalErrors(s.ids).loadState(s.errors);
    this.goals = row; this.errors = errors; this.counts = s.counts; this.recursion = s.recursion;
    this.links = new Map(s.links); this.written = s.written;
    return this;
  }
}
