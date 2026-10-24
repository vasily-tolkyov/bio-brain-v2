/** Standalone, light-only attractor base. No dependency on the old network. */
export const LIGHT_BASE = Object.freeze({
  N: 250, m: 6, eta: 0.2, kappa: 0.2, lambda: 2, theta: 0.3,
});

/** The v17 Mulberry32 generator, with seeded Box–Muller noise (no cached spare). */
export function makeLightRng(seed) {
  if (!Number.isInteger(seed)) throw new TypeError('seed must be an integer');
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    uniform,
    normal() {
      let u = uniform();
      while (u === 0) u = uniform();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
    },
  };
}

/** v17's curve in coordinates normalized by the neuron rectangle W × H. */
export function defaultInputMap(v) {
  const t = 0.3 + v * Math.PI * 1.7;
  const radius = 1.1 * (0.15 + 0.25 * v);
  return [(.6 - .22) / .75 + Math.cos(t) * radius,
    (.5 - .07) / .85 + Math.sin(t) * radius];
}

export function jaccard(left, right) {
  const a = new Set(left), b = new Set(right);
  let intersection = 0;
  for (const id of a) if (b.has(id)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/** Connected components of original-set Jaccard >= threshold; no union rescoring. */
export function mergeAttractors(patterns, threshold = 0.8) {
  unitInterval(threshold, 'merge threshold');
  const parent = patterns.map((_, i) => i);
  const root = i => {
    while (parent[i] !== i) i = parent[i];
    return i;
  };
  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      if (jaccard(patterns[i], patterns[j]) >= threshold) parent[root(j)] = root(i);
    }
  }
  const groups = new Map();
  for (let i = 0; i < patterns.length; i++) {
    const key = root(i);
    if (!groups.has(key)) groups.set(key, { patternIndices: [], members: new Set() });
    const group = groups.get(key);
    group.patternIndices.push(i);
    for (const id of patterns[i]) group.members.add(id);
  }
  return [...groups.values()].map(g => ({
    patternIndices: g.patternIndices, members: [...g.members].sort((a, b) => a - b),
  }));
}

