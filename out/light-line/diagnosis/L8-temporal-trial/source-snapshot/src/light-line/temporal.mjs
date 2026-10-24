import { TimeUnroll } from './unroll.mjs';
import { LightAttractorLayer } from './layer.mjs';
import { LightBaseColorV2 } from './core/light-base-color-v2.mjs';
import { CORE_OPTIONS } from './config.mjs';
import { encode, solvePorts, separateCarriers } from './encoding.mjs';
import { TEMPORAL_DEFAULTS } from './temporal-config.mjs';
import { simultaneousSource } from './source-labels.mjs';

const clone = value => structuredClone(value);
const ascending = (a, b) => typeof a === typeof b
  ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1;

/** One accepted layer, with routing metadata outside its optical model.
 * observe() consumes timestamped ID frames. Its environmental clock belongs to
 * the exact TimeUnroll, never to an optical path. The onset fallback supplies a
 * single .5 ms elementary opportunity immediately on each new positive onset;
 * intervening observations still return every retained copy and its light field.
 * No elapsed gap is reinterpreted as a held input or a batch of presentations.
 * presentPorts() exposes L1's duration/cadence contract for explicit IO streams.
 * The layer's clock counts supplied IO exposure; clock counts environment time.
 */
export class TemporalLightLayer {
  #layer;
  #unroll;
  #ports;
  #frames = [];
  #labels;
  #continuous;
  #lastOpportunity = -Infinity;
  #learning;
  #presentationCursor = 0;
  #events = [];

