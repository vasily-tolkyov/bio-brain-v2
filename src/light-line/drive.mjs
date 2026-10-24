/** Innate goal writer, called between readout windows. No reward input, learning,
 * preference trace, action labels, timers or planner. Only root ownership persists. */
import { bodyReading, relievingRules } from './interoception.mjs';

export class DriveGoals {
  constructor(goal, variables) {
    this.goal = goal;
    this.variables = variables;
    this.owned = null;
  }

  clear() {
    if (this.owned !== null) this.goal.goals.cancel(this.owned);
    this.goal.driveRequest = null;
    this.owned = null;
    this.goal.prune();
  }

  /** Explicit commands also transfer ownership when they name the same cell. */
  command(id, strength = 1) {
    this.clear();
    this.goal.goals.write(id, strength);
  }

  update(readings) {
    const g = this.goal;
    // Any caller root takes precedence until fulfilled or explicitly cancelled.
    const external = [...g.goals.entries.keys()].some(id =>
      id !== this.owned && !g.goals.parents.has(id));
    if (external) { this.clear(); return { source: 'external', written: null }; }
    const requests = bodyReading(this.variables, readings).filter(r => r.drive > 0);
    const ranked = requests.map(request => ({ request,
      best: relievingRules(g.future.downward, request, g.actionThreshold)[0] }));
    ranked.sort((a, b) => (b.best?.score ?? 0) - (a.best?.score ?? 0) ||
      b.request.drive - a.request.drive);
    const selected = ranked[0];
    const request = selected && { ...selected.request,
      id: selected.best?.rule.B ?? selected.request.id };
    if (!request) { this.clear(); return { source: null, written: null }; }
    if (this.owned !== request.id) this.clear();
    const changed = g.goals.entries.get(request.id) !== request.drive;
    this.owned = request.id;
    g.driveRequest = request;
    g.goals.write(request.id, request.drive);
    return { source: 'drive', request, best: ranked[0].best ?? null,
      written: changed ? { id: request.id, strength: request.drive } : null };
  }
}
