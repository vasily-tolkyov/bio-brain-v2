/** Predeclared M11j closed-loop ONLINE action acceptance. No runtime edits. */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {actionPipeline,advanceActions} from './m8-pipeline.mjs';
import {calibrateGoals,GOAL_CALIBRATION} from './m9-pipeline.mjs';
import {teacherSchedule} from './m11a-runtime.mjs';
import {planSchedule,PersistentActionWorld} from './m11j-world.mjs';
import {observe} from './m11j-audit.mjs';
import {chainEnv,ACTION_WORLD} from '../src/envs/actions.mjs';
import {GoalActions,GOALS} from '../src/goals.mjs';
import {DOWNWARD} from '../src/downward.mjs';
import {saveLearning,loadLearning} from '../src/learning.mjs';
import {sat} from '../src/three-factor.mjs';
import {actionId} from '../src/io.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),OUT=resolve(ROOT,'out/m11j-actions-online');
const mode=process.argv[2]??'--plan',envSeed=Number(process.argv[3]??7),phase=process.argv[4]??'normal';
const SEED=7,ENV_SEEDS=[7,19,31],PHASES=['normal','broken','restored'],START=30*34000*2;
const PLAN={schema:'m11j-plan-v1',trainingSeed:7,environmentSeeds:ENV_SEEDS,initialState:'Fresh M11h actionPipeline. No old M caches.',
 preparation:{teachers:'Original sensory and motor isolated teachers, once.',T1:'30 x 34000ms; original seed7 teacherSchedule press/wave/idle; press causes light +3000ms, no bell.',T2:'Same neural/rule state, 30 x 34000ms observation-only light then bell +1000ms, no motor commands. Environment curriculum changes but no neural reset.',goalCalibration:'Original 24 paired GoalErrors trials only; independent calibration time labels end at trained p.t-100. No sensory/rule advances or weights changed by this calibration.'},
 autonomous:{slotMs:10000,counts:{normal:{light:6,bell:6,none:6,bird:6},broken:{light:6,bell:6,none:4,bird:4},restored:{light:6,bell:6,none:6,bird:6}},slotsPerSequence:68,replication:'Three environmental schedules clone the same fresh training-seed7 prepared full state. Not independent neural training seeds.',world:'One independent bird 0..8000ms in every slot. Only actual press causes light+3000ms and bell+4000ms, except presses during broken phase cause neither. Wave/idle have no effects. Queued effects survive all boundaries. No external light/bell.',goals:'Write fixed root strength1 at slot start. Caller cancels any unmet root at 10s, explicitly not success. Keep all neural, motor, pending and environment state.',learning:'advanceActions normal sensory/layer2/N/downward learning, then real-onset goal.step. Preserve original fixed motor readout and calibrated goal-M learning semantics; no experimental freeze, no advanceGoals frozen probe.',actionThreshold:GOALS.actionThreshold},
 criteria:{preparation:'T1 actual execution must exactly match all 90 declared motor commands, T2 has zero executions; exact copy checks both. T1 has no bell physical effect. At preparation end press->light and light->bell must each have an edge >=.3. No extra teaching if these fail; autonomous result is conditional on preparation and cannot erase its failure.',integrity:'Complete all fixed slots, 100 normal learning windows each; no runtime/input/source changes, sensory/layer2 EE never experimentally frozen; exactly one identity/strength-matched copy iff actual execution, and world execution records match. An executed goal-selected action must have positive current appliedDrive and a positive eligible-rule contribution; zero-current-drive motor carryover is reported separately, not assumed to be a valid current path.',normalRestored:'Light and bell each causal completion >=90%, first action press >=90%. With 6 per kind these require 6/6. Each target slot at most one press and no other action. None/bird slots zero actions.',causalCompletion:'An actual press in this slot must cause a physical target event and corresponding positive decoded onset. Onset is associated to physical event if its 100ms readout span overlaps event, allowing one preceding window for neural latency: event.start < t+100 and event.end > t-100. Preserve all candidates; ambiguous multiple causes do not count as causal success. Old queued effects cannot count as current-slot action success.',completion:'No actual execution after natural root completion in any slot. Caller cancellation is not completion.',wait:'Observation only, no new controller lock. Record actual prediction instances and path generations. While an unmatched forecast caused by a prior execution and on that execution goal chain remains before its full +500ms deadline, no further execution for the same root request instance (slotIndex plus root ID). Old-request predictions remain in the controller but are not called duplicate actions for a new request. Include later sensory-link forecasts from the same physical execution; require each used rule >=existing .3 when emitted. Weak unrelated forecasts remain raw but do not extend this criterion.',broken:'Must observe at least one actual press followed by a live unmatched action-result prediction. In the final 4 predeclared light/bell broken slots, zero ineffective actions. Goals need not succeed during failure. Do not extend stage if this fails.',learning:'Every live unmatched prediction uses unchanged sequential missDelta; no matched charge; deletion W exactly0; no old generation resurrection or transfer. 1e-12 only observational arithmetic tolerance.',restoration:'Same normal criteria without teacher rescue or manual exploration. If action drive stops and cannot collect new outcomes, report failure and remaining path strengths; do not force exploration or zero residual rules.',aggregate:'All applicable checks across all 9 stages required. .3 is retained provisional setting, not newly chosen optimal default. Full fixed trajectories and transient wrong/repeated actions remain visible.'},
 limits:'This is a bounded closed-loop test. Shared initial training seed, 3 environmental schedules, no new mechanism or parameter. Previous M2 timing failure remains. No performance retest requested.'};
