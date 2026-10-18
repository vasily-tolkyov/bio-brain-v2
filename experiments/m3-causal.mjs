import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FEATURES, stormWorld } from '../src/world.mjs';
import { GB_NMDA, STDP } from '../src/stdp.mjs';
import { LAYER1, LAYER2 } from '../src/layer.mjs';
import { STRONG_THRESHOLD, LIT_THRESHOLD } from '../src/readout.mjs';
import { advance, makePipeline, teachFeatures, weightProfile, describeAttractors } from './m3-pipeline.mjs';
import { saveLearnedPipeline } from './m4-learning.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';

const SEEDS = [7, 19, 31], TRIALS = 30, CLEAR_MARGIN = 0.05;
const PAIRS = [['lightning', 'thunder'], ['bird', 'thunder'], ['thunder', 'lightning']];
const keys = PAIRS.map(pair => pair.join('->'));
const peak = values => values.every(x => x === null) ? null : values.indexOf(Math.max(...values.filter(x => x !== null)));
const difference = (a, b) => a.map((x, i) => x === null || b[i] === null ? null : x - b[i]);
const fmt = x => x === null ? 'NA' : x.toFixed(4);
const started = performance.now(), timestamp = new Date().toISOString().replaceAll(':', '-');
const directory = fileURLToPath(new URL(`../out/m3/${timestamp}/`, import.meta.url));
const results = { timestamp, seeds: SEEDS, trialsPerWorld: TRIALS,
  protocol: {
    layer1: { n: 18, R: 3, ...LAYER1 }, layer2: { n: 27, R: 1, seedOffset: 30000, ...LAYER2 }, clearMargin: CLEAR_MARGIN,
    teacher: 'Isolated 500 ms presentations / 300 ms rests, rotating order, at most 12 epochs; stop at 3 complete attractors; settle 1000 ms.',
    timing: '100 ms P7 windows; timestamp at window start; exact 0.5 ms world edges; full continuous simulation, including gaps.',
    world: '30 trials; lightning onset U(0,10) s; causal thunder +3 s; shuffled thunder 3+U(0,10) s on an independent RNG stream. Bird probability 0.5, independent U(0,10) s onset. Durations 100/2000/200 ms. Each matched slot ends 20 s after the last event end across BOTH schedules (longer than M2 expiry 18.102 s).',
    control: 'Matched counts, durations, lightning, birds, trial boundaries, teacher state, topology and initial neural RNG states. Only thunder times change.',
    readout: 'Delta rho = end minus start of main phase, averaged over existing directed E→E edges in both directions. Missing pairs stay null. Initial existing edges all have rho=0.01, so subtraction does not change their argmax. Report paired causal-minus-shuffled delta per column.',
    dwell: 'No dwell normalization: rho is a bounded, nonlinear plastic state, not an event count. M2 bins and 100 ms input holding are unchanged; actual per-onset dwell is 0.1, 0.1, 0.1, 0.3, 0.6, 1.1, 2.3, 4.5, 9.1 s. Raw delta peaks are not assumed uniform under independence. Input exposure and joint exposure are recorded separately.',
    learning: `Layer 1 and layer-2 wall learn continuously. Layer-2 static STDP is enabled per 100 ms window only when the summed signed N-deviation trace (tau=${THREE_FACTOR.tauE} ms) exceeds ${THREE_FACTOR.kGate} analytic Poisson rest SDs. The spiking comparator runs from the first window, uncalibrated, with graded downward predictions and all three-factor channels online from zero. Fixed teacher IDs for P7. All layer constants are identical across features, columns and seeds. M10c protects dormant layer-2 synapses: all rho terms require presynaptic NMDA trace > ${STDP.preThreshold}; calcium/traces always advance. The active-pre calcium rule, M2 bins and P7 are unchanged. No tick skipping or trial resets.`,
    diagnosis: 'M3.1 replaces the 32 ms refractory workaround with a presynaptic-trace LTP gate for every directed synapse, retaining bidirectional coincidence learning. Strong 20/40/200 Hz post-only drive with silent pre cannot potentiate, even above thetaP; an expired trace cannot enable LTP either. Both layers use the normal 2 ms refractory period. Layer-2 afferent scale is reduced from 8 to 6 to keep disjoint inputs from potentiating through high-rate pre-only calcium; all other layer parameters are unchanged. The prior inhibitory integration fix and original bistable drift during silence remain. Replica traces, ID mapping, and independent flatten/baseline buffers are checked separately.',
    numerics: 'Every 0.5 ms tick is simulated. Constant source rates are cached without changing RNG draws, irrelevant iSTDP trace entries stay zero, and receptor/calcium tails below 1e-300 are flushed before entering slow IEEE subnormal arithmetic. A separate pre/post optimization comparison matched spikes, weights, RNG and all consequential state; only trace tails of at most 2e-322 differed. This comparison isolates the optimization from the inhibitory integration bug fix.',
    acceptance: 'All three causal L→T delta peaks must be col 6; causal col 6 must exceed matched shuffled L→T and causal bird→T by at least 0.05 rho (5% of full efficacy range) in every seed. Shuffled L→T and bird→T in each condition must not share one peak across all seeds. Layer 1 must retain its three exact teacher groups in every run; no layer-2 component may contain half or more of its E cells. Wall time <=30 min. These criteria are fixed before running.',
    thresholds: { strong: STRONG_THRESHOLD, lit: LIT_THRESHOLD }, GB_NMDA, STDP,
  }, runs: [] };

