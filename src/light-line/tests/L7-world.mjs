/** Serializable natural environment fixture. This keeps the L6 action/body
 * effects; fixture cues and omissions exercise timing without teaching groups. */
import { equal, check, integer, unit, keys, jsonData } from '../state-validation.mjs';
export const FEATURES = ['light', 'bell', 'tone'];
export const ACTIONS = ['press', 'wave', 'nibble', 'eat', 'idle'];
export const BODY = [{ name: 'energy', min: 0, max: 100, setpoint: 70, bins: 5 }];
export const vector = action => ACTIONS.map(a => Number(a === action));
export class ContinuationWorld {
  constructor(seed = 101, { initial = 30, cues = [], omit = [] } = {}) {
    this.features = [...FEATURES]; this.actions = [...ACTIONS]; this.interoception = structuredClone(BODY);
    this.sourceLabels = Object.fromEntries([...FEATURES.map(f => [f, `sensor:${f}`]), ...ACTIONS.map(a => [`action:${a}`, `motor:${a}`])]);
    this.descriptor = { id: 'L7-natural-action-world-v1', seed, initial, cues: structuredClone(cues), omit: [...omit],
      features: FEATURES, actions: ACTIONS, interoception: BODY };
    this.state = { t: 0, energy: initial, pending: [], executed: [], effects: [], rng: seed >>> 0, samples: 0, noise: 0 };
  }
  get time() { return this.state.t; }
  get executed() { return this.state.executed; }
  step(ms, action = null) {
    const s = this.state; check(ms === .5, 'environment sample step');
    if (action !== null) {
      check(ACTIONS.includes(action), 'environment action'); s.executed.push({ t: s.t, action });
      if (!this.descriptor.omit.includes(action)) {
        if (action === 'press') s.pending.push({ at: s.t + 3200, feature: 'light' }, { at: s.t + 4000, feature: 'bell' });
        if (action === 'wave') s.pending.push({ at: s.t + 800, feature: 'tone' });
        if (action === 'nibble' || action === 'eat') s.pending.push({ at: s.t + 800, increase: action === 'eat' ? 40 : 20 });
      }
    }
    for (const e of s.pending.filter(e => e.increase && !e.done && e.at <= s.t)) {
      const before = s.energy; s.energy = Math.min(100, s.energy + e.increase); e.done = true;
      s.effects.push({ t: s.t, before, after: s.energy });
    }
    // Private RNG is consumed on every IO sample and affects a small natural
    // tone amplitude. It must resume, including inside a window.
    let x = s.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rng = x >>> 0;
    if (s.t % 100 === 0) s.noise = s.rng / 4294967296 * .001; s.samples++;
    const features = Object.fromEntries(FEATURES.map(f => [f, Math.max(f === 'tone' && s.t % 1000 < 100 ? s.noise : 0,
      Number([...s.pending, ...this.descriptor.cues].some(e => e.feature === f && s.t >= e.at && s.t < e.at + (e.duration ?? 100))))]));
    s.pending = s.pending.filter(e => e.at + 100 > s.t);
    const sample = { features, interoception: { energy: s.energy } }; s.t += ms; return sample;
  }
  saveState() { return structuredClone(this.state); }
  loadState(raw) {
    jsonData(raw); keys(raw, ['t', 'energy', 'pending', 'executed', 'effects', 'rng', 'samples', 'noise']);
    check(integer(raw.t * 2) && raw.samples === raw.t * 2 && integer(raw.rng) && raw.rng < 4294967296 &&
      Number.isFinite(raw.energy) && raw.energy >= 0 && raw.energy <= 100 && unit(raw.noise), 'environment state');
    for (const e of raw.pending) check(integer(e.at * 2) && (FEATURES.includes(e.feature) || [20, 40].includes(e.increase)) && e.at + 100 >= raw.t, 'environment event');
    for (const e of raw.executed) check(integer(e.t * 2) && e.t < raw.t && ACTIONS.includes(e.action), 'environment execution');
    for (const e of raw.effects) check(integer(e.t * 2) && e.t < raw.t && e.after >= e.before && e.after <= 100, 'environment body effect');
    this.state = structuredClone(raw); equal(this.saveState(), raw); return this;
  }
}
