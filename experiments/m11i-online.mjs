/** M11i: predeclared continuous online continuation. Only experiment scheduling and
 * observational reporting are new. No runtime, parameter, timeout or freezing edits.
 * prepare seals all 3 complete schedules before any neural continuation starts.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { makeRng } from '../src/core/rng.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = resolve(ROOT, 'out/m11i-online');
const INITIAL = resolve(ROOT, 'out/m11h-fresh/seed-7/storm-causal');
const mode = process.argv[2] ?? '--plan';
const environmentSeed = Number(process.argv[3] ?? 7), phase = process.argv[4] ?? 'discrimination';
const seed = 7; // Neural training and restored RNG states are ALWAYS seed 7.
const ENV_SEEDS = [7, 19, 31], PHASES = ['discrimination', 'omission', 'recovery'];
const SLOT_MS = 25000, ACTION_THRESHOLD = 0.3;
const PLAN = {
 schema: 'm11i-online-plan-v1', trainingSeed: seed, environmentSeeds: ENV_SEEDS,
 initial: 'out/m11h-fresh/seed-7/storm-causal/state.json',
 stages: { discrimination: { paired:20, birdControl:10 }, omission: { omission:15 }, recovery: { paired:20, birdControl:10 } },
 slotMs: SLOT_MS, totalSlotsPerSequence:75,
 schedule: 'Precomputed Fisher-Yates order. Separate RNG streams for order, flash, background bird, control bird. Flash uniformly 1..5s, thunder +3s for 2s. Independent background bird uniformly 0..20s in EVERY flash slot. Bird controls uniformly 1..5s for 200ms, no scheduled thunder in their slots. No suppression of coincident events, no event-dependent rescheduling. Cross-slot comparisons remain live.',
 continuity: 'Within each sequence, all stages resume the exact prior full state, including neurons, conductance, traces, RNG, past/future and pending learning ledger. No resets, rest insertions or frozen probes. Between environment seeds clone the same original trained state. These are not independent training seeds.',
 learning: 'Use normal advance/learnWindow throughout: sensory rhoSTDP, layer-2 rhoSTDP, N and downward learning. Preserve original activity-dependent N iSTDP gating; no experimental total freeze.',
 criteria: {
  integrity: 'Source/input hashes unchanged; normal all-channel online call path; exactly 250 windows per slot and full schedule completed.',
  directMiss: 'For each live positive-activation unmatched prediction at its actual deadline, miss ledger equals original sequential missDelta; no matched instance charged. Deletion W exactly zero; no generation resurrection or cross-generation transfer. Arithmetic observation tolerance 1e-12, not a runtime threshold.',
  discrimination: 'Preexisting strongest bird->thunder generation must be deleted by fixed discrimination endpoint. At discrimination and recovery endpoints retain old true@6/max-bird ratio >=5 and separately report all bird->thunder edges below provisional action threshold .3.',
  exposure: 'Each of the 10 declared bird-control slots in discrimination/recovery must contain a decoded bird onset; otherwise bird-control exposure criterion fails, not assumed from physical input. Report all actual predictions, matches and right-censored generations.',
  omission: 'True@6 generation present at omission start must be deleted by the fixed 15-slot endpoint; do not substitute another generation or a 90% decrease.',
  recovery: 'At fixed recovery endpoint, true@6 weight >=85% of omission-start weight. This reuses the old 85% retention number with 20 paired events, NOT the old 60-event full acceptance.',
  prediction: 'Last 10 predeclared paired slots of discrimination/recovery: true@6 must emit a forecast arriving within +/-500ms of physical thunder onset in >=90% of slots; report actual ledger match fraction >=90% separately. No frozen measurement windows.',
  aggregate: 'Report each check and each stage; bounded online acceptance requires all applicable predeclared checks across all three sequences, except provisional action-gate eligibility which is descriptive only. Initial/transient failures remain in trajectories. No full action acceptance or performance recheck is implied.'
 },
 limits: 'Passive storm world has no motor primitive or goal loop. Action gate is reported as per-edge numerical eligibility only; no false-action claim. This does not replace independent training seeds, a full action curriculum, indefinite stability or the prior M2 speed failure.'
};
const hash = b => createHash('sha256').update(b).digest('hex');
const clone = x => structuredClone(x);
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]);
const names = [...walk(resolve(ROOT,'src')).filter(f=>f.endsWith('.mjs')).map(f=>relative(ROOT,f)), 'experiments/m3-pipeline.mjs','experiments/m11i-online.mjs','package.json'].sort();
const sourceBytes = new Map(names.map(n=>[n,readFileSync(resolve(ROOT,n))]));
const sourceHashes = Object.fromEntries([...sourceBytes].map(([n,b])=>[n,hash(b)]));
const unchanged = () => names.filter(n=>hash(readFileSync(resolve(ROOT,n)))!==sourceHashes[n]);
const parse = file => JSON.parse(readFileSync(file));
const inputs = [];
function sealed(base, name, expectedSchema) {
 const mb=readFileSync(resolve(base,'artifact-manifest.json')), seal=parse(resolve(base,'artifact-manifest.sha256.json'));
 assert.equal(hash(mb),seal.sha256); assert.equal(mb.length,seal.bytes);
 const manifest=JSON.parse(mb); if(expectedSchema) assert.equal(manifest.schema,expectedSchema);
 const item=manifest.files.find(f=>f.path===name); assert.ok(item,`Missing sealed ${name}`);
 const bytes=readFileSync(resolve(base,name)); assert.equal(hash(bytes),item.sha256); assert.equal(bytes.length,item.bytes);
 inputs.push({file:relative(ROOT,resolve(base,name)),sha256:item.sha256,bytes:item.bytes,manifest:relative(ROOT,resolve(base,'artifact-manifest.json')),manifestSHA256:seal.sha256});
 return JSON.parse(bytes);
}
function validateInitial() {
 const complete=sealed(INITIAL,'complete.json','m11h-artifacts-v1'); assert.equal(complete.valid,true);
 const provenance=sealed(INITIAL,'provenance.json','m11h-artifacts-v1');
 for(const name of names.filter(n=>n.startsWith('src/')||n==='experiments/m3-pipeline.mjs')) assert.equal(provenance.sourceHashes[name],sourceHashes[name],`Changed trained source ${name}`);
 return sealed(INITIAL,'state.json','m11h-artifacts-v1');
}
function buildSchedule(start, s) {
 const order=makeRng(s+91000), flashes=makeRng(s+92000), birds=makeRng(s+93000), controls=makeRng(s+94000);
 const tick=x=>Math.round(x*2)/2; let index=0;
 const slots=[];
 for(const stage of PHASES) {
  const kinds=stage==='omission'?Array(15).fill('omission'):[...Array(20).fill('paired'),...Array(10).fill('bird-control')];
  for(let i=kinds.length-1;i>0;i--) {const j=Math.floor(order.uniform()*(i+1));[kinds[i],kinds[j]]=[kinds[j],kinds[i]];}
  for(const [within,kind] of kinds.entries()) {
   const t=start+index*SLOT_MS,events=[];
   if(kind==='bird-control') events.push({g:'bird',start:t+tick(1000+4000*controls.uniform()),duration:200,role:'independent-control'});
   else {
    const flash=t+tick(1000+4000*flashes.uniform());
    events.push({g:'lightning',start:flash,duration:100,role:kind});
    if(kind==='paired') events.push({g:'thunder',start:flash+3000,duration:2000,role:'causal-result'});
    events.push({g:'bird',start:t+tick(20000*birds.uniform()),duration:200,role:'independent-background'});
   }
   slots.push({index:index++,stage,within:within+1,kind,start:t,end:t+SLOT_MS,events:events.sort((a,b)=>a.start-b.start)});
  }
 }
 return {schema:'m11i-schedule-v1',environmentSeed:s,trainingSeed:seed,start,end:start+75*SLOT_MS,slots,events:slots.flatMap(s=>s.events).sort((a,b)=>a.start-b.start)};
}
if(mode==='--plan') {console.log(JSON.stringify(PLAN,null,2));process.exit(0);}
assert.ok(['prepare','run','report'].includes(mode));
if(mode==='run') {assert.ok(ENV_SEEDS.includes(environmentSeed));assert.ok(PHASES.includes(phase));}
const directory=resolve(OUT,mode==='run'?`env-${environmentSeed}/${phase}`:mode);
assert.ok(!existsSync(directory),`Refusing overwrite ${directory}`);
const initial=validateInitial();
let schedule, prior, priorResult;
if(mode==='run') {
 const plan=sealed(resolve(OUT,'prepare'),'plan.json','m11i-artifacts-v1');assert.deepEqual(plan,PLAN);
 const prep=sealed(resolve(OUT,'prepare'),'provenance.json','m11i-artifacts-v1');assert.deepEqual(prep.sourceHashes,sourceHashes);
 schedule=sealed(resolve(OUT,'prepare'),`schedule-${environmentSeed}.json`,'m11i-artifacts-v1');
 const i=PHASES.indexOf(phase);
 if(i===0) prior=initial;
 else {
  const base=resolve(OUT,`env-${environmentSeed}`,PHASES[i-1]);
  assert.equal(sealed(base,'complete.json','m11i-artifacts-v1').valid,true);
  assert.deepEqual(sealed(base,'provenance.json','m11i-artifacts-v1').sourceHashes,sourceHashes);
  prior=sealed(base,'state.json','m11i-artifacts-v1');priorResult=sealed(base,'result.json','m11i-artifacts-v1');
 }
}
mkdirSync(directory,{recursive:true});
const startedAt=new Date().toISOString(),started=performance.now();
const write=(name,value)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
for(const [n,b] of sourceBytes) {const target=resolve(directory,'source-snapshot',n);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,b,{flag:'wx'});}
const provenance={schema:'m11i-provenance-v1',startedAt,mode,phase:mode==='run'?phase:null,environmentSeed:mode==='run'?environmentSeed:null,trainingSeed:seed,argv:process.argv.slice(2),sourceHashes,inputs,initialStateSHA256:hash(readFileSync(resolve(INITIAL,'state.json'))),plan:PLAN,gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};
write('provenance-start.json',provenance);
function finish(error=null) {
 const changed=unchanged(),inputChanged=inputs.filter(i=>hash(readFileSync(resolve(ROOT,i.file)))!==i.sha256||hash(readFileSync(resolve(ROOT,i.manifest)))!==i.manifestSHA256);
 const valid=!error&&!changed.length&&!inputChanged.length;
 write('provenance.json',{...provenance,inputs});write('complete.json',{valid,completedAt:new Date().toISOString(),wallSeconds:(performance.now()-started)/1000,sourceChanged:changed,inputChanged,error:error?String(error.stack):null});
 const files=walk(directory).map(f=>{const b=readFileSync(f);return{path:relative(directory,f),bytes:b.length,sha256:hash(b)};});
 write('artifact-manifest.json',{schema:'m11i-artifacts-v1',files});const mb=readFileSync(resolve(directory,'artifact-manifest.json'));
 write('artifact-manifest.sha256.json',{bytes:mb.length,sha256:hash(mb)});
 console.log(JSON.stringify({directory,valid,wallSeconds:(performance.now()-started)/1000}));
 assert.ok(valid,'Phase invalid; see complete.json');
}
if(mode==='prepare') {
 write('plan.json',PLAN);for(const s of ENV_SEEDS)write(`schedule-${s}.json`,buildSchedule(initial.t,s));finish();process.exit(0);
}
const [{AttractorLayer},{DOWNWARD},{NOVELTY},{THREE_FACTOR,predictionCredit,missDelta},{saveLearning,loadLearning},{stormEnv},{makePipeline,advance}] = await Promise.all([
 import('../src/layer.mjs'),import('../src/downward.mjs'),import('../src/novelty.mjs'),import('../src/three-factor.mjs'),import('../src/learning.mjs'),import('../src/world.mjs'),import('./m3-pipeline.mjs')]);
const saveLayer = layer => ({ ticks: layer.ticks, attractors: clone(layer.attractors), replicas: layer.replicas.map(r => r.net.saveState()) });
function loadLayer(layer, state) {
  assert.equal(layer.replicas.length, state.replicas.length);
  layer.ticks = state.ticks; layer.attractors = clone(state.attractors);
  layer.replicas.forEach((r, i) => r.net.loadState(state.replicas[i]));
}
function checkpoint(p) {
  const learning = saveLearning(p);
  assert.equal(learning.schema, 'event-learning-v1', 'Fresh event-learning state required; legacy caches are not migrated here.');
  assert.equal(learning.future.schema, 2); assert.equal(learning.factor.schema, 2);
  assert.equal(learning.errors.schema, 'novelty-only-v1');
  return { schema: 'm11h-storm-state-v1', seed, t: p.t, mapping: clone(p.mapping), baseline: clone(p.baseline),
    teacher: clone(p.teacherMetadata), layer1: saveLayer(p.layer1), layer2: saveLayer(p.layer2), learning };
}
function restore(state) {
  assert.equal(state.schema, 'm11h-storm-state-v1'); assert.equal(state.seed, seed);
  assert.equal(state.learning.schema, 'event-learning-v1');
  const layer = new AttractorLayer({ n: state.mapping.length * 6, seed });
  const p = makePipeline({ layer, mapping: clone(state.mapping) }, seed);
  p.t = state.t; p.baseline = clone(state.baseline); p.teacherMetadata = clone(state.teacher);
  loadLayer(p.layer1, state.layer1); loadLayer(p.layer2, state.layer2); loadLearning(p, state.learning);
  assert.deepEqual(checkpoint(p), state, 'Full neural and event-learning checkpoint round trip differs');
  return p;
}

function observe(p) {
  const generations = new Map(), predictions = new Map(), weightChanges = [], windows = [], formulaChecks = [], identityViolations = [];
  const register = (w, t, presentAtStart = false) => {
    if (generations.get(w.generation)?.deletedAt !== null && generations.get(w.generation)?.deletedAt !== undefined) identityViolations.push({ t, generation:w.generation, ruleKey:w.ruleKey });
    if (!generations.has(w.generation)) generations.set(w.generation, { generation: w.generation, ruleKey: w.ruleKey,
      A: w.A, B: w.B, k: w.k, createdAt: w.createdAt, presentAtStart, observedFrom: t,
      initialW: w.W, lastMeasuredW: w.W, initialDeltas: clone(w.deltas), finalDeltas: clone(w.deltas),
      predictionsEmitted: 0, matches: 0, unmatchedDeadlines: 0, deletedAt: null });
    return generations.get(w.generation);
  };
  for (const w of p.downward.weights) register(w, p.t, true);
  const key = e => JSON.stringify([e.generation, e.tOnset, e.tArrive]);
  const registerPrediction = (e, t, emittedHere = false) => {
    if (!predictions.has(key(e))) {
      predictions.set(key(e), { ...clone(e), observedFrom: t, emittedHere, firstMatchedAt: null, deadlineAt: null,
        matchObserved: e.matched > 0, matchedBeforeObservation: e.matched > 0 });
      if (emittedHere) generations.get(e.generation).predictionsEmitted++;
    }
    return predictions.get(key(e));
  };
  for (const e of p.errors.pending) registerPrediction(e, p.t);
  const original = p.factor.step;
  p.factor.step = function(t, counts, pending, options) {
    const before = new Map(p.downward.weights.map(w => {
      register(w, t); return [w.generation, { w, W: w.W, deltas: clone(w.deltas) }];
    }));
    for (const e of p.future.created) registerPrediction(e, t, true);
    const deadlines = [];
    for (const e of pending) {
      const event = registerPrediction(e, t), g = generations.get(e.generation);
      event.matched = e.matched;
      if (e.matched > 0 && !event.matchObserved) {
        event.matchObserved = true; event.firstMatchedAt = t; event.matchedStrength = e.matched;
        event.timingCredit = predictionCredit(e.activation, e.tArrive, t);
        event.generationLiveAtMatch = before.has(e.generation);
        if (g) g.matches++;
      }
      if (t === e.tArrive + NOVELTY.toleranceMs) {
        event.deadlineAt = t; event.unmatched = !(e.matched > 0); event.generationLiveAtDeadline = before.has(e.generation);
        event.learnerCreditBeforeDeadline = clone(this.predictions.find(c => c.generation === e.generation && c.tArrive === e.tArrive) ?? null);
        event.targetNovelty = clone(counts.find(c => c.id === e.B));
        if (event.unmatched && g) g.unmatchedDeadlines++;
        deadlines.push(event);
      }
    }
    const dueInputs = pending.filter(e => t === e.tArrive + NOVELTY.toleranceMs && !(e.matched > 0) && before.has(e.generation));
    const result = original.call(this, t, counts, pending, options);
    const after = new Map(p.downward.weights.map(w => [w.generation, w]));
    const deltas = new Map();
    for (const [generation, b] of before) {
      const g = generations.get(generation), w = b.w, live = after.has(generation);
      const ledgerDelta = Object.fromEntries(Object.keys(w.deltas).map(k => [k, w.deltas[k] - b.deltas[k]]));
      const due = dueInputs.filter(e => e.generation === generation);
      if (due.length || ledgerDelta.miss !== 0) {
        let expectedW = b.W + ledgerDelta.STDP, expectedMiss = 0;
        for (const e of due) {
          if (expectedW <= 0) break;
          const delta = missDelta(expectedW, DOWNWARD.wMax, e.activation);
          expectedMiss += delta; expectedW = Math.max(0, expectedW + delta);
        }
        formulaChecks.push({ t, generation, count: due.length, expectedMiss, actualMiss: ledgerDelta.miss,
          expectedW, actualW: w.W, pass: Math.abs(expectedMiss - ledgerDelta.miss) < 1e-12 && Math.abs(expectedW - w.W) < 1e-12 });
      }
      g.lastMeasuredW = w.W; g.finalDeltas = clone(w.deltas);
      if (!live) g.deletedAt ??= t;
      deltas.set(generation, ledgerDelta);
      if (!live || w.W !== b.W || Object.values(ledgerDelta).some(v => v !== 0)) weightChanges.push({
        t, generation, ruleKey: w.ruleKey, beforeW: b.W, afterW: w.W, deltaW: w.W - b.W,
        liveAfter: live, ledgerDelta, structuralRemoval: !live });
    }
    for (const w of after.values()) if (!before.has(w.generation)) {
      const g = register(w, t);
      g.birthNovelty = clone(counts.find(c => c.id === w.B));
      g.birthSourceActivity = p.unroll.lines(t)[p.unroll.indices.get(w.A) * 9 + w.k];
      weightChanges.push({ t, generation: w.generation, ruleKey: w.ruleKey, beforeW: 0, afterW: w.W,
        deltaW: w.W, liveAfter: true, birth: true, ledgerDelta: clone(w.deltas) });
    }
    for (const e of deadlines) e.generationLedgerDeltaAtDeadline = deltas.get(e.generation) ?? null;
    windows.push({ t, counts: clone(counts) });
    return result;
  };
  return { finish() {
    const live = new Set(p.downward.weights.map(w => w.generation));
    return { generations: [...generations.values()].map(g => ({ ...g, live: live.has(g.generation) })),
      predictions: [...predictions.values()], weightChanges, windows, formulaChecks, identityViolations,
      pendingAtEnd: clone(p.errors.pending), learnerPendingAtEnd: clone(p.factor.predictions),
      semantics: 'Generation identity is the persisted monotonic generation ID, not rule key or birth time. Removed edges retain last measured residual W. Unmatched deadlines are actual observed prediction events, including events whose generation was already deleted; ledger changes show which events could affect learning. Preexisting pending predictions have observation bounds, not reconstructed match times.' };
  } };
}

const id = (p,name)=>p.mapping.find(a=>a.feature===name).id;
function edgeStats(p) {
 const trueKey=JSON.stringify([id(p,'lightning'),6,id(p,'thunder')]),bird=p.downward.weights.filter(w=>w.A===id(p,'bird')&&w.B===id(p,'thunder'));
 const trueEdge=p.downward.weights.find(w=>w.ruleKey===trueKey),maxBird=Math.max(0,...bird.map(w=>w.W/DOWNWARD.wMax));
 return {trueKey,trueGeneration:trueEdge?.generation??null,trueU:(trueEdge?.W??0)/DOWNWARD.wMax,maxBirdU:maxBird,bird:clone(bird),trueVsBirdRatio:maxBird>0?(trueEdge?.W??0)/DOWNWARD.wMax/maxBird:null,
 ratioAtLeastFive:(trueEdge?.W??0)>0&&(trueEdge.W/DOWNWARD.wMax>=5*maxBird),birdBelowProvisionalActionGate:bird.every(w=>w.W/DOWNWARD.wMax<ACTION_THRESHOLD),
 maximumBirdActionEligible:bird.some(w=>w.W/DOWNWARD.wMax>=ACTION_THRESHOLD)};
}
function run() {
 const p=restore(prior),audit=observe(p),slots=schedule.slots.filter(s=>s.stage===phase),stageStart=p.t;
 assert.equal(p.t,slots[0].start);const startLearningWindows=p.learningWindows;
 const start= edgeStats(p),originalBird=initial.learning.future.downward.weights.filter(w=>w.A===id(p,'bird')&&w.B===id(p,'thunder')).sort((a,b)=>b.W-a.W)[0];
 const omissionReference=phase==='omission'?start:priorResult?.omissionReference??null;
 const rows=[],onsets=[],forecasts=[],arrivals=[],freezeObservations=[];
 const world=stormEnv(schedule.events,p.t);
 for(const slot of slots) {
  const before=edgeStats(p),ons=[],created=[],arrived=[];
  while(p.t<slot.end) {
   const r=advance(p,world);
   const os=p.unroll.entries.filter(e=>e.tOnset===r.t).map(clone);ons.push(...os);onsets.push(...os);
   created.push(...p.future.created.map(clone));forecasts.push(...p.future.created.map(clone));
   const ar=p.future.arrivals.map(e=>({...clone(e),observedAt:r.t}));arrived.push(...ar);arrivals.push(...ar);
   if(p.layer1.replicas.some(r=>r.EE.frozen)||p.layer2.replicas.some(r=>r.EE.frozen))freezeObservations.push(r.t);
  }
  const thunder=slot.events.find(e=>e.g==='thunder'),causal=created.filter(e=>e.ruleKey===start.trueKey);
  rows.push({...slot,before,after:edgeStats(p),onsets:ons,forecasts:created,arrivals:arrived,
   decodedBirdOnsets:ons.filter(e=>e.id===id(p,'bird')).length,
   timelyTrueForecast:!!thunder&&causal.some(e=>Math.abs(e.tArrive-thunder.start)<=NOVELTY.toleranceMs),
   trueForecasts:causal.length,birdThunderForecasts:created.filter(e=>e.A===id(p,'bird')&&e.B===id(p,'thunder')).length,
   birdThunderPredictionStrength:created.filter(e=>e.A===id(p,'bird')&&e.B===id(p,'thunder')).reduce((a,e)=>a+e.strength,0)});
  if(rows.length%5===0)console.log(`env ${environmentSeed} ${phase}: ${rows.length}/${slots.length}, true=${rows.at(-1).after.trueU.toFixed(6)}, maxBird=${rows.at(-1).after.maxBirdU.toFixed(6)}`);
 }
 const observations=audit.finish(),end=edgeStats(p),controls=rows.filter(r=>r.kind==='bird-control'),paired=rows.filter(r=>r.kind==='paired'),lastPaired=paired.slice(-10);
 const targetPredictions=observations.predictions.filter(e=>e.ruleKey===start.trueKey&&lastPaired.some(r=>e.tOnset>=r.start&&e.tOnset<r.end));
 const liveMisses=observations.predictions.filter(e=>e.unmatched&&e.generationLiveAtDeadline&&e.activation>0),deaths=observations.generations.filter(g=>g.deletedAt!==null);
 const originalBirdLive=p.downward.weights.some(w=>w.generation===originalBird?.generation);
 const trueStartLive=p.downward.weights.some(w=>w.generation===start.trueGeneration);
 const pairedMatchFraction=targetPredictions.length?targetPredictions.filter(e=>e.matchObserved).length/targetPredictions.length:null;
 const checks={integrity:p.learningWindows-startLearningWindows===slots.length*250&&freezeObservations.length===0,
  formula:observations.formulaChecks.every(c=>c.pass),liveMissesDecrement:liveMisses.every(e=>e.generationLedgerDeltaAtDeadline?.miss<0),
  zeroDeletion:deaths.every(g=>g.lastMeasuredW===0),noGenerationResurrection:observations.identityViolations.length===0,noMatchedAndUnmatched:observations.predictions.every(e=>!(e.matchObserved&&e.unmatched)),
  controlsDecoded:controls.length?controls.every(r=>r.decodedBirdOnsets>0):null,
  originalBirdDeleted:phase==='discrimination'?!!originalBird&&!originalBirdLive:null,
  endpointFiveRatio:phase!=='omission'?end.ratioAtLeastFive:null,
  birdBelowProvisionalActionGate:phase!=='omission'?end.birdBelowProvisionalActionGate:null,
  trueGenerationDeleted:phase==='omission'?start.trueGeneration!==null&&!trueStartLive:null,
  recoveryRetention:phase==='recovery'?!!omissionReference&&omissionReference.trueU>0&&end.trueU>=0.85*omissionReference.trueU:null,
  lastTenPairedTimely:paired.length?lastPaired.filter(r=>r.timelyTrueForecast).length/lastPaired.length>=.9:null,
  lastTenPairedMatched:paired.length?pairedMatchFraction!==null&&pairedMatchFraction>=.9:null};
 const output={environmentSeed,trainingSeed:seed,stage:phase,startTime:stageStart,endTime:p.t,slots:rows,start,end,originalBirdGeneration:originalBird?.generation??null,
  originalBirdLive,omissionReference,omissionStartGeneration:omissionReference?.trueGeneration??null,
  recoveryRetention:phase==='recovery'&&omissionReference?end.trueU/omissionReference.trueU:null,
  decodedOnsets:onsets,forecasts,arrivals,learningWindowsDelta:p.learningWindows-startLearningWindows,freezeObservations,
  counts:{liveUnmatched:liveMisses.length,formulaChecks:observations.formulaChecks.length,deaths:deaths.length,births:observations.generations.filter(g=>!g.presentAtStart).length},
  lastTenPaired:{slots:lastPaired.map(r=>r.index),timelyCount:lastPaired.filter(r=>r.timelyTrueForecast).length,predictions:targetPredictions.length,matchFraction:pairedMatchFraction},
  survivingGenerations:observations.generations.filter(g=>g.live).map(g=>{
   const events=observations.predictions.filter(e=>e.generation===g.generation);
   const lastMatchedAt=Math.max(-Infinity,...events.filter(e=>e.matchObserved&&e.firstMatchedAt!==null).map(e=>e.firstMatchedAt));
   return {...g,lastObservedMatchAt:Number.isFinite(lastMatchedAt)?lastMatchedAt:null,
    unmatchedSinceLastObservedMatch:events.filter(e=>e.unmatched&&e.deadlineAt>lastMatchedAt).length,
    pending:events.filter(e=>e.deadlineAt===null),
    censoring:'Only stage observation history; concatenate prior stages to assess lifelong opportunities.'};}),
  checks,boundedStagePass:Object.entries(checks).filter(([k,v])=>v!==null&&k!=='birdBelowProvisionalActionGate').every(([,v])=>v),interpretation:PLAN.limits};
 write('state.json',checkpoint(p));write('result.json',output);write('audit.json',observations);
}
function report() {
 const results=[];
 for(const s of ENV_SEEDS)for(const stage of PHASES){const base=resolve(OUT,`env-${s}`,stage);assert.equal(sealed(base,'complete.json','m11i-artifacts-v1').valid,true);results.push(sealed(base,'result.json','m11i-artifacts-v1'));}
 write('result.json',{plan:PLAN,results:results.map(r=>({environmentSeed:r.environmentSeed,stage:r.stage,start:r.start,end:r.end,checks:r.checks,counts:r.counts,lastTenPaired:r.lastTenPaired,recoveryRetention:r.recoveryRetention,boundedStagePass:r.boundedStagePass})),boundedOnlinePass:results.every(r=>r.boundedStagePass),overallProjectAcceptance:'NOT INFERRED. Prior performance failure and untested action behavior remain.'});
}
try {if(mode==='run')run();else report();finish();} catch(error){finish(error);throw error;}
