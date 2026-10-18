/** Exact subset of seed-7 evidence, without replay or fabricated missing events. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readJSON } from './m11e-d-state.mjs';
import { killCount, wilson } from './m11e-d-measure.mjs';
import { DOWNWARD } from '../src/downward.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';
import { ERRORS } from '../src/errors.mjs';
import { LIT_THRESHOLD } from '../src/readout.mjs';
import { OUTPUT } from '../src/output.mjs';
import { stormWorld } from '../src/world.mjs';
const dir = 'out/m11e-roles/7'; mkdirSync(dir, { recursive: true });
const read = name => readJSON(`out/m11e-pilot-c/${name}.json`);
const natural = read('natural-state'), actions = read('actions'), causal = read('causal-state');
const light = natural.mapping.find(a => a.feature === 'light').id;
const bell = natural.mapping.find(a => a.feature === 'bell').id;
const key = JSON.stringify([light, 5, bell]);
const w = natural.learning.future.downward.weights.find(w => w.ruleKey === key);
assert.equal(w.deltas.STDP, 0); assert.equal(w.deltas.M, 0); assert.equal(w.deltas.clamp, 0);
assert.equal(w.W, DOWNWARD.wInit);
const predictions = natural.learning.future.records.flatMap(r => r.entries)
  .filter(e => e.ruleKey === key && e.createdAt === w.createdAt);
assert.equal(new Set(predictions.map(e => e.tOnset)).size, predictions.length);
const eligibility = predictions.map(e => ({ ...e,
  a: e.activation * Math.exp(-(e.tArrive + ERRORS.toleranceMs -
    Math.max(e.tOnset, e.tArrive - ERRORS.toleranceMs)) / THREE_FACTOR.tauE) }));
assert.ok(eligibility.every(e => e.a > 0.01 && e.tArrive + ERRORS.toleranceMs < natural.t));
// Positive hit credit is mandatory at this nonsaturated W for every matched
// prediction above the unchanged pre gate. Zero lifetime STDP therefore proves
// none of these predictions was hit; all stored deadlines have completed.
const meanA = eligibility.reduce((n, e) => n + e.a, 0) / eligibility.length;
const M = THREE_FACTOR.etaMissByLayer[2] * meanA;
// Even an unavailable whole-world average cannot rescue this generation:
// all actual sensory/action onsets exceed this existing lower bound.
const minimumA = Math.min(LIT_THRESHOLD, OUTPUT.thetaExec) *
  Math.exp(-2 * ERRORS.toleranceMs / THREE_FACTOR.tauE);
const minimumM = THREE_FACTOR.etaMissByLayer[2] * minimumA;
const nKill = killCount(w.W / DOWNWARD.wMax, M), maximumK = killCount(w.W / DOWNWARD.wMax, minimumM) + 2;
assert.ok(predictions.length >= maximumK);
const bird = causal.mapping.find(a => a.feature === 'bird').id;
const thunder = causal.mapping.find(a => a.feature === 'thunder').id;
const birdKey = JSON.stringify([bird, 3, thunder]);
const records = causal.learning.future.records;
const known = new Map();
for (const r of records) {
  if (!r.entries.length && r.realStrength > 0) known.set(`${r.B}:${r.t}`, { id: r.B, tOnset: r.t });
  for (const e of r.entries) known.set(`${e.A}:${e.tOnset}`, { id: e.A, tOnset: e.tOnset });
}
const birds = [...known.values()].filter(o => o.id === bird), thunders = [...known.values()].filter(o => o.id === thunder);
const knownHits = birds.filter(b => thunders.some(t => Math.abs(t.tOnset - b.tOnset - 400) <= ERRORS.toleranceMs));
const world = stormWorld({ seed: 7, count: 30 }), externalBirds = world.events.filter(e => e.g === 'bird');
const externalHits = externalBirds.filter(b => world.events.some(t =>
  t.g === 'thunder' && Math.abs(t.start - b.start - 400) <= ERRORS.toleranceMs));
const R2Worlds = ['causal', 'shuffled', 'actions'].map(name => {
  const data = read(name), state = read(`${name === 'actions' ? 'natural' : name}-state`), f = state.learning.future;
  const entries = [...f.records.flatMap(r => r.entries), ...f.entries, ...f.arrivals];
  const rows = data.episodes.filter(e => !e.causal).map(e => {
    if (e.death) return { ...e, status: 'deleted' };
    const w = data.final.weights.find(w => w.ruleKey === e.ruleKey && w.createdAt === e.t);
    assert.ok(w);
    const ps = [...new Map(entries.filter(p => p.ruleKey === w.ruleKey && p.createdAt === w.createdAt)
      .map(p => [p.tOnset, p])).values()].sort((a, b) => a.tOnset - b.tOnset);
    // Every cause after birth schedules a prediction while this live generation
    // exists. All are retained either as future entries or arrival records.
    if (ps.length < 3) return { ...e, causeOnsets: ps.length, minimumK: 3, status: 'still dying' };
    const peakUpper = Math.min(1, (DOWNWARD.wInit + w.deltas.STDP) / DOWNWARD.wMax);
    const maximumK = killCount(peakUpper, minimumM) + 2;
    let postLastHitLower = w.deltas.STDP === 0 ? ps.length : null, creditExhaustedBefore = null;
    if (w.deltas.STDP > 0 && ps.every(p => p.activation === 1)) {
      // N never strengthens a generation and M never increases W. If a saved
      // increase equals ALL lifetime STDP credit, every hit preceded that
      // snapshot. This comparison is exact; no fitted tolerance is introduced.
      const i = ps.findIndex((p, i) => i > 0 &&
        (p.strength - ps[0].strength) * DOWNWARD.wMax === w.deltas.STDP);
      if (i > 0) { postLastHitLower = ps.length - i; creditExhaustedBefore = ps[i].tOnset; }
    }
    return { ...e, finalU: w.W / DOWNWARD.wMax, peakUpper, maximumK,
      causeOnsets: ps.length, postLastHitLower, creditExhaustedBefore,
      status: postLastHitLower !== null && postLastHitLower >= maximumK ? 'violation' : 'unresolved', predictions: ps };
  });
  const counts = Object.fromEntries(['deleted', 'still dying', 'violation', 'unresolved'].map(s =>
    [s, rows.filter(r => r.status === s).length]));
  return { name, rows, counts, complete: counts.unresolved === 0,
    R2: counts.violation > 0 ? false : counts.unresolved === 0 ? true : null };
});
const result = { seed: 7, completeR1R2: false,
  missing: ['Complete onset stream independent of connection existence', 'Hit/deadline eligibility samples for each world',
    'Non-causal generation peaks and last-hit times', 'End-B neural state for recovery C'],
  R2Counterexample: { ruleKey: key, birth: w.createdAt, end: natural.t, peak: w.W / DOWNWARD.wMax,
    finalU: w.W / DOWNWARD.wMax, deltas: w.deltas, completedNoHitPredictions: predictions.length,
    meanA, M, nKill, K: nKill + 2, minimumA, minimumM, maximumK, pass: false, predictions: eligibility },
  R2Worlds, lifecycleCounts: { deleted: actions.episodes.filter(e => !e.causal && e.death).length,
    live: actions.episodes.filter(e => !e.causal && !e.death).length, provenViolations: 1 },
  bird: { ruleKey: birdKey, knownOnsets: birds.length, knownHits: knownHits.length,
    incompleteNeuralRate: knownHits.length / birds.length, knownHitTimes: knownHits.map(e => e.tOnset),
    externalOnsets: externalBirds.length, externalHits: externalHits.length,
    externalCI: wilson(externalHits.length, externalBirds.length),
    note: 'Known neural onsets are incomplete and must not substitute for whole-run R1 measurements.',
    example: records.filter(r => r.t >= 822900 && r.t <= 824500) } };
writeFileSync(`${dir}/pilot-audit.json`, JSON.stringify(result));
console.log(JSON.stringify({ ...result.R2Counterexample, predictions: undefined }));
console.log(JSON.stringify(R2Worlds.map(({ name, counts, complete, R2 }) => ({ name, counts, complete, R2 }))));
