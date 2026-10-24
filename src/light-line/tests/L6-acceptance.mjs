import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, appendFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { PROTOCOL } from './L6-protocol.mjs';
import { run } from './L6-run.mjs';
import { auditRun } from './L6-audit.mjs';

const root = 'out/light-line/acceptance/L6';
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? files(`${directory}/${e.name}`) : [`${directory}/${e.name}`]).sort();
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const write = (name, value) => {
  const path = `${root}/${name}`; mkdirSync(dirname(path), { recursive: true });
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  writeFileSync(path, name.endsWith('.gz') ? gzipSync(JSON.stringify(value)) : text);
};
const read = name => JSON.parse(name.endsWith('.gz') ? gunzipSync(readFileSync(`${root}/${name}`)) : readFileSync(`${root}/${name}`, 'utf8'));
function head() {
  const value = readFileSync('.git/HEAD', 'utf8').trim();
  if (!value.startsWith('ref: ')) return value;
  const ref = value.slice(5), loose = `.git/${ref}`;
  if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
  return readFileSync('.git/packed-refs', 'utf8').split('\n').find(line => line.endsWith(` ${ref}`))?.split(' ')[0];
}

function isolation() {
  const base = resolve('src/light-line'), imports = [];
  for (const path of files(base).filter(p => p.endsWith('.mjs'))) {
    const source = readFileSync(path, 'utf8');
    assert.ok(!/teacher|curricul/i.test(path), `Forbidden module: ${path}`);
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
      const spec = match[1]; if (spec.startsWith('node:')) continue;
      const target = resolve(dirname(path), spec);
      assert.ok(target.startsWith(base + '/') && existsSync(target), `${path}: ${spec}`);
      imports.push({ file: relative(process.cwd(), path), spec });
    }
    if (!path.includes('/tests/')) assert.ok(!/\bteachGroups\s*\(|\bSpikingNetwork\b|\bcreateRequire\b|\beval\s*\(/.test(source), path);
  }
  assert.ok(!existsSync('src/light-line-adapters'));
  assert.equal(sha('src/light-line/envs/two-quantities.mjs'), sha('src/envs/two-quantities.mjs'));
  return { pass: true, teacherModules: 0, teacherCalls: 0, legacyRuntimeImports: 0, imports,
    secondAdapterByteIdenticalLocalCopy: true, adaptersTree: false };
}

function preservation() {
  const baseline = read('session-start.json');
  const changed = Object.entries(baseline.files).filter(([path, hash]) => !existsSync(path) || sha(path) !== hash).map(([path]) => path);
  assert.deepEqual(changed, [], 'Pre-existing files changed');
  assert.equal(head(), baseline.head);
  assert.equal(sha('.git/index'), baseline.index);
  const priorFiles = Object.keys(baseline.files).filter(p => p.startsWith('out/light-line/'));
  return { pass: true, existingFiles: Object.keys(baseline.files).length, changed,
    existingEvidenceFiles: priorFiles.length, L5Pass: readFileSync('out/light-line/acceptance/L5/summary.json', 'utf8').includes('"pass": true'),
    L5Rerun: false, historicalL0toL4: { status: 'lost-before-this-session', verified: false, hashes: null },
    headUnchanged: true, indexUnchanged: true, commit: false, push: false, L7Started: false };
}

function freezeCandidate() {
  assert.ok(!existsSync(root), 'Refusing to overwrite or reacquire L6 campaign seeds');
  assert.equal(JSON.parse(readFileSync('out/light-line/acceptance/L5/summary.json')).pass, true);
  assert.equal(JSON.parse(readFileSync('/tmp/light-line-L6-development-101-audit.json')).pass, true);
  mkdirSync(root, { recursive: true });
  copyFileSync('/tmp/light-line-L6-start.json', `${root}/session-start.json`);
  for (const [source, target] of [
    ['development-101.json.gz', 'development/final-101.json.gz'],
    ['development-101-audit.json', 'development/final-audit.json'],
    ['development-initial.json.gz', 'development/initial-101.json.gz'],
    ['development-initial.log', 'development/initial.log'],
    ['development-dense.json.gz', 'development/dense-101.json.gz'],
    ['development-dense.log', 'development/dense.log'],
    ['development-sparse.json.gz', 'development/sparse-101.json.gz'],
    ['development-sparse.log', 'development/sparse.log'],
    ['development.log', 'development/final.log'],
    ['development-final-audit.log', 'development/independent-audit.log'],
    ['tests.tap', 'L6-tests.tap'],
  ]) {
    mkdirSync(dirname(`${root}/${target}`), { recursive: true });
    copyFileSync(`/tmp/light-line-L6-${source}`, `${root}/${target}`);
  }
  const source = Object.fromEntries(files('src/light-line').map(p => [p, sha(p)]));
  const design = Object.fromEntries(files('out/light-line/design').map(p => [p, sha(p)]));
  write('candidate.json', { fixedAt: new Date().toISOString(), protocol: PROTOCOL, source, design,
    policy: 'Seeds 7/19/31 once each; development 101 only; no campaign retune or rerun.',
    fixtureScope: 'Sparse independent sensory events (p=.1), actual recorded motor executions, body readings; no group schedules.',
    development: 'Initial dense p=.35 sensory sampling merged optical groups. Second-world .5 ms action samples lacked mature maps. Final recipe uses p=.1 and 10 ms recorded second-world execution observations. Core parameters and gates never changed.' });
  for (const p of [...Object.keys(source), ...Object.keys(design)]) {
    const target = `${root}/source-snapshot/${p}`; mkdirSync(dirname(target), { recursive: true }); copyFileSync(p, target);
  }
  write('import-isolation.json', isolation()); write('preservation.json', preservation());
}

function candidateIntegrity() {
  const c = read('candidate.json');
  assert.deepEqual(files('src/light-line'), Object.keys(c.source).sort());
  for (const [path, hash] of Object.entries({ ...c.source, ...c.design })) {
    assert.equal(sha(path), hash, `Changed candidate ${path}`);
    assert.equal(sha(`${root}/source-snapshot/${path}`), hash, `Changed snapshot ${path}`);
  }
  return { pass: true, sourceFiles: Object.keys(c.source).length, designFiles: Object.keys(c.design).length };
}

function resumePreflight() {
  assert.ok(PROTOCOL.seeds.every(seed => !existsSync(`${root}/seed-${seed}/started.json`)), 'A campaign seed already started');
  assert.ok(!existsSync(`${root}/preflight-repair.json`), 'Preflight repair already recorded');
  const c = read('candidate.json'), harness = 'src/light-line/tests/L6-acceptance.mjs';
  assert.deepEqual(files('src/light-line'), Object.keys(c.source).sort());
  for (const [path, hash] of Object.entries({ ...c.source, ...c.design })) {
    assert.equal(sha(`${root}/source-snapshot/${path}`), hash);
    if (path !== harness) assert.equal(sha(path), hash, 'Only the harness may change before seeds');
  }
  mkdirSync(`${root}/preflight-failure`, { recursive: true });
  copyFileSync(`${root}/candidate.json`, `${root}/preflight-failure/candidate.json`);
  copyFileSync(`${root}/source-snapshot/${harness}`, `${root}/preflight-failure/L6-acceptance.mjs`);
  copyFileSync('/tmp/light-line-L6-collection.log', `${root}/preflight-failure/error.log`);
  const repair = { at: new Date().toISOString(), seedsStarted: [], changedFile: harness,
    before: c.source[harness], after: sha(harness),
    reason: 'Sandbox rejected spawnSync git with EPERM during preservation preflight. Read HEAD/ref files directly instead. Model, protocol and seeds unchanged.' };
  c.source[harness] = repair.after; c.fixedAt = repair.at; c.preflightRepair = repair;
  copyFileSync(harness, `${root}/source-snapshot/${harness}`);
  write('preflight-repair.json', repair); write('candidate.json', c);
  write('import-isolation.json', isolation()); write('preservation.json', preservation());
}

function concise(audit) {
  if (!audit.pass) return audit;
  return { seed: audit.seed, pass: true, motors: audit.motors, episodes: audit.episodes,
    setpointActions: audit.setpointActions, bodyChanges: audit.bodyChanges, relief: audit.relief,
    rewards: audit.rewards, optics: { temporalPeak: audit.optics.temporalPeak,
      temporalMeanOccupancy: audit.optics.temporalMeanOccupancy,
      streams: audit.optics.streams.map(({ measured, ...s }) => s) },
    ledger: audit.ledger };
}

function reports(summary) {
  const status = summary.pass ? 'PASS' : 'REJECTED';
  const rows = summary.runs.filter(r => r.pass);
  const episodes = rows.flatMap(r => r.episodes.map(g => `| ${r.seed} | ${g.name} | ${g.correct}/10 |`)).join('\n');
  const relief = rows.flatMap(r => r.relief.map(x => `| ${r.seed} | ${x.cause} → ${x.target} | ${x.W} | ${x.F} | ${x.maxNoncausalW} | ${x.maxNoncausalF} | ${x.exactSingleEdgeWRatio} |`)).join('\n');
  write('REPORT.md', `# L6 action / body / drive — ${status}

L6 only. L5's remount-restored PASS was read and preserved; L5 was not rerun. No L7 work, commit or push. The candidate was locked before campaign seeds 7, 19, 31, each collected exactly once. Development used 101 only.

## Implementation

The new action pipeline executes the prior window's motor winner, sends it once to the environment at the first .5 ms sample, samples/batches sensory and body readings, measures actual physical B P7, emits one actual-action copy, updates the nine time copies and existing L5 predictor/three-factor ledger, satisfies goals, updates innate ownership, then computes the next motor drive. Motor P7 uses the original .75 gate and action-order ties. A held winner is suppressed until a different/subthreshold winner occurs.

ObservedStream annotates contrast-discovered mature fields with IO names. All frozen P7 integrates solved physical fields; no raw bin is read as evidence. BodyChanges requires a new decoded bin and a previous trace within 500 ms (tau 400 ms); expired attempts are retained separately as rejected evidence. Raw readings are used only for port encoding and the unchanged innate deficit writer. Relief ranking and external-goal ownership use live W objects. Binary N/M, .3 normalized rule gate, gain 3 and bounded goal recursion are unchanged.

ActionTemporal extends L3b's explicit visual port-to-cell entrance to the concatenated observed IO map: each (ID,k) has a distinct cell in one unchanged N=250 higher base. All nine TimeUnroll columns are retained, source strengths remain graded, and one .5 ms optical learning opportunity occurs on actual positive onsets. More than 27 IDs is capacity-rejected; no sharding, directed rho, growth counter or spike surface exists. Primary fixture has 21 IDs / 189 ports; the independent second world has 26 IDs / 234 ports. This is a declared L6 wiring extension, not a claim that the retired crowded L3 map passed.

## Fixed fixture scope and development

Natural ambient samples include independently drawn sensory events, recorded executed actions and body readings; they never call a group-training interface. The final 512-sample recipe uses sensory probability .1 and .5 ms observations. Second-world executed motor observations last 10 ms so the recorded actions support mature contrast readout. These observations are external fixtures, not reward or goal signals.

Development failures are preserved in development/: dense p=.35 concurrent sensory experience merged the sensory fields; initial short second-world action records had no mature motor readout. The final sparse event distribution and longer actual second-world motor observations were fixed on seed 101. Optical core parameters, comparator units and acceptance gates were not changed. Optical PASS is scoped to this recorded distribution and the isolated/mixed frozen controls; sustained dense concurrent formation is not claimed to pass.

The causal acquisition uses 48 bouts with seeded random action order and real delayed environment effects, 26,000 ms slots and action onset at 600 ms. Primary effects are press→light at 3200 ms, light→bell 800 ms later, wave→tone at 800 ms, nibble→+20 energy and eat→+40 at 800 ms. Each bout starts from an external body fixture at 30. All 62,400 windows are retained; the W store starts empty. There is no injected causal W or generated target teaching input. Optical channels and W remain separate.

## Motor / efference

Each seed contains 20 trials apiece at .75, .749, .001, a sustained winner and an equal-strength tie. Each trial has five driven windows. The first, sustained and tied cases have exactly one execution/copy onset per trial; the two weak cases have zero. The environment action log, output log and past onsets agree, and every action-sourced forecast has a same-window actual copy. This is direct event counting, not a rate inferred from spikes. L6-tests.tap additionally checks a cold motor and empty body catalogue.

## Goal and drive results

| Seed | Episode class | Correct first action and outcome |
| --- | --- | --- |
${episodes}

Every seed also observes setpoint for 10,000 ms with zero deficit-driven actions. Equal goals/counters use binary M/N; frozen goal episodes leave W unchanged. Body events carry decoded onset ID/strength, prior trace and exact age. Boundary fixtures reject raw-reading bypass, stale traces, same-source same-time birth and missing-target-history birth; distinct-time birth remains eligible. The .3 rule boundary and fixed temporal capacity are checked separately.

## Causal relief: single contributors and exact edges

| Seed | Causal edge | Exact W | Target F (unit source) | Max noncausal W | Max noncausal F | Exact W ratio |
| --- | --- | --- | --- | --- | --- | --- |
${relief}

Every actually produced positive relief magnitude is covered by a live causal rule with W/.1 > .3. All declared actions are probed at equal measured unit motor strength. F is the strongest single launched target contributor, never a sum. A zero noncausal denominator is explicitly represented as Infinity (positive numerator / zero); no finite ratio is fabricated. The separate W>=5×max-noncausal-W and F>=5×max-noncausal-F gates are both recomputed from raw edges/contributors.

## Reward independence and optics

Each seed runs off/on/positive/negative reward modes for 60,000 ms in both worlds (120,000 samples per mode). Raw sensory/body input hashes, each B-history window, each W state, optical-channel update hashes/final channels, actions and copies are exactly equal. Reward ranges and sample counts prove that reward actually changed. The second adapter is a byte-identical local copy of the independent pressure [-10,10], charge [0,200] environment; its names, setpoints, pump/connect effects and decay are retained, with no legacy runtime import.

${rows.map(r => `Seed ${r.seed}: temporal peak ${r.optics.temporalPeak}/250, mean temporal lit occupancy ${r.optics.temporalMeanOccupancy}; lower isolated/mixed maximum C′ ${Math.max(...r.optics.streams.map(s => s.maxCprime))}, blank light zero. Lower per-carrier peaks/occupancy: ${r.optics.streams.map(s => `${s.names.join('/')} per-carrier=${s.litPeak},${s.meanLitOccupancy}; simultaneous union=${s.unionLitPeak},${s.meanUnionOccupancy}; summed color occupancy peak=${s.colorLitPeak}`).join('; ')}.`).join('\n\n')}

Every proper lower-group mixture is probed, with exclusive-cell capacity checked before C′. Shared cells are reported explicitly. Isolated readout cannot span all groups. Counts are measured lit cells, not a <=6 acceptance cap. Time-layer area must remain <125, including reward replay; no growth-cap numbers are manufactured.

## Saved evidence and verification

Each seed's evidence.json.gz retains ambient samples, executed actions, physical optical witnesses, every W window/delta, body traces, episodes, probes and reward counterfactual hashes. audit.json independently reconstructs rho/H/sample learning and every W birth/hit/miss/clamp/generation. A separate field checker verifies source emissions, max-product residuals, paths and P7 directly from saved channels; it calls no production optical solver. Candidate source snapshots, source/design hashes, import closure and predecessor preservation are included.

Read-only verification (no recollection):

\`\`\`sh
node --max-old-space-size=8192 src/light-line/tests/L6-acceptance.mjs --audit
sha256sum -c out/light-line/acceptance/L6/manifest.sha256
\`\`\`

All ${summary.preservation.existingFiles} pre-existing files in the session baseline are unchanged, including all present L5 acceptance/design evidence. Historical L0–L4 trees were lost before this session: hashes remain null and verification false. Nothing here recreates or recertifies wiped historical evidence. Source edits are additions under src/light-line/ only; new evidence is confined to acceptance/L6/. Zero teachers; zero legacy runtime imports; no light-line-adapters; no commit/push; L7 not started.
`);
  write('SUMMARY.md', `L6 动作／身体／驱动闭环：${status}。

本次只完成 L6，没有重跑 L5，也没有开始 L7。先用开发种子 101 修正并验证，再锁定代码和样例；验收种子 7、19、31 各运行一次，没有根据验收结果调参或重跑。

${summary.pass ? '三个种子均通过。每个种子的直接目标、两步目标、身体缓解、缓解排序和外部目标覆盖均为 10/10。设定点连续观察 10,000 毫秒，没有缺口驱动动作。' : '至少一个验收项未通过，不能宣称 L6 已验收；具体失败见各种子的 audit.json。'}

运动亮度达到 0.75 才执行，0.749 和 0.001 不执行。每组直接计数 20 次；持续亮起只执行一次，每次实际执行只生成一个动作副本，未发送的动作不会进入过去或产生动作预测。平局保留原动作顺序。

身体变化来自真实光场 P7，而不是直接读取原始数值。每个变化都有已解码的档位起点和不超过 500 毫秒的旧痕迹。同来源同时发生、缺少目标历史、旧痕迹过期和空光学目录的负例均被拒绝；不同时间的有效情况仍能建立连接。

实际产生的两种缓解幅度都有强因果规则。目标预测亮度和单条 W 分别满足五倍门槛，没有把多条预测相加。非因果边为零时，报告明确写为正数除以零的无穷比值，不伪造有限数字。

两个独立环境都完成了奖励关闭、开启、正奖励、负奖励各 60,000 毫秒的回放。输入相同时，光场、光学通道、W、动作和副本完全一致。第二环境保留 pressure／charge 的独立名称、范围和物理效果。

光学检查覆盖空白、孤立和混合输入，记录实际亮细胞峰值及占用率，不使用旧的“最多六个脉冲”或虚构生长计数。开发中曾发现密集随机共现会合并感官图样，短动作记录不足以形成第二环境读出；失败证据已保留。最终通过范围是已锁定的稀疏自然样本和混合探针，不声称任意密集训练都通过。

原有 L5 及现存文件哈希保持不变。重挂载前丢失的 L0–L4 证据仍不可核验，没有补造旧哈希。代码只新增于 src/light-line/；本轮证据在 out/light-line/acceptance/L6/，详细说明见 REPORT.md，机器结果见 summary.json。

教师为零，旧运行时导入为零；没有创建 light-line-adapters，没有提交或推送，L7 未开始。
`);
}

if (['--collect', '--resume-preflight'].includes(process.argv[2])) {
  if (process.argv[2] === '--collect') freezeCandidate(); else resumePreflight();
  const metrics = [];
  for (const seed of PROTOCOL.seeds) {
    candidateIntegrity();
    assert.ok(!existsSync(`${root}/seed-${seed}/started.json`));
    write(`seed-${seed}/started.json`, { seed, run: 1, started: new Date().toISOString() });
    let audit;
    try {
      const raw = run(seed, message => {
        console.log(message); appendFileSync(`${root}/progress.log`, `${new Date().toISOString()} ${message}\n`);
      });
      write(`seed-${seed}/evidence.json.gz`, raw);
      audit = auditRun(raw);
    } catch (error) { audit = { pass: false, seed, error: error.stack }; }
    write(`seed-${seed}/audit.json`, audit);
    const metric = concise(audit); metrics.push(metric); write(`seed-${seed}/metrics.json`, metric);
    console.log(JSON.stringify({ seed, pass: metric.pass, episodes: metric.episodes, error: metric.error }));
  }
  const summary = { pass: metrics.every(r => r.pass), phase: 'L6', seeds: PROTOCOL.seeds, runsPerSeed: 1,
    candidate: candidateIntegrity(), isolation: { ...isolation(), imports: undefined }, preservation: preservation(), runs: metrics };
  write('summary.json', summary); reports(summary);
  const manifest = Object.fromEntries(files(root).filter(p => !p.endsWith('/manifest.json') && !p.endsWith('/manifest.sha256')).map(p => [p, sha(p)]));
  write('manifest.json', manifest);
  write('manifest.sha256', Object.entries(manifest).map(([p, hash]) => `${hash}  ${p}`).join('\n') + '\n');
  console.log(`${root}/REPORT.md\n${root}/SUMMARY.md\n${root}/summary.json`);
  if (!summary.pass) process.exitCode = 1;
} else if (process.argv[2] === '--audit') {
  candidateIntegrity(); preservation(); isolation();
  for (const [p, hash] of Object.entries(read('manifest.json'))) assert.equal(sha(p), hash, p);
  const audits = PROTOCOL.seeds.map(seed => concise(auditRun(read(`seed-${seed}/evidence.json.gz`))));
  console.log(JSON.stringify({ pass: audits.every(a => a.pass), acquisition: false, runs: audits }, null, 2));
} else throw new Error('Use --collect once or --audit read-only');
