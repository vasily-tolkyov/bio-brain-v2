import { L1_DEFAULTS } from './boundary-config.mjs';

/** Missing time before construction and absent carriers contribute exactly zero.
 * Half-open intersections exclude a field starting at the observation end.
 * Member means are averaged across independent replica storage, then over time.
 */
export function p7(history, entry, end, windowMs = L1_DEFAULTS.windowMs) {
  if (!Number.isFinite(end) || end < 0 || !Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError('Invalid observation window');
  }
  let integral = 0;
  for (const row of history) {
    const dt = Math.min(end, row.end) - Math.max(end - windowMs, row.start);
    if (dt <= 0) continue;
    const field = row.fields.find(f => f.carrier === entry.carrier);
    if (!field) continue;
    let mean = 0;
    for (let r = 0; r < entry.members.length; r++) {
      const members = entry.members[r];
      if (members.length) mean += members.reduce((s, i) => s + field.replicas[r].brightness[i], 0) / members.length;
    }
    integral += dt * mean / entry.members.length;
  }
  return integral / windowMs;
}

export function readout(history, entries, end) {
  return entries.map(entry => ({ id: entry.id, strength: p7(history, entry, end) }))
    .filter(row => row.strength > L1_DEFAULTS.readoutThreshold);
}

export function readoutDiagnostics(history, entries, fields, end) {
  return entries.map(entry => {
    const field = fields.find(f => f.carrier === entry.carrier);
    const replicas = entry.members.map((members, r) => {
      const brightness = field?.replicas[r].brightness;
      const lit = members.filter(i => (brightness?.[i] ?? 0) > .3);
      return { members, lit, litFraction: members.length ? lit.length / members.length : 0,
        meanB: members.length ? members.reduce((sum, i) => sum + (brightness?.[i] ?? 0), 0) / members.length : 0 };
    });
    return { id: entry.id, carrier: entry.carrier, mature: entry.mature, replicas,
      P7: p7(history, entry, end) };
  });
}
