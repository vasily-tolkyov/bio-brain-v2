import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeRng } from '../src/core/rng.mjs';
import { actionsEnv, ACTION_WORLD } from '../src/envs/actions.mjs';
import { actionId } from '../src/io.mjs';
import { OUTPUT } from '../src/output.mjs';
import { actionPipeline, advanceActions } from './m8-pipeline.mjs';
import { weightProfile, describeAttractors } from './m3-pipeline.mjs';

const SEEDS = [7, 19, 31], TRIALS = 30, MARGIN = 0.05;
const COMMAND_GAP_MS = 400, WEAK_DRIVE = 0.001, WEAK_WINDOWS = 10;
const PAIRS = [[actionId('press'), 'light'], [actionId('wave'), 'bell'],
  [actionId('press'), 'bell'], [actionId('wave'), 'light'], ['bird', 'light']];
const keys = PAIRS.map(p => p.join('->'));
const peak = xs => xs.every(x => x === null) ? null : xs.indexOf(Math.max(...xs.filter(x => x !== null)));
const delta = (a, b) => a.map((x, i) => x === null || b[i] === null ? null : x - b[i]);
const fmt = x => x === null ? 'NA' : x.toFixed(4);
const started = performance.now(), timestamp = new Date().toISOString().replaceAll(':', '-');
const directory = fileURLToPath(new URL(`../out/m8/${timestamp}/`, import.meta.url));
const results = { timestamp, seeds: SEEDS, trials: TRIALS, protocol: {
  world: ACTION_WORLD, thetaExec: OUTPUT.thetaExec, margin: MARGIN,
  training: '30 slots, each with one teacher-driven press, wave and idle at random separated times in [0,10s). Each drive lasts 100ms. No trial resets or skipped neural ticks. Random onset streams for teacher, bird and shuffled outcomes are independent.',
  learning: 'Both teachers use isolated six-line groups, 500ms on / 300ms rest. Motor weights freeze after identification. Sensory and layer-2 wall learning continue; layer-2 EE uses existing STDP and the M7 N gate over all observation/action onsets. Graded predictions, STDP coupling, N, hit and M all learn online from zero.',
  readout: 'Existing bidirectional edge means and start-subtracted delta rho, exactly as M3; missing wiring stays null. Each condition starts from identical teacher states and layer-2 topology. Obs rows then action rows, each with 9 unchanged columns.',
  bins: 'Column 4: centre 800ms, [565.685,1131.371)ms; column 6: centre 3200ms, [2262.742,4525.483)ms. Timestamp convention is the 100ms window start.',
}, runs: [] };
await mkdir(directory, { recursive: true });
console.log(`Results: ${directory}`);

for (const seed of SEEDS) {
  const rng = makeRng(seed), schedule = new Map();
  // Rejection only prevents motor command overlap; independent of action identity.
  for (let trial = 0; trial < TRIALS; trial++) {
    const used = [];
    for (const action of ['press', 'wave', 'idle']) {
      let offset;
      do { offset = 100 * Math.floor(rng.uniform() * ACTION_WORLD.onsetSpanMs / 100); }
      while (used.some(t => Math.abs(t - offset) < COMMAND_GAP_MS));
      used.push(offset); schedule.set(trial * ACTION_WORLD.slotMs + offset, action);
    }
  }
  for (const shuffled of [false, true]) {
    const env = actionsEnv({ seed, count: TRIALS, shuffled }), p = actionPipeline(env, seed);
    const start = performance.now(), condition = shuffled ? 'shuffled' : 'causal';
    const initial = Object.fromEntries(PAIRS.map(([a, b]) => [`${a}->${b}`, weightProfile(p, a, b)]));
    const profilesNow = () => Object.fromEntries(PAIRS.map(([a, b]) => {
      const key = `${a}->${b}`, profile = weightProfile(p, a, b), rhoStart = initial[key].rho;
      const d = delta(profile.rho, rhoStart);
      return [key, { ...profile, rhoStart, delta: d, argmax: peak(d) }];
    }));
    const copies = [], observations = [], trialProfiles = [];
    const exposure = Object.fromEntries(keys.map(k => [k, Array(9).fill(0)]));
    let completed = 0;
    console.log(`Seed ${seed} ${condition}: sensory/motor teacher ${p.teacher.epochs}/${p.output.epochs} epochs`);
    while (p.t < env.duration) {
      const action = schedule.get(p.t), drive = new Float64Array(env.actions.length);
      if (action) drive[env.actions.indexOf(action)] = 1;
      const { t, lines, executed } = advanceActions(p, drive);
      for (const e of p.unroll.entries.filter(e => e.tOnset === t)) {
        if (typeof e.id === 'string') copies.push({ action: e.id.slice('action:'.length), t, strength: e.strength });
        else observations.push({ feature: p.mapping.find(a => a.id === e.id).feature, t, strength: e.strength });
      }
      assert.equal(executed.action, action ?? null, `Unintended or blocked teacher action at ${t}`);
      for (const [a, b] of PAIRS) for (let k = 0; k < 9; k++) {
        if (lines[p.line(a, k)] > 0 && lines[p.line(b, 0)] > 0) exposure[`${a}->${b}`][k]++;
      }
      if (p.t >= (completed + 1) * ACTION_WORLD.slotMs) {
        completed++; trialProfiles.push({ trial: completed, profiles: profilesNow() });
        if (completed % 5 === 0) console.log(`  ${condition} ${seed}: ${completed}/${TRIALS}, ${((performance.now() - start) / 1000).toFixed(1)} s; press@6=${fmt(trialProfiles.at(-1).profiles[keys[0]].delta[6])}, wave@4=${fmt(trialProfiles.at(-1).profiles[keys[1]].delta[4])}`);
      }
    }
    assert.deepEqual(copies.map(({ action, t }) => ({ action, t })), env.executed);
    assert.equal(copies.length, TRIALS * env.actions.length);
    const before = env.executed.length;
    let weakCopies = 0, maxWeakStrength = 0;
    for (let i = 0; i < WEAK_WINDOWS; i++) {
      const { t, executed } = advanceActions(p, new Float64Array(env.actions.length).fill(WEAK_DRIVE));
      weakCopies += p.unroll.entries.filter(e => e.tOnset === t && typeof e.id === 'string').length;
      maxWeakStrength = Math.max(maxWeakStrength, executed.strength);
    }
    results.runs.push({ seed, condition, profiles: trialProfiles.at(-1).profiles,
      teacher: { sensory: p.teacher.mapping, motor: p.output.mapping },
      finalSensory: p.layer1.identify(), finalMotor: p.output.layer.identify(),
      layer2Attractors: describeAttractors(p), trialProfiles, exposure, copies, observations,
      events: env.events, executed: env.executed,
      weak: { envActions: env.executed.length - before, copies: weakCopies, maxStrength: maxWeakStrength },
      gate: { windows: p.t / 100, enabled: p.learningWindows, N: p.totalN },
      wallSeconds: (performance.now() - start) / 1000 });
    await writeFile(`${directory}results.json`, `${JSON.stringify(results, null, 2)}\n`);
  }
}

