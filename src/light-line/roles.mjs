import { LightAttractorLayer } from './index.mjs';
import { encode } from './encoding.mjs';
import { ROLE_CONTINUOUS } from './role-config.mjs';

const namesOf = names => {
  if (!Array.isArray(names) || !names.length || Array.from(names).some(n => typeof n !== 'string' || !n.length)
      || new Set(names).size !== names.length) throw new TypeError('Expected unique nonempty port names');
  return Object.freeze([...names]);
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const optionsOnly = (options, keys) => {
  if (!record(options) || Object.keys(options).some(k => !keys.includes(k))) throw new TypeError('Unknown role options');
};

// Names stop here. The accepted layer receives only ordered numeric ports and
// amplitudes / physical partial cues. Port coordinates are the L1 arithmetic map.
class NamedRole {
  #names;
  #layer;
  constructor(names, { seed = 7, continuous = ROLE_CONTINUOUS } = {}) {
    this.#names = namesOf(names);
    this.#layer = new LightAttractorLayer({ seed, ports: names.length, continuous });
  }
  get names() { return [...this.#names]; }
  get layer() { return this.#layer; }
  get ports() { return this.#layer.ports.map((p, i) => ({ name: this.#names[i], ...p })); }
  vector(input = {}) {
    let values;
    if (Array.isArray(input)) values = structuredClone(input);
    else {
      if (!record(input) || Object.keys(input).some(k => !this.#names.includes(k))) throw new TypeError('Unknown input port');
      values = this.#names.map(n => Object.hasOwn(input, n) ? structuredClone(input[n]) : 0);
    }
    encode(this.#layer.ports, values);
    return values;
  }
  present(input, durationMs = .5) { return this.#layer.present(this.vector(input), durationMs); }
  freeze(value = true) { this.#layer.freeze(value); return this; }
}

export class SensoryRole extends NamedRole {
  constructor(options = {}) {
    optionsOnly(options, ['seed', 'continuous', 'features']);
    const { features = ['light', 'bell', 'bird'], ...base } = options;
    super(features, base);
  }
}

export class MotorRole extends NamedRole {
  constructor(options = {}) {
    optionsOnly(options, ['seed', 'continuous', 'actions']);
    const { actions = ['press', 'wave', 'idle', 'eat'], ...base } = options;
    super(actions, base);
  }
  vector(input = {}) {
    // A string records an action chosen or executed outside this stack.
    return super.vector(typeof input === 'string' ? { [input]: 1 } : input);
  }
}

export class BodyRole {
  #quantities;
  #roles;
  constructor(options = {}) {
    optionsOnly(options, ['seed', 'continuous', 'quantities']);
    const { seed = 7, continuous, quantities = [
      { name: 'energy', edges: [1 / 3, 2 / 3] },
      { name: 'hydration', edges: [1 / 3, 2 / 3] },
    ] } = options;
    if (!Array.isArray(quantities) || !quantities.length) throw new TypeError('Expected body quantities');
    namesOf(Array.from(quantities, q => q?.name));
    this.#quantities = Array.from(quantities, q => {
      optionsOnly(q, ['name', 'edges']);
      if (!Array.isArray(q.edges) || Array.from(q.edges).some((e, i) => !Number.isFinite(e)
          || e <= 0 || e >= 1 || (i > 0 && e <= q.edges[i - 1]))) throw new RangeError('Expected increasing bin edges inside (0,1)');
      return { name: q.name, edges: [...q.edges] };
    });
    this.#roles = this.#quantities.map(q => new NamedRole(
      Array.from({ length: q.edges.length + 1 }, (_, i) => `${q.name}:${i}`), { seed, continuous }));
  }
  get quantities() { return structuredClone(this.#quantities); }
  get layers() { return this.#roles.map((r, i) => ({ quantity: this.#quantities[i].name, layer: r.layer })); }
  get ports() { return this.#roles.map((r, i) => ({ quantity: this.#quantities[i].name, ports: r.ports })); }
  vectors(readings = {}) {
    if (!record(readings) || Object.keys(readings).some(k => !this.#quantities.some(q => q.name === k))) {
      throw new TypeError('Unknown interoception quantity');
    }
    return this.#quantities.map((q, i) => {
      if (!Object.hasOwn(readings, q.name)) return this.#roles[i].vector({});
      const value = readings[q.name];
      // Arrays are already binned scripted readings, including uncertain mixtures.
      if (Array.isArray(value)) return this.#roles[i].vector(value);
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Interoception must be in [0,1]');
      const bin = q.edges.filter(edge => value >= edge).length;
      return this.#roles[i].vector({ [`${q.name}:${bin}`]: 1 });
    });
  }
  present(readings, durationMs = .5) {
    const vectors = this.vectors(readings);
    // All quantities validate before any presentation changes learned state.
    if (!Number.isSafeInteger(durationMs / .5) || durationMs < 0
        || this.#roles.some(r => !Number.isSafeInteger((r.layer.clock + durationMs) / .5))) {
      throw new RangeError('Duration must use safe .5 ms ticks');
    }
    return this.#roles.map((r, i) => r.present(vectors[i], durationMs));
  }
  freeze(value = true) { this.#roles.forEach(r => r.freeze(value)); return this; }
}
