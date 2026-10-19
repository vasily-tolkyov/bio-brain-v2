/** Read-only recomputation of sealed M11i online observations. No neural runs. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DOWNWARD} from '../src/downward.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),OUT=resolve(ROOT,'out/m11i-online');
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs=[];
function read(base,name){
 const mb=readFileSync(resolve(base,'artifact-manifest.json')),seal=JSON.parse(readFileSync(resolve(base,'artifact-manifest.sha256.json')));
 assert.equal(sha(mb),seal.sha256);assert.equal(mb.length,seal.bytes);
 const item=JSON.parse(mb).files.find(x=>x.path===name);assert.ok(item);
 const b=readFileSync(resolve(base,name));assert.equal(sha(b),item.sha256);assert.equal(b.length,item.bytes);
 inputs.push({path:resolve(base,name),sha256:sha(b),manifestSHA256:seal.sha256});return JSON.parse(b);
}
const seeds=[7,19,31],phases=['discrimination','omission','recovery'],sequences=[];
for(const environmentSeed of seeds){
 const rows=[],allGenerations=new Map(),allPredictions=new Map(),allChanges=[],stages=[];
 const schedule=read(resolve(OUT,'prepare'),`schedule-${environmentSeed}.json`);
 let previousState=null, originalBirdGeneration=null;
 for(const phase of phases){
  const base=resolve(OUT,`env-${environmentSeed}`,phase),complete=read(base,'complete.json'),provenance=read(base,'provenance.json');assert.ok(complete.valid);
  for(const [n,h] of Object.entries(provenance.sourceHashes))assert.equal(sha(readFileSync(resolve(ROOT,n))),h,`Current source changed ${n}`);
  const r=read(base,'result.json'),a=read(base,'audit.json'),state=read(base,'state.json');
  originalBirdGeneration ??= r.originalBirdGeneration; assert.equal(originalBirdGeneration,r.originalBirdGeneration);
  if(previousState)assert.equal(provenance.inputs.find(i=>i.file.endsWith('/state.json')&&i.file.includes(`env-${environmentSeed}`)).sha256,previousState.sha256);
  previousState={sha256:sha(readFileSync(resolve(base,'state.json'))),state};
  assert.equal(r.slots.length,phase==='omission'?15:30);assert.equal(r.learningWindowsDelta,r.slots.length*250);
  assert.equal(a.formulaChecks.filter(x=>!x.pass).length,0);
  for(const g of a.generations){
   const prior=allGenerations.get(g.generation);
   if(!prior)allGenerations.set(g.generation,{...g,observedInitialW:g.initialW,observedInitialDeltas:g.initialDeltas});
   else {
    assert.equal(prior.live,true,`Deleted generation reappeared ${g.generation}`);
    assert.equal(g.presentAtStart,true);
    assert.equal(prior.lastMeasuredW,g.initialW);
    allGenerations.set(g.generation,{...prior,...g,initialW:prior.initialW,initialDeltas:prior.initialDeltas,observedFrom:prior.observedFrom,presentAtStart:prior.presentAtStart,matches:prior.matches+g.matches,unmatchedDeadlines:prior.unmatchedDeadlines+g.unmatchedDeadlines,predictionsEmitted:prior.predictionsEmitted+g.predictionsEmitted});
   }
  }
  for(const e of a.predictions){
   const k=JSON.stringify([e.generation,e.tOnset,e.tArrive]),old=allPredictions.get(k);
   if(!old)allPredictions.set(k,e);
   else allPredictions.set(k,{...old,...e,firstMatchedAt:old.firstMatchedAt??e.firstMatchedAt,deadlineAt:old.deadlineAt??e.deadlineAt,matchedBeforeObservation:old.matchedBeforeObservation,emittedHere:old.emittedHere||e.emittedHere});
  }
  rows.push(...r.slots);allChanges.push(...a.weightChanges);
  const controls=r.slots.filter(x=>x.kind==='bird-control');
  const ids=Object.fromEntries(state.mapping.map(x=>[x.feature,x.id]));
  const birdGenerations=new Set(a.generations.filter(g=>g.A===ids.bird&&g.B===ids.thunder).map(g=>g.generation));
  const weights=[...a.generations.filter(g=>birdGenerations.has(g.generation)).map(g=>g.initialW),...a.weightChanges.filter(g=>birdGenerations.has(g.generation)).map(g=>g.afterW)];
  const initialTarget=phase==='omission'?a.generations.find(g=>g.generation===r.start.trueGeneration):null;
  stages.push({phase,checks:r.checks,pass:r.boundedStagePass,start:r.start,end:r.end,counts:r.counts,lastTenPaired:r.lastTenPaired,recoveryRetention:r.recoveryRetention,
   sourceSignature:sha(JSON.stringify(provenance.sourceHashes)),wallSeconds:complete.wallSeconds,
   maximumObservedBirdThunderU:Math.max(0,...weights)/DOWNWARD.wMax,
   controlForecasts:controls.map(c=>({index:c.index,decodedBirdOnsets:c.decodedBirdOnsets,predictions:c.birdThunderForecasts,totalStrength:c.birdThunderPredictionStrength})),
   originalTrueOmission:initialTarget??null,
   liveAtEndpoint:a.generations.filter(g=>g.live),pendingAtEndpoint:a.pendingAtEnd});
 }
 assert.equal(rows.length,75);
 const gs=[...allGenerations.values()],ps=[...allPredictions.values()];
 const originalBird=gs.find(g=>g.generation===originalBirdGeneration);
 const originalEvents=ps.filter(e=>e.generation===originalBirdGeneration).sort((a,b)=>a.tOnset-b.tOnset);
 const pairedPhysicalOverlaps=schedule.events.filter(e=>e.g==='bird').map(b=>({bird:b,thunder:schedule.events.filter(t=>t.g==='thunder'&&b.start<t.start+t.duration&&b.start+b.duration>t.start)})).filter(x=>x.thunder.length);
 const survivors=gs.filter(g=>g.live).map(g=>{
  const es=ps.filter(e=>e.generation===g.generation),lastMatch=Math.max(-Infinity,...es.filter(e=>e.firstMatchedAt!==null).map(e=>e.firstMatchedAt));
  return {...g,lastObservedMatchAt:Number.isFinite(lastMatch)?lastMatch:null,actualUnmatchedSinceLastObservedMatch:es.filter(e=>e.unmatched&&e.deadlineAt>lastMatch).length,pending:es.filter(e=>e.deadlineAt===null)};
 });
 sequences.push({environmentSeed,trainingSeed:7,stages,originalBird,originalBirdEvents:originalEvents,physicalBirdThunderOverlaps:pairedPhysicalOverlaps,
  originalBirdWeightChanges:allChanges.filter(e=>e.generation===originalBirdGeneration),
  combinedCounts:{slots:rows.length,learningWindows:rows.length*250,generations:gs.length,deaths:gs.filter(g=>g.deletedAt!==null).length,survivors:survivors.length,actualLiveUnmatched:ps.filter(e=>e.unmatched&&e.generationLiveAtDeadline&&e.activation>0).length},survivors,
  boundedOnlinePass:stages.every(x=>x.pass)});
}
const result={schema:'m11i-recomputed-audit-v1',sequences,boundedOnlinePass:sequences.every(s=>s.boundedOnlinePass),totalSlots:225,totalLearningWindows:56250,
 allDeletedExactlyZero:sequences.every(s=>s.stages.every(x=>x.checks.zeroDeletion)),sourceUnchanged:true,inputs,
 limits:['Same trained seed 7, three independently scheduled environment seeds.','Passive world, no motor or goal evaluation.','Endpoint zero bird-to-thunder is not all false edges extinct. Pending endpoint events are censored, not misses.','No speed optimization or full-suite rerun; prior performance result is unchanged.']};
const dest=resolve(OUT,'recomputed-audit');assert.ok(!existsSync(dest));mkdirSync(dest);
writeFileSync(resolve(dest,'result.json'),JSON.stringify(result,null,2)+'\n');
const bytes=readFileSync(fileURLToPath(import.meta.url));writeFileSync(resolve(dest,'source.mjs'),bytes);
writeFileSync(resolve(dest,'manifest.json'),JSON.stringify({runnerSHA256:sha(bytes),inputs,resultSHA256:sha(readFileSync(resolve(dest,'result.json')))},null,2));
console.log(JSON.stringify({boundedOnlinePass:result.boundedOnlinePass,totalSlots:225,sequences:sequences.map(s=>({environmentSeed:s.environmentSeed,pass:s.boundedOnlinePass,counts:s.combinedCounts,stages:s.stages.map(x=>({phase:x.phase,trueU:x.end.trueU,birdU:x.end.maxBirdU,recovery:x.recoveryRetention,peakBird:x.maximumObservedBirdThunderU}))}))},null,2));