await mkdir(directory, { recursive: true });
console.log(`Results: ${directory}`);
for (const seed of SEEDS) {
  const teacher = teachFeatures(seed), ticks = teacher.layer.ticks;
  const initial = teacher.layer.replicas.map(r => r.net.saveState());
  const attractors = structuredClone(teacher.layer.attractors);
  console.log(`Seed ${seed}: teacher ${teacher.epochs} epochs, ${teacher.mapping.length} attractors`);
  for (const shuffled of [false, true]) {
    teacher.layer.replicas.forEach((r, i) => r.net.loadState(initial[i]));
    teacher.layer.ticks = ticks; teacher.layer.attractors = structuredClone(attractors);
    const pipeline = makePipeline(teacher, seed), world = stormWorld({ seed, count: TRIALS, shuffled });
    const baseline = pipeline.layer2.replicas.map(r => Array.from(r.EE.stdp.rho));
    const initialProfiles = Object.fromEntries(PAIRS.map(([a, b]) => [ `${a}->${b}`, weightProfile(pipeline, a, b) ]));
    const profilesNow = () => Object.fromEntries(PAIRS.map(([a, b]) => {
      const key = `${a}->${b}`, p = weightProfile(pipeline, a, b), rhoStart = initialProfiles[key].rho;
      const delta = difference(p.rho, rhoStart);
      return [key, { ...p, rhoStart, delta, argmax: peak(delta) }];
    }));
    const condition = shuffled ? 'shuffled' : 'causal', runStart = performance.now();
    const onsets = Object.fromEntries(FEATURES.map(g => [g, 0]));
    const exposure = Object.fromEntries(keys.map(key => [key, { pastMs: Array(9).fill(0), jointMs: Array(9).fill(0), nowMs: 0 }]));
    const coactive = new Set(), detectedThunder = new Set(), trialProfiles = [];
    const thunderEvents = world.events.filter(e => e.g === 'thunder');
    let completed = 0;
    while (pipeline.t < world.duration) {
      const { t, lines } = advance(pipeline, world);
      for (const g of FEATURES) if (lines[pipeline.line(g, 0)] > 0) onsets[g]++;
      for (const [a, b] of PAIRS) {
        const e = exposure[`${a}->${b}`], now = lines[pipeline.line(b, 0)] > 0;
        e.nowMs += now * 100;
        for (let col = 0; col < 9; col++) if (lines[pipeline.line(a, col)] > 0) {
          e.pastMs[col] += 100; e.jointMs[col] += now * 100;
        }
      }
      for (const e of thunderEvents) if (t <= e.start + 100 && t + 100 > e.start &&
          lines[pipeline.line('thunder', 0)] > 0) {
        detectedThunder.add(e.trial);
        if (lines[pipeline.line('lightning', 6)] > 0) coactive.add(e.trial);
      }
      if (completed < world.trials.length && pipeline.t >= world.trials[completed].end) {
        completed++;
        trialProfiles.push({ trial: completed, profiles: profilesNow() });
        if (completed % 5 === 0) console.log(`  ${condition} ${seed}: ${completed}/${TRIALS} trials, ${((performance.now() - runStart) / 1000).toFixed(1)} s; L→T delta ${trialProfiles.at(-1).profiles[keys[0]].delta.map(fmt).join(', ')}`);
      }
    }
    const profiles = profilesNow();
    saveLearnedPipeline(pipeline, baseline, seed, shuffled, (performance.now() - runStart) / 1000);
    results.runs.push({ seed, condition, teacher: { epochs: teacher.epochs, durationMs: teacher.durationMs,
      mapping: teacher.mapping }, simulatedMs: pipeline.t, world,
      eventCounts: Object.fromEntries(FEATURES.map(g => [g, world.events.filter(e => e.g === g).length])),
      detectedOnsets: onsets, thunderOnsetsDetected: detectedThunder.size,
      thunderOnsetsWithLightning6: coactive.size, profiles, trialProfiles, exposure,
      layer2Attractors: describeAttractors(pipeline), finalLayer1Attractors: pipeline.layer1.identify(),
      gate: { enabled: pipeline.learningWindows, windows: pipeline.t / 100, totalN: pipeline.totalN },
      wallSeconds: (performance.now() - runStart) / 1000 });
    await writeFile(`${directory}results.json`, `${JSON.stringify(results, null, 2)}\n`);
  }
}

