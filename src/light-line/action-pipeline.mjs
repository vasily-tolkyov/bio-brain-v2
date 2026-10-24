import { ObservedStream } from './observed-stream.mjs';
import { OutputLayer, actionId } from './output.mjs';
import { BodyInput } from './body-input.mjs';
import { ActionTemporal } from './action-temporal.mjs';
import { PredictionLearning } from './learning.mjs';
import { GoalActions } from './goals.mjs';
import { DriveGoals } from './drive.mjs';
import { sourceLabels } from './source-labels.mjs';

/** Execute -> sample environment -> decode B/copy -> learn -> drive -> clock.
 * Reward is deliberately absent from every optical and learning input. */
export class ActionPipeline {
  constructor(env, seed, { optics = null, downward, temporal = null, innate = true } = {}) {
    this.env = env; this.seed = seed; this.t = 0; this.innate = innate; this.partial = null;
    this.sensory = optics?.sensory.fork() ?? new ObservedStream(env.features, seed);
    this.output = new OutputLayer(env.actions, seed, optics?.motor.fork());
    this.body = env.interoception?.length ? new BodyInput(env.interoception, seed, optics?.body.map(s => s.fork())) : null;
    this.ids = [...env.features, ...env.actions.map(actionId), ...(this.body?.variables.flatMap(v => v.featureIds) ?? [])];
    this.mapping = this.ids.map(id => ({ id, feature: id }));
    this.labels = sourceLabels(env, this.mapping, this.body?.variables);
    this.learning = new PredictionLearning(this.ids, { sourceLabels: this.labels, ...(downward ? { downward: structuredClone(downward) } : {}) });
    if (temporal && JSON.stringify(temporal.past.ids) !== JSON.stringify(this.ids)) throw new Error('Temporal observation IDs differ');
    this.temporal = temporal ? temporal.frozenView() : new ActionTemporal(this.ids, seed);
    this.goals = new GoalActions(this.learning.future, env.actions.map(action => ({ action, id: actionId(action) })),
      this.ids.filter(id => !id.startsWith('action:')));
    this.drive = this.body ? new DriveGoals(this.goals, this.body.variables) : null;
    this.actions = []; this.copies = [];
  }
  get optics() { return { sensory: this.sensory, motor: this.output.stream, body: this.body?.streams ?? [] }; }
  freezeOptics() {
    for (const s of [this.sensory, this.output.stream, ...(this.body?.streams ?? [])]) s.freeze();
    return this;
  }
  freeze() { this.freezeOptics(); this.temporal.layer.freeze(); this.learning.freeze(); return this; }
  command(id, strength = 1) {
    if (this.drive) this.drive.command(id, strength); else this.goals.goals.write(id, strength);
  }
  beginWindow(drive = this.goals.motorDrive()) {
    if (this.partial) throw new Error('Finish the active pipeline window');
    const executed = this.output.step(drive);
    this.partial = { phase: 'sample', ticks: 0, executed, sensory: [], body: [], sensoryOptical: null };
    return this;
  }
  /** Explicit boundaries preserve the original execute/sample/decode/learn/drive
   * order, while allowing snapshots inside the 200-sample IO window. */
  advanceWindow() {
    const p = this.partial;
    if (!p) throw new Error('No active pipeline window');
    if (p.phase === 'sample') {
      const append = (rows, value) => {
        const previous = rows.at(-1);
        if (previous && JSON.stringify(previous.value) === JSON.stringify(value)) previous.durationMs += .5;
        else rows.push({ value: structuredClone(value), durationMs: .5 });
      };
      const sample = this.env.step(.5, p.ticks === 0 ? p.executed.action : null);
      append(p.sensory, this.env.features.map(f => sample.features?.[f] ?? 0));
      if (this.body) append(p.body, sample.interoception);
      p.ticks++;
      if (p.ticks === 200) {
        this.sensory.beginWindow(p.sensory.map(s => ({ values: s.value, durationMs: s.durationMs })));
        p.phase = 'sensory';
      }
      return null;
    }
    if (p.phase === 'sensory') {
      p.sensoryOptical = this.sensory.advanceSegment();
      if (p.sensoryOptical) p.phase = 'upper';
      return null;
    }
    const { executed, body, sensoryOptical } = p;
    const bodyResult = this.body?.window(body.map(s => ({ readings: s.value, durationMs: s.durationMs })), this.t);
    const copy = executed.action === null ? [] : [{ id: actionId(executed.action), strength: executed.strength }];
    if (executed.action !== null) {
      this.actions.push({ t: this.t, action: executed.action, strength: executed.strength });
      this.copies.push({ t: this.t, ...copy[0] });
    }
    const observations = [...sensoryOptical.readout, ...(bodyResult?.observations ?? []), ...copy];
    const temporal = this.temporal.observe(this.t, observations);
    const learning = this.learning.step(this.t, observations);
    // Fulfilled external roots clear before the innate writer examines ownership.
    this.goals.observe(learning.onsets);
    const driveResult = this.innate && this.drive ? this.drive.update(this.body.readings) : null;
    const goal = this.goals.step(this.t, learning.onsets, this.learning.novelty.pending);
    const result = { t: this.t, executed, copy, sensory: sensoryOptical, body: bodyResult,
      observations, temporal, learning: structuredClone(learning), drive: driveResult, goal };
    this.t += 100; this.partial = null;
    return result;
  }
  step(drive) {
    if (!this.partial) this.beginWindow(drive);
    else if (drive !== undefined) throw new Error('Drive already committed for active window');
    let result; while (!(result = this.advanceWindow())) {}
    return result;
  }
}
