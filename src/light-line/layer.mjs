import { CORE_OPTIONS } from './config.mjs';
import { L1_DEFAULTS, continuousOptions } from './boundary-config.mjs';
import { LightBaseColorV2 } from './core/light-base-color-v2.mjs';
import { makePorts, encode, trainingInput, solvePorts, separateCarriers } from './encoding.mjs';
import { identifyFields, observeCatalogue, recountM2 } from './catalogue.mjs';
import { readout, readoutDiagnostics } from './readout.mjs';
import { isDeepStrictEqual } from 'node:util';
import { equal, check, integer, jsonData, keys, opticalIdentity, restoreCores, validateFields, validateHistory, validateCatalogue } from './state-validation.mjs';

// In-memory snapshot capabilities, deliberately not a disk/pipeline schema.
// The saved object is inspectable. Only an unmodified object issued by save() in
// this process is restorable; copies/foreign objects are rejected. Its canonical
// bytes validate every nested field before any live state is replaced.
const snapshots = new WeakMap();
const clone = value => structuredClone(value);

function dose(core, sources, carrier, strengthScale) {
  const before = strengthScale === 1 ? null : new Map(core.channels);
  core.learnSources(sources, carrier);
  if (before) {
    const supplied = new Set(sources), N = CORE_OPTIONS.N;
    for (const [key] of core.channels) {
      const left = supplied.has(Math.floor(key / N)), right = supplied.has(key % N);
      const rho = before.get(key) ?? 0;
      if (left && right) core.channels.set(key, 1 - (1 - rho) * .8 ** strengthScale);
      else if (left !== right) core.channels.set(key, rho * .96 ** strengthScale);
    }
  }
}

export class LightAttractorLayer {
  #cores;
  #ports;
  #options;
  #state;
  #pending = null;

