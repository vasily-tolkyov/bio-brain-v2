/** Isolated local-learning fixture. External outcomes are experimental inputs,
 * never learner probabilities or target weights. NOT a full TimeUnroll world.
 */
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOWNWARD, newConnection } from '../src/downward.mjs';
import { THREE_FACTOR, ThreeFactor } from '../src/three-factor.mjs';
import { effectiveMiss } from '../src/errors.mjs';
import { makeRng } from '../src/core/rng.mjs';
import { calibratedComparator, readCalibration, CALIBRATION_PATH } from './m11g-comparator.mjs';
import { mean, variance } from './m5-statistics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = resolve(ROOT, 'out/m11g/balance');
const sha = value => createHash('sha256').update(value).digest('hex');
export const PROTOCOL = Object.freeze({ events: 400, intervalMs: 4000, arrivalMs: 800, seeds: [7, 19, 31] });
const conditions = [0, .25, .5, .67, .8, 1].map(p => ({ name: `iid-${p}`, p, initial: .1 }));
conditions.push(...[.1, .5, .9].map(initial => ({ name: `alternating-${initial}`, alternating: true, initial })),
  { name: 'matched-jitter300', p: 1, initial: .1, jitter: 300 });
const writeJSON = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2));
const slope = xs => { const xbar = (xs.length - 1) / 2, ybar = mean(xs);
  return xs.reduce((s, y, x) => s + (x - xbar) * (y - ybar), 0) /
    xs.reduce((s, _, x) => s + (x - xbar) ** 2, 0); };

function sources(file, result = {}) {
  if (result[file]) return result;
  const text = readFileSync(resolve(ROOT, file), 'utf8'); result[file] = { sha256: sha(text), text };
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
    if (m[1].startsWith('.')) sources(relative(ROOT, resolve(ROOT, dirname(file), m[1])), result);
  }
  return result;
}

