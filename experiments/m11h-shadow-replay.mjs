/** Bounded regression of recorded timing cases, not a full neural-world replay. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { FutureSlices } from '../src/predict.mjs';
import { DOWNWARD, newConnection } from '../src/downward.mjs';
import { ThreeFactor, THREE_FACTOR } from '../src/three-factor.mjs';
import { SpikingNovelty, NOVELTY } from '../src/novelty.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = b => createHash('sha256').update(b).digest('hex');
const arg = (name, fallback) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const directory = resolve(ROOT, arg('out', 'out/m11h/shadow-replay'));
if (!process.argv.includes('--run')) { console.log('Use --run after the reviewed code checkpoint; this is a bounded timing regression, not full-world acceptance.'); process.exit(0); }
assert.ok(!existsSync(directory), 'Refusing to overwrite prior evidence');
const auditPath = resolve(ROOT, 'out/m11g-fresh/seed-7/action-natural/audit.json');
const inputBytes = readFileSync(auditPath);
assert.equal(hash(inputBytes), '81f24f8b837e586d1eba9d022ff46b3b7d799d14f28da63a9dfc52e41085b26e');
const original = JSON.parse(inputBytes).deadlines.filter(r => r.ruleKey === '[0,5,6]' && r.createdAt === 2522900);
assert.equal(original.length, 45);
assert.ok(original.every(r => r.unmatched && r.missEligible && r.Meff === 0 && r.recentRealityMs === 1100));
function sources(file, out = {}) {
  if (out[file]) return out;
  const text = readFileSync(resolve(ROOT, file), 'utf8'); out[file] = { sha256: hash(text), text };
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
    if (m[1].startsWith('.')) sources(relative(ROOT, resolve(ROOT, dirname(file), m[1])), out);
  }
  return out;
}
const source = sources('experiments/m11h-shadow-replay.mjs'), start = performance.now();
mkdirSync(directory, { recursive: true });
const manifest = { schema: 'event-shadow-regression-v1', started: new Date().toISOString(), argv: process.argv,
  input: { path: relative(ROOT, auditPath), sha256: hash(inputBytes), bytes: inputBytes.length },
  constants: { DOWNWARD, THREE_FACTOR, NOVELTY }, source,
  limitation: 'Independent cases with the recorded source/target timing and initial W. Fresh N state, no old full neural state is loaded. Not a causal rerun of all original worlds, false-action or whole-world R2 acceptance.' };
writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(resolve(directory, 'historical-target-deadlines.json'), JSON.stringify(original, null, 2));
const cases = [];
for (const [index, record] of original.entries()) for (const mode of ['outside', 'none', 'left-boundary', 'on-time']) {
  const cause = record.tArrive - 1600;
  const reality = mode === 'outside' ? record.t - record.recentRealityMs :
    mode === 'left-boundary' ? record.tArrive - NOVELTY.toleranceMs : mode === 'on-time' ? record.tArrive : null;
  const w = newConnection(0, 5, 6, record.createdAt); w.W = record.W;
  const f = new FutureSlices([0, 6], { weights: [w] }), learner = new ThreeFactor(f);
  const errors = new SpikingNovelty(f.past.ids, 7 + index);
  let matched = null, diedAt = null;
  const windows = [];
  for (let t = cause; t <= record.t + 100; t += 100) {
    const onsets = [t === cause ? { id: 0, strength: record.activation } : null,
      t === reality ? { id: 6, strength: 1 } : null].filter(Boolean);
    f.update(t, onsets);
    const lines = f.past.lines(t), counts = errors.step(t, [lines[0], lines[9]], f.created, { learn: true });
    const p = errors.pending.find(p => p.ruleKey === w.ruleKey && p.generation === w.generation);
    if (t === record.t) matched = p?.matched;
    learner.step(t, counts, errors.pending);
    if (!f.downward.weights.includes(w)) diedAt ??= t;
    windows.push({ t, reality: t === reality, pending: p ? { ...p } : null,
      counts, W: w.W, alive: f.downward.weights.includes(w), deltas: { ...w.deltas } });
    assert.ok(counts.every(c => !('M' in c) && !('Mraw' in c)));
  }
  const isHit = mode === 'left-boundary' || mode === 'on-time';
  assert.equal(matched > 0, isHit);
  if (isHit) { assert.equal(diedAt, null); assert.equal(w.deltas.miss, 0); }
  else { assert.equal(diedAt, record.t); assert.equal(w.W, 0); assert.equal(w.deltas.STDP, 0); }
  if (mode === 'left-boundary') assert.equal(w.deltas.STDP, 0, 'Inclusive edge is a hit with zero timing credit');
  if (mode === 'on-time') assert.ok(w.deltas.STDP > 0);
  cases.push({ index, mode, cause, reality, arrival: record.tArrive, deadline: record.t,
    initialW: record.W, finalW: w.W, originalGeneration: w.generation, diedAt, matched, windows });
}
const changed = Object.entries(source).filter(([f, data]) => hash(readFileSync(resolve(ROOT, f))) !== data.sha256).map(([f]) => f);
assert.deepEqual(changed, []);
const result = { schema: manifest.schema, finished: new Date().toISOString(), seconds: (performance.now() - start) / 1000,
  originalCases: original.length, newCases: cases.length, modes: ['outside', 'none', 'left-boundary', 'on-time'],
  checks: { unmatchedDeletedAtDeadline: true, boundaryHitNotWeakened: true, onTimeHitStrengthens: true,
    noNeuralM: true, sourceUnchanged: true }, changed, cases, limitation: manifest.limitation };
writeFileSync(resolve(directory, 'results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, cases: undefined }, null, 2));
