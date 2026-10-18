/** Frozen M9 loop, with the chain world and a matched no-recursion ablation. */
import assert from 'node:assert/strict';
import { chainEnv } from '../src/envs/actions.mjs';
import { actionId } from '../src/io.mjs';
import { advanceGoals, goalPipeline, calibrateGoals } from './m9-pipeline.mjs';
import { actionBlocks } from './m11e-action-blocks.mjs';

export const PROTOCOL = Object.freeze({ trials: 20, probeMs: 10000 });
const kinds = ['bell', 'light', 'none', 'bird', 'bell-ablated'];
const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const weights = p => JSON.stringify([
  ...[p.layer1, p.layer2, p.output.layer].flatMap(l => l.replicas.flatMap(r =>
    r.net.groups.map(g => ({ scale: [...g.scale], rho: g.stdp ? [...g.stdp.rho] : null })))),
  ...[p.errors, p.goal.errors].flatMap(e => e.net.groups.map(g => [...g.scale])), p.future.downward,
]);

export function probeChain(pipeline, baseline, seed, phases, endState, repeats = PROTOCOL.trials) {
  const downward = endState?.downward ?? pipeline.downward;
  const p = goalPipeline(pipeline, baseline, seed, downward), calibration = calibrateGoals(p);
  // M11a probes the continued store, including weak entries, and the
  // frozen calibrated comparator. Quiet boundary; probe clocks start afresh.
  if (endState) p.errors.net.loadState(endState.errors.net);
  const before = weights(p), trials = [];
  const id = feature => p.mapping.find(a => a.feature === feature).id;
  const actionRows = new Set(p.output.actions.map(actionId));
  for (let repeat = 0; repeat < repeats; repeat++) for (const kind of kinds) {
    // Matched bird schedule for every condition within each repeat.
    const env = chainEnv({ seed: seed + (repeat + 1) * 1000, count: 1 });
    const start = p.t, target = kind === 'none' ? null : id(kind === 'bell-ablated' ? 'bell' : kind);
    const trial = { repeat, kind, start, satisfiedAt: null, actions: [], copies: [], subgoals: [],
      goalSpikesAfterOnset: 0, postOnsetWindows: 0, actionsAfterSatisfaction: 0, windows: [] };
    p.goal.recursion = kind !== 'bell-ablated';
    if (target !== null) p.goal.goals.write(target);
    while (p.t < start + PROTOCOL.probeMs) {
      const r = advanceGoals(p, env), t = r.t - start;
      if (r.executed.action !== null) {
        trial.actions.push({ t, action: r.executed.action, strength: r.executed.strength });
        if (trial.satisfiedAt !== null) trial.actionsAfterSatisfaction++;
      }
      trial.copies.push(...r.onsets.filter(o => actionRows.has(o.id)).map(o =>
        ({ t: o.tOnset - start, action: o.id.slice('action:'.length) })));
      trial.subgoals.push(...r.goal.written.map(e => ({ ...e, t })));
      if (target !== null && trial.satisfiedAt === null && r.onsets.some(o => o.id === target)) {
        trial.satisfiedAt = t;
      }
      if (trial.satisfiedAt !== null) {
        trial.goalSpikesAfterOnset += r.goal.counts.find(c => c.id === target).M;
        trial.postOnsetWindows++;
      }
      trial.windows.push({ t, executed: r.executed, drive: [...r.appliedDrive],
        goals: [...p.goal.goals.entries], links: [...p.goal.links.values()].map(e => ({ ...e })),
        goalCounts: r.goal.counts, onsets: r.onsets, predictions: p.future.created,
        pending: p.errors.pending.map(e => ({ ...e })) });
    }
    // Measure natural completion BEFORE caller cleanup (especially for ablation).
    trial.stackAtEnd = [...p.goal.goals.entries]; trial.linksAtEnd = [...p.goal.links.values()];
    trial.stackEmpty = trial.stackAtEnd.length === 0 && trial.linksAtEnd.length === 0;
    if (target !== null) p.goal.goals.cancel(target);
    p.goal.motorDrive(); // Cascade cancellation before the next condition.
    assert.equal(p.goal.goals.entries.size, 0); assert.equal(p.goal.links.size, 0);
    assert.deepEqual(trial.copies, env.executed.map(({ t, action }) => ({ t, action })));
    assert.deepEqual(trial.actions.map(({ t, action }) => ({ t, action })), trial.copies);
    trials.push(trial);
    if (trials.length % 10 === 0) console.log(`  seed ${seed}: ${trials.length}/${repeats * kinds.length} chain probes`);
  }
  assert.equal(weights(p), before, 'Chain probes changed layer, motor, downward or comparator weights');
  const summaries = kinds.map(kind => {
    const subset = trials.filter(r => r.kind === kind), planned = ['bell', 'light'].includes(kind);
    const actions = subset.flatMap(r => r.actions);
    const spikes = subset.reduce((s, r) => s + r.goalSpikesAfterOnset, 0);
    const windows = subset.reduce((s, r) => s + r.postOnsetWindows, 0);
    return { kind, probes: subset.length,
      pressFirst: planned ? subset.filter(r => r.actions[0]?.action === 'press').length / subset.length : null,
      achieved: targetFraction(subset, r => r.satisfiedAt !== null),
      actions: actions.length, actionsPerProbe: actions.length / subset.length,
      actionsEach: subset.map(r => r.actions.length),
      extraActionsPerProbe: mean(subset.map(r => Math.max(0, r.actions.length - 1))),
      distractors: planned ? actions.filter(a => a.action !== 'press').length : actions.length,
      noActionFraction: targetFraction(subset, r => r.actions.length === 0),
      latencyMs: mean(subset.map(r => r.actions[0]?.t).filter(t => t !== undefined)),
      subgoalsWritten: subset.reduce((s, r) => s + r.subgoals.length, 0),
      subgoalsEach: subset.map(r => r.subgoals.length),
      stackEmptyFraction: targetFraction(subset, r => r.stackEmpty),
      goalSpikesAfterOnset: spikes, postOnsetWindows: windows,
      goalSpikesPerWindowAfterOnset: windows ? spikes / windows : 0,
      actionsAfterSatisfaction: subset.reduce((s, r) => s + r.actionsAfterSatisfaction, 0),
      copies: subset.reduce((s, r) => s + r.copies.length, 0) };
  });
  const falseActions = actionBlocks(trials, Math.min(10, repeats));
  const pass = falseActions.pass && summaries.every(s => ['bell', 'light'].includes(s.kind) ?
    s.pressFirst >= 0.9 && s.achieved >= 0.9 && s.actionsEach.every(n => n <= 2) &&
    s.stackEmptyFraction >= 0.9 &&
    (s.kind === 'bell' ? s.subgoalsWritten >= 0.9 * s.probes : s.goalSpikesPerWindowAfterOnset <= 0.1) :
    s.kind === 'bird' || s.actions === 0);
  return { seed, pass, falseActions, frozen: true, calibration, summaries, trials, downward: p.future.downward };
}

function targetFraction(subset, test) { return subset.filter(test).length / subset.length; }