export function measure(seed, condition) {
  const rng = makeRng(seed), errors = calibratedComparator(['b'], seed);
  const first = newConnection('a', 4, 'b', 0); first.W = condition.initial * DOWNWARD.wMax;
  let active = false;
  const future = { t: 0, downward: { weights: [first] }, past: {
    ids: ['a', 'b'], indices: new Map([['a', 0], ['b', 1]]),
    // Deliberate isolated fixture, not real TimeUnroll occupancy. This exposes
    // one candidate at the possible outcome even when the outcome is omitted.
    lines() { const lines = new Float64Array(18); lines[4] = Number(active); return lines; } } };
  const learner = new ThreeFactor(future), samples = [], outcomes = [], windows = [];
  const generations = [], known = new Map();
  const register = w => {
    const g = { ruleKey: w.ruleKey, createdAt: w.createdAt, initialU: w.W / DOWNWARD.wMax,
      predictions: 0, matched: 0, unmatched: 0, detectableMisses: 0, strengtheningUpdates: 0, diedAt: null };
    known.set(w, g); generations.push(g); return g;
  };
  register(first);
  for (let event = 0; event < PROTOCOL.events; event++) {
    const hit = condition.alternating ? event % 2 === 0 : rng.uniform() < condition.p;
    const offset = condition.jitter ? (Math.floor(rng.uniform() * 7) - 3) * 100 : 0;
    outcomes.push({ hit, offset });
    const onset = PROTOCOL.arrivalMs + offset;
    for (let dt = 0; dt < PROTOCOL.intervalMs; dt += 100) {
      const t = event * PROTOCOL.intervalMs + dt, w = future.downward.weights[0];
      const before = w?.W ?? 0, stdpBefore = w?.deltas.STDP ?? 0;
      const created = dt === 0 && w ? [{ A: 'a', B: 'b', k: 4, ruleKey: w.ruleKey,
        createdAt: w.createdAt, activation: 1, strength: w.W / DOWNWARD.wMax,
        tOnset: t, tArrive: t + PROTOCOL.arrivalMs }] : [];
      if (created.length) known.get(w).predictions++;
      const counts = errors.step(t, [Number(hit && dt === onset)], created);
      const p = errors.pending.find(p => p.ruleKey === w?.ruleKey && p.createdAt === w?.createdAt);
      const matched = Boolean(p && hit && dt === onset && p.matched > 0);
      const deadline = Boolean(p && t === p.tArrive + 500), unmatched = deadline && !(p.matched > 0);
      const g = w && known.get(w);
      if (g) { g.matched += Number(matched); g.unmatched += Number(unmatched);
        g.detectableMisses += Number(unmatched && effectiveMiss(counts[0].M) > 0); }
      future.t = t; active = dt === onset;
      learner.step(t, counts, errors.pending);
      const after = future.downward.weights[0];
      if (w && after !== w) { g.diedAt = t; g.residualU = w.W / DOWNWARD.wMax; }
      if (after && !known.has(after)) register(after);
      if (g && w.deltas.STDP > stdpBefore) g.strengtheningUpdates++;
      if (matched || deadline || after !== w || (after?.W ?? 0) !== before) windows.push({
        event: event + 1, t, before, after: after?.W ?? 0, generationBefore: w?.createdAt ?? null,
        generationAfter: after?.createdAt ?? null, matched, deadline, unmatched,
        count: counts[0], pending: p ? { ...p } : null });
    }
    samples.push(future.downward.weights[0]?.W / DOWNWARD.wMax || 0);
  }
  const tail = samples.slice(-100), neverMatched = generations.filter(g => g.matched === 0);
  const describe = xs => xs.length < 2 ? { count: xs.length } : { count: xs.length, slope: slope(xs),
    minimum: Math.min(...xs), maximum: Math.max(...xs), first: xs[0], last: xs.at(-1), change: xs.at(-1) - xs[0] };
  const conditionalTails = Object.fromEntries([true, false].map(hit => [hit ? 'postHit' : 'postMiss',
    describe(tail.filter((_, i) => outcomes[samples.length - tail.length + i].hit === hit))]));
  return { seed, condition, events: PROTOCOL.events, empiricalP: mean(outcomes.map(o => Number(o.hit))),
    mean: mean(tail), sd: Math.sqrt(variance(tail)), tail: describe(tail), conditionalTails, final: samples.at(-1),
    generations, neverMatched: { count: neverMatched.length, deleted: neverMatched.filter(g => g.diedAt !== null).length },
    samples, outcomes, windows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const calibration = readCalibration();
  if (!calibration.calibrationPass || Math.abs(calibration.pooled.floor - THREE_FACTOR.detectionFloor) > 1e-12) {
    throw new Error('Install and review the fresh pooled floor before running balance fixtures');
  }
  mkdirSync(OUT, { recursive: true });
  const loadedSources = sources('experiments/m11g-balance.mjs');
  const manifest = { startedAt: new Date().toISOString(), node: process.version,
    command: process.argv, PROTOCOL, conditions, DOWNWARD, THREE_FACTOR,
    calibrationSHA256: sha(readFileSync(CALIBRATION_PATH)), sources: loadedSources,
    scope: 'Isolated one-candidate actual comparator/learner fixture; not neural-world or TimeUnroll jitter acceptance.' };
  writeJSON(resolve(OUT, 'manifest.json'), manifest);
  const rows = [];
  for (const seed of PROTOCOL.seeds) for (const condition of conditions) {
    const row = measure(seed, condition); rows.push(row);
    writeJSON(resolve(OUT, `${seed}-${condition.name}.json`), row);
    const { samples, outcomes, windows, generations, ...summary } = row;
    console.log(JSON.stringify(summary));
    if (process.env.BIO_BRAIN_PROGRESS_LOG) appendFileSync(process.env.BIO_BRAIN_PROGRESS_LOG,
      `Balance ${seed} ${condition.name}: tail mean=${row.mean.toFixed(6)}, SD=${row.sd.toFixed(6)}\n`);
  }
  const sourceChangedDuringRun = Object.entries(loadedSources).filter(([file, data]) =>
    sha(readFileSync(resolve(ROOT, file))) !== data.sha256).map(([file]) => file);
  const checks = {
    pureOmissionGenerationsDeleted: rows.filter(r => r.condition.p === 0).every(r => r.generations.every(g => g.diedAt !== null)),
    sourceUnchanged: sourceChangedDuringRun.length === 0,
  };
  const iidTrends = PROTOCOL.seeds.map(seed => { const curve = rows.filter(r => r.seed === seed && r.condition.name.startsWith('iid-'));
    return { seed, points: curve.map(r => ({ empiricalP: r.empiricalP, mean: r.mean })),
      monotoneTailMeans: curve.slice(1).every((r, i) => r.mean >= curve[i].mean) }; });
  writeJSON(resolve(OUT, 'results.json'), { ...manifest, sources: undefined,
    finishedAt: new Date().toISOString(), sourceChangedDuringRun, checks, iidTrends, rows,
    survivingPureOmissionGenerations: rows.filter(r => r.condition.p === 0).flatMap(r =>
      r.generations.filter(g => g.diedAt === null).map(g => ({ seed: r.seed, ...g,
        observationEndsAt: PROTOCOL.events * PROTOCOL.intervalMs - 100,
        interpretation: g.unmatched ? 'Survives observed unmatched predictions; inspect raw comparator evidence.' :
          'Right-censored: no unmatched deadline observed yet; not proved extinct or accepted.' }))),
    limits: ['No assigned strength target or equilibrium band is fitted.',
      'Equal nominal ratios do not imply equal trajectories: alternating and IID orders have different correlations.',
      'p=0 may show nonzero population mean due to permitted N recreation; per-generation deletion is checked.',
      'The manually exposed candidate line is not a natural birth-rate or full-world jitter measurement.'] });
  if (!checks.sourceUnchanged) process.exitCode = 1;
}
