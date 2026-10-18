/** Adaptive LIF port: pF, nS, mV, ms, pA. Defaults give ordinary LIF. */
export const LIF_DEFAULT = Object.freeze({
  C: 200, gL: 10, EL: -65, Vth: -50, Vreset: -65, tRef: 2, a: 0, b: 0, tauW: 200,
});

export class LIFNeuron {
  constructor(p = {}) {
    this.p = { ...LIF_DEFAULT, ...p };
    this.V = this.p.EL;
    this.w = 0;
    this.refUntil = -Infinity;
    this.t = 0;
    this.spikes = [];
  }

  step(dt, Iext = 0, Isyn = 0) {
    const { C, gL, EL, Vth, Vreset, tRef, a, b, tauW } = this.p;
    this.w += dt * (a * (this.V - EL) - this.w) / tauW;
    this.t += dt;
    if (this.t < this.refUntil) return false;
    this.V += dt * (-gL * (this.V - EL) - this.w + Isyn + Iext) / C;
    if (this.V < Vth) return false;
    this.V = Vreset;
    this.w += b;
    this.refUntil = this.t + tRef;
    this.spikes.push(this.t);
    return true;
  }
}
