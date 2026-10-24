import assert from 'node:assert/strict';
// Independent arithmetic auditors retained from L3b; no model learner/solver calls.
const near = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 1e-12, `${a} != ${b}`);
const key = (i, j) => Math.min(i, j) * 250 + Math.max(i, j);

/** Independent replay of every rho/H/sample update; no production learner call. */
export function auditLearning(events, channels, inspect) {
  const state = new Map();
  for (const [eventIndex, event] of events.entries()) {
    assert.equal(event.K, 1); assert.equal(event.carrier, 1 / 6); assert.equal(event.strengthScale, .1);
    assert.deepEqual(event.sources, [...new Set(event.sources)].sort((a, b) => a - b));
    const supplied = new Set(event.sources);
    for (const i of event.sources) for (const j of event.sources) if (i < j && !state.has(key(i, j))) {
      state.set(key(i, j), { i, j, rho: 0, H: Array(200).fill(0), samples: [], coLit: 0, oneEnd: 0 });
    }
    for (const edge of state.values()) {
      const a = supplied.has(edge.i), b = supplied.has(edge.j);
      if (a && b) {
        edge.rho = 1 - (1 - edge.rho) * .8 ** .1;
        edge.coLit++;
        edge.samples.push(1 / 6);
        for (let bin = 0; bin < 200; bin++) edge.H[bin] += Math.exp(-.5 * ((bin / 199 - 1 / 6) / .05) ** 2);
      } else if (a !== b) { edge.rho *= .96 ** .1; edge.oneEnd++; }
    }
    if (inspect) inspect([...state.values()], eventIndex);
  }
  assert.equal(channels.length, state.size);
  for (const edge of channels) {
    const expected = state.get(key(edge.i, edge.j));
    assert.ok(edge.i < edge.j); near(edge.rho, expected.rho);
    assert.deepEqual(edge.samples, expected.samples);
    assert.equal(edge.H.length, 200); edge.H.forEach((v, b) => near(v, expected.H[b]));
  }
  return { status: 'PASS', events: events.length, channels: channels.length,
    pairs: [...state.values()].map(({ i, j, coLit, oneEnd }) => ({ i, j, coLit, oneEnd })) };
}

/** Same-carrier weighted emission: Bellman residual plus actual path witnesses. */
export function auditField(channels, emission, field) {
  const weight = edge => {
    const r = edge.rho;
    const color = Math.min(1, edge.samples.reduce((s, x) => s + Math.exp(-.5 * ((x - 1 / 6) / .05) ** 2), 0));
    return color * r ** 4 / (r ** 4 + (1.5 * (1 - r)) ** 4);
  };
  const edges = new Map(channels.map(edge => [key(edge.i, edge.j), weight(edge)]));
  const source = Array.from({ length: 250 }, (_, p) => emission[p] ?? 0), next = [...source];
  for (const edge of channels) {
    const q = edges.get(key(edge.i, edge.j));
    next[edge.i] = Math.max(next[edge.i], q * field.brightness[edge.j]);
    next[edge.j] = Math.max(next[edge.j], q * field.brightness[edge.i]);
  }
  assert.equal(field.brightness.length, 250);
  for (let i = 0; i < 250; i++) {
    near(next[i], field.brightness[i]);
    const path = field.paths[i];
    let product = path.length ? source[path[0]] : 0;
    if (path.length) { assert.ok(product > 0); assert.equal(path.at(-1), i); }
    for (let h = 1; h < path.length; h++) product *= edges.get(key(path[h - 1], path[h]));
    near(product, field.brightness[i]);
  }
  assert.deepEqual(field.lit, field.brightness.flatMap((b, p) => b > .3 ? [p] : []));
}

/** Reference retina deliberately reads one neighbourhood at a time. */
export function referenceRetina(raw) {
  const result = Array(raw.length).fill(0);
  for (let block = 0; block < raw.length / 27; block++) {
    const candidates = [];
    for (let c = 0; c < 9; c++) {
      const column = [0, 1, 2].map(r => raw[block * 27 + r * 9 + c]);
      if (column.every(x => x === column[0])) continue;
      column.forEach((x, r) => candidates.push({ p: r * 9 + c,
        value: Math.max(0, (3 * x - column[0] - column[1] - column[2]) / 3) }));
    }
    const keep = candidates.filter(x => x.value > 0).sort((a, b) => b.value - a.value || a.p - b.p).slice(0, 6);
    for (const x of keep) result[block * 27 + x.p] = x.value / keep[0].value;
  }
  return result;
}

