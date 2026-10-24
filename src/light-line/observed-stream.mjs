import { equal, check, integer, jsonData, keys, validateHistory } from './state-validation.mjs';
import { LightAttractorLayer } from './layer.mjs';
import { LightBaseColorV2 } from './core/light-base-color-v2.mjs';
import { CORE_OPTIONS } from './config.mjs';
import { ROLE_CONTINUOUS } from './role-config.mjs';
import { encode, solvePorts, separateCarriers } from './encoding.mjs';
import { observeCatalogue } from './catalogue.mjs';
import { p7 } from './readout.mjs';

/** Named IO ports annotate contrast-discovered fields; names never create
 * members. Frozen observations solve the same channels and integrate B over
 * real sample durations. The small query cache is invalidated on every thaw. */
export class ObservedStream {
  constructor(names, seed, layer = null) {
    if (!names.length || new Set(names).size !== names.length) throw new Error('Unique ports required');
    this.names = [...names];
    this.layer = layer ?? new LightAttractorLayer({ seed, ports: names.length, continuous: ROLE_CONTINUOUS });
    this.clock = 0; this.last = null; this.cache = new Map(); this.core = null; this.frozenMapping = null;
    this.ports = this.layer.ports; this.partial = null;
  }
  freeze(value = true) {
    if (this.partial && value !== this.layer.frozen) throw new Error('Finish the optical window before changing freeze');
    this.layer.freeze(value); this.cache.clear(); this.core = null; this.frozenMapping = null;
    if (value) {
      this.core = new LightBaseColorV2({ ...CORE_OPTIONS, seed: this.layer.parameters.seed });
      for (const { i, j, rho, H, samples } of this.layer.channels()[0]) {
        this.core.setChannel(i, j, rho, H);
        this.core.samples.set(this.core.pairKey(i, j), samples);
      }
      this.frozenMapping = this.mapping;
    }
    return this;
  }
  fork() {
    const stream = new ObservedStream(this.names, this.layer.parameters.seed, this.layer.fork());
    if (this.layer.frozen) stream.freeze();
    return stream;
  }
  get mapping() {
    if (this.frozenMapping) return this.frozenMapping;
    const ports = this.ports;
    return this.layer.catalogue.filter(e => e.mature).map(e => ({ ...e,
      name: this.names[ports.findIndex(p => p.carrier === e.carrier)] }));
  }
  beginWindow(segments) {
    check(this.partial === null, 'stream not already sampling');
    check(Array.isArray(segments) && segments.length > 0 && segments.reduce((n, s) => n + s.durationMs, 0) === 100 &&
      segments.every(s => integer(s.durationMs * 2, 1)), '100 ms sample segments');
    for (const s of segments) encode(this.ports, s.values);
    this.partial = { segments: structuredClone(segments), index: 0, history: [], end: this.clock, layerStart: this.layer.clock };
    this.#prepareSegment();
    return this;
  }
  #prepareSegment() {
    if (!this.layer.frozen) {
      const s = this.partial.segments[this.partial.index];
      this.partial.layerStart = this.layer.clock; this.layer.prepare(s.values, s.durationMs);
    }
  }
  advanceSegment() {
    const p = this.partial; check(p !== null, 'active stream window');
    const { values, durationMs } = p.segments[p.index];
    if (this.layer.frozen) {
      if (!this.core) this.freeze();
      const key = JSON.stringify(encode(this.ports, values));
      if (!this.cache.has(key)) this.cache.set(key, separateCarriers(solvePorts([this.core], JSON.parse(key)), 1));
      p.history.push({ start: p.end, end: p.end + durationMs, fields: this.cache.get(key) });
    } else {
      const result = this.layer.commitPendingTick();
      if (this.layer.pending) return null;
      if (durationMs === .5 || values.every(v => v === 0)) {
        p.history.push({ start: p.end, end: p.end + durationMs, fields: result.carrierFields });
      } else for (const h of this.layer.history) if (h.end > p.layerStart && h.start < p.layerStart + durationMs) {
        p.history.push({ start: p.end + Math.max(0, h.start - p.layerStart),
          end: p.end + Math.min(durationMs, h.end - p.layerStart), fields: h.fields });
      }
    }
    p.end += durationMs; p.index++;
    if (p.index < p.segments.length) { this.#prepareSegment(); return null; }
    const { segments, history, end } = p;
    const mapping = this.mapping;
    const readings = mapping.map(e => ({ id: e.name, localId: e.id, strength: p7(history, e, end) }));
    // Multiple catalogue entries at a carrier remain visible in the audit;
    // only the largest measured P7 supplies that declared IO port.
    const readout = this.names.map(id => ({ id, strength: Math.max(0,
      ...readings.filter(r => r.id === id).map(r => r.strength)) }));
    this.clock = end; this.partial = null;
    this.last = { end, segments: structuredClone(segments), history, mapping, readings, readout };
    return this.last;
  }
  window(segments) {
    this.beginWindow(segments);
    let result; while (!(result = this.advanceSegment())) {}
    return result;
  }
  saveDiskState() {
    return structuredClone({ schema: 'light-stream-v1', names: this.names, ports: this.ports,
      layer: this.layer.saveDiskState(), clock: this.clock, last: this.last, partial: this.partial,
      cache: [...this.cache], frozenMapping: this.frozenMapping });
  }
  static fromDisk(raw) {
    jsonData(raw); keys(raw, ['schema', 'names', 'ports', 'layer', 'clock', 'last', 'partial', 'cache', 'frozenMapping']);
    check(raw.schema === 'light-stream-v1' && integer(raw.clock / 100), 'stream schema/clock');
    const layer = new LightAttractorLayer(raw.layer.identity.options).loadDiskState(raw.layer);
    const stream = new ObservedStream(raw.names, layer.parameters.seed, layer);
    equal(raw.ports, stream.ports);
    if (layer.frozen) stream.freeze();
    equal(raw.frozenMapping, stream.frozenMapping, 'frozen mapping IDs');
    const seen = new Set();
    for (const [key, fields] of raw.cache) {
      check(layer.frozen && !seen.has(key), 'cache key/freeze'); seen.add(key);
      const input = JSON.parse(key); equal(input, encode(stream.ports, input.map(p => ({ amplitude: p.amplitude, sources: p.sources }))));
      equal(fields, separateCarriers(solvePorts([stream.core], input), 1), 'cache optical result');
    }
    if (raw.last) {
      check(raw.last.end === raw.clock, 'last window end');
      validateHistory(raw.last.history, raw.clock - 100, raw.clock, 1);
      let lastMapping = stream.mapping;
      if (!layer.frozen && raw.partial) {
        const bound = raw.partial.layerStart - (raw.partial.end - raw.clock), catalogue = { nextId: 1, entries: [] };
        for (const f of raw.layer.state.frames.filter(f => f.end <= bound)) observeCatalogue(catalogue, f.fields, f.index);
        lastMapping = catalogue.entries.filter(e => e.mature).map(e => ({ ...e,
          name: stream.names[stream.ports.findIndex(p => p.carrier === e.carrier)] }));
      }
      equal(raw.last.mapping, lastMapping);
      equal(raw.last.readings, lastMapping.map(e => ({ id: e.name, localId: e.id, strength: p7(raw.last.history, e, raw.clock) })));
      equal(raw.last.readout, stream.names.map(id => ({ id, strength: Math.max(0, ...raw.last.readings.filter(r => r.id === id).map(r => r.strength)) })));
    } else check(raw.clock === 0, 'initial stream');
    if (raw.partial) {
      const p = raw.partial; keys(p, ['segments', 'index', 'history', 'end', 'layerStart']);
      check(integer(p.index) && p.index < p.segments.length && p.segments.reduce((n, s) => n + s.durationMs, 0) === 100, 'partial stream cursor');
      for (const s of p.segments) { check(integer(s.durationMs * 2, 1), 'segment duration'); encode(stream.ports, s.values); }
      equal(p.end, raw.clock + p.segments.slice(0, p.index).reduce((n, s) => n + s.durationMs, 0));
      validateHistory(p.history, raw.clock, p.end, 1);
      if (!layer.frozen) {
        check(layer.pending !== null && layer.pending.startTick * .5 === p.layerStart, 'partial layer cursor');
        equal(layer.pending.input, p.segments[p.index].values); equal(layer.pending.ticks * .5, p.segments[p.index].durationMs);
      }
    } else check(layer.pending === null, 'orphan layer queue');
    stream.clock = raw.clock; stream.last = structuredClone(raw.last); stream.partial = structuredClone(raw.partial);
    stream.cache = new Map(structuredClone(raw.cache));
    equal(stream.saveDiskState(), raw);
    return stream;
  }
}
