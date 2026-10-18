import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { AttractorLayer } from '../src/layer.mjs';
import { SpikingNetwork } from '../src/network.mjs';
import { GB_NMDA, STDP, stepSTDP } from '../src/stdp.mjs';
import { TimeUnroll } from '../src/unroll.mjs';

export function verifyM3Dynamics() {
  const c = checker('M3 non-coincident learning regression');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.message); }
  };
  test('An inhibitory-only volley cannot cross its reversal or create E spikes', () => {
    const net = new SpikingNetwork({ dt: 0.5, pops: [
      { name: 'E', n: 1 }, { name: 'I', n: 21, p: { C: 100, tRef: 1 } },
    ] });
    net.connect({ from: 'I', to: 'E', kind: 'inh', contacts: 10, pRelease: 0.5, scale: 40 });
    let minimum = -65;
    for (let t = 0; t < 30; t += 0.5) {
      net.step({ extra: time => Array.from({ length: 22 }, (_, i) => i > 0 && time === 0 ? 40000 : 0) });
      minimum = Math.min(minimum, net.V[0]);
    }
    assert.equal(net.spikes[0].length, 0, `Inhibition alone generated ${net.spikes[0].length} spikes; min V ${minimum}`);
    assert.ok(minimum >= -75 && minimum < -65);
    return `0 E spikes; minimum ${minimum.toFixed(3)} mV`;
  });
  test('Strong post-only bursts never potentiate a synapse with silent pre, in either direction', () => {
    const rho = [];
    for (const post of [0, 1]) for (const period of [50, 25, 5]) {
      const net = new SpikingNetwork({ dt: 0.5, pops: [{ name: 'E', n: 2 }] });
      const g = net.connect({ pairs: [[0, 1], [1, 0]], stdp: true });
      const k = post === 1 ? 0 : 1, pre = 1 - post;
      let maxCalcium = 0;
      for (let t = 0; t < 5000; t += 0.5) {
        // Ungated STDP must still check this directed edge's own presynaptic trace.
        const before = g.stdp.rho[k];
        net.step({ extra: () => [0, 1].map(i => i === post && t % period === 0 ? 40000 : 0) });
        maxCalcium = Math.max(maxCalcium, g.stdp.c[k]);
        assert.ok(g.stdp.rho[k] <= before, `${pre}→${post}: post-only LTP at ${t} ms`);
      }
      assert.equal(net.spikes[pre].length, 0);
      assert.equal(net.spikes[post].length, 5000 / period);
      assert.equal(g.stdp.nmda[pre], 0);
      if (period <= 25) assert.ok(maxCalcium > GB_NMDA.thetaP);
      assert.ok(g.stdp.rho[k] < STDP.rho0); // LTD and low-weight drift still act.
      rho.push(g.stdp.rho[k]);
    }
    return `20/40/200 Hz, both directions: rho ${rho.map(x => x.toFixed(6)).join('/')}`;
  });
  test('Layer-2 co-activity learns with no surprise; explicit frozen probes remain frozen', () => {
    const layer = new AttractorLayer({ n: 2, R: 1, seed: 7, level: 2 });
    const { EE, net } = layer.replicas[0];
    const before = [...EE.stdp.rho];
    layer.run(500, [1, 1]);
    assert.ok(net.spikes.slice(0, 6).some(s => s.length));
    assert.ok(EE.stdp.rho.some((w, i) => w > before[i]));
    const learned = [...EE.stdp.rho];
    layer.run(500, [1, 1], { learn: false });
    assert.deepEqual([...EE.stdp.rho], learned);
  });
  test('Dormant L2 edges retain rho under ungated post bursts; active-pre LTD remains', () => {
    const net = new SpikingNetwork({ dt: 0.5, pops: [{ name: 'E', n: 3 }] });
    const g = net.connect({ pairs: [[0, 1], [1, 0], [2, 1]],
      stdp: { accel: 1, protectDormant: true } });
    const fired = new Uint8Array(3);
    g.stdp.rho.set([0.16, 0.6, 0.16]);
    for (let t = 0; t < 30000; t += 0.5) {
      fired[1] = Number(t % 5 === 0); // T2-like repeated outcomes, dormant pre.
      stepSTDP(g, fired, 0.5, true);
      assert.equal(g.stdp.rho[0], 0.16); assert.equal(g.stdp.rho[2], 0.16);
    }
    assert.ok(g.stdp.c[0] > GB_NMDA.thetaP);
    assert.equal(g.stdp.nmda[0], 0);
    g.stdp.nmda[0] = STDP.preThreshold / 2; // Old, nonzero trace is also ineligible.
    stepSTDP(g, fired, 0.5, true); assert.equal(g.stdp.rho[0], 0.16);
    // Isolate LTD below thetaP with a still-eligible (but not coincident) pre.
    g.frozen = false; g.stdp.c[0] = 1.1; g.stdp.nmda[0] = 0.02;
    fired.fill(0); stepSTDP(g, fired, 0.5, true);
    assert.ok(g.stdp.rho[0] < 0.16 - 0.0001);
    // Restore calcium/traces through a frozen rest, then learn coincidence.
    for (let t = 0; t < 1000; t += 0.5) stepSTDP(g, fired, 0.5, false);
    g.stdp.rho.fill(0.16);
    const before = [...g.stdp.rho];
    for (let t = 0; t < 5000; t += 0.5) {
      fired[0] = fired[1] = Number(t % 25 === 0);
      stepSTDP(g, fired, 0.5, true);
    }
    assert.ok(g.stdp.rho[0] > before[0] && g.stdp.rho[1] > before[1]);
    assert.equal(g.stdp.rho[2], 0.16);
    return `dormant Δrho=0; coincident rho=${g.stdp.rho[0].toFixed(6)}/${g.stdp.rho[1].toFixed(6)}`;
  });
  test('Explicit L2 freeze preserves weak/strong rho across replica synchronization and identification', () => {
    const layer = new AttractorLayer({ n: 2, R: 2, seed: 7, level: 2 });
    layer.replicas.forEach(({ EE }, i) => { EE.frozen = true; EE.stdp.rho.fill(i ? 0.6 : 0.16); });
    const before = layer.replicas.map(({ EE }) => [...EE.stdp.rho]);
    layer.run(100, [1, 1]); layer.identify();
    assert.deepEqual(layer.replicas.map(({ EE }) => [...EE.stdp.rho]), before);
    assert.ok(layer.replicas.every(({ EE }) => EE.stdp.c.some(x => x > 0)));
  });
  test('Coincidence potentiates both directions without potentiating a silent source edge', () => {
    const net = new SpikingNetwork({ dt: 0.5, pops: [{ name: 'E', n: 3 }] });
    const g = net.connect({ pairs: [[0, 1], [1, 0], [2, 1]], stdp: true });
    const fired = new Uint8Array(3);
    for (let t = 0; t < 5000; t += 0.5) {
      fired[0] = fired[1] = Number(t % 25 === 0);
      const silentBefore = g.stdp.rho[2];
      stepSTDP(g, fired, 0.5, true);
      assert.ok(g.stdp.rho[2] <= silentBefore);
    }
    assert.ok(g.stdp.rho[0] > 0.4 && g.stdp.rho[1] > 0.4);
    assert.equal(g.stdp.rho[0], g.stdp.rho[1]);
    assert.equal(g.stdp.nmda[2], 0);
    return `A→B/B→A/silent→B rho ${[...g.stdp.rho].map(x => x.toFixed(6)).join('/')}`;
  });
  test('An old presynaptic spike cannot enable LTP during later post-only bursts', () => {
    const net = new SpikingNetwork({ dt: 0.5, pops: [{ name: 'E', n: 2 }] });
    const g = net.connect({ pairs: [[0, 1]], stdp: true });
    const fired = new Uint8Array([1, 0]);
    stepSTDP(g, fired, 0.5, false);
    fired[0] = 0;
    for (let t = 0; t < 500; t += 0.5) stepSTDP(g, fired, 0.5, false);
    assert.ok(g.stdp.nmda[0] > 0 && g.stdp.nmda[0] < 0.01);
    let maxCalcium = 0;
    for (let t = 0; t < 1000; t += 0.5) {
      fired[1] = Number(t % 5 === 0);
      const before = g.stdp.rho[0];
      stepSTDP(g, fired, 0.5, true);
      maxCalcium = Math.max(maxCalcium, g.stdp.c[0]);
      assert.ok(g.stdp.rho[0] <= before);
    }
    assert.ok(maxCalcium > GB_NMDA.thetaP);
  });
  test('The unchanged bistable rule still drifts already-strong weights upward in silence', () => {
    const net = new SpikingNetwork({ dt: 0.5, pops: [{ name: 'E', n: 2 }] });
    const g = net.connect({ pairs: [[0, 1]], stdp: true });
    g.stdp.rho[0] = 0.6; net.run(1000);
    assert.ok(net.spikes.every(s => s.length === 0));
    assert.ok(g.stdp.rho[0] > 0.6 && g.stdp.rho[0] < 0.601);
    return `rho 0.6 → ${g.stdp.rho[0].toFixed(6)}; no rest learning gate`;
  });
  test('Disjoint input lines do not acquire strong cross-line weights', () => {
    const layer = new AttractorLayer({ n: 6, R: 1, seed: 31, level: 2 });
    const { net, EE, E } = layer.replicas[0], cells = layer.cellsPerLine ?? 1;
    let uncued = 0, driven = 0;
    for (let repeat = 0; repeat < 6; repeat++) for (let line = 0; line < layer.n; line++) {
      net.spikes.forEach(s => { s.length = 0; });
      layer.run(line % 2 ? 1000 : 100, Array.from({ length: layer.n }, (_, i) => Number(i === line)));
      for (let i = 0; i < layer.n * cells; i++) {
        if (Math.floor(i / cells) === line) driven += net.spikes[E + i].length;
        else uncued += net.spikes[E + i].length;
      }
      layer.run(300);
    }
    const cross = [...EE.stdp.rho].filter((_, k) =>
      Math.floor((EE.pre[k] - E) / cells) !== Math.floor((EE.post[k] - E) / cells));
    const max = Math.max(...cross);
    assert.ok(driven > 100, `Drive must remain effective: ${driven} spikes`);
    assert.equal(uncued, 0);
    assert.ok(max <= STDP.rho0, `Disjoint inputs: max rho ${max.toFixed(6)}, ${uncued} uncued spikes`);
    return `${driven} driven spikes; ${uncued} uncued; max cross-line rho ${max.toFixed(6)}`;
  });
  test('Silent fresh layers have no noise spikes or potentiation; replica states are separate', () => {
    const layer = new AttractorLayer({ n: 6, R: 2, seed: 31 });
    const [a, b] = layer.replicas;
    assert.notEqual(a.EE.stdp.c.buffer, b.EE.stdp.c.buffer);
    assert.notEqual(a.EE.stdp.pending.buffer, b.EE.stdp.pending.buffer);
    const baseline = [...a.EE.stdp.rho];
    layer.run(1000);
    for (const { net, EE } of layer.replicas) {
      assert.ok(net.spikes.every(s => s.length === 0));
      assert.ok(EE.stdp.rho.every((x, k) => x < baseline[k]));
    }
    assert.ok(baseline.every(x => x === STDP.rho0));
  });
  test('Layer-2 checkpoints restore its weight cap/rate and changing source rates exactly', () => {
    const a = new AttractorLayer({ n: 6, R: 1, seed: 31, level: 2 });
    const b = new AttractorLayer({ n: 6, R: 1, seed: 31, level: 2 });
    const input = [1, 0.5, 0, 0, 0, 0];
    a.run(100, input);
    const saved = a.replicas[0].net.saveState();
    b.replicas[0].EE.stdp.sMax = 9; b.replicas[0].EE.stdp.accel = 9;
    b.replicas[0].EE.stdp.protectDormant = false;
    b.replicas[0].net.loadState(saved); b.ticks = a.ticks;
    assert.equal(b.replicas[0].EE.stdp.protectDormant, true);
    for (const lines of [undefined, input, input.slice().reverse()]) {
      a.run(100, lines); b.run(100, lines);
      assert.deepEqual(a.replicas[0].net.saveState(), b.replicas[0].net.saveState());
    }
  });
  test('Flatten results own their buffers and keep the ordered attractor ID mapping', () => {
    const ids = [12, 0, 6], u = new TimeUnroll(ids);
    const first = u.update(0, [{ id: 6, strength: 0.75 }]).lines(0);
    ids.reverse(); // Caller mutation cannot change rows.
    const second = u.update(3000, [{ id: 12, strength: 1 }]).lines(3000);
    assert.notEqual(first.buffer, second.buffer);
    assert.equal(first[18], 0.75); assert.equal(first[24], 0);
    assert.equal(second[0], 1); assert.equal(second[24], 0.75);
    assert.equal(second.filter(x => x > 0).length, 2);
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyM3Dynamics() ? 0 : 1;
}
