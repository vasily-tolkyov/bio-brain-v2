/** Check saved quiet-window births; right censoring is never called deletion. */
import { existsSync } from 'node:fs';
import { readJSON, baseDirectory } from './m11e-d-state.mjs';
import { killCount } from './m11e-d-measure.mjs';
import { DOWNWARD } from '../src/downward.mjs';
import { THREE_FACTOR } from '../src/three-factor.mjs';
import { ERRORS } from '../src/errors.mjs';
import { LIT_THRESHOLD } from '../src/readout.mjs';
import { OUTPUT } from '../src/output.mjs';
export function pruningEvidence(seed) {
  const base = baseDirectory(seed), dir = `out/m11e-roles/${seed}`;
  const read = path => existsSync(path) ? readJSON(path) : null;
  const calibration = read(`${base}/calibration.json`);
  const exposures = ['storm-rest', 'natural-rest'].map(name => ({ name, data: read(`${base}/${name}.json`)?.creations }));
  exposures.push(...['A', 'B', 'E'].map(name => ({ name, data: calibration?.[name].restCreations,
    state: read(`${name === 'A' ? base : dir}/end-${name}-state.json`) })));
  let missing = exposures.some(r => !r.data);
  const rows = exposures.filter(r => r.data).map(({ name, data, state }) => {
    const episodes = data.episodes.filter(e => e.quiet).map(e => {
      if (e.death !== null) return { ...e, status: 'deleted' };
      if (!state) return { ...e, status: 'unresolved' };
      const f = state.learning.future, w = f.downward.weights.find(w => w.ruleKey === e.ruleKey && w.createdAt === e.createdAt);
      if (!w) return { ...e, status: 'unresolved' };
      const entries = [...f.records.flatMap(r => r.entries), ...f.entries, ...f.arrivals];
      const onsets = new Set(entries.filter(p => p.ruleKey === e.ruleKey && p.createdAt === e.createdAt).map(p => p.tOnset)).size;
      // n_kill is at least one for a positive generation, so K is at least 3.
      if (onsets < 3) return { ...e, onsets, status: 'still dying' };
      const minimumM = THREE_FACTOR.etaMissByLayer[2] * Math.min(LIT_THRESHOLD, OUTPUT.thetaExec) *
        Math.exp(-2 * ERRORS.toleranceMs / THREE_FACTOR.tauE);
      const maximumK = killCount(DOWNWARD.wInit / DOWNWARD.wMax, minimumM) + 2;
      if (w.deltas.STDP === 0 && onsets >= maximumK) return { ...e, onsets, maximumK, status: 'violation' };
      return { ...e, onsets, status: 'unresolved' };
    });
    return { name, quietSeconds: data.quietSeconds, births: data.quietCreations, rate: data.per300Seconds,
      episodes, counts: Object.fromEntries(['deleted', 'still dying', 'violation', 'unresolved'].map(status =>
        [status, episodes.filter(e => e.status === status).length])) };
  });
  missing ||= rows.some(r => r.counts.unresolved > 0);
  const violations = rows.reduce((n, r) => n + r.counts.violation, 0);
  return { rows, pass: violations ? false : missing ? null : true };
}
