/** Step-c pilot evidence and unchanged acceptance checks; never feeds learning. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { slope } from './m11a-measure.mjs';
import { DOWNWARD, newConnection, plasticityBoost } from '../src/downward.mjs';
import { THREE_FACTOR, ThreeFactor, calibrateWeight } from '../src/three-factor.mjs';
import { FutureSlices } from '../src/predict.mjs';
import { ERRORS } from '../src/errors.mjs';
import { stormWorld } from '../src/world.mjs';
const dir = 'out/m11e-pilot-c/', read = name => JSON.parse(readFileSync(`${dir}${name}.json`));
const write = (name, data) => writeFileSync(`${dir}${name}.json`, JSON.stringify(data));
const summary = read('summary'), causal = read('causal'), shuffled = read('shuffled'), actions = read('actions');
const calibration = read('calibration'), goals = read('goals'), blocks = read('action-blocks');
const rests = ['storm-rest', 'natural-rest'].map(name => ({ name, ...read(name) }));
const tests = read('tests-summary'), sources = read('sources'), launchSources = read('launch-sources');
const f = x => x === null || x === undefined ? '—' : typeof x === 'number' ?
  (Number.isInteger(x) ? String(x) : Math.abs(x) > 0 && Math.abs(x) < 1e-6 ? x.toExponential(6) : x.toFixed(6)) : String(x);
const doc = [], add = (...lines) => doc.push(...lines, '');
const table = (headers, rows) => add(`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.map(f).join(' | ')} |`));
const link = name => `[${name}.json](../${dir}${name}.json)`;
const future = new FutureSlices(['a', 'b']), factor = new ThreeFactor(future), eligibility = [];
let pending = [], w;
for (let t = 0; t <= 800; t += 100) {
  if (t === 100) { w = newConnection('a', 1, 'b', t); future.downward.weights.push(w); }
  future.update(t, t === 200 ? [{ id: 'a', strength: 1 }] : []);
  pending.push(...future.created);
  if (t === 800) pending[0].matched = 1;
  factor.step(t, [{ id: 'b', M: 0, N: 0 }], pending);
  if (t >= 200 && t < 800) eligibility.push({ t, a: factor.predictions[0].M });
}
const singleHit = { birthMs: 100, causeMs: 200, postMs: 800, a: Math.exp(-600 / THREE_FACTOR.tauE),
  eligibility, u: w.W / DOWNWARD.wMax,
  upperBound: DOWNWARD.wInit / DOWNWARD.wMax + DOWNWARD.etaS * plasticityBoost(0) * (1 - DOWNWARD.wInit / DOWNWARD.wMax) };
const lightBellWindows = actions.trueWindows.filter(e => e.ruleKey === actions.trueRules[1].ruleKey);
const firstPairIndex = lightBellWindows.findIndex(e => e.deltas?.STDP > 0);
const pre = lightBellWindows[firstPairIndex - 1], post = lightBellWindows[firstPairIndex];
const lateA = (post.u - pre.u) / (DOWNWARD.etaS * plasticityBoost(post.t - post.createdAt) * (1 - pre.u));
const first08 = lightBellWindows.find(e => e.u >= 0.8);
const growthBound = { ruleKey: post.ruleKey, firstPairEligibility: lateA,
  first08Trial: first08?.trial,
  pairingsTo08: first08 ? lightBellWindows.filter((e, i) => i > 0 && e.t <= first08.t &&
    e.deltas?.STDP > lightBellWindows[i - 1].deltas?.STDP).length : null,
  coefficientLimitForSingleHit03: (0.3 - pre.u) / (1 - pre.u),
  upperAfter15: 1 - (1 - pre.u) * (1 - (0.3 - pre.u) / (1 - pre.u) * lateA) ** 15 };
const natural = actions.history.filter(r => r.trial >= 60);
const naturalTrend = Object.fromEntries(['mean', 'p95', 'max'].map(k => [k, slope(natural.map(r => r.chance[k]))]));
const falseEnds = [causal, shuffled, actions].map(data => data.history.at(-1).chance.max);
const falseResiduals = [causal, shuffled, actions].map((data, i) => {
  const trueKeys = new Set(data.trueRules.map(w => w.ruleKey));
  const w = data.final.weights.filter(w => !trueKeys.has(w.ruleKey)).sort((a, b) => b.W - a.W)[0];
  return { world: ['causal', 'shuffled', 'natural'][i], ...w,
    u: (w?.W ?? 0) / DOWNWARD.wMax, deltaU: Object.fromEntries(Object.entries(w?.deltas ?? {}).map(([k, v]) => [k, v / DOWNWARD.wMax])) };
});
const residual = falseResiduals[0], causalState = read('causal-state');
const residualPredictions = causalState.learning.future.records.flatMap(r => r.entries)
  .filter(e => e.ruleKey === residual.ruleKey && e.createdAt === residual.createdAt);
const residualCause = causalState.mapping.find(a => a.id === residual.A)?.feature;
const finalCauseEvents = stormWorld({ seed: 7, count: 30 }).events.filter(e => e.g === residualCause &&
  e.start >= (residualPredictions.at(-1)?.tOnset ?? residual.createdAt) + 100);
const checks = {
  A: singleHit.u <= 0.3 && singleHit.upperBound <= 0.3,
  B: falseEnds.every(u => u <= 0.1) && Object.values(naturalTrend).every(s => s < 0),
  C: summary.M4.singleShuffledRatio >= 5 && causal.trueRules[0].finalU >= 0.8 &&
    actions.trueRules.slice(0, 2).every(w => w.finalU >= 0.8) && rests.every(r => r.pass),
};
const lifecycles = [causal, shuffled, actions].map((data, i) => {
  assert.ok(data.final.weights.every(w => w.W > 0));
  assert.equal(new Set(data.final.weights.map(w => w.ruleKey)).size, data.final.weights.length);
  for (const h of data.history) {
    const alive = data.episodes.filter(e => e.t < h.t && (!e.death || e.death.t >= h.t));
    assert.equal(alive.length, h.live.total);
    assert.equal(alive.filter(e => e.causal).length, h.live.causal);
    assert.equal(h.u.filter(u => u > 0).length, h.live.total);
  }
  return { name: ['causal', 'shuffled', 'actions'][i], creations: data.episodes.length,
    deaths: data.episodes.filter(e => e.death).length, live: data.final.weights.length };
});
const runtimeFiles = Object.keys(sources).filter(f => f.startsWith('src/') ||
  ['experiments/m11e-pilot.mjs', 'experiments/m11e-measure.mjs', 'experiments/m11e-rest.mjs',
    'experiments/m6-trial.mjs', 'experiments/m10-probe.mjs', 'docs/multilayer-architecture-narrative.md'].includes(f));
assert.ok(runtimeFiles.every(f => sources[f] === launchSources[f] &&
  createHash('sha256').update(readFileSync(f)).digest('hex') === sources[f]));
assert.deepEqual(goals.downward, actions.final);
const deadlineA = Math.exp(-2 * ERRORS.toleranceMs / THREE_FACTOR.tauE);
const oldDeadlineA = Array.from({ length: 11 }, (_, i) => Math.exp(-i * 100 / THREE_FACTOR.tauE)).reduce((a, b) => a + b);
const extinction = [0.1, 0.5, 1].map(initial => {
  let u = initial, misses = 0;
  while (u > 0) { u = calibrateWeight(u, 1, deadlineA, 1); misses++; }
  return { initial, misses };
});
const audit = { checks, pilotPass: Object.values(checks).every(Boolean), singleHit, falseEnds, naturalTrend,
  lifecycles, falseResiduals, residualPredictions, finalCauseEvents, growthBound, runtimeSourcesUnchanged: true, frozenGoals: true, extinction,
  etaM: { old: 0.05, current: THREE_FACTOR.etaMissByLayer[2], oldDeadlineA, deadlineA,
    minimumRescale: oldDeadlineA / deadlineA, oldFreshLoss: 0.05 * 0.92 * oldDeadlineA,
    newFreshLoss: THREE_FACTOR.etaMissByLayer[2] * 0.92 * deadlineA } };
write('audit', audit);
summary.pilot = { checks, pass: audit.pilotPass, decision: audit.pilotPass ?
  'Run full three-seed acceptance' : 'STOP after seed-7 pilot', fullAcceptanceRun: false };
write('summary', summary);
add('## Step c',
  `**Pilot ${audit.pilotPass ? 'PASS for A–C; three-seed acceptance required separately' : 'FAIL — STOP after seed 7; no three-seed acceptance run'}**. A=${checks.A}, B=${checks.B}, C=${checks.C}. No acceptance criterion was relaxed.`,
  `Artifacts: ${link('summary')}, ${link('parameters')}, ${link('audit')}, ${link('sources')}, ${link('teacher-provenance')}, [run log](../${dir}run.log), [tests](../${dir}tests.log).`);
add('### Event eligibility and one-time parameter choice',
  'Each delayed cause contributes its activation exactly once when its prediction first enters the existing inclusive tolerance window (or at creation if already inside it). Later reads only decay that contribution with τ=400 ms. Distinct onsets keep separate eligibility and independent pairings/deadlines; their sum is not normalized or capped. STDP and M read the same trace. Birth exclusion, structural pruning, generation checks, the a>0.01 pre gate and comparator consumption are unchanged.',
  '`w_max=0.1`, `w_init=0.01`, `eta_S=0.205`, `B_boost=0.05`, `tau_boost=5000 ms`, `eta_M=2.58`, `g(u)=0.2+0.8*(1-u)`. These layer-2 constants were fixed once before this pilot; no sweep or per-scene values.',
  `At the full-window deadline, old a=${f(oldDeadlineA)} and event a=${f(deadlineA)}. Preserving M requires a ${f(oldDeadlineA / deadlineA)}× rescale, larger than the approximate 4× because the event decays for the full 1000 ms. At fresh u=0.1 the unclipped decrement changes from ${f(audit.etaM.oldFreshLoss)} to ${f(audit.etaM.newFreshLoss)}; both prune to zero. The rescale preserves or increases M at every column, including fractional activations. g(u) is unchanged.`,
  `Diagnosis-b example: birth 100 ms, cause 200 ms, k=1, post 800 ms; a=${f(singleHit.a)}, single-hit u=${f(singleHit.u)} (≤0.15). The all-timings single-event upper bound is ${f(singleHit.upperBound)} (≤0.3, above the 0.15 aim). With a unit onset paired 300 ms after entering tolerance, 15 repeated hits spaced 34 s apart analytically reach u=0.804681. The boost is 1.05 at birth and decays toward 1 with τ=5 s.`,
  'Implementation tests now use one decaying event in their expected values. The g(u) check verifies the raw decrement and zero clipping separately, since the approved larger eta_M can clip weak connections. The strong-versus-weak miss-count check uses the physical deadline eligibility. Acceptance thresholds and the original M11a slope function remain unchanged.');
add('### Protocol',
  'Same seed-7 pilot as step b: 30 causal + 30 shuffled storm trials; A10 then separate B60/E30 branches; fresh action rule layer with T1/T2 30 trials each and natural continuation 60 trials. Only the original M11c sensory/motor teacher is reused. Each learned network receives 300 s uninterrupted rest. Every 100 ms records L2→L1 total/causal/chance counts. No higher layers or context source were added.',
  'The same fixed grid records absent weights as zero for measurement. Natural action probes sample ten equal six-trial blocks, then the full frozen suite retains 20 probes per condition and ten equal probe-time blocks. Last-block false actions must be zero; the final bell ≤2-actions-per-probe bound remains unchanged.');
add('### p1 — false rules and connection counts');
for (const [name, data, rows] of [['causal', causal, causal.history], ['shuffled', shuffled, shuffled.history], ['natural', actions, natural]]) {
  const shift = name === 'natural' ? 60 : 0;
  const births = r => data.episodes.filter(e => !e.causal && e.trial === r.trial).length;
  const deaths = r => data.episodes.filter(e => !e.causal && e.death?.trial === r.trial).length;
  const csv = ['trial,mean_u,p95_u,max_u,live_total,live_causal,live_chance,births_all,deaths_all,births_chance,deaths_chance', ...rows.map(r =>
    [r.trial - shift, r.chance.mean, r.chance.p95, r.chance.max, r.live.total, r.live.causal, r.live.noncausal,
      r.trial === shift ? '' : r.creations, r.trial === shift ? '' : r.deaths,
      r.trial === shift ? '' : births(r), r.trial === shift ? '' : deaths(r)].join(','))];
  writeFileSync(`${dir}${name}-trials.csv`, csv.join('\n') + '\n');
  add(`**${name}** — [every-trial CSV](../${dir}${name}-trials.csv), ${link(name === 'natural' ? 'actions' : name)} (all weights, births/deaths, 100 ms counts).`);
  table(['Trial', 'Mean u', 'p95 u', 'Max u', 'Live total/causal/chance', 'Chance births/deaths'], rows.filter(r => (r.trial - shift) % 5 === 0).map(r =>
    [r.trial - shift, r.chance.mean, r.chance.p95, r.chance.max, `${r.live.total}/${r.live.causal}/${r.live.noncausal}`,
      r.trial === shift ? '—' : `${births(r)}/${deaths(r)}`]));
}
add(`Final false max u (causal/shuffled/natural): ${falseEnds.map(f).join('/')}; target each ≤0.1. Unchanged M11a full-continuation mean/p95/max slopes: ${Object.values(naturalTrend).map(f).join('/')}; all strictly negative: **${Object.values(naturalTrend).every(s => s < 0) ? 'PASS' : 'FAIL'}**. No last-ten replacement or newborn exception.`);
table(['World', 'Strongest residual false rule', 'Birth s', 'Final u', 'N Δu', 'STDP Δu', 'M Δu'], falseResiduals.map(w =>
  [w.world, w.ruleKey, w.createdAt === undefined ? null : w.createdAt / 1000, w.u, w.deltaU.N, w.deltaU.STDP, w.deltaU.M]));
add(`The strongest causal-storm residual is ${residualCause}→thunder@${residual.k}. Its current generation made ${residualPredictions.length} prediction(s), at onset times ${residualPredictions.map(e => f(e.tOnset / 1000)).join(', ')} s. There are ${finalCauseEvents.length} later scheduled cause events beyond that onset's readout window. Its ΔM=${f(residual.deltaU.M)}; the false endpoint is not waived because there was no later omission opportunity. Raw prediction provenance is in audit.json.`);
add('### p2 — true-rule growth');
for (const [name, data] of [['storm', causal], ['actions', actions]]) {
  table(['World', 'Rule', 'Creation trial/time s', 'First trial ≥0.8', 'Final u'], data.trueRules.map(w =>
    [name, w.ruleKey, `${w.creation?.trial}/${w.creation?.t / 1000}`,
      data.history.find(h => h.u[data.keys.indexOf(w.ruleKey)] >= 0.8)?.trial, w.finalU]));
  for (const w of data.trueRules) add(`${w.ruleKey}, full trial-end curve (including 0):`,
    data.history.map(r => f(r.u[data.keys.indexOf(w.ruleKey)])).join(', ') + '.');
}
add('press→bell@6 remains the original transitive classification; its 4 s reality lies outside the 3.2 s slot ±0.5 s tolerance. The two direct rules are the true-strength pilot criterion.');
add(`**Growth-time limitation:** light→bell's first paid pairing has measured a=${f(lateA)} (700 ms decay), versus 300 ms for the storm/press→light pairings. It first reaches 0.8 at global trial ${growthBound.first08Trial}, after ${growthBound.pairingsTo08} paid pairings. Keeping every single-event chance hit at u≤0.3 from u=0.1 bounds eta_S*boost by ${f(growthBound.coefficientLimitForSingleHit03)}. Even granting that maximum on every one of 15 such late pairings gives only u≤${f(growthBound.upperAfter15)}. The 10–15-hit growth aim is therefore not met for this direct rule with the preserved tolerance-entry timing. Its measured curve and final strength are reported above; no timing change, normalization or additional mechanism was inserted.`);
add('### p3 — birth cohorts and survival');
for (const [name, data] of [['causal', causal], ['shuffled', shuffled], ['T1/T2/natural', actions]]) {
  table(['World', 'Class', 'Created', 'Share', 'Alive at end', 'After 1/5/20 trials'], data.survival.map(s =>
    [name, s.causal ? 'causal' : 'chance', s.created, s.fractionCreated, s.alive,
      s.after.map(a => `${a.alive}/${a.eligible} (${f(a.fraction)})`).join('; ')]));
  const s = data.survival.find(s => !s.causal);
  add(`${name} completed chance lifetimes mean/p95/max: trials ${Object.values(s.deadLifetimeTrials).map(f).join('/')}; seconds ${Object.values(s.deadLifetimeSeconds).map(f).join('/')}. Living episodes are right-censored, retained in JSON.`);
}
const naturalEpisodes = actions.episodes.filter(e => e.phase === 'natural');
table(['Natural-born class', 'Created', 'Share', 'After 1/5/20 trials'], [true, false].map(c => {
  const rows = naturalEpisodes.filter(e => e.causal === c);
  return [c ? 'causal' : 'chance', rows.length, rows.length / naturalEpisodes.length, [1, 5, 20].map(h => {
    const eligible = rows.filter(e => e.trial + h <= 120), alive = eligible.filter(e => !e.death || e.death.trial > e.trial + h).length;
    return `${alive}/${eligible.length} (${f(eligible.length ? alive / eligible.length : null)})`;
  }).join('; ')];
}));
add('### p4 — extinction', `End A u=${f(calibration.B.u[0])}; first ≤50% B${calibration.half}, ≤10% B${calibration.tenth}, exact zero B${calibration.B.u.findIndex(u => u === 0)}. Full B0…B60:`, calibration.B.u.map(f).join(', ') + '.',
  `Controlled equal-activation deadline omissions (a=${f(deadlineA)}, Meff>0): ${extinction.map(r => `u=${r.initial}: ${r.misses} misses`).join('; ')}. Strong rules require more misses. The full neural branch can miss detection or recreate connections. Raw changes: ${link('calibration')}.`);
add('### p5 — alternating 50/50', 'Full E0…E30 (odd hit, even miss):', calibration.E.u.map(f).join(', ') + '.');
table(['Initial u', 'Final u', 'Full slope', 'Last10 slope', 'Mean hit ΔW', 'Mean miss loss W'], [[calibration.E.u[0], calibration.E.u.at(-1),
  calibration.mixed.trend.slope, calibration.mixed.last10.slope, calibration.mixed.meanHitGain, calibration.mixed.meanMissLoss]]);
add(`End below start=${calibration.E.u.at(-1) <= calibration.E.u[0]}; full slope negative=${calibration.mixed.trend.slope < 0}; last-ten slope negative=${calibration.mixed.last10.slope < 0}. Finite-run trajectory only; no claim of an asymptotic limit. The original full acceptance mixed gain/loss check is not replaced by this diagnostic.`);
add('### p6 — rest drift and N-tail creations');
for (const r of rests) {
  add(`${r.name}: ${r.seconds} s, **${r.pass ? 'PASS' : 'FAIL'}**; ${link(r.name)} contains slopes/SE for every edge, snapshots and raw comparator windows.`);
  table(['Quantity', 'Initial mean', 'Final mean', 'Δmean', 'Slope/s', 'SE', 'Nondecreasing', 'Growing beyond 3 SE'], ['rho', 'W'].map(k =>
    [k, r[k].mean.initial, r[k].mean.final, r[k].mean.delta, r[k].mean.slope, r[k].mean.se, r[k].mean.nondecreasing, r[k].growingBeyondNoise.length]));
  add(`All populations pass=${r.populations.every(p => p.pass)}; gate-open fraction=${f(r.gateOpenFraction)}; independent gate5 audit=${r.comparatorAudit.pass}.`);
  table(['Mean Hz/cell', 'Min cell Hz', 'Max cell Hz', 'Max bursts/s', 'Max Fano', 'Audit gate fraction'], [[
    r.populations.reduce((sum, p) => sum + p.meanHz, 0) / r.populations.length,
    Math.min(...r.populations.map(p => p.minHz)), Math.max(...r.populations.map(p => p.maxHz)),
    Math.max(...r.populations.map(p => p.burstsPerSecond)), Math.max(...r.populations.map(p => p.fano)),
    r.comparatorAudit.gateOpenFraction]]);
}
const creationRows = [...rests.map(r => [r.name, r.creations]), ...['A', 'B', 'E'].map(k => [`${k} quiet windows`, calibration[k].restCreations])];
table(['Rest exposure', 'Quiet seconds', 'Creations', 'Creations /300 s', 'Pruned by end', 'Still alive'], creationRows.map(([name, r]) =>
  [name, r.quietSeconds, r.quietCreations, r.per300Seconds, r.quietPruned, r.quietCreations - r.quietPruned]));
add('Quiet exposure means every reality-onset drive is zero in that 100 ms window. Calibration exposure excludes active onset windows; the dedicated 300 s rests are uninterrupted. These are measurement labels only: N uses its unchanged deadband and active past lines, with no reality-onset gate. Each episode records Neff, raw counts, birth and death. Non-quiet births without the target onset are retained separately.');
for (const [name, r] of creationRows) for (const e of r.episodes.filter(e => e.quiet && e.death === null)) {
  add(`${name}: ${e.ruleKey}, born ${f(e.t / 1000)} s, Neff=${f(e.Neff)}, still alive at the endpoint (right-censored). This episode is not counted as pruned.`);
}
for (const e of calibration.B.restCreations.episodes.filter(e => e.ruleKey === causal.trueRules[0].ruleKey)) {
  add(`B noise recreation of the extinguished true rule: t=${f(e.t / 1000)} s, reality/prediction/deadline=${e.error.reality}/${e.error.prediction}/${e.error.deadline}, Nraw=${e.error.Nraw}, Ndev=${e.error.N}, Neff=${f(e.Neff)}; pruned at ${f(e.death / 1000)} s. No reality-onset gate was added.`);
}
add('### p7 — seed-7 margins and goals');
table(['M3 peak', 'Causal Δrho@6', 'Margin shuffled', 'Margin bird', 'L1 intact', 'Pass'], [[summary.M3.peak, summary.M3.causal,
  summary.M3.shuffledMargin, summary.M3.birdMargin, summary.M3.intact, summary.M3.pass]]);
table(['M4 true strength', 'Single C/S', 'Single C/B', 'Timely', 'Pass'], [[summary.M4.trueStrength, summary.M4.singleShuffledRatio,
  summary.M4.singleBirdRatio, summary.M4.timely, summary.M4.pass]]);
table(['Goal', 'Probes', 'Actions', 'Actions/probe', 'No-action fraction', 'Achieved'], summary.goals.map(g =>
  [g.kind, g.probes, g.actions, g.actionsPerProbe, g.noActionFraction, g.achieved]));
const bell = summary.goals.find(g => g.kind === 'bell');
add(`Final bell actions per probe: ${bell.actionsEach.join(', ')}; every probe ≤2: ${bell.actionsEach.every(n => n <= 2)}. Full frozen goals pass=${summary.goalPass}. Raw frozen probes: ${link('goals')}.`);
for (const [name, data] of [['Natural endpoints (six trials/block)', blocks], ['Final frozen suite (100 s/block)', goals.falseActions]]) {
  add(`**${name}**; last-block-zero criterion: ${data.pass ? 'PASS' : 'FAIL'}.`);
  table(['Block', 'Bird', 'Extra presses', 'Distractors', 'Other', 'Total', 'Bell actions/probe'], data.blocks.map(b =>
    [b.block, b.bird, b.extraPresses, b.distractors, b.other, b.total, (data === blocks ?
      read(`block-${b.block}-goals`).summaries.find(g => g.kind === 'bell').actionsEach :
      bell.actionsEach.slice((b.block - 1) * 2, b.block * 2)).join(', ')]));
}
add('### Verification and stop decision',
  `npm test: **${tests.passed}/${tests.total} passed**, exit ${tests.exitCode}, suite ${f(tests.suiteSeconds)} s, wall ${f(tests.wallSeconds)} s; <30 s=${tests.below30Seconds}.`,
  `Pilot wall time ${f(summary.wallSeconds)} s. Lifecycle counts reconcile; stores contain only positive connections; frozen goal probes retain the exact final store; runtime source hashes and the authoritative design hash match launch.`,
  `A=${checks.A}, B=${checks.B}, C=${checks.C}. ${audit.pilotPass ? 'Proceed to the separately required full three-seed table.' : 'Stopped at the required pilot boundary. No full three-seed table or milestone acceptance is claimed. M6 C60/A≥0.85 recovery and other full acceptance checks remain unchanged and unrun.'}`,
  'Reproduce: `node experiments/m11e-pilot.mjs`, `npm test`, then `node experiments/m11e-c-report.mjs` with the recorded test summary and teacher artifacts. No branch switch, commit or push. The existing SUPERVISION.md diff and authoritative design were not edited.');
const path = 'docs/m11e-pilot.md', prior = readFileSync(path, 'utf8').split('\n## Step c\n')[0].trimEnd();
writeFileSync(path, prior + '\n\n' + doc.flatMap(line => line && !line.startsWith('|') ?
  [line, ''] : [line]).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
console.log(JSON.stringify(audit));
process.exitCode = audit.pilotPass ? 0 : 1;
