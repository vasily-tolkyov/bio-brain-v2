/** Trimmed bio-brain spiking loop: receptor states aggregate by postsynaptic neuron. */
import { makeRng } from './core/rng.mjs';
import { LIF_DEFAULT } from './neuron/lif.mjs';
import { RECEPTORS, RECEPTOR_IDS, kernelNorm, mgBlock } from './synapse.mjs';
import { saveNetworkState, loadNetworkState } from './core/state.mjs';
import { initSTDP, stepSTDP } from './stdp.mjs';

export const ISTDP_DEFAULT = Object.freeze({ eta: 0.02, target: 5, tau: 20, wMax: 20 });
const REC = Object.values(RECEPTORS).map(r => ({ ...r, norm: kernelNorm(r) }));
// Flush tails before IEEE subnormals make long silent intervals expensive.
const decay = (x, factor) => x < 1e-300 ? 0 : x * factor;
function poisson(lambda, rng) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng.uniform(); } while (p > limit);
  return k - 1;
}

export class SpikingNetwork {
  constructor({ pops, seed = 1, dt = 0.1 }) {
    if (!(Number.isFinite(dt) && dt > 0)) throw new Error('dt must be positive');
    this.dt = dt;
    this.t = 0;
    this.rng = makeRng(seed);
    this.pops = Object.create(null);
    this.par = [];
    for (const { name, n, p = {}, source = false } of pops) {
      if (typeof name !== 'string' || this.pops[name] || !Number.isInteger(n) || n < 1) {
        throw new Error('Populations need unique names and positive integer sizes');
      }
      const params = { ...LIF_DEFAULT, ...p };
      this.pops[name] = { start: this.par.length, n, p: params, source };
      for (let i = 0; i < n; i++) this.par.push(params);
    }
    this.N = this.par.length;
    this.source = new Uint8Array(this.N);
    for (const p of Object.values(this.pops)) if (p.source) this.source.fill(1, p.start, p.start + p.n);
    // Derived cache only: avoids repeating exp() for constant input windows.
    this.sourceHz = new Float64Array(this.N).fill(NaN);
    this.sourceP = new Float64Array(this.N);
    this.V = Float64Array.from(this.par, p => p.EL);
    this.w = new Float64Array(this.N);
    this.ref = new Float64Array(this.N).fill(-Infinity);
    this.Rin = new Float64Array(this.N).fill(1);
    this.ra = REC.map(() => new Float64Array(this.N));
    this.rb = REC.map(() => new Float64Array(this.N));
    this.ea = REC.slice(0, 2).map(() => new Float64Array(this.N));
    this.eb = REC.slice(0, 2).map(() => new Float64Array(this.N));
    this.decayR = REC.map(r => Math.exp(-dt / r.tauR));
    this.decayD = REC.map(r => Math.exp(-dt / r.tauD));
    this.groups = [];
    this.out = Array.from({ length: this.N }, () => []);
    this.spikes = Array.from({ length: this.N }, () => []);
    this.fired = new Uint8Array(this.N);
  }

  idx(name) {
    const p = this.pops[name];
    if (!p) throw new Error(`Unknown population: ${name}`);
    return Array.from({ length: p.n }, (_, k) => p.start + k);
  }

