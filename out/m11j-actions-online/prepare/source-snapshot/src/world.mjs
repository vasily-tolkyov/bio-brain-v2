/** Minimal storm port from bio-brain/src/loop/world.mjs; times are in ms. */
import { makeRng } from './core/rng.mjs';
import { groupInput } from './io.mjs';

export const FEATURES = Object.freeze(['lightning', 'thunder', 'bird']);
export const FEATURE_LINES = Object.freeze(Object.fromEntries(FEATURES.map((g, index) =>
  [g, Object.freeze(Array.from({ length: 6 }, (_, k) => index * 6 + k))])));
export const INPUT_LINES = 18;
const ONSET_SPAN = 10000, REST_MS = 20000;
// Preserve the original durations, 3 s causal delay, 50% bird probability,
// and uniform 0–10 s bird timing. Rest exceeds M2's 18.1 s expiry.
const tick = t => Math.round(t * 2) / 2;
const event = (g, start, duration, trial) => ({ g, start, duration, trial });

export function stormWorld({ seed = 1, count = 30, shuffled = false } = {}) {
  if (!Number.isInteger(seed) || !Number.isInteger(count) || count < 1 ||
      typeof shuffled !== 'boolean') throw new Error('Invalid storm world options');
  const rng = makeRng(seed), flashes = makeRng(seed + 10000), thunder = makeRng(seed + 20000);
  const trials = [];
  let time = 0;
  for (let index = 0; index < count; index++) {
    const start = time, flashOffset = tick(ONSET_SPAN * flashes.uniform());
    // Independently jitter lightning within a slot in BOTH conditions. This gives
    // shuffled thunder the same marginal onset distribution as causal thunder,
    // while allowing either temporal order. No trial boundaries reach the layers.
    const shuffledOffset = tick(ONSET_SPAN * thunder.uniform());
    const thunderOffset = 3000 + (shuffled ? shuffledOffset : flashOffset);
    const events = [event('lightning', start + flashOffset, 100, index),
      event('thunder', start + thunderOffset, 2000, index)];
    if (rng.uniform() < 0.5) events.push(event('bird', start + tick(rng.uniform() * ONSET_SPAN), 200, index));
    // End after the later thunder in the paired schedules, then 20 s of silence.
    // Include birds in the bound; both conditions retain identical trial starts.
    const latestEnd = Math.max(start + 5000 + Math.max(flashOffset, shuffledOffset),
      ...events.map(e => e.start + e.duration));
    rng.uniform(); // Preserve the reference bird stream's former rest-jitter draw.
    time = latestEnd + REST_MS;
    trials.push({ index, start, end: time, events });
  }
  const events = trials.flatMap(t => t.events).sort((a, b) => a.start - b.start || a.g.localeCompare(b.g));
  return { seed, shuffled, trials, duration: time, events, ...stormEnv(events) };
}

export function featureInput(features) {
  return groupInput(FEATURES, Object.fromEntries([...features].map(g => [g, 1])));
}

export function activeEvents(world, t) {
  return new Set(world.events.filter(e => t >= e.start && t < e.start + e.duration).map(e => e.g));
}

/** Passive implementation of {features, actions, step}; schedule is adapter-owned. */
export function stormEnv(events, start = 0) {
  let time = start, cursor = 0;
  const counts = Object.fromEntries(FEATURES.map(g => [g, 0]));
  const edges = events.flatMap(e => [{ t: e.start, g: e.g, d: 1 },
    { t: e.start + e.duration, g: e.g, d: -1 }]).sort((a, b) => a.t - b.t);
  return { features: FEATURES, actions: [], step(ms, action = null) {
    if (!Number.isFinite(ms) || ms <= 0 || ms % 0.5 || action !== null) throw new Error('Invalid storm step');
    while (cursor < edges.length && edges[cursor].t <= time) {
      const edge = edges[cursor++]; counts[edge.g] += edge.d;
    }
    const features = Object.fromEntries(FEATURES.map(g => [g, Number(counts[g] > 0)]));
    time += ms;
    return { features };
  } };
}
