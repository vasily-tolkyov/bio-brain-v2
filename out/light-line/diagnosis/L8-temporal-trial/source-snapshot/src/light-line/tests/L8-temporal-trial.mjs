import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { temporalStorm } from './L8-suite.mjs';
import { SavedAudit } from './L8-audit.mjs';
import { read, write, hash, sha, schedule, files } from './L8-common.mjs';
import { temporalTrialGate } from './L8-temporal-gate.mjs';
import { TEMPORAL_DEFAULTS, TEMPORAL_DOSE } from '../temporal-config.mjs';

export const TRIAL_ROOT = 'out/light-line/diagnosis/L8-temporal-trial';
const BASELINE = 'out/light-line/acceptance/L8/development/r2';

function auditTemporal(data) {
  const a = new SavedAudit(), checks = [], exposure = [];
  const check = (name, fn) => {
    try { fn(); checks.push({ name, pass: true }); }
    catch (e) { checks.push({ name, pass: false, reason: e.message }); }
  };
  check('identical-arm-initial-state', () => {
    assert.equal(hash(data.arms[0].initial), hash(data.arms[1].initial));
    assert.equal(hash(data.arms[0].initial), hash(data.arms[2].initial));
  });
  for (const arm of data.arms) {
    check(`${arm.name}:rho-color-samples`, () => exposure.push({ name: arm.name,
      ...a.rho(arm.presentations, arm.channels.upper) }));
    check(`${arm.name}:fields-and-paths`, () => {
      for (const p of [...arm.probes.map(p => p.result), arm.target]) a.field(arm.channels.upper,
        [...p.selected.values, ...Array(250 - p.selected.values.length).fill(0)], 1 / 6, p.field);
      arm.cleared.field.brightness.forEach((v, i) => a.near(v, arm.cleared.selected.values[i] ?? 0));
    });
    // Preserve the original membership assertion, including contrast=M2.
    check(`${arm.name}:original-temporal-membership`, () => a.higherMembers(arm));
  }
  return { pass: checks.every(c => c.pass), checks, exposure, maxError: a.maxError,
    arithmetic: a.arithmetic, fields: a.fields, matureCounts: data.arms.map(a => ({ name: a.name, M2: a.M2.length })) };
}

export function runTemporalTrial() {
  const seed = 101, savedSchedule = read(`${BASELINE}/schedule.json`);
  assert.equal(savedSchedule.seed, seed);
  assert.deepEqual(savedSchedule, schedule(seed), 'Reuse exactly the original development schedule');
  const before = read(`${BASELINE}/temporal.json.gz`);
  assert.ok(before.arms.every(a => a.presentations.every(p => p.strengthScale === .1)));
  // This is the only model branch run: no full-suite/acceptance runner or other seed.
  console.log('Running temporalStorm development seed 101 (30 trials per arm).');
  const after = temporalStorm(seed, savedSchedule);
  write(`${TRIAL_ROOT}/temporal-after.json.gz`, after);
  write(`${TRIAL_ROOT}/schedule.json`, savedSchedule);
  const invariants = after.arms.map((a, i) => {
    const b = before.arms[i];
    assert.equal(a.name, b.name);
    assert.deepEqual(a.initial, b.initial);
    assert.deepEqual(a.lowerPresentations, b.lowerPresentations);
    assert.deepEqual(a.channels.lower, b.channels.lower);
    assert.deepEqual(a.presentations.map(({ strengthScale, ...p }) => p),
      b.presentations.map(({ strengthScale, ...p }) => p));
    assert.ok(a.presentations.every(p => p.strengthScale === TEMPORAL_DOSE));
    return { name: a.name, identicalInitialState: true, identicalLowerLearning: true,
      identicalUpperEventsExceptDose: true, upperEvents: a.presentations.length };
  });
  const beforeHistorical = temporalTrialGate(before, 3), beforeAmended = temporalTrialGate(before);
  const afterAmended = temporalTrialGate(after), auditBefore = auditTemporal(before), auditAfter = auditTemporal(after);
  const oldAudit = read(`${BASELINE}/audit.json`);
  const result = { trial: 'L8-temporal-trial', seed, officialAcceptanceRevision: false,
    historicalL8: 'FAIL L8-r2; unchanged', settings: TEMPORAL_DEFAULTS,
    baseline: { file: `${BASELINE}/temporal.json.gz`, sha256: sha(`${BASELINE}/temporal.json.gz`) },
    math: { dose: TEMPORAL_DOSE, coLit: 'rho_next = 1 - (1-rho) * 0.8^dose',
      oneEnd: 'rho_next = rho * 0.96^dose', neither: 'rho_next = rho',
      fromZeroNoDepression: 'rho_n = 1 - 0.25^(n/10)',
      perCoLitComplementMultiplier: .8 ** TEMPORAL_DOSE, perOneEndMultiplier: .96 ** TEMPORAL_DOSE,
      samples: [0, 1, 5, 10, 20, 30, 50, 100].map(n => ({ n, oldRho: 1 - .8 ** (.1 * n), rho: 1 - .8 ** (TEMPORAL_DOSE * n) })) },
    invariants, beforeHistorical, beforeAmended, afterAmended, auditBefore, auditAfter,
    temporalPass: afterAmended.pass && auditAfter.pass,
    unrerunHistoricalFailures: oldAudit.decisions.filter(d => !d.pass && !d.name.startsWith('temporal-')),
    sourceSha256: Object.fromEntries(files('src/light-line').map(p => [p, sha(p)])) };
  write(`${TRIAL_ROOT}/result.json`, result);
  const summary = gate => {
    const g = (name, event) => gate.metrics.find(m => m.name === name).gains.find(g => g.k === 6 && g.event === event);
    return { pass: gate.pass, exclusive: g('causal', 0).rows[0].exclusive,
      A6_B: g('causal', 0).meanB, completion: g('causal', 0).coverage,
      shuffled_B: g('shuffled', 0).meanB, distractor_B: g('causal', 2).meanB, reverse_B: g('reverse', 0).meanB };
  };
  console.log(JSON.stringify({ before: summary(beforeHistorical), gateOnly: summary(beforeAmended),
    after: summary(afterAmended), arithmeticAndMembership: auditAfter.pass, temporalPass: result.temporalPass }, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 2, 'Fixed seed 101 and diagnosis destination; no CLI overrides');
  runTemporalTrial();
}
