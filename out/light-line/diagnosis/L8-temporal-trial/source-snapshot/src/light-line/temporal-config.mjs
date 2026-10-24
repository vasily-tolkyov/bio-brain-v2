/** L8 development trial: rho(10)=.75 from zero without depression.
 * rho(n)=1-.8**(dose*n); the core and lower-layer dose stay unchanged.
 * Authorization: diagnosis/L8-temporal-trial/PROPOSAL-applied.md. */
export const TEMPORAL_DOSE = Math.log(.25) / (10 * Math.log(.8));

export const TEMPORAL_DEFAULTS = Object.freeze({
  columns: 9,
  expiryMs: 12800 * Math.SQRT2,
  learning: 'positive-onset',
  continuous: Object.freeze({ cadenceMs: .5, strengthScale: TEMPORAL_DOSE }),
  minimumExclusiveCells: 1,
});
