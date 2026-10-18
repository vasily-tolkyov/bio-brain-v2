// M7b is an exact end-A branch inside the all-learning M6/M7 suite.
import { mkdirSync, writeFileSync } from 'node:fs';
import { calibrationSuite } from './m6-calibrate.mjs';
import { SEEDS } from './m4-learning.mjs';
const directory = 'out/m11c-graded/m7b/';
mkdirSync(directory, { recursive: true });
const runs = (process.argv[2] ? [Number(process.argv[2])] : SEEDS).map(calibrationSuite);
writeFileSync(`${directory}results.json`, JSON.stringify({ runs }));
console.log(JSON.stringify(runs.map(r => ({ seed: r.seed, ...r.mixed, pass: r.checks.asymmetry }))));
process.exitCode = runs.every(r => r.checks.asymmetry) ? 0 : 1;
