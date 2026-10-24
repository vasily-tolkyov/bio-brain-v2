import { readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, rmSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { CORE_OPTIONS, CURVE } from './config.mjs';
import { savePipeline, loadPipeline } from './pipeline-state.mjs';
import { equal, check, keys, jsonData } from './state-validation.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(new URL('./persistence-config.json', import.meta.url), 'utf8'));
export const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
export function sourceClosure(directory = root) {
  const files = {}, imports = [];
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = resolve(dir, e.name);
      check(!e.isSymbolicLink(), 'source symlink');
      if (e.isDirectory()) walk(file);
      else {
        // Bind all local source/config data, including JSON and future non-module assets.
        const name = relative(directory, file).split(sep).join('/');
        const bytes = readFileSync(file); files[name] = createHash('sha256').update(bytes).digest('hex');
        if (extname(file) === '.mjs') {
          const text = bytes.toString('utf8');
          for (const match of text.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\bfrom\s*)?['"]([^'"]+)['"]/gm)) {
            const specifier = match[1];
            if (!specifier.startsWith('node:')) {
              check(specifier.startsWith('.'), 'local import');
              const target = resolve(dirname(file), specifier);
              check(target.startsWith(resolve(directory) + sep), 'isolated light runtime import');
              readFileSync(target);
            }
            imports.push({ file: name, specifier });
          }
        }
      }
    }
  };
  walk(directory);
  return { files, hash: hash(files), imports };
}
const loadedSource = sourceClosure();
const topology = s => ({ seed: s.seed, ids: s.ids, mapping: s.mapping, labels: s.labels,
  layers: [s.sensory.layer, s.output.stream.layer, ...(s.body?.streams.map(s => s.layer) ?? []), s.temporal.layer].map(l => l.identity),
  environment: s.environment.descriptor });

/** A single swappable root is the transaction boundary. Holders use .pipeline
 * after restore; old graph references are intentionally unchanged. */
export class LightCheckpoint {
  constructor(pipeline, { createEnvironment, schedule }) {
    check(typeof createEnvironment === 'function', 'environment factory'); jsonData(schedule);
    this.pipeline = pipeline; this.createEnvironment = createEnvironment;
    this.schedule = structuredClone(schedule);
    this.scheduleState = { cursor: pipeline.t / 100, rng: null };
    this.identity = topology(savePipeline(pipeline));
  }
  saveState() {
    const pipeline = savePipeline(this.pipeline);
    const closure = sourceClosure();
    equal(closure.files, loadedSource.files, 'source changed since module load');
    const envelope = { schema: config.schema, binding: { source: closure.files, sourceHash: closure.hash,
      config, opticalRule: { ...CORE_OPTIONS, curve: CURVE }, catalogueVersion: config.catalogueVersion,
      topology: this.identity, schedule: this.schedule, scheduleHash: hash(this.schedule) },
      pipeline, scheduleState: { ...this.scheduleState, cursor: pipeline.t / 100 } };
    jsonData(envelope);
    return structuredClone({ ...envelope, digest: hash(envelope) });
  }
  loadState(raw) {
    jsonData(raw); keys(raw, ['schema', 'binding', 'pipeline', 'scheduleState', 'digest']);
    check(raw.schema === config.schema, 'light-line-v1 schema (no migration)');
    const { digest, ...payload } = raw; equal(digest, hash(payload), 'snapshot digest');
    // Identity comes from the receiving process, never from untrusted snapshot defaults.
    equal(raw.binding, this.saveState().binding, 'source/config/optical/port/catalogue/schedule binding');
    equal(topology(raw.pipeline), this.identity, 'full layer inventory');
    keys(raw.scheduleState, ['cursor', 'rng']); equal(raw.scheduleState.cursor, raw.pipeline.t / 100, 'committed schedule cursor');
    const candidate = loadPipeline(raw.pipeline, this.createEnvironment,
      { environment: this.identity.environment, seed: this.identity.seed, liveEnvironment: this.pipeline.env });
    const state = structuredClone(raw.scheduleState);
    // No live object has been touched above. One non-throwing assignment commits the graph.
    this.pipeline = candidate; this.scheduleState = state;
    return this;
  }
  fork() {
    const copy = Object.create(LightCheckpoint.prototype);
    copy.pipeline = this.pipeline; copy.createEnvironment = this.createEnvironment;
    copy.identity = structuredClone(this.identity); copy.schedule = structuredClone(this.schedule);
    copy.scheduleState = structuredClone(this.scheduleState);
    return copy.loadState(this.saveState());
  }
}
function cachePath(file) {
  const allowed = resolve(root, '../../out/light-line'), target = resolve(file);
  check(target.startsWith(allowed + sep), 'light-line cache path');
  mkdirSync(dirname(target), { recursive: true });
  check(realpathSync(dirname(target)).startsWith(realpathSync(allowed) + sep) || realpathSync(dirname(target)) === realpathSync(allowed), 'cache symlink escape');
  return target;
}
/** Local copy of the generic same-directory exclusive-temp/rename/finally-cleanup
 * algorithm. It has no imports from the neural checkpoint or state modules. */
export function saveCheckpoint(file, checkpoint) {
  const serialized = JSON.stringify(checkpoint.saveState()) + '\n';
  const target = cachePath(file), temporary = `${target}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, serialized, { flag: 'wx' }); renameSync(temporary, target); }
  finally { rmSync(temporary, { force: true }); }
  return target;
}
export function loadCheckpoint(file, checkpoint) {
  const target = cachePath(file); return checkpoint.loadState(JSON.parse(readFileSync(target, 'utf8')));
}
