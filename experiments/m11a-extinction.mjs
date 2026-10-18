/** M11a natural world, exact online teacher continuation and frozen goal probes. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cachedChain } from './m10-cache.mjs';
import { probeChain } from './m10-probe.mjs';
import { SEEDS, TRAIN_TRIALS, saveLayer } from './m8-cache.mjs';
import { chainEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { saveLearning } from '../src/learning.mjs';
import { PROTOCOL, teacherSchedule, advanceExtinction } from './m11a-runtime.mjs';
import { measurements } from './m11a-measure.mjs';

export function runSeed(seed, directory) {
  const started = performance.now(), { pipeline: p, baseline, training, cache } = cachedChain(seed);
  p.env = chainEnv({ seed: seed + 60000, count: PROTOCOL.trials });
  const schedule = teacherSchedule(seed, p.env.actions, TRAIN_TRIALS, PROTOCOL.trials);
  const worldStart = p.t, measure = measurements(p), trials = [], copies = [];
  for (let trial = 1; trial <= PROTOCOL.trials; trial++) {
    const start = p.t, sample = { trial, start, N: 0, M: 0, learningWindows: 0, onsets: [] };
    while (p.t < start + ACTION_WORLD.slotMs) {
      const r = advanceExtinction(p, schedule.get(p.t - worldStart));
      measure.observe(trial, r.t);
      sample.N += r.counts.reduce((n, c) => n + c.N, 0);
      sample.M += r.counts.reduce((n, c) => n + c.M, 0);
      sample.learningWindows += Number(r.learn); sample.onsets.push(...r.onsets);
      copies.push(...r.onsets.filter(e => typeof e.id === 'string').map(e =>
        ({ t: e.tOnset - worldStart, action: e.id.slice(7) })));
    }
    measure.sample(); trials.push(sample);
    if (trial % 5 === 0) console.log(`Seed ${seed} natural ${trial}: ${JSON.stringify(measure.finish().distributionHistory.at(-1))}`);
  }
  assert.deepEqual(copies, p.env.executed.map(({ t, action }) => ({ t, action })));
  const evidence = measure.finish(), endState = { downward: evidence.final, errors: p.errors.saveState() };
  writeFileSync(`${directory}${seed}-end-state.json`, JSON.stringify({ seed, cache, t: p.t, baseline, mapping: p.mapping,
    layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), motor: saveLayer(p.output.layer),
    previous: p.output.previous, learning: saveLearning(p) }));
  const goals = probeChain(p, baseline, seed, training.phases, endState);
  assert.deepEqual(goals.downward, endState.downward);
  const result = { seed, cache, trials, ...evidence, goals, pass: evidence.pass && goals.pass,
    events: p.env.events, executed: p.env.executed, copies, wallSeconds: (performance.now() - started) / 1000 };
  writeFileSync(`${directory}${seed}.json`, JSON.stringify(result));
  console.log(JSON.stringify({ seed, checks: evidence.checks, goalPass: goals.pass, wallSeconds: result.wallSeconds }));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = 'out/m11c-graded/m11a/'; mkdirSync(directory, { recursive: true });
  const runs = (process.argv[2] ? [Number(process.argv[2])] : SEEDS).map(seed => runSeed(seed, directory));
  process.exitCode = runs.every(r => r.pass) ? 0 : 1;
}