  connect({ from, to, p = 1, inDegree = null, pairs = null, autapses = false,
    contacts = 5, pRelease = 0.3, tauRec = 100, scale = 1, kind = 'exc',
    istdp = null, stdp = false, tauR = 10, tauD = 30, E = 0 }) {
    if (kind !== 'slow' && !RECEPTOR_IDS[kind]) throw new Error('Unknown synapse kind');
    if (stdp && (kind !== 'exc' || istdp)) throw new Error('STDP requires an excitatory group');
    if (!(Number.isFinite(contacts) && contacts > 0 && pRelease >= 0 && pRelease <= 1 && tauRec >= this.dt &&
          Number.isFinite(scale) && scale >= 0 && Number.isFinite(tauRec))) throw new Error('Invalid synapse parameters');
    const rule = istdp ? { ...ISTDP_DEFAULT, ...istdp } : null;
    if (!Number.isFinite(E)) throw new Error('Invalid reversal potential');
    if (rule && (!(kind === 'slow' && E < 0) && !['inh', 'inhFast'].includes(kind) ||
        !Object.values(rule).every(Number.isFinite) || rule.tau <= 0 ||
        (rule.tauPre !== undefined && rule.tauPre <= 0) ||
        rule.target < 0 || rule.eta < 0 || rule.wMax < scale)) throw new Error('Invalid iSTDP parameters');
    const slow = kind === 'slow' ? { tauR, tauD, E, norm: kernelNorm({ tauR, tauD }),
      a: new Float64Array(this.N), b: new Float64Array(this.N) } : null;
    if (pairs === null) {
      const pre = this.idx(from), post = this.idx(to);
      if (!(p >= 0 && p <= 1) || (inDegree !== null &&
          !(Number.isFinite(inDegree) && inDegree >= 0))) throw new Error('Invalid wiring probability or degree');
      pairs = [];
      // As in loop/build.mjs: degree sets expected Bernoulli in-degree, not exact degree.
      for (const b of post) {
        const eligible = pre.filter(a => autapses || a !== b);
        if (inDegree > eligible.length) throw new Error('In-degree exceeds eligible sources');
        const probability = inDegree === null ? p : inDegree / eligible.length;
        for (const a of eligible) if (this.rng.uniform() < probability) pairs.push([a, b]);
      }
    }
    for (const pair of pairs) if (pair.length !== 2 || pair.some(i => !Number.isInteger(i) || i < 0 || i >= this.N)) {
      throw new Error('Invalid neuron IDs in pairs');
    }
    const g = { kind, contacts, pRelease, tauRec, istdp: rule, slow, frozen: false,
      pre: Int32Array.from(pairs, pair => pair[0]), post: Int32Array.from(pairs, pair => pair[1]),
      R: new Float64Array(this.N).fill(1), scale: new Float64Array(pairs.length).fill(scale) };
    g.sources = [...new Set(g.pre)];
    g.targets = [...new Set(g.post)];
    if (rule) { g.x = new Float64Array(this.N); g.y = new Float64Array(this.N); }
    if (stdp) initSTDP(g, this.N, this.dt, stdp);
    this.groups.push(g);
    for (let k = 0; k < pairs.length; k++) this.out[g.pre[k]].push([g, k]);
    return g;
  }

