import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { checker } from '../src/core/check.mjs';
import { makeRng } from '../src/core/rng.mjs';
import { SpikingNetwork } from '../src/network.mjs';
import { GB_NMDA, STDP, applySTDPWeights } from '../src/stdp.mjs';
import { AttractorLayer } from '../src/layer.mjs';
import { readout } from '../src/readout.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const input = (n, ids) => Array.from({ length: n }, (_, i) => Number(ids.includes(i)));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
function pairNetwork() {
  const net = new SpikingNetwork({ dt: 0.5, pops: [{ name: 'E', n: 2 }] });
  net.connect({ pairs: [[0, 1]], contacts: 1, stdp: true });
  return net;
}

export function verifyLayer() {
  const c = checker('M1 learned attractor layer'), start = performance.now();
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.message); }
  };
  test('GB_NMDA delays presynaptic calcium and learns repeated coincidence', () => {
    const net = pairNetwork(), s = net.groups[0].stdp;
    net.step({ extra: () => [40000, 0] });
    net.run(13.5); close(s.c[0], 0);
    net.step(); close(s.c[0], GB_NMDA.Cpre * Math.exp(-net.dt / GB_NMDA.tauCa));
    const rho = [];
    for (const drive of [[1, 0], [0, 1], [1, 1]]) {
      const p = pairNetwork();
      p.run(5000, { extra: t => drive.map(on => on && t % 50 === 0 ? 40000 : 0) });
      rho.push(p.groups[0].stdp.rho[0]);
    }
    assert.ok(rho[0] < STDP.rho0 && rho[1] < STDP.rho0 && rho[2] > 0.4);
    return `pre/post/paired rho: ${rho.map(x => x.toFixed(3)).join('/')}`;
  });
  test('STDP freeze and checkpoint resume retain calcium, delays, and traces', () => {
    const a = pairNetwork(), b = pairNetwork();
    const drive = { extra: t => t % 50 === 0 ? [40000, 40000] : [0, 0] };
    a.run(51, drive);
    b.loadState(JSON.parse(JSON.stringify(a.saveState())));
    a.run(500, drive); b.run(500, drive);
    assert.deepEqual(b.saveState(), a.saveState());
    const g = a.groups[0], before = [...g.scale], calcium = [...g.stdp.c];
    g.frozen = true; a.run(100, drive);
    assert.deepEqual([...g.scale], before); assert.notDeepEqual([...g.stdp.c], calcium);
    g.frozen = false; a.run(100, { ...drive, learn: false });
    assert.deepEqual([...g.scale], before);
    const saved = a.saveState(), bad = structuredClone(saved);
    bad.groups[0].stdp.pending.data = '';
    assert.throws(() => a.loadState(bad)); assert.deepEqual(a.saveState(), saved);
    assert.throws(() => a.connect({ pairs: [[1, 0]], kind: 'inh', stdp: true }));
  });
  test('P7 counts distinct members, averages replicas, and uses aligned half-open windows', () => {
    const replicas = [
      { E: 1, net: { t: 250, spikes: [[], [49, 50, 51, 52], [150], [249]] } },
      { E: 1, net: { t: 250, spikes: [[], [], [99, 120], []] } },
    ];
    const atts = [{ id: 7, members: [0, 1] }, { id: 9, members: [2] }];
    assert.deepEqual(readout(replicas, atts, 50), [{ id: 7, strength: 0.5 }]);
    assert.deepEqual(readout(replicas, atts, 50, { litThreshold: 0.5 }), []);
    assert.deepEqual(readout(replicas, atts, 150), [{ id: 9, strength: 0.5 }]);
    assert.deepEqual(readout(replicas, atts, 50, { windowMs: 50 }), [{ id: 7, strength: 0.5 }]);
    assert.throws(() => readout(replicas, atts, 151));
    assert.throws(() => readout(replicas, atts, NaN));
  });
  test('Replicas share topology and average weights on absolute 10 ms boundaries', () => {
    const layer = new AttractorLayer({ n: 6, R: 3 });
    layer.replicas.forEach((r, i) => {
      assert.deepEqual(r.EE.pre, layer.replicas[0].EE.pre);
      assert.deepEqual(r.EE.post, layer.replicas[0].EE.post);
      r.EE.stdp.rho.fill(0.1 + 0.2 * i); applySTDPWeights(r.EE);
      r.IE.scale.fill(2 + 2 * i);
    });
    layer.run(9.5);
    assert.notDeepEqual(layer.replicas[0].EE.stdp.rho, layer.replicas[1].EE.stdp.rho);
    const expected = mean(layer.replicas.map(r => {
      const x = r.EE.stdp.rho[0];
      return x - 0.5 * r.EE.stdp.accel * x * (1 - x) * (GB_NMDA.rhoStar - x) / GB_NMDA.tau;
    }));
    layer.run(0.5);
    for (const r of layer.replicas) {
      close(r.EE.stdp.rho[0], expected); close(r.IE.scale[0], 4);
      close(r.EE.scale[0], STDP.sMin + (r.EE.stdp.sMax - STDP.sMin) * expected);
    }
    const whole = new AttractorLayer({ n: 6, R: 1 });
    const chunks = new AttractorLayer({ n: 6, R: 1 });
    whole.run(100, input(6, [0, 2]));
    chunks.run(37.5, input(6, [0, 2])); chunks.run(62.5, input(6, [0, 2]));
    assert.deepEqual(chunks.replicas[0].net.saveState(), whole.replicas[0].net.saveState());
    assert.throws(() => layer.run(0.1)); assert.throws(() => layer.run(10, [1]));
    assert.throws(() => new AttractorLayer({ R: 0 }));
  });

  // Two sizes and shuffled memberships use identical module parameters throughout.
  for (const [n, seed] of [[18, 7], [24, 19]]) {
    const layer = new AttractorLayer({ n, R: 3, seed });
    const ids = makeRng(seed).shuffle(Array.from({ length: n }, (_, i) => i));
    const patterns = Array.from({ length: 3 }, (_, p) =>
      ids.slice(p * n / 3, (p + 1) * n / 3).sort((a, b) => a - b));
    const expected = patterns.map(members => ({ id: members[0], members })).sort((a, b) => a.id - b.id);
    const initialIE = layer.replicas.map(r => [...r.IE.scale]);
    const fixedAFF = layer.replicas.map(r => [...r.AFF.scale]);
    test(`${n} E: repeated patterns learn exactly three unlabelled attractors`, () => {
      assert.deepEqual(layer.identify(), []);
      for (let epoch = 0; epoch < 12; epoch++) for (let p = 0; p < 3; p++) {
        layer.run(500, input(n, patterns[(p + epoch) % 3])); layer.run(300);
      }
      assert.deepEqual(layer.identify(), expected);
      for (const threshold of [0.3, 0.4]) assert.deepEqual(layer.identify(threshold), expected);
      layer.identify();
      layer.replicas.forEach((r, i) => {
        assert.deepEqual([...r.AFF.scale], fixedAFF[i]);
        assert.deepEqual(r.EE.stdp.rho, layer.replicas[0].EE.stdp.rho);
        assert.deepEqual(r.IE.scale, layer.replicas[0].IE.scale);
        assert.ok(r.IE.scale.some((w, k) => w > initialIE[i][k]));
        assert.ok(r.net.spikes.slice(n, r.X).every(s => s.length > 0));
      });
      assert.notDeepEqual(layer.replicas[0].net.spikes, layer.replicas[1].net.spikes);
      return `3 × ${n / 3} members; fixed afferents, independent noise`;
    });
    test(`${n} E: 50% cues recruit uncued members; P7 grows with cue fraction`, () => {
      const weights = layer.replicas.map(r => [...r.EE.scale]);
      const rows = [];
      for (const members of patterns) {
        const strengths = [];
        for (const fraction of [0.25, 0.5, 1]) {
          const trials = [];
          for (let trial = 0; trial < 6; trial++) {
            layer.run(500, undefined, { learn: false });
            const cue = members.map((_, k) => members[(k + trial) % members.length])
              .slice(0, Math.ceil(fraction * members.length));
            const onset = layer.t;
            layer.run(100, input(n, cue), { learn: false });
            const output = layer.readout(onset, { litThreshold: 0 });
            const strength = output.find(a => a.id === members[0])?.strength ?? 0;
            assert.ok(output.filter(a => a.id !== members[0]).every(a => a.strength < strength));
            if (fraction >= 0.5) assert.ok(layer.readout(onset).some(a => a.id === members[0]));
            trials.push(strength);
          }
          strengths.push(mean(trials));
        }
        assert.ok(strengths[1] > 0.5, `No completion: ${strengths}`);
        assert.ok(strengths[0] < strengths[1] && strengths[1] <= strengths[2], `${strengths}`);
        rows.push(strengths.map(x => x.toFixed(2)).join(' → '));
      }
      layer.replicas.forEach((r, i) => assert.deepEqual([...r.EE.scale], weights[i]));
      return rows.join('; ');
    });
    test(`${n} E: settled no-input windows light no attractors`, () => {
      layer.run(500, undefined, { learn: false });
      for (let k = 0; k < 10; k++) {
        const onset = layer.t; layer.run(100, undefined, { learn: false });
        assert.deepEqual(layer.readout(onset), []);
      }
    });
    test(`${n} E: learned iSTDP bounds rates and preserves separate attractors`, () => {
      const snapshots = layer.replicas.map(r => r.net.saveState()), ticks = layer.ticks;
      const measure = () => {
        const onset = layer.t;
        layer.run(1000, input(n, patterns[0]), { learn: false });
        return mean(layer.replicas.flatMap(r => patterns[0].map(i =>
          r.net.spikes[r.E + i].filter(t => t >= onset).length)));
      };
      const trained = measure();
      layer.replicas.forEach((r, i) => { r.net.loadState(snapshots[i]); r.IE.scale.set(initialIE[i]); });
      layer.ticks = ticks;
      const initial = measure();
      assert.ok(trained > 0 && trained < 50 && trained < initial, `${initial} -> ${trained} Hz`);
      layer.replicas.forEach((r, i) => r.net.loadState(snapshots[i])); layer.ticks = ticks;
      assert.deepEqual(layer.identify(), expected);
      return `same probe/noise, initial → learned inhibition: ${initial.toFixed(1)} → ${trained.toFixed(1)} Hz`;
    });
  }
  test('M1 verification finishes within 30 seconds', () => {
    const elapsed = (performance.now() - start) / 1000;
    assert.ok(elapsed < 30); return `${elapsed.toFixed(2)} s`;
  });
  return c.done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = verifyLayer() ? 0 : 1;
}
