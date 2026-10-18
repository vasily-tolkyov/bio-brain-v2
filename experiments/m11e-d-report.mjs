/** Assemble the three-seed table; absent evidence is never a passing check. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { baseDirectory, readJSON } from './m11e-d-state.mjs';
import { calibrationReport, killCount } from './m11e-d-measure.mjs';
import { slope } from './m11a-measure.mjs';
import { DOWNWARD } from '../src/downward.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';
import { ERRORS } from '../src/errors.mjs';
import { pruningEvidence } from './m11e-d-pruning.mjs';
const root = 'out/m11e-roles', seeds = [7, 19, 31], checks = new Map(), reports = [], detail = [];
const read = file => existsSync(file) ? readJSON(file) : null;
const pilotAudit = read(`${root}/7/pilot-audit.json`);
const replayAudit = read(`${root}/7/replay-audit.json`), replayMetrics = read(`${root}/7/replay-metrics.json`);
const replayed = replayAudit?.audit.every(r => r.exact) && replayMetrics?.exact;
const f = x => x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number.isFinite(x) ?
  (Number.isInteger(x) ? String(x) : Math.abs(x) < 1e-6 ? x.toExponential(6) : x.toFixed(6)) : String(x);
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map(r => `| ${r.join(' | ')} |`), ''].join('\n');
function check(seed, name, pass, value) {
  if (!checks.has(name)) checks.set(name, new Map());
  checks.get(name).set(seed, { pass, value });
}
for (const seed of seeds) {
  const base = baseDirectory(seed), dir = `${root}/${seed}`;
  mkdirSync(dir, { recursive: true });
  const s = read(`${base}/summary.json`) ?? read(`${base}/progress.json`), m8 = read(`${dir}/m8.json`), extra = read(`${dir}/m6-extra.json`);
  // JSON serializes an infinite control ratio as null; recompute from raw columns.
  if (s) for (const [key, control] of [['singleShuffledRatio', 'shuffled'], ['singleBirdRatio', 'bird']]) {
    s.M4[key] = s.M4.columns.causal[5] / Math.max(...s.M4.columns[control]);
  }
  const cal = read(`${base}/calibration.json`), goals = read(`${base}/goals.json`), blocks = read(`${base}/action-blocks.json`);
  const rawActions = read(`${base}/actions.json`), actions = rawActions?.history.at(-1).trial === 120 ? rawActions : null;
  const gate = read(`${dir}/gate5/results.json`)?.runs[0];
  const worlds = [];
  for (const name of ['causal', 'shuffled', 'actions']) {
    const data = name === 'actions' ? actions : read(`${base}/${name}.json`);
    const measured = read(`${dir}/${name}-measurements.json`) ?? data;
    if (measured?.measurements) {
      if (seed === 7) assert.ok(replayed, 'Seed-7 telemetry requires exact replay and metric audits');
      const r = calibrationReport(measured);
      assert.equal(r.generations.length, measured.episodes.filter(e => !e.causal).length);
      for (const g of r.generations) {
        const e = measured.episodes.find(e => e.ruleKey === g.ruleKey && e.t === g.birth);
        assert.ok(e); assert.equal(g.death, e.death?.t ?? null);
      }
      writeFileSync(`${dir}/${name}-calibration.json`, JSON.stringify(r));
      worlds.push({ name, ...r });
      check(seed, `R1 ${name}`, r.R1, `${r.rows.filter(x => x.pass).length}/${r.rows.length} calibrated`);
      const proof = seed === 7 ? pilotAudit.R2Worlds.find(w => w.name === name) : null;
      if (proof) { for (const k of Object.keys(r.counts)) assert.equal(r.counts[k], proof.counts[k]); assert.equal(r.R2, proof.R2); }
      check(seed, `R2 ${name}`, r.R2, `${r.counts.deleted}/${r.counts['still dying']}/${r.counts.violation} deleted/dying/violations${proof ? ' (bounds)' : ''}`);
    } else {
      check(seed, `R1 ${name}`, null, 'missing event measurements');
      const proof = seed === 7 ? pilotAudit?.R2Worlds.find(w => w.name === name) : null;
      check(seed, `R2 ${name}`, proof?.R2 ?? null, proof ?
        `${proof.counts.deleted}/${proof.counts['still dying']}/${proof.counts.violation} deleted/dying/violations (bounds)` : 'missing event measurements');
    }
    if (data) {
      const h = name === 'actions' ? data.history.filter(h => h.trial >= 60) : data.history;
      detail.push([seed, name, f(h.at(-1).chance.max), h.at(-1).chance.max <= 0.1 ? 'PASS' : 'FAIL',
        ...['mean', 'p95', 'max'].map(k => f(slope(h.map(r => r.chance[k])))),
        ['mean', 'p95', 'max'].every(k => slope(h.map(r => r.chance[k])) < 0) ? 'PASS' : 'FAIL']);
    }
  }
  check(seed, 'M3 peak / shuffled & bird margins ≥0.05', s?.M3.pass ?? null,
    s ? `${s.M3.peak}; ${f(s.M3.shuffledMargin)} / ${f(s.M3.birdMargin)}` : 'not available');
  for (const [key, title] of [['singleShuffledRatio', 'M4 causal/shuffled ≥5×'], ['singleBirdRatio', 'M4 causal/bird ≥5×']]) {
    check(seed, title, s ? s.M4[key] >= 5 : null, s ? `${f(s.M4[key])}×` : 'not available');
  }
  check(seed, 'M4 timely predictions ≥90%', s?.M4.timely ?? null, s ? String(s.M4.timely) : 'not available');
  check(seed, 'M8 peaks / margins / execution copies', m8?.pass ?? null,
    m8 ? m8.rules.map(r => `${r.peak}: ${f(r.shuffledMargin)}/${f(r.controlMargin)}`).join('; ') : 'not available');
  for (const name of ['storm-rest', 'natural-rest']) {
    const r = read(`${base}/${name}.json`);
    check(seed, `M5 ${name}: no monotone growth, rest bounds`, r?.pass ?? null,
      r ? `Δrho/W=${f(r.rho.mean.delta)}/${f(r.W.mean.delta)}; growing=${r.rho.growingBeyondNoise.length}/${r.W.growingBeyondNoise.length}` : 'not available');
  }
  check(seed, 'M6 extinction B60/A ≤0.1', cal ? cal.B.u.at(-1) / cal.A.u.at(-1) <= 0.1 : null,
    cal ? `${f(cal.B.u.at(-1) / cal.A.u.at(-1))}; first zero B${cal.B.u.indexOf(0)}` : 'not available');
  const kills = [0.1, 0.5, 1].map(u => killCount(u, THREE_FACTOR.etaMissByLayer[2] * Math.exp(-2 * ERRORS.toleranceMs / THREE_FACTOR.tauE)));
  check(seed, 'M6 stronger rules need more consecutive misses', kills[0] < kills[1] && kills[1] < kills[2], kills.join(' / '));
  check(seed, 'M6 recovery C60/A ≥0.85', extra?.C?.pass ?? null, f(extra?.C?.ratio));
  check(seed, 'M6 jitter D/A ≥0.8', extra?.D?.pass ?? null, f(extra?.D?.ratio));
  check(seed, '50/50 alternating: not growing', cal ? cal.E.u.at(-1) <= cal.E.u[0] && cal.mixed.trend.slope <= 0 : null,
    cal ? `${f(cal.E.u[0])}→${f(cal.E.u.at(-1))}; slope=${f(cal.mixed.trend.slope)}; last10=${f(cal.mixed.last10.slope)}` : 'not available');
  for (const key of ['calibration', 'frozenMatched', 'edges', 'N', 'M', 'weakDeadband', 'linearity', 'rest', 'restGateClosed', 'restDrift', 'frozen']) {
    let value = gate ? String(gate.checks[key]) : 'not available';
    if (gate && key === 'frozenMatched') value = `${gate.frozenMatchedSummary.qualified}/${gate.frozenMatchedSummary.trials}`;
    if (gate && key === 'calibration') value = `${gate.calibration.history.length} trials; last100=${gate.calibration.history.slice(-100).filter(r => r.qualified).length}/100`;
    if (gate && key === 'edges') value = [-500, 500].map(offset => {
      const r = gate.hitTables.find(t => t.condition === offset); return `${offset}ms: ${r.qualified}/${r.trials}`;
    }).join('; ');
    if (gate && key === 'weakDeadband') {
      const r = gate.deadband.find(r => r.strength === 0.1);
      value = `u=0.1: ${f(r.positiveFraction)} detected; Meff=${f(r.Meff)}, 3SEM=${f(3 * r.sem)}`;
    }
    if (gate && key === 'restGateClosed') value = f(gate.gateOpenFraction);
    if (gate && key === 'rest') value = `Hz=${f(Math.min(...gate.rest.map(r => r.meanHz)))}…${f(Math.max(...gate.rest.map(r => r.meanHz)))}; Fano max=${f(Math.max(...gate.rest.map(r => r.fano)))}`;
    if (gate && (key === 'N' || key === 'M')) value = `${f(gate.averages[key === 'N' ? 'unpredicted' : 'omitted'][`${key}eff`])} / paired ${f(gate.averages.paired[`${key}eff`])}`;
    check(seed, `gate5 ${key}`, gate?.checks[key] ?? null, value);
  }
  const storm = read(`${base}/causal.json`);
  check(seed, 'True storm / press→light / light→bell ≥0.8', actions && storm ?
    [storm.trueRules[0], ...actions.trueRules.slice(0, 2)].every(r => r.finalU >= 0.8) : null,
  actions && storm ? [storm.trueRules[0], ...actions.trueRules.slice(0, 2)].map(r => f(r.finalU)).join(' / ') : 'not available');
  check(seed, 'True goals and frozen controls', goals?.pass ?? null, goals ? goals.summaries.filter(g => ['light', 'bell'].includes(g.kind))
    .map(g => `${g.kind}: first/achieved ${f(g.pressFirst)}/${f(g.achieved)}`).join('; ') +
    `; none/ablation actions=${goals.summaries.find(g => g.kind === 'none').actions}/${goals.summaries.find(g => g.kind === 'bell-ablated').actions}` : 'not available');
  const bell = goals?.summaries.find(g => g.kind === 'bell');
  check(seed, 'M11a frozen bell: every probe ≤2 actions', bell ? bell.actionsEach.every(n => n <= 2) : null,
    bell ? `max=${Math.max(...bell.actionsEach)}` : 'not available');
  check(seed, 'Natural action blocks: last total=0', blocks?.pass ?? null,
    blocks ? `last=${blocks.blocks.at(-1).total}; bird=${blocks.blocks.map(b => b.bird).join('/')}` : 'not available');
  check(seed, 'Frozen action blocks: last total=0', goals?.falseActions.pass ?? null,
    goals ? `last=${goals.falseActions.blocks.at(-1).total}; bird=${goals.summaries.find(g => g.kind === 'bird').actions}` : 'not available');
  const pruning = pruningEvidence(seed);
  check(seed, 'Rest-tail creations pruned (R2 censoring)', pruning.pass, pruning.rows.map(r =>
    `${r.name}: ${r.counts.deleted}/${r.births} deleted, ${r.counts['still dying']} dying, ${r.counts.unresolved} unresolved`).join('; '));
  writeFileSync(`${dir}/pruning.json`, JSON.stringify(pruning));
  reports.push({ seed, worlds });
}
const tests = read(`${root}/tests-summary.json`), runtime = read(`${root}/runtime-audit.json`);
const singleHit = readJSON('out/m11e-pilot-c/audit.json').singleHit;
for (const seed of seeds) {
  check(seed, 'M11e-c A: single-event u≤0.3 (shared formula)', singleHit.u <= 0.3 && singleHit.upperBound <= 0.3,
    `${f(singleHit.u)} example; ${f(singleHit.upperBound)} upper bound`);
  check(seed, 'npm test green, wall <30 s', tests ? tests.exitCode === 0 && tests.passed === tests.total && tests.wallSeconds < 30 : null,
    tests ? `${tests.passed}/${tests.total}; ${f(tests.wallSeconds)} s` : 'pending');
  check(seed, 'All original code matches 997a835', runtime?.unchanged ?? null,
    runtime ? `${runtime.files.length} original files` : 'pending');
}
const entries = [...checks].flatMap(([name, row]) => seeds.map(seed => ({ name, seed, ...row.get(seed) })));
const complete = entries.every(e => e.pass !== null && e.pass !== undefined), pass = complete && entries.every(e => e.pass);
const doc = ['# M11e step d — three-seed acceptance', '',
  `**${pass ? 'PASS' : 'FAIL'}${complete ? '' : ' — incomplete evidence'}**. Overall acceptance requires every check to pass for all three seeds.`, '',
  '`997a835` runtime and constants retained; current branch `m11e-roles`. Only measurement/report files added. No M11d context cell, mechanism change, parameter change, branch switch, commit, or push.', '',
  `Constants: eta_S=${DOWNWARD.etaS}, boost=${DOWNWARD.boost}, tau_boost=${DOWNWARD.tauBoost} ms, eta_M=${THREE_FACTOR.etaMissByLayer[2]}, w_init=${DOWNWARD.wInit}, w_max=${DOWNWARD.wMax}, g(u)=0.2+0.8(1−u), eligibility τ=${THREE_FACTOR.tauE} ms; event entry and a>0.01 pre gate unchanged.`, '',
  'Seed 7 reuses `out/m11e-pilot-c`. Fresh seeds use the same 30+30 storm trials, A10/B60/E30, T1/T2 30 each, natural 60, ten endpoint blocks and final 20-probe suites. M8 sensory/motor states are independent of downward learning; the new seed-7 M8 run exactly reproduces the existing M11c sensory/motor teacher.', '',
  'Causal classifications remain those of the pilot: lightning→thunder@6 in causal storm; press→light@6, light→bell@4 and press→bell@6 in actions; none in shuffled storm. The direct true-rule endpoint checks cover press→light and light→bell. Slot k has centre 100×2^(k−1) ms.', '',
  'The approved earlier M11e extinction and 50/50 replacements are recorded in SUPERVISION.md (2026-10-18 17:11). R1/R2 are the only additional acceptance replacements here. The M4 bird ratio remains a hard check.', '',
  table(['Check', ...seeds.map(s => `Seed ${s}`)], [...checks].map(([name, row]) => [name, ...seeds.map(seed => {
    const e = row.get(seed); return `${e?.value ?? 'not available'} — **${e?.pass === null || e?.pass === undefined ? 'NOT RUN / INCOMPLETE' : e.pass ? 'PASS' : 'FAIL'}**`;
  })])),
  '## R1: surviving non-causal rules', '',
  'p counts all observed cause onsets and matching outcome onsets in the inclusive ±500 ms window for each slot, including periods when no connection exists. Natural includes the whole T1/T2/natural run. Wilson intervals use z=1.959963984540054. S=eta_S×mean(boost at hit)×mean(a at hit); the measured boost is approximately 1. The exact mean of the product is also reported. M=eta_M×mean(a at unconsumed deadline), including comparator-silent misses. These statistics never alter learning.', '',
  'Writing x=pS and y=(1−p)M, the stable clipped equilibrium is 0 when x≤y, otherwise (x−y)/(x−0.8y). The allowed band is [u*(p_lo)−0.1,u*(p_hi)+0.1]. If u*(p_hi)=0, survival also requires birth within the last n_kill cause onsets, without the R2 slack.', ''];
const coefficients = [], survivors = [];
for (const report of reports) for (const name of ['causal', 'shuffled', 'actions']) {
  const r = report.worlds.find(w => w.name === name);
  const base = baseDirectory(report.seed), data = read(`${base}/${name}.json`);
  const state = read(`${base}/${name === 'actions' ? 'natural' : name}-state.json`);
  if (!data || !state) continue;
  const names = new Map(state.mapping.map(a => [a.id, a.feature]));
  const label = key => { const [A, k, B] = JSON.parse(key); return `${names.get(A)}→${names.get(B)}@${k}`; };
  if (r) {
    coefficients.push([report.seed, `[${name}](../${root}/${report.seed}/${name}-calibration.json)`,
      `${f(r.aHit)} (${r.hitSamples})`, `${f(r.aMiss)} (${r.missSamples})`, f(r.S), f(r.M), f(r.measuredBoost), f(r.exactBoostedS)]);
    survivors.push(...r.rows.map(w => [report.seed, name, label(w.ruleKey), `${w.hits}/${w.count}; ${f(w.p)}`,
      w.ci.map(f).join('…'), f(w.uStar), w.band.map(f).join('…'), f(w.u),
      w.band[1] > 0.1 ? 'not needed' : `${w.birthOnsets}<${w.nKill}: ${w.zeroAllowed}`,
      w.pass ? 'PASS' : 'FAIL', w.oldCap ? 'PASS' : 'FAIL']));
  } else {
    coefficients.push([report.seed, name, 'unavailable', 'unavailable', '—', '—', '—', '—']);
    survivors.push(...data.final.weights.filter(w => !data.trueRules.some(r => r.ruleKey === w.ruleKey)).map(w =>
      [report.seed, name, label(w.ruleKey), 'unavailable', '—', '—', '—', f(w.W / DOWNWARD.wMax), '—',
        'INCOMPLETE', w.W / DOWNWARD.wMax <= 0.1 ? 'PASS' : 'FAIL']));
  }
}
doc.push(table(['Seed', 'World / raw generations', 'Mean hit a (n)', 'Mean miss a (n)', 'S', 'M', 'Mean boost', 'Exact boosted S'], coefficients),
  table(['Seed', 'World', 'Rule', 'hits/onsets; p', 'Wilson CI', 'u*', 'Band', 'Final u', 'Zero-equilibrium age exception', 'R1', 'Old ≤0.1 (info)'], survivors));
const violations = reports.flatMap(r => r.worlds.flatMap(w => w.generations.filter(g => g.status === 'violation').map(g =>
  [r.seed, w.name, g.ruleKey, f(g.peak), f(w.rows.find(row => row.ruleKey === g.ruleKey)?.u), f(g.birth / 1000),
    g.lastHit === null ? 'none' : f(g.lastHit / 1000), g.postLastHit, g.K])));
const pilotProofs = pilotAudit.R2Worlds.filter(w => !reports.find(r => r.seed === 7).worlds.some(r => r.name === w.name));
violations.unshift(...pilotProofs.flatMap(w => w.rows.filter(g => g.status === 'violation').map(g =>
  [7, w.name, g.ruleKey, `≤${f(g.peakUpper)}`, f(g.finalU), f(g.t / 1000),
    g.creditExhaustedBefore ? `<${f(g.creditExhaustedBefore / 1000)}` : 'none', `≥${g.postLastHitLower}`, `≤${g.maximumK}`])));
doc.push('## R2: generations', '', 'K=n_kill(u_peak)+2; n_kill iterates the actual clipped subtraction using measured M. Each recreation starts a new generation. Deleted generations pass; a live generation with fewer than K cause onsets after its last hit (or birth) is still dying.', '',
  table(['Seed', 'World', 'Deleted', 'Still dying', 'Violations', 'R2'], [
    ...pilotProofs.map(w => [7, w.name, w.counts.deleted, w.counts['still dying'], w.counts.violation,
      `${w.R2 === null ? 'INCOMPLETE' : w.R2 ? 'PASS' : 'FAIL'} (bounds)`]),
    ...reports.flatMap(r => r.worlds.map(w => [r.seed, w.name, w.counts.deleted, w.counts['still dying'], w.counts.violation, w.R2 ? 'PASS' : 'FAIL']))]),
  table(['Seed', 'World', 'Violating generation', 'Peak u', 'Final u', 'Birth s', 'Last hit s', 'Later onsets', 'K'], violations),
  'Seed-7 saved-artifact counterexample: light→bell@5, born at 2522.9 s, remains u=0.1 at 4080 s with STDP=M=0 over its entire generation. Its 45 recorded unit-activation predictions all completed without hit credit. Mean deadline a=0.0820849986, M=0.2117792964, n_kill=1, K=3. Even the lowest possible whole-world mean implied by existing sensory/action thresholds gives K≤5. This is an R2 violation regardless of missing whole-world measurements. [Exact records and derivation](../out/m11e-roles/7/pilot-audit.json).', '',
  replayed ? 'Seed-7 measured R2 counts exactly confirm the previous saved-artifact bounds. The acceptance rows retain their original values and bounds labels; the generation table above now uses measured M and complete cause-onset histories.' :
    'Seed-7 R2 counts are proved from saved generations and prediction snapshots: live generations with fewer than three total cause onsets satisfy K≥3; no-hit generations have peak u=0.1; an exact snapshot increase accounting for all lifetime STDP credit bounds the last hit. Existing sensory/action thresholds imply M≥0.0529448241, giving conservative upper bounds on K. Every live generation is resolved by these bounds. They do not substitute for the missing measured whole-world S/M or onset rates required by R1.', '',
  replayed ? 'The supervisor authorised deterministic seed-7 replay on 2026-10-18 at 23:55, using committed 55176d6 code (runtime identical to 997a835). Saved storm/action trajectories and full phase endpoints, and every B/E calibration trial, matched exactly. The replay supplied missing onset/eligibility measurements and B/E checkpoints. Checkpoint verification also exactly reproduced M4 probe records, all ten natural action-block probe suites, final frozen goals and the A endpoint. Original pilot artifacts were retained. No parameter or acceptance change was made.' :
    'The pilot lacks a complete onset stream, full eligibility samples and B/E endpoint checkpoints. Its arrival records cannot substitute for those measurements: some matched onsets are omitted from FutureSlices.records. Full seed-7 R1, recovery C and final E-tail classification therefore require missing-measurement/state replay; existing results have not been rerun.', '',
  '## Old false-rule checks (information only)', '',
  table(['Seed', 'World', 'Final max u', 'Old ≤0.1', 'Mean slope', 'p95 slope', 'Max slope', 'Old all <0'], detail),
  '## M4 bird co-occurrence diagnosis', '');
for (const seed of seeds) {
  const base = baseDirectory(seed), s = read(`${base}/summary.json`), state = read(`${base}/causal-state.json`);
  if (!s || !state) continue;
  s.M4.singleBirdRatio = s.M4.columns.causal[5] / Math.max(...s.M4.columns.bird);
  const bird = state.mapping.find(a => a.feature === 'bird').id, thunder = state.mapping.find(a => a.feature === 'thunder').id;
  const w = state.learning.future.downward.weights.filter(w => w.A === bird && w.B === thunder).sort((a, b) => b.W - a.W)[0];
  const r = reports.find(r => r.seed === seed).worlds.find(w => w.name === 'causal')?.rows.find(r => r.ruleKey === w?.ruleKey);
  doc.push(`Seed ${seed}: causal/bird=${f(s.M4.singleBirdRatio)}×, ${s.M4.singleBirdRatio >= 5 ? 'PASS' : 'FAIL'}; strongest bird rule ${w?.ruleKey ?? 'absent'}, u=${f(w ? w.W / DOWNWARD.wMax : 0)}. ${r ? `Whole-run bird→thunder hit rate at that slot: ${r.hits}/${r.count}=${f(r.p)}; Wilson CI ${r.ci.map(f).join('…')}.` : w ? 'Complete neural hit rate is unavailable in the saved pilot.' : 'No bird→thunder connection survives.'}`, '');
}
doc.push('Seed 7 has 0/15 external bird→thunder sound-onset matches at column 3, but saved P7 records show a neural match: sound starts 822947 ms; P7 thunder onsets at 822900 and 824300 ms; bird onset at 824100 ms. The second P7 onset lies within the bird prediction window centred at 824500 ms. Thus the residual reflects a neural onset co-occurrence during a sustained sound, not a high external sound-onset rate. This explains the observed credit; it does not waive the failed 5× check or establish R1 calibration.', '',
  '## Rest-tail creations and action blocks', '');
const restRows = [];
for (const seed of seeds) {
  const base = baseDirectory(seed), cal = read(`${base}/calibration.json`);
  const rs = ['storm-rest', 'natural-rest'].map(n => [n, read(`${base}/${n}.json`)?.creations]);
  if (cal) rs.push(...['A', 'B', 'E'].map(n => [n, cal[n].restCreations]));
  for (const [name, r] of rs) if (r) restRows.push([seed, name, f(r.quietSeconds), r.quietCreations,
    f(r.per300Seconds), r.quietPruned, r.quietCreations - r.quietPruned]);
}
doc.push(table(['Seed', 'Exposure', 'Quiet s', 'Births', 'Per 300 s', 'Pruned', 'Alive/censored'], restRows),
  'Quiet means every reality-onset drive is zero; it is an observation label. Surviving right-censored generations are retained, never counted as pruned. A saved endpoint proving fewer than three cause onsets since birth establishes “still dying” because K≥3 for every positive generation. Missing endpoints remain unresolved. Per-episode evidence is in each seed’s pruning.json. Bird-goal behavior is included in the action-block rows above; all raw blocks remain in each seed’s action-blocks.json and goals.json.', '',
  table(['Seed', 'Final natural block', 'Bird', 'Extra presses', 'Distractors', 'Other', 'Total', 'Pass'], seeds.flatMap(seed => {
    const r = read(`${baseDirectory(seed)}/action-blocks.json`);
    if (!r) return [];
    const b = r.blocks.at(-1); return [[seed, b.block, b.bird, b.extraPresses, b.distractors, b.other, b.total, r.pass ? 'PASS' : 'FAIL']];
  })),
  '## Follow-up items', '',
  'Growth speed is reported only: seed-7 light→bell needed 42 hit credits to reach 0.8. The new-connection boost is nominal: 1.05× at birth, decaying toward 1 with τ=5 s. Hit credit depends on arrival within tolerance because eligibility starts at window entry: unit activation gives a=1 at the early edge, exp(−500/400)=0.286505 at centre and exp(−1000/400)=0.082085 at the late edge. No timing or boost change was made.', '');
if (replayed) {
  const tail = read(`${root}/7/pruning.json`).rows.find(r => r.name === 'E');
  const state = read(`${root}/7/end-E-state.json`);
  doc.splice(doc.indexOf('## Follow-up items'), 0, `Seed-7 final E-tail: ${tail.counts.deleted}/${tail.births} quiet-born generations deleted; ${tail.counts['still dying']} still dying; ${tail.counts.violation} violations; ${tail.counts.unresolved} unresolved. ` +
    tail.episodes.filter(e => e.death === null).map(e => {
      const w = state.learning.future.downward.weights.find(w => w.ruleKey === e.ruleKey && w.createdAt === e.createdAt);
      return `${e.ruleKey}, born ${f(e.createdAt / 1000)} s, final u=${f(w.W / DOWNWARD.wMax)}, ${e.onsets} recorded cause onsets: ${e.status}.`;
    }).join(' '), '');
}
const growth = seeds.flatMap(seed => {
  const data = read(`${baseDirectory(seed)}/actions.json`);
  if (!data || data.history.at(-1).trial !== 120) return [];
  const key = data.trueRules[1].ruleKey, first = data.trueWindows.find(w => w.ruleKey === key && w.u >= 0.8);
  const credits = data.measurements ? data.measurements.hits.filter(h => h.ruleKey === key && h.t <= first?.t).length :
    readJSON('out/m11e-pilot-c/audit.json').growthBound.pairingsTo08;
  return [[seed, first ? credits : 'not reached', first?.trial ?? '—', f(data.trueRules[1].finalU)]];
});
doc.push(table(['Seed', 'light→bell hits to 0.8 (follow-up)', 'Global trial', 'Final u'], growth));
doc.push(tests ? `npm test: ${tests.passed}/${tests.total} checks, exit ${tests.exitCode}, wall ${f(tests.wallSeconds)} s; under 30 s=${tests.wallSeconds < 30}. [Output](../out/m11e-roles/tests.log).` : 'npm test: pending final verification.', '');
doc.push('[Runtime audit against 997a835](../out/m11e-roles/runtime-audit.json). Existing SUPERVISION.md edits belong to the supervisor and were not made by these scripts.', '');
doc.push(replayed ? 'Seed-7 replay completed: [exact replay audit](../out/m11e-roles/7/replay-audit.json), [retained metric audit](../out/m11e-roles/7/replay-metrics.json), [replay log](../out/m11e-roles/7/replay.log). Recovery C uses m11e-d-m6.mjs from the reproduced B endpoint; the completed D check is retained.' :
  'The missing seed-7 replay is prepared in [m11e-d-replay7.mjs](../experiments/m11e-d-replay7.mjs), but has not been executed. It checks saved trajectories and full phase endpoints exactly, collects missing event telemetry and B/E checkpoints, and reuses existing rest/probe results. Running it requires clarification of the explicit no-rerun instruction. Recovery C then uses m11e-d-m6.mjs without repeating the completed D check.', '');
const d2tests = read(`${root}/7/d2-tests-summary.json`);
if (replayed && d2tests) doc.push(`Step d2 npm test: ${d2tests.passed}/${d2tests.total}, exit ${d2tests.exitCode}, ${f(d2tests.wallSeconds)} s. Original shared test row retained. [Captured output](../out/m11e-roles/7/d2-tests.log).`, '');
if (replayed) {
  const previous = read(`${root}/7/d2-baseline.json`).acceptance;
  const updated = new Set(['R1 causal', 'R1 shuffled', 'R1 actions', 'M6 recovery C60/A ≥0.85', 'Rest-tail creations pruned (R2 censoring)']);
  for (const e of previous.checks) if (e.seed !== 7 || !updated.has(e.name)) assert.deepEqual(entries.find(n => n.seed === e.seed && n.name === e.name), e);
  for (const r of previous.reports.filter(r => r.seed !== 7)) assert.deepEqual(reports.find(n => n.seed === r.seed), r);
}
mkdirSync(root, { recursive: true });
writeFileSync(`${root}/acceptance.json`, JSON.stringify({ complete, pass, checks: entries, reports }));
writeFileSync('docs/m11e-roles.md', doc.join('\n'));
console.log(JSON.stringify({ complete, pass, checks: entries.length, failed: entries.filter(e => e.pass === false), missing: entries.filter(e => e.pass == null).length }));
process.exitCode = pass ? 0 : 1;
