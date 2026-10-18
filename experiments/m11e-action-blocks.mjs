/** Measurement only. One press satisfies light/bell; all additional actions are false. */
export function actionBlocks(trials, count = 10) {
  const start = trials[0].start, end = trials.at(-1).start + 10000;
  const duration = (end - start) / count;
  const blocks = Array.from({ length: count }, (_, i) => ({ block: i + 1,
    start: start + i * duration, end: start + (i + 1) * duration,
    bird: 0, extraPresses: 0, distractors: 0, other: 0, total: 0 }));
  for (const trial of trials) {
    let presses = 0;
    for (const action of trial.actions) {
      const block = blocks[Math.min(count - 1, Math.floor((trial.start + action.t - start) / duration))];
      if (trial.kind === 'bird') block.bird++;
      else if (['bell', 'light'].includes(trial.kind)) {
        if (action.action !== 'press') block.distractors++;
        else if (++presses > 1 || (trial.satisfiedAt != null && action.t > trial.satisfiedAt)) block.extraPresses++;
      } else block.other++;
    }
  }
  for (const block of blocks) block.total = block.bird + block.extraPresses + block.distractors + block.other;
  return { blocks, pass: blocks.at(-1).total === 0 };
}
