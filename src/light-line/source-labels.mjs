/** Innate adapter metadata and same-source guards, outside neural ticks. */
import { onsetColumn } from './unroll.mjs';

export function sourceLabels(env, mapping, variables = []) {
  const labels = new Map(mapping.filter(a => env.sourceLabels?.[a.feature] !== undefined)
    .map(a => [a.id, env.sourceLabels[a.feature]]));
  // The adapter's variable name identifies its single physical sensor channel.
  for (const v of variables) for (const id of v.featureIds) labels.set(id, v.name);
  return labels;
}

export const sameSource = (labels, A, B) =>
  labels.has(A) && labels.has(B) && labels.get(A) === labels.get(B);

export function simultaneousSource(past, labels, A, k, B, t) {
  if (!sameSource(labels, A, B)) return false;
  // N can outlast its onset. Use the latest retained target onset, not the
  // current comparison time; a shifted copy is still the same original event.
  const post = past.entries.findLast(e => e.id === B);
  // Without a target onset, distinct times cannot be established.
  if (!post) return true;
  const pre = past.entries.filter(e => e.id === A && e.strength > 0 &&
    onsetColumn(t - e.tOnset) === k);
  // Max-pooled lines may contain several onsets. A distinct-time contributor
  // still permits creation; simultaneous contributors alone do not.
  return pre.length > 0 && pre.every(e => e.tOnset === post.tOnset);
}
