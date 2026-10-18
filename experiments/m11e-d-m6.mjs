/** Only missing C/D phases; B is restored, never silently rerun. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { baseDirectory, readJSON, cachedCausal, restore } from './m11e-d-state.mjs';
import { calibrationTrial } from './m6-trial.mjs';
import { DOWNWARD } from '../src/downward.mjs';
const seed = Number(process.argv[2]); assert.ok([7, 19, 31].includes(seed));
const dir = `out/m11e-roles/${seed}`, base = baseDirectory(seed);
mkdirSync(dir, { recursive: true });
const p = cachedCausal(seed).pipeline, endA = readJSON(`${base}/end-A-state.json`);
const key = JSON.stringify([p.mapping.find(a => a.feature === 'lightning').id, 6,
  p.mapping.find(a => a.feature === 'thunder').id]);
const referenceW = endA.learning.future.downward.weights.find(w => w.ruleKey === key).W;
const results = existsSync(`${dir}/m6-extra.json`) ? readJSON(`${dir}/m6-extra.json`) : { seed };
for (const [name, n, state] of [['D', 30, `${base}/end-A-state.json`], ['C', 60, `${dir}/end-B-state.json`]]) {
  if (results[name]) continue;
  if (!existsSync(state)) { results.missing = state; continue; }
  restore(p, readJSON(state));
  const run = calibrationTrial(p, key), trials = [], jitter = [-300, -200, -100, 0, 100, 200, 300];
  for (let i = 0; i < n; i++) {
    trials.push(run(true, 3000 + (name === 'D' ? jitter[i % jitter.length] : 0)));
    if ((i + 1) % 10 === 0) console.log(`${seed} ${name}${i + 1}: u=${trials.at(-1).W / DOWNWARD.wMax}`);
  }
  const ratio = trials.at(-1).W / referenceW;
  results[name] = { trials, ratio, pass: ratio >= (name === 'C' ? 0.85 : 0.8) };
  if (name === 'C') delete results.missing;
  writeFileSync(`${dir}/m6-extra.json`, JSON.stringify(results));
}
writeFileSync(`${dir}/m6-extra.json`, JSON.stringify(results));
console.log(JSON.stringify({ seed, C: results.C?.ratio, D: results.D?.ratio, missing: results.missing }));
