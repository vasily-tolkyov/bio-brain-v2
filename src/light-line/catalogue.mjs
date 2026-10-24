import { L1_DEFAULTS } from './boundary-config.mjs';
import { jaccard } from './core/light-base.mjs';

/** Visibility is measured against the median background and the peak contrast.
 * Absolute B>.3 excludes dim links; relative contrast excludes a dim halo around
 * a bright pattern. A uniform field has no contrast and yields no candidate.
 * Jaccard only associates an already visible pattern with a stable ID. Neither
 * clustering nor an M2 replay vote defines the physical members.
 */
export function visiblePattern(brightness) {
  const c = L1_DEFAULTS.contrast, sorted = [...brightness].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const background = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const peak = sorted.at(-1), span = peak - background;
  const members = span > c.visibilityFloor ? brightness.flatMap((b, i) =>
    b > c.visibilityFloor && (b - background) / span >= c.relativeContrast ? [i] : []) : [];
  return { accepted: members.length >= c.minMembers, members, background, peak, span };
}

export function candidates(fields) {
  return fields.flatMap(field => {
    const contrast = field.replicas.map(r => visiblePattern(r.brightness));
    return contrast.every(c => c.accepted)
      ? [{ carrier: field.carrier, members: contrast.map(c => c.members), contrast }] : [];
  });
}

function match(entries, candidate) {
  return entries.filter(e => e.carrier === candidate.carrier).map(entry => ({ entry,
    overlap: entry.members.reduce((sum, m, r) => sum + jaccard(m, candidate.members[r]), 0) / entry.members.length,
  })).filter(row => row.overlap >= L1_DEFAULTS.contrast.identityOverlap)
    .sort((a, b) => b.overlap - a.overlap || a.entry.id - b.entry.id)[0]?.entry;
}

export function identifyFields(entries, fields) {
  return candidates(fields).map(c => ({ ...c, id: match(entries, c)?.id ?? null }));
}

/** Exactly one original input frame can support an entry per observation.
 * K elementary color updates and R replicas cannot multiply the frame count.
 */
export function observeCatalogue(catalogue, fields, frame) {
  for (const c of candidates(fields)) {
    let entry = match(catalogue.entries, c);
    if (!entry) {
      entry = { id: catalogue.nextId++, carrier: c.carrier, members: c.members,
        contrast: c.contrast, frameIndices: [], mature: false };
      catalogue.entries.push(entry);
    }
    entry.members = c.members;
    entry.contrast = c.contrast;
    entry.frameIndices.push(frame);
    entry.mature = entry.frameIndices.length >= L1_DEFAULTS.contrast.matureFrames;
  }
}

/** Optional subordinate M2 evidence. This function never modifies membership. */
export function recountM2(replays, N) {
  const counts = Array(N).fill(0);
  for (const brightness of replays) for (let i = 0; i < N; i++) if (brightness[i] > .3) counts[i]++;
  return { counts, members: counts.flatMap((n, i) => n >= 10 ? [i] : []) };
}
