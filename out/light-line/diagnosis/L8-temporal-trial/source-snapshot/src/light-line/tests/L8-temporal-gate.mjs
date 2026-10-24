import { TEMPORAL_DEFAULTS } from '../temporal-config.mjs';
import { protocol } from './L8-common.mjs';

const cells = values => values.flatMap((v, i) => v > 0 ? [i] : []);
const mean = values => values.length && values.every(Number.isFinite)
  ? values.reduce((s, v) => s + v, 0) / values.length : null;

/** Development-only amendment. Membership comes from supplied target input,
 * never the completed target field. Keep all metrics when a predicate fails.
 * The historical L8-r2 auditor and protocol are deliberately preserved. */
export function temporalTrialGate(data, minimumExclusiveCells = TEMPORAL_DEFAULTS.minimumExclusiveCells) {
  const metrics = data.arms.map(arm => {
    const target = cells(arm.target.selected.values), gains = [];
    for (let k = 0; k < 9; k++) for (const event of [0, 2]) {
      const rows = arm.probes.filter(p => p.k === k && p.event === event).map(p => {
        const sources = cells(p.result.selected.values), exclusive = target.filter(i => !sources.includes(i));
        const brightness = exclusive.map(i => p.result.field.brightness[i]);
        const lit = exclusive.filter(i => p.result.field.brightness[i] > protocol.gates.theta);
        return { probe: p.probe, sources, exclusive, shared: target.filter(i => sources.includes(i)),
          denominator: exclusive.length, brightness, lit, numerator: lit.length,
          meanB: mean(brightness), coverage: exclusive.length ? lit.length / exclusive.length : null };
      });
      gains.push({ k, event, meanB: mean(rows.map(r => r.meanB)), coverage: mean(rows.map(r => r.coverage)), rows });
    }
    return { name: arm.name, target, targetFieldLit: arm.target.field.lit, gains };
  });
  const gain = (name, event, k) => metrics.find(m => m.name === name)?.gains.find(g => g.event === event && g.k === k);
  const causal = gain('causal', 0, 6), shuffled = gain('shuffled', 0, 6), distractor = gain('causal', 2, 6), reverse = gain('reverse', 0, 6);
  const valid = g => g?.rows.length === protocol.nextItemProbes && Number.isFinite(g.meanB)
    && g.rows.every(r => r.denominator > 0 && Number.isFinite(r.coverage));
  const profile = metrics.find(m => m.name === 'causal')?.gains.filter(g => g.event === 0) ?? [];
  const checks = [
    { name: 'identifiable-target-exclusive-denominator', pass: metrics.length === 3
      && ['causal', 'shuffled', 'reverse'].every(name => metrics.filter(m => m.name === name).length === 1)
      && metrics.every(m => m.gains.every(g => valid(g)
        && g.rows.every(r => r.denominator >= minimumExclusiveCells))) },
    { name: 'A@6-completion', pass: valid(causal) && causal.rows.every(r => r.coverage >= protocol.gates.completion) },
    { name: 'causal-k6-peak', pass: valid(causal) && profile.every(g => valid(g) && causal.meanB >= g.meanB) },
    { name: 'causal-minus-shuffled', pass: valid(causal) && valid(shuffled) && causal.meanB - shuffled.meanB >= protocol.gates.temporalGain },
    { name: 'causal-minus-distractor', pass: valid(causal) && valid(distractor) && causal.meanB - distractor.meanB >= protocol.gates.temporalGain },
    { name: 'reverse-coverage', pass: valid(reverse) && reverse.rows.every(r => r.coverage <= protocol.gates.spill) },
  ].map(c => ({ ...c, pass: Boolean(c.pass) }));
  return { pass: checks.every(c => c.pass), minimumExclusiveCells, membership: 'positive supplied target input',
    thresholds: { theta: protocol.gates.theta, completion: protocol.gates.completion,
      gain: protocol.gates.temporalGain, reverseCoverage: protocol.gates.spill }, checks, metrics };
}
