/** L5 public surface. W is independent of optical rho. All IDs at this boundary
 * come from contrast-discovered light fields; semantic names stay in callers.
 * Full execution, efference generation and body/drive orchestration remain L6. */
export { FutureSlices, GoalRow } from './predict.mjs';
export { PredictionLearning } from './learning.mjs';
export { BinaryNovelty } from './novelty.mjs';
export { GoalErrors } from './goal-errors.mjs';
export { ThreeFactor, NoveltyTrace } from './three-factor.mjs';
export { GoalActions, upwardDrive } from './goals.mjs';
export { reverseLookup, predictedOutcomes, actionRequest } from './reverse-chain.mjs';
export { present, novelty, deficit } from './presence.mjs';
