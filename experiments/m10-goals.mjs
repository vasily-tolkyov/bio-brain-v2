/** M11c re-run of the unchanged M10 goal acceptance. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SEEDS } from './m8-cache.mjs';
import { cachedChain } from './m10-cache.mjs';
import { probeChain, PROTOCOL } from './m10-probe.mjs';
import { chainDiagnostics } from './m10-diagnostics.mjs';
const started = performance.now(), directory = `out/m11c-graded/m10/${new Date().toISOString().replaceAll(':', '-')}/`;
mkdirSync(directory, { recursive: true });
const seeds = process.argv[2] === undefined ? SEEDS : [Number(process.argv[2])];
if (seeds.some(s => !SEEDS.includes(s))) throw new Error('Unknown seed');
const results = { protocol: { ...PROTOCOL,
  learning: 'Continuous directed co-occurrence growth during T1/T2; no phase admission.',
  goals: 'U mirrors W, fixed layer scale 0.1 and goal gain 3; strongest observation precondition becomes subgoal. Pending suppression = 1 - prediction strength.' }, runs: [] };
console.log(`Results: ${directory}`);
for (const seed of seeds) {
  const { pipeline, baseline, training, cache } = cachedChain(seed);
  const run = probeChain(pipeline, baseline, seed, training.phases);
  results.runs.push({ ...run, training, cache, diagnostics: chainDiagnostics(pipeline, baseline, training, run.downward) });
  writeFileSync(`${directory}results.json`, JSON.stringify(results));
  console.log(JSON.stringify({ seed, pass: run.pass, summaries: run.summaries }));
}
results.wallSeconds = (performance.now() - started) / 1000; results.pass = results.runs.every(r => r.pass);
writeFileSync(`${directory}results.json`, JSON.stringify(results));
const report = [`# M10 graded goals: ${results.pass ? 'PASS' : 'FAIL'}`, '', `Wall time ${results.wallSeconds.toFixed(2)} s.`, '',
  '| Seed | Goal | Press first | Achieved | Actions/probe | Extra/probe | Distractors | Subgoals |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => r.summaries.map(s => `| ${r.seed} | ${s.kind} | ${s.pressFirst ?? '—'} | ${s.achieved} | ${s.actionsPerProbe} | ${s.extraActionsPerProbe} | ${s.distractors} | ${s.subgoalsWritten} |`))].join('\n');
writeFileSync(`${directory}results.md`, report); console.log(report);
process.exitCode = results.pass ? 0 : 1;
