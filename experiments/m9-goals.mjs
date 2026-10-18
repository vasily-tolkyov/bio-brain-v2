import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cachedActions, SEEDS } from './m8-cache.mjs';
import { probeGoals, PROTOCOL } from './m9-probe.mjs';

const started = performance.now(), timestamp = new Date().toISOString().replaceAll(':', '-');
const directory = fileURLToPath(new URL(`../out/m11c-graded/m9/${timestamp}/`, import.meta.url));
const results = { timestamp, protocol: { ...PROTOCOL,
  training: 'Unchanged M8 causal training, 30 slots per seed; full neural states and per-edge baseline cached with source hash. No aggregate-profile reconstruction.',
  rules: 'Continuously grown directed downward weights, same fixed layer scale for predictions and U; no admission.',
  goals: 'Caller writes strength 1 in separate persistent GOAL row. Reality onset or explicit caller cancellation clears it. Goals never enter past rows or STDP.',
  supervisorDecision: 'U reads W from the same downward store; only ACTION preconditions drive motors. Effective goal-M = raw spiking M * (1 - clipped pending prediction strength). Pending spans creation through the existing M5 arrival + 500ms deadline.',
  rehearsal: 'Sub-threshold output writes nothing: no action-bearing env call, action onset, imagined prediction or STDP.',
  timing: '100ms windows; output uses the preceding goal-M window. Sensory reality and executed efference update FutureSlices, predictions and goal satisfaction before choosing the next drive. Neural dynamics continue across probes; unresolved goals are cancelled by the caller after 8s.',
  frozen: 'Sensory and motor layer run learn:false; layer 2 is a read-only rule source; prediction/goal iSTDP and ThreeFactor are frozen. All weights asserted unchanged. Before probes, only the goal comparator gets 24 synthetic, identical all-feature iSTDP trials (500ms goal, 100ms paired reality, 5s rest); no rule or scene information enters calibration.',
  quietCriterion: 'After onset, <=0.1 population goal-M spikes per 100ms window (including onset window); zero later actions.',
}, runs: [] };
await mkdir(directory, { recursive: true });
console.log(`Results: ${directory}`);
for (const seed of process.argv[2] ? [Number(process.argv[2])] : SEEDS) {
  const start = performance.now(), { pipeline, baseline, cache } = cachedActions(seed);
  const run = probeGoals(pipeline, baseline, seed);
  results.runs.push({ ...run, cache, wallSeconds: (performance.now() - start) / 1000 });
  await writeFile(`${directory}results.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Seed ${seed}: ${run.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(run.summaries)}`);
}
results.wallSeconds = (performance.now() - started) / 1000;
results.pass = results.runs.every(r => r.pass);
const table = ['| Seed | Goal | Probes | Correct first | Distractors | Latency ms | Actions/probe (min–max) | Goal-M after onset (total / windows) | Actions after satisfaction | Copies |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => r.summaries.map(s => `| ${r.seed} | ${s.kind} | ${s.probes} | ${s.correctFirst === null ? '—' : `${(100 * s.correctFirst).toFixed(0)}%`} | ${s.distractors} | ${s.latencyMs ?? '—'} | ${s.actionsPerProbe.toFixed(2)} (${s.minActions}–${s.maxActions}) | ${s.goalSpikesAfterOnset} / ${s.postOnsetWindows} | ${s.actionsAfterSatisfaction} | ${s.copies} |`))].join('\n');
const report = `# M9 goals\n\nAcceptance: **${results.pass ? 'PASS' : 'FAIL'}**. Wall time ${results.wallSeconds.toFixed(2)} s.\n\n` +
  `${Object.values(results.protocol).filter(v => typeof v === 'string').join('\n\n')}\n\n${table}\n\n` +
  `Cache training wall seconds (one-time, included above only on cache miss): ${results.runs.map(r => `${r.seed}: ${r.cache.trainingSeconds.toFixed(2)}`).join(', ')}.\n\n` +
  'JSON includes every drive, raw/effective goal-M count, prediction, onset, execution, copy, frozen weight assertion and source-hashed cache provenance.\n';
await writeFile(`${directory}results.json`, `${JSON.stringify(results, null, 2)}\n`);
await writeFile(`${directory}results.md`, report);
console.log(`${table}\nAcceptance: ${results.pass ? 'PASS' : 'FAIL'}\nWall time: ${results.wallSeconds.toFixed(2)} s\nResults: ${directory}`);
process.exitCode = results.pass ? 0 : 1;
