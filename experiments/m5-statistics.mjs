/** Experiment-only measurements; none of these statistics gate neural activity. */
import { ERRORS, restCount, effectiveMiss, effectiveNovelty } from '../src/errors.mjs';
import { WINDOW_MS } from '../src/readout.mjs';

export const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
export const variance = xs => {
  const average = mean(xs);
  return mean(xs.map(x => (x - average) ** 2));
};

// Sum of signed Poisson deviations: mean=0, variance=total expected rest count.
export function restReference(durationMs) {
  const rawMean = restCount(durationMs);
  return { rawMean, deviationMean: 0, deviationSD: Math.sqrt(rawMean) };
}

/** Inclusive window labels, as in SpikingErrors: N spans 11 windows, M the last.
 * A counterfactual arrival may measure unexpected N, without driving predictions.
 */
export function predictionCounts(windows, predictions) {
  return predictions.map(({ B: id, tArrive }) => {
    const rows = windows.flat().filter(c => c.id === id &&
      c.t >= tArrive - ERRORS.toleranceMs && c.t <= tArrive + ERRORS.toleranceMs);
    const deadline = rows.find(c => c.t === tArrive + ERRORS.toleranceMs);
    if (rows.length !== 2 * ERRORS.toleranceMs / WINDOW_MS + 1 || !deadline) {
      throw new Error('Incomplete prediction comparison windows');
    }
    const N = rows.reduce((s, c) => s + c.N, 0), M = deadline.M;
    const Nlimit = 3 * restReference(rows.length * WINDOW_MS).deviationSD;
    const Mlimit = 3 * restReference(WINDOW_MS).deviationSD;
    const Neff = effectiveNovelty(N, rows.length * WINDOW_MS), Meff = effectiveMiss(M);
    return { id, tArrive, N, M, Nraw: rows.reduce((s, c) => s + c.Nraw, 0), Mraw: deadline.Mraw,
      Nlimit, Mlimit, Neff, Meff, nearRest: Neff === 0 && Meff === 0 };
  });
}

export function restRecorder(errors, duration) {
  const start = errors.net.t;
  const populations = errors.rows.flatMap(row => ['N', 'M'].map(kind => ({
    id: row.id, kind, bins: new Uint32Array(duration / 10),
    cells: row[kind].map(cell => ({ cell, count: 0, bursts: 0, last: [] })),
  })));
  return {
    record() {
      for (const pop of populations) for (const c of pop.cells) for (const t of errors.net.spikes[c.cell]) {
        c.count++;
        if (c.last.length === 2 && t - c.last[0] <= 20 + 1e-7) c.bursts++;
        c.last.push(t); if (c.last.length > 2) c.last.shift();
        pop.bins[Math.floor((t - start - 1e-7) / 10)]++;
      }
    },
    finish() {
      return populations.map(pop => ({ ...pop, bins: [...pop.bins],
        cells: pop.cells.map(({ last, ...c }) => ({ ...c, rateHz: c.count / (duration / 1000) })) }));
    },
  };
}

export function summarizeRest(trials) {
  const rests = trials.filter(t => t.kind === 'rest'), seconds = rests.reduce((s, t) => s + t.duration, 0) / 1000;
  return rests[0].populations.map((p, index) => {
    const records = rests.map(t => t.populations[index]);
    const cells = p.cells.map((c, i) => ({ cell: c.cell,
      rateHz: records.reduce((s, r) => s + r.cells[i].count, 0) / seconds,
      burstsPerSecond: records.reduce((s, r) => s + r.cells[i].bursts, 0) / seconds }));
    const rates = cells.map(c => c.rateHz), bins = records.flatMap(r => r.bins);
    const meanHz = mean(rates), burstsPerSecond = cells.reduce((s, c) => s + c.burstsPerSecond, 0);
    const fano = variance(bins) / mean(bins);
    return { id: p.id, kind: p.kind, cells, meanHz, minHz: Math.min(...rates), maxHz: Math.max(...rates),
      burstsPerSecond, fano, pass: meanHz >= 0.5 && meanHz <= 3 && burstsPerSecond <= 0.5 && fano <= 1.5 };
  });
}

