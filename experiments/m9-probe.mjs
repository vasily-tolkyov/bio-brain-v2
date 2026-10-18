/** Sixty 8-second probes per seed, with continuous frozen neural dynamics. */
import assert from 'node:assert/strict';
import { actionsEnv } from '../src/envs/actions.mjs';
import { actionId } from '../src/io.mjs';
import { advanceGoals, goalPipeline, calibrateGoals } from './m9-pipeline.mjs';

export const PROTOCOL = Object.freeze({ goalTrials: 20, controlTrials: 10, probeMs: 8000 });
const mean = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const weights = p => JSON.stringify([
  ...[p.layer1, p.layer2, p.output.layer].flatMap(l => l.replicas.flatMap(r =>
    r.net.groups.map(g => ({ scale: [...g.scale], rho: g.stdp ? [...g.stdp.rho] : null })))),
  ...[p.errors, p.goal.errors].flatMap(e => e.net.groups.map(g => [...g.scale])), p.future.downward,
]);

export function probeGoals(pipeline, baseline, seed) {
  const p = goalPipeline(pipeline, baseline, seed), calibration = calibrateGoals(p);
  const before = weights(p), trials = [];
  const id = feature => p.mapping.find(a => a.feature === feature).id;
  const actionRows = new Set(p.output.actions.map(actionId));
  const kinds = Array.from({ length: PROTOCOL.goalTrials }, (_, i) =>
    ['light', 'bell', ...(i < PROTOCOL.controlTrials ? ['none', 'bird'] : [])]).flat();
  for (const [index, kind] of kinds.entries()) {
    // Independent bird onset per probe, same env interface and causal action rules.
    const env = actionsEnv({ seed: seed + (index + 1) * 1000, count: 1 });
    const start = p.t, target = kind === 'none' ? null : id(kind);
    const trial = { index, kind, start, satisfiedAt: null, actions: [], copies: [],
      goalSpikesAfterOnset: 0, goalSpikesAfterOnsetWindow: 0, postOnsetWindows: 0,
      actionsAfterSatisfaction: 0, windows: [] };
    if (target !== null) p.goal.goals.write(target);
    while (p.t < start + PROTOCOL.probeMs) {
      const r = advanceGoals(p, env), t = r.t - start;
      if (r.executed.action !== null) {
        trial.actions.push({ t, action: r.executed.action, strength: r.executed.strength });
        if (trial.satisfiedAt !== null) trial.actionsAfterSatisfaction++;
      }
      trial.copies.push(...r.onsets.filter(o => actionRows.has(o.id)).map(o =>
        ({ t: o.tOnset - start, action: o.id.slice('action:'.length) })));
      if (target !== null && trial.satisfiedAt === null && r.onsets.some(o => o.id === target)) {
        trial.satisfiedAt = t;
      }
      const c = r.goal.counts.find(c => c.id === target);
      if (trial.satisfiedAt !== null) {
        trial.goalSpikesAfterOnset += c.M; trial.postOnsetWindows++;
        if (t > trial.satisfiedAt) trial.goalSpikesAfterOnsetWindow += c.M;
      }
      trial.windows.push({ t, executed: r.executed, drive: [...r.appliedDrive],
        goals: [...p.goal.goals.entries], goalCounts: r.goal.counts,
        onsets: r.onsets, predictions: p.future.created });
    }
    // The caller cancels an unresolved goal at the end of its probe.
    if (target !== null) p.goal.goals.cancel(target);
    trial.latencyMs = trial.actions[0]?.t ?? null;
    assert.deepEqual(trial.copies, env.executed.map(({ t, action }) => ({ t, action })));
    assert.deepEqual(trial.actions.map(({ t, action }) => ({ t, action })), trial.copies);
    trials.push(trial);
    if ((index + 1) % 10 === 0) console.log(`  seed ${seed}: ${index + 1}/${kinds.length} goal probes`);
  }
  assert.equal(weights(p), before, 'M9 probes changed layer, motor, downward or iSTDP weights');
  const summaries = ['light', 'bell', 'none', 'bird'].map(kind => {
    const subset = trials.filter(r => r.kind === kind), expected = { light: 'press', bell: 'wave' }[kind];
    const actions = subset.flatMap(r => r.actions);
    const postOnsetWindows = subset.reduce((s, r) => s + r.postOnsetWindows, 0);
    const goalSpikesAfterOnset = subset.reduce((s, r) => s + r.goalSpikesAfterOnset, 0);
    const distractors = expected ? actions.filter(a => a.action !== expected).length : actions.length;
    return { kind, probes: subset.length,
      correctFirst: expected ? subset.filter(r => r.actions[0]?.action === expected).length / subset.length : null,
      distractors, distractorProbeFraction: subset.filter(r => r.actions.some(a =>
        expected ? a.action !== expected : true)).length / subset.length,
      latencyMs: mean(subset.map(r => r.latencyMs).filter(t => t !== null)),
      actions: actions.length, actionsPerProbe: actions.length / subset.length,
      minActions: Math.min(...subset.map(r => r.actions.length)), maxActions: Math.max(...subset.map(r => r.actions.length)),
      satisfied: subset.filter(r => r.satisfiedAt !== null).length,
      goalSpikesAfterOnset, postOnsetWindows,
      goalSpikesAfterOnsetWindow: subset.reduce((s, r) => s + r.goalSpikesAfterOnsetWindow, 0),
      goalSpikesPerWindowAfterOnset: postOnsetWindows ? goalSpikesAfterOnset / postOnsetWindows : 0,
      actionsAfterSatisfaction: subset.reduce((s, r) => s + r.actionsAfterSatisfaction, 0),
      copies: subset.reduce((s, r) => s + r.copies.length, 0) };
  });
  // ≈0 means <= 0.1 population spikes/window, including the observed onset window.
  const pass = summaries.every(s => ['light', 'bell'].includes(s.kind) ?
    s.correctFirst >= 0.9 && s.distractors === 0 &&
    s.maxActions <= 2 && s.satisfied / s.probes >= 0.9 &&
    s.goalSpikesPerWindowAfterOnset <= 0.1 && s.actionsAfterSatisfaction === 0 :
    s.actions === 0);
  return { seed, pass, frozen: true, calibration, summaries, trials, downward: p.future.downward,
    actionCopies: trials.reduce((s, t) => s + t.copies.length, 0) };
}
