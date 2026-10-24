/** Phase 3: phase-1 scalar strength plus an independent accumulated color density. */
import { LightBase } from './light-base.mjs';
export { makeLightRng, defaultInputMap, jaccard, mergeAttractors } from './light-base.mjs';

export const COLOR_BASE = Object.freeze({ N: 250, m: 6, eta: .2, kappa: .2,
  theta: .3, bins: 200, w: .015 });
export const FROZEN_CURVE = Object.freeze({ id: 'hill-q4-h1.5', family: 'hill', q: 4, h: 1.5 });

function unit(x, name) {
  if (!Number.isFinite(x) || x < 0 || x > 1) throw new RangeError(`${name} must be in [0,1]`);
}
export function strengthTransmission(rho, curve = 'hill') {
  unit(rho, 'rho');
  if (curve === 'exp-diagnostic') return Math.exp(-2 * (1 - rho));
  if (curve !== 'hill') throw new RangeError('Only frozen hill and exp-diagnostic are supported');
  return rho ** 4 / (rho ** 4 + (1.5 * (1 - rho)) ** 4);
}

export class LightBaseColor extends LightBase {
  constructor({ mode = 'color', ...options } = {}) {
    if (!['color', 'monochrome'].includes(mode)) throw new RangeError('Unknown mode');
    super({ ...COLOR_BASE, ...options });
    const { lambda, ...parameters } = this.parameters;
    this.parameters = Object.freeze({ ...parameters, bins: 200, w: .015 });
    Object.defineProperty(this, 'mode', { value: mode, enumerable: true });
    this.wavelengths = Object.freeze(Array.from({ length: 200 }, (_, b) => b / 199));
    this.colors = new Map();
  }

  learn(x) {
    const sources = this.inputSources(x);
    this.learnSources(sources, x);
    return sources;
  }

  learnSources(sources, x) {
    unit(x, 'input color');
    const ids = this.sourceIds(sources);
    // This is the exact unchanged scalar phase-1 update, independent of x and H.
    super.learnSources(ids);
    const kernel = this.wavelengths.map(c => Math.exp(-.5 * ((c - x) / this.parameters.w) ** 2));
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const key = this.pairKey(ids[a], ids[b]);
      if (!this.colors.has(key)) this.colors.set(key, new Float64Array(200));
      const H = this.colors.get(key);
      for (let bin = 0; bin < 200; bin++) H[bin] += kernel[bin];
    }
    // Exactly-one-lit and neither-lit events never change any color bin.
    // Both modes learn identical H; monochrome bypasses match only in transmission.
  }

  setChannel(i, j, rho, distribution = new Float64Array(200)) {
    const H = Array.from(distribution);
    if (H.length !== 200 || H.some(v => !Number.isFinite(v) || v < 0)) {
      throw new RangeError('Color distribution must contain 200 finite nonnegative bins');
    }
    super.setChannel(i, j, rho);
    this.colors.set(this.pairKey(i, j), Float64Array.from(H));
  }

  match(i, j, x) {
    unit(x, 'input color');
    if (i === j) return 0;
    const key = this.pairKey(i, j);
    if (!this.channels.has(key)) return 0;
    if (this.mode === 'monochrome') return 1;
    const H = this.colors.get(key);
    if (!H) return 0;
    const peak = Math.max(...H);
    if (peak === 0) return 0;
    const coordinate = x * 199, lo = Math.floor(coordinate), hi = Math.min(199, lo + 1);
    // Convex interpolation of peak-normalized bins: bounded without clipping.
    const alpha = coordinate - lo;
    return (1 - alpha) * (H[lo] / peak) + alpha * (H[hi] / peak);
  }

  clearChannels() { super.clearChannels(); this.colors.clear(); }

  colorEntries() {
    return this.channelEntries().map(e => ({ ...e,
      H: Array.from(this.colors.get(this.pairKey(e.i, e.j)) ?? new Float64Array(200)) }));
  }

  edgesAt(x, curve = 'hill') {
    unit(x, 'input color');
    strengthTransmission(0, curve);
    return this.channelEntries().map(e => {
      const match = this.match(e.i, e.j, x), t = strengthTransmission(e.rho, curve);
      return { ...e, match, strengthTransmission: t, transmission: t * match };
    });
  }

  propagate(sources, x, { intensity = 1, captureHops = false, curve = 'hill' } = {}) {
    unit(x, 'input color'); unit(intensity, 'intensity');
    const { N, theta } = this.parameters, edges = this.edgesAt(x, curve);
    let brightness = Array(N).fill(0), paths = Array.from({ length: N }, () => []);
    for (const id of this.sourceIds(sources)) { brightness[id] = intensity; paths[id] = [id]; }
    const history = captureHops ? [brightness.slice()] : undefined;
    // The same cue x is used on every hop, with no labels or membership information.
    // All factors <=1: a strongest path can be simple, so N-1 hops suffice.
    for (let iteration = 1; iteration <= N; iteration++) {
      const next = brightness.slice(), nextPaths = paths.slice();
      for (const { i, j, transmission } of edges) {
        if (transmission * brightness[j] > next[i]) {
          next[i] = transmission * brightness[j]; nextPaths[i] = [...paths[j], i];
        }
        if (transmission * brightness[i] > next[j]) {
          next[j] = transmission * brightness[i]; nextPaths[j] = [...paths[i], j];
        }
      }
      const changed = next.some((b, i) => b > brightness[i]);
      brightness = next; paths = nextPaths;
      if (history) history.push(brightness.slice());
      if (!changed) return { color: x, curve, brightness, paths,
        lit: brightness.flatMap((b, i) => b > theta ? [i] : []),
        iterations: iteration, stable: true, ...(history ? { history } : {}) };
    }
    throw new Error('Propagation exceeded the strongest-simple-path bound');
  }
}
