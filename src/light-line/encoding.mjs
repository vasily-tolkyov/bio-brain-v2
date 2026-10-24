import { CORE_OPTIONS } from './config.mjs';

const unit = (v, name) => {
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new RangeError(`${name} must be in [0,1]`);
};

/** Port indices are routing coordinates only. No names or class labels are read. */
export function makePorts(core, declaration) {
  const rows = Number.isSafeInteger(declaration) && declaration > 0
    ? Array.from({ length: declaration }, () => ({})) : declaration;
  if (!Array.isArray(rows) || rows.length === 0) throw new TypeError('Expected ordered ports');
  return Object.freeze(Array.from(rows, (row, port) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).some(k => !['coordinate', 'carrier'].includes(k))) {
      throw new TypeError('Port accepts only coordinate and carrier');
    }
    const coordinate = row.coordinate === 0 ? 0 : row.coordinate ?? (port + .5) / rows.length;
    const carrier = row.carrier === 0 ? 0 : row.carrier ?? coordinate;
    unit(coordinate, 'coordinate'); unit(carrier, 'carrier');
    return Object.freeze({ port, coordinate, carrier,
      sources: Object.freeze(core.inputSources(coordinate)) });
  }));
}

/** A partial source list is a subset of its original six-cell port cluster. */
export function encode(ports, input) {
  if (!Array.isArray(input) || input.length !== ports.length) throw new TypeError('One input per port required');
  return Array.from(input, (value, j) => {
    const row = typeof value === 'number' ? { amplitude: value } : value;
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).some(k => !['amplitude', 'sources'].includes(k))) {
      throw new TypeError('Input accepts amplitude and optional physical sources only');
    }
    unit(row.amplitude, 'amplitude');
    const p = ports[j], supplied = row.sources ?? p.sources;
    if (!Array.isArray(supplied) || Array.from(supplied).some(i => !p.sources.includes(i))
        || new Set(supplied).size !== supplied.length) throw new RangeError('Invalid partial cue');
    return { port: j, coordinate: p.coordinate, carrier: p.carrier,
      amplitude: row.amplitude === 0 ? 0 : row.amplitude,
      sources: Array.from(supplied, i => i === 0 ? 0 : i).sort((a, b) => a - b) };
  });
}

export function trainingInput(encoded) {
  const active = encoded.filter(p => p.amplitude > 0 && p.sources.length > 0);
  return { sources: [...new Set(active.flatMap(p => p.sources))].sort((a, b) => a - b),
    carriers: [...new Set(active.map(p => p.carrier))].sort((a, b) => a - b) };
}

/** Keep every port's independent unit solve, scaled only by its own amplitude. */
export function solvePorts(cores, encoded) {
  return encoded.filter(p => p.amplitude > 0 && p.sources.length > 0).map(p => ({ ...p,
    replicas: cores.map(core => {
      const field = core.propagate(p.sources, p.carrier, { intensity: 1 });
      const brightness = field.brightness.map(b => p.amplitude * b);
      return { brightness, paths: field.paths,
        lit: brightness.flatMap((b, i) => b > CORE_OPTIONS.theta ? [i] : []),
        meanB: brightness.reduce((a, b) => a + b, 0) / CORE_OPTIONS.N };
    }),
  }));
}

/** Only contributions at the SAME wavelength share a source-max fixed point.
 * Cross-color values never enter a reduction. Each carrier retains its own paths.
 */
export function separateCarriers(fields, R) {
  const carriers = [...new Set(fields.map(p => p.carrier))].sort((a, b) => a - b);
  return carriers.map(carrier => {
    const contributions = fields.filter(p => p.carrier === carrier);
    return { carrier, ports: contributions.map(p => p.port),
      replicas: Array.from({ length: R }, (_, r) => {
        const brightness = Array(CORE_OPTIONS.N).fill(0);
        const paths = Array.from({ length: CORE_OPTIONS.N }, () => []);
        const sourcePort = Array(CORE_OPTIONS.N).fill(null);
        for (const p of contributions) for (let i = 0; i < brightness.length; i++) {
          if (p.replicas[r].brightness[i] > brightness[i]) {
            brightness[i] = p.replicas[r].brightness[i];
            paths[i] = p.replicas[r].paths[i]; sourcePort[i] = p.port;
          }
        }
        return { brightness, paths, sourcePort,
          lit: brightness.flatMap((b, i) => b > CORE_OPTIONS.theta ? [i] : []),
          meanB: brightness.reduce((a, b) => a + b, 0) / CORE_OPTIONS.N };
      }),
    };
  });
}
