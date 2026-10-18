import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { checker } from '../src/core/check.mjs';
import { makeRng } from '../src/core/rng.mjs';
import { LIFNeuron, LIF_DEFAULT } from '../src/neuron/lif.mjs';
import { Synapse, RECEPTORS, kernelNorm, mgBlock } from '../src/synapse.mjs';
import { SpikingNetwork, ISTDP_DEFAULT } from '../src/network.mjs';
import { saveCheckpoint, loadCheckpoint } from '../src/checkpoint.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const I_CURRENTS = Array.from({ length: 8 }, (_, i) => 210 + 17 * i);
const DRIVES = [220, 300, 380];
function jointNetwork() {
  const net = new SpikingNetwork({ seed: 19, pops: [
    { name: 'E', n: 3, p: { b: 10 } }, { name: 'I', n: 2 },
    { name: 'silent', n: 1, p: { Vth: Infinity, b: -0 } },
  ] });
  net.connect({ from: 'E', to: 'E', p: 0.7 });
  net.connect({ from: 'E', to: 'I', kind: 'nmda' });
  net.connect({ from: 'E', to: 'E', kind: 'slow' });
  net.connect({ from: 'I', to: 'E', kind: 'inh', istdp: { tauPre: 200 } });
  net.connect({ from: 'I', to: 'E', kind: 'inhFast', istdp: { tau: 40 } }).frozen = true;
  net.rng.normal(); // Snapshot must retain the cached second normal variate.
  return net;
}
const drive = net => ({
  rate: i => i < 5 ? 25 : 0,
  extra: t => [230 + 20 * net.rng.normal(), t % 100 < 40 ? 260 : 170, 250, 300, 280, 0],
});

