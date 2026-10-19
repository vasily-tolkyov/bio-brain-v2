/** Unlabelled strong-edge components (v1.mjs), then replica-averaged P7 (scene1.mjs). */
export const STRONG_THRESHOLD = 0.4;
export const LIT_THRESHOLD = 0.25;
export const WINDOW_MS = 100;

export function identifyAttractors(group, n, offset = 0, threshold = STRONG_THRESHOLD) {
  if (!(threshold >= 0 && threshold <= 1)) throw new Error('Invalid strong-weight threshold');
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const root = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let k = 0; k < group.pre.length; k++) if (group.stdp.rho[k] > threshold) {
    const a = root(group.pre[k] - offset), b = root(group.post[k] - offset);
    if (a !== b) parent[a] = b;
  }
  const components = new Map();
  for (let i = 0; i < n; i++) {
    const r = root(i);
    if (!components.has(r)) components.set(r, []);
    components.get(r).push(i);
  }
  // Isolated cells have no learned association. IDs follow the smallest local E ID.
  return [...components.values()].filter(m => m.length > 1)
    .map(members => ({ id: members[0], members }));
}

/** A half-open window [start, start + windowMs), aligned to the caller's onset. */
export function readout(replicas, attractors, start, {
  windowMs = WINDOW_MS, litThreshold = LIT_THRESHOLD,
} = {}) {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(windowMs) || windowMs <= 0 ||
      !(litThreshold >= 0 && litThreshold <= 1) || !replicas.length) throw new Error('Invalid P7 window');
  const end = start + windowMs;
  if (replicas.some(r => r.net.t + 1e-7 < end)) throw new Error('P7 window is not complete');
  const result = [];
  for (const { id, members } of attractors) {
    let active = 0;
    for (const { net, E } of replicas) for (const member of members) {
      const spikes = net.spikes[E + member];
      // Search backwards: readout normally asks for the latest window.
      for (let j = spikes.length - 1; j >= 0; j--) {
        if (spikes[j] < start - 1e-7) break;
        if (spikes[j] < end - 1e-7) { active++; break; }
      }
    }
    const strength = active / members.length / replicas.length;
    if (strength > litThreshold) result.push({ id, strength });
  }
  return result;
}
