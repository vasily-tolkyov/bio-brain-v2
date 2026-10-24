import { DOWNWARD } from './downward.mjs';

export const RULE_THRESHOLD = .3;
const checkThreshold = threshold => {
  if (threshold !== RULE_THRESHOLD) throw new RangeError('L5 rule eligibility is fixed at .3');
};

/** A view, never a second rule store. Outcome/change-cell IDs are not remapped
 * to adjacent bins, scores or goal-only aliases. Returned objects are live W. */
export function reverseLookup(downward, outcomeId, threshold = .3) {
  checkThreshold(threshold);
  return downward.weights.filter(w => w.B === outcomeId && w.W / DOWNWARD.wMax >= threshold);
}
export function predictedOutcomes(downward, premiseId, threshold = .3) {
  checkThreshold(threshold);
  return downward.weights.filter(w => w.A === premiseId && w.W / DOWNWARD.wMax >= threshold);
}

export const EXECUTE_THRESHOLD = .75;
/** Re-evaluate cancellation/generation eligibility immediately before dispatch.
 * This selects a request only; actual execution/efference and body loop are L6.
 * Ties retain action mapping order. Nothing here writes to the real past. */
export function actionRequest(goals) {
  const drive = goals.motorDrive();
  let index = -1;
  for (let i = 0; i < drive.length; i++) if (index < 0 || drive[i] > drive[index]) index = i;
  const strength = index < 0 ? 0 : drive[index];
  return { action: strength >= EXECUTE_THRESHOLD ? goals.actions[index].action : null,
    id: strength >= EXECUTE_THRESHOLD ? goals.actions[index].id : null, strength };
}
