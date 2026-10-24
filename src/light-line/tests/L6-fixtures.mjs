export function random(seed) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
export const DECLARATIONS = [{ name: 'energy', min: 0, max: 100, setpoint: 70, bins: 5 }];
export const ACTIONS = ['press', 'wave', 'nibble', 'eat', 'idle'];
export const FEATURES = ['light', 'bell', 'tone'];

/** External environment fixture. Actions cause delayed real sensor changes;
 * light also precedes bell. No network, weights, goal IDs or training API. */
export function fixtureWorld({ initial = 30, reward = 'off' } = {}) {
  let t = 0, energy = initial, pending = [], rewardValue = 0;
  const executed = [], effects = [];
  return { features: FEATURES, actions: ACTIONS, interoception: DECLARATIONS,
    sourceLabels: Object.fromEntries([...FEATURES.map(f => [f, `sensor:${f}`]), ...ACTIONS.map(a => [`action:${a}`, `motor:${a}`])]),
    executed, effects,
    reset(value = initial) { energy = value; pending = []; },
    get time() { return t; },
    get energy() { return energy; },
    step(ms, action = null) {
      if (action !== null) {
        if (!ACTIONS.includes(action)) throw new Error('Unknown action');
        executed.push({ t, action });
        if (action === 'press') pending.push({ at: t + 3200, feature: 'light' }, { at: t + 4000, feature: 'bell' });
        if (action === 'wave') pending.push({ at: t + 800, feature: 'tone' });
        if (['nibble', 'eat'].includes(action)) pending.push({ at: t + 800, increase: action === 'eat' ? 40 : 20 });
      }
      for (const event of pending.filter(e => e.increase && !e.done && e.at <= t)) {
        const before = energy; energy = Math.min(100, energy + event.increase); event.done = true;
        effects.push({ t, before, after: energy });
      }
      const features = Object.fromEntries(FEATURES.map(f => [f, Number(pending.some(e => e.feature === f && t >= e.at && t < e.at + 100))]));
      pending = pending.filter(e => e.at + 100 > t);
      rewardValue = reward === 'positive' ? 17 : reward === 'negative' ? -23 : reward === 'on' ? Math.sin(t / 777) : 0;
      const sample = { features, interoception: { energy }, reward: rewardValue };
      t += ms; return sample;
    },
  };
}

/** Independent ambient readings for optical formation. Each sample is drawn
 * from the same fixed distribution, including mixed features and changing
 * body readings. Executed actions are recorded, not desired group labels. */
export function ambientWorld(seed) {
  const rng = random(seed), executed = [], samples = [];
  let t = 0, sample;
  return { features: FEATURES, actions: ACTIONS, interoception: DECLARATIONS, executed, samples,
    step(ms, action = null) {
      if (t % 100 === 0) {
        sample = { features: Object.fromEntries(FEATURES.map(f => [f, Number(rng() < .1)])),
          interoception: { energy: rng() * 100 } };
        samples.push({ t, ...structuredClone(sample) });
      }
      if (action !== null) executed.push({ t, action });
      t += ms; return sample;
    } };
}
