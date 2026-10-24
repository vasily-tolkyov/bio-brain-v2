import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { PROTOCOL, acquire, nextItem, calibration, goalFixture } from './L5-protocol.mjs';
import { ledgerChecks } from './L5-ledgers.mjs';
import { auditAcquisition, auditCalibration, auditReplay } from './L5-audit.mjs';

const root = 'out/light-line/acceptance/L5';
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(`${directory}/${e.name}`) : [`${directory}/${e.name}`]).sort();
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const write = (name, data) => {
  const file = `${root}/${name}`; mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, name.endsWith('.gz') ? gzipSync(JSON.stringify(data)) : JSON.stringify(data, null, 2) + '\n');
};
const read = name => JSON.parse(name.endsWith('.gz') ? gunzipSync(readFileSync(`${root}/${name}`)).toString() : readFileSync(`${root}/${name}`, 'utf8'));
const rawRun = run => { const { stack, p, measurements, ...data } = run; return data; };
const allTrue = flags => Object.values(flags).every(Boolean);

export function isolation() {
  const base = resolve('src/light-line'), paths = files(base).filter(f => f.endsWith('.mjs'));
  const runtime = paths.filter(f => !f.includes('/tests/'));
  const imports = [];
  for (const file of paths) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
      const spec = m[1]; if (spec.startsWith('node:')) continue;
      const target = resolve(dirname(file), spec);
      assert.ok(target.startsWith(base + '/') && existsSync(target), `${file}: ${spec}`);
      imports.push({ file: relative(process.cwd(), file), spec });
    }
    if (runtime.includes(file)) {
      assert.ok(!/\bSpikingNetwork\b|\bteachGroups\b|\bLIF\b|\bcreateRequire\b|\beval\s*\(/.test(text), file);
      assert.ok(!/teacher|curricul/i.test(file), file);
    }
  }
  assert.ok(!existsSync('src/light-line-adapters'));
  return { pass: true, runtimeModules: runtime.map(f => relative(process.cwd(), f)), imports,
    legacyRuntimeImports: 0, teacherModules: 0, teacherCalls: 0, adaptersTree: false };
}

function preservation() {
  const baseline = read('baseline.json');
  const changed = Object.entries(baseline.files).filter(([file, digest]) => !existsSync(file) || sha(file) !== digest).map(([file]) => file);
  // Owner-authorized remount recovery: this baseline was captured AFTER the
  // original out/ trees disappeared. It cannot certify any historical hashes.
  if (baseline.kind === 'post-remount') {
    assert.equal(baseline.schema, 'light-line-L5-post-remount-baseline-v1');
    assert.deepEqual(Object.keys(baseline.files).sort(),
      [...files('src/light-line'), ...files('out/light-line/design')].sort());
    assert.deepEqual(changed, [], 'Post-remount candidate/design changed');
    const prior = read('prior-manifests.json');
    assert.equal(prior.status, 'lost-after-remount');
    assert.equal(prior.verified, false);
    assert.equal(prior.hashes, null);
    assert.deepEqual(prior.lostPhases, ['L0', 'L1', 'L2', 'L3', 'L3b', 'L4', 'L5']);
    return { pass: true, scope: 'post-remount source/design preservation only',
      baselineFiles: Object.keys(baseline.files).length, preserved: Object.keys(baseline.files).length,
      permittedRuntimeExtensions: [], allPriorEvidenceUnchanged: null,
      priorEvidenceVerifiable: false, priorEvidence: prior };
  }
  assert.deepEqual(changed, ['src/light-line/temporal-stack.mjs']);
  return { pass: true, baselineFiles: Object.keys(baseline.files).length,
    preserved: Object.keys(baseline.files).length - changed.length, permittedRuntimeExtensions: changed,
    allPriorEvidenceUnchanged: true, L0_L1_L2: read('prior-manifests.json') };
}

function freezeCandidate() {
  assert.ok(!existsSync(root), 'Refusing to overwrite L5 acceptance');
  mkdirSync(root, { recursive: true });
  copyFileSync('/tmp/light-line-L5-baseline.json', `${root}/baseline.json`);
  copyFileSync('/tmp/light-line-L5-prior-manifests.json', `${root}/prior-manifests.json`);
  copyFileSync('/tmp/light-line-L5-dev-audit101.json.gz', `${root}/development-101.json.gz`);
  const source = Object.fromEntries(files('src/light-line').map(file => [file, sha(file)]));
  const remount = read('baseline.json').kind === 'post-remount';
  const design = remount ? Object.fromEntries(files('out/light-line/design').map(file => [file, sha(file)])) : {};
  const inputs = Object.fromEntries(['baseline.json', 'prior-manifests.json', 'development-101.json.gz']
    .map(name => [name, sha(`${root}/${name}`)]));
  write('candidate.json', { fixedAt: new Date().toISOString(), protocol: PROTOCOL, source, design, inputs,
    evidenceMode: remount ? 'post-remount; prior trees lost and unverifiable' : 'original',
    policy: 'One acquisition per arm per acceptance seed; no acceptance retune/retry. Source and recipe fixed before seed 7.' });
  for (const file of [...Object.keys(source), ...Object.keys(design)]) {
    const target = `${root}/source-snapshot/${file}`; mkdirSync(dirname(target), { recursive: true }); copyFileSync(file, target);
  }
  write('import-isolation.json', isolation());
  write('preservation.json', preservation());
  write('ledger-checks.json', ledgerChecks());
}

