import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { hash } from '../persistence.mjs';
import { protocol } from './L7-fixtures.mjs';
export const read = file => JSON.parse(file.endsWith('.gz') ? gunzipSync(readFileSync(file)) : readFileSync(file, 'utf8'));
const weakKey = JSON.stringify(['action:wave', 4, 'tone']);
export function witness(name, s, originalGeneration) {
  const p = s.pipeline, f = p.learning.future, n = p.learning.novelty, a = p.partial;
  switch (name) {
    case 'mid-io-segment': return a?.phase === 'sample' && a.ticks === 73 && p.environment.state.t === p.t + 36.5;
    case 'before-optical-commit': return p.sensory.layer.pending?.cursor === 0 && p.sensory.layer.queued.length > 0;
    case 'after-optical-commit': return p.sensory.layer.pending?.cursor === 1 && p.sensory.layer.state.frames.at(-1).time === p.sensory.layer.pending.startTick * .5;
    case 'cue-boundary': return p.temporal.last.onsets.some(e => e.id === 'light' && e.tOnset === 100);
    case 'delayed-future': return f.entries.some(e => e.tArrive > p.t);
    case 'first-match': return n.pending.some(e => e.B === 'light' && e.matched === 1 && e.tArrive === 3400);
    case 'inclusive-deadline': return n.pending.some(e => e.ruleKey === weakKey && e.tArrive + 500 === p.t) &&
      p.learning.factor.predictions.some(e => e.ruleKey === weakKey && e.tArrive + 500 === p.t);
    case 'connection-deletion': return !f.downward.weights.some(w => w.ruleKey === weakKey) && n.pending.some(e => e.ruleKey === weakKey && e.generation === originalGeneration);
    case 'connection-rebirth': return f.downward.weights.some(w => w.ruleKey === weakKey && w.generation > originalGeneration);
    case 'pending-action-goal': return p.goals.entries.some(([id]) => id === 'light') && f.entries.some(e => e.B === 'light');
    case 'body-trace': return p.body.changes.events.some(e => e.t === 4000 && e.age <= 500 && e.strength > 0);
    case 'drive-ownership': return p.drive.owned !== null && p.goals.entries.some(([id]) => id === p.drive.owned);
    case 'goal-parent-link': return p.goals.parents.length > 0 && p.goals.links.length > 0 && p.goals.counts.some(c => c.M === 1 && c.effective > 0);
    default: return false;
  }
}
export function auditSeed(dir) {
  const fixture = read(`${dir}/fixture.json`), reference = read(`${dir}/uninterrupted.json.gz`);
  const cuts = [];
  for (const cut of protocol.cuts) {
    const initial = read(`${dir}/${cut.name}/initial.json.gz`), final = read(`${dir}/${cut.name}/reference-final.json.gz`);
    const resumed = read(`${dir}/${cut.name}/resumed.json.gz`);
    assert.equal(witness(cut.name, initial, fixture.initialWeakEdge.generation), true, `Nonvacuous cut: ${cut.name}`);
    assert.equal(resumed.windows.length, 100); assert.deepEqual(resumed.windows, reference.windows.slice(cut.window, cut.window + 100));
    assert.deepEqual(resumed.final, final); assert.deepEqual(resumed.M2, read(`${dir}/${cut.name}/reference-M2.json.gz`));
    assert.equal(resumed.initialDigest, initial.digest); assert.equal(resumed.exactOnLoad, true);
    assert.equal(hash(resumed.final), hash(final));
    cuts.push({ name: cut.name, windows: resumed.windows.length, exact: true, witness: true, initialDigest: initial.digest, finalDigest: final.digest });
  }
  assert.ok(cuts.length >= 10);
  const rejects = read(`${dir}/malformed.json.gz`);
  assert.ok(rejects.results.length >= 12);
  for (const [digest, state] of Object.entries(rejects.states)) assert.equal(hash(state), digest);
  for (const r of rejects.results) {
    assert.ok(r.rejected && r.rootRetained && r.reason.length > 0, r.name);
    assert.equal(r.before, r.after, r.name); assert.deepEqual(rejects.states[r.before], rejects.states[r.after]);
  }
  const frozen = read(`${dir}/frozen.json.gz`);
  assert.deepEqual(frozen.before, frozen.restored); assert.deepEqual(frozen.probesBefore, frozen.probesAfter);
  assert.deepEqual(frozen.M2Before, frozen.M2After); assert.ok(frozen.before.pipeline.temporal.layer.cores[0].length > 0);
  assert.ok(frozen.M2Before.every(s => s.M2.length > 0));
  assert.ok(frozen.before.pipeline.learning.future.downward.weights.length > 0);
  for (const pair of frozen.layers) { assert.deepEqual(pair.before, pair.restored); assert.deepEqual(pair.first, pair.second); }
  const files = read(`${dir}/disk-checks.json`);
  assert.ok(files.replacementExact && files.truncatedRejected && files.truncatedAtomic && files.renameFailed && files.temporaryCleaned);
  return { seed: fixture.seed, pass: true, cuts, resumedWindows: cuts.length * 100,
    malformedRejected: rejects.results.length, atomicChanges: 0, frozenRestoreExact: true,
    lowerMatureCatalogues: frozen.M2Before.map(s => s.M2.length), learnedUpperChannels: frozen.before.pipeline.temporal.layer.cores[0].length,
    disk: files };
}
