/** Extinction, recovery, jitter and balanced hit/miss, with ALL learning on. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { learnedPipeline, SEEDS } from './m4-learning.mjs';
import { saveLayer, loadLayer } from './m8-cache.mjs';
import { saveLearning, loadLearning } from '../src/learning.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';
import { DOWNWARD } from '../src/downward.mjs';
import { calibrationTrial, SLOT_MS } from './m6-trial.mjs';

const JITTER = [-300, -200, -100, 0, 100, 200, 300];
export function calibrationSuite(seed) {
  const started = performance.now(), { pipeline: p, cache } = learnedPipeline(seed, false);
  const id = name => p.mapping.find(a => a.feature === name).id;
  const ruleKey = JSON.stringify([id('lightning'), 6, id('thunder')]);
  const phase = (name, n, paired, jitter = false) => {
    const trial = calibrationTrial(p, ruleKey), trials = [];
    for (let i = 0; i < n; i++) {
      const r = trial(typeof paired === 'function' ? paired(i) : paired, 3000 + (jitter ? JITTER[i % JITTER.length] : 0));
      trials.push(r);
      if ((i + 1) % 10 === 0) console.log(JSON.stringify({ seed, phase: name, trial: i + 1, W: r.W }));
    }
    return { name, trials, trajectory: [trials[0].before, ...trials.map(r => r.W)] };
  };
  const A = phase('A', 10, true);
  const branch = { t: p.t, layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), learning: saveLearning(p) };
  const restore = () => { p.t = branch.t; loadLayer(p.layer1, branch.layer1); loadLayer(p.layer2, branch.layer2); loadLearning(p, branch.learning); };
  const B = phase('B', 60, false), C = phase('C', 60, true);
  restore(); const D = phase('D', 30, true, true);
  restore(); const E = phase('E', 30, i => i % 2 === 0);
  const end = phase => phase.trajectory.at(-1), start = end(A);
  const crossing = ratio => B.trajectory.findIndex(w => w <= start * ratio);
  const retention = { B_over_A: end(B) / start, C30_over_A: C.trajectory[30] / start,
    C60_over_A: end(C) / start, D_over_A: end(D) / start, half: crossing(0.5), tenth: crossing(0.1) };
  const hits = E.trials.filter(r => r.paired), misses = E.trials.filter(r => !r.paired);
  const mean = (xs, f) => xs.reduce((n, r) => n + f(r), 0) / xs.length;
  const gain = mean(hits, r => r.W - r.before), loss = mean(misses, r => r.before - r.W);
  const hit = mean(hits, r => r.deltas.hit);
  const mixed = { start, end: end(E), relativeWeakening: 1 - end(E) / start,
    meanHitGain: gain, meanMissLoss: loss, totalRatio: gain / loss, hitOnlyRatio: hit / loss,
    pairEnds: misses.map(r => r.W) };
  const slope = xs => {
    const mid = (xs.length - 1) / 2;
    return xs.reduce((n, x, i) => n + (i - mid) * x, 0) / xs.reduce((n, _, i) => n + (i - mid) ** 2, 0);
  };
  mixed.slope = slope(E.trajectory); mixed.last10Slope = slope(E.trajectory.slice(-10));
  const checks = { extinction: end(B) <= start * 0.1 && end(B) < B.trajectory[30],
    // Hard since accepted M7 (supervisor): recovery returns to >=85% of end A.
    recovery: retention.C60_over_A >= 0.85,
    jitter: retention.D_over_A >= 0.8,
    asymmetry: mixed.relativeWeakening >= 0.05 && mixed.totalRatio <= 0.5 && mixed.hitOnlyRatio <= 0.2 && mixed.slope < 0 && mixed.last10Slope < 0 };
  return { seed, cache, ruleKey, phases: [A, B, C, D, E], retention, mixed, checks,
    pass: Object.values(checks).every(Boolean), wallSeconds: (performance.now() - started) / 1000 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = `out/m11c-graded/m6-${process.argv[2] ?? 'all'}/`;
  mkdirSync(directory, { recursive: true });
  const results = { protocol: { SLOT_MS, THREE_FACTOR, DOWNWARD, learning: 'STDP + N + hit + M + comparator iSTDP online' }, runs: [] };
  for (const seed of process.argv[2] ? [Number(process.argv[2])] : SEEDS) {
    results.runs.push(calibrationSuite(seed));
    writeFileSync(`${directory}results.json`, JSON.stringify(results));
  }
  console.log(JSON.stringify(results.runs.map(({ seed, retention, mixed, checks, wallSeconds }) => ({ seed, retention, mixed, checks, wallSeconds }))));
  process.exitCode = results.runs.every(r => r.pass) ? 0 : 1;
}
