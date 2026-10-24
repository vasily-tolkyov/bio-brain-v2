/** Phase 4: unchanged scalar learning/max-product with registered color unions. */
import { LightBase } from './light-base.mjs';
import { LightBaseColor } from './light-base-color.mjs';
export { strengthTransmission, FROZEN_CURVE, makeLightRng, jaccard, mergeAttractors } from './light-base-color.mjs';

export const COLOR_RULES = Object.freeze(['peak', 'sum', 'union']);
export function sampleMatch(samples, x, w, rule) {
  if (!Number.isFinite(x) || x < 0 || x > 1) throw new RangeError('Invalid color');
  if (![.015, .03, .05].includes(w)) throw new RangeError('Unregistered width');
  if (!['sum', 'union'].includes(rule)) throw new RangeError('Expected a union rule');
  let sum = 0, logComplement = 0;
  for (const sample of samples) {
    const g = Math.exp(-.5 * ((x - sample) / w) ** 2);
    sum += g;
    logComplement += Math.log1p(-g);
  }
  // expm1/log1p preserve tiny nonzero tails; exactly equal to 1-prod(1-g).
  return rule === 'sum' ? Math.min(1, sum) : -Math.expm1(logComplement);
}

export class LightBaseColorV2 extends LightBaseColor {
  constructor({ rule = 'peak', w = .015, ...options } = {}) {
    if (!COLOR_RULES.includes(rule) || ![.015, .03, .05].includes(w) || (rule === 'peak' && w !== .015)) {
      throw new RangeError('Unregistered color candidate');
    }
    super(options);
    this.parameters = Object.freeze({ ...this.parameters, w });
    Object.defineProperty(this, 'rule', { value: rule, enumerable: true });
    this.samples = new Map();
  }

  learnSources(sources, x) {
    if (!Number.isFinite(x) || x < 0 || x > 1) throw new RangeError('Invalid color');
    const ids = this.sourceIds(sources);
    LightBase.prototype.learnSources.call(this, ids);
    const kernel = this.wavelengths.map(c => Math.exp(-.5 * ((c - x) / this.parameters.w) ** 2));
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const key = this.pairKey(ids[a], ids[b]);
      if (!this.samples.has(key)) this.samples.set(key, []);
      this.samples.get(key).push(x);
      if (!this.colors.has(key)) this.colors.set(key, new Float64Array(200));
      const H = this.colors.get(key);
      for (let bin = 0; bin < 200; bin++) H[bin] += kernel[bin];
    }
  }

  match(i, j, x) {
    if (!Number.isFinite(x) || x < 0 || x > 1) throw new RangeError('Invalid color');
    if (i === j || !this.channels.has(this.pairKey(i, j))) return 0;
    if (this.mode === 'monochrome') return 1;
    if (this.rule === 'peak') return super.match(i, j, x);
    return sampleMatch(this.samples.get(this.pairKey(i, j)) ?? [], x, this.parameters.w, this.rule);
  }

  colorEntries() {
    return super.colorEntries().map(e => ({ ...e, samples: [...(this.samples.get(this.pairKey(e.i, e.j)) ?? [])] }));
  }

  clearChannels() { super.clearChannels(); this.samples.clear(); }
}

/** Membership is evaluation metadata; it never enters the optical model. */
export function deriveMembers(base, data, definition) {
  const centers = [.1, .3, .5, .7, .9];
  const direct = centers.map(() => Array(base.parameters.N).fill(0));
  for (const row of data.schedule) for (const i of row.sources) direct[row.classIndex][i]++;
  const replay = [], propagated = centers.map(() => Array(base.parameters.N).fill(0));
  if (definition.kind === 'M2') {
    for (const row of data.schedule) {
      const field = base.propagate(row.sources, row.input);
      for (const i of field.lit) propagated[row.classIndex][i]++;
      replay.push({ presentation: row.presentation, classIndex: row.classIndex, sources: row.sources, ...field });
    }
  } else if (definition.kind !== 'M1' || ![5, 8, 10].includes(definition.count)) {
    throw new RangeError('Unregistered member definition');
  }
  const adjacency = Array.from({ length: base.parameters.N }, () => []);
  for (const { i, j, rho } of base.channelEntries()) if (rho >= .5) {
    adjacency[i].push(j); adjacency[j].push(i);
  }
  const members = centers.map((center, c) => {
    const anchors = base.inputSources(center), reachable = new Set(anchors), queue = [...anchors];
    for (let k = 0; k < queue.length; k++) for (const i of adjacency[queue[k]]) {
      if (!reachable.has(i)) { reachable.add(i); queue.push(i); }
    }
    const counts = definition.kind === 'M2' ? propagated[c] : direct[c];
    const frequent = counts.flatMap((n, i) => n >= (definition.kind === 'M2' ? 10 : definition.count) ? [i] : []);
    const ids = definition.kind === 'M2' ? frequent : [...new Set([...anchors, ...frequent.filter(i => reachable.has(i))])];
    return { center, anchors, members: ids.sort((a, b) => a - b), activationCounts: direct[c],
      propagatedCounts: definition.kind === 'M2' ? propagated[c] : null, frequent,
      strongReachable: [...reachable].sort((a, b) => a - b), definition };
  });
  return { members, replay };
}
