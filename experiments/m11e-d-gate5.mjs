/** Unchanged gate5 measurement/checks, using existing step-c teacher state. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ERRORS } from '../src/errors.mjs';
import { cachedCausal, baseDirectory, readJSON } from './m11e-d-state.mjs';
import { errorExperiment, frozenWeights, MATCHED_OFFSETS, PROTOCOL } from './m5-probe.mjs';
import { mean, summarizeRest, linearity, missSummary, matchedSummary, calibrationSummary } from './m5-statistics.mjs';

const seedArgument = Number(process.argv[2]);
assert.ok([7, 19, 31].includes(seedArgument));
const directory = `out/m11e-roles/${seedArgument}/gate5/`;
const started = performance.now(), results = { protocol: { ...PROTOCOL, errors: ERRORS,
  timing: 'Inclusive 100 ms starts: arrival 3200, expectation 2700..3700, deadline 3700..3800. M4 centres unchanged.',
  calibration: 'Frozen M11e-c teachers, continuous actual P7, only comparator iSTDP learns with eta=0.2/sqrt(trial), cap 600. Cycle all 11 offsets (-500..+500 ms in 100 ms steps) around learned arrival. Require >=90 of the last 100 matched trials with Neff=0 over expectation AND Meff=0 at deadline. Analytic 3 SD limits: N=12.186058 (1100 ms), M=3.674235 (100 ms). No fitted baseline.',
  probes: 'First 100 frozen matched trials cycling all 11 offsets (counts differ by at most one), then ten each interleaved; no neural resets. Ten jitter probes at EACH 100 ms offset in [-500,500] around learned arrival. Rest is 30 s each. Lightning 100 ms / thunder 2000 ms.',
  readout: 'Neff=max(0,Ndev-3*sqrt(restCount(span))); expectation spans 11 labeled windows, learning spans one 100 ms window. Surprise trace remains signed. M reads only the deadline window via max(0,Mdev-3*sqrt(1.5)). Unexpected N uses learned arrival as a counterfactual measurement span without a neural prediction. Each pending prediction retains strength*max(0,1-strongest matched onset); its D afferent uses that remainder at the unchanged deadline. Slow M inhibition and iSTDP tauPre=toleranceMs=500 ms. Goal-M consumer unchanged.',
  rest: 'Per-cell rates pooled over 300 s per seed; each consecutive triple spanning <=20 ms is a burst (including 100 ms boundaries). Sum cell bursts / seconds per population. Fano=variance/mean of population counts in 10 ms bins, each (start,end].',
  linearity: 'Ten isolated probes at each strength, no learning/resets, 3 s slots. Stimulus at offset 1100 ms: prediction created at 0, arrives 600, deadline 1100; unpredicted reality at 1100. Report M at [1100,1200), N over labels 600..1600, plus active 100 ms and individual trials. Strength zero is a diagnostic rest control. Clearly above rest means weak-minus-control > 3 combined SEM; this statistical check only reports, never gates the readout.',
  acceptance: 'Every population: rest mean 0.5..3 Hz/cell, bursts <=0.5/s, Fano <=1.5. Unexpected Neff / omitted Meff means >=10 and >=5x paired effective mean (paired=0 passes if error>=10). Frozen 100 matched trials jointly Neff=Meff=0 in >=90%; per-offset table has ten trials each, both edge offsets jointly silent in >=90%. Weak 0.1 Meff mean >3 SEM above zero; omissions strength>=0.1 clear deadband in >=90%. Linearity mean at 0.1 >=2, above rest noise, monotone non-decreasing. Rest gate open <1%. Separate 300 s audit with source onset every 10 s, W=0.1/0, cap=1: original absolute drift/slope bounds (3 Poisson SD), with monotone non-decrease now required by strengthening-only N.',
}, runs: [] };
mkdirSync(directory, { recursive: true });
const save = () => writeFileSync(`${directory}results.json`, `${JSON.stringify(results, null, 2)}\n`);
console.log(`Results: ${directory}`);
const jitters = MATCHED_OFFSETS;
for (const seed of [seedArgument]) {
  const seedStart = performance.now();
  const { pipeline, baseline, cache } = cachedCausal(seed);
  const experiment = errorExperiment(pipeline, baseline, seed);
  const calibration = experiment.calibrate();
  calibration.diagnostic = calibrationSummary(calibration.history);
  const calibrationSeconds = (performance.now() - seedStart) / 1000, probeStart = performance.now();
  console.log(`Seed ${seed}: calibration ${calibration.converged ? 'converged' : 'FAILED'} in ${calibration.history.length} trials`);
  const before = frozenWeights(pipeline, experiment.errors), trials = [], frozenMatched = [];
  for (let i = 0; i < PROTOCOL.matchedTrials; i++) {
    const offset = jitters[i % jitters.length];
    frozenMatched.push({ ...experiment.trial('jitter', { delay: experiment.arrivalMs + offset }), offset });
    if ((i + 1) % 20 === 0) console.log(`Seed ${seed}: frozen matched ${i + 1}/${PROTOCOL.matchedTrials}`);
  }
  const frozenMatchedSummary = matchedSummary(frozenMatched.flatMap(t => t.comparisons));
  for (let i = 0; i < PROTOCOL.trials; i++) {
    for (const kind of ['paired', 'unpredicted', 'omitted', 'rest']) trials.push(experiment.trial(kind));
    for (const offset of jitters) trials.push({ ...experiment.trial('jitter',
      { delay: experiment.arrivalMs + offset }), offset });
    console.log(`Seed ${seed}: frozen probe set ${i + 1}/${PROTOCOL.trials}`);
  }
  const averages = Object.fromEntries(['paired', 'unpredicted', 'omitted', 'jitter'].map(kind => [kind,
    Object.fromEntries(['N', 'M', 'Nraw', 'Mraw', 'Neff', 'Meff'].map(sign => [sign, mean(trials.filter(t => t.kind === kind)
      .map(t => t.comparisons.find(c => c.id === experiment.thunder)[sign]))]))]));
  const rest = summarizeRest(trials);
  const restPass = rest.every(p => p.pass);
  const response = restPass ? linearity(experiment.errors, experiment.thunder) : [];
  assert.equal(frozenWeights(pipeline, experiment.errors), before, 'Frozen probe changed weights');
  const linearChecks = Object.fromEntries(['N', 'M'].map(kind => {
    const rows = response.filter(r => r.kind === kind), control = rows[0], weak = rows.find(r => r.strength === 0.1);
    const positive = rows.filter(r => r.strength > 0);
    return [kind, restPass && { weak: weak.deviation >= 2,
      aboveNoise: weak.deviation - control.deviation > 3 * Math.hypot(weak.sem, control.sem),
      monotone: positive.every((r, i) => i === 0 || r.deviation >= positive[i - 1].deviation) }];
  }));
  const gateOpenFraction = mean(trials.filter(t => t.kind === 'rest').map(t => t.gateOpenFraction));
  const deadband = response.filter(r => r.kind === 'M' && r.strength > 0)
    .map(r => ({ strength: r.strength, ...missSummary(r.trials.map(t => t.deviation)) }));
  const hitTrials = trials.filter(t => ['paired', 'jitter'].includes(t.kind));
  assert.ok([...hitTrials, ...frozenMatched].every(t => t.comparisons.length && t.comparisons.every(c =>
    t.onsets.some(o => o.id === c.id && Math.abs(o.tOnset - c.tArrive) <= ERRORS.toleranceMs))), 'Unmatched hit probe');
  const hits = hitTrials.flatMap(t => t.comparisons);
  const matched = matchedSummary(hits);
  const hitTables = ['paired', 'jitter', ...jitters].map(condition => ({ condition,
    ...matchedSummary(hitTrials.filter(t => typeof condition === 'number' ? t.offset === condition : t.kind === condition)
      .flatMap(t => t.comparisons)) }));
  const weak = deadband.find(r => r.strength === 0.1);
  const probeSeconds = (performance.now() - probeStart) / 1000, auditStart = performance.now();
  const restAudit = readJSON(`${baseDirectory(seed)}/storm-rest.json`).comparatorAudit;
  const auditSeconds = (performance.now() - auditStart) / 1000;
  const { paired: a, unpredicted: b, omitted: c } = averages;
  const checks = { rest: restPass, N: b.Neff >= 10 && b.Neff >= 5 * a.Neff, M: c.Meff >= 10 && c.Meff >= 5 * a.Meff,
    frozenMatched: frozenMatchedSummary.trials === PROTOCOL.matchedTrials &&
      frozenMatchedSummary.quietFraction >= PROTOCOL.matchedFraction,
    edges: hitTables.filter(r => Math.abs(r.condition) === ERRORS.toleranceMs)
      .every(r => r.trials >= 10 && r.quietFraction >= PROTOCOL.matchedFraction),
    calibration: calibration.converged,
    weakDeadband: weak.Meff > 3 * weak.sem && deadband.filter(r => r.strength >= 0.1).every(r => r.positiveFraction >= PROTOCOL.matchedFraction),
    linearity: restPass && Object.values(linearChecks).every(c => Object.values(c).every(Boolean)),
    restGateClosed: gateOpenFraction < 0.01, restDrift: restAudit.pass, frozen: true };
  const run = { seed, cache, mapping: pipeline.mapping, downward: experiment.downward, calibration, trials, frozenMatched, frozenMatchedSummary,
    averages, rest, linearity: response, linearChecks, deadband, matched, hitTables, gateOpenFraction, restAudit, checks,
    times: { calibrationSeconds, probeSeconds, auditSeconds },
    pass: Object.values(checks).every(Boolean), wallSeconds: (performance.now() - seedStart) / 1000 };
  results.runs.push(run); save();
  console.log(JSON.stringify({ seed, averages, linearChecks, gateOpenFraction, checks, wallSeconds: run.wallSeconds }));
  if (!restPass) { console.log('REST GATE FAILED: stop mechanism changes; continuous readout diagnostic required.'); break; }
}
results.pass = results.runs.every(r => r.pass);
results.wallSeconds = (performance.now() - started) / 1000;
save();
const f = x => x.toFixed(3), pair = (r, k) => `${f(r[`${k}eff`])} (${f(r[k])}; raw ${f(r[`${k}raw`])})`;
const report = [`# M11e step d gate5 — ${results.pass ? 'PASS' : 'FAIL'}`, '',
  ...Object.entries(results.protocol).filter(([, v]) => typeof v === 'string').map(([k, v]) => `- **${k}**: ${v}`), '',
  '| Seed | Population | Mean Hz/cell | Min | Max | Bursts/s/pop | Fano | Pass |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => r.rest.map(p => `| ${r.seed} | ${p.id}:${p.kind} | ${f(p.meanHz)} | ${f(p.minHz)} | ${f(p.maxHz)} | ${f(p.burstsPerSecond)} | ${f(p.fano)} | ${p.pass} |`)), '',
  'Effective error (signed deviation; raw), N expectation / M deadline windows:', '',
  '| Seed | N paired | N unexpected | M paired | M omitted | N jitter | M jitter | Calibration |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.map(r => { const a = r.averages; return `| ${r.seed} | ${pair(a.paired, 'N')} | ${pair(a.unpredicted, 'N')} | ${pair(a.paired, 'M')} | ${pair(a.omitted, 'M')} | ${pair(a.jitter, 'N')} | ${pair(a.jitter, 'M')} | ${r.calibration.history.length} / ${r.calibration.converged} |`; }), '',
  '| Seed | Kind | Strength | Mean deviation | Raw | SEM | Active 100 ms deviation |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => r.linearity.map(p => `| ${r.seed} | ${p.kind} | ${p.strength} | ${f(p.deviation)} | ${f(p.raw)} | ${f(p.sem)} | ${f(p.active)} |`)), '',
  '| Seed | Omission strength / matched | Mean deadline M | 3 SD | Mean Meff | SEM | Fraction Meff > 0 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => [...r.deadband, { strength: 'matched', ...r.matched }].map(p =>
    `| ${r.seed} | ${p.strength} | ${f(p.M)} | ${f(p.deadband)} | ${f(p.Meff)} | ${f(p.sem)} | ${p.positiveFraction} |`)), '',
  '| Seed | Hit condition / offset ms | Trials | Mean Neff | Mean Meff | Jointly silent | Fraction Neff = Meff = 0 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => [{ condition: 'frozen 100', ...r.frozenMatchedSummary }, ...r.hitTables].map(p =>
    `| ${r.seed} | ${p.condition} | ${p.trials} | ${f(p.Neff)} | ${f(p.Meff)} | ${p.qualified} | ${f(p.quietFraction)} |`)), '',
  '| Seed | Initial W | ΔW | Noise SD | Slope /s | Slope SE /s | Monotone growth |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => r.restAudit.drift.map(d => `| ${r.seed} | ${d.initial} | ${d.delta.toExponential(4)} | ${d.deltaSD.toExponential(4)} | ${d.slope.toExponential(4)} | ${d.slopeSE.toExponential(4)} | ${d.monotoneGrowth} |`)), '',
  ...results.runs.map(r => `Seed ${r.seed}: rest gate open ${(100 * r.gateOpenFraction).toFixed(2)}%; checks ${JSON.stringify(r.checks)}; wall ${f(r.wallSeconds)} s.`), '',
  `Full per-window counts, cell statistics, calibration and cache hashes: [results.json](results.json). Total wall ${f(results.wallSeconds)} s.`, ''];
writeFileSync(`${directory}report.md`, report.join('\n'));
console.log(`Gate ${results.pass ? 'PASS' : 'FAIL'}; wall ${f(results.wallSeconds)} s; ${directory}report.md`);
process.exitCode = results.pass ? 0 : 1;
