/** L1 boundary defaults. config.mjs and the copied core remain L0-hash frozen.
 * These are arithmetic defaults, not fitted to acceptance seeds:
 * one observation / presentation opportunity per .5 ms IO tick, unit rule dose.
 * cadenceMs controls formation speed (absolute ticks plus changed-source events).
 * strengthScale is a positive dose of the frozen rho rule: co-lit complement
 * multiplies by .8**dose; one-end rho by .96**dose. At dose=1 the core result is
 * untouched. Each elementary presentation still appends its carrier once.
 * Neither parameter changes core eta/kappa, source amplitude, or readout gain.
 * A 100 ms window is exclusively an observation window, never a learning batch.
 */
export const L1_DEFAULTS = Object.freeze({
  ioMs: .5,
  windowMs: 100,
  readoutThreshold: .25,
  continuous: Object.freeze({ cadenceMs: .5, strengthScale: 1 }),
  contrast: Object.freeze({
    visibilityFloor: .3,
    relativeContrast: .5,
    minMembers: 2,
    identityOverlap: .8,
    matureFrames: 20,
  }),
});

export function continuousOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(k => !['cadenceMs', 'strengthScale'].includes(k))) {
    throw new TypeError('Expected cadenceMs / strengthScale');
  }
  const result = { ...L1_DEFAULTS.continuous, ...options };
  if (!Number.isSafeInteger(result.cadenceMs / L1_DEFAULTS.ioMs) || result.cadenceMs < .5
      || !Number.isFinite(result.strengthScale) || result.strengthScale <= 0) {
    throw new RangeError('Cadence must be positive .5 ms ticks; strengthScale must be positive');
  }
  return Object.freeze(result);
}