/** Isolated direct afferents, continuous calibrated comparator, all learning frozen.
 * One 100 ms signal at offset 1100; N expectation / M deadline readout.
 * Rest controls use exactly the same timing. No strength-dependent parameters.
 */
export function linearity(errors, id) {
  const index = errors.ids.indexOf(id), results = [];
  for (const kind of ['M', 'N']) for (const strength of [0, 0.05, 0.1, 0.2, 0.3, 0.5, 1]) {
    if (kind === 'N' && strength === 0.05) continue;
    const trials = [];
    for (let n = 0; n < 10; n++) {
      const start = errors.t + WINDOW_MS, total = { deviation: 0, raw: 0, active: 0, activeRaw: 0 };
      for (let offset = 0; offset < 3000; offset += WINDOW_MS) {
        const now = errors.ids.map(() => 0);
        if (kind === 'N' && offset === 1100) now[index] = strength;
        const created = kind === 'M' && offset === 0 ? [{ B: id, tArrive: start + 600, strength }] : [];
        const r = errors.step(start + offset, now, created)[index];
        if (kind === 'M' ? offset === 1100 : offset >= 1100 - ERRORS.toleranceMs && offset <= 1100 + ERRORS.toleranceMs) {
          total.deviation += r[kind]; total.raw += r[`${kind}raw`];
        }
        if (offset === 1100) { total.active = r[kind]; total.activeRaw = r[`${kind}raw`]; }
      }
      trials.push({ ...total, ...(kind === 'M' ? { Meff: effectiveMiss(total.deviation) } : {}) });
    }
    const deviations = trials.map(t => t.deviation);
    results.push({ kind, strength, deviation: mean(deviations), raw: mean(trials.map(t => t.raw)),
      active: mean(trials.map(t => t.active)), activeRaw: mean(trials.map(t => t.activeRaw)),
      sem: Math.sqrt(variance(deviations) / (trials.length - 1)), trials });
  }
  return results;
}

export function missSummary(deviations) {
  const effective = deviations.map(effectiveMiss);
  return { trials: deviations.length, M: mean(deviations), deadband: 3 * Math.sqrt(restCount(WINDOW_MS)),
    Meff: mean(effective), sem: Math.sqrt(variance(effective) / (effective.length - 1)),
    positiveFraction: effective.filter(x => x > 0).length / effective.length, deviations, effective };
}

/** Per-trial joint silence; means are diagnostic, never the acceptance test. */
export function matchedSummary(counts) {
  return { ...missSummary(counts.map(c => c.M)), Neff: mean(counts.map(c => c.Neff)),
    qualified: counts.filter(c => c.nearRest).length,
    quietFraction: counts.filter(c => c.nearRest).length / counts.length };
}

export function calibrationSummary(history) {
  const last = history.slice(-100);
  const distribution = xs => ({ mean: mean(xs), sd: Math.sqrt(variance(xs)),
    min: Math.min(...xs), max: Math.max(...xs), zeroFraction: mean(xs.map(x => Number(x === 0))) });
  const means = last.map(t => mean(t.weights.flatMap(w => w.M)));
  return { trials: history.length, lastTrials: last.length,
    qualified: last.filter(t => t.qualified).length,
    qualifyingFraction: mean(last.map(t => Number(t.qualified))),
    Neff: distribution(last.flatMap(t => t.counts.map(c => c.Neff))),
    Meff: distribution(last.flatMap(t => t.counts.map(c => c.Meff))),
    Mweight: distribution(means),
    MweightStepRMS: Math.sqrt(mean(means.slice(1).map((m, i) => (m - means[i]) ** 2))),
    anchors: [...new Set(last.map(t => t.delay))].map(delay => {
      const ts = last.filter(t => t.delay === delay), cs = ts.flatMap(t => t.counts);
      return { delay, trials: ts.length, qualifying: ts.filter(t => t.qualified).length,
        N: distribution(cs.map(c => c.N)), M: distribution(cs.map(c => c.M)),
        Neff: distribution(cs.map(c => c.Neff)), Meff: distribution(cs.map(c => c.Meff)),
        Mweight: distribution(ts.map(t => mean(t.weights.flatMap(w => w.M)))) };
    }) };
}