function unitInterval(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be in [0, 1]`);
  }
}

export class LightBase {
  constructor({ N = LIGHT_BASE.N, m = LIGHT_BASE.m, eta = LIGHT_BASE.eta,
    kappa = LIGHT_BASE.kappa, lambda = LIGHT_BASE.lambda, theta = LIGHT_BASE.theta,
    seed = 7, inputMap = defaultInputMap } = {}) {
    if (!Number.isInteger(N) || N < 1) throw new RangeError('N must be positive integer');
    if (!Number.isInteger(m) || m < 1 || m > N) throw new RangeError('m must be in [1, N]');
    unitInterval(eta, 'eta'); unitInterval(kappa, 'kappa'); unitInterval(theta, 'theta');
    if (!Number.isFinite(lambda) || lambda < 0) throw new RangeError('lambda must be nonnegative');
    if (typeof inputMap !== 'function') throw new TypeError('inputMap must be a function');
    this.parameters = Object.freeze({ N, m, eta, kappa, lambda, theta });
    this.inputMap = inputMap;
    const rng = makeLightRng(seed);
    this.positions = Object.freeze(Array.from({ length: N },
      () => Object.freeze([rng.uniform(), rng.uniform()])));
    // Only learned/explicitly supplied channels exist; absence never transmits light.
    // One unordered pair per entry, including a possible explicitly stored rho = 0.
    this.channels = new Map();
  }

  position(v) {
    unitInterval(v, 'input');
    const q = this.inputMap(v);
    if (!Array.isArray(q) || q.length !== 2 || !q.every(Number.isFinite)) {
      throw new TypeError('inputMap must return two finite coordinates');
    }
    return q;
  }

  sourceIds(sources) {
    const ids = [...new Set(sources)];
    for (const i of ids) {
      if (!Number.isInteger(i) || i < 0 || i >= this.parameters.N) {
        throw new RangeError('source index out of range');
      }
    }
    return ids;
  }

  nearest(v, candidates = this.positions.map((_, i) => i)) {
    const q = this.position(v);
    const distance = i => Math.hypot(this.positions[i][0] - q[0], this.positions[i][1] - q[1]);
    return this.sourceIds(candidates).sort((a, b) => distance(a) - distance(b) || a - b);
  }

  inputSources(v) { return this.nearest(v).slice(0, this.parameters.m); }

  cue(v, core, fraction) {
    unitInterval(fraction, 'cue fraction');
    const ranked = this.nearest(v, core);
    if (fraction === 0 || ranked.length === 0) return [];
    return ranked.slice(0, Math.max(1, Math.round(ranked.length * fraction)));
  }

  pairKey(i, j) {
    this.sourceIds([i, j]);
    if (i === j) throw new RangeError('self channels are not allowed');
    return Math.min(i, j) * this.parameters.N + Math.max(i, j);
  }

  rho(i, j) { return i === j ? 0 : (this.channels.get(this.pairKey(i, j)) ?? 0); }

  setChannel(i, j, rho) {
    unitInterval(rho, 'rho');
    this.channels.set(this.pairKey(i, j), rho);
  }

  learn(v) {
    const sources = this.inputSources(v);
    this.learnSources(sources);
    return sources;
  }

  learnSources(sources) {
    const ids = this.sourceIds(sources), lit = new Set(ids);
    const { N, eta, kappa } = this.parameters;
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const key = this.pairKey(ids[a], ids[b]), rho = this.channels.get(key) ?? 0;
        this.channels.set(key, rho + eta * (1 - rho));
      }
    }
    for (const [key, rho] of this.channels) {
      const i = Math.floor(key / N), j = key % N;
      if (lit.has(i) !== lit.has(j)) this.channels.set(key, rho - eta * kappa * rho);
    }
  }

  clearChannels() { this.channels.clear(); }

  channelEntries() {
    const { N } = this.parameters;
    return [...this.channels].sort(([a], [b]) => a - b).map(([key, rho]) => ({
      i: Math.floor(key / N), j: key % N, rho,
    }));
  }

  rhoMatrix() {
    const matrix = Array.from({ length: this.parameters.N }, () => Array(this.parameters.N).fill(0));
    for (const { i, j, rho } of this.channelEntries()) matrix[i][j] = matrix[j][i] = rho;
    return matrix;
  }

  propagate(sources, { intensity = 1, captureHops = false } = {}) {
    unitInterval(intensity, 'intensity');
    const { N, lambda, theta } = this.parameters;
    let brightness = Array(N).fill(0);
    for (const id of this.sourceIds(sources)) brightness[id] = intensity;
    const edges = this.channelEntries().map(({ i, j, rho }) => ({
      i, j, transmission: Math.exp(-lambda * (1 - rho)),
    }));
    const history = captureHops ? [brightness.slice()] : undefined;
    // Products cannot increase around a cycle (0 <= transmission <= 1).
    // A strongest path is simple, so N-1 hops suffice; hop N confirms stability.
    for (let iteration = 1; iteration <= N; iteration++) {
      const next = brightness.slice();
      for (const { i, j, transmission } of edges) {
        next[i] = Math.max(next[i], transmission * brightness[j]);
        next[j] = Math.max(next[j], transmission * brightness[i]);
      }
      const changed = next.some((value, i) => value > brightness[i]);
      brightness = next;
      if (history) history.push(brightness.slice());
      if (!changed) {
        const result = { brightness, lit: brightness.flatMap((b, i) => b > theta ? [i] : []),
          iterations: iteration, stable: true };
        if (history) result.history = history;
        return result;
      }
    }
    throw new Error('Light propagation did not stabilize within the simple-path bound');
  }
}
