import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname } from 'node:path';
import { LightCheckpoint, hash, saveCheckpoint, loadCheckpoint } from '../persistence.mjs';
import { LightAttractorLayer } from '../layer.mjs';
import { makeFixture, atCut, beginScheduled, nextWindow, memberships, protocol } from './L7-fixtures.mjs';
import { cases, mutate } from './L7-malformed.mjs';
import { read, witness, auditSeed } from './L7-audit.mjs';
export function write(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const bytes = typeof data === 'string' ? data : JSON.stringify(data);
  writeFileSync(file, file.endsWith('.gz') ? gzipSync(bytes) : bytes + '\n');
}
const json = x => JSON.parse(JSON.stringify(x));
function resumeObject(c) {
  return new LightCheckpoint(c.pipeline, { createEnvironment: c.createEnvironment, schedule: c.schedule });
}
function probes(p, samples) {
  return samples.slice(0, 8).map(row => ({ input: row.sample,
    lower: p.sensory.layer.fork().present(p.sensory.names.map(f => row.sample.features[f]), 100),
    upper: p.temporal.layer.query(p.temporal.last.lines),
    unroll: [...p.temporal.past.lines(p.temporal.past.t)],
    future: [...p.learning.future.lines()], goals: [...p.goals.goals.strengths()], motor: [...p.goals.motorDrive()] }));
}
export function runSeed(seed, dir, progress = console.log) {
  progress(`L7 ${seed}: readonly natural fixture replay`);
  const fixture = makeFixture(seed), c = fixture.checkpoint;
  write(`${dir}/fixture.json`, { seed, ...fixture.fixture, sampleCount: fixture.evidence.formation.frames.length,
    continuationWindows: protocol.windowsPerCut, cutDefinitions: protocol.cuts });
  const reference = { windows: [] };
  const count = Math.max(...protocol.cuts.map(c => c.window)) + 100;
  for (let window = 0; window < count; window++) {
    for (const cut of protocol.cuts.filter(c => c.window === window)) {
      atCut(c, cut);
      const initial = c.saveState();
      assert.equal(witness(cut.name, initial, fixture.fixture.initialWeakEdge.generation), true, cut.name);
      write(`${dir}/${cut.name}/initial.json.gz`, initial);
    }
    reference.windows.push(json(nextWindow(c)));
    for (const cut of protocol.cuts.filter(cut => cut.window + 100 === window + 1)) {
      write(`${dir}/${cut.name}/reference-final.json.gz`, c.saveState());
      write(`${dir}/${cut.name}/reference-M2.json.gz`, memberships(c.pipeline));
    }
  }
  write(`${dir}/uninterrupted.json.gz`, reference);
  progress(`L7 ${seed}: ${protocol.cuts.length} disk cuts, 100 windows each`);
  for (const cut of protocol.cuts) {
    const branch = resumeObject(c), initial = read(`${dir}/${cut.name}/initial.json.gz`);
    branch.loadState(initial); const exactOnLoad = JSON.stringify(branch.saveState()) === JSON.stringify(initial);
    const windows = Array.from({ length: 100 }, () => json(nextWindow(branch)));
    write(`${dir}/${cut.name}/resumed.json.gz`, { initialDigest: initial.digest, exactOnLoad, windows,
      final: branch.saveState(), M2: memberships(branch.pipeline) });
    progress(`L7 ${seed}: resumed ${cut.name}`);
  }
  progress(`L7 ${seed}: malformed atomic rejection`);
  const states = {}, results = [];
  const normal = read(`${dir}/goal-parent-link/initial.json.gz`), queued = read(`${dir}/before-optical-commit/initial.json.gz`);
  const live = resumeObject(c); let loadedKind = null;
  for (const [name, , kind] of cases) {
    const original = kind === 'queued' ? queued : normal;
    if (loadedKind !== (kind ?? 'normal')) { live.loadState(original); loadedKind = kind ?? 'normal'; }
    progress(`L7 ${seed}: reject ${name}`);
    const malformed = mutate(original, name); // Mutator errors must fail the test, never count as rejection.
    const root = live.pipeline, beforeState = live.saveState(), before = hash(beforeState); states[before] = beforeState;
    let rejected = false, reason = '';
    try { live.loadState(malformed); } catch (error) { rejected = true; reason = error.message.slice(0, 200); }
    const afterState = live.saveState(), after = hash(afterState); states[after] = afterState;
    results.push({ name, source: kind ?? 'normal', rejected, reason, before, after, rootRetained: root === live.pipeline });
    assert.ok(rejected && before === after && root === live.pipeline, name);
  }
  write(`${dir}/malformed.json.gz`, { states, results });
  progress(`L7 ${seed}: frozen natural probes and atomic files`);
  live.loadState(normal); live.pipeline.freeze(); live.pipeline.temporal.layer.discover();
  const before = live.saveState(), probesBefore = probes(live.pipeline, fixture.evidence.formation.frames), M2Before = memberships(live.pipeline);
  for (let i = 0; i < 8; i++) nextWindow(live);
  const changed = live.saveState(); live.loadState(before);
  const layers = [live.pipeline.sensory, live.pipeline.output.stream, ...live.pipeline.body.streams].map(stream => {
    const before = stream.layer.saveDiskState(), layer = new LightAttractorLayer(before.identity.options).loadDiskState(before);
    const input = stream.names.map((_, i) => Number(i === 0));
    const first = layer.present(input, 100); layer.loadDiskState(before); const restored = layer.saveDiskState();
    const second = layer.present(input, 100); return { before, restored, first, second };
  });
  write(`${dir}/frozen.json.gz`, { before, changed, restored: live.saveState(), probesBefore,
    probesAfter: probes(live.pipeline, fixture.evidence.formation.frames), M2Before, M2After: memberships(live.pipeline), layers });
  const file = `${dir}/atomic/snapshot.json`;
  saveCheckpoint(file, live); nextWindow(live); saveCheckpoint(file, live);
  const saved = live.saveState(); loadCheckpoint(file, live);
  const replacementExact = JSON.stringify(live.saveState()) === JSON.stringify(saved);
  const root = live.pipeline; write(`${dir}/atomic/truncated.json`, '{"schema":');
  let truncatedRejected = false; try { loadCheckpoint(`${dir}/atomic/truncated.json`, live); } catch { truncatedRejected = true; }
  const truncatedAtomic = root === live.pipeline && JSON.stringify(live.saveState()) === JSON.stringify(saved);
  mkdirSync(`${dir}/atomic/directory`, { recursive: true });
  let renameFailed = false; try { saveCheckpoint(`${dir}/atomic/directory`, live); } catch { renameFailed = true; }
  const temporaryCleaned = readdirSync(`${dir}/atomic`).every(f => !f.endsWith('.tmp'));
  write(`${dir}/disk-checks.json`, { replacementExact, truncatedRejected, truncatedAtomic, renameFailed, temporaryCleaned });
  // Acceptance is computed by reopening saved raw arrays, never online booleans alone.
  const audit = auditSeed(dir); write(`${dir}/audit.json`, audit); return audit;
}
if (process.argv[2] === '--dev') {
  const dir = process.argv[3] ?? 'out/light-line/acceptance/L7/development/final';
  console.log(JSON.stringify(runSeed(101, dir), null, 2));
}
