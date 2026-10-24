/** L0 accepted optical baseline. No runtime dependency on legacy code or evidence.
 * M2 is acceptance metadata only. Locked A–D wrappers begin at L1+:
 * independent concurrent color fields; continuous learning with cadence parameters;
 * contrast-based identity; binary presence/absence novelty and goal comparisons.
 */
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const CORE_OPTIONS = freeze({
  N: 250, m: 6, eta: .2, kappa: .2, theta: .3, bins: 200, rule: 'sum', w: .05,
});
export const CURVE = freeze({ id: 'hill-q4-h1.5', family: 'hill', q: 4, h: 1.5 });
export const CANDIDATE = freeze({
  id: 'sum-w0.05-M2', color: { rule: 'sum', w: .05 }, member: { kind: 'M2' },
});
export const ACCEPTANCE = freeze({
  acceptanceSeeds: [7, 19, 31], centers: [.1, .3, .5, .7, .9],
  sigma: .03, rounds: 20, noiseXor: 0x9e3779b9,
  gates: { formationJaccard: .8, separationJaccard: .2, attractorCount: 5,
    mergeJaccard: .8, completion: .9, spill: .05 },
  D: {
    values: [.1, .3, .5, .7],
    gate: 'For EVERY v, propagated lit-set J(v,v+.03)>J(v,v+.3); raw input overlap also reported, each field uses its own input color.',
    qualification: 'Unchanged phase-2 operational interpretation: directional comparison only; the plans specify no statistical test or effect-size cutoff, so PASS is not a statistical-significance claim.',
  },
});
export const PROVENANCE = freeze({
  acceptedConfig: 'out/light-base/p4/frozen-config.json',
  acceptedConfigSha256: 'd1b54cae8efddf0b79a023f5c8179c800e2f6171335127682190f5eccd26ea0a',
  acceptedReport: 'out/light-base/p4b/REPORT.md',
  decisions: 'out/light-line/design/DECISIONS.md',
  acceptedSources: {
    'src/light-base.mjs': '119bf881f74aef656ec5cf3ce392d40a95d02a6c1a0d4fc8ec10aed7b1ef9381',
    'src/light-base-color.mjs': '3475591ac0e378fcfcb457acb63924216a2f52c5cd88d8c51c8eec47e7e64a52',
    'src/light-base-color-v2.mjs': '39e85a77fc5d0823752b1e27c0ae35c1a378321ce93e8c19ee78496f1b1449b9',
  },
});
