import { TimeUnroll } from './unroll.mjs';
import { WINDOW_MS, present, checkWindow } from './presence.mjs';

/** Goal-only bits, deliberately a different record type from novelty. */
export class GoalErrors {
  constructor(ids) { this.ids = new TimeUnroll(ids).ids; this.t = null; }
  stepGoals(t, now, goals) {
    checkWindow(t, this.t, this.ids, now, goals);
    this.t = t;
    return this.ids.map((id, i) => {
      const reality = present(now[i]), goal = present(goals[i]);
      return { kind: 'goal', id, t, reality, goal, M: goal * (1 - reality) };
    });
  }
  saveState() { return { schema: 'light-binary-goals-v1', ids: [...this.ids], t: this.t }; }
  loadState(s) {
    if (s?.schema !== 'light-binary-goals-v1' || JSON.stringify(s.ids) !== JSON.stringify(this.ids) ||
        !(s.t === null || (Number.isFinite(s.t) && s.t >= 0 && s.t % WINDOW_MS === 0))) {
      throw new Error('Invalid binary goal state');
    }
    this.t = s.t; return this;
  }
}
