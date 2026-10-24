import { equal, check, integer, jsonData, keys, opticalIdentity, restoreCores, validateFields } from './state-validation.mjs';
import { CORE_OPTIONS } from './config.mjs';
import { L1_DEFAULTS, continuousOptions } from './boundary-config.mjs';
import { LightBaseColorV2 } from './core/light-base-color-v2.mjs';
import { solvePorts, separateCarriers } from './encoding.mjs';
import { visualValues } from './retina.mjs';
import { discoverHigherFields } from './higher-catalogue.mjs';
import { identifyFields } from './catalogue.mjs';
import { readout } from './readout.mjs';

/** Direct visual entrance to the accepted light attractor base. The original
 * LightAttractorLayer stays byte-frozen for L0-L2. This boundary uses its same
 * core, independent field solver and continuous dose arithmetic, with reading
 * p bound strictly to cell p instead of invoking coordinate/inputSources.
 * No catalogue or semantic membership feeds a visual source or a light field.
 */
export class VisualAttractorLayer {
  #core;
  #ports;
  #options;
  #tick = 0;
  #lastInput = null;
  #frozen = false;
  #presentations = [];
  #trainingFrames = [];
  #catalogue = null;

  constructor({ seed = 7, pixels = 27, carrier = 1 / 6, continuous, level = 1 } = {}) {
    if (!Number.isSafeInteger(seed) || !Number.isInteger(pixels) || pixels < 1 || pixels > CORE_OPTIONS.N
        || !Number.isFinite(carrier) || carrier < 0 || carrier > 1
        || !Number.isSafeInteger(level) || level < 1) throw new RangeError('Invalid visual layer options');
    this.#options = { seed, pixels, carrier, level, continuous: continuousOptions(continuous) };
    this.#core = new LightBaseColorV2({ ...CORE_OPTIONS, seed });
    this.#ports = Array.from({ length: pixels }, (_, cell) => ({ port: cell, cell, carrier, sources: [cell] }));
  }

