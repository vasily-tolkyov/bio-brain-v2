// One tenth of a frozen elementary rho update at each .5 ms observation tick.
// This smooths brief coincidences while repeated inputs accumulate normally.
// Neither the core rule nor optical contrast thresholds change.
export const ROLE_CONTINUOUS = Object.freeze({ cadenceMs: .5, strengthScale: .1 });
