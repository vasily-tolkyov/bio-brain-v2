/** Seed-7 evidence only; none of these measurements feed the learner. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { teacherSchedule } from './m11a-runtime.mjs';
import { ACTIONS, ACTION_WORLD } from '../src/envs/actions.mjs';
import { regression, mean } from './m11e-measure.mjs';
import { actionBlocks } from './m11e-action-blocks.mjs';
import { slope } from './m11a-measure.mjs';
import { DOWNWARD, newConnection, strengthenDownward } from '../src/downward.mjs';
import { trace, sat } from '../src/three-factor.mjs';
import { GOALS } from '../src/goals.mjs';
const dir = 'out/m11e-pilot-b/', read = name => JSON.parse(readFileSync(`${dir}${name}.json`));
const write = (name, data) => writeFileSync(`${dir}${name}.json`, JSON.stringify(data));
const f = x => Number(x).toFixed(6), paragraphs = [];
const summary = read('summary'), causal = read('causal'), shuffled = read('shuffled'), actions = read('actions');
const calibration = read('calibration'), goals = read('goals'), prior = read('prior-b55');
const key = (A, k, B) => JSON.stringify([A, k, B]);
const state = read('natural-state'), id = name => state.mapping.find(a => a.feature === name).id;
const names = new Map(state.mapping.map(a => [a.id, a.feature]));
const label = ruleKey => { const [A, k, B] = JSON.parse(ruleKey); return `${names.get(A)}→${names.get(B)}@${k}`; };
const lifecycles = [causal, shuffled, actions].map((data, i) => {
  assert.ok(data.final.weights.every(w => w.W > 0));
  assert.equal(new Set(data.final.weights.map(w => w.ruleKey)).size, data.final.weights.length);
  for (const h of data.history) {
    const alive = data.episodes.filter(e => e.t < h.t && (!e.death || e.death.t >= h.t));
    assert.equal(alive.length, h.live.total);
    assert.equal(alive.filter(e => e.causal).length, h.live.causal);
    assert.equal(h.u.filter(u => u > 0).length, h.live.total);
    assert.equal(h.live.causal + h.live.noncausal, h.live.total);
  }
  return { name: ['causal', 'shuffled', 'actions'][i], creations: data.episodes.length,
    deaths: data.episodes.filter(e => e.death).length, finalLive: data.final.weights.length, pass: true };
});
const schedules = [
  ...teacherSchedule(7, ACTIONS, 0, 30),
  ...[...teacherSchedule(7, ACTIONS, 30, 60)].map(([t, action]) => [t + 60 * ACTION_WORLD.slotMs, action]),
].map(([t, action]) => ({ t, action: `action:${action}`, trial: Math.floor(t / ACTION_WORLD.slotMs) + 1 }));
const actionKeys = [key('action:idle', 6, 'action:wave'), key('action:idle', 4, 'action:press'),
  key('action:wave', 5, 'action:press')];
const actionPairs = actionKeys.map(ruleKey => {
  const [A, k, B] = JSON.parse(ruleKey), centre = 100 * 2 ** (k - 1);
  const episodes = actions.episodes.filter(e => e.ruleKey === ruleKey).map(e => {
    const pre = schedules.find(a => a.trial === e.trial && a.action === A);
    const post = schedules.find(a => a.trial === e.trial && a.action === B);
    return { ...e, pre: pre?.t, post: post?.t, delay: pre && post ? post.t - pre.t : null,
      activeCause: !!pre && e.t - pre.t >= centre / Math.SQRT2 && e.t - pre.t < centre * Math.SQRT2,
      exactPostBirth: post?.t === e.t, seconds: e.death ? (e.death.t - e.t) / 1000 : null };
  });
  const dead = episodes.filter(e => e.death), lifetimes = dead.map(e => e.seconds);
  const finalU = actions.history.at(-1).u[actions.keys.indexOf(ruleKey)];
  return { ruleKey, episodes, finalU, completed: dead.length, living: episodes.length - dead.length,
    livingAgesSeconds: episodes.filter(e => !e.death).map(e => (actions.history.at(-1).t - e.t) / 1000),
    meanSeconds: mean(lifetimes), maxSeconds: Math.max(0, ...lifetimes),
    exactPostBirths: episodes.filter(e => e.exactPostBirth && e.activeCause).length,
    finalDeath: dead.at(-1)?.death ?? null };
});
paragraphs.push('**(i) Discrete teacher actions.** idle is one command per T1/natural trial, like press and wave; it is not a tonic context input. T2 contains no actions. The unmodified schedule produces 30 T1 and 60 natural commands of each action. Birth timestamps were joined to that schedule and checked against the active past column. Detailed pairs and every episode are in [diagnosis.json](../out/m11e-pilot-b/diagnosis.json).');
for (const r of actionPairs) paragraphs.push(`${label(r.ruleKey)}: ${r.episodes.length} episodes; ${r.exactPostBirths} births exactly on the teacher post action with the within-trial pre action still in the matching past column. Completed lifetime mean/max ${f(r.meanSeconds)}/${f(r.maxSeconds)} s; ${r.living} episodes remain alive${r.living ? ` (censored ages ${r.livingAgesSeconds.map(f).join(', ')} s)` : ''}; final u=${f(r.finalU)}. Last recorded death: ${r.finalDeath ? `trial ${r.finalDeath.trial}, t=${r.finalDeath.t / 1000} s` : 'none'}. Other births, including N tails/noise rather than exact post coincidences, remain explicitly listed.`);
paragraphs.push('These lifetimes include the 1020 s action-silent T2 phase. An action→action connection surviving T1 receives no new action-driven predictions or M deadlines during T2; M-only weakening therefore need not delete it until its cause is executed again. This is not an age-based retention or probation mechanism.');
const trueRules = actions.trueRules.map(r => ({ ...r, name: label(r.ruleKey),
  episodes: actions.episodes.filter(e => e.ruleKey === r.ruleKey) }));
paragraphs.push(`**(ii) Direct versus transitive rules.** ${trueRules.map(r => `${r.name} final u=${f(r.finalU)} (${r.episodes.length} birth episodes)`).join('; ')}. The direct slots predict 3.2 s and 0.8 s, covering the world’s 3 s and 1 s delays. press→bell@6 predicts 3.2 s but reality arrives at 4 s, outside the unchanged ±0.5 s window. Its repeated N births and M deletions are therefore expected; no deadline or tolerance was changed.`);
const bell = goals.summaries.find(g => g.kind === 'bell');
const bellTrials = goals.trials.filter(t => t.kind === 'bell');
const bellPresses = bellTrials.map(t => t.actions.filter(a => a.action === 'press').length);
const pressLight = key('action:press', 6, id('light'));
const consumed = [[pressLight, id('light')], [key(id('light'), 4, id('bell')), id('bell')]]
  .map(([ruleKey, target]) => ({ ruleKey, probes: bellTrials.length,
    matched: bellTrials.filter(trial => trial.windows.some(w =>
      w.onsets.some(o => o.id === target) && w.pending.some(e =>
        e.ruleKey === ruleKey && e.matched > 0 && e.remaining === 0))).length }));
const goalEvidence = bellTrials.map(trial => {
  const first = trial.actions.find(a => a.action === 'press');
  const light = trial.windows.find(w => w.onsets.some(o => o.id === id('light')))?.t;
  const held = trial.windows.filter(w => first && w.t >= first.t && (light === undefined || w.t < light))
    .map(w => w.goalCounts.find(c => c.id === id('light')));
  return { repeat: trial.repeat, actions: trial.actions, satisfiedAt: trial.satisfiedAt,
    lightAt: light, minPendingBeforeLight: held.length ? Math.min(...held.map(c => c.pendingStrength)) : null,
    maxEffectiveBeforeLight: held.length ? Math.max(...held.map(c => c.effective)) : null,
    extraActionWindows: trial.actions.slice(1).map(a => ({ action: a,
      previous: trial.windows.find(w => w.t === a.t - 100), current: trial.windows.find(w => w.t === a.t) })),
    truePredictionMatches: trial.windows.filter(w => w.onsets.some(o => o.id === id('light'))).map(w =>
      ({ t: w.t, entries: w.pending.filter(e => e.ruleKey === pressLight) })) };
});
paragraphs.push(`**(iii) Bell goals.** Presses per probe: ${bellPresses.join(', ')}; mean ${f(mean(bellPresses))} versus pilot-a 4.8. Total actions per probe: ${bell.actionsEach.join(', ')}; the unchanged every-probe ≤2 action bound is ${bell.actionsEach.every(n => n <= 2) ? 'PASS' : 'FAIL'}. Goal gain, U, pending suppression, comparator consumption, and output execution threshold were unchanged. The old first probe pressed at 0.1/1.3/2.3 s: pending light strength stayed 0.453215, leaving effective light-M 52.764736 before the second press and motor drive 0.469620. This is incomplete graded pending suppression with a weak direct connection. The new direct weight and full pending/consumption records are in goals.json and diagnosis.json; no wrong-prediction consumption fix was inserted.`);
paragraphs.push(`New bell probes: minimum pending strength while waiting for light ranges ${f(Math.min(...goalEvidence.map(g => g.minPendingBeforeLight))) }–${f(Math.max(...goalEvidence.map(g => g.minPendingBeforeLight)))}. ${bell.actionsEach.every(n => n <= 2) ? 'The unchanged action bound passes with the new learned chain strengths.' : 'The unchanged action bound FAILS. Extra-action windows, competing predictions and preceding goal-M/drive are retained for supervisor review; no mechanism change was made.'}`);
paragraphs.push(`Correct direct predictions fully consumed at their matched onsets: ${consumed.map(r => `${label(r.ruleKey)} ${r.matched}/${r.probes} bell probes`).join('; ')}. Per-onset entries and remaining drives are preserved in the raw windows.`);
const endpointBell = Array.from({ length: 10 }, (_, i) => {
  const g = read(`block-${i + 1}-goals`), trials = g.trials.filter(t => t.kind === 'bell');
  const failures = trials.filter(t => t.actions.length > 2).map(trial => {
    const action = trial.actions[1], previous = trial.windows.find(w => w.t === action.t - 100);
    const current = trial.windows.find(w => w.t === action.t);
    const terms = g.downward.weights.filter(w => w.A === `action:${action.action}`).map(w => ({
      ruleKey: w.ruleKey, u: w.W / DOWNWARD.wMax, createdAt: w.createdAt,
      drive: GOALS.gain * sat(previous.goalCounts.find(c => c.id === w.B)?.effective ?? 0) * w.W / DOWNWARD.wMax,
    })).filter(w => w.drive !== 0);
    return { repeat: trial.repeat, action, drive: current.drive[ACTIONS.indexOf(action.action)], terms,
      counts: previous.goalCounts.map(({ id, M, pendingStrength, effective }) => ({ id, M, pendingStrength, effective })) };
  });
  return { block: i + 1, actions: trials.map(t => t.actions.length),
    presses: trials.map(t => t.actions.filter(a => a.action === 'press').length), failures };
});
paragraphs.push(`**Transient bell failures remain visible.** ${endpointBell.filter(b => b.failures.length).map(b =>
  `Block ${b.block}: ${b.presses.join('/')} presses and ${b.actions.join('/')} total actions per bell probe`).join('; ')}. These endpoint suites fail the unchanged ≤2 action bound. Their extra-action contribution records are in diagnosis.json, alongside the full final suite; they are not reclassified as passing probes.`);
const bypass = endpointBell.find(b => b.block === 9)?.failures[0];
if (bypass) paragraphs.push(`At block 9’s second press (t=${bypass.action.t / 1000} s), the correct light prediction has strength ${f(bypass.counts.find(c => c.id === id('light')).pendingStrength)}, leaving light-M ${f(bypass.counts.find(c => c.id === id('light')).effective)}. Root bell-M is still ${f(bypass.counts.find(c => c.id === id('bell')).effective)}. Newly recreated press→bell@6 and press→bell@8, each u=0.1, contribute ${bypass.terms.filter(t => JSON.parse(t.ruleKey)[2] === id('bell')).map(t => f(t.drive)).join('+')} motor drive, producing total ${f(bypass.drive)}. The cause is summed weak direct paths to the still-unsatisfied bell goal; the strong press→light pending hold is functioning. This occurs before either correct outcome arrives, so it is not wrong hit consumption. No new goal gate, normalization, or quarantine was added.`);
assert.ok(prior.exactTrajectory);
const b55 = prior.changes.find(c => c.trial === 55);
paragraphs.push(`**(iv) Why B55 recreated an omitted outcome.** Before the restart, an isolated replay of bee1ea8 matched all 56 original B-trial records. That evidence survives in [the archived run log](../${prior.provenance.source}) at line ${prior.provenance.line}; [prior-b55.json](../out/m11e-pilot-b/prior-b55.json) preserves its exact output and source hash. This historical replay was not rerun after the restart. At t=${b55.t / 1000} s, thunder reality/prediction/deadline were all 0; Nraw=${b55.error.Nraw}, rest expectation=1.5, Ndev=${b55.error.N}, so Neff=max(0,Ndev−3√1.5)=${f(b55.Neff)}>0. Lightning’s column-6 activity was ${b55.causeActivity}, from its onset 3.8 s earlier. N therefore created u=0.1 without any external thunder. This was a rare Poisson-rest tail admitted by the approved N-only rule. Requiring a reality onset would add a gate and was not done.`);
const recreated = calibration.B.trials.flatMap((r, i) => r.changes.filter(c => c.before === 0 && c.W > 0)
  .map(c => ({ trial: i + 1, ...c })));
paragraphs.push(`Step b B recreations: ${recreated.length ? recreated.map(c => `B${c.trial} at ${c.t / 1000} s, Neff=${f(c.Neff)}, reality=${c.error.reality}`).join('; ') : 'none'}. The full changes include onset, cause activity and raw comparator counts.`);
const falseRules = [['causal', causal.history], ['shuffled', shuffled.history], ['natural', actions.history.filter(h => h.trial >= 60)]]
  .map(([name, history]) => ({ name, final: history.at(-1).chance,
    full: Object.fromEntries(['mean', 'p95', 'max'].map(k => [k, regression(history.map(h => h.chance[k]))])),
    last10: Object.fromEntries(['mean', 'p95', 'max'].map(k => [k, regression(history.slice(-10).map(h => h.chance[k]))])) }));
paragraphs.push(`**Remaining review targets.** Final maximum false u: ${falseRules.map(r => `${r.name}=${f(r.final.max)}`).join(', ')}. Last-ten max slopes (u/trial): ${falseRules.map(r => `${r.name}=${f(r.last10.max.slope)}`).join(', ')}. These values are reported without weakening the ≤0.1 target or claiming convergence from a finite run. The pilot is stopped for review; no additional seed or parameter sweep is run.`);
const stormNames = new Map(read('causal-state').mapping.map(a => [a.id, a.feature]));
const stormFalse = causal.final.weights.filter(w => !causal.trueRules.some(r => r.ruleKey === w.ruleKey))
  .sort((a, b) => b.W - a.W)[0];
paragraphs.push(`The strongest remaining causal-storm false rule is ${stormNames.get(stormFalse.A)}→${stormNames.get(stormFalse.B)}@${stormFalse.k}, born at ${stormFalse.createdAt / 1000} s. Its current generation has N/STDP/M contributions Δu=${f(stormFalse.deltas.N / 0.1)}/${f(stormFalse.deltas.STDP / 0.1)}/${f(stormFalse.deltas.M / 0.1)}. Chance matched onsets strengthened it enough to survive the recorded M losses; the endpoint above 0.1 is a failed target, not a waived newborn exception.`);
const naturalFalse = falseRules.find(r => r.name === 'natural');
const naturalTrend = Object.fromEntries(['mean', 'p95', 'max'].map(k =>
  [k, slope(actions.history.filter(h => h.trial >= 60).map(h => h.chance[k]))]));
const naturalChecks = { falseEnd: naturalFalse.final.max <= 0.1,
  falseTrend: Object.values(naturalTrend).every(s => s < 0) };
paragraphs.push(`The existing M11a false-weight checks are also retained, using its unchanged slope function: final max≤0.1 is ${naturalChecks.falseEnd ? 'PASS' : 'FAIL'}; full-continuation mean/p95/max slopes are ${Object.values(naturalTrend).map(f).join('/')}, so all three strictly negative is ${naturalChecks.falseTrend ? 'PASS' : 'FAIL'}. The last-ten slopes above are additional diagnostics and do not replace that check.`);
// Analytic short-delay pairing: birth at 100, next pre at 200, post at 800
// (the inclusive deadline for k=1). This uses the existing additive trace.
let a = 0;
for (let i = 0; i < 7; i++) a = trace(a, 1, 100);
const shortPair = newConnection('a', 1, 'b', 100);
strengthenDownward(shortPair, a, 800);
const singleHitReference = { ageMs: 700, a, u: shortPair.W / DOWNWARD.wMax };
paragraphs.push(`**Single-hit parameter limitation.** The unit-eligibility reference in the constants section is not a general bound. With one new cause onset at 200 ms and one matched post at 800 ms (k=1, birth at 100 ms), seven eligible windows give a=${f(a)} and age=700 ms. One direct STDP pairing then yields u=${f(singleHitReference.u)}, above the requested “well below 0.3” aim. This is a shared-formula calculation, not an extra trained scene. The fixed constants were not swept or replaced, and no eligibility normalization or weight gate was introduced; this remains a supervisor review item.`);
// Recompute action classifications from the saved raw probes, including post-satisfaction presses.
const blocks = read('action-blocks');
for (const block of blocks.blocks) {
  const probe = read(`block-${block.block}-goals`), metrics = actionBlocks(probe.trials, 1).blocks[0];
  for (const k of ['bird', 'extraPresses', 'distractors', 'other', 'total']) block[k] = metrics[k];
}
blocks.pass = blocks.blocks.at(-1).total === 0; write('action-blocks', blocks);
goals.falseActions = actionBlocks(goals.trials); goals.pass &&= goals.falseActions.pass; write('goals', goals);
summary.falseActions = blocks; summary.goalPass = goals.pass; write('summary', summary);
const rests = ['storm-rest', 'natural-rest'].map(name => {
  const r = read(name); assert.ok(r.pass);
  return { name, pass: r.pass, seconds: r.seconds, rho: r.rho.mean, W: r.W.mean };
});
for (const name of ['causal-state', 'shuffled-state', 'end-A-state', 'T1-state', 'T2-state', 'natural-state']) {
  const { learning } = read(name), weights = learning.future.downward.weights;
  assert.ok(weights.every(w => w.W > 0 && w.createdAt !== null && !('association' in w)));
  assert.ok(learning.factor.predictions.every(c => weights.some(w =>
    w.ruleKey === c.ruleKey && w.createdAt === c.createdAt)));
}
const teacher = read('teacher-provenance');
assert.equal(summary.reuse.sha256, teacher.sha256);
assert.ok(actions.history[0].u.every(u => u === 0), 'Action rule layer must start empty');
const calibrationReplay = read('calibration-replay');
assert.ok(calibrationReplay.stages.every(s => s.exact));
assert.equal(calibrationReplay.stages.reduce((n, s) => n + s.trials, 0), 100);
assert.equal(calibrationReplay.sha256, createHash('sha256').update(readFileSync(calibrationReplay.source)).digest('hex'));
write('audit', { lifecycles, rests, frozenGoals: goals.frozen, sparseStates: true, teacher, calibrationReplay });
const files = ['src/downward.mjs', 'src/three-factor.mjs', 'src/learning.mjs', 'src/predict.mjs', 'src/goals.mjs',
  'src/errors.mjs', 'src/stdp.mjs', 'src/output.mjs', 'src/envs/actions.mjs', 'experiments/m11e-pilot.mjs',
  'experiments/m11e-measure.mjs', 'experiments/m11e-rest.mjs', 'experiments/m11e-action-blocks.mjs',
  'experiments/m10-probe.mjs', 'experiments/m6-trial.mjs', 'experiments/m11e-diagnose.mjs',
  'experiments/m11e-report.mjs', 'experiments/m11e-prior-evidence.mjs', 'experiments/m11e-replay.mjs', 'verify/all.mjs',
  'verify/three-factor.mjs', 'verify/rule-store.mjs', 'docs/multilayer-architecture-narrative.md'];
write('sources', Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])));
write('diagnosis', { paragraphs, actionPairs, trueRules, bellPresses, consumed, goalEvidence, endpointBell, recreated, falseRules,
  naturalTrend, naturalChecks, singleHitReference });
console.log(JSON.stringify({ goalPass: goals.pass, blockPass: blocks.pass, falseRules, lifecycles }));
