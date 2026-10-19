/** JSON-safe Float64 snapshots, including refractory -Infinity, outside the tick loop. */
import { createHash } from 'node:crypto';
import { makeRng } from './rng.mjs';
import { LIF_DEFAULT } from '../neuron/lif.mjs';
import { STDP } from '../stdp.mjs';

const VECTORS = ['V', 'w', 'ref', 'Rin'];
const RECEPTORS = ['ra', 'rb', 'ea', 'eb'];
const PARAMETERS = Object.keys(LIF_DEFAULT);
const STDP_VECTORS = ['rho', 'c', 'nmda', 'pending'];
const pack = a => ({ length: a.length,
  data: Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64') });
function unpack(value, length = value?.length) {
  if (!Number.isInteger(length) || length < 0 || value?.length !== length || typeof value.data !== 'string') {
    throw new Error('Invalid state vector length');
  }
  const bytes = Buffer.from(value.data, 'base64');
  if (bytes.length !== length * 8) throw new Error('Invalid state vector bytes');
  const out = new Float64Array(length);
  Buffer.from(out.buffer).set(bytes);
  return out;
}
function topology(net) {
  return createHash('sha256').update(JSON.stringify({ dt: net.dt,
    pops: Object.entries(net.pops).map(([name, p]) => [name, p.start, p.n, ...(p.source ? [true] : [])]),
    groups: net.groups.map(g => [g.kind, [...g.pre], [...g.post], !!g.istdp,
      g.slow ? [g.slow.tauR, g.slow.tauD, ...(g.slow.E ? [g.slow.E] : [])] : null, ...(g.stdp ? [true] : [])]),
  })).digest('hex');
}

export function saveNetworkState(net) {
  return {
    schema: 1, topology: topology(net), t: net.t, rng: net.rng.exportState(),
    parameters: Object.values(net.pops).map(p => pack(Float64Array.from(PARAMETERS, key => p.p[key]))),
    vectors: Object.fromEntries(VECTORS.map(n => [n, pack(net[n])])),
    receptors: Object.fromEntries(RECEPTORS.map(n => [n, net[n].map(pack)])),
    groups: net.groups.map(g => ({
      contacts: g.contacts, pRelease: g.pRelease, tauRec: g.tauRec,
      frozen: g.frozen, istdp: g.istdp ? { ...g.istdp } : null,
      stdp: g.stdp ? { cursor: g.stdp.cursor, sMax: g.stdp.sMax, accel: g.stdp.accel,
        protectDormant: g.stdp.protectDormant,
        ...Object.fromEntries(STDP_VECTORS.map(key => [key, pack(g.stdp[key])])) } : null,
      R: pack(g.R), scale: pack(g.scale), x: g.x ? pack(g.x) : null, y: g.y ? pack(g.y) : null,
      slow: g.slow ? { a: pack(g.slow.a), b: pack(g.slow.b) } : null,
    })),
    spikes: net.spikes.map(row => pack(Float64Array.from(row))),
  };
}

export function loadNetworkState(net, state) {
  if (state?.schema !== 1 || state.topology !== topology(net) ||
      state.groups?.length !== net.groups.length || state.spikes?.length !== net.N ||
      state.parameters?.length !== Object.keys(net.pops).length ||
      !Number.isFinite(state.t) || state.t < 0) throw new Error('State/topology mismatch');
  // Decode all arrays and RNG before mutating the destination network.
  const rng = makeRng(); rng.importState(state.rng);
  const parameters = state.parameters.map(p => unpack(p, PARAMETERS.length));
  const vectors = VECTORS.map(n => unpack(state.vectors[n], net.N));
  const receptors = RECEPTORS.map(n => {
    if (state.receptors[n].length !== net[n].length) throw new Error('Receptor state mismatch');
    return state.receptors[n].map(v => unpack(v, net.N));
  });
  const groups = state.groups.map((g, i) => {
    const dest = net.groups[i];
    if (!!g.istdp !== !!dest.istdp || !!g.stdp !== !!dest.stdp || !!g.slow !== !!dest.slow) {
      throw new Error('Group state mismatch');
    }
    if (g.stdp && (!Number.isInteger(g.stdp.cursor) || g.stdp.cursor < 0 ||
        g.stdp.cursor > dest.stdp.delay)) throw new Error('Invalid calcium delay cursor');
    if (g.stdp && (!(g.stdp.sMax >= STDP.sMin) || !(g.stdp.accel > 0) ||
        !Number.isFinite(g.stdp.sMax) || !Number.isFinite(g.stdp.accel))) throw new Error('Invalid STDP parameters');
    return { ...g, R: unpack(g.R, net.N), scale: unpack(g.scale, dest.scale.length),
      stdp: g.stdp ? { cursor: g.stdp.cursor, sMax: g.stdp.sMax, accel: g.stdp.accel,
        protectDormant: g.stdp.protectDormant ?? false,
        ...Object.fromEntries(STDP_VECTORS.map(key =>
        [key, unpack(g.stdp[key], dest.stdp[key].length)])) } : null,
      x: g.istdp ? unpack(g.x, net.N) : null, y: g.istdp ? unpack(g.y, net.N) : null,
      slow: g.slow ? { a: unpack(g.slow.a, net.N), b: unpack(g.slow.b, net.N) } : null };
  });
  const spikes = state.spikes.map(row => [...unpack(row)]);
  VECTORS.forEach((n, i) => net[n].set(vectors[i]));
  RECEPTORS.forEach((n, i) => receptors[i].forEach((a, q) => net[n][q].set(a)));
  Object.values(net.pops).forEach((p, i) => {
    PARAMETERS.forEach((key, k) => { p.p[key] = parameters[i][k]; });
  });
  groups.forEach((saved, i) => {
    const g = net.groups[i];
    for (const n of ['contacts', 'pRelease', 'tauRec', 'frozen']) g[n] = saved[n];
    for (const n of ['R', 'scale']) g[n].set(saved[n]);
    if (g.istdp) { g.istdp = { ...saved.istdp }; g.x.set(saved.x); g.y.set(saved.y); }
    if (g.stdp) {
      g.stdp.cursor = saved.stdp.cursor;
      g.stdp.sMax = saved.stdp.sMax; g.stdp.accel = saved.stdp.accel;
      g.stdp.protectDormant = saved.stdp.protectDormant;
      for (const key of STDP_VECTORS) g.stdp[key].set(saved.stdp[key]);
    }
    if (g.slow) { g.slow.a.set(saved.slow.a); g.slow.b.set(saved.slow.b); }
  });
  net.spikes = spikes; net.rng = rng; net.t = state.t;
  net.fired.fill(0);
}
