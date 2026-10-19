/** Read-only event-learning audit; no control or learning intervention. */
import { DOWNWARD } from '../src/downward.mjs';
import { NOVELTY } from '../src/novelty.mjs';
import { predictionCredit, missDelta } from '../src/three-factor.mjs';
const clone = x => structuredClone(x);
export function observe(p) {
  const generations = new Map(), predictions = new Map(), weightChanges = [], windows = [], formulaChecks = [], identityViolations = [];
  const register = (w, t, presentAtStart = false) => {
    if (generations.get(w.generation)?.deletedAt !== null && generations.get(w.generation)?.deletedAt !== undefined) identityViolations.push({ t, generation:w.generation, ruleKey:w.ruleKey });
    if (!generations.has(w.generation)) generations.set(w.generation, { generation: w.generation, ruleKey: w.ruleKey,
      A: w.A, B: w.B, k: w.k, createdAt: w.createdAt, presentAtStart, observedFrom: t,
      initialW: w.W, lastMeasuredW: w.W, initialDeltas: clone(w.deltas), finalDeltas: clone(w.deltas),
      predictionsEmitted: 0, matches: 0, unmatchedDeadlines: 0, deletedAt: null });
    return generations.get(w.generation);
  };
  for (const w of p.downward.weights) register(w, p.t, true);
  const key = e => JSON.stringify([e.generation, e.tOnset, e.tArrive]);
  const registerPrediction = (e, t, emittedHere = false) => {
    if (!predictions.has(key(e))) {
      predictions.set(key(e), { ...clone(e), observedFrom: t, emittedHere, firstMatchedAt: null, deadlineAt: null,
        matchObserved: e.matched > 0, matchedBeforeObservation: e.matched > 0 });
      if (emittedHere) generations.get(e.generation).predictionsEmitted++;
    }
    return predictions.get(key(e));
  };
  for (const e of p.errors.pending) registerPrediction(e, p.t);
  const original = p.factor.step;
  p.factor.step = function(t, counts, pending, options) {
    const before = new Map(p.downward.weights.map(w => {
      register(w, t); return [w.generation, { w, W: w.W, deltas: clone(w.deltas) }];
    }));
    for (const e of p.future.created) registerPrediction(e, t, true);
    const deadlines = [];
    for (const e of pending) {
      const event = registerPrediction(e, t), g = generations.get(e.generation);
      event.matched = e.matched;
      if (e.matched > 0 && !event.matchObserved) {
        event.matchObserved = true; event.firstMatchedAt = t; event.matchedStrength = e.matched;
        event.timingCredit = predictionCredit(e.activation, e.tArrive, t);
        event.generationLiveAtMatch = before.has(e.generation);
        if (g) g.matches++;
      }
      if (t === e.tArrive + NOVELTY.toleranceMs) {
        event.deadlineAt = t; event.unmatched = !(e.matched > 0); event.generationLiveAtDeadline = before.has(e.generation);
        event.learnerCreditBeforeDeadline = clone(this.predictions.find(c => c.generation === e.generation && c.tArrive === e.tArrive) ?? null);
        event.targetNovelty = clone(counts.find(c => c.id === e.B));
        if (event.unmatched && g) g.unmatchedDeadlines++;
        deadlines.push(event);
      }
    }
    const dueInputs = pending.filter(e => t === e.tArrive + NOVELTY.toleranceMs && !(e.matched > 0) && before.has(e.generation));
    const result = original.call(this, t, counts, pending, options);
    const after = new Map(p.downward.weights.map(w => [w.generation, w]));
    const deltas = new Map();
    for (const [generation, b] of before) {
      const g = generations.get(generation), w = b.w, live = after.has(generation);
      const ledgerDelta = Object.fromEntries(Object.keys(w.deltas).map(k => [k, w.deltas[k] - b.deltas[k]]));
      const due = dueInputs.filter(e => e.generation === generation);
      if (due.length || ledgerDelta.miss !== 0) {
        let expectedW = b.W + ledgerDelta.STDP, expectedMiss = 0;
        for (const e of due) {
          if (expectedW <= 0) break;
          const delta = missDelta(expectedW, DOWNWARD.wMax, e.activation);
          expectedMiss += delta; expectedW = Math.max(0, expectedW + delta);
        }
        formulaChecks.push({ t, generation, count: due.length, expectedMiss, actualMiss: ledgerDelta.miss,
          expectedW, actualW: w.W, pass: Math.abs(expectedMiss - ledgerDelta.miss) < 1e-12 && Math.abs(expectedW - w.W) < 1e-12 });
      }
      g.lastMeasuredW = w.W; g.finalDeltas = clone(w.deltas);
      if (!live) g.deletedAt ??= t;
      deltas.set(generation, ledgerDelta);
      if (!live || w.W !== b.W || Object.values(ledgerDelta).some(v => v !== 0)) weightChanges.push({
        t, generation, ruleKey: w.ruleKey, beforeW: b.W, afterW: w.W, deltaW: w.W - b.W,
        liveAfter: live, ledgerDelta, structuralRemoval: !live });
    }
    for (const w of after.values()) if (!before.has(w.generation)) {
      const g = register(w, t);
      g.birthNovelty = clone(counts.find(c => c.id === w.B));
      g.birthSourceActivity = p.unroll.lines(t)[p.unroll.indices.get(w.A) * 9 + w.k];
      weightChanges.push({ t, generation: w.generation, ruleKey: w.ruleKey, beforeW: 0, afterW: w.W,
        deltaW: w.W, liveAfter: true, birth: true, ledgerDelta: clone(w.deltas) });
    }
    for (const e of deadlines) e.generationLedgerDeltaAtDeadline = deltas.get(e.generation) ?? null;
    windows.push({ t, counts: clone(counts) });
    return result;
  };
  return { finish() {
    const live = new Set(p.downward.weights.map(w => w.generation));
    return { generations: [...generations.values()].map(g => ({ ...g, live: live.has(g.generation) })),
      predictions: [...predictions.values()], weightChanges, windows, formulaChecks, identityViolations,
      pendingAtEnd: clone(p.errors.pending), learnerPendingAtEnd: clone(p.factor.predictions),
      semantics: 'Generation identity is the persisted monotonic generation ID, not rule key or birth time. Removed edges retain last measured residual W. Unmatched deadlines are actual observed prediction events, including events whose generation was already deleted; ledger changes show which events could affect learning. Preexisting pending predictions have observation bounds, not reconstructed match times.' };
  } };
}
