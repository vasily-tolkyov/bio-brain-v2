import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
export const ROOT = 'out/light-line/acceptance/L8';
export const read = p => JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
export const protocol = read(new URL('./L8-protocol.json', import.meta.url).pathname);
export const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
export const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
export const clone = x => JSON.parse(JSON.stringify(x));
export function write(p, x) {
  mkdirSync(dirname(p), { recursive: true });
  const bytes = typeof x === 'string' ? x : JSON.stringify(x);
  writeFileSync(p, p.endsWith('.gz') ? gzipSync(bytes) : bytes + '\n', { flag: 'wx' });
}
export const files = d => existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(`${d}/${e.name}`) : [`${d}/${e.name}`]).sort() : [];
export function rng(seed) { let s = seed >>> 0; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
export function schedule(seed) {
  const random = rng(seed), episodes = [];
  const definitions = {
    direct: { initial: 70, command: 'light', action: 'press', outcome: 'light' },
    'two-step': { initial: 70, command: 'bell', action: 'press', outcome: 'bell' },
    innate: { initial: 30, command: null, action: 'eat', outcome: 'change:0:rise:2' },
    ranking: { initial: 10, command: null, action: 'eat', outcome: 'change:0:rise:2' },
    override: { initial: 30, command: 'tone', action: 'wave', outcome: 'tone' },
  };
  for (let round = 0; round < protocol.episodesPerKind; round++) {
    const order = protocol.kinds.map(kind => ({ kind, key: random() })).sort((a, b) => a.key - b.key);
    for (const { kind } of order) episodes.push({ index: episodes.length, start: episodes.length * protocol.episodeMs,
      kind, ...definitions[kind], commandOffset: 0 });
  }
  return { seed, episodes, duration: episodes.length * protocol.episodeMs + protocol.setpointMs,
    storm: Array.from({ length: protocol.stormTrials }, (_, i) => ({ start: i * protocol.slotMs,
      causalDelay: 3000, shuffledDelay: 100 * 2 ** Math.floor(random() * 8), distractor: 100 * Math.floor(random() * 240) })),
    jitter: Array.from({ length: 30 }, () => protocol.jitterMs[Math.floor(random() * protocol.jitterMs.length)]),
    probeOrder: Array.from({ length: 20 }, (_, i) => ({ index: i, key: random() })).sort((a, b) => a.key - b.key).map(e => e.index),
    snapshotCuts: protocol.snapshotCuts };
}
