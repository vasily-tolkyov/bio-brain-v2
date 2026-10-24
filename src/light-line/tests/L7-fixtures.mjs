import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ObservedStream } from '../observed-stream.mjs';
import { ActionPipeline } from '../action-pipeline.mjs';
import { LightCheckpoint } from '../persistence.mjs';
import { ContinuationWorld, FEATURES, ACTIONS, BODY, vector } from './L7-world.mjs';
import { equal } from '../state-validation.mjs';
export const protocol = JSON.parse(readFileSync(new URL('./L7-protocol.json', import.meta.url)));
export function predecessor(seed) {
  const file = seed === 101 ? 'out/light-line/acceptance/L6/development/final-101.json.gz' : `out/light-line/acceptance/L6/seed-${seed}/evidence.json.gz`;
  return JSON.parse(gunzipSync(readFileSync(file)));
}
export function naturalOptics(seed, evidence) {
  const streams = [new ObservedStream(FEATURES, seed), new ObservedStream(ACTIONS, seed),
    new ObservedStream(Array.from({ length: 5 }, (_, i) => `body:0:${i}`), seed)];
  // Replay saved original natural samples solely to construct full L7 states.
  // No L5/L6 harness/acquisition is imported or invoked, and no H reconstruction.
  for (const row of evidence.formation.frames) {
    const bin = Math.min(4, Math.floor(row.sample.interoception.energy / 20));
    const vectors = [FEATURES.map(f => row.sample.features[f]), vector(row.action), Array.from({ length: 5 }, (_, b) => Number(b === bin))];
    streams.forEach((s, i) => s.window([{ values: vectors[i], durationMs: .5 }, { values: vectors[i].map(() => 0), durationMs: 99.5 }]));
  }
  streams.forEach((s, i) => { s.freeze(); equal(s.layer.channels()[0], evidence.formation.streams[i].channels, 'saved L6 raw natural optics'); });
  return { sensory: streams[0], motor: streams[1], body: [streams[2]] };
}
export function makeFixture(seed) {
  const evidence = predecessor(seed), optics = naturalOptics(seed, evidence);
  const worldOptions = { initial: 30,
    cues: [{ at: 100, feature: 'light' }, { at: 2800, feature: 'tone' }, { at: 4100, feature: 'bell' }], omit: ['wave'] };
  const createEnvironment = () => new ContinuationWorld(seed, worldOptions);
  const p = new ActionPipeline(createEnvironment(), seed, { optics, downward: evidence.rules.downward, innate: false });
  // A fresh small boundary connection is an explicit fixture, not claimed learning
  // evidence: one missed event deletes it; later real novelty creates a new generation.
  // All other W are the original saved learned L6 rules.
  for (const rule of p.learning.downward.weights) rule.createdAt = 0; // Explicit fixture clock origin, never a restore default.
  const key = JSON.stringify(['action:wave', 4, 'tone']);
  const w = p.learning.downward.weights.find(w => w.ruleKey === key);
  if (!w) throw new Error('L6 learned wave/tone edge absent');
  const W = w.W; w.W = .001; w.deltas.clamp += .001 - W;
  // Label this weight override in saved protocol evidence; no acceptance retune.
  // Use coherent test fixture deltas, not a forged continuation of acquisition.
  w.deltas = { STDP: 0, N: .001, miss: 0, clamp: 0 };
  return { checkpoint: new LightCheckpoint(p, { createEnvironment, schedule: protocol }), evidence, optics,
    fixture: { worldOptions, initialWeakEdge: { ...w }, learnedSource: 'L6 saved natural evidence; read-only', fixtureClockRebase: 'All inherited createdAt set to 0 before L7 fixture begins' } };
}
/** Predetermined external interventions; all observation/learning/goal execution
 * still uses ActionPipeline.step. The schedule cursor is the committed window. */
export function beginScheduled(checkpoint) {
  const p = checkpoint.pipeline, window = p.t / 100;
  if (p.partial) return;
  if (window === 1) p.sensory.freeze(false);
  if (window === 2) p.sensory.freeze();
  if (window === 30) p.innate = true;
  if (window === 31) p.command('light');
  if (window === 40) p.command('change:0:rise:2');
  if (window === 43) { p.goals.goals.cancel('change:0:rise:2'); p.innate = true; }
  if (window === 45) p.command('bell');
  // Actual executed copies are the only action observations.
  const forced = window === 0 || window === 20 ? 'wave' : window === 2 ? 'press' : window === 32 ? 'eat' : null;
  const forcedWindow = window < 31;
  p.beginWindow(forced !== null || forcedWindow ? vector(forced) : undefined);
}
export function nextWindow(checkpoint) {
  beginScheduled(checkpoint); return checkpoint.pipeline.step();
}
export function atCut(checkpoint, cut) {
  while (checkpoint.pipeline.t / 100 < cut.window) nextWindow(checkpoint);
  if (cut.phase) {
    beginScheduled(checkpoint);
    const p = checkpoint.pipeline;
    if (cut.phase === 'sample') while (p.partial.ticks < cut.ticks) p.advanceWindow();
    else {
      while (p.partial.phase !== 'sensory') p.advanceWindow();
      for (let i = 0; i < cut.opticalTicks; i++) p.advanceWindow();
    }
  }
  return checkpoint;
}
export function memberships(p) {
  return [p.sensory, p.output.stream, ...p.body.streams].map(s => ({ names: s.names,
    catalogue: s.layer.catalogue, M2: s.layer.catalogue.filter(e => e.mature).map(e => s.layer.auditMembership(e.id)) }));
}