  constructor(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)
        || Object.keys(options).some(k => !['seed', 'ports', 'R', 'continuous'].includes(k))) {
      throw new TypeError('Expected seed, ports, R and continuous options only');
    }
    const { seed = 7, ports = 1, R = 1, continuous } = options;
    if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(R) || R < 1) throw new RangeError('Invalid seed or R');
    const parameters = continuousOptions(continuous);
    this.#cores = Array.from({ length: R }, () => new LightBaseColorV2({ ...CORE_OPTIONS, seed }));
    this.#ports = makePorts(this.#cores[0], ports);
    this.#options = { seed: seed === 0 ? 0 : seed, R, continuous: parameters,
      ports: this.#ports.map(({ coordinate, carrier }) => ({ coordinate, carrier })) };
    this.#state = { tick: 0, frozen: false, lastInput: null, fields: [], carrierFields: [],
      history: [], frames: [], presentations: [], catalogue: { nextId: 1, entries: [] } };
  }

  get clock() { return this.#state.tick * L1_DEFAULTS.ioMs; }
  get frozen() { return this.#state.frozen; }
  get ports() { return clone(this.#ports); }
  get parameters() { return clone({ core: CORE_OPTIONS, boundary: L1_DEFAULTS, ...this.#options }); }
  get fields() { return clone(this.#state.fields); }
  get carrierFields() { return clone(this.#state.carrierFields); }
  get history() { return clone(this.#state.history); }
  get frames() { return clone(this.#state.frames); }
  get presentations() { return clone(this.#state.presentations); }
  get catalogue() { return clone(this.#state.catalogue.entries); }
  channels() { return this.#cores.map(core => core.colorEntries()); }

  /** All input is validated before clock or learning state changes. No update is
   * associated with a call boundary; ticks and source changes determine events.
   * At an eligible tick the known sources learn immediately, then the new fields
   * are observed over [t,t+.5). Blank ticks never apply an elementary update.
   */
  present(input, durationMs = L1_DEFAULTS.ioMs) {
    if (this.#pending) throw new Error('Complete the queued optical segment first');
    const encoded = encode(this.#ports, input), ticks = durationMs / L1_DEFAULTS.ioMs;
    if (!Number.isSafeInteger(ticks) || ticks < 0 || !Number.isSafeInteger(this.#state.tick + ticks)) {
      throw new RangeError('Duration must be a nonnegative safe number of .5 ms ticks');
    }
    const key = JSON.stringify(encoded), { sources, carriers } = trainingInput(encoded);
    const { cadenceMs, strengthScale } = this.#options.continuous;
    const cadenceTicks = cadenceMs / L1_DEFAULTS.ioMs;
    for (let step = 0; step < ticks; step++) {
      const s = this.#state, time = this.clock;
      const changed = key !== s.lastInput;
      const learning = !s.frozen && carriers.length > 0 && (changed || s.tick % cadenceTicks === 0);
      const frame = s.frames.length;
      if (learning) for (let ordinal = 0; ordinal < carriers.length; ordinal++) {
        const carrier = carriers[ordinal];
        for (const core of this.#cores) dose(core, sources, carrier, strengthScale);
        s.presentations.push({ index: s.presentations.length, frame, time, K: carriers.length,
          ordinal, carrier, sources: [...sources], strengthScale, replicas: this.#options.R });
      }
      // Held frozen fields need no new solve; storage remains canonical across calls.
      if (learning || changed) {
        s.fields = solvePorts(this.#cores, encoded);
        s.carrierFields = separateCarriers(s.fields, this.#options.R);
      }
      if (learning) {
        s.frames.push({ index: frame, time, end: time + L1_DEFAULTS.ioMs,
          input: clone(encoded), sources: [...sources], carriers: [...carriers], K: carriers.length,
          fields: clone(s.carrierFields) });
        observeCatalogue(s.catalogue, s.carrierFields, frame);
      }
      const last = s.history.at(-1), fieldKey = JSON.stringify(s.carrierFields);
      if (last && JSON.stringify(last.fields) === fieldKey) last.end = time + L1_DEFAULTS.ioMs;
      else s.history.push({ start: time, end: time + L1_DEFAULTS.ioMs, fields: clone(s.carrierFields) });
      s.lastInput = key;
      s.tick++;
    }
    return { clock: this.clock, fields: this.fields, carrierFields: this.carrierFields };
  }

  run(input, durationMs) { return this.present(input, durationMs); }

  /** Read-only contrast recognition, including on frozen probes. New IDs and
   * membership updates arise only from actual observed training frames. */
  identify() { return clone(identifyFields(this.#state.catalogue.entries, this.#state.carrierFields)); }

  readout(end = this.clock) {
    this.#observationEnd(end);
    return readout(this.#state.history, this.#state.catalogue.entries, end);
  }

  diagnostics(end = this.clock) {
    this.#observationEnd(end);
    return clone({ clock: this.clock, fields: this.#state.fields, carrierFields: this.#state.carrierFields,
      readout: readoutDiagnostics(this.#state.history, this.#state.catalogue.entries, this.#state.carrierFields, end) });
  }

  #observationEnd(end) {
    if (!Number.isFinite(end) || end < 0 || end > this.clock) throw new RangeError('Observation end outside elapsed time');
  }

  freeze(value = true) {
    if (typeof value !== 'boolean') throw new TypeError('Freeze takes a boolean');
    if (this.#pending && value !== this.#state.frozen) throw new Error('Finish queued optics before changing freeze');
    this.#state.frozen = value;
    return this;
  }

  /** Saved original input frames are re-solved with current channels, without
   * learning. M2 is reported separately, and cannot replace contrast members. */
  auditMembership(id) {
    const entry = this.#state.catalogue.entries.find(e => e.id === id);
    if (!entry) throw new RangeError('Unknown catalogue ID');
    if (!entry.mature) throw new RangeError('Maturity requires 20 original input frames');
    const frameIndices = entry.frameIndices.slice(0, L1_DEFAULTS.contrast.matureFrames);
    const replays = frameIndices.map(index => {
      const frame = this.#state.frames[index];
      const field = separateCarriers(solvePorts(this.#cores, frame.input), this.#options.R)
        .find(f => f.carrier === entry.carrier);
      return { frame: index, time: frame.time, input: clone(frame.input), field };
    });
    return { id, carrier: entry.carrier, definition: 'subordinate M2 audit; not membership',
      frameIndices, contrastMembers: clone(entry.members), replays,
      M2: entry.members.map((_, r) => recountM2(replays.map(row => row.field.replicas[r].brightness), CORE_OPTIONS.N)) };
  }

  /** Queue an IO segment without learning. Each commit remains one original .5 ms
   * continuous-learning opportunity; there is no window-sized learning batch. */
  prepare(input, durationMs) {
    if (this.#pending) throw new Error('Optical segment already queued');
    const encoded = encode(this.#ports, input), ticks = durationMs / .5;
    check(integer(ticks, 1) && integer(this.#state.tick + ticks), 'queued duration');
    this.#pending = { input: clone(input), startTick: this.#state.tick, ticks, cursor: 0, encoded };
    return this;
  }
  get pending() { return clone(this.#pending); }
  commitPendingTick() {
    if (!this.#pending) throw new Error('No queued presentation');
    const pending = this.#pending; this.#pending = null;
    const result = this.present(pending.input, .5);
    pending.cursor++;
    if (pending.cursor < pending.ticks) this.#pending = pending;
    return result;
  }
  saveDiskState() {
    const pending = this.pending;
    const eligible = pending && !this.frozen && (JSON.stringify(pending.encoded) !== this.#state.lastInput ||
      this.#state.tick % (this.#options.continuous.cadenceMs / .5) === 0);
    const queued = eligible ? trainingInput(pending.encoded).carriers.map((carrier, ordinal) => ({
      carrier, ordinal, sources: trainingInput(pending.encoded).sources })) : [];
    return clone({ schema: 'light-layer-v1', identity: opticalIdentity(this.#cores[0], this.#ports, this.#options),
      state: this.#state, cores: this.channels(), pending, queued,
      committedCursor: this.#state.presentations.length, historyBounds: [0, this.clock] });
  }
  loadDiskState(raw) {
    jsonData(raw); keys(raw, ['schema', 'identity', 'state', 'cores', 'pending', 'queued', 'committedCursor', 'historyBounds']);
    check(raw.schema === 'light-layer-v1', 'layer schema');
    equal(raw.identity, opticalIdentity(this.#cores[0], this.#ports, this.#options), 'layer geometry/config/ports');
    const s = clone(raw.state);
    keys(s, ['tick', 'frozen', 'lastInput', 'fields', 'carrierFields', 'history', 'frames', 'presentations', 'catalogue']);
    check(integer(s.tick) && typeof s.frozen === 'boolean', 'layer clock/freeze');
    const cores = restoreCores(raw.cores, this.#options.seed, this.#options.R);
    validateFields(s.fields, cores.length); validateFields(s.carrierFields, cores.length);
    validateHistory(s.history, 0, s.tick * .5, cores.length);
    equal(raw.historyBounds, [0, s.tick * .5]); equal(raw.committedCursor, s.presentations.length);
    for (const [i, p] of s.presentations.entries()) {
      check(p.index === i && integer(p.frame) && p.frame < s.frames.length && p.time === s.frames[p.frame].time,
        'presentation frame/cursor');
      const f = s.frames[p.frame];
      equal(p.sources, f.sources); check(p.K === f.K && p.carrier === f.carriers[p.ordinal] && p.replicas === cores.length &&
        p.strengthScale === this.#options.continuous.strengthScale, 'elementary presentation');
    }
    let priorTime = -1;
    for (const f of s.frames) {
      check(f.time > priorTime && integer(f.time * 2) && f.end === f.time + .5 && f.end <= s.tick * .5, 'frame time'); priorTime = f.time;
      const decoded = encode(this.#ports, f.input.map(p => ({ amplitude: p.amplitude, sources: p.sources })));
      equal(f.input, decoded); equal({ sources: f.sources, carriers: f.carriers }, trainingInput(decoded));
      check(f.K === f.carriers.length && s.presentations.filter(p => p.frame === f.index).length === f.K, 'frame presentations');
      validateFields(f.fields, cores.length);
    }
    validateCatalogue(s.catalogue, s.frames);
    if (s.lastInput !== null) {
      const input = JSON.parse(s.lastInput);
      equal(input, encode(this.#ports, input.map(p => ({ amplitude: p.amplitude, sources: p.sources }))));
      equal(s.fields, solvePorts(cores, input), 'current supplied fields');
      equal(s.carrierFields, separateCarriers(s.fields, cores.length));
      equal(s.history.at(-1)?.fields, s.carrierFields);
    } else check(s.tick === 0 && s.fields.length === 0, 'empty layer clock');
    if (raw.pending) {
      const p = raw.pending; keys(p, ['input', 'startTick', 'ticks', 'cursor', 'encoded']);
      check(integer(p.startTick) && integer(p.ticks, 1) && integer(p.cursor) && p.cursor < p.ticks &&
        p.startTick + p.cursor === s.tick, 'pending IO cursor');
      equal(p.encoded, encode(this.#ports, p.input));
    }
    const temporary = new LightAttractorLayer(this.#options);
    temporary.#cores = cores; temporary.#state = s; temporary.#pending = clone(raw.pending);
    equal(temporary.saveDiskState(), raw, 'complete layer roundtrip');
    this.#cores = cores; this.#state = s; this.#pending = clone(raw.pending);
    return this;
  }

  save() {
    const snapshot = clone({ options: this.#options, state: this.#state, cores: this.channels(), pending: this.#pending });
    snapshots.set(snapshot, JSON.stringify(snapshot));
    return snapshot;
  }

  /** Validate into independent temporary storage, then replace live state.
   * Save objects are transferable between compatible layer instances (forks).
   * Modifying even a valid nested value invalidates the entire saved capability.
   */
  restore(snapshot) {
    const canonical = snapshot && typeof snapshot === 'object' ? snapshots.get(snapshot) : undefined;
    if (!canonical || JSON.stringify(snapshot) !== canonical) throw new TypeError('Invalid or modified in-memory snapshot');
    const candidate = JSON.parse(canonical);
    if (!isDeepStrictEqual(snapshot, candidate)) throw new TypeError('Noncanonical in-memory snapshot');
    if (JSON.stringify(candidate.options) !== JSON.stringify(this.#options)) throw new RangeError('Incompatible layer snapshot');
    const cores = candidate.cores.map(entries => {
      const core = new LightBaseColorV2({ ...CORE_OPTIONS, seed: this.#options.seed });
      for (const { i, j, rho, H, samples } of entries) {
        core.setChannel(i, j, rho, H);
        core.samples.set(core.pairKey(i, j), samples);
      }
      return core;
    });
    this.#cores = cores;
    this.#state = candidate.state;
    this.#pending = candidate.pending;
    return this;
  }

  fork() { return new LightAttractorLayer(this.#options).restore(this.save()); }
}
