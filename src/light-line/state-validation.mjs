/** Strict disk-state primitives. No legacy schema, implicit defaults or migration. */
import { isDeepStrictEqual } from 'node:util';
import { CORE_OPTIONS, CURVE } from './config.mjs';
import { LightBaseColorV2 } from './core/light-base-color-v2.mjs';
import { observeCatalogue } from './catalogue.mjs';
export const equal = (a, b, name = 'state') => { if (!isDeepStrictEqual(a, b)) throw new TypeError(`Invalid ${name}`); };
export const check = (ok, name) => { if (!ok) throw new TypeError(`Invalid ${name}`); };
export const integer = (x, min = 0) => Number.isSafeInteger(x) && x >= min;
export const unit = x => Number.isFinite(x) && x >= 0 && x <= 1;
export function jsonData(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return;
  if (typeof x === 'number') { check(Number.isFinite(x) && !Object.is(x, -0), 'finite canonical number'); return; }
  check(x && typeof x === 'object' && (Array.isArray(x) || Object.getPrototypeOf(x) === Object.prototype), 'JSON data');
  for (const v of Object.values(x)) jsonData(v);
}
export function keys(x, names) { check(x && !Array.isArray(x), 'object'); equal(Object.keys(x).sort(), [...names].sort(), 'schema fields'); }
export function unique(rows, key = x => x) { check(Array.isArray(rows) && new Set(rows.map(key)).size === rows.length, 'unique entries'); }
export function opticalIdentity(core, ports, options) {
  return { options, core: CORE_OPTIONS, curve: CURVE, geometry: core.positions, ports, catalogueVersion: 'contrast-M2-v1' };
}
export function restoreCores(rows, seed, replicas) {
  check(Array.isArray(rows) && rows.length === replicas, 'replica count');
  return rows.map(entries => {
    const core = new LightBaseColorV2({ ...CORE_OPTIONS, seed }); let previous = -1;
    for (const e of entries) {
      keys(e, ['i', 'j', 'rho', 'H', 'samples']);
      check(integer(e.i) && integer(e.j) && e.i < e.j && e.j < CORE_OPTIONS.N && unit(e.rho), 'canonical rho');
      const key = e.i * CORE_OPTIONS.N + e.j;
      check(key > previous, 'ordered unordered pairs'); previous = key;
      check(Array.isArray(e.samples) && e.samples.length > 0 && e.samples.every(unit), 'raw color samples');
      check(Array.isArray(e.H) && e.H.length === 200 && e.H.every(v => Number.isFinite(v) && v >= 0), 'H');
      const H = Array(200).fill(0);
      for (const sample of e.samples) for (let b = 0; b < 200; b++) H[b] += Math.exp(-.5 * ((b / 199 - sample) / CORE_OPTIONS.w) ** 2);
      equal(e.H, H, 'original samples/H multiplicity');
      core.setChannel(e.i, e.j, e.rho, e.H); core.samples.set(key, [...e.samples]);
    }
    return core;
  });
}
export function validateFields(fields, replicas) {
  check(Array.isArray(fields), 'fields');
  for (const f of fields) {
    check(unit(f.carrier) && f.replicas.length === replicas, 'carrier replicas');
    for (const r of f.replicas) {
      check(r.brightness.length === 250 && r.brightness.every(unit), 'B arrays');
      equal(r.lit, r.brightness.flatMap((v, i) => v > .3 ? [i] : []), 'lit cells');
      equal(r.meanB, r.brightness.reduce((a, b) => a + b, 0) / 250, 'mean B');
      check(r.paths.length === 250 && r.paths.every(path => path.every(i => integer(i) && i < 250)), 'paths');
    }
  }
}
export function validateHistory(history, start, end, replicas) {
  let cursor = start;
  for (const row of history) {
    check(row.start === cursor && row.end > row.start && integer(row.end * 2), 'history bounds');
    validateFields(row.fields, replicas); cursor = row.end;
  }
  check(cursor === end, 'history end');
}
export function validateCatalogue(catalogue, frames) {
  const expected = { nextId: 1, entries: [] };
  frames.forEach((frame, i) => { check(frame.index === i, 'frame cursor'); observeCatalogue(expected, frame.fields, i); });
  equal(catalogue, expected, 'catalogue IDs/membership/frame counts');
}