export function verifyCore() {
  const c = checker('M0 spiking core');
  const test = (name, fn) => {
    try { c.check(name, true, fn() ?? ''); }
    catch (error) { c.check(name, false, error.message); }
  };
  test('RNG reproduces the reference sequence and resumes mixed draws', () => {
    const expected = [0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
      0.9810509674716741, 0.9683778982143849];
    const a = makeRng(1), b = makeRng(1);
    assert.deepEqual(Array.from({ length: 5 }, a.uniform), expected);
    assert.deepEqual(Array.from({ length: 5 }, b.uniform), expected);
    a.normal(); b.importState(clone(a.exportState()));
    const draws = r => Array.from({ length: 20 }, () => [r.normal(), r.uniform(), r.pick(17),
      r.bernoulliRate(50, 1), r.shuffle([1, 2, 3, 4])]);
    assert.deepEqual(draws(a), draws(b));
    assert.notDeepEqual(makeRng(2).uniform(), expected[0]);
  });
  test('Constant-drive LIF matches the analytic firing rate', () => {
    const { C, gL, EL, Vth, Vreset, tRef } = LIF_DEFAULT;
    const rates = [];
    for (const current of DRIVES) {
      const neuron = new LIFNeuron(), dt = 0.05, ms = 10000;
      for (let k = 0; k < ms / dt; k++) neuron.step(dt, current);
      const expected = 1000 / (tRef + C / gL * Math.log(
        (current / gL + EL - Vreset) / (current / gL + EL - Vth)));
      const actual = neuron.spikes.length * 1000 / ms;
      assert.ok(Math.abs(actual - expected) / expected < 0.01);
      rates.push(`${actual.toFixed(1)}/${expected.toFixed(1)} Hz`);
    }
    const silent = new LIFNeuron();
    for (let i = 0; i < 10000; i++) silent.step(0.1, 100);
    assert.equal(silent.spikes.length, 0);
    return `measured/analytic: ${rates.join(', ')}`;
  });
  test('Network and standalone adaptive LIF agree tick for tick', () => {
    const p = { a: 0.5, b: 10 }, cell = new LIFNeuron(p);
    const net = new SpikingNetwork({ pops: [{ name: 'cell', n: 1, p }] });
    for (let k = 0; k < 10000; k++) {
      const spike = cell.step(net.dt, 300), fired = net.step({ extra: () => [300] });
      assert.equal(fired[0], Number(spike));
      assert.equal(net.V[0], cell.V); assert.equal(net.w[0], cell.w);
    }
    assert.deepEqual(net.spikes[0], cell.spikes);
  });
  test('Sparse probability and expected in-degree wiring are reproducible', () => {
    const build = () => new SpikingNetwork({ seed: 23, pops: [{ name: 'A', n: 80 }, { name: 'B', n: 40 }] });
    const a = build(), b = build();
    const g = a.connect({ from: 'A', to: 'B', inDegree: 8 });
    const h = b.connect({ from: 'A', to: 'B', p: 0.1 });
    assert.deepEqual(g.pre, h.pre); assert.deepEqual(g.post, h.post);
    const mean = g.pre.length / 40;
    const standardError = Math.sqrt(80 * 0.1 * 0.9 / 40);
    assert.ok(Math.abs(mean - 8) < 5 * standardError);
    assert.equal(a.connect({ from: 'B', to: 'B', p: 1 }).pre.length, 40 * 39);
    assert.equal(a.connect({ from: 'A', to: 'B', p: 0 }).pre.length, 0);
    assert.throws(() => a.connect({ from: 'A', to: 'B', inDegree: 81 }));
    return `mean in-degree ${mean.toFixed(2)}, expected 8`;
  });
  test('STD reduces high-rate release and recovers with tauRec', () => {
    const release = interval => {
      const syn = new Synapse(); let last;
      for (let t = 0; t < 5000; t++) { syn.step(1, -65); if (t % interval === 0) last = syn.presynapticSpike(); }
      return last;
    };
    const high = release(10), low = release(200);
    assert.ok(high < low * 0.15);
    const fast = new Synapse({ tauRec: 50 }), slow = new Synapse({ tauRec: 500 });
    for (const syn of [fast, slow]) { syn.presynapticSpike(); for (let i = 0; i < 100; i++) syn.step(1, -65); }
    assert.ok(fast.R > slow.R);
    return `100 Hz: ${high.toFixed(3)}, 5 Hz: ${low.toFixed(3)} vesicles/spike`;
  });
  test('NMDA and slow receptor impulses match their analytic kernels', () => {
    for (const kind of ['nmda', 'slow']) {
      const recipe = kind === 'nmda' ? RECEPTORS.NMDA : { tauR: 10, tauD: 30, q: 0.3 };
      const syn = new Synapse({ kind, contacts: 1, pRelease: 1 });
      const net = new SpikingNetwork({ pops: [{ name: 'pre', n: 1 }, { name: 'post', n: 1, p: { C: 1e100 } }] });
      const g = net.connect({ pairs: [[0, 1]], kind, contacts: 1, pRelease: 1 });
      net.step({ extra: () => [40000, 0] }); syn.presynapticSpike();
      for (let k = 1; k <= 1000; k++) {
        const current = syn.step(net.dt, -65); net.step();
        const t = k * net.dt, expected = recipe.q * kernelNorm(recipe) *
          (Math.exp(-t / recipe.tauD) - Math.exp(-t / recipe.tauR));
        const actual = kind === 'slow' ? g.slow.a[1] - g.slow.b[1] : net.ra[1][1] - net.rb[1][1];
        close(actual, expected);
        close(current, expected * 65 * (kind === 'nmda' ? mgBlock(-65) : 1));
      }
      assert.equal(net.spikes[0].length, 1);
    }
  });
  test('STD depletion ignores fan-out; iSTDP groups retain independent trace windows', () => {
    const net = new SpikingNetwork({ pops: [{ name: 'pre', n: 1 }, { name: 'post', n: 2 }] });
    const short = net.connect({ from: 'pre', to: 'post', kind: 'inh', istdp: {} });
    const long = net.connect({ from: 'pre', to: 'post', kind: 'inh', istdp: { tau: 40, tauPre: 100 } });
    net.step({ extra: () => [40000, 40000, 40000], learn: false });
    close(short.R[0], 1 - short.pRelease);
    net.run(20, { learn: false });
    close(short.x[0], Math.exp(-20.1 / ISTDP_DEFAULT.tau));
    close(long.x[0], Math.exp(-20.1 / 100));
    close(long.y[1], Math.exp(-20.1 / 40));
    assert.ok(long.x[0] > short.x[0]);
  });
  test('Save → JSON → load → continue is identical to an uninterrupted run', () => {
    const continuous = jointNetwork(), first = jointNetwork(), resumed = jointNetwork();
    continuous.run(1200, drive(continuous)); first.run(300, drive(first));
    resumed.loadState(clone(first.saveState()));
    assert.equal(resumed.ref[5], -Infinity);
    assert.equal(resumed.par[5].Vth, Infinity);
    assert.ok(Object.is(resumed.par[5].b, -0));
    assert.equal(resumed.groups[4].frozen, true);
    resumed.run(900, drive(resumed));
    assert.ok(continuous.spikes.slice(0, 5).every(row => row.length > 0));
    assert.deepEqual(resumed.spikes, continuous.spikes);
    assert.deepEqual(resumed.saveState(), continuous.saveState());
    assert.equal(resumed.rng.normal(), continuous.rng.normal());
    const state = clone(first.saveState()), before = resumed.saveState();
    state.groups[0].R.data = '';
    assert.throws(() => resumed.loadState(state)); assert.deepEqual(resumed.saveState(), before);
    const mismatch = jointNetwork(); mismatch.connect({ pairs: [[0, 5]] });
    assert.throws(() => mismatch.loadState(first.saveState()));
  });
  test('Atomic checkpoint replacement preserves the latest complete state', () => {
    const out = fileURLToPath(new URL('../out/', import.meta.url)); mkdirSync(out, { recursive: true });
    const dir = mkdtempSync(join(out, 'verify-'));
    try {
      const file = join(dir, 'network.json'), net = jointNetwork(), resumed = jointNetwork();
      saveCheckpoint(file, net); net.run(100, drive(net)); saveCheckpoint(file, net);
      loadCheckpoint(file, resumed);
      assert.deepEqual(resumed.saveState(), net.saveState());
      net.run(100, drive(net)); resumed.run(100, drive(resumed));
      assert.deepEqual(resumed.saveState(), net.saveState());
      assert.deepEqual(readdirSync(dir), ['network.json']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test('Vogels iSTDP approaches its target across three drive levels', () => {
    const rates = [];
    for (const current of DRIVES) {
      const net = new SpikingNetwork({ dt: 0.2, pops: [{ name: 'E', n: 1 }, { name: 'I', n: 8 }] });
      const g = net.connect({ from: 'I', to: 'E', kind: 'inh', scale: 0, istdp: {} });
      const options = { extra: () => [current, ...I_CURRENTS] };
      net.run(5000, { ...options, learn: false });
      const baseline = net.spikes[0].length / 5;
      assert.ok(g.scale.every(w => w === 0));
      net.run(30000, options); const before = net.spikes[0].length;
      net.run(10000, options); const trained = (net.spikes[0].length - before) / 10;
      assert.ok(Math.abs(trained - ISTDP_DEFAULT.target) < 1);
      assert.ok(Math.abs(trained - ISTDP_DEFAULT.target) < Math.abs(baseline - ISTDP_DEFAULT.target) * 0.1);
      assert.ok(g.scale.every(w => w > 0 && w <= ISTDP_DEFAULT.wMax));
      g.frozen = true; const weights = [...g.scale], resources = [...g.R], traces = [...g.x];
      net.run(100, options);
      assert.deepEqual([...g.scale], weights);
      assert.notDeepEqual([...g.R], resources); assert.notDeepEqual([...g.x], traces);
      rates.push(`${baseline.toFixed(1)} → ${trained.toFixed(1)} Hz`);
    }
    return `${rates.join(', ')}; target ${ISTDP_DEFAULT.target} Hz`;
  });
  return c.done();
}
