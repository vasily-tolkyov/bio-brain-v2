import { observeCatalogue, recountM2 } from './catalogue.mjs';
import { CORE_OPTIONS } from './config.mjs';

/** Generalizes the old five-class evaluation counter to any number of visible
 * fields. Original frame indices, never labels or elementary sample counts,
 * select the earliest twenty frozen replays. Contrast remains the identity
 * rule (decision C); M2 is independently retained evidence, not a source map.
 */
export function discoverHigherFields(replays) {
  const catalogue = { entries: [], nextId: 1 };
  const seen = new Set();
  for (const row of replays) {
    if (!Number.isSafeInteger(row.index) || row.index < 0 || seen.has(row.index)) {
      throw new RangeError('Expected unique original training-frame indices');
    }
    seen.add(row.index);
    observeCatalogue(catalogue, row.fields, row.index);
  }
  const byIndex = new Map(replays.map(row => [row.index, row]));
  return catalogue.entries.map(entry => {
    const replayIndices = entry.frameIndices.slice(0, 20);
    const m2 = entry.mature ? entry.members.map((_, r) => recountM2(replayIndices.map(index =>
      byIndex.get(index).fields.find(f => f.carrier === entry.carrier).replicas[r].brightness), CORE_OPTIONS.N)) : null;
    return { ...entry, replayIndices, m2 };
  });
}
