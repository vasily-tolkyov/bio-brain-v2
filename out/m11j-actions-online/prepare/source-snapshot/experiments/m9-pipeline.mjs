/** Frozen M9 closed loop. No goals or rehearsed actions enter the sensory/past path. */
import { FutureSlices } from '../src/predict.mjs';
import { GoalActions } from '../src/goals.mjs';
import { SpikingNovelty } from '../src/novelty.mjs';
import { ThreeFactor } from '../src/three-factor.mjs';
import { actionId, presentWindow, discardHistory, checkEnv } from '../src/io.mjs';
import { WINDOW_MS, LIT_THRESHOLD } from '../src/readout.mjs';

export const GOAL_CALIBRATION = Object.freeze({ trials: 24, leadMs: 500, restMs: 5000 });

/** Label-independent comparator calibration, before probes. Equal paired
 * afferents for every feature; no environment, action rules or layer learning.
 * Only this phase enables the new comparator's existing afferent-gated iSTDP.
 */
export function calibrateGoals(p) {
  const { trials, leadMs, restMs } = GOAL_CALIBRATION, history = [];
  const vector = x => p.goal.goals.ids.map(() => x);
  for (let trial = 0; trial < trials; trial++) {
    for (let elapsed = 0; elapsed < leadMs + WINDOW_MS + restMs; elapsed += WINDOW_MS) {
      const counts = p.goal.errors.stepGoals(p.t, vector(Number(elapsed === leadMs)),
        vector(Number(elapsed <= leadMs)), { learn: true });
      if (elapsed === leadMs) history.push(counts.map(c => c.M));
      p.t += WINDOW_MS;
    }
  }
  return { ...GOAL_CALIBRATION, matchedSpikes: history };
}

export function goalPipeline(pipeline, baseline, seed, downward, goalOptions) {
  const { layer1, layer2, output, mapping } = pipeline;
  const ids = mapping.map(a => a.id), featureIds = pipeline.teacher.mapping.map(a => a.id);
  const future = new FutureSlices(ids, downward ?? pipeline.downward);
  const goal = new GoalActions(future, output.actions, featureIds, seed, goalOptions);
  return { layer1, layer2, output, mapping, future, goal, t: 0,
    errors: new SpikingNovelty(ids, seed), factor: new ThreeFactor(future) };
}

/** One causal window: last readout's drive executes, efference predicts, reality
 * satisfies goals, and goal-M selects the next drive. Weak output writes nothing
 * imagined in M9 (the supervisor's simplest rehearsal choice).
 */
export function advanceGoals(p, env) {
  checkEnv(env);
  const t = p.t, appliedDrive = p.goal.motorDrive(), executed = p.output.step(appliedDrive), start = p.layer1.t;
  presentWindow(p.layer1, env, WINDOW_MS, { learn: false }, executed.action);
  const p7 = p.layer1.readout(start, { litThreshold: 0 });
  const copy = executed.action === null ? [] : [{ id: actionId(executed.action), strength: executed.strength }];
  p.future.update(t, [...p7.filter(a => a.strength > LIT_THRESHOLD), ...copy], [...p7, ...copy]);
  const lines = p.future.past.lines(t), onsets = p.future.past.entries.filter(e => e.tOnset === t);
  const counts = p.errors.step(t, p.future.past.ids.map((_, i) => lines[i * 9]), p.future.created);
  p.factor.step(t, counts, p.errors.pending, { learn: false });
  const goal = p.goal.step(t, onsets, p.errors.pending);
  discardHistory(p.layer1); p.t += WINDOW_MS;
  return { t, executed, appliedDrive, onsets, counts, goal };
}