  /** Current callbacks run at tick start; spikes are timestamped at tick end. */
  step({ rate = null, nIn = 60, inContacts = 10, inPRelease = 0.3,
    inTauRec = 100, learn = true, extra = null } = {}) {
    const { dt, N, fired } = this;
    for (const g of this.groups) for (const i of g.sources) g.R[i] += dt * (1 - g.R[i]) / g.tauRec;
    for (let i = 0; i < N; i++) this.Rin[i] += dt * (1 - this.Rin[i]) / inTauRec;
    if (rate) for (let i = 0; i < N; i++) {
      if (this.source[i]) continue;
      const k = poisson(nIn * rate(i, this.t) * dt / 1000, this.rng);
      if (!k) continue;
      const ves = k * inContacts * inPRelease * this.Rin[i];
      this.Rin[i] = Math.max(0, this.Rin[i] - k * inPRelease * this.Rin[i] / nIn);
      for (let q = 0; q < 2; q++) {
        const v = ves * REC[q].q * REC[q].norm;
        this.ea[q][i] += v; this.eb[q][i] += v;
      }
    }
    for (const g of this.groups) if (g.slow) for (const i of g.targets) {
      g.slow.a[i] = decay(g.slow.a[i], Math.exp(-dt / g.slow.tauD));
      g.slow.b[i] = decay(g.slow.b[i], Math.exp(-dt / g.slow.tauR));
    }
    const ext = extra ? extra(this.t) : null;
    fired.fill(0);
    let spiked = false;
    for (let i = 0; i < N; i++) {
      if (this.source[i]) {
        if (!rate) continue;
        const hz = rate(i, this.t);
        if (hz !== this.sourceHz[i]) {
          this.sourceHz[i] = hz; this.sourceP[i] = 1 - Math.exp(-hz * dt / 1000);
        }
        if (this.rng.uniform() < this.sourceP[i]) {
          fired[i] = 1; spiked = true; this.spikes[i].push(this.t + dt);
        }
        continue;
      }
      const V = this.V[i], B = mgBlock(V), p = this.par[i];
      let I = ext?.[i] ?? 0, conductance = 0;
      for (let q = 0; q < REC.length; q++) {
        this.ra[q][i] = decay(this.ra[q][i], this.decayD[q]);
        this.rb[q][i] = decay(this.rb[q][i], this.decayR[q]);
        const g = Math.max(0, this.ra[q][i] - this.rb[q][i]) * (REC[q].mg ? B : 1);
        conductance += g; I += g * (REC[q].E - V);
      }
      for (let q = 0; q < 2; q++) {
        this.ea[q][i] = decay(this.ea[q][i], this.decayD[q]);
        this.eb[q][i] = decay(this.eb[q][i], this.decayR[q]);
        const g = Math.max(0, this.ea[q][i] - this.eb[q][i]) * (REC[q].mg ? B : 1);
        conductance += g; I += g * (REC[q].E - V);
      }
      for (const g of this.groups) if (g.slow) {
        const value = Math.max(0, g.slow.a[i] - g.slow.b[i]);
        conductance += value; I += value * (g.slow.E - V);
      }
      this.w[i] += dt * (p.a * (V - p.EL) - this.w[i]) / p.tauW;
      if (this.t + dt < this.ref[i]) continue;
      // Treat synaptic conductance implicitly: a strong inhibitory volley must
      // approach its reversal, never overshoot and rebound into a false spike.
      this.V[i] = V + dt * (-p.gL * (V - p.EL) - this.w[i] + I) / (p.C + dt * conductance);
      if (this.V[i] >= p.Vth) {
        this.V[i] = p.Vreset; this.w[i] += p.b;
        this.ref[i] = this.t + dt + p.tRef;
        fired[i] = 1; spiked = true; this.spikes[i].push(this.t + dt);
      }
    }
    for (let j = 0; j < N; j++) if (fired[j]) {
      for (const [g, k] of this.out[j]) {
        const i = g.post[k], s = g.contacts * g.pRelease * g.R[j] * g.scale[k];
        if (g.slow) {
          const v = s * REC[0].q * g.slow.norm;
          g.slow.a[i] += v; g.slow.b[i] += v;
        } else for (const q of RECEPTOR_IDS[g.kind]) {
          const v = s * REC[q].q * REC[q].norm;
          this.ra[q][i] += v; this.rb[q][i] += v;
        }
      }
    }
    for (const g of this.groups) {
      // One depletion per source/group, independent of fan-out.
      for (const j of g.sources) if (fired[j]) g.R[j] *= 1 - g.pRelease;
      if (g.stdp) stepSTDP(g, fired, dt, learn);
      if (!g.istdp) continue;
      const { eta, target, tau, wMax, tauPre = tau } = g.istdp;
      const alpha = target * (tau + tauPre) / 1000;
      if (learn && !g.frozen && spiked) for (let k = 0; k < g.pre.length; k++) {
        const a = g.pre[k], b = g.post[k];
        if (!fired[a] && !fired[b]) continue;
        // Vogels: strengthen inhibition above target, weaken below target.
        const change = fired[a] * (g.y[b] - alpha) + fired[b] * g.x[a];
        g.scale[k] = Math.min(wMax, Math.max(0, g.scale[k] + eta * change));
      }
      const dx = Math.exp(-dt / tauPre), dy = Math.exp(-dt / tau);
      // Only these traces enter this group's rule; other population entries stay zero.
      for (const i of g.sources) g.x[i] = decay(g.x[i] + fired[i], dx);
      for (const i of g.targets) g.y[i] = decay(g.y[i] + fired[i], dy);
    }
    this.t += dt;
    return fired;
  }

  run(ms, options = {}) {
    const ticks = Math.round(ms / this.dt);
    if (!Number.isFinite(ms) || ms < 0 || Math.abs(ticks * this.dt - ms) > 1e-8) {
      throw new Error('Duration must be a nonnegative integral number of ticks');
    }
    for (let k = 0; k < ticks; k++) this.step(options);
  }

  saveState() { return saveNetworkState(this); }
  loadState(state) { loadNetworkState(this, state); return this; }
}