const clone=x=>structuredClone(x),hash=b=>createHash('sha256').update(b).digest('hex'),parse=f=>JSON.parse(readFileSync(f));
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(d,e.name)):[resolve(d,e.name)]);
const names=[...walk(resolve(ROOT,'src')).filter(f=>f.endsWith('.mjs')).map(f=>relative(ROOT,f)),...['m8-pipeline','m9-pipeline','m11a-runtime','m11j-world','m11j-audit','m11j-actions-online'].map(n=>`experiments/${n}.mjs`),'package.json'].sort();
const sourceBytes=new Map(names.map(n=>[n,readFileSync(resolve(ROOT,n))])),sourceHashes=Object.fromEntries([...sourceBytes].map(([n,b])=>[n,hash(b)]));
const inputs=[];
function sealed(base,name){const mb=readFileSync(resolve(base,'artifact-manifest.json')),ms=parse(resolve(base,'artifact-manifest.sha256.json'));assert.equal(hash(mb),ms.sha256);const m=JSON.parse(mb);assert.equal(m.schema,'m11j-artifacts-v1');const item=m.files.find(f=>f.path===name);assert.ok(item);const b=readFileSync(resolve(base,name));assert.equal(hash(b),item.sha256);assert.equal(b.length,item.bytes);inputs.push({file:relative(ROOT,resolve(base,name)),sha256:item.sha256,manifest:relative(ROOT,resolve(base,'artifact-manifest.json')),manifestSHA256:ms.sha256});return JSON.parse(b);}
if(mode==='--plan'){console.log(JSON.stringify(PLAN,null,2));process.exit(0);}
assert.ok(['prepare','teachers','T1','T2','calibrate','run','report'].includes(mode));
if(mode==='run'){assert.ok(ENV_SEEDS.includes(envSeed));assert.ok(PHASES.includes(phase));}
const directory=resolve(OUT,mode==='run'?`env-${envSeed}/${phase}`:mode);assert.ok(!existsSync(directory),'Refuse overwrite '+directory);
if(mode!=='prepare'){assert.deepEqual(sealed(resolve(OUT,'prepare'),'plan.json'),PLAN);assert.deepEqual(sealed(resolve(OUT,'prepare'),'provenance.json').sourceHashes,sourceHashes);}
mkdirSync(directory,{recursive:true});const started=performance.now(),startedAt=new Date().toISOString();
const write=(n,x)=>writeFileSync(resolve(directory,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
for(const [n,b]of sourceBytes){const f=resolve(directory,'source-snapshot',n);mkdirSync(dirname(f),{recursive:true});writeFileSync(f,b,{flag:'wx'});}
const provenance={startedAt,argv:process.argv.slice(2),sourceHashes,inputs,plan:PLAN,gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};write('provenance-start.json',provenance);
function finish(){const changed=names.filter(n=>hash(readFileSync(resolve(ROOT,n)))!==sourceHashes[n]),inputChanged=inputs.filter(i=>hash(readFileSync(resolve(ROOT,i.file)))!==i.sha256||hash(readFileSync(resolve(ROOT,i.manifest)))!==i.manifestSHA256);write('provenance.json',{...provenance,inputs});write('complete.json',{valid:!changed.length&&!inputChanged.length,sourceChanged:changed,inputChanged,completedAt:new Date().toISOString(),wallSeconds:(performance.now()-started)/1000});const files=walk(directory).map(f=>{const b=readFileSync(f);return{path:relative(directory,f),bytes:b.length,sha256:hash(b)}});write('artifact-manifest.json',{schema:'m11j-artifacts-v1',files});const b=readFileSync(resolve(directory,'artifact-manifest.json'));write('artifact-manifest.sha256.json',{bytes:b.length,sha256:hash(b)});assert.equal(changed.length+inputChanged.length,0);console.log(JSON.stringify({directory,valid:true,wallSeconds:(performance.now()-started)/1000}));}
const saveLayer=l=>({ticks:l.ticks,attractors:clone(l.attractors),replicas:l.replicas.map(r=>r.net.saveState())});
function loadLayer(l,s){l.ticks=s.ticks;l.attractors=clone(s.attractors);l.replicas.forEach((r,i)=>r.net.loadState(s.replicas[i]));}
function saveGoal(g){return g?{actions:clone(g.actions),ids:clone(g.goals.ids),actionThreshold:g.actionThreshold,entries:[...g.goals.entries],parents:[...g.goals.parents],errors:g.errors.saveState(),counts:clone(g.counts),recursion:g.recursion,links:clone([...g.links]),written:clone(g.written)}:null;}
function checkpoint(p){return{schema:'m11j-action-state-v1',seed:SEED,t:p.t,mapping:clone(p.mapping),baseline:clone(p.baseline),teacher:{mapping:clone(p.teacher.mapping),epochs:p.teacher.epochs,durationMs:p.teacher.durationMs},output:{mapping:clone(p.output.mapping),actions:clone(p.output.actions),epochs:p.output.epochs,durationMs:p.output.durationMs,previous:p.output.previous,layer:saveLayer(p.output.layer)},layer1:saveLayer(p.layer1),layer2:saveLayer(p.layer2),learning:saveLearning(p),goal:saveGoal(p.goal)};}
function restore(s,env){assert.equal(s.schema,'m11j-action-state-v1');const p=actionPipeline(env,SEED);p.t=s.t;p.mapping=clone(s.mapping);p.baseline=clone(s.baseline);Object.assign(p.teacher,clone(s.teacher));loadLayer(p.layer1,s.layer1);loadLayer(p.layer2,s.layer2);loadLayer(p.output.layer,s.output.layer);for(const k of ['mapping','actions','epochs','durationMs','previous'])p.output[k]=clone(s.output[k]);loadLearning(p,s.learning);if(s.goal){const a=s.goal;p.goal=new GoalActions(p.future,a.actions,a.ids,SEED,{actionThreshold:a.actionThreshold});p.goal.goals.entries=new Map(a.entries);p.goal.goals.parents=new Map(a.parents);p.goal.errors.loadState(a.errors);p.goal.counts=clone(a.counts);p.goal.recursion=a.recursion;p.goal.links=new Map(clone(a.links));p.goal.written=clone(a.written);}assert.deepEqual(checkpoint(p),s,'Full action snapshot round trip');return p;}
function priorState(previous){const base=resolve(OUT,previous);assert.equal(sealed(base,'complete.json').valid,true);assert.deepEqual(sealed(base,'provenance.json').sourceHashes,sourceHashes);return sealed(base,'state.json');}
const featureId=(p,n)=>p.mapping.find(a=>a.feature===n)?.id;
const edgeStats=p=>p.downward.weights.map(w=>({...clone(w),u:w.W/DOWNWARD.wMax,actionEligible:w.W/DOWNWARD.wMax>=GOALS.actionThreshold}));
if(mode==='prepare'){write('plan.json',PLAN);for(const s of ENV_SEEDS)write(`schedule-${s}.json`,planSchedule(START,s));write('teacher-schedule.json',[...teacherSchedule(SEED,['press','wave','idle'],0,30)]);finish();process.exit(0);}
if(mode==='teachers'){const p=actionPipeline(chainEnv({seed:SEED,count:30,phase:'T1'}),SEED);write('state.json',checkpoint(p));write('result.json',{teacher:p.teacher.mapping,motor:p.output.mapping,t:p.t});finish();process.exit(0);}
if(mode==='T1'||mode==='T2'){
 const env=chainEnv({seed:SEED,count:30,phase:mode}),p=restore(priorState(mode==='T1'?'teachers':'T1'),env),audit=observe(p),start=p.t;
 const commands=new Map(sealed(resolve(OUT,'prepare'),'teacher-schedule.json')),rows=[],windows=[];
 for(let i=0;i<30;i++){const executions=[],onsets=[];for(let w=0;w<340;w++){const command=mode==='T1'?commands.get(p.t-start):null,drive=new Float64Array(p.output.actions.length);if(command)drive[p.output.actions.indexOf(command)]=1;const r=advanceActions(p,drive);if(r.executed.action)executions.push({t:r.t,...r.executed});onsets.push(...p.unroll.entries.filter(e=>e.tOnset===r.t).map(clone));const copies=p.unroll.entries.filter(e=>e.tOnset===r.t&&typeof e.id==='string'&&e.id.startsWith('action:')).map(clone);windows.push({t:r.t,command:command??null,executed:r.executed,copies,copyOK:r.executed.action!==null?copies.length===1&&copies[0].id===actionId(r.executed.action)&&copies[0].strength===r.executed.strength:copies.length===0});}rows.push({trial:i+1,executions,onsets,weights:edgeStats(p)});if((i+1)%5===0)console.log(`${mode} ${i+1}/30`);}
 assert.equal(p.t,start+30*34000);write('state.json',checkpoint(p));write('audit.json',audit.finish());write('result.json',{phase:mode,start,end:p.t,environmentTimeOffset:start,preparationChecks:{commandsExact:windows.every(w=>w.executed.action===w.command),copyExact:windows.every(w=>w.copyOK),T1NoBell:mode==='T1'?env.events.every(e=>e.g!=='bell'):null,executionCount:env.executed.length===(mode==='T1'?90:0)},slots:rows,windows,events:env.events,worldExecutions:env.executed,teacherCommands:mode==='T1'?[...commands]:[],endWeights:edgeStats(p)});finish();process.exit(0);
}
if(mode==='calibrate'){
 const p=restore(priorState('T2'),chainEnv({seed:SEED,count:1,phase:'goal'}));assert.equal(p.t,START);
 const before=checkpoint(p);p.goal=new GoalActions(p.future,p.output.actions,p.teacher.mapping.map(a=>a.id),SEED);
 const duration=GOAL_CALIBRATION.trials*(GOAL_CALIBRATION.leadMs+100+GOAL_CALIBRATION.restMs),context={goal:p.goal,t:p.t-duration};
 const result=calibrateGoals(context);assert.equal(context.t,p.t);assert.equal(p.goal.errors.t,p.t-100);
 const after=checkpoint(p);assert.deepEqual({...after,goal:null},before,'Goal calibration must not mutate trained brain');
 const path=(A,B)=>edgeStats(p).filter(w=>w.A===A&&w.B===B);const pressLight=path(actionId('press'),featureId(p,'light')),lightBell=path(featureId(p,'light'),featureId(p,'bell'));
 write('state.json',after);write('result.json',{...result,preparedPaths:{pressLight,lightBell},preparedTasksAvailable:pressLight.some(w=>w.actionEligible)&&lightBell.some(w=>w.actionEligible),independentDurationMs:duration,trainedBrainUnchanged:true,goalTime:p.goal.errors.t,endWeights:edgeStats(p)});finish();process.exit(0);
}
if(mode==='run'){
 const schedule=sealed(resolve(OUT,'prepare'),`schedule-${envSeed}.json`),pi=PHASES.indexOf(phase);
 let state,worldState=null,aux={contexts:[],watched:[],lastPositiveDrive:[]};
 if(pi===0)state=priorState('calibrate');else{const dir=`env-${envSeed}/${PHASES[pi-1]}`;state=priorState(dir);worldState=sealed(resolve(OUT,dir),'world.json');aux=sealed(resolve(OUT,dir),'continuity.json');}
 const world=new PersistentActionWorld(schedule,worldState),p=restore(state,world),audit=observe(p),start=p.t,startLearning=p.learningWindows,worldExecutionStart=world.executed.length;
 const slots=schedule.slots.filter(s=>s.phase===phase);assert.equal(world.time,p.t);assert.equal(p.t,slots[0].start);
 const contexts=new Map(aux.contexts),watched=new Map(aux.watched),lastPositiveDrive=new Map(aux.lastPositiveDrive),rows=[],windows=[],allOnsets=[],freeze=[],waitingViolations=[],pathViolations=[];
 const pkey=e=>JSON.stringify([e.generation,e.tOnset,e.tArrive]);
 const associate=(id,t)=>world.events.filter(e=>featureId(p,e.g)===id&&e.start<t+100&&e.start+e.duration>t-100).map(e=>({eventId:e.id,causeExecutionId:e.causeExecutionId,g:e.g,start:e.start,duration:e.duration}));
 for(const slot of slots){
  assert.equal(p.t,slot.start);const root=slot.kind==='none'?null:featureId(p,slot.kind);
  assert.equal(p.goal.goals.entries.size,0,'Caller cleanup must leave no old root/descendants');
  if(root!==null)p.goal.goals.write(root,1);
  const row={...clone(slot),root,weightsBefore:edgeStats(p),executions:[],onsets:[],forecasts:[],naturalCompletedAt:null,causalSuccess:false,causalEvents:[],callerCancelled:false};
  for(let step=0;step<100;step++){
   const t=p.t,applied=Array.from(p.goal.motorDrive()),goalsBefore=clone([...p.goal.goals.entries]),linksBefore=clone([...p.goal.links]),countsBefore=clone(p.goal.counts),beforeWeights=edgeStats(p);
   const activeIds=new Set(goalsBefore.map(([id])=>id)),eligibleRules=beforeWeights.filter(w=>w.actionEligible&&activeIds.has(w.B));
   for(const [parent,link] of linksBefore)if(!activeIds.has(parent)||!beforeWeights.some(w=>w.ruleKey===link.ruleKey&&w.generation===link.generation&&w.createdAt===link.createdAt&&w.actionEligible))pathViolations.push({t,classification:'stale upstream goal link',parent,link,goalsBefore});
   const previousPositiveDrive=clone([...lastPositiveDrive]);for(let ai=0;ai<applied.length;ai++)if(applied[ai]>0)lastPositiveDrive.set(p.output.actions[ai],{t,drive:applied[ai],slotIndex:slot.index,root});
   const r=advanceActions(p,Float64Array.from(applied));assert.equal(world.time,p.t);
   const onsets=p.unroll.entries.filter(e=>e.tOnset===t).map(e=>({...clone(e),physicalCandidates:associate(e.id,t)}));
   const execution=r.executed.action===null?null:clone(world.executed.at(-1));
   if(execution){assert.equal(execution.t,t);assert.equal(execution.action,r.executed.action);
    const causalRules=eligibleRules.filter(w=>w.A===actionId(execution.action)).map(w=>({...w,goalEffective:countsBefore.find(c=>c.id===w.B)?.effective??0,contribution:sat(countsBefore.find(c=>c.id===w.B)?.effective??0)*w.u}));
    const actionDrive=applied[p.output.actions.indexOf(execution.action)],positiveContributions=causalRules.filter(w=>w.contribution>0),positivePath=actionDrive>0&&positiveContributions.length>0;
    const ctx={executionId:execution.id,t,slotIndex:slot.index,root,goalIds:[...activeIds],pathRules:clone(eligibleRules),links:linksBefore};contexts.set(execution.id,ctx);
    const waiting=[...watched.values()].filter(e=>e.executionId!==execution.id&&e.root===root&&e.rootSlotIndex===slot.index&&root!==null&&!e.matched&&t<=e.tArrive+500&&t>e.executionTime);
    if(waiting.length)waitingViolations.push({t,execution,waiting:clone(waiting)});
    if(!positivePath)pathViolations.push({t,execution,goalsBefore,applied,eligibleRules,causalRules,previousPositiveDrive,classification:actionDrive===0?'zero-current-drive motor activity; earlier drive is history, not proven cause':'no positive eligible contribution'});
    row.executions.push({...execution,strength:r.executed.strength,appliedDrive:applied,goalsBefore,linksBefore,contributingEligibleRules:causalRules,positivePath,previousPositiveDrive,waiting:clone(waiting),afterCompletion:row.naturalCompletedAt!==null});
   }
   for(const e of p.future.created){
    const w=beforeWeights.find(w=>w.generation===e.generation),sourceOnset=onsets.find(o=>o.id===e.A),candidateIds=new Set(sourceOnset?.physicalCandidates.map(c=>c.causeExecutionId).filter(x=>x!==null)??[]);
    if(execution&&e.A===actionId(execution.action))candidateIds.add(execution.id);
    const causes=[...candidateIds].filter(id=>contexts.has(id));
    row.forecasts.push({...clone(e),causeExecutionIds:causes,ruleAtEmission:clone(w??null)});
    for(const cause of causes){const ctx=contexts.get(cause);if(w?.actionEligible&&ctx.goalIds.includes(e.B))watched.set(JSON.stringify([pkey(e),cause]),{predictionKey:pkey(e),ambiguousCause:causes.length>1,causeCandidates:causes,...clone(e),executionId:cause,executionTime:ctx.t,root:ctx.root,rootSlotIndex:ctx.slotIndex,ruleAtEmission:clone(w),matched:false,pathRules:clone(ctx.pathRules)});}
   }
   for(const e of p.errors.pending){for(const watch of watched.values())if(watch.predictionKey===pkey(e)&&e.matched>0){watch.matched=true;watch.matchedAt??=t;}}
   const goalResult=p.goal.step(t,onsets,p.errors.pending);
   if(root!==null&&row.naturalCompletedAt===null&&!p.goal.goals.entries.has(root))row.naturalCompletedAt=t;
   for(const o of onsets){row.onsets.push(o);allOnsets.push(o);if(o.id===root&&o.physicalCandidates.length===1){const c=o.physicalCandidates[0],exe=world.executed.find(e=>e.id===c.causeExecutionId);if(exe&&exe.slotIndex===slot.index&&exe.action==='press'){row.causalSuccess=true;row.causalEvents.push({onset:o,physical:c,execution:clone(exe)});}}}
   const copy=onsets.filter(e=>typeof e.id==='string'&&e.id.startsWith('action:'));
   const copyOK=execution?copy.length===1&&copy[0].id===actionId(execution.action)&&copy[0].strength===r.executed.strength:copy.length===0;
   windows.push({t,appliedDrive:applied,executed:r.executed,executionId:execution?.id??null,copy,copyOK,onsets,goalsBefore,linksBefore,countsBefore,goalCounts:clone(goalResult.counts),written:clone(goalResult.written),goalsAfter:clone([...p.goal.goals.entries]),linksAfter:clone([...p.goal.links]),eligibleRules:clone(eligibleRules),pending:clone(p.errors.pending),learning:true});
   if(p.layer1.replicas.some(r=>r.EE.frozen)||p.layer2.replicas.some(r=>r.EE.frozen))freeze.push(t);
  }
  row.naturalCompleted=row.naturalCompletedAt!==null;row.goalsBeforeCallerCleanup=clone([...p.goal.goals.entries]);
  if(root!==null&&p.goal.goals.entries.has(root)){row.callerCancelled=true;p.goal.goals.cancel(root);}
  p.goal.motorDrive();assert.equal(p.goal.goals.entries.size,0);
  row.weightsAfter=edgeStats(p);row.pending=clone(p.errors.pending);row.firstAction=row.executions[0]?.action??null;rows.push(row);
  console.log(`env ${envSeed} ${phase} ${rows.length}/${slots.length}: goal=${slot.kind}, actions=${row.executions.map(e=>e.action).join(',')||'none'}, natural=${row.naturalCompleted}, causal=${row.causalSuccess}`);
 }
 const data=audit.finish(),liveMisses=data.predictions.filter(e=>e.unmatched&&e.generationLiveAtDeadline&&e.activation>0),deaths=data.generations.filter(g=>g.deletedAt!==null);
 const targetRows=rows.filter(r=>['light','bell'].includes(r.kind)),controlRows=rows.filter(r=>['none','bird'].includes(r.kind)),lastFour=targetRows.slice(-4);
 const missesAfterPress=liveMisses.filter(e=>e.A===actionId('press')&&[featureId(p,'light'),featureId(p,'bell')].includes(e.B)&&world.executed.some(a=>a.action==='press'&&a.phase==='broken'&&a.t===e.tOnset));
 const success=Object.fromEntries(['light','bell'].map(k=>{const r=rows.filter(r=>r.kind===k);return[k,{n:r.length,causal:r.filter(x=>x.causalSuccess).length,natural:r.filter(x=>x.naturalCompleted).length,firstPress:r.filter(x=>x.firstAction==='press').length}];}));
 const worldRecords=world.executed.slice(worldExecutionStart);assert.deepEqual(worldRecords,rows.flatMap(r=>r.executions.map(({id,action,t,phase,slotIndex})=>({id,action,t,phase,slotIndex}))));
 const checks={integrity:p.learningWindows-startLearning===slots.length*100&&freeze.length===0,executionCopy:windows.every(w=>w.copyOK),noMatchedMiss:data.predictions.every(e=>!(e.matchObserved&&e.unmatched)),formula:data.formulaChecks.every(x=>x.pass),liveMissDecrement:liveMisses.every(e=>e.generationLedgerDeltaAtDeadline?.miss<0),zeroDeletion:deaths.every(g=>g.lastMeasuredW===0),generationIdentity:data.identityViolations.length===0,controlsQuiet:controlRows.every(r=>r.executions.length===0),stopAfterCompletion:rows.every(r=>r.executions.every(e=>!e.afterCompletion)),waitNoDuplicate:waitingViolations.length===0,eligibleActionPaths:pathViolations.length===0,
  lightCausal:phase!=='broken'?success.light.causal/success.light.n>=.9:null,bellCausal:phase!=='broken'?success.bell.causal/success.bell.n>=.9:null,firstPress:phase!=='broken'?Object.values(success).every(x=>x.firstPress/x.n>=.9):null,
  singleCorrectAction:phase!=='broken'?targetRows.every(r=>r.executions.length<=1&&r.executions.every(e=>e.action==='press')):null,
  brokenExperience:phase==='broken'?missesAfterPress.length>0:null,brokenStopsLastFour:phase==='broken'?lastFour.every(r=>r.executions.length===0):null};
 write('audit.json',data);write('result.json',{environmentSeed:envSeed,trainingSeed:SEED,phase,startTime:start,endTime:p.t,slots:rows,windows,onsets:allOnsets,success,checks,boundedStagePass:Object.values(checks).every(v=>v===null||v),learningWindowsDelta:p.learningWindows-startLearning,freeze,waitingViolations,pathViolations,brokenLastFour:lastFour.map(r=>r.index),brokenMissesAfterPress:missesAfterPress,counts:{liveMisses:liveMisses.length,deaths:deaths.length,births:data.generations.filter(g=>!g.presentAtStart).length},endWeights:edgeStats(p)});
 write('state.json',checkpoint(p));write('world.json',world.saveState());write('continuity.json',{contexts:[...contexts],watched:[...watched],lastPositiveDrive:[...lastPositiveDrive]});finish();process.exit(0);
}
if(mode==='report'){
 const summaries=[];for(const s of ENV_SEEDS)for(const ph of PHASES){const base=resolve(OUT,`env-${s}/${ph}`);assert.equal(sealed(base,'complete.json').valid,true);assert.deepEqual(sealed(base,'provenance.json').sourceHashes,sourceHashes);const r=sealed(base,'result.json');summaries.push({environmentSeed:s,phase:ph,checks:r.checks,pass:r.boundedStagePass,success:r.success,counts:r.counts,actions:r.slots.reduce((a,x)=>a+x.executions.length,0),waitingViolations:r.waitingViolations.length,callerCancellations:r.slots.filter(s=>s.callerCancelled).length,endWeights:r.endWeights});}
 const training=['T1','T2'].map(ph=>({phase:ph,...sealed(resolve(OUT,ph),'result.json').preparationChecks})),calibration=sealed(resolve(OUT,'calibrate'),'result.json');const preparationPass=training.every(r=>Object.entries(r).filter(([k])=>k!=='phase').every(([,v])=>v===null||v))&&calibration.preparedTasksAvailable;
 write('result.json',{preparationPass,training,preparedPaths:calibration.preparedPaths,boundedAcceptancePass:preparationPass&&summaries.every(s=>s.pass),summaries,limits:PLAN.limits});finish();
}
