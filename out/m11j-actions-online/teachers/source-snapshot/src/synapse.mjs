/** Dual-exponential conductances and short-term depression, ported from bio-brain. */
export const RECEPTORS = {
  AMPA: { tauR: 0.2, tauD: 2, E: 0, q: 0.3 },
  NMDA: { tauR: 2, tauD: 40, E: 0, q: 0.15, mg: true },
  GABA_A: { tauR: 0.5, tauD: 10, E: -75, q: 0.5 },
  GABA_A_fast: { tauR: 0.3, tauD: 4, E: -75, q: 0.5 },
};
export const mgBlock = V => 1 / (1 + Math.exp(-0.062 * V) / 3.57);
export function kernelNorm({ tauR, tauD }) {
  if (!(Number.isFinite(tauR) && Number.isFinite(tauD) && tauR > 0 && tauD > tauR)) {
    throw new Error('Receptor requires 0 < tauR < tauD');
  }
  const tp = tauR * tauD / (tauD - tauR) * Math.log(tauD / tauR);
  return 1 / (Math.exp(-tp / tauD) - Math.exp(-tp / tauR));
}
export const RECEPTOR_IDS = { exc: [0, 1], nmda: [1], inh: [2], inhFast: [3] };

export class Synapse {
  constructor({ kind = 'exc', contacts = 5, pRelease = 0.5, scale = 1,
    tauRec = 500, tauR = 10, tauD = 30 } = {}) {
    if (kind !== 'slow' && !RECEPTOR_IDS[kind]) throw new Error('Unknown synapse kind');
    const recipes = kind === 'slow' ? [{ tauR, tauD, E: 0, q: RECEPTORS.AMPA.q }]
      : RECEPTOR_IDS[kind].map(i => Object.values(RECEPTORS)[i]);
    this.receptors = recipes.map(r => ({ ...r, norm: kernelNorm(r), a: 0, b: 0 }));
    Object.assign(this, { contacts, pRelease, scale, tauRec });
    this.R = 1;
  }

  presynapticSpike() {
    const vesicles = this.contacts * this.pRelease * this.R;
    this.R = Math.max(0, this.R - vesicles / this.contacts);
    for (const r of this.receptors) {
      const kick = vesicles * r.q * this.scale * r.norm;
      r.a += kick; r.b += kick;
    }
    return vesicles;
  }

  step(dt, V) {
    this.R += dt * (1 - this.R) / this.tauRec;
    let current = 0;
    for (const r of this.receptors) {
      r.a *= Math.exp(-dt / r.tauD); r.b *= Math.exp(-dt / r.tauR);
      current += Math.max(0, r.a - r.b) * (r.mg ? mgBlock(V) : 1) * (r.E - V);
    }
    return current;
  }
}
