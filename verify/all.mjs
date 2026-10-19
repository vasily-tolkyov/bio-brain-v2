import { verifyM11a } from './m11a.mjs';
import { verifyCore } from './core.mjs';
import { verifyLayer } from './layer.mjs';
import { verifyUnroll } from './unroll.mjs';
import { verifyM3 } from './m3.mjs';
import { verifyM3Dynamics } from './m3-dynamics.mjs';
import { verifyPredict } from './predict.mjs';
import { verifyNovelty } from './novelty.mjs';
import { verifyThreeFactor } from './three-factor.mjs';
import { verifyOutput } from './output.mjs';
import { verifyIOEquivalence } from './io-equivalence.mjs';
import { verifyGoals } from './goals.mjs';
import { verifyRuleStore } from './rule-store.mjs';
import { verifyConsumption } from './prediction-consumption.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

// The two slow independent suites own separate networks/RNGs. Keep every check
// and each suite's elapsed-time bound; run them alongside the remaining checks.
if (!isMainThread) {
  parentPort.postMessage(workerData === 'layer' ? verifyLayer() : verifyM3());
} else {
const start = performance.now();
const suite = name => new Promise((resolve, reject) => {
  const worker = new Worker(new URL(import.meta.url), { workerData: name, stdout: true });
  let output = '', passed = false;
  worker.stdout.on('data', data => { output += data; });
  worker.on('message', ok => { passed = ok; });
  worker.on('error', reject);
  worker.on('exit', code => { process.stdout.write(output); resolve(code === 0 && passed); });
});
const learningSuites = [suite('layer'), suite('m3')];
const core = verifyCore(), unroll = verifyUnroll();
const dynamics = verifyM3Dynamics();
const predict = verifyPredict();
const errors = verifyNovelty();
const threeFactor = verifyThreeFactor();
const consumption = verifyConsumption();
const output = verifyOutput(), equivalence = verifyIOEquivalence();
const goals = verifyGoals(), store = verifyRuleStore(), natural = verifyM11a();
const [layer, m3] = await Promise.all(learningSuites);
const ok = core && layer && unroll && dynamics && m3 && predict && errors && threeFactor && consumption && output && equivalence && goals && store && natural;
console.log(`\nM0: ${core ? 'PASS' : 'FAIL'}; M1: ${layer ? 'PASS' : 'FAIL'}; M2: ${unroll ? 'PASS' : 'FAIL'}; M3: ${m3 && dynamics ? 'PASS' : 'FAIL'}; M4: ${predict ? 'PASS' : 'FAIL'}; M5: ${errors ? 'PASS' : 'FAIL'}; M6/M7: ${threeFactor ? 'PASS' : 'FAIL'} (${((performance.now() - start) / 1000).toFixed(2)} s)`);
process.exitCode = ok ? 0 : 1;
console.log(`M8: ${output && equivalence ? 'PASS' : 'FAIL'}`);
console.log(`M9/M10: ${goals && store ? 'PASS' : 'FAIL'}`);
}
