/** Recover the B55 replay evidence preserved in the pre-restart run log. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = 'logs/codex-M11e-b.log', log = readFileSync(source, 'utf8');
const start = log.indexOf('{\n  "exactTrajectory": true,\n  "changes": [');
assert.ok(start >= 0, 'Archived B55 replay output is missing');
const evidence = JSON.parse(log.slice(start, log.indexOf('\n}', start) + 2));
assert.equal(evidence.exactTrajectory, true);
assert.equal(evidence.changes.length, 1);
const [birth] = evidence.changes;
assert.equal(birth.trial, 55);
assert.equal(birth.error.reality, 0);
assert.equal(birth.error.Nraw, 6);
const provenance = { source, line: log.slice(0, start).split('\n').length,
  sha256: createHash('sha256').update(log).digest('hex'),
  implementation: 'bee1ea8', archivedReplay: true,
  note: 'The original replay matched 56 B trials exactly. Its JSON files were lost in the restart; this is archived output, not a new replay.' };
writeFileSync('out/m11e-pilot-b/prior-b55.json', JSON.stringify({ ...evidence, provenance }));
console.log(JSON.stringify({ birth, provenance }));