results.paired = SEEDS.map(seed => {
  const causal = results.runs.find(r => r.seed === seed && r.condition === 'causal');
  const shuffled = results.runs.find(r => r.seed === seed && r.condition === 'shuffled');
  assert.deepEqual(causal.executed, shuffled.executed);
  for (const g of ['light', 'bell', 'bird']) assert.equal(causal.events.filter(e => e.g === g).length,
    shuffled.events.filter(e => e.g === g).length);
  const rules = [[0, 6], [1, 4]].map(([i, col]) => {
    const value = causal.profiles[keys[i]].delta[col];
    const shuffledValue = shuffled.profiles[keys[i]].delta[col];
    const controls = keys.slice(2).map(k => causal.profiles[k].delta[col]);
    return { key: keys[i], col, value, argmax: causal.profiles[keys[i]].argmax,
      shuffled: shuffledValue,
      shuffledMargin: value === null || shuffledValue === null ? null : value - shuffledValue,
      controlMargin: value === null || controls.includes(null) ? null : value - Math.max(...controls), controls };
  });
  return { seed, rules, pass: rules.every(r => Number.isFinite(r.shuffledMargin) &&
    Number.isFinite(r.controlMargin) && r.argmax === r.col &&
    r.shuffledMargin >= MARGIN && r.controlMargin >= MARGIN) };
});
results.wallSeconds = (performance.now() - started) / 1000;
results.acceptance = { rules: results.paired.every(p => p.pass),
  copies: results.runs.every(r => r.copies.length === TRIALS * 3 && r.executed.length === r.copies.length),
  subthreshold: results.runs.every(r => r.weak.envActions === 0 && r.weak.copies === 0) };
results.acceptance.pass = Object.values(results.acceptance).every(Boolean);
const table = ['| Seed | Rule | Peak | Causal Δrho | Shuffled Δrho | Margin vs shuffled | Min margin vs cross/bird controls |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...results.paired.flatMap(p => p.rules.map(r => `| ${p.seed} | ${r.key} | ${r.argmax} | ${fmt(r.value)} | ${fmt(r.shuffled)} | ${fmt(r.shuffledMargin)} | ${fmt(r.controlMargin)} |`))].join('\n');
const profiles = ['| Seed | World | Profile | Δrho columns 0…8 | Peak |', '| --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => keys.map(k => `| ${r.seed} | ${r.condition} | ${k} | ${r.profiles[k].delta.map(fmt).join(', ')} | ${r.profiles[k].argmax} |`))].join('\n');
const report = `# M8 action learning\n\nAcceptance: **${results.acceptance.pass ? 'PASS' : 'FAIL'}**. Wall time ${results.wallSeconds.toFixed(2)} s.\n\n` +
  `${Object.values(results.protocol).filter(x => typeof x === 'string').join('\n\n')}\n\n${table}\n\n` +
  `Every run: ${TRIALS * 3} executed actions and matching copies; weak-drive env actions/action onsets: ` +
  `${results.runs.map(r => `${r.seed} ${r.condition} ${r.weak.envActions}/${r.weak.copies}`).join(', ')}.\n\n${profiles}\n\n` +
  'JSON retains edge counts, baselines, per-trial profiles, joint exposure, actual events, every execution/copy, teacher/final groups and gate counts.\n';
await writeFile(`${directory}results.json`, `${JSON.stringify(results, null, 2)}\n`);
await writeFile(`${directory}results.md`, report);
console.log(`${table}\nAcceptance: ${JSON.stringify(results.acceptance)}\nWall time: ${results.wallSeconds.toFixed(2)} s\nResults: ${directory}`);
process.exitCode = results.acceptance.pass ? 0 : 1;
