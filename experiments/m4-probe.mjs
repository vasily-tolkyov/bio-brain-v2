/** Continuous frozen layer-1 probes. The learned layer-2 weights are read only. */
import assert from 'node:assert/strict';
import { stormEnv } from '../src/world.mjs';
import { presentWindow } from '../src/io.mjs';
import { LIT_THRESHOLD } from '../src/readout.mjs';
import { FutureSlices } from '../src/predict.mjs';
import { discardHistory, STEP_MS } from './m3-pipeline.mjs';

export const PROBES = ['lightning', 'lightning+thunder', 'bird'];
export const PROBE_TRIALS = 10, SLOT_MS = 25000, MATCH_MS = 300;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const fraction = (hits, count) => count ? hits / count : null;
const weights = p => [p.layer1, p.layer2].map(l => l.replicas.map(r =>
  r.net.groups.map(g => ({ scale: Array.from(g.scale), rho: g.stdp ? Array.from(g.stdp.rho) : null }))));

export function probe(pipeline, baseline) {
  const { mapping, layer1 } = pipeline, ids = mapping.map(a => a.id);
  const id = feature => mapping.find(a => a.feature === feature).id;
  const A = id('lightning'), B = id('thunder'), before = weights(pipeline);
  const down = pipeline.downward, future = new FutureSlices(ids, down);
  const trials = [];
  for (let i = 0; i < PROBE_TRIALS * PROBES.length; i++) {
    const kind = PROBES[i % PROBES.length], start = pipeline.t;
    const events = kind === 'bird' ? [{ g: 'bird', start, duration: 200 }] :
      [{ g: 'lightning', start, duration: 100 },
        ...(kind === 'lightning+thunder' ? [{ g: 'thunder', start: start + 3000, duration: 2000 }] : [])];
    const trial = { kind, start, events, onsets: [], created: [], arrivals: [] };
    const env = stormEnv(events, start);
    while (pipeline.t < start + SLOT_MS) {
      const t = pipeline.t, neuralStart = layer1.t;
      presentWindow(layer1, env, STEP_MS, { learn: false });
      const p7 = layer1.readout(neuralStart, { litThreshold: 0 });
      future.update(t, p7.filter(a => a.strength > LIT_THRESHOLD), p7);
      trial.onsets.push(...future.past.entries.filter(e => e.tOnset === t).map(e => ({ ...e })));
      trial.created.push(...future.created.map(e => ({ ...e })));
      trial.arrivals.push(...future.arrivals.map(e => ({ ...e, observedAt: t })));
      discardHistory(layer1); pipeline.t += STEP_MS;
    }
    trials.push(trial);
  }
  assert.deepEqual(weights(pipeline), before, 'Probe changed learned weights');
  const summaries = PROBES.map(kind => {
    const subset = trials.filter(t => t.kind === kind);
    const flashes = subset.flatMap(t => t.onsets.filter(e => e.id === A));
    const thunder = subset.flatMap(t => t.onsets.filter(e => e.id === B));
    const created = subset.flatMap(t => t.created.filter(e => e.B === B));
    const arrivals = subset.flatMap(t => t.arrivals.filter(e => e.B === B));
    const fromFlash = arrivals.filter(e => e.A === A);
    const matching = tolerance => thunder.filter(e => arrivals.some(p => Math.abs(p.observedAt - e.tOnset) <= tolerance)).length;
    const timelyTrials = subset.filter(t => t.onsets.some(e => e.id === A && t.arrivals.some(p =>
      p.A === A && p.B === B && p.tOnset === e.tOnset && Math.abs(p.observedAt - e.tOnset - 3200) <= 100))).length;
    const thunderEvents = subset.flatMap(t => t.events.filter(e => e.g === 'thunder'));
    const matchedEvents = thunderEvents.filter(e => arrivals.some(p => Math.abs(p.observedAt - e.start) <= MATCH_MS)).length;
    const allPredictions = subset.flatMap(t => t.created);
    const totalPredictionStrength = allPredictions.reduce((sum, e) => sum + e.strength, 0);
    return { kind, trials: subset.length, lightningOnsets: flashes.length, thunderOnsets: thunder.length,
      totalPredictions: allPredictions.length, totalPredictionStrength,
      predictionStrengthPerProbe: totalPredictionStrength / subset.length,
      anyPredictionTrialFraction: subset.filter(t => t.created.length).length / subset.length,
      thunderPredictions: created.length, predictionsPerLightningOnset: fraction(created.filter(e => e.A === A).length, flashes.length),
      predictionTrialFraction: subset.filter(t => t.created.some(e => e.B === B)).length / subset.length,
      meanArrivalMs: mean(fromFlash.map(e => e.observedAt - e.tOnset)),
      arrivalColumns: Object.fromEntries(Array.from({ length: 8 }, (_, k) =>
        [k + 1, fromFlash.filter(e => e.k === k + 1).length])),
      timelyTrialFraction: timelyTrials / subset.length,
      matchedOnsets100: matching(100), matchedOnsets300: matching(MATCH_MS),
      matchedOnsetFraction: fraction(matching(MATCH_MS), thunder.length),
      thunderEvents: thunderEvents.length, matchedEventFraction: fraction(matchedEvents, thunderEvents.length) };
  });
  return { downward: down, frozenWeights: true, summaries, trials, records: future.records,
    finalFuture: future.saveState() };
}
