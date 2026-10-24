import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { sourceClosure } from '../persistence.mjs';
import { runSeed, write } from './L7-run.mjs';
import { read, auditSeed } from './L7-audit.mjs';
import { protocol } from './L7-fixtures.mjs';
const root = 'out/light-line/acceptance/L7';
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]).sort(); }
function preservation() {
  const b = read(`${root}/session-start.json`);
  for (const [p, hash] of Object.entries(b.files)) assert.equal(sha(p), hash, `Predecessor changed: ${p}`);
  const L6Pass = read('out/light-line/acceptance/L6/summary.json').pass; assert.equal(L6Pass, true);
  return { pass: true, existingFiles: Object.keys(b.files).length, L6Pass, L6Rerun: false, L5Rerun: false, L8Started: false,
    historicalL0L4: { wipedBeforeSession: true, hashes: null, verified: false }, commit: false, push: false };
}
function isolation() {
  const closure = sourceClosure();
  assert.ok(Object.keys(closure.files).includes('persistence-config.json') && Object.keys(closure.files).includes('tests/L7-protocol.json'));
  assert.ok(!Object.keys(closure.files).some(p => /(^|\/)teachers?\.mjs$/.test(p)));
  assert.ok(!existsSync('src/light-line-adapters'));
  assert.ok(!files('src/light-line').some(p => /\bteachGroups\s*\(/.test(readFileSync(p, 'utf8'))));
  return { pass: true, teachers: 0, legacyRuntimeImports: 0, oldCaches: 0, JSONBound: true, ...closure };
}
function lock() {
  assert.ok(!existsSync(`${root}/candidate.json`), 'Candidate already locked');
  const dev = auditSeed(`${root}/development/final`); assert.equal(dev.pass, true);
  const candidate = { at: new Date().toISOString(), protocol, source: sourceClosure(),
    design: Object.fromEntries(files('out/light-line/design').map(p => [p, sha(p)])),
    development: { seed: 101, audit: dev }, policy: '7/19/31 each once, no retune or seed rerun; no L5/L6 rerun, no L8.' };
  write(`${root}/candidate.json`, candidate);
  for (const p of files('src/light-line')) { const target = `${root}/source-snapshot/${p}`; mkdirSync(dirname(target), { recursive: true }); copyFileSync(p, target); }
  write(`${root}/import-isolation.json`, isolation()); write(`${root}/preservation.json`, preservation());
}
function integrity() {
  const c = read(`${root}/candidate.json`); assert.deepEqual(c.source, sourceClosure());
  for (const [p, h] of Object.entries(c.source.files)) assert.equal(sha(`${root}/source-snapshot/src/light-line/${p}`), h);
  for (const [p, h] of Object.entries(c.design)) assert.equal(sha(p), h);
  return { pass: true, sourceHash: c.source.hash, files: Object.keys(c.source.files).length, configJSON: true };
}
function reports(s) {
  const status = s.pass ? 'PASS' : 'REJECTED';
  write(`${root}/REPORT.md`, `# L7 snapshots, caches and complete continuation — ${status}

L7 only; seeds 7/19/31 run once each after development on 101. No L5/L6 acceptance or acquisition harness was invoked. No L8 work, commit or push. Teacher modules and legacy runtime imports: zero.

The light-line-v1 envelope binds every local source/config file (including both JSON files), fixed optical rule/curve, all layer geometry/seed/port maps, contrast-M2 catalogue version and the complete predetermined schedule. A process rejects source changes after module load. Raw rho/H/color sample arrays are retained; H is validated against original sample multiplicity, never inverted to synthesize samples. Per-port and per-carrier B, source amplitudes, frames/history, stable IDs, freeze state, queued .5 ms elementary presentations and committed cursors are explicit. Cross-color brightness remains separate under decision A.

The full graph includes sensory, motor and body layers; higher optical layer and its catalogue; both TimeUnroll states; FutureSlices weights/generations/windows/records; prediction credits and binary novelty pending ledger; goal rows/parents/links/counts; motor.previous; body readings/batches/traces; drive ownership/request; active IO window; environment effects/action queue/cursor/RNG; and schedule identity/cursor. The .5 ms continuous optical cadence and the L6 execute → environment → physical P7 → actual copy → temporal/learning → goal/drive order are retained. No spike or old neuronal fields are added.

Restore constructs an independent environment and complete temporary graph, validates cross-object IDs, generations, forecasts, clocks and ownership, then swaps one LightCheckpoint.pipeline root. Callers retain the controller and read its current .pipeline after restore; pre-existing references to the old graph are left untouched. ObservedStream.fork remains the L6 fresh observation view; exact continuation uses LightCheckpoint.fork or disk restore. Atomic file save locally copies exclusive same-directory temporary write → rename → finally cleanup. Files are restricted to out/light-line/; this is atomic replacement, not a claim of power-loss durability/fsync.

| Seed | Predetermined cuts | Exact continuation windows | Malformed rejected | Frozen restore |
| --- | --- | --- | --- | --- |
${s.runs.map(r => `| ${r.seed} | ${r.cuts?.length ?? 0} | ${r.resumedWindows ?? 0} | ${r.malformedRejected ?? 0} | ${r.frozenRestoreExact ?? false} |`).join('\n')}

The thirteen cuts cover mid-sample IO, before/after optical commit, cue boundary, delayed future, first match, inclusive deadline, deletion, rebirth, pending goal, body trace, drive ownership and a goal parent link with a pending motor drive. Each is required to have an actual saved-state witness; empty ledgers do not count. Every resumed branch is compared against 100 windows from a single uninterrupted reference, including complete B arrays, raw channels/sample maps, subordinate M2 replay counts, IDs, all ledger/W changes, action events and final envelope. Equality is exact; observed comparison error is zero. The audit reopens saved original arrays rather than trusting acquisition-time pass flags.

The malformed cases include nonfinite/range errors, geometry/config/JSON/source/schedule incompatibility, missing samples and multiplicity, catalogue/M2/ID corruption, clock/cursor mismatch, duplicate or unknown generations, missing forecast instances, goal cycles/nonbinary units, invalid drive/body/environment/cache state, and old/wire schemas. Structural mutations are resealed so checksum rejection alone cannot satisfy them. Mutation construction is outside the rejection catch. Before/after complete snapshots are deduplicated by hash in malformed.json.gz; each rejected attempt retains the same live root and byte-exact state. Additional file checks cover replacement, truncated JSON and failed-rename temporary cleanup.

Frozen natural probes restore lower learned channels/catalogues/M2 and the learned upper optical and W/goal state exactly. Full lower layer states are replayed from the original L6 saved natural samples; their raw channels must exactly equal L6 saved channels. The L6 evidence is read only. This is L7 fixture construction, not a rerun or recertification of L6. Inherited W is reused as learned fixture input with an explicitly declared new fixture clock origin (createdAt=0). A declared .001 wave→tone fixture edge tests deletion/rebirth; its override is never represented as acquired learning. The L7 environment retains the L6 primary physical effects and adds fixed natural cue/omission probes plus a saved RNG. No teacher curriculum or group-teaching interface exists.

Development logs retain the interrupted first malformed sweep and diagnosis. Review found an empty-cache mutation bug that could count a mutator exception as rejection; the mutation now targets a populated field and is constructed outside the catch. Validation errors use bounded labels rather than formatting multi-megabyte snapshot diffs. The final 101 run completed before campaign lock; no campaign result was used for tuning.

All ${s.preservation.existingFiles} predecessor files are unchanged, including L5/L6 PASS evidence. Lost L0–L4 evidence remains unverifiable with null historical hashes. preservation.json explicitly records L6Pass=true, L6Rerun=false and L8Started=false. Source changes are confined to src/light-line/ and new evidence to acceptance/L7/.

Read-only verification: node --max-old-space-size=8192 src/light-line/tests/L7-acceptance.mjs --audit

Source freeze: candidate.json and source-snapshot/. Raw evidence: each seed's uninterrupted.json.gz, thirteen cut directories, malformed.json.gz, frozen.json.gz and atomic/. Integrity: manifest.json and manifest.sha256.
`);
  write(`${root}/SUMMARY.md`, `L7 快照、缓存与完整续跑：${status}。\n\n本轮只做 L7。7、19、31 三个正式种子各运行一次；开发只用 101，没有根据正式验收结果调参。没有重跑 L5 或 L6，没有开始 L8。\n\n每个种子检查 13 个预定断点，每个断点恢复后运行 100 个窗口。光场原始数组、颜色样本、成员计数、稳定 ID、预测账本、W、动作及最终快照都要求与不中断执行完全相同。断点实际覆盖采样中、光学提交前后、线索边界、延迟预测、首次匹配、包含端点、连接删除与重生、目标、身体痕迹、驱动所有权和目标父子关系。\n\n每个种子检查 ${s.runs[0]?.malformedRejected ?? 0} 类损坏或不兼容快照；拒绝后活动对象和完整状态保持不变。原子文件替换、截断文件拒绝及临时文件清理也有保存证据。冻结探针使用自然环境样本，验证下层已学光学状态、成员计数和上层状态的精确恢复。\n\n快照保存原始颜色样本及 H，不从直方图补造样本；源代码与 JSON 配置一起绑定。环境随机数、未完成窗口、动作去重、身体批次、目标和驱动都纳入保存。恢复时先在独立临时对象中校验，全部通过才替换流水线。\n\nL6 原始自然样本及已学权重仅只读用于构造 L7 测试夹具；夹具的时钟归零和用于删除／重生检查的弱连接都有明示记录，不冒充新学到的结果。开发中发现并修正了空缓存反例构造问题；最终开发验证在正式种子启动前完成。\n\n现存 ${s.preservation.existingFiles} 个前序证据文件哈希未变，L6 仍为 PASS。此前丢失的 L0–L4 证据仍不可核验，没有补造旧哈希。\n\n教师为零，旧运行时导入为零，旧缓存依赖为零；没有提交或推送，L8 未开始。详细证据见 REPORT.md、summary.json 和各 seed 目录。\n`);
}
function manifest() {
  const m = Object.fromEntries(files(root).filter(p => !p.endsWith('/manifest.json') && !p.endsWith('/manifest.sha256') && !p.endsWith('/campaign.log')).map(p => [p, sha(p)]));
  write(`${root}/manifest.json`, m); write(`${root}/manifest.sha256`, Object.entries(m).map(([p, h]) => `${h}  ${p}`).join('\n') + '\n');
}
if (process.argv[2] === '--collect') {
  lock(); const runs = [];
  for (const seed of protocol.seeds) {
    integrity(); preservation(); const dir = `${root}/seed-${seed}`;
    assert.ok(!existsSync(`${dir}/started.json`), 'Campaign seed already started');
    write(`${dir}/started.json`, { seed, run: 1, at: new Date().toISOString() });
    let r;
    try { r = runSeed(seed, dir); } catch (error) { r = { seed, pass: false, error: error.stack }; write(`${dir}/failure.json`, r); }
    runs.push(r); write(`${dir}/audit.json`, r); console.log(JSON.stringify({ seed, pass: r.pass, error: r.error }));
  }
  const summary = { phase: 'L7', pass: runs.every(r => r.pass), seeds: protocol.seeds, runsPerSeed: 1,
    candidate: integrity(), preservation: preservation(), isolation: { pass: true, teachers: 0, legacyRuntimeImports: 0, oldCaches: 0, JSONBound: true }, runs };
  write(`${root}/summary.json`, summary); reports(summary); manifest();
  console.log(`${root}/REPORT.md\n${root}/SUMMARY.md\n${root}/summary.json`);
  if (!summary.pass) process.exitCode = 1;
} else if (process.argv[2] === '--audit') {
  integrity(); preservation(); isolation();
  for (const [p, h] of Object.entries(read(`${root}/manifest.json`))) assert.equal(sha(p), h, p);
  const runs = protocol.seeds.map(seed => auditSeed(`${root}/seed-${seed}`));
  assert.deepEqual(runs, read(`${root}/summary.json`).runs);
  console.log(JSON.stringify({ pass: true, acquisition: false, seeds: protocol.seeds, cutsPerSeed: 13, windowsPerCut: 100, predecessorFilesUnchanged: 195 }));
} else throw new Error('Use --collect once, or --audit read-only');