  get clock() { return this.#tick * L1_DEFAULTS.ioMs; }
  get frozen() { return this.#frozen; }
  get ports() { return structuredClone(this.#ports); }
  get parameters() { return structuredClone({ core: CORE_OPTIONS, ...this.#options }); }
  get presentations() { return structuredClone(this.#presentations); }
  get trainingFrames() { return structuredClone(this.#trainingFrames); }
  get catalogue() { return structuredClone(this.#catalogue ?? []); }
  channels() { return [this.#core.colorEntries()]; }
  freeze(value = true) {
    if (typeof value !== 'boolean') throw new TypeError('Freeze takes a boolean');
    this.#frozen = value;
    if (!value) this.#catalogue = null;
    return this;
  }

  #encode(input) {
    const values = visualValues(input, this.#ports.length);
    return this.#ports.map((p, i) => ({ ...p, sources: [p.cell], amplitude: values[i] }));
  }

  /** The exact fractional dose extension from the frozen L1 boundary. Raw
   * color samples and H still append once per elementary co-light event. */
  #learn(sources) {
    const { carrier, continuous: { strengthScale } } = this.#options;
    const before = strengthScale === 1 ? null : new Map(this.#core.channels);
    this.#core.learnSources(sources, carrier);
    if (before) {
      const supplied = new Set(sources);
      for (const [key] of this.#core.channels) {
        const a = supplied.has(Math.floor(key / CORE_OPTIONS.N)), b = supplied.has(key % CORE_OPTIONS.N);
        const rho = before.get(key) ?? 0;
        if (a && b) this.#core.channels.set(key, 1 - (1 - rho) * .8 ** strengthScale);
        else if (a !== b) this.#core.channels.set(key, rho * .96 ** strengthScale);
      }
    }
  }

  present(input, durationMs = L1_DEFAULTS.ioMs) {
    const encoded = this.#encode(input), ticks = durationMs / L1_DEFAULTS.ioMs;
    if (!Number.isSafeInteger(ticks) || ticks < 0 || !Number.isSafeInteger(this.#tick + ticks)) {
      throw new RangeError('Duration must be nonnegative safe .5 ms ticks');
    }
    const signature = JSON.stringify(encoded), sources = encoded.filter(p => p.amplitude > 0).map(p => p.cell);
    const { carrier, continuous: { cadenceMs, strengthScale } } = this.#options;
    for (let step = 0; step < ticks; step++) {
      if (!this.frozen && sources.length && (signature !== this.#lastInput || this.#tick % (cadenceMs / .5) === 0)) {
        this.#learn(sources);
        this.#presentations.push({ index: this.#presentations.length, time: this.clock,
          K: 1, ordinal: 0, carrier, sources: [...sources], strengthScale, replicas: 1 });
        this.#trainingFrames.push({ index: this.#trainingFrames.length, time: this.clock,
          presentation: this.#presentations.length - 1, input: encoded.map(p => p.amplitude),
          fields: this.query(input).carrierFields });
      }
      this.#lastInput = signature;
      this.#tick++;
    }
    return { clock: this.clock, ...this.query(input) };
  }

  query(input, { cleared = false } = {}) {
    if (typeof cleared !== 'boolean') throw new TypeError('Cleared takes a boolean');
    const encoded = this.#encode(input);
    const core = cleared ? new LightBaseColorV2({ ...CORE_OPTIONS, seed: this.#options.seed }) : this.#core;
    const fields = solvePorts([core], encoded);
    return { fields, carrierFields: separateCarriers(fields, 1) };
  }

  saveDiskState() {
    const input = this.#lastInput === null ? null : JSON.parse(this.#lastInput).map(p => p.amplitude);
    return structuredClone({ schema: 'light-visual-v1', identity: opticalIdentity(this.#core, this.#ports, this.#options),
      tick: this.#tick, lastInput: this.#lastInput, frozen: this.#frozen,
      presentations: this.#presentations, frames: this.#trainingFrames, catalogue: this.#catalogue,
      cores: this.channels(), current: input === null ? null : this.query(input),
      historyBounds: [0, this.clock], pending: null, queued: [], committedCursor: this.#presentations.length });
  }
  loadDiskState(raw) {
    jsonData(raw); keys(raw, ['schema', 'identity', 'tick', 'lastInput', 'frozen', 'presentations', 'frames', 'catalogue',
      'cores', 'current', 'historyBounds', 'pending', 'queued', 'committedCursor']);
    check(raw.schema === 'light-visual-v1', 'visual schema');
    equal(raw.identity, opticalIdentity(this.#core, this.#ports, this.#options), 'visual geometry/config/ports');
    check(integer(raw.tick) && typeof raw.frozen === 'boolean' && (raw.lastInput === null || typeof raw.lastInput === 'string'), 'visual clock');
    const temporary = new VisualAttractorLayer(this.#options);
    [temporary.#core] = restoreCores(raw.cores, this.#options.seed, 1);
    temporary.#tick = raw.tick; temporary.#lastInput = raw.lastInput; temporary.#frozen = raw.frozen;
    temporary.#presentations = structuredClone(raw.presentations); temporary.#trainingFrames = structuredClone(raw.frames);
    equal(raw.presentations.length, raw.frames.length);
    let prior = -1;
    for (const [i, f] of raw.frames.entries()) {
      check(f.index === i && f.presentation === i && integer(f.time * 2) && f.time > prior && f.time < temporary.clock, 'visual frame cursor'); prior = f.time;
      const encoded = temporary.#encode(f.input), p = raw.presentations[i];
      equal(p, { index: i, time: f.time, K: 1, ordinal: 0, carrier: this.#options.carrier,
        sources: encoded.filter(p => p.amplitude > 0).map(p => p.cell), strengthScale: this.#options.continuous.strengthScale, replicas: 1 });
      validateFields(f.fields, 1);
    }
    if (raw.catalogue !== null) {
      check(raw.frozen, 'frozen visual catalogue');
      equal(raw.catalogue, temporary.discover(), 'higher IDs/M2 counts');
    }
    if (raw.lastInput !== null) {
      const encoded = JSON.parse(raw.lastInput);
      equal(encoded, temporary.#encode(encoded.map(p => p.amplitude)), 'visual supplied input');
    } else check(raw.tick === 0, 'visual input clock');
    equal(temporary.saveDiskState(), raw, 'complete visual roundtrip');
    this.#core = temporary.#core; this.#tick = temporary.#tick; this.#lastInput = temporary.#lastInput;
    this.#frozen = temporary.#frozen; this.#presentations = temporary.#presentations;
    this.#trainingFrames = temporary.#trainingFrames; this.#catalogue = temporary.#catalogue;
    return this;
  }
  fork() { return new VisualAttractorLayer(this.#options).loadDiskState(this.saveDiskState()); }

  /** All discovery replays query this very core after learning has frozen. */
  discover() {
    if (!this.frozen) throw new Error('Freeze learning before higher identification');
    if (!this.#catalogue) this.#catalogue = discoverHigherFields(this.replayTraining());
    return this.catalogue;
  }

  replayTraining() {
    if (!this.frozen) throw new Error('Freeze learning before training replay');
    return this.#trainingFrames.map(row => ({ index: row.index, fields: this.query(row.input).carrierFields }));
  }

  identify(input) {
    this.#requireCatalogue();
    return identifyFields(this.#catalogue.filter(e => e.mature), this.query(input).carrierFields);
  }

  #requireCatalogue() {
    if (!this.frozen || !this.#catalogue) throw new Error('Frozen discovery is required');
  }

  auditMembership(id) {
    this.#requireCatalogue();
    const entry = this.#catalogue.find(e => e.id === id);
    if (!entry?.mature) throw new RangeError('M2 requires 20 original training frames');
    return { entry: structuredClone(entry), replays: entry.replayIndices.map(index => {
      const row = this.#trainingFrames[index];
      return { index, input: [...row.input], fields: this.query(row.input).carrierFields };
    }) };
  }

  /** Pure frozen replay with a local observation window, not a new world clock.
   * Segment durations integrate actual queried physical fields through P7.
   * No identification result is ever used as an optical input. */
  replay(segments) {
    this.#requireCatalogue();
    if (!Array.isArray(segments) || !segments.length) throw new TypeError('Expected replay segments');
    const history = [];
    let end = 0;
    for (const segment of segments) {
      if (!segment || Object.keys(segment).some(k => !['input', 'durationMs'].includes(k))
          || !Number.isSafeInteger(segment.durationMs / .5) || segment.durationMs <= 0
          || !Number.isSafeInteger((end + segment.durationMs) / .5)) throw new RangeError('Invalid replay segment');
      const fields = this.query(segment.input).carrierFields;
      history.push({ start: end, end: end + segment.durationMs, fields });
      end += segment.durationMs;
    }
    const entries = this.#catalogue.filter(e => e.mature);
    return { end, history, identification: identifyFields(entries, history.at(-1).fields),
      readout: readout(history, entries, end) };
  }
}
