/** Render the seed-7 pilot artifacts; never changes acceptance or learning. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { mean } from './m11e-measure.mjs';
import { distribution } from './m11a-measure.mjs';
import { calibrateWeight } from '../src/three-factor.mjs';
const dir = 'out/m11e-pilot-b/', read = name => existsSync(`${dir}${name}.json`) ? JSON.parse(readFileSync(`${dir}${name}.json`)) : null;
const summary = read('summary'), causal = read('causal'), shuffled = read('shuffled'), actions = read('actions');
const f = x => x === null || x === undefined ? '—' : typeof x === 'number' ? Number.isInteger(x) ? String(x) : (x !== 0 && Math.abs(x) < 1e-5 ? x.toExponential(4) : x.toFixed(6)) : String(x);
const pct = x => x === null ? '—' : `${(100 * x).toFixed(2)}%`;
const doc = [], add = (...lines) => doc.push(...lines, '');
const table = (headers, rows) => add(`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.map(f).join(' | ')} |`));
const link = name => `[${name}.json](../${dir}${name}.json)`;
add('# M11e step b — seed-7 Phase 1 pilot',
  `**${summary.stopped ? `STOP: ${summary.stopped}` : 'Step-b pilot complete. Stopped before three-seed acceptance; results below are not a milestone acceptance.'}** No parameter sweep, scene-specific constants, new learning gate, or context cell.`,
  `Artifacts: ${link('summary')}, ${link('parameters')}, ${link('audit')}, ${link('sources')}, [run log](../${dir}run.log), [tests](../${dir}tests.log).`);
const falseEnds = [['causal storm', causal], ['shuffled storm', shuffled], ['natural', actions]]
  .filter(([, data]) => data).map(([name, data]) => ({ name, max: data.history.at(-1).chance.max }));
const failedEnds = falseEnds.filter(r => r.max > 0.1);
if (failedEnds.length) add(`**False-weight endpoint target FAIL:** ${failedEnds.map(r => `${r.name} max u=${f(r.max)}`).join('; ')} exceeds 0.1. No acceptance criterion or parameter was changed to remove this failure.`);
add('## Learning roles and fixed constants',
  '`w_max=0.1`, `w_init=0.01`, `eta_S=0.04`, `B_boost=1`, `tau_boost=10000 ms`, `eta_M=0.05`, `g_floor=0.2`, eligibility `tau=400 ms`. All are shared layer-2 constants, fixed before the pilot.',
  'The gate5 weak-miss table in [m11c-gate.md](m11c-gate.md) gives strength 0.1 omission detection of 9/10 (seed 7), 10/10 (19), 10/10 (31); mean Meff 17.243/22.026/15.726. Strength 0.05 detects only 7/10 in seed 7. Thus `w_init/w_max=0.1` is the lowest tested strength meeting the required ≥90% in every tabulated seed. This calibration refers to unit onset; fractional onsets remain graded.',
  'N creates exactly w_init only when the connection is absent, Neff>0 and nonzero current past-line activity; it neither scales creation by N/activity magnitude nor retains an N eligibility tail. Existing weights receive no N addition. Creation time is serialized and reset on each recreation.',
  'Downward STDP is now direct: `Δu=0.04*(1+exp(-age/10000))*a*(1-u)`, applied once at the first matched reality onset in that prediction’s inclusive ±500 ms window. The comparator’s consumed-prediction logic is unchanged. The additive, delayed pre-eligibility a retains its >0.01 gate. Only connections present before the post onset receive credit; birth is exactly u=0.1. Deleted generations cannot credit their replacements. There is no downward STDP LTD and no association-delta coupling.',
  'These constants were fixed once before this pilot. A unit eligibility pairing immediately after birth would move u=0.1 to at most 0.172; at age 34 s it moves to 0.1372. With a=2.8577 (four unit arrivals in the existing 100 ms/400 ms trace), 15 hits spaced 34 s apart reach u≈0.85. The boost is 2× at birth, 1.368× after 10 s and 1.0025× after 60 s. This is an analytic reference, not a guarantee for every graded onset or a scenario-specific setting. Layer-2 attractor STDP remains ungated and unchanged.',
  '`g(u)=0.2+0.8*(1-u)` is linear, decreasing, with a positive floor. An unconsumed deadline with Meff>0 subtracts `Δu=-0.05*g(u)*a`, independent of the magnitude of positive Meff. At u=0.1/0.5/1, unit eligibility decrements are 0.046/0.030/0.010. The unchanged additive per-prediction eligibility may exceed one. At zero the connection is removed from the store and its eligibility is deleted. N can create a new object later with fresh creation time, boost, and cumulative deltas. There are no retained zero-weight store entries.',
  'The former N strengthening and separate capped hit term are removed, including their aggregate traces. SurpriseGate survives only as a comparator/rest statistic. Predictions use every positive W with strength onset×u (the old scheduling floor is removed). Goal gain, U, pending hold, output execution threshold, comparator circuit/deadbands/timing and hit consumption are unchanged. The sat(E) error transform remains solely in the goal consumer.');
add('## Protocol and interpretation',
  'Storm: 30 original causal trials and 30 matched shuffled trials, seed 7, full continuous P7/spiking simulation. End A adds the existing ten paired M6 trials; B60 omissions and E30 alternating hit/miss both branch from exactly end A. No recovery C or jitter D acceptance, nor full three-seed acceptance, is run.',
  'Actions: fresh rule layer, the original M11a T1/T2 curriculum (30 trials each), then 60 natural-world trials with the unchanged teacher schedule and independent birds. Only the original M11c M8 sensory/motor teacher states are reused; no old downward weights, M11d states or context source. Provenance is in summary.json.',
  'A live connection means W>0. False distributions include every non-causal matrix slot, including absent slots recorded as zero in the measurement grid only. Causal storm excludes only lightning→thunder@6; shuffled excludes none. Actions retain the M11a classification: press→light@6, light→bell@4 and transitive press→bell@6 are causal. The transitive 4 s outcome still lies outside the 3.2 s prediction’s ±500 ms tolerance; no timing fix is inserted.',
  'Every trial endpoint records the fixed measurement grid; every birth/deletion is recorded at 100 ms resolution. A recreation is a new episode. Survival at h trials means still alive at the end of birthTrial+h, with cohorts lacking that much follow-up excluded. Death lifetime statistics describe completed episodes; living episodes are explicitly right-censored in JSON. These measurement definitions never affect the learner.');
add(`Restart provenance: the supervisor saved the interrupted implementation as 25c32a1. Generated out/ artifacts did not survive. The seed-7 M8 teacher was regenerated locally from b141af6 in out/m11e-pilot-b/reference-m11c; only its sensory/motor state is reused by the new pilot (${link('teacher-provenance')}). The historical B55 replay output was recovered from the preserved run log, with its provenance recorded explicitly. The step-b pilot below was rerun from the beginning.`);
add('Natural action measurement: ten equal blocks of six trials (204 s each). At each block endpoint, two frozen probes per condition (bell/light/none/bird/ablation) sample the current store; all network, motor, comparator and learning state is restored before continuing the teacher. Thus these are endpoint samples, not autonomous behavior during teacher trials. The final original 20-probe-per-condition suite is also retained, partitioned into ten equal 100 s probe-time blocks. A bell/light goal requires one press; subsequent presses, non-press distractors and all bird-goal actions count as false. PASS iff the last block total is zero, exactly the approved replacement criterion; the ≤2 actions in every bell probe remains unchanged.');
add('## p1 — false-rule trajectories');
for (const [name, data, rows] of [['causal', causal, causal?.history], ['shuffled', shuffled, shuffled?.history],
  ['natural (after T1/T2)', actions, actions?.history.filter(r => r.trial >= 60)]]) {
  if (!data) continue;
  const file = name.startsWith('natural') ? 'natural' : name;
  const births = r => data.episodes.filter(e => !e.causal && e.trial === r.trial).length;
  const deaths = r => data.episodes.filter(e => !e.causal && e.death?.trial === r.trial).length;
  const csv = ['trial,mean_u,p95_u,max_u,live,total,creations_all,deaths_all,creations_chance,deaths_chance', ...rows.map(r =>
    [name.startsWith('natural') ? r.trial - 60 : r.trial, r.chance.mean, r.chance.p95, r.chance.max,
      r.chance.live, r.chance.total, name.startsWith('natural') && r.trial === 60 ? '' : r.creations,
      name.startsWith('natural') && r.trial === 60 ? '' : r.deaths,
      name.startsWith('natural') && r.trial === 60 ? '' : births(r),
      name.startsWith('natural') && r.trial === 60 ? '' : deaths(r)].join(','))].join('\n');
  writeFileSync(`${dir}${file}-trials.csv`, csv + '\n');
  add(`### ${name}`, `Every trial: [full distribution/creation/death CSV](../${dir}${file}-trials.csv). All weights, birth/death times and causal curves: ${link(name.startsWith('natural') ? 'actions' : name)}. The table samples every fifth trial; the CSV retains all trials. The JSON connectionCounts records every 100 ms: total, causal and noncausal, for the sole implemented downward projection L2→L1 (no higher layers exist).`,
    `All-trial peaks of mean/p95/max u: ${['mean', 'p95', 'max'].map(k => f(Math.max(...rows.map(r => r.chance[k])))).join('/')}.`);
  table(['Trial', 'Mean u', 'p95 u', 'Max u', 'Live / noncausal slots', 'L2→L1 total / causal / chance', 'Creations (chance)', 'Deaths (chance)'], rows.filter(r => r.trial % 5 === 0).map(r =>
    [name.startsWith('natural') ? r.trial - 60 : r.trial, r.chance.mean, r.chance.p95, r.chance.max,
      `${r.chance.live}/${r.chance.total}`, `${r.live.total}/${r.live.causal}/${r.live.noncausal}`, name.startsWith('natural') && r.trial === 60 ? '—' : births(r),
      name.startsWith('natural') && r.trial === 60 ? '—' : deaths(r)]));
}
add('## p2 — true-rule creation and growth');
for (const [name, data] of [['causal storm', causal], ['actions: T1/T2/natural', actions]]) {
  if (!data) continue;
  table(['World', 'Rule', 'First creation trial', 'First creation seconds', 'Birth u', 'First trial ≥0.8', 'Final u'], data.trueRules.map(w =>
    [name, w.ruleKey, w.creation?.trial, w.creation ? w.creation.t / 1000 : null,
      data.trueWindows.find(e => e.ruleKey === w.ruleKey)?.u,
      data.history.find(h => h.u[data.keys.indexOf(w.ruleKey)] >= 0.8)?.trial, w.finalU]));
  for (const w of data.trueRules) {
    const i = data.keys.indexOf(w.ruleKey);
    add(`${w.ruleKey}, trial-end u (including trial 0):`, data.history.map(r => f(r.u[i])).join(', ') + '.');
  }
}
add('## p3 — creation cohorts and chance survival');
for (const [name, data] of [['causal', causal], ['shuffled', shuffled], ['actions (T1+T2+natural)', actions]]) {
  if (!data) continue;
  table(['World', 'Class', 'Created', 'Share', 'Alive at end', '1 trial', '5 trials', '20 trials'], data.survival.map(s =>
    [name, s.causal ? 'causal' : 'chance', s.created, pct(s.fractionCreated), s.alive,
      ...s.after.map(a => `${a.alive}/${a.eligible} (${pct(a.fraction)})`)]));
  const s = data.survival.find(s => !s.causal);
  add(`${name}: completed chance lifetimes, trials mean/p95/max = ${s.deadLifetimeTrials ? Object.values(s.deadLifetimeTrials).map(f).join('/') : '—'}; seconds mean/p95/max = ${s.deadLifetimeSeconds ? Object.values(s.deadLifetimeSeconds).map(f).join('/') : '—'}. Right-censored episodes: ${s.rightCensored.length}.`);
}
if (actions) {
  add('The two direct action-world rules were created in T1/T2 and remain alive throughout natural continuation. Natural-born causal episodes below are the transitive press→bell@6 connection; its delay mismatch is described above.');
  const episodes = actions.episodes.filter(e => e.phase === 'natural');
  const dead = episodes.filter(e => !e.causal && e.death);
  add(`Natural-born completed chance lifetimes: trials mean/p95/max = ${Object.values(distribution(dead.map(e => e.death.trial - e.trial))).map(f).join('/')}; seconds mean/p95/max = ${Object.values(distribution(dead.map(e => (e.death.t - e.t) / 1000))).map(f).join('/')}.`);
  table(['Natural-born class', 'Created', 'Share', '1 trial', '5 trials', '20 trials'], [true, false].map(c => {
    const rows = episodes.filter(e => e.causal === c);
    return [c ? 'causal' : 'chance', rows.length, pct(rows.length / episodes.length), ...[1, 5, 20].map(h => {
      const eligible = rows.filter(e => e.trial + h <= 120), alive = eligible.filter(e => !e.death || e.death.trial > e.trial + h).length;
      return `${alive}/${eligible.length} (${pct(eligible.length ? alive / eligible.length : null)})`;
    })];
  }));
}
const calibration = read('calibration');
add('## p4 — extinction from end A');
if (calibration) {
  const unitMisses = [0.1, 0.5, 1].map(initial => {
    let u = initial, n = 0;
    while (u > 0) { u = calibrateWeight(u, 1, 1, 1); n++; }
    return `u=${initial}: ${n} misses`;
  });
  add(`End A u=${f(calibration.B.u[0])}. First ≤50%: trial ${calibration.half ?? 'not reached'}; first ≤10%: trial ${calibration.tenth ?? 'not reached'}; first exact zero: trial ${calibration.B.u.findIndex(u => u === 0)}. Full per-trial records and deltas: ${link('calibration')}.`,
    'Full B0…B60 u:', calibration.B.u.map(f).join(', ') + '.',
    `Calibration measurement accounting includes both the deleted generation’s final M decrement and a same-window newborn’s N contribution. A replay using the final measurement code exactly matched all 100 saved A/B/E trial records, including raw changes (${link('calibration-replay')}).`,
    'For comparison, pilot a started B at u=0.573676 and first reached zero at B4. The stronger step-b rule takes more omissions under the same M constants and comparator.',
    `At equal unit eligibility and positive Meff on every miss, the unchanged g(u) rule reaches deletion in ${unitMisses.join('; ')}. This controlled calculation verifies stronger weights need more misses; it is separate from the full neural B branch and its intermittent comparator detection.`,
    '## p5 — 50/50 alternating, 30 trials from end A',
    'Full E0…E30 u (odd trials hit, even trials miss):', calibration.E.u.map(f).join(', ') + '.');
  const m = calibration.mixed;
  table(['Start u', 'End u', 'Full slope u/trial', 'Last10 slope', 'Mean hit ΔW', 'Mean miss loss W'],
    [[calibration.E.u[0], calibration.E.u.at(-1), m.trend.slope, m.last10.slope, m.meanHitGain, m.meanMissLoss]]);
  add(`Observed 50/50 start/end u: ${f(calibration.E.u[0])}/${f(calibration.E.u.at(-1))}; full slope ${f(m.trend.slope)} and last-ten slope ${f(m.last10.slope)}. These finite trajectories do not establish a long-run asymptote. Repeated creation/deletion is shown explicitly in calibration.json.`);
} else add('Not run because the preceding stop condition fired.');
add('## p6 — ungated STDP rest drift');
for (const name of ['storm-rest', 'natural-rest']) {
  const r = read(name); if (!r) continue;
  add(`${name}: ${r.seconds} s continuous rest after learning; ${link(name)} contains all per-edge/per-rule slopes and 1 s snapshots, plus raw 100 ms comparator windows. Overall rest audit: **${r.pass ? 'PASS' : 'FAIL'}**.`);
  table(['Quantity', 'Initial mean', 'Final mean', 'Δmean', 'Slope /s', 'SE', 'Monotone nondecreasing', 'Edges growing >3 SE'],
    ['rho', 'W'].map(k => [k, r[k].mean.initial, r[k].mean.final, r[k].mean.delta,
      r[k].mean.slope, r[k].mean.se, r[k].mean.nondecreasing, r[k].growingBeyondNoise.length]));
  const pops = r.populations;
  table(['Mean Hz/cell', 'Min cell Hz', 'Max cell Hz', 'Max bursts/s', 'Max Fano', 'Gate open', 'Comparator audit gate', 'All populations pass'],
    [[mean(pops.map(p => p.meanHz)), Math.min(...pops.map(p => p.minHz)), Math.max(...pops.map(p => p.maxHz)),
      Math.max(...pops.map(p => p.burstsPerSecond)), Math.max(...pops.map(p => p.fano)), pct(r.gateOpenFraction),
      pct(r.comparatorAudit.gateOpenFraction), pops.every(p => p.pass)]]);
  add('OLS slope SE describes the recorded drift series; per-edge monotonicity also checked. Constant trajectories have Δ=0. The independent gate5 consumer audit retains its original numerical Poisson drift/slope bounds, using the original diagnostic eta/E0 reference after removal of the N-strengthening formula.');
}
add('## p7 — indicative seed-7 margins, ratios and bird-goal behavior');
if (summary.M3) table(['M3 peak', 'Causal Δrho@6', 'C−shuffled margin (≥0.05)', 'C−bird margin (≥0.05)', 'Layer 1 intact', 'Reported M3 checks'],
  [[summary.M3.peak, summary.M3.causal, summary.M3.shuffledMargin, summary.M3.birdMargin, summary.M3.intact, summary.M3.pass]]);
if (summary.M4) table(['M4 causal strength', 'Single C/S (≥5)', 'Single C/B (≥5)', 'Timely', 'Reported M4 checks'],
  [[summary.M4.trueStrength, summary.M4.singleShuffledRatio, summary.M4.singleBirdRatio, summary.M4.timely, summary.M4.pass]]);

if (summary.goals) {
  table(['Goal', 'Probes', 'Actions', 'Actions/probe', 'No-action fraction', 'Achieved fraction'], summary.goals.map(g =>
    [g.kind, g.probes, g.actions, g.actionsPerProbe, pct(g.noActionFraction), pct(g.achieved)]));
  const bell = summary.goals.find(g => g.kind === 'bell');
  add(`Bell actions per probe: ${bell.actionsEach.join(', ')}; every probe ≤2: ${bell.actionsEach.every(n => n <= 2)}. Full final suite PASS: ${summary.goalPass}.`,
    `Frozen final probes (20 per condition): ${link('goals')}. The original M6 recovery requirement C60/A≥0.85 remains untouched and was not tested in Phase 1.`);
}
add('## False/distractor actions by fixed block');
for (const [label, data] of [['Natural endpoint probes (six teacher trials per block)', read('action-blocks')],
  ['Final frozen suite (100 s per block)', read('goals')?.falseActions]]) {
  if (!data) continue;
  add(`${label}: last-block criterion **${data.pass ? 'PASS' : 'FAIL'}**.`);
  table(['Block', 'Bird actions', 'Extra presses', 'Distractors', 'Other false actions', 'Total'],
    data.blocks.map(b => [b.block, b.bird, b.extraPresses, b.distractors, b.other, b.total]));
}
add('## Diagnosis b');
const diagnosis = read('diagnosis');
if (diagnosis) for (const paragraph of diagnosis.paragraphs) add(paragraph);
else add('Diagnosis pending; do not treat this report as complete.');
const tests = read('tests-summary');
add('## Verification and limits',
  `npm test: **${tests.passed}/${tests.total} checks pass**, exit ${tests.exitCode}, ${tests.suiteSeconds} s suite / ${f(tests.wallSeconds)} s wall. Under 30 s: ${tests.below30Seconds}. [Full test output](../${dir}tests.log).`,
  'The birth/coupling tests were updated for the explicitly approved direct-STDP replacement and structural deletion. Consumption tests retain their deadline/overlap checks while including the new positive pairing increment. Only the explicitly approved false/distractor-action acceptance was replaced. M6 C60/A≥0.85, M3/M4 margins, the bell ≤2-per-probe bound, and all rest limits remain intact.',
  'After restart, the initial serial suite passed 100/100 functional checks in 34.24 s, missing the 30 s target on this machine. verify/all.mjs now runs its two slow independent suites in isolated Node workers while the other checks run in the main thread. No assertions, simulations or timing limits were shortened. The added pruning-index regression checks same-window deletion/recreation and prevents stale generations from gaining credit.',
  `Pilot wall time: ${f(summary.wallSeconds)} s. Reproduce with \`node experiments/m11e-pilot.mjs\`, then \`node experiments/m11e-replay.mjs\`, \`node experiments/m11e-prior-evidence.mjs\`, \`node experiments/m11e-diagnose.mjs\` and \`node experiments/m11e-report.mjs\`. The teacher, test-summary and teacher-provenance artifacts are required. Prior pilot numbers remain in the bee1ea8 report and archived logs; its original out/ files were lost. No three-seed run, branch switch, commit or push. The authoritative design and supervisor’s existing diff were not edited.`,
  'Changed implementation: src/{downward,learning,predict,three-factor,goals}.mjs; pilot, measurements, calibration/rest and goal-probe diagnostics under experiments/; affected role/store/consumption/prediction/goal fixtures under verify/; this report.');
writeFileSync('docs/m11e-pilot.md', doc.flatMap(line => line && !line.startsWith('|') ? [line, ''] : [line]).join('\n').replace(/\n{3,}/g, '\n\n'));
console.log('Wrote docs/m11e-pilot.md');
