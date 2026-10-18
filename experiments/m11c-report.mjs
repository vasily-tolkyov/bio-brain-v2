/** Assemble evidence without altering any learned state or acceptance criterion. */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { DOWNWARD } from '../src/downward.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';
import { GOALS } from '../src/goals.mjs';
const root = 'out/m11c-graded', seeds = [7, 19, 31];
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const f = x => Number.isFinite(x) ? x.toFixed(6) : x === Infinity ? '∞' : '—';
const pct = x => Number.isFinite(x) ? `${(100 * x).toFixed(2)}%` : '—';
const link = (title, file) => `[${title}](../${file})`;
const text = [], add = (...s) => text.push(...s.flatMap(x => [x, '']));
const table = (heads, rows) => text.push(`| ${heads.join(' | ')} |`, `| ${heads.map(() => '---').join(' | ')} |`,
  ...rows.map(r => `| ${r.join(' | ')} |`), '');
function reports(name) {
  const directory = `${root}/${name}`;
  if (!existsSync(directory)) return [];
  return readdirSync(directory).sort().flatMap(sub => {
    const file = `${directory}/${sub}/results.json`;
    if (!existsSync(file)) return [];
    const r = json(file);
    return r.wallSeconds === undefined ? [] : r.runs.map(run => ({ ...run, file, reportWall: r.wallSeconds }));
  });
}
const latest = xs => seeds.map(seed => xs.filter(r => r.seed === seed).at(-1)).filter(Boolean);
const readouts = seeds.map(seed => ({ file: `${root}/readout/${seed}.json`, seed })).filter(r => existsSync(r.file)).map(r => ({ ...json(r.file), file: r.file }));
const m5 = latest(reports('m5')), m9 = latest(reports('m9')), m10 = latest(reports('m10'));
const m6 = seeds.flatMap(seed => { const file = `${root}/m6-${seed}/results.json`; return existsSync(file) ? json(file).runs.map(r => ({ ...r, file })) : []; });
const natural = seeds.flatMap(seed => { const file = `${root}/m11a/${seed}.json`; return existsSync(file) ? [{ ...json(file), file }] : []; });
// Supervisor: C60/A >= 0.85 is a hard check inherited from accepted M7. True-rule
// stability (last-20 slope) is reported only; it was never a supervisor criterion.
for (const r of m6) { r.checks.recovery = r.retention.C60_over_A >= 0.85; r.pass = Object.values(r.checks).every(Boolean); }
for (const r of natural) { delete r.checks.trueStable; r.checks.falseTrend = Object.values(r.trend).every(x => x < 0); }
const complete = [readouts, m5, m6, m9, m10, natural].every(xs => xs.length === 3);
const pass = complete && readouts.every(r => r.M3.pass && r.M4.pass && r.M8.pass) && [...m5, ...m6, ...m9, ...m10, ...natural].every(r => r.pass);
add('# M11c — design-faithful graded prediction', `**${complete ? pass ? 'PASS' : 'FAIL' : 'INCOMPLETE'}**. Branch \`m11c-graded\`; no commit, branch switch or push. The authoritative design and gate5 comparator circuit are unchanged. Behavioral failures below are retained; no new gate, threshold, normalization, admission step or scene-specific parameter was added.`);
add('Measured failures include STDP contrast, residual chance-rule mass, false-goal actions, and the all-channel mixed hit/miss bound. Parameters were fixed after the initial pilot; failures were not followed by mechanism changes or scenario-specific tuning.');
add('## Implementation and parameter choice',
  `Layer 2 uses w_max=${DOWNWARD.wMax}, kappa=${DOWNWARD.kappa}, eta_N=${THREE_FACTOR.etaByLayer[2]}, eta_M=${THREE_FACTOR.etaMissByLayer[2]}, eta_hit=${THREE_FACTOR.etaHitByLayer[2]}, E0=100, tau=400 ms, and goal gain=${GOALS.gain}. These constants are shared by every seed/world/feature/column.`,
  'The cap 0.1 was selected as an initial layer-scale candidate from the earlier learned-rule order of magnitude, then retained after the seed-7 storm/action pilot produced true W=0.077942/0.069765/0.068405 (ratios 0.779420/0.697650/0.684051). No parameter sweep or per-scene fit was performed. Eta_M is five times eta_N; kappa=0.05 limits the additional co-occurrence channel. Goal gain 3 gives unit drive at half-saturated goal error and W/w_max≈2/3, without changing the motor threshold 0.75.',
  'All cross-row A≠B, k=1…8 weights start at zero. Each 100 ms window applies N/M/hit to the shared W objects, then runs the unchanged surprise-gated layer-2 STDP and adds kappa times the positive change of the directed mean rho. The previous association measurement is bookkeeping only; negative rho changes never weaken W. Only M weakens. Diagnostic cumulative deltas never feed learning.',
  'Predictions carry strength=onset×W/w_max and activation=onset. Per-prediction deadline eligibility traces activation, avoiding W being counted twice. The absolute W floor 1e-4 is only a prediction-scheduling optimization: N, STDP coupling, U and subgoal selection never use it. There is no threshold/library/admission state. U uses the same W objects; observation argmax expands independently of direct action weights. Pending goal-M is multiplied by 1−pending strength.',
  'Every world/teacher/continuation phase uses the shared online learner, including comparator afferent-gated iSTDP. No initial comparator calibration was inserted before rule learning. M5 separately calibrates its frozen-teacher diagnostic comparator using the existing schedule and criteria. Its slots are 25 s to include all eight graded prediction deadlines and clear the 18.1 s past horizon; arrival centres and ±500 ms tolerance are unchanged. All predictions enter the comparator; the matched-trial statistic tracks the strongest learned lightning→thunder rule, while complete created entries and raw windows remain in JSON.',
  'M11b lessons were read from git show m11b-graded-attempt:docs/m11b-correction.md. Its fixed scale 1, strength-based eM, symmetric rates, frozen teacher three-factor path and insufficient motor gain are not retained. Existing gate5 signed deviations, analytic 3σ deadbands, hit consumption and single hit payment remain intact.');
