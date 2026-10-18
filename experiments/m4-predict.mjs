/** M11c graded M4 acceptance, with unchanged timing and frozen probes. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { learnedPipeline, SEEDS } from './m4-learning.mjs';
import { probe } from './m4-probe.mjs';
import { DOWNWARD } from '../src/downward.mjs';

const started = performance.now(), directory = `out/m11c-graded/m4/${new Date().toISOString().replaceAll(':', '-')}/`;
mkdirSync(directory, { recursive: true });
const results = { protocol: { scale: DOWNWARD, trials: 30,
  strength: 'Sum thunder prediction strengths per lightning-only probe; compare causal/shuffled and causal bird-only. Arrival timing is evaluated on the strongest L->T delay column.' }, runs: [] };
console.log(`Results: ${directory}`);
for (const seed of process.argv[2] ? [Number(process.argv[2])] : SEEDS) for (const shuffled of [false, true]) {
  const { pipeline, baseline, cache } = learnedPipeline(seed, shuffled);
  const start = performance.now(), run = { seed, condition: shuffled ? 'shuffled' : 'causal', cache,
    mapping: pipeline.mapping, ...probe(pipeline, baseline), probeSeconds: (performance.now() - start) / 1000 };
  const T = run.mapping.find(a => a.feature === 'thunder').id;
  run.strength = Object.fromEntries(run.summaries.map(s => [s.kind, run.trials.filter(t => t.kind === s.kind)
    .flatMap(t => t.created).filter(e => e.B === T).reduce((n, e) => n + e.strength, 0) / s.trials]));
  results.runs.push(run);
  console.log(JSON.stringify({ seed, condition: run.condition, strength: run.strength }));
  writeFileSync(`${directory}results.json`, JSON.stringify(results));
}
results.acceptance = [...new Set(results.runs.map(r => r.seed))].map(seed => {
  const a = results.runs.find(r => r.seed === seed && r.condition === 'causal');
  const b = results.runs.find(r => r.seed === seed && r.condition === 'shuffled');
  const causal = a.strength.lightning, shuffled = b.strength.lightning, bird = a.strength.bird;
  const ratio = x => x === 0 ? null : causal / x;
  const L = a.mapping.find(x => x.feature === 'lightning').id;
  const T = a.mapping.find(x => x.feature === 'thunder').id;
  const peak = a.downward.weights.filter(w => w.A === L && w.B === T).reduce((a, b) => a.W >= b.W ? a : b);
  const arrivals = a.trials.flatMap(t => t.arrivals).filter(e => e.ruleKey === peak.ruleKey);
  const peakArrivalMs = arrivals.reduce((n, e) => n + e.observedAt - e.tOnset, 0) / arrivals.length;
  const source = (r, feature) => r.mapping.find(a => a.feature === feature).id;
  const maximum = (r, from) => Math.max(...r.downward.weights.filter(w => w.A === source(r, from) &&
    w.B === source(r, 'thunder')).map(w => w.W / DOWNWARD.wMax));
  const trueColumn = a.downward.weights.find(w => w.A === L && w.B === T && w.k === 6).W / DOWNWARD.wMax;
  const singleShuffled = maximum(b, 'lightning'), singleBird = maximum(a, 'bird');
  const flags = { peak: peak.k === 6 && peakArrivalMs === 3200, shuffled: trueColumn >= 5 * singleShuffled && trueColumn > 0,
    bird: trueColumn >= 5 * singleBird,
    timely: a.summaries.slice(0, 2).every(s => s.timelyTrialFraction >= 0.9),
    matching: a.summaries[1].matchedOnsetFraction >= 0.9 && a.summaries[1].matchedEventFraction >= 0.9 };
  return { seed, trueColumn, singleShuffled, singleBird, causal, shuffled, bird, causalShuffled: ratio(shuffled), causalBird: ratio(bird), peakArrivalMs,
    flags, pass: Object.values(flags).every(Boolean) };
});
results.pass = results.acceptance.every(r => r.pass);
results.wallSeconds = (performance.now() - started) / 1000;
writeFileSync(`${directory}results.json`, JSON.stringify(results));
const report = `# M4 graded prediction: ${results.pass ? 'PASS' : 'FAIL'}\n\n` +
  `Wall time ${results.wallSeconds.toFixed(2)} s. Null ratios mean zero denominator.\n\n` +
  '| Seed | Causal T strength/probe | Shuffled | Bird | Causal/shuffled | Causal/bird | Pass |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
  results.acceptance.map(r => `| ${r.seed} | ${r.causal} | ${r.shuffled} | ${r.bird} | ${r.causalShuffled ?? '∞'} | ${r.causalBird ?? '∞'} | ${r.pass} |`).join('\n') + '\n';
writeFileSync(`${directory}results.md`, report); console.log(report);
process.exitCode = results.pass ? 0 : 1;
