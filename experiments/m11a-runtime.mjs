/** Verification schedule only; continuation uses the exact shared online learner. */
import { makeRng } from '../src/core/rng.mjs';
import { ACTION_WORLD } from '../src/envs/actions.mjs';
import { WINDOW_MS } from '../src/readout.mjs';
import { advanceActions } from './m8-pipeline.mjs';
export const PROTOCOL = Object.freeze({ trials: 60, commandGapMs: 400 });
export function teacherSchedule(seed, actions, skipped, count) {
  const rng = makeRng(seed), schedule = new Map();
  for (let trial = 0; trial < skipped + count; trial++) {
    const used = [];
    for (const action of actions) {
      let offset;
      do { offset = WINDOW_MS * Math.floor(rng.uniform() * ACTION_WORLD.onsetSpanMs / WINDOW_MS); }
      while (used.some(t => Math.abs(t - offset) < PROTOCOL.commandGapMs));
      used.push(offset);
      if (trial >= skipped) schedule.set((trial - skipped) * ACTION_WORLD.slotMs + offset, action);
    }
  }
  return schedule;
}
export function advanceExtinction(p, action) {
  const drive = new Float64Array(p.output.actions.length);
  if (action) drive[p.output.actions.indexOf(action)] = 1;
  const r = advanceActions(p, drive);
  return { ...r, onsets: p.unroll.entries.filter(e => e.tOnset === r.t) };
}
