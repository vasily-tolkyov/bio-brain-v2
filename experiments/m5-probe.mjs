/** Continuous layer-1 P7 -> FutureSlices -> spiking N/M. No neural state resets. */
import { stormEnv } from '../src/world.mjs';
import { presentWindow } from '../src/io.mjs';
import { LIT_THRESHOLD, WINDOW_MS } from '../src/readout.mjs';
import { FutureSlices } from '../src/predict.mjs';
import { ERRORS, SpikingErrors } from '../src/errors.mjs';
import { discardHistory } from './m3-pipeline.mjs';
import { SurpriseGate } from '../src/three-factor.mjs';
import { restRecorder, restReference, predictionCounts } from './m5-statistics.mjs';

export const PROTOCOL = Object.freeze({ trials: 10, slotMs: 25000, restMs: 30000,
  matchedTrials: 100, matchedFraction: 0.9, maxCalibrationTrials: 600 });
export const MATCHED_OFFSETS = Object.freeze(Array.from(
  { length: 2 * ERRORS.toleranceMs / WINDOW_MS + 1 }, (_, i) => i * WINDOW_MS - ERRORS.toleranceMs));
export const calibrationConverged = history => history.length >= PROTOCOL.matchedTrials &&
  history.slice(-PROTOCOL.matchedTrials).filter(t => t.qualified).length >= PROTOCOL.matchedTrials * PROTOCOL.matchedFraction;

// Trial-wide inverse-square-root decay reduces late stochastic iSTDP jumps.
// Same schedule for every feature, tolerance anchor and seed; no probe feedback.
export function calibrationRate(errors, trial) {
  const eta = ERRORS.eta / Math.sqrt(trial);
  for (const g of errors.net.groups) if (g.istdp) g.istdp.eta = eta;
  return eta;
}
export const frozenWeights = (pipeline, errors) => JSON.stringify([
  ...[pipeline.layer1, pipeline.layer2].flatMap(l => l.replicas.flatMap(r =>
    r.net.groups.map(g => ({ scale: [...g.scale], rho: g.stdp ? [...g.stdp.rho] : null })))),
  ...errors.net.groups.map(g => [...g.scale]),
]);

export function errorExperiment(pipeline, baseline, seed) {
  const { mapping, layer1 } = pipeline, ids = mapping.map(a => a.id);
  const downward = pipeline.downward;
  const future = new FutureSlices(ids, downward), errors = new SpikingErrors(ids, seed);
  const thunder = mapping.find(a => a.feature === 'thunder').id;
  const lightning = mapping.find(a => a.feature === 'lightning').id;
  const causal = downward.weights.filter(w => w.A === lightning && w.B === thunder)
    .reduce((a, b) => a.W >= b.W ? a : b);
  const learnedDelay = [100 * 2 ** (causal.k - 1)];
  function trial(kind, { delay = 3000, learn = false } = {}) {
    const start = pipeline.t, duration = kind === 'rest' ? PROTOCOL.restMs : PROTOCOL.slotMs;
    const events = [
      ...(['paired', 'omitted', 'jitter', 'calibration'].includes(kind) ? [{ g: 'lightning', start, duration: 100 }] : []),
      ...(['paired', 'unpredicted', 'jitter', 'calibration'].includes(kind) ? [{ g: 'thunder', start: start + delay, duration: 2000 }] : []),
    ];
    const result = { kind, start, duration, events, onsets: [], created: [], windows: [],
      counts: ids.map(id => ({ id, N: 0, M: 0, Nraw: 0, Mraw: 0 })) };
    const rest = kind === 'rest' ? restRecorder(errors, duration) : null;
    const gate = new SurpriseGate();
    let openWindows = 0;
    const env = stormEnv(events, start);
    while (pipeline.t < start + duration) {
      const t = pipeline.t, neuralStart = layer1.t;
      presentWindow(layer1, env, WINDOW_MS, { learn: false });
      const p7 = layer1.readout(neuralStart, { litThreshold: 0 });
      future.update(t, p7.filter(a => a.strength > LIT_THRESHOLD), p7);
      const lines = future.past.lines(t), now = ids.map((_, i) => lines[i * 9]);
      const window = errors.step(t, now, future.created, { learn });
      result.onsets.push(...future.past.entries.filter(e => e.tOnset === t));
      result.created.push(...future.created);
      result.windows.push(window);
      window.forEach((r, i) => { for (const key of ['N', 'M', 'Nraw', 'Mraw']) result.counts[i][key] += r[key]; });
      if (rest) { rest.record(); openWindows += Number(gate.step(window)); }
      discardHistory(layer1); pipeline.t += WINDOW_MS;
    }
    if (rest) { result.populations = rest.finish(); result.gateOpenFraction = openWindows / (duration / WINDOW_MS); }
    result.comparisons = predictionCounts(result.windows, kind === 'unpredicted'
      ? [{ B: thunder, tArrive: start + learnedDelay[0] }] : result.created.filter(e => e.ruleKey === causal.ruleKey));
    return result;
  }
  function calibrate() {
    const history = [];
    const reference = { N: restReference(2 * ERRORS.toleranceMs + WINDOW_MS), M: restReference(WINDOW_MS) };
    const ceiling = Object.fromEntries(Object.entries(reference).map(([k, r]) => [k, 3 * r.deviationSD]));
    // All eleven offsets evenly cover the full inclusive tolerance span.
    // The learned prediction provides its own arrival; only causal latency varies.
    for (let i = 0; i < PROTOCOL.maxCalibrationTrials && !calibrationConverged(history); i++) {
      const eta = calibrationRate(errors, i + 1);
      const result = trial('calibration', { delay: learnedDelay[0] + MATCHED_OFFSETS[i % MATCHED_OFFSETS.length], learn: true });
      const predicted = new Set(result.created.map(e => e.B));
      const matched = result.created.filter(p => p.ruleKey === causal.ruleKey).every(p => result.onsets.some(o => o.id === p.B &&
        Math.abs(o.tOnset - p.tArrive) <= ERRORS.toleranceMs));
      const error = result.comparisons.reduce((s, c) => s + c.N + c.M, 0);
      const nearRest = result.comparisons.every(c => c.nearRest);
      const qualified = result.comparisons.length > 0 && matched && nearRest;
      history.push({ trial: i + 1, eta, delay: result.events.at(-1).start - result.start, matched, error, qualified,
        counts: result.comparisons, weights: errors.rows.filter(r => predicted.has(r.id)).map(r =>
          ({ id: r.id, N: [...r.Ninh.scale], M: [...r.Minh.scale] })) });
      if ((i + 1) % 10 === 0) console.log(`  seed ${seed} calibration ${i + 1}: qualified=${history.slice(-PROTOCOL.matchedTrials).filter(t => t.qualified).length}/${Math.min(history.length, PROTOCOL.matchedTrials)}`);
    }
    return { converged: calibrationConverged(history), reference, ceiling, history };
  }
  return { errors, future, downward, thunder, arrivalMs: learnedDelay[0], trial, calibrate };
}