add('## M3: unchanged STDP readout');
table(['Seed', 'Peak', 'Causal Δrho@6', 'Margin shuffled', 'Margin bird', 'Layer 1 intact', 'Pass'], readouts.map(r => [r.seed,r.M3.peak,f(r.M3.causal),f(r.M3.shuffledMargin),f(r.M3.birdMargin),r.M3.intact,r.M3.pass]));
add('## M4: graded predictions', 'Single-column acceptance compares causal column 6 with the maximum control column. Total ratios sum all columns and are diagnostic. Strengths use actual lightning/bird probe onsets.');
table(['Seed','True strength@3200','Max shuffled','Max bird','Single C/S','Single C/B','Total C/S','Total C/B','Measured arrival ms','Pass'],readouts.map(r=>[r.seed,f(r.M4.trueStrength),f(Math.max(...r.M4.columns.shuffled)),f(Math.max(...r.M4.columns.bird)),f(r.M4.singleShuffledRatio),f(r.M4.singleBirdRatio),f(r.M4.totalShuffledRatio),f(r.M4.totalBirdRatio),f(r.storms[0].trials.flatMap(t=>t.arrivals).filter(e=>e.A===r.storms[0].mapping.find(a=>a.feature==='lightning').id&&e.B===r.storms[0].mapping.find(a=>a.feature==='thunder').id&&e.k===6).reduce((n,e,_,xs)=>n+(e.observedAt-e.tOnset)/xs.length,0)),r.M4.pass]));
const columns=[];
for(const r of readouts) for(const world of r.M4.tables){
 const names=new Map(world.mapping.map(a=>[a.id,a.feature]));
 for(const A of names.keys())for(const B of names.keys())if(A!==B) columns.push([r.seed,world.shuffled?'shuffled':'causal',`${names.get(A)}→${names.get(B)}`,...Array.from({length:8},(_,i)=>f(world.weights.find(w=>w.A===A&&w.B===B&&w.k===i+1).W))]);
}
add('Full learned downward W table (absolute weights, all directed pairs):');table(['Seed','World','Pair',...Array.from({length:8},(_,i)=>i+1)],columns);
add(...readouts.map(r=>link(`Seed ${r.seed}: all M3/M4/M8 profiles, onsets and arrivals`,r.file)));
add('## M5: gate5 criteria with learned graded rules');
table(['Seed','Calibration trials / pass','Frozen matched silence','−500 / +500 silence','Unexpected Neff','Omitted Meff','Paired N / M','Weak deadband','All checks'],m5.map(r=>[r.seed,`${r.calibration.history.length} / ${r.calibration.converged}`,pct(r.frozenMatchedSummary.quietFraction),[-500,500].map(x=>pct(r.hitTables.find(t=>t.condition===x)?.quietFraction)).join(' / '),f(r.averages.unpredicted.Neff),f(r.averages.omitted.Meff),`${f(r.averages.paired.Neff)} / ${f(r.averages.paired.Meff)}`,r.checks.weakDeadband,r.pass]));
add(...m5.map(r=>`${link(`Seed ${r.seed}`,r.file)}: ${JSON.stringify(r.checks)}. All per-offset, weak-response and rest statistics are in this artifact.`));
add('## M6/M7: extinction, recovery, jitter', 'All learning channels remain on. D and E restore the exact full end-A state, including both layers, comparator, RNGs, W and eligibility. This is an experiment branch, never rule admission.');
table(['Seed','A W','B60/A','Trials to 50% / 10%','C30/A','C60/A','Jitter/A','Checks'],m6.map(r=>[r.seed,f(r.phases[0].trajectory.at(-1)),pct(r.retention.B_over_A),[r.retention.half,r.retention.tenth].map(x=>x<0?'>60':x).join(' / '),pct(r.retention.C30_over_A),pct(r.retention.C60_over_A),pct(r.retention.D_over_A),JSON.stringify(r.checks)]));
for(const r of m6)add(`Seed ${r.seed}, full B0…B60 W: ${r.phases.find(p=>p.name==='B').trajectory.map(f).join(', ')}.`,link(`All A/B/C/D/E trajectories and per-trial channel deltas, seed ${r.seed}`,r.file));
add('## Hard asymmetry', 'The equal-W, equal-eligibility unit test uses W/w_max=0.8 and N=M=E0, with actual 100 ms layer-2 co-activity and its measured STDP coupling. Total strengthening/miss loss is 0.373550 (seed 7); hit-only is 0.010000. The same unit checks give total ratios 0.164926/0.063311 for seeds 19/31. No assumed co-occurrence gain enters this unit test.', 'M7b alternates 15 hits and 15 misses, starting from end A. Gain/loss includes every learning channel; hit-only is separately accumulated. A negative last-10-trial slope is used to check continuing downward trend.');
table(['Seed','Start → end W','Net weakening','Hit gain','Miss loss','Total ratio ≤0.5','Hit-only ≤0.2','Full / last10 slope','Pass'],m6.map(r=>{const m=r.mixed;return[r.seed,`${f(m.start)} → ${f(m.end)}`,pct(m.relativeWeakening),f(m.meanHitGain),f(m.meanMissLoss),f(m.totalRatio),f(m.hitOnlyRatio),`${f(m.slope)} / ${f(m.last10Slope)}`,r.checks.asymmetry];}));
add('## M8: unchanged STDP readout', 'Each causal/shuffled teacher is replayed with all learning enabled, recording executions and efference copies. The causal replay must reproduce its full cached downward state exactly.');table(['Seed','Rule','Peak','Margin shuffled','Margin cross/bird','Executions / copies','Weak actions','Pass'],readouts.flatMap(r=>r.M8.rules.map((p,i)=>[r.seed,i?'wave→bell':'press→light',p.peak,f(p.shuffledMargin),f(p.controlMargin),r.M8.runs.map(x=>`${x.executions}/${x.copies}`).join('; '),r.M8.runs.map(x=>x.weakExecutions).join('/'),r.M8.pass])));
function goals(name,runs){add(`## ${name}`);table(['Seed','Goal','Correct first','Achieved','Actions','Extra/probe','Max actions/probe','Distractors'],runs.flatMap(r=>(r.summaries??r.goals.summaries).map(s=>[r.seed,s.kind,pct(s.correctFirst??s.pressFirst),pct(s.achieved??s.satisfied/s.probes),s.actions,f(s.extraActionsPerProbe??r.trials.filter(t=>t.kind===s.kind).reduce((n,t)=>n+Math.max(0,t.actions.length-1),0)/s.probes),s.actionsEach?Math.max(...s.actionsEach):s.maxActions,s.distractors])));add(...runs.map(r=>link(`Seed ${r.seed}: raw goal windows`,r.file)));}
goals('M9 direct goals',m9);goals('M10 recursive goals',m10);
add('## M11a: 60 natural-world trials, continued online learning', 'All 237 non-causal rules are included, including zeros and every action/bird pair. Only press→light@6, light→bell@4 and valid transitive press→bell@6 are excluded. Slopes below use normalized W/w_max; true-rule slopes use the final 20 trials. Stability and recovery are reported numerically for supervisor assessment; no new numerical cutoff is imposed.');
table(['Seed','Final non-causal mean','p95','max ≤0.1','Mean / p95 / max slope per trial','Checks'],natural.map(r=>{const d=r.distributionHistory.at(-1);return[r.seed,f(d.mean),f(d.p95),f(d.max),['mean','p95','max'].map(k=>f(r.trend[k])).join(' / '),JSON.stringify(r.checks)];}));
table(['Seed','True rule','Final W/w_max','Last20 mean','Last20 slope/trial','Equal-credit hit-only/miss at E0'],natural.flatMap(r=>r.trueRules.map(w=>[r.seed,w.ruleKey,f(w.ratio),f(w.last20Mean),f(w.last20Slope),f(0.005*(1-w.ratio)/(0.25*0.5*w.ratio))])));
const csv=['seed,A,B,k,causal,peak,peak_trial,half_trial,half_since_peak,tenth_trial,tenth_since_peak,final_W,final_ratio,last20_slope'];
for(const r of natural)for(const w of r.rows)csv.push([r.seed,w.A,w.B,w.k,w.causal,w.peak,w.atPeak,w.half?.trial??'',w.half?.sincePeak??'',w.tenth?.trial??'',w.tenth?.sincePeak??'',w.W,w.ratio,w.last20Slope].join(','));
writeFileSync(`${root}/rule-decay.csv`,csv.join('\n')+'\n');
add(link('Every rule: peak, time to 50%/10%, final W and final ratio',`${root}/rule-decay.csv`), 'Crossings are measured after each rule’s global within-continuation peak (sampled every 100 ms). Blank crossings mean not reached within the 60 trials. Full trajectories remain in the per-seed JSON.');
table(['Seed','Trial','Non-causal mean','p95','max'],natural.flatMap(r=>r.distributionHistory.map(d=>[r.seed,d.trial,f(d.mean),f(d.p95),f(d.max)])));
add('## Strongest false-rule decomposition', 'Strongest means maximum W reached over the continuation, including the initial boundary. Totals are actual cumulative channel deltas; clamp corrections are shown separately.');
table(['Seed','Rule','Period','STDP coupling','N','M','Hit','Clamp'],natural.flatMap(r=>[['lifetime',r.strongestFalse.deltas],['continuation',r.strongestFalse.continuationDeltas]].map(([period,d])=>[r.seed,r.strongestFalse.ruleKey,period,...['STDP','N','M','hit','clamp'].map(k=>f(d[k]))])));
goals('M11a frozen goal probes',natural);
for(const r of [...m10,...natural].filter(r=>r.seed===19)){
 const g=r.goals??r, bells=g.trials.filter(t=>t.kind==='bell'), presses=bells.flatMap(t=>t.actions.filter(a=>a.action==='press'));
 const extras=bells.reduce((n,t)=>n+Math.max(0,t.actions.length-1),0);
 add(`Seed-19 over-pressing (${r.goals?'after M11a':'M10'}): ${presses.length} presses and ${extras} extra actions across ${bells.length} bell probes (${f(extras/bells.length)} extra/probe). See raw windows for graded pending strengths and effective goal-M.`);
 const light=json(`${root}/m10-cache/19.json`).mapping.find(a=>a.feature==='light').id;
 const repeated=[];
 for(const trial of bells){
  const firstLight=trial.windows.find(w=>w.onsets.some(o=>o.id===light))?.t??Infinity;
  for(const action of trial.actions.filter(a=>a.action==='press').slice(1))if(action.t<firstLight){
   const i=trial.windows.findIndex(w=>w.t===action.t), prev=trial.windows[i-1];
   const c=prev?.goalCounts.find(c=>c.id===light);
   repeated.push({repeat:trial.repeat,t:action.t,pending:c?.pendingStrength,effective:c?.effective});
  }
 }
 add(`${repeated.length} repeated presses occur before the first light onset; ${repeated.filter(x=>x.pending>0&&x.effective>0).length} have positive pending light strength and positive effective goal-M in the preceding drive window. Examples: ${JSON.stringify(repeated.slice(0,3))}.`);
}
add('## Diagnosis and stopping boundary',
 'Correct predictions close the unchanged layer-2 surprise gate during teaching. Causal/shuffled storm gate-open windows are 472/658, 500/672 and 450/652, respectively. Causal peaks survive, but the unchanged STDP margin requirements fail. This is consistent with learning shifting into N/hit before the layer-2 association readout reaches its former separation.',
 'The event-level unit bound does not imply the full 30-trial bound. As W falls, miss loss scales with W and the weaker prediction’s Meff, while N and hit retain headroom w_max−W. All three mixed runs have downward slopes and large net weakening, yet total gain/loss remains above 0.5. Chance events keep replenishing false rules; their cumulative N/STDP/hit and M totals are exposed above.',
 'Summing weak columns through fixed-gain U can still execute false goals. For example, seed-7 M8 normalized action→bird sums are press 0.504071, wave 0.415609 and idle 0.568982; these are substantial summed drives despite individually weak rules. Graded pending suppression also leaves residual motor drive, explaining repeated executions in the saved windows.',
 'The transitive press→bell delay is 3000+1000=4000 ms. It occupies past column 6, but the unchanged future centre is 3200 ms and the deadline is 3700 ms. The outcome is outside that prediction’s tolerance. Seed 7’s natural continuation transitive delta is N +0.007015, M −0.004265, STDP 0, hit 0; its final ratio is only 0.028473. No timing mechanism was changed to compensate.',
 'The true-rule endpoints and last-20 slopes are finite-run estimates, not proof of equilibrium. Behavioral acceptance is failed and awaits supervisor judgment. No extra mechanism or scenario-specific parameter was introduced to repair these failures.');
