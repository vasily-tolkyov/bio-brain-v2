/** Consumer audit only: recorded rest errors, independent repeated source eligibility. */
import { ERRORS, SpikingErrors } from '../src/errors.mjs';
import { FutureSlices } from '../src/predict.mjs';
import { SurpriseGate, ThreeFactor, trace } from '../src/three-factor.mjs';
import { WINDOW_MS } from '../src/readout.mjs';
import { mean } from './m5-statistics.mjs';

export function restDrift(windows) {
  const ids = windows[0].map(c => c.id), [A, B] = ids, ruleKey = JSON.stringify([A, 1, B]);
  const lambda = ERRORS.targetHz * ERRORS.cells * WINDOW_MS / 1000;
  return [0.1, 0].map(initial => {
    const future = new FutureSlices(ids, {
      weights: initial ? [{ A, B, k: 1, ruleKey, W: initial }] : [] });
    const learner = new ThreeFactor(future), weight = () => future.downward.weights.find(w => w.ruleKey === ruleKey)?.W ?? 0;
    const trajectory = [{ seconds: 0, W: initial }], variances = [];
    let referenceEligibility = 0;
    windows.forEach((counts, i) => {
      const t = i * WINDOW_MS;
      future.update(t, t % 10000 === 0 ? [{ id: A, strength: 1 }] : []);
      // No predictions or hits enter this audit; only source eligibility and rest N.
      learner.step(t, counts, []);
      referenceEligibility = trace(referenceEligibility, future.past.lines(t)[1], i ? WINDOW_MS : 0);
      const e = referenceEligibility;
      // Keep the accepted pre-M11e numerical noise bound (eta=0.05, E0=100);
      // it is a frozen reference, not a variance claim about discrete births.
      // cap=1 bounds the headroom. This is a reporting uncertainty, never a gate.
      variances.push((0.05 * e / 100) ** 2 * lambda);
      trajectory.push({ seconds: (t + WINDOW_MS) / 1000, W: weight() });
    });
    const xbar = mean(trajectory.map(p => p.seconds)), ybar = mean(trajectory.map(p => p.W));
    const sxx = trajectory.reduce((s, p) => s + (p.seconds - xbar) ** 2, 0);
    const slope = trajectory.reduce((s, p) => s + (p.seconds - xbar) * (p.W - ybar), 0) / sxx;
    // Integrated noise is correlated across W samples. Each independent increment
    // contributes to every later W: sum those regression coefficients before squaring.
    let coefficient = 0, slopeVariance = 0;
    for (let i = trajectory.length - 1; i > 0; i--) {
      coefficient += (trajectory[i].seconds - xbar) / sxx;
      slopeVariance += coefficient ** 2 * variances[i - 1];
    }
    const delta = weight() - initial, deltaSD = Math.sqrt(variances.reduce((a, b) => a + b, 0));
    const slopeSE = Math.sqrt(slopeVariance);
    const monotoneGrowth = trajectory.every((p, i) => i === 0 || p.W >= trajectory[i - 1].W);
    // Rectified N is strengthening-only: rare Poisson tails can only increase W.
    // Retain the original numerical drift bounds; monotonicity is now expected.
    return { initial, final: weight(), delta, deltaSD, slope, slopeSE, monotoneGrowth,
      pass: Math.abs(delta) <= 3 * deltaSD && Math.abs(slope) <= 3 * slopeSE && monotoneGrowth,
      trajectory };
  });
}

export function longRestAudit(ids, seed) {
  const errors = new SpikingErrors(ids, seed), windows = [], gate = new SurpriseGate();
  let opened = 0;
  for (let t = 0; t < 300000; t += WINDOW_MS) {
    const counts = errors.step(t, ids.map(() => 0));
    windows.push(counts); opened += Number(gate.step(counts));
  }
  const drift = restDrift(windows), gateOpenFraction = opened / windows.length;
  return { seconds: 300, gateOpenFraction, drift,
    pass: gateOpenFraction < 0.01 && drift.every(d => d.pass), windows };
}
