/** One learned attractor layer. No pattern labels or pre-grouped recurrent wiring. */
import { SpikingNetwork } from './network.mjs';
import { makeRng } from './core/rng.mjs';
import { applySTDPWeights } from './stdp.mjs';
import { identifyAttractors, readout } from './readout.mjs';

const DT = 0.5, INPUT_HZ = 60, SYNC_MS = 10;
const II_SCALE = 4;
export const LAYER1 = Object.freeze({ cells: 1, fibers: 8, affScale: 4,
  degree: 20, sMax: 12, accel: 0.2, eiScale: 3, wallTarget: 3, wallScale: 4, refMs: 2 });
export const LAYER2 = Object.freeze({ cells: 3, fibers: 4, affScale: 6,
  degree: 30, sMax: 2, accel: 1, eiScale: 5, wallTarget: 0.1, wallScale: 6, refMs: 2 });

export class AttractorLayer {
  constructor({ n = 24, R = 3, seed = 1, level = 1 } = {}) {
    if (![n, R].every(x => Number.isInteger(x) && x > 0) || n < 2 || !Number.isInteger(seed) ||
        ![1, 2].includes(level)) {
      throw new Error('Layer requires n >= 2, R >= 1, an integer seed, and level 1 or 2');
    }
    this.n = n;
    this.R = R;
    const p = level === 1 ? LAYER1 : LAYER2;
    this.cellsPerLine = p.cells;
    this.fibers = p.fibers;
    const ne = n * p.cells;
    this.ticks = 0;
    this.attractors = [];
    const ni = Math.max(2, Math.ceil(ne / 4));
    this.replicas = Array.from({ length: R }, (_, r) => {
      // Same topology seed, separate runtime noise streams (lib.mjs).
      const net = new SpikingNetwork({ seed, dt: DT, pops: [
        { name: 'E', n: ne, p: { tRef: p.refMs } }, { name: 'I', n: ni, p: { C: 100, tRef: 1 } },
        { name: 'X', n: ne * p.fibers, source: true },
      ] });
      const E = net.pops.E.start, X = net.pops.X.start;
      const EE = net.connect({ from: 'E', to: 'E', inDegree: Math.min(p.degree, ne - 1),
        contacts: 10, stdp: { sMax: p.sMax, accel: p.accel, protectDormant: level === 2 } });
      // Each line has identical fixed afferents; associations are learned only in EE.
      const AFF = net.connect({ pairs: Array.from({ length: ne * p.fibers }, (_, k) =>
        [X + k, E + Math.floor(k / p.fibers)]), contacts: 10, scale: p.affScale });
      // Keep inhibitory recruitment responsive during sustained excitation.
      net.connect({ from: 'E', to: 'I', contacts: 10, scale: p.eiScale, tauRec: 50 });
      const IE = net.connect({ from: 'I', to: 'E', kind: 'inh', contacts: 10,
        pRelease: 0.5, tauRec: 100, scale: p.wallScale,
        istdp: { eta: 0.02, target: p.wallTarget, wMax: 40 } });
      net.connect({ from: 'I', to: 'I', kind: 'inhFast', contacts: 10,
        pRelease: 0.5, tauRec: 300, scale: II_SCALE });
      net.rng = makeRng(seed + 1001 + r);
      return { net, E, X, EE, IE, AFF };
    });
  }

  get t() { return this.ticks * DT; }

  /** Constant line strengths in [0,1] for this interval. Learning can be frozen for probes. */
  run(ms, input = new Float64Array(this.n), { learn = true } = {}) {
    const ticks = Math.round(ms / DT);
    if (!Number.isFinite(ms) || ms < 0 || Math.abs(ticks * DT - ms) > 1e-8 ||
        input.length !== this.n || !Array.from(input).every(x => Number.isFinite(x) && x >= 0 && x <= 1)) {
      throw new Error('Invalid duration or input strengths');
    }
    const options = this.replicas.map(({ net, X }) => {
      const rates = Float64Array.from({ length: net.N }, (_, i) =>
        i >= X ? INPUT_HZ * input[Math.floor((i - X) / (this.fibers * this.cellsPerLine))] : 0);
      return { learn, rate: i => rates[i] };
    });
    for (let k = 0; k < ticks; k++) {
      for (let r = 0; r < this.R; r++) this.replicas[r].net.step(options[r]);
      this.ticks++;
      if (learn && this.ticks % (SYNC_MS / DT) === 0) this.sync();
    }
    return this;
  }

  /** Average plastic weights only; each replica retains independent dynamic state. */
  sync() {
    if (this.R < 2) return;
    for (const key of ['EE', 'IE']) {
      if (this.replicas.some(r => r[key].frozen)) continue;
      const arrays = this.replicas.map(r => key === 'EE' ? r.EE.stdp.rho : r.IE.scale);
      for (let k = 0; k < arrays[0].length; k++) {
        let mean = 0;
        for (const a of arrays) mean += a[k];
        mean /= this.R;
        for (const a of arrays) a[k] = mean;
      }
    }
    for (const r of this.replicas) applySTDPWeights(r.EE);
  }

  identify(threshold) {
    this.sync();
    const { EE, E } = this.replicas[0];
    this.attractors = identifyAttractors(EE, this.n * this.cellsPerLine, E, threshold);
    return this.attractors;
  }

  readout(start, options) { return readout(this.replicas, this.attractors, start, options); }
}
