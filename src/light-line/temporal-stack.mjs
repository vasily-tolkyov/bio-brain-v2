import { CORE_OPTIONS } from './config.mjs';
import { VisualAttractorLayer } from './visual-layer.mjs';
import { TimeUnroll } from './unroll.mjs';
import { TEMPORAL_DEFAULTS } from './temporal-config.mjs';
import { SliceRetina, DELAY_LAYOUT, tileTimeCopies, placeSnapshot } from './retina.mjs';

export const STACK_DEFAULTS = Object.freeze({ carrier: 1 / 6,
  continuous: Object.freeze({ cadenceMs: .5, strengthScale: .1 }) });
const clone = value => structuredClone(value);
const empty = () => ({ brightness: Array(CORE_OPTIONS.N).fill(0),
  paths: Array.from({ length: CORE_OPTIONS.N }, () => []), lit: [], meanB: 0 });

/** L -> L+1, with visual inputs at both boundaries. No semantic IDs enter this
 * API. L first learns from presentSnapshot(), then freezes before observe().
 * TimeUnroll records physical glowing-cell onsets and their original strengths.
 * L+1 gets one immediate .5ms exposure on ANY new glowing-cell onset, including
 * all retained copies. Held fields and empty gaps do not invent learning time.
 *
 * Capacity is explicit: 27 observable L cells * 9 copies = 243 L+1 ports, each
 * on a distinct cell of an unchanged N=250 base. Unexposed cells stay dark.
 * All visual readings share one carrier; identity resides in spatial patterns.
 */
export class TemporalStack {
  #lower;
  #upper;
  #retina = new SliceRetina();
  #upperRetina = new SliceRetina({ blocks: 9 });
  #unroll = new TimeUnroll(27);
  #frames = [];
  #events = [];
  #carrier;

  // An explicit continuous option still configures both layers unless overridden.
  // Default calibration applies only to temporal channels, preserving the snapshot fixture.
  constructor({ seed = 7, carrier = STACK_DEFAULTS.carrier,
    continuous, temporalContinuous = continuous ?? TEMPORAL_DEFAULTS.continuous } = {}) {
    this.#lower = new VisualAttractorLayer({ seed, pixels: 27, carrier,
      continuous: continuous ?? STACK_DEFAULTS.continuous });
    this.#upper = new VisualAttractorLayer({ seed, pixels: 243, carrier, continuous: temporalContinuous, level: 2 });
    this.#carrier = carrier;
  }

  get clock() { return this.#unroll.t; }
  get frozen() { return this.#upper.frozen; }
  get snapshotFrozen() { return this.#lower.frozen; }
  get layout() { return clone(DELAY_LAYOUT); }
  get frames() { return clone(this.#frames); }
  get presentations() { return clone(this.#events); }
  get snapshotPresentations() { return this.#lower.presentations; }
  get higherTrainingFrames() { return this.#upper.trainingFrames; }
  get catalogue() { return this.#upper.catalogue; }
  get parameters() { return { lower: this.#lower.parameters, upper: this.#upper.parameters,
    retina: { blocks: [1, 9], rows: 3, columns: 9, topK: 6 }, learning: 'positive-glowing-cell-onset' }; }
  channels() { return { lower: this.#lower.channels()[0], upper: this.#upper.channels()[0] }; }
  copyState() { return this.#unroll.saveState(); }
  freezeSnapshot() { this.#lower.freeze(); return this; }
  freeze(value = true) { this.#upper.freeze(value); return this; }
  discover() { return this.#upper.discover(); }
  discoverSnapshot() { return this.#lower.discover(); }
  /** Frozen physical P7 boundary for L5. Local replay time never changes copies. */
  replaySnapshot(segments) {
    return this.#lower.replay(segments.map(({ input, durationMs }) =>
      ({ input: this.#retina.apply(input).values, durationMs })));
  }
  replayTraining() { return this.#upper.replayTraining(); }
  auditMembership(id) { return this.#upper.auditMembership(id); }

  /** Replay stored tiled fields through the same retina and higher core. */
  queryVisual(visual, options) { return this.#queryVisual(visual, options); }
  identifyVisual(visual) { return this.#upper.identify(this.#upperRetina.apply(visual).values); }
  replayVisual(segments) {
    return this.#upper.replay(segments.map(({ input, durationMs }) =>
      ({ input: this.#upperRetina.apply(input).values, durationMs })));
  }

  #field(result) {
    return result.carrierFields.find(f => f.carrier === this.#carrier)?.replicas[0] ?? empty();
  }

  presentSnapshot(input, durationMs = .5) {
    const selected = this.#retina.apply(input);
    const result = this.#lower.present(selected.values, durationMs);
    return { selected, field: this.#field(result) };
  }

  querySnapshot(input, options) {
    const selected = this.#retina.apply(input);
    return { selected, field: this.#field(this.#lower.query(selected.values, options)) };
  }

  #glowing(field) {
    if (field.lit.some(cell => cell >= 27)) throw new RangeError('Snapshot exceeds the 27-cell visual capacity');
    return field.brightness.slice(0, 27).map(b => b > CORE_OPTIONS.theta ? b : 0);
  }

  #queryVisual(visual, options) {
    const selected = this.#upperRetina.apply(visual);
    return { selected, field: this.#field(this.#upper.query(selected.values, options)) };
  }

  /** A frozen diagnostic cue uses exactly the same L completion and L+1 retina
   * as observe(), with the actual glowing L field placed at the requested age. */
  query(input, k = 0, options) {
    const lower = this.querySnapshot(input);
    const visual = placeSnapshot(this.#glowing(lower.field), k);
    return { lower, visual, ...this.#queryVisual(visual, options) };
  }

  observe(time, input) {
    if (!this.snapshotFrozen) throw new Error('Freeze the snapshot layer before temporal observation');
    this.#unroll.checkTime(time);
    const lower = this.querySnapshot(input), pixels = this.#glowing(lower.field);
    const lights = pixels.flatMap((strength, id) => strength > 0 ? [{ id, strength }] : []);
    const previous = new Set(this.#unroll.previous);
    this.#unroll.update(time, lights);
    const onsets = lights.filter(row => !previous.has(row.id));
    const cellMajor = Array.from(this.#unroll.lines(time));
    const visual = tileTimeCopies(cellMajor), selected = this.#upperRetina.apply(visual);
    const elementaryStart = this.#events.length;
    if (!this.frozen && onsets.length && selected.values.some(x => x > 0)) {
      this.#upper.present(selected.values);
      for (const event of this.#upper.presentations.slice(elementaryStart)) this.#events.push({ ...event, exposureTime: event.time, time,
        ports: selected.values.flatMap((strength, port) => strength > 0
          ? [{ port, cell: port, k: Math.floor(port / 27), strength }] : []) });
    }
    const frame = { time, lower, onsets, cellMajor, visual, selected,
      entries: clone(this.#unroll.entries), elementaryStart, elementaryEnd: this.#events.length,
      frozen: this.frozen };
    this.#frames.push(frame);
    return { ...clone(frame), field: this.#field(this.#upper.query(selected.values)) };
  }
}
