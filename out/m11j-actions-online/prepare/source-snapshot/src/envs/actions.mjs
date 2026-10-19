/** One replaceable behavior simulation. No neural code depends on these names. */
import { makeRng } from '../core/rng.mjs';

export const FEATURES = Object.freeze(['light', 'bell', 'bird']);
export const ACTIONS = Object.freeze(['press', 'wave', 'idle']);
export const ACTION_WORLD = Object.freeze({ slotMs: 34000, onsetSpanMs: 10000,
  durationMs: 200, pressDelayMs: 3000, waveDelayMs: 1000 });
const onset = rng => 100 * Math.floor(rng.uniform() * ACTION_WORLD.onsetSpanMs / 100);

export function actionsEnv({ seed = 1, count = 30, shuffled = false } = {}) {
  if (!Number.isInteger(seed) || !Number.isInteger(count) || count < 1 ||
      typeof shuffled !== 'boolean') throw new Error('Invalid action world');
  const bird = makeRng(seed + 10000), outcomes = makeRng(seed + 20000);
  const events = [], executed = [];
  let time = 0;
  for (let trial = 0; trial < count; trial++) {
    const start = trial * ACTION_WORLD.slotMs;
    events.push({ g: 'bird', start: start + onset(bird), duration: ACTION_WORLD.durationMs });
    for (const [g, delay] of [['light', ACTION_WORLD.pressDelayMs], ['bell', ACTION_WORLD.waveDelayMs]]) {
      const at = start + onset(outcomes) + delay;
      if (shuffled) events.push({ g, start: at, duration: ACTION_WORLD.durationMs });
    }
  }
  let pending = [...events];
  return { features: FEATURES, actions: ACTIONS, events, executed,
    duration: count * ACTION_WORLD.slotMs,
    step(ms, action = null) {
      if (!Number.isFinite(ms) || ms <= 0 || ms % 0.5 ||
          (action !== null && !ACTIONS.includes(action))) throw new Error('Invalid action step');
      if (action !== null) {
        executed.push({ action, t: time });
        if (!shuffled && action !== 'idle') {
          const e = { g: action === 'press' ? 'light' : 'bell', duration: ACTION_WORLD.durationMs,
            start: time + (action === 'press' ? ACTION_WORLD.pressDelayMs : ACTION_WORLD.waveDelayMs) };
          events.push(e); pending.push(e);
        }
      }
      pending = pending.filter(e => time < e.start + e.duration);
      const features = Object.fromEntries(FEATURES.map(g => [g,
        Number(pending.some(e => e.g === g && time >= e.start))]));
      time += ms;
      return { features };
    },
  };
}

/** M10 curriculum: action-only T1, observation-only T2, then the complete world. */
export const CHAIN_WORLD = Object.freeze({ bellDelayMs: 1000 });

export function chainEnv({ seed = 1, count = 30, phase = 'goal' } = {}) {
  if (!Number.isInteger(seed) || !Number.isInteger(count) || count < 1 ||
      !['T1', 'T2', 'goal'].includes(phase)) throw new Error('Invalid chain world');
  const bird = makeRng(seed + 10000), lights = makeRng(seed + 20000);
  const events = [], executed = [];
  let time = 0, pending = [];
  const add = (g, start) => {
    const e = { g, start, duration: ACTION_WORLD.durationMs };
    events.push(e); pending.push(e);
  };
  const light = start => {
    add('light', start);
    if (phase !== 'T1') add('bell', start + CHAIN_WORLD.bellDelayMs);
  };
  for (let trial = 0; trial < count; trial++) {
    const start = trial * ACTION_WORLD.slotMs;
    add('bird', start + onset(bird));
    if (phase === 'T2') light(start + onset(lights));
  }
  return { features: FEATURES, actions: ACTIONS, events, executed,
    duration: count * ACTION_WORLD.slotMs,
    step(ms, action = null) {
      if (!Number.isFinite(ms) || ms <= 0 || ms % 0.5 ||
          (action !== null && (!ACTIONS.includes(action) || phase === 'T2'))) {
        throw new Error('Invalid chain step');
      }
      if (action !== null) {
        executed.push({ action, t: time });
        if (action === 'press') light(time + ACTION_WORLD.pressDelayMs);
      }
      pending = pending.filter(e => time < e.start + e.duration);
      const features = Object.fromEntries(FEATURES.map(g => [g,
        Number(pending.some(e => e.g === g && time >= e.start))]));
      time += ms;
      return { features };
    },
  };
}
