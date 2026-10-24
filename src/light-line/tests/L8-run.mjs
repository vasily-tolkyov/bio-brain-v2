import assert from 'node:assert/strict';
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { randomInt } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { sourceClosure } from '../persistence.mjs';
import { ROOT, files, sha, hash, read, write, protocol, schedule } from './L8-common.mjs';
import { collectSeed } from './L8-suite.mjs';
import { auditSeed } from './L8-audit.mjs';

function preservation() {
  const start = read(`${ROOT}/session-start.json`);
  for (const [p, h] of Object.entries(start.files)) assert.equal(sha(p), h, `Predecessor changed: ${p}`);
  assert.equal(read('out/light-line/acceptance/L7/summary.json').pass, true);
  return { pass: true, existingFiles: Object.keys(start.files).length, L7Pass: true, L7Rerun: false,
    L5Rerun: false, L6Rerun: false, historicalL0L4: { wipedBeforeSession: true, verified: false, hashes: null },
    commit: false, push: false, beyondL8Started: false };
}
function isolation() {
  const source = sourceClosure();
  assert.ok(!existsSync('src/light-line-adapters'));
  for (const p of Object.keys(source.files)) {
    assert.ok(!/(^|\/)teachers?\.mjs$/.test(p));
    assert.ok(!/\bteachGroups\s*\(/.test(readFileSync(`src/light-line/${p}`, 'utf8')));
  }
  return { teachers: 0, legacyRuntimeImports: 0, predecessorCampaignsInvoked: 0, imports: source.imports };
}
function integrity() {
  const freeze = read(`${ROOT}/freeze.json`); assert.deepEqual(freeze.source, sourceClosure());
  for (const [p, h] of Object.entries(freeze.source.files)) assert.equal(sha(`${ROOT}/source-snapshot/src/light-line/${p}`), h);
  for (const [p, h] of Object.entries(freeze.inputs)) assert.equal(sha(p), h);
  preservation(); return { sourceHash: freeze.source.hash, protocolHash: freeze.protocolHash, at: freeze.at };
}
function reserve() {
  integrity(); assert.ok(!existsSync(`${ROOT}/holdout-reservation.json`));
  const scope = ['out', 'logs', 'docs', 'experiments', 'src', 'tests', 'verify', 'codex-prompts'];
  const inspected = scope.flatMap(files).filter(p => !p.startsWith(`${ROOT}/`) && /\.(?:json(?:\.gz)?|jsonl(?:\.gz)?|mjs|js|ts|md|log|txt|sh|csv|ya?ml)$/.test(p));
  const inventory = Object.fromEntries(inspected.map(p => [p, sha(p)]));
  const proposed = [], selected = [];
  while (selected.length < 3) {
    const seed = randomInt(100000000, 2000000000);
    if ([...protocol.campaignSeeds, 101, ...protocol.forbiddenHoldoutSeeds, ...selected].includes(seed)) continue;
    const pattern = new RegExp(`(^|[^0-9])${seed}([^0-9]|$)`), matches = [];
    for (const p of inspected) {
      const bytes = readFileSync(p), text = p.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
      if (pattern.test(text) || pattern.test(p)) matches.push(p);
    }
    proposed.push({ seed, matches, decision: matches.length ? 'replace-before-any-model-run' : 'reserve',
      reason: matches.length ? 'Numeric token already present in inspected local evidence/source' : 'No numeric-token or path occurrence in inspected local evidence/source' });
    if (!matches.length) selected.push(seed);
  }
  const schedules = selected.map(seed => schedule(seed));
  write(`${ROOT}/freshness-inventory.json`, { scope, inventory, exclusions: ['.git and private configuration', 'binary and archive formats other than JSON gzip', 'L8 current outputs'],
    limitation: 'Freshness is claimed only within these inspected local files, not outside the remounted workspace.' });
  for (const s of schedules) write(`${ROOT}/schedules/holdout-${s.seed}.json`, s);
  const reservation = { at: new Date().toISOString(), frozen: integrity(), seedSelection: 'OS random integers drawn only after source/config/protocol freeze',
    forbidden: [41, 53, 67], seeds: selected, proposed, inspectedFiles: inspected.length, inventoryHash: sha(`${ROOT}/freshness-inventory.json`),
    schedules: schedules.map(s => ({ seed: s.seed, file: `${ROOT}/schedules/holdout-${s.seed}.json`, hash: hash(s) })) };
  write(`${ROOT}/holdout-reservation.json`, reservation); return reservation;
}
function reports(summary) {
  const fails = summary.runs.flatMap(r => r.decisions.filter(d => !d.pass).map(d => ({ seed: r.seed, ...d })));
  const table = summary.runs.map(r => `| ${r.seed} | ${r.role} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.decisions.filter(d => !d.pass).length} | ${r.audit.maxArithmeticDiscrepancy} |`).join('\n');
  write(`${ROOT}/REPORT.md`, `# L8 end-to-end brightness acceptance — ${summary.pass ? 'PASS' : 'NOT ACCEPTED'}

Campaign seeds ${summary.campaignSeeds.join('/')} and fresh holdout seeds ${summary.holdoutSeeds.join('/')} each have one execution marker. Source, all local configuration/JSON, protocol and numeric thresholds were frozen before any campaign run. Holdout seeds were selected after that freeze; schedules and the complete inspected-file inventory were recorded before the first holdout execution. See freeze.json, source-snapshot/, schedules/, holdout-reservation.json and freshness-inventory.json.

| Seed | Role | Decision | Failed gates | Max arithmetic discrepancy |
| --- | --- | --- | --- | --- |
${table}

Each full-loop run uses a single pipeline for ${protocol.kinds.length * protocol.episodesPerKind * protocol.episodeMs + protocol.setpointMs} ms, without resetting the world clock, action queue, unroll, future, W, goals or body traces. Fifty externally scheduled episodes cover direct goals, two-step goals, innate relief, relief ranking and external override. Physical energy interventions and ordinary goal commands are explicit in each saved schedule; they are not successful-outcome labels. A final 10000 ms setpoint period is retained. All 100 ms rows contain actual sensory, motor and body B/per-carrier fields, path witnesses, P7, temporal fields and copies, future launches/arrivals, binary N/M, W deltas, goal state, actions and body events. Continuous learning is enabled for the upper layer and W; natural lower optical fixtures are frozen.

The common natural 101 evidence supplies original lower input samples and explicitly inherited W. Each run reconstructs lower geometry using its own seed; inherited creation clocks are rebased to zero and are not claimed as fresh acquisition. Causal, shuffled and reverse optical branches begin with identical lower natural evidence and empty upper channels; causal/shuffled W controls begin byte-identically. The 30-trial schedule is recorded before execution. Calibration retains 10 paired, 60 omitted, 60 recovery, 30 jitter and 30 alternating trials. F is exactly one launched (A,6,B) contributor under the saved fixed source-P7, or zero after deletion, not total target forecast.

Optical fixtures include all declared role mixtures, six rotated partial cues, blank/amplitude controls, the five-center scalar physical fixture, independent max-product/path calculations, raw rho/H/color-sample accounting, contrast discovery and subordinate 20-replay M2 counts. Higher optical evidence includes the same local N250 base instantiated at level 3. The independent auditor reopens raw saved fields, recomputes ledgers and numeric predicates, retains failed decisions, and distinguishes missing/model/observer failures. Ten full-pipeline cuts each have 100 saved continuation windows. Malformed snapshots are resealed to test structural rejection and unchanged live state.

This report does not turn an incomplete or failed gate into acceptance. All individual decisions and measured values, including denominators and shared fields, are in per-seed audit.json. Failure records: failures.json. Saved-field audit command: node --max-old-space-size=8192 src/light-line/tests/L8-run.mjs --audit.

Preservation: ${summary.preservation.existingFiles} existing predecessor files are unchanged. L7Pass=true; L7Rerun=false; L5Rerun=false; L6Rerun=false. The earlier L0–L4 remount wipe remains unverifiable, with null historical hashes. No legacy snapshot result or old-wire result counts as L8 evidence. No predecessor campaign or acquisition entry point was invoked; local deterministic boundary fixtures are rechecked within L8.

Teachers: zero. Legacy runtime imports: zero. Source changes are confined to src/light-line/. New evidence is confined to acceptance/L8/. commit=false; push=false; beyondL8Started=false. This is the final phase of this chain.
`);
  write(`${ROOT}/SUMMARY.md`, `L8 端到端亮度验收：${summary.pass ? '通过' : '未通过'}。\n\n正式种子 ${summary.campaignSeeds.join('、')}，全新留出种子 ${summary.holdoutSeeds.join('、')}，每个只运行一次。全部源码、配置和协议先冻结，随后才抽取留出种子；运行前已保存其日程。检查了 ${summary.freshness.inspectedFiles} 个本地文件，所选留出值没有出现过；未使用 41、53、67。新鲜性仅限此次检查的本地证据范围。\n\n每个种子使用同一条持续流水线运行 1010000 毫秒，包含 50 个目标／身体场景和最后 10000 毫秒静止期。记录全部感官、时序、高层光场、预测、目标、动作、环境和身体事件；没有用短暂成功动作代替完整闭环。另有因果／乱序对照、消退／恢复／抖动／混合试验、光学成员复算、动作阈值、奖励无关性和快照续跑。\n\n${summary.pass ? '所有必需门均通过。' : `共有 ${fails.length} 个失败门记录。失败保留原样，没有重试、改阈值或把缺失证据算成通过。具体分类和数值见 failures.json 与各种子的 audit.json。`}\n\nL7 仍为 PASS，没有重跑 L5、L6 或 L7；现存前序证据哈希未变。此前丢失的 L0–L4 证据仍不可核验，没有补造历史哈希。教师为零，旧运行时导入为零；没有提交、没有推送，也没有启动 L8 之后的工作。\n`);
  write(`${ROOT}/failures.json`, fails);
}
function manifest() {
  const entries = Object.fromEntries(files(ROOT).filter(p => !/\/(?:manifest\.(?:json|sha256)|campaign\.log|audit\.log)$/.test(p)).map(p => [p, sha(p)]));
  write(`${ROOT}/manifest.json`, entries); write(`${ROOT}/manifest.sha256`, Object.entries(entries).map(([p, h]) => `${h}  ${p}`).join('\n') + '\n');
}
function oneSeed(role, seed) {
  const reservation = read(`${ROOT}/holdout-reservation.json`); integrity();
  assert.ok(role === 'campaign' ? protocol.campaignSeeds.includes(seed) : role === 'holdout' && reservation.seeds.includes(seed));
  if (role === 'holdout') for (const s of protocol.campaignSeeds) assert.ok(existsSync(`${ROOT}/campaign-${s}/audit.json`), 'Campaign must finish before holdout');
  const dir = `${ROOT}/${role}-${seed}`, s = read(`${ROOT}/schedules/${role}-${seed}.json`);
  assert.deepEqual(s, schedule(seed)); assert.ok(!existsSync(`${dir}/started.json`));
  write(`${dir}/started.json`, { at: new Date().toISOString(), seed, role, run: 1, scheduleHash: hash(s), freeze: integrity() });
  collectSeed(seed, s, dir); const audit = auditSeed(dir, s); write(`${dir}/audit.json`, audit);
  console.log(JSON.stringify({ seed, role, pass: audit.pass, failures: audit.decisions.filter(d => !d.pass) }));
  return { ...audit, role };
}
function finish() {
  const reservation = read(`${ROOT}/holdout-reservation.json`), runs = [];
  for (const [role, seeds] of [['campaign', protocol.campaignSeeds], ['holdout', reservation.seeds]]) for (const seed of seeds) {
    const marker = read(`${ROOT}/${role}-${seed}/started.json`); assert.equal(marker.run, 1);
    const audit = read(`${ROOT}/${role}-${seed}/audit.json`); runs.push({ ...audit, role });
  }
  const summary = { phase: 'L8', revision: protocol.revision, pass: runs.every(r => r.pass), campaignSeeds: protocol.campaignSeeds,
    holdoutSeeds: reservation.seeds, runsPerSeed: 1, freeze: integrity(), freshness: reservation,
    preservation: preservation(), isolation: isolation(), runs };
  write(`${ROOT}/summary.json`, summary); reports(summary); manifest();
  console.log(`${ROOT}/REPORT.md\n${ROOT}/SUMMARY.md\n${ROOT}/summary.json`);
}
const command = process.argv[2];
if (command === '--dev') {
  const revision = process.argv[3] ?? 'r1', dir = `${ROOT}/development/${revision}`;
  assert.ok(!existsSync(dir)); const s = schedule(101); write(`${dir}/schedule.json`, s);
  collectSeed(101, s, dir); const audit = auditSeed(dir, s); write(`${dir}/audit.json`, audit);
  console.log(JSON.stringify({ seed: 101, pass: audit.pass, failures: audit.decisions.filter(d => !d.pass), audit: audit.audit }));
} else if (command === '--freeze') {
  const revision = process.argv[3] ?? 'r1', dev = read(`${ROOT}/development/${revision}/audit.json`);
  assert.ok(!existsSync(`${ROOT}/freeze.json`)); preservation(); const source = sourceClosure();
  const inputs = Object.fromEntries([...files('out/light-line/design'), protocol.naturalEvidence, protocol.predictionEvidence, protocol.continuationEvidence,
    'out/light-line/acceptance/L7/summary.json'].map(p => [p, sha(p)]));
  for (const file of files('src/light-line')) { const target = `${ROOT}/source-snapshot/${file}`; mkdirSync(dirname(target), { recursive: true }); copyFileSync(file, target); }
  for (const seed of protocol.campaignSeeds) write(`${ROOT}/schedules/campaign-${seed}.json`, schedule(seed));
  write(`${ROOT}/freeze.json`, { at: new Date().toISOString(), revision: protocol.revision, source, protocol,
    protocolHash: hash(protocol), inputs, development: { seed: 101, revision, pass: dev.pass, auditHash: sha(`${ROOT}/development/${revision}/audit.json`) },
    policy: protocol.failurePolicy });
  write(`${ROOT}/import-isolation.json`, isolation()); write(`${ROOT}/preservation.json`, preservation());
  console.log(JSON.stringify(integrity()));
} else if (command === '--reserve') {
  console.log(JSON.stringify(reserve()));
} else if (command === '--seed') {
  oneSeed(process.argv[3], Number(process.argv[4]));
} else if (command === '--finish') {
  finish();
} else if (command === '--collect') {
  const reservation = read(`${ROOT}/holdout-reservation.json`); integrity();
  const runs = [];
  for (const [role, seeds] of [['campaign', protocol.campaignSeeds], ['holdout', reservation.seeds]]) for (const seed of seeds) {
    integrity(); const dir = `${ROOT}/${role}-${seed}`, s = read(`${ROOT}/schedules/${role}-${seed}.json`);
    assert.deepEqual(s, schedule(seed)); assert.ok(!existsSync(`${dir}/started.json`));
    write(`${dir}/started.json`, { at: new Date().toISOString(), seed, role, run: 1, scheduleHash: hash(s), freeze: integrity() });
    collectSeed(seed, s, dir); const audit = auditSeed(dir, s); write(`${dir}/audit.json`, audit);
    runs.push({ ...audit, role }); console.log(JSON.stringify({ seed, role, pass: audit.pass, failures: audit.decisions.filter(d => !d.pass) }));
  }
  const summary = { phase: 'L8', revision: protocol.revision, pass: runs.every(r => r.pass), campaignSeeds: protocol.campaignSeeds,
    holdoutSeeds: reservation.seeds, runsPerSeed: 1, freeze: integrity(), freshness: reservation,
    preservation: preservation(), isolation: isolation(), runs };
  write(`${ROOT}/summary.json`, summary); reports(summary); manifest();
  console.log(`${ROOT}/REPORT.md\n${ROOT}/SUMMARY.md\n${ROOT}/summary.json`);
} else if (command === '--audit' || command === '--audit-dev') {
  if (command === '--audit-dev') {
    const dir = `${ROOT}/development/${process.argv[3] ?? 'r1'}`, a = auditSeed(dir, read(`${dir}/schedule.json`));
    console.log(JSON.stringify({ pass: a.pass, failures: a.decisions.filter(d => !d.pass), audit: a.audit }));
  } else {
    integrity(); isolation(); for (const [p, h] of Object.entries(read(`${ROOT}/manifest.json`))) assert.equal(sha(p), h, p);
    const summary = read(`${ROOT}/summary.json`);
    for (const run of summary.runs) { const dir = `${ROOT}/${run.role}-${run.seed}`, a = auditSeed(dir, read(`${ROOT}/schedules/${run.role}-${run.seed}.json`));
      const { role, ...saved } = run; assert.deepEqual(a, saved); }
    console.log(JSON.stringify({ auditPass: true, modelPass: summary.pass, decisionAgreement: 1, seedCount: summary.runs.length,
      maxArithmeticDiscrepancy: Math.max(...summary.runs.map(r => r.audit.maxArithmeticDiscrepancy)), preservation: preservation() }));
  }
} else throw new Error('Use --dev, --freeze, --reserve, --collect, --audit, or --audit-dev');
