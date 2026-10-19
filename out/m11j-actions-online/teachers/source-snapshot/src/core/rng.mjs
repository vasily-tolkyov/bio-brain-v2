/** Mulberry32 and Box–Muller, ported from bio-brain; both states are resumable. */
export function makeRng(seed = 1) {
  let s = seed >>> 0, spare = null;
  const uniform = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    if (spare !== null) { const value = spare; spare = null; return value; }
    let u = 0;
    while (u === 0) u = uniform();
    const v = uniform(), r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  const pick = n => Math.floor(uniform() * n);
  return {
    uniform, normal, pick,
    bernoulliRate: (rateHz, dtMs) => uniform() < 1 - Math.exp(-rateHz * dtMs / 1000),
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = pick(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    exportState: () => ({ algorithm: 'mulberry32', s, spare }),
    importState(state) {
      if (state?.algorithm !== 'mulberry32' || !Number.isInteger(state.s) ||
          state.s < 0 || state.s > 0xffffffff ||
          !(state.spare === null || Number.isFinite(state.spare))) throw new Error('Invalid RNG state');
      s = state.s; spare = state.spare;
    },
  };
}