results.paired = SEEDS.map(seed => {
  const causal = results.runs.find(r => r.seed === seed && r.condition === 'causal');
  const shuffled = results.runs.find(r => r.seed === seed && r.condition === 'shuffled');
  const forward = causal.profiles[keys[0]];
  return { seed, causalMinusShuffled: Object.fromEntries(keys.map(key =>
    [key, difference(causal.profiles[key].delta, shuffled.profiles[key].delta)])),
    causalCol6MinusBird: difference(forward.delta, causal.profiles[keys[1]].delta)[6],
    causalCol6MinusOther: forward.delta[6] === null ? null :
      forward.delta[6] - Math.max(...forward.delta.filter((x, i) => i !== 6 && x !== null)) };
});
const peaks = (condition, key) => results.runs.filter(r => r.condition === condition).map(r => r.profiles[key].argmax);
results.wallSeconds = (performance.now() - started) / 1000;
results.acceptance = {
  causalCol6EverySeed: peaks('causal', keys[0]).every(col => col === 6),
  col6MarginsEverySeed: results.paired.every(p => p.causalMinusShuffled[keys[0]][6] >= CLEAR_MARGIN && p.causalCol6MinusBird >= CLEAR_MARGIN),
  controlsNoConsistentPeak: [['shuffled', keys[0]], ['causal', keys[1]], ['shuffled', keys[1]]]
    .every(([condition, key]) => new Set(peaks(condition, key)).size > 1),
  layer1KeepsGroups: results.runs.every(r => JSON.stringify(r.finalLayer1Attractors) ===
    JSON.stringify(r.teacher.mapping.map(({ id, members }) => ({ id, members })).sort((a, b) => a.id - b.id))),
  layer2NoCollapse: results.runs.every(r => r.layer2Attractors.every(a => a.cellCount < 27 * LAYER2.cells / 2)),
  within30Minutes: results.wallSeconds <= 1800,
};
results.acceptance.pass = Object.values(results.acceptance).every(Boolean);
const table = [
  '| Seed | World | L→T Δrho col 6 | L→T peak | Bird→T Δrho col 6 | Bird→T peak | T→L peak | L@6 + T@0 onsets |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.runs.map(r => {
    const [f, b, rev] = keys.map(key => r.profiles[key]);
    return `| ${r.seed} | ${r.condition} | ${fmt(f.delta[6])} | ${f.argmax} | ${fmt(b.delta[6])} | ${b.argmax} | ${rev.argmax} | ${r.thunderOnsetsWithLightning6}/${TRIALS} |`;
  }),
].join('\n');
const profileTable = [
  '| Seed | World | Profile | Δrho, cols 0…8 | Peak |',
  '| --- | --- | --- | --- | --- |',
  ...results.runs.flatMap(r => keys.map(key => {
    const p = r.profiles[key];
    return `| ${r.seed} | ${r.condition} | ${key} | ${p.delta.map(fmt).join(', ')} | ${p.argmax} |`;
  })),
].join('\n');
const pairedTable = [
  '| Seed | Profile | Causal − shuffled Δrho, cols 0…8 |',
  '| --- | --- | --- |',
  ...results.paired.flatMap(p => keys.map(key => `| ${p.seed} | ${key} | ${p.causalMinusShuffled[key].map(fmt).join(', ')} |`)),
].join('\n');
const marginTable = [
  '| Seed | Col 6: causal − shuffled L→T | Col 6: causal L→T − bird→T | Causal col 6 − best other col |',
  '| --- | --- | --- | --- |',
  ...results.paired.map(p => `| ${p.seed} | ${fmt(p.causalMinusShuffled[keys[0]][6])} | ${fmt(p.causalCol6MinusBird)} | ${fmt(p.causalCol6MinusOther)} |`),
].join('\n');
const onsetTable = [
  '| Seed | World | Event counts L/T/B | P7 onset windows L/T/B | Layer-1 component sizes | Largest layer-2 component |',
  '| --- | --- | --- | --- | --- | --- |',
  ...results.runs.map(r => `| ${r.seed} | ${r.condition} | ${FEATURES.map(g => r.eventCounts[g]).join('/')} | ${FEATURES.map(g => r.detectedOnsets[g]).join('/')} | ${r.finalLayer1Attractors.map(a => a.members.length).join(', ')} | ${Math.max(0, ...r.layer2Attractors.map(a => a.cellCount))}/${27 * LAYER2.cells} |`),
].join('\n');
const report = `# M7 causal learning with surprise gate and presynaptic-gated LTP\n\nAcceptance: **${results.acceptance.pass ? 'PASS' : 'FAIL'}**. ` +
  `${TRIALS} trials/world × ${SEEDS.length} matched seeds × 2 conditions; ${(results.wallSeconds / 60).toFixed(2)} min (${results.wallSeconds.toFixed(2)} s).\n\n` +
  `${Object.values(results.protocol).filter(x => typeof x === 'string').join('\n\n')}\n\n` +
  `${table}\n\n${marginTable}\n\nChecks: ${JSON.stringify(results.acceptance)}\n\n${onsetTable}\n\n${profileTable}\n\n${pairedTable}\n\n` +
  `Layer-2 attractors (rho > ${STRONG_THRESHOLD}; feature@col):\n\n` +
  results.runs.map(r => `- ${r.seed} ${r.condition}: ${r.layer2Attractors.length ? r.layer2Attractors.map(a => `${a.cellCount} cells {${a.members.join(', ')}}`).join('; ') : 'none'}`).join('\n') +
  '\n\nJSON includes initial/final weight profiles, edge counts, per-trial profiles, input/joint exposure, teacher/final membership, detected onsets and event schedules. NA denotes absent wiring, never zero evidence.\n';
await writeFile(`${directory}results.json`, `${JSON.stringify(results, null, 2)}\n`);
await writeFile(`${directory}results.md`, report);
console.log(`\n${table}\n\n${marginTable}\n\nAcceptance: ${JSON.stringify(results.acceptance)}\nWall time: ${results.wallSeconds.toFixed(2)} s\nResults: ${directory}`);
process.exitCode = results.acceptance.pass ? 0 : 1;