  constructor({ ids, seed = 7, carriers, sourceLabels = new Map(),
    learning = TEMPORAL_DEFAULTS.learning, continuous = TEMPORAL_DEFAULTS.continuous } = {}) {
    if (!Array.isArray(ids) || !ids.length) throw new TypeError('Nonempty ID array required');
    this.#unroll = new TimeUnroll([...ids].sort(ascending));
    if (!['positive-onset', 'continuous'].includes(learning)) throw new RangeError('Invalid learning cadence');
    if (!(sourceLabels instanceof Map) || [...sourceLabels.keys()].some(id => !ids.includes(id))) {
      throw new TypeError('Source labels must refer to declared IDs');
    }
    if (carriers !== undefined && (!(carriers instanceof Map) || carriers.size !== ids.length
      || ids.some(id => !carriers.has(id)))) throw new TypeError('One carrier per ID required');
    const ordered = this.#unroll.ids;
    this.#layer = new LightAttractorLayer({ seed, continuous, ports: ordered.flatMap((id, row) =>
      Array.from({ length: 9 }, (_, k) => ({ coordinate: (row * 9 + k + .5) / (9 * ordered.length),
        carrier: carriers?.get(id) ?? (row + .5) / ordered.length }))) });
    this.#continuous = this.#layer.parameters.continuous;
    this.#ports = this.#layer.ports.map(p => ({ ...p, id: ordered[Math.floor(p.port / 9)], k: p.port % 9 }));
    this.#labels = new Map(sourceLabels);
    this.#learning = learning;
  }

  get ids() { return [...this.#unroll.ids]; }
  get ports() { return clone(this.#ports); }
  get clock() { return this.#unroll.t; }
  get suppliedExposureMs() { return this.#layer.clock; }
  get frozen() { return this.#layer.frozen; }
  get frames() { return clone(this.#frames); }
  get presentations() { return clone(this.#events); }
  get parameters() { return { ...this.#layer.parameters, learning: this.#learning }; }
  channels() { return this.#layer.channels()[0]; }
  copyState() { return this.#unroll.saveState(); }
  freeze(value = true) { this.#layer.freeze(value); return this; }

  port(id, k) {
    const index = this.#unroll.indices.get(id);
    if (index === undefined || !Number.isInteger(k) || k < 0 || k >= 9) throw new RangeError('Unknown copy port');
    return clone(this.#ports[index * 9 + k]);
  }

  lines(t = this.clock) { return this.#unroll.lines(t); }

  /** Inputs are reality/executed-action IDs only. No source of forecasts exists
   * here. Unknown IDs and non-ID metadata cannot enter the copy stream. */
  observe(t, litList) {
    if (!Array.isArray(litList) || litList.some(row => !row || typeof row !== 'object'
      || Object.keys(row).some(key => !['id', 'strength'].includes(key)) || row.id === undefined)) {
      throw new TypeError('Expected reality ID-strength records');
    }
    const previous = new Set(this.#unroll.previous);
    this.#unroll.update(t, litList);
    const onsets = this.#unroll.entries.filter(e => e.tOnset === t && !previous.has(e.id) && e.strength > 0);
    const lines = Array.from(this.#unroll.lines(t));
    const eligible = this.#learning === 'positive-onset' ? onsets.length > 0
      : t - this.#lastOpportunity >= this.#continuous.cadenceMs;
    const start = this.#events.length;
    if (eligible && !this.frozen && lines.some(u => u > 0)) {
      this.#lastOpportunity = t;
      this.presentPorts(lines, .5, t);
    }
    const frame = { time: t, onsets: clone(onsets), lines, entries: clone(this.#unroll.entries),
      elementaryStart: start, elementaryEnd: this.#events.length, frozen: this.frozen };
    this.#frames.push(frame);
    return { ...clone(frame), ...this.queryPorts(lines) };
  }

  /** Explicit supplied port frame; no inferred target/completion becomes input. */
  presentPorts(lines, durationMs = .5, time = this.clock) {
    if (!Number.isFinite(time) || time < 0) throw new RangeError('Invalid presentation timestamp');
    const input = Array.from(lines);
    this.#layer.present(input, durationMs);
    const added = this.#layer.presentations.slice(this.#presentationCursor);
    for (const event of added) this.#events.push({ ...event, exposureTime: event.time,
      time: time + event.time - (this.#layer.clock - durationMs),
      ports: input.flatMap((value, port) => (typeof value === 'number' ? value : value.amplitude) > 0
        ? [{ port, id: this.#ports[port].id, k: this.#ports[port].k,
          strength: typeof value === 'number' ? value : value.amplitude }] : []) });
    this.#presentationCursor += added.length;
    return { fields: this.#layer.fields, carrierFields: this.#layer.carrierFields };
  }

  /** Read-only actual optical query, including channel-cleared control. The
   * reconstructed core is an observer of the sole higher layer's channel state,
   * not another trained layer. Each port keeps its own B and path witnesses. */
  queryPorts(lines, { cleared = false } = {}) {
    const encoded = encode(this.#ports, Array.from(lines));
    const core = new LightBaseColorV2({ ...CORE_OPTIONS, seed: this.parameters.seed });
    if (!cleared) for (const { i, j, rho, H, samples } of this.channels()) {
      core.setChannel(i, j, rho, H);
      core.samples.set(core.pairKey(i, j), samples);
    }
    const fields = solvePorts([core], encoded);
    return { fields, carrierFields: separateCarriers(fields, 1) };
  }

  query(id, k, strength = 1, options) {
    const input = Array(this.#ports.length).fill(0);
    input[this.port(id, k).port] = strength;
    return this.queryPorts(input, options);
  }

  /** Physical channels have no orientation. Source guards are diagnostic
   * eligibility metadata, matching the old same-source onset arithmetic. */
  relation(left, right, t = this.clock) {
    const a = this.port(left.id, left.k), b = this.port(right.id, right.k);
    const older = a.k >= b.k ? a : b, newer = a.k >= b.k ? b : a;
    const guarded = simultaneousSource(this.#unroll, this.#labels, older.id, older.k, newer.id, t);
    return { older, newer, equalColumn: a.k === b.k, sameSourceGuard: guarded,
      positiveDelay: older.k > newer.k && older.id !== newer.id && !guarded,
      shared: newer.sources.filter(i => older.sources.includes(i)),
      targetExclusive: newer.sources.filter(i => !older.sources.includes(i)) };
  }

  /** Reject unidentifiable capacity explicitly; never relocate or drop ports. */
  requireSeparable(left, right) {
    const relation = this.relation(left, right);
    if (relation.targetExclusive.length < TEMPORAL_DEFAULTS.minimumExclusiveCells) {
      throw new RangeError(`Port capacity: fewer than ${TEMPORAL_DEFAULTS.minimumExclusiveCells} target-exclusive cells`);
    }
    return relation;
  }

  aliases() {
    const shared = [];
    for (let a = 0; a < this.#ports.length; a++) for (let b = a + 1; b < this.#ports.length; b++) {
      const cells = this.#ports[a].sources.filter(i => this.#ports[b].sources.includes(i));
      if (cells.length) shared.push({ a, b, cells, alias: cells.length === CORE_OPTIONS.m });
    }
    return shared;
  }
}
