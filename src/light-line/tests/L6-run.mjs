import { writeFileSync, readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { acquireOptics, acquireRules, motorChecks, goalEpisodes, reliefProbes, opticalControls, secondOptics, rewardReplays } from './L6-protocol.mjs';
import { boundaryChecks } from './L6-checks.mjs';
import { auditRun } from './L6-audit.mjs';

export function run(seed, progress = console.log) {
  progress(`L6 ${seed}: natural optical samples`);
  const a = acquireOptics(seed);
  const boundaries = boundaryChecks(seed, a.optics);
  progress(`L6 ${seed}: action-contingent experience`);
  const b = acquireRules(seed, a.optics);
  progress(`L6 ${seed}: motor and goal/body episodes`);
  const motor = motorChecks(seed, a.optics, b.p.learning.downward, b.p.temporal);
  const goals = goalEpisodes(seed, a.optics, b.p.learning.downward, b.p.temporal);
  const relief = reliefProbes(b.p);
  const optical = opticalControls(a.optics);
  progress(`L6 ${seed}: reward counterfactuals, two independent worlds`);
  const second = secondOptics(seed);
  const reward = rewardReplays(seed, a.optics, b.p.learning.downward, second);
  return { seed, formation: a.evidence, rules: b.evidence, boundaries, motor, goals, relief, optical,
    second: { samples: second.samples, declarations: second.declarations }, reward };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--dev') {
    const raw = run(101);
    writeFileSync('/tmp/light-line-L6-development-101.json.gz', gzipSync(JSON.stringify(raw)));
    const audit = auditRun(raw);
    writeFileSync('/tmp/light-line-L6-development-101-audit.json', JSON.stringify(audit, null, 2));
    console.log(JSON.stringify(audit, null, 2));
  } else if (process.argv[2] === '--audit-dev') {
    const audit = auditRun(JSON.parse(gunzipSync(readFileSync('/tmp/light-line-L6-development-101.json.gz'))));
    writeFileSync('/tmp/light-line-L6-development-101-audit.json', JSON.stringify(audit, null, 2));
    console.log(JSON.stringify(audit, null, 2));
  } else throw new Error('Use --dev or --audit-dev; campaign acquisition has a separate one-shot gate');
}
