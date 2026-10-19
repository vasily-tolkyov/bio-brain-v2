/** Fixed environment boundary. No world-specific state is read by the core. */
import { AttractorLayer } from './layer.mjs';
import { WINDOW_MS } from './readout.mjs';

export const LINES_PER_GROUP = 6, IO_DT = 0.5;
const TEACHER = Object.freeze({ onMs: 500, offMs: 300, settleMs: 1000, epochs: 12 });
export const actionId = name => `action:${name}`;

export function checkEnv(env) {
  for (const key of ['features', 'actions']) {
    const names = env?.[key];
    if (!Array.isArray(names) || new Set(names).size !== names.length ||
        names.some(n => typeof n !== 'string' || !n.length)) throw new Error(`Invalid env.${key}`);
  }
  if (!env.features.length || typeof env.step !== 'function') throw new Error('Invalid env interface');
  return env;
}

export function groupInput(names, strengths) {
  const input = new Float64Array(names.length * LINES_PER_GROUP);
  for (const name of Object.keys(strengths)) if (!names.includes(name)) throw new Error(`Unknown feature: ${name}`);
  names.forEach((name, i) => {
    const s = Object.hasOwn(strengths, name) ? strengths[name] : 0;
    if (!Number.isFinite(s) || s < 0 || s > 1) throw new Error('Invalid feature strength');
    input.fill(s, i * LINES_PER_GROUP, (i + 1) * LINES_PER_GROUP);
  });
  return input;
}

/** The same isolated teacher protocol for sensory and motor line groups. */
export function teachGroups(names, seed) {
  const layer = new AttractorLayer({ n: names.length * LINES_PER_GROUP, seed });
  for (let epoch = 1; epoch <= TEACHER.epochs; epoch++) {
    for (let p = 0; p < names.length; p++) {
      layer.run(TEACHER.onMs, groupInput(names, { [names[(p + epoch - 1) % names.length]]: 1 }));
      layer.run(TEACHER.offMs);
    }
    const attractors = layer.identify();
    const mapping = names.map((feature, row) => ({ feature, ...attractors.find(a =>
      a.members.length === LINES_PER_GROUP &&
      a.members.every(i => Math.floor(i / LINES_PER_GROUP) === row)) }));
    if (attractors.length !== names.length || mapping.some(a => a.id === undefined)) continue;
    layer.run(TEACHER.settleMs);
    discardHistory(layer);
    return { layer, mapping, epochs: epoch, durationMs: layer.t };
  }
  throw new Error(`Seed ${seed}: teacher did not identify complete line groups`);
}

/** Sample at neural resolution; batch identical inputs. Called outside layer.run. */
export function presentWindow(layer, env, ms = WINDOW_MS, options = {}, action = null) {
  if (!Number.isFinite(ms) || ms <= 0 || ms % IO_DT) throw new Error('Invalid IO duration');
  if (action !== null && !env.actions.includes(action)) throw new Error('Unknown action');
  let previous, held = 0;
  for (let t = 0; t < ms; t += IO_DT) {
    const sample = env.step(IO_DT, t === 0 ? action : null);
    if (!sample?.features || typeof sample.features !== 'object') throw new Error('Invalid env observation');
    const input = groupInput(env.features, sample.features);
    if (previous && input.some((x, i) => x !== previous[i])) {
      layer.run(held, previous, options); held = 0;
    }
    previous = input; held += IO_DT;
  }
  layer.run(held, previous, options);
}

/** Observation rows first, then motor rows. Only a sent primitive creates a copy. */
export function stepIO({ env, layer1, output, unroll }, t, drive) {
  const executed = output.step(drive), start = layer1.t;
  presentWindow(layer1, env, WINDOW_MS, {}, executed.action);
  const lit = layer1.readout(start);
  unroll.update(t, [...lit, ...(executed.action === null ? [] :
    [{ id: actionId(executed.action), strength: executed.strength }])]);
  return { t, lit, executed, lines: unroll.lines(t) };
}

export function discardHistory(layer) {
  for (const { net } of layer.replicas) for (const spikes of net.spikes) {
    const last = spikes.at(-1);
    spikes.length = 0;
    if (last >= net.t - 1e-7) spikes.push(last);
  }
}
