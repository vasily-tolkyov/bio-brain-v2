/** Graupner–Brunel calcium rule, ported from bio-brain/L3-plasticity.
 * GB_NMDA detects coincidence; GB_DP potentiates unrelated inputs.
 */
export const GB_NMDA = Object.freeze({ tauCa: 20, Cpre: 0.8, Cpost: 1,
  thetaD: 1, thetaP: 1.3, gammaD: 200, gammaP: 321.808, tau: 150000,
  rhoStar: 0.5, D: 13.7, eta: 2, tauN: 40 });
// One presynaptic spike remains eligible for LTP for about 184 ms (tauN * ln(100)).
export const STDP = Object.freeze({ sMin: 0.1, sMax: 12, rho0: 0.01, accel: 5, preThreshold: 0.01 });

export function initSTDP(g, n, dt, { sMax = STDP.sMax, accel = STDP.accel, protectDormant = false } = {}) {
  if (!(Number.isFinite(sMax) && sMax >= STDP.sMin && Number.isFinite(accel) && accel > 0)) {
    throw new Error('Invalid STDP weight cap or rate');
  }
  const delay = Math.ceil(GB_NMDA.D / dt);
  g.stdp = { rho: new Float64Array(g.pre.length).fill(STDP.rho0),
    c: new Float64Array(g.pre.length), nmda: new Float64Array(n),
    pending: new Float64Array(n * (delay + 1)),
    sMax, accel, protectDormant, cursor: 0, delay, dc: Math.exp(-dt / GB_NMDA.tauCa),
    dn: Math.exp(-dt / GB_NMDA.tauN) };
  applySTDPWeights(g);
}

export function applySTDPWeights(g) {
  for (let k = 0; k < g.scale.length; k++) {
    g.scale[k] = STDP.sMin + (g.stdp.sMax - STDP.sMin) * g.stdp.rho[k];
  }
}

/** Called only by the spiking step. Frozen learning still advances calcium/traces. */
export function stepSTDP(g, fired, dt, learn) {
  const s = g.stdp, p = GB_NMDA, n = fired.length;
  const slot = s.cursor * n, next = (s.cursor + s.delay) % (s.delay + 1) * n;
  for (const i of g.sources) {
    s.nmda[i] += fired[i];
    s.pending[next + i] = fired[i];
  }
  for (let k = 0; k < g.pre.length; k++) {
    const a = g.pre[k], b = g.post[k];
    let calcium = s.c[k] + p.Cpre * s.pending[slot + a];
    if (fired[b]) calcium += p.Cpost + p.eta * p.Cpre * s.nmda[a];
    // The unchanged pre-trace test protects dormant L2 edges from LTD/drift.
    // Layer-2 learning no longer depends on surprise.
    const activePre = s.nmda[a] > STDP.preThreshold;
    if (learn && !g.frozen && (!s.protectDormant || activePre)) {
      const r = s.rho[k];
      let drive = -r * (1 - r) * (p.rhoStar - r);
      // Post-only calcium cannot potentiate: each directed edge checks its own source.
      if (calcium > p.thetaP && activePre) drive += p.gammaP * (1 - r);
      if (calcium > p.thetaD) drive -= p.gammaD * r;
      s.rho[k] = Math.min(1, Math.max(0, r + dt * s.accel * drive / p.tau));
      g.scale[k] = STDP.sMin + (s.sMax - STDP.sMin) * s.rho[k];
    }
    s.c[k] = calcium < 1e-300 ? 0 : calcium * s.dc;
  }
  for (const i of g.sources) {
    s.nmda[i] = s.nmda[i] < 1e-300 ? 0 : s.nmda[i] * s.dn;
    s.pending[slot + i] = 0;
  }
  s.cursor = (s.cursor + 1) % (s.delay + 1);
}