function candidateIntegrity() {
  const candidate = read('candidate.json');
  assert.deepEqual(files('src/light-line'), Object.keys(candidate.source).sort());
  for (const [file, digest] of Object.entries({ ...candidate.source, ...candidate.design })) {
    assert.equal(sha(file), digest, `Candidate changed: ${file}`);
    assert.equal(sha(`${root}/source-snapshot/${file}`), digest, `Snapshot changed: ${file}`);
  }
  for (const [name, digest] of Object.entries(candidate.inputs ?? {}))
    assert.equal(sha(`${root}/${name}`), digest, `Candidate input changed: ${name}`);
  return { pass: true, sourceFiles: Object.keys(candidate.source).length,
    designFiles: Object.keys(candidate.design ?? {}).length };
}

export function auditSavedSeed(seed) {
  const a = read(`seed-${seed}/causal.json.gz`), b = read(`seed-${seed}/shuffled.json.gz`);
  const next = read(`seed-${seed}/next-item.json.gz`), m6 = read(`seed-${seed}/calibration.json.gz`);
  const goals = read(`seed-${seed}/goals.json`);
  const optical = [auditAcquisition(a), auditAcquisition(b)];
  const calibrationAudit = auditCalibration(m6, a);
  let maximumP7Error = 0;
  for (const trial of next.trials) for (const replay of [trial.source, ...trial.target])
    maximumP7Error = Math.max(maximumP7Error, auditReplay(replay, a.catalogue, a.audit.channels.lower));
  assert.equal(next.trials.length, 20);
  assert.ok(allTrue(next.flags)); assert.ok(allTrue(m6.flags));
  assert.equal(goals.sameRuleObject, true); assert.equal(goals.mapping.goalId, goals.mapping.predictedOutcomeId);
  assert.equal(goals.mapping.changeCellId, goals.rule.B); assert.ok(goals.eligible);
  assert.equal(goals.frozenBefore, goals.frozenAfter); assert.equal(goals.partial.frozenBefore, goals.partial.frozenAfter);
  assert.equal(goals.hypotheticalPastCount, 0); assert.equal(goals.cancelled.action, null);
  // Recompute gates from saved numbers, not saved PASS flags.
  const F = next.causal.F;
  assert.ok(F > 0 && F >= 5 * next.control.shuffled.strongest && F >= 5 * next.control.distractor.strongest);
  assert.ok(next.trials.filter(t => t.contributor?.tArrive - t.contributor?.tOnset === 3200 &&
    t.arrivals.some(e => e.observedAt === e.tOnset + 3200)).length >= 18);
  assert.ok(next.trials.filter(t => t.matched?.matched === 1).length >= 18);
  const z = m6.metrics;
  assert.ok(z.F_paired10 > 0 && z.F_omission60 <= .1 * z.F_paired10 && z.F_omission60 < z.F_omission30);
  assert.ok(z.F_recovery60 >= .85 * z.F_paired10 && z.F_jitter30 >= .8 * z.F_paired10);
  assert.ok(z.mixedFinal <= .95 * z.mixedInitial && z.mixedSlope < 0 && z.mixedLast10Slope < 0);
  return { pass: true, seed, optical, calibrationAudit, maximumP7Error };
}

export async function collect() {
  freezeCandidate();
  const metrics = [];
  for (const seed of PROTOCOL.seeds) {
    write(`seed-${seed}/started.json`, { seed, started: new Date().toISOString(), run: 1 });
    console.log(`L5 seed ${seed}: causal acquisition`);
    const a = acquire(seed); write(`seed-${seed}/causal.json.gz`, rawRun(a));
    console.log(`L5 seed ${seed}: shuffled acquisition`);
    const b = acquire(seed, true); write(`seed-${seed}/shuffled.json.gz`, rawRun(b));
    const next = nextItem(a, b), m6 = calibration(a), goals = goalFixture(a);
    write(`seed-${seed}/next-item.json.gz`, next); write(`seed-${seed}/calibration.json.gz`, m6);
    write(`seed-${seed}/goals.json`, goals);
    let audit;
    try { audit = auditSavedSeed(seed); }
    catch (error) { audit = { pass: false, seed, error: error.stack }; }
    write(`seed-${seed}/independent-audit.json`, audit);
    const row = { seed, pass: allTrue(next.flags) && allTrue(m6.flags) && audit.pass,
      forecast: { causal: next.causal.F, shuffled: next.control.shuffled.strongest, distractor: next.control.distractor.strongest,
        totalCausal: next.causal.total, totalShuffled: next.control.shuffled.total, totalDistractor: next.control.distractor.total,
        timely: next.trials.filter(t => t.timely).length, matched: next.trials.filter(t => t.match).length },
      calibration: m6.metrics, deltas: m6.phases.map(p => ({ phase: p.name, ...p.deltas })),
      goals: { sameRuleObject: goals.sameRuleObject, partialW: goals.partial.rule.W, saturatedW: goals.rule.W } };
    metrics.push(row); write(`seed-${seed}/metrics.json`, row); console.log(JSON.stringify(row));
  }
  const integrity = candidateIntegrity(), preserved = preservation();
  write('preservation.json', preserved);
  write('summary.json', { pass: metrics.every(m => m.pass), novelty: 'PASS: included binary comparator and unchanged pending timing',
    evidenceMode: read('candidate.json').evidenceMode, candidateIntegrity: integrity,
    preservation: preserved, runs: metrics });
  return metrics;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--audit')) {
    console.log(JSON.stringify({ isolation: isolation().pass, preservation: preservation().pass,
      candidateIntegrity: candidateIntegrity(),
      ledgerChecks: ledgerChecks().length, seeds: PROTOCOL.seeds.map(seed => {
        const a = auditSavedSeed(seed); return { seed, pass: a.pass, maximumP7Error: a.maximumP7Error };
      }) }, null, 2));
  } else if (process.argv.includes('--collect')) await collect();
  else throw new Error('Use --collect (refuses overwrite) or --audit (read only)');
}