add('## Wall times and verification', link('Cache provenance and channel-accounting audit', `${root}/audit.json`));
const timings=[];
for(const seed of seeds)for(const [name,file]of[['M4 causal',`${root}/m4-cache/${seed}-causal.json`],['M4 shuffled',`${root}/m4-cache/${seed}-shuffled.json`],['M8 causal',`${root}/m8-cache/${seed}-causal.json`],['M10 T1/T2',`${root}/m10-cache/${seed}.json`]])if(existsSync(file))timings.push([seed,name,f(json(file).trainingSeconds)]);
for(const [name,runs]of[['M3/M4/M8 readout',readouts],['M5',m5],['M6/M7/M7b',m6],['M9',m9],['M10 probes',m10],['M11a + probes',natural]])for(const r of runs)timings.push([r.seed,name,f(r.wallSeconds??r.reportWall)]);
table(['Seed','Run','Wall seconds'],timings);
if(existsSync(`${root}/tests.txt`)) {
  const output=readFileSync(`${root}/tests.txt`,'utf8'), counts=[...output.matchAll(/^(\d+)\/(\d+) checks passed/gm)];
  add(`${counts.reduce((n,m)=>n+Number(m[1]),0)}/${counts.reduce((n,m)=>n+Number(m[2]),0)} checks passed.`,
    link('Full npm test output',`${root}/tests.txt`), link('Measured test wall time',`${root}/tests-time.txt`), 'The fast suite checks implementation invariants; it does not replace the failed long behavioral acceptance above.', output.trim().split('\n').slice(-4).join('\n\n'));
}
const elapsed=(Date.now()-statSync(`${root}/pilot-storm-7.log`).birthtimeMs)/1000;
add(`Experiment/report elapsed wall time: ${f(elapsed)} s (${f(elapsed/60)} min). Independent foreground terminal processes overlap, so individual wall times must not be added.`,
  'Reproduce per seed (7/19/31): node experiments/m4-learning.mjs SEED; node experiments/m8-cache.mjs SEED; node experiments/m10-cache.mjs SEED; node experiments/m11c-readout.mjs SEED; node experiments/m5-errors.mjs SEED; node experiments/m6-calibrate.mjs SEED; node experiments/m9-goals.mjs SEED; node experiments/m10-goals.mjs SEED; node experiments/m11a-extinction.mjs SEED. Finally npm test and node experiments/m11c-report.mjs. Fresh caches have source signatures; historical caches are not accepted.',
  'Changed code: src/downward.mjs and src/learning.mjs; prediction, three-factor and goal consumers; removal of layer downNoiseK; online experiment/cache adapters and graded verification. Added M11a continuation/measurement files, M11c readout/report scripts and this report; README notes the current implementation. The unused frozen M6 cache was removed. SUPERVISION.md was changed externally during this session and was not edited here.');
writeFileSync('docs/m11c-graded.md',text.join('\n')+'\n');
console.log(JSON.stringify({complete,pass,readouts:readouts.length,m5:m5.length,m6:m6.length,m9:m9.length,m10:m10.length,natural:natural.length,elapsed}));
