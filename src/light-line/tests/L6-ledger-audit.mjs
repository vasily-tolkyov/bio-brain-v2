import assert from 'node:assert/strict';

const close = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 1e-12, `${a} != ${b}`);
const copy = s => structuredClone(s);
const col = age => {
  if (age >= 12800 * Math.SQRT2) return -1;
  let k = 0; while (k < 8 && age >= 100 * 2 ** k / Math.SQRT2) k++;
  return k;
};

/** Independent reference W machine: no production predictor/comparator/learner
 * imports. Replay real P7, then compare every birth, hit, miss, clamp and ID. */
export function auditLedger({ ids, observations, end, initial = null, expected, changes = null, labels = [] }) {
  const source = new Map(labels);
  const same = (a, b) => source.has(a) && source.get(a) === source.get(b);
  const store = copy(initial?.future.downward ?? { weights: [], nextGeneration: 1 });
  let past = copy(initial?.future.past.entries ?? []), previous = new Set(initial?.future.past.previous ?? []);
  let pending = copy(initial?.novelty.pending ?? []), credits = copy(initial?.factor.predictions ?? []);
  const start = initial ? initial.future.t + 100 : 0, raw = new Map(observations.map(e => [e.t, e.readouts]));
  const referenceChanges = [], launched = [];
  for (let t = start; t <= end; t += 100) {
    const before = store.weights.map(w => ({ object: w, W: w.W, deltas: { ...w.deltas } }));
    const current = new Map();
    for (const r of raw.get(t) ?? []) if (r.strength > .25) current.set(r.id, Math.max(current.get(r.id) ?? 0, r.strength));
    past = past.filter(e => t - e.tOnset < 12800 * Math.SQRT2);
    const onsets = [...current].filter(([id]) => !previous.has(id)).map(([id, strength]) => ({ id, strength, tOnset: t }));
    past.push(...onsets); previous = new Set(current.keys());
    pending = pending.filter(e => t <= e.tArrive + 500);
    for (const onset of onsets) for (const w of store.weights) if (w.A === onset.id && w.A !== w.B) {
      const p = { A: w.A, B: w.B, k: w.k, generation: w.generation, ruleKey: w.ruleKey,
        activation: onset.strength, strength: onset.strength * w.W / .1,
        tArrive: t + 100 * 2 ** (w.k - 1), tOnset: t, createdAt: w.createdAt };
      launched.push(copy(p)); pending.push({ ...p, matched: 0 });
    }
    const find = p => store.weights.find(w => w.ruleKey === p.ruleKey && w.generation === p.generation);
    credits = credits.filter(find);
    const reality = id => past.some(e => e.id === id && col(t - e.tOnset) === 0 && e.strength > .25);
    const live = pending.filter(p => t >= p.tArrive - 500);
    for (const p of live) {
      if (reality(p.B)) p.matched = 1;
      const w = find(p); if (!w) continue;
      let c = credits.find(c => c.generation === p.generation && c.tArrive === p.tArrive);
      if (!c) { c = { ruleKey: p.ruleKey, generation: p.generation, tArrive: p.tArrive,
        sourceActivation: p.activation, matched: false }; credits.push(c); }
      if (!c.matched && p.matched) {
        const a = p.activation * Math.max(0, 1 - Math.abs(t - p.tArrive) / 500);
        if (!(same(p.A, p.B) && p.tOnset === t) && t > w.createdAt && a > .01) {
          const after = Math.min(.1, w.W + .1 * .205 * (1 + .05 * Math.exp(-(t - w.createdAt) / 5000)) * a * (1 - w.W / .1));
          w.deltas.STDP += after - w.W; w.W = after;
        }
        if (same(p.A, p.B) && p.tOnset === t) c.ignoredSameSource = true;
        c.matched = true;
      }
    }
    for (const c of credits.filter(c => c.tArrive + 500 === t)) {
      const w = find(c); if (c.matched || !w) continue;
      const delta = -.1 * .24 * (.2 + .8 * (1 - w.W / .1)) * c.sourceActivation;
      const rawW = w.W + delta; w.W = Math.max(0, rawW);
      w.deltas.miss += delta; w.deltas.clamp += w.W - rawW;
      if (w.W === 0) { store.weights.splice(store.weights.indexOf(w), 1); credits = credits.filter(x => x.generation !== w.generation); }
    }
    credits = credits.filter(c => t < c.tArrive + 500);
    for (const B of ids) if (reality(B) && !live.some(p => p.B === B && p.strength > .25)) {
      for (const A of ids) if (A !== B) for (let k = 1; k <= 8; k++) {
        if (!past.some(e => e.id === A && e.strength > 0 && col(t - e.tOnset) === k)) continue;
        if (same(A, B)) {
          const post = past.findLast(e => e.id === B);
          const pre = past.filter(e => e.id === A && e.strength > 0 && col(t - e.tOnset) === k);
          if (!post || (pre.length && pre.every(e => e.tOnset === post.tOnset))) continue;
        }
        const ruleKey = JSON.stringify([A, k, B]);
        if (store.weights.some(w => w.ruleKey === ruleKey)) continue;
        store.weights.push({ A, B, k, ruleKey, W: .01, createdAt: t,
          deltas: { STDP: 0, N: .01, miss: 0, clamp: 0 }, generation: store.nextGeneration++ });
      }
    }
    for (const w of new Set([...before.map(x => x.object), ...store.weights])) {
      const old = before.find(x => x.object === w);
      if (old && old.W === w.W) continue;
      referenceChanges.push({ t, ruleKey: w.ruleKey, generation: w.generation, before: old?.W ?? 0,
        after: w.W, live: store.weights.includes(w), deltas: Object.fromEntries(['STDP', 'N', 'miss', 'clamp']
          .map(k => [k, w.deltas[k] - (old?.deltas[k] ?? 0)])) });
    }
  }
  assert.equal(store.nextGeneration, expected.future.downward.nextGeneration);
  assert.equal(store.weights.length, expected.future.downward.weights.length);
  store.weights.forEach((w, i) => {
    const e = expected.future.downward.weights[i];
    for (const k of ['A', 'B', 'k', 'ruleKey', 'createdAt', 'generation']) assert.equal(w[k], e[k]);
    close(w.W, e.W); for (const k of ['STDP', 'N', 'miss', 'clamp']) close(w.deltas[k], e.deltas[k]);
  });
  assert.deepEqual(past, expected.future.past.entries);
  assert.deepEqual(credits, expected.factor.predictions);
  assert.deepEqual(pending, expected.novelty.pending);
  if (changes) {
    assert.equal(referenceChanges.length, changes.length);
    referenceChanges.forEach((c, i) => {
      const e = changes[i];
      for (const k of ['t', 'ruleKey', 'generation', 'live']) assert.equal(c[k], e[k]);
      close(c.before, e.before); close(c.after, e.after);
      for (const k of ['STDP', 'N', 'miss', 'clamp']) close(c.deltas[k], e.deltas[k]);
    });
  }
  return { pass: true, windows: (end - start) / 100 + 1, changes: referenceChanges.length,
    launches: launched.length, generations: store.nextGeneration - 1 };
}

