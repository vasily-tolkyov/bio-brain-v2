# M6: downward three-factor calibration

The original M6 results below are retained for comparison. The M7 extension
and rerun results follow at the end of this document.

Implements design §7–8 and the supervisor's M6 decisions for §10.1 B6/B8.
No later milestones are included. Run `npm test` for fast checks and
`node experiments/m6-calibrate.mjs` for the three-seed acceptance experiment.

`FutureSlices(ids, readDownward(layer2, baseline, ids))` copies the layer-2
readout at the end of rule learning. The copied `downward.weights[].W` is now
independent plastic state. `maxW`, `noise`, and `threshold = mean + 5*SD` remain
the original snapshot values. Predictions use the current `W`, fire only when
`W > threshold`, and have strength `onsetStrength * W / maxW_snapshot`.
Subsequent layer-2 STDP cannot overwrite the store. Already created predictions
retain their original contributions until their deadlines.

`src/three-factor.mjs` ports only the old implementation's exponential decay,
additive eligibility, and bounded updates. It has no neural tick hook, TD
signal, smoothing, callback mechanism, or dependency on feature names.

For each cross-attractor entry `(A, k, B)`, once per 100 ms window:

```
e_M <- exp(-100 / 400) * e_M + active prediction contributions
e_N <- exp(-100 / 400) * e_N + TimeUnroll(A, k)
sat(E) = E / (E + 100)
delta_M = -eta * sat(M(B)) * e_M * W
delta_N = +eta * sat(N(B)) * e_N * (wMax - W)
W <- clamp(W + delta_M + delta_N, 0, wMax)
```

Both deltas use the same pre-update weight. Errors are population spike counts
in that window. Each prediction adds its own strength throughout M5's inclusive
expectation interval, including the deadline. Credits survive comparison max
pooling and decay after the deadline. N uses observed past activity even when
no prediction fires. Missing cross-attractor entries start at zero, so N can
create rules and restore extinguished ones. Self entries are never added or
updated. Freezing learning still advances eligibility.

Constants are module-level and identical for every feature, delay and seed:

| Constant | Value | Reason |
| --- | --- | --- |
| `etaByLayer[2]` | 0.05 | One layer pair exists. Higher layers should use smaller learning rates; no unused higher-layer settings are implemented. |
| `E0` | 100 spikes | M5's unpredicted/missed probes produce roughly 105–110 spikes, concentrated in one 100 ms window; this gives about half-saturation. |
| `tauE` | 400 ms | Supervisor-selected value within design's 300–500 ms range. |
| `wMax` | 1 × snapshot `maxW` | Same scale as the learned store and prediction normalization. An empty/zero snapshot has zero headroom. |

A sustained unit input approaches eligibility 4.52 at 100 ms sampling.
With roughly 100 error spikes, `eta=0.05` therefore gives a correction near
11% of the current weight (M) or remaining headroom (N). No parameter search
or per-phase change is used. One isolated tag retains 47.2% of its credit
after 300 ms and 0.034% after 3200 ms.

Call `learner.step(t, counts, errors.pending)` after `future.update(...)` and
`errors.step(...)`. All trace and weight updates occur outside the spiking
loop. `FutureSlices`, `SpikingErrors`, and `ThreeFactor` state together preserve
weights, provenance, pending deadlines, RNG/neural dynamics and eligibility.

The experiment loads the existing M4 causal caches for seeds 7, 19 and 31.
M5 originally persisted reports rather than calibrated network checkpoints.
`experiments/m6-cache.mjs` replays its unchanged calibration once, caches the
complete boundary under `out/m5-cache/`, and checks source/M4 hashes on reuse.
It never retrains layer 2 or rewrites the M4 caches.

All phases enable downward learning and freeze layer-1, layer-2 and N/M
weights. Every layer-1 and comparator tick runs continuously, including rests.
Phases A/B/C contain 10 causal, 30 lightning-only, and 30 causal trials.
D restores the full end-A state and runs 30 causal trials, cycling jitter
through −300, −200, −100, 0, 100, 200 and 300 ms. Events use M4/M5's 100 ms
lightning, 2000 ms thunder and nominal 3000 ms delay. Slots last 25 s, longer
than the 18.1 s past horizon, to avoid teaching a periodic cross-trial reverse
rule. There are no neural or trace resets between trials.

`out/m6/<timestamp>/results.json` records all per-trial weights, threshold
crossings, prediction rates, total and thunder-only N/M counts, nonzero weight
changes with traces/counts, phase-end weights and cache hashes. `report.md`
summarizes each phase. Acceptance checks extinction and restored prediction
in the last ten trials, declining thunder errors from the first to last ten,
jitter retention, every other rule below threshold at each phase end, and
unchanged frozen weights/reference statistics. Baseline lightning is itself
unpredicted, so its N spikes remain in the reported all-feature totals.

Acceptance passes for all three seeds with the constants above and the settled
equations unchanged. The [full report](../out/m6/2026-10-17T06-16-17.959Z/report.md)
and [raw trajectories](../out/m6/2026-10-17T06-16-17.959Z/results.json) took
656.67 s, including initial M5 calibration-cache creation.

| Seed | End A | Fixed threshold | End B | End C | End D / A | B M first/last 10 | C thunder N first/last 10 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.190405 | 0.143245 | 0.140723 | 0.146938 | 100% | 290 / 0 | 110 / 0 |
| 19 | 0.171904 | 0.133238 | 0.129251 | 0.135273 | 100% | 260 / 0 | 110 / 10 |
| 31 | 0.092272 | 0.073736 | 0.067729 | 0.074566 | 100% | 290 / 0 | 310 / 0 |

All seeds stop predicting after three extinction trials. Predictions resume
after one restore trial for seeds 7/19 and three for seed 31. Every final ten
restore trials predicts once per lightning. D predicts on every trial, with
zero thunder N/M spikes. Every other rule stays below threshold at every phase
end; frozen weights and snapshot reference checks pass.

`npm test`: **67/67 checks pass**, M0–M6 PASS, **15.87 s**. M6 contributes ten
checks, including exact JSON continuation of future/error/eligibility state.
A separate cache-reload check exactly reproduces the saved M5 boundary.

## M7: hit reinforcement and surprise-gated static learning

M/N equations, STDP calcium equation, wall parameters, bin timing, P7 and the
snapshot threshold are unchanged. `THREE_FACTOR.etaHitByLayer[2] = 0.005`
is exactly `0.1 * eta`. One hit adds `eta_hit * e_M * (wMax - W)`, using
the same pre-update W as the M/N terms. No error saturation multiplies a hit.

`ThreeFactor` remembers an actual reality onset only if it falls inside that
contributor's inclusive M5 interval `[arrival-500, arrival+500]` ms. At the
deadline, when the comparator can report a miss, it reinforces each confirmed
downward rule once if that target's M count is zero. It uses the existing
summed M trace at that deadline, preserving each contributor through max
pooling. An onset outside tolerance, sustained activity without a new onset,
or quiet M without matching reality cannot create a hit. Confirmation memory
is included in checkpoints and consumed even when learning is frozen.

`SurpriseGate` reuses the 400 ms trace helper, once per 100 ms window:

```
g <- exp(-100 / 400) * g + sum(N spikes across all features)
layer2.EE.frozen <- !(g > 1)
```

The threshold is one recent population spike, fixed for all seeds/features.
An isolated 100-spike surprise keeps the gate open for about 1.8 s after its
window. Calcium and presynaptic traces continue during closed windows; static
weights, including bistable drift, are frozen. Layer-2 wall iSTDP and layer-1
learning continue unchanged. The comparator runs from the first M3 window with
uncalibrated inhibition. Under M6's existing snapshot contract, no downward
predictions exist until rule learning ends, so every onset in M3 is surprise.
There is no live refresh of the independent downward store.

The M3 experiment saves its exact learned states for M4–M6, including the N
comparator and gate state. Cache signatures now include those learning sources;
M5 checks the current M4 signature instead of accepting the historical fixed
hash. The M6 experiment now explicitly checks both restoration targets:
`W_C/W_A >= 0.85` and `W_C >= threshold + 0.5*(W_A-threshold)`.
M7 records the original C trial-30 weight and all other rules, then continues
C to 60 trials uniformly across seeds. For an isolated unit-strength prediction
the M5 deadline trace is only 4.2318, so one hit closes at most 2.12% of headroom;
30 such hits alone close less than half. The longer observation changes no
learning rate, rule, threshold or event timing. A/B/D keep 10/30/30 trials.

Gated [M3 results](../out/m3/2026-10-17T06-54-14.667Z/results.md): **PASS**,
843.88 s (14.06 min). All causal peaks are column 6; minimum margins are
0.179888 over shuffled and 0.209685 over bird (required 0.05). All six runs
retain three exact six-cell layer-1 groups; all 90 causal onset overlaps occur.

| Seed | Causal / shuffled L→T Δrho@6 | Causal bird→T Δrho@6 | Gate-open %, causal / shuffled | Largest L2 component, causal / shuffled |
| --- | --- | --- | --- | --- |
| 7 | 0.271671 / 0.017308 | 0.061986 | 14.05 / 13.37 | 15 / 8 of 81 |
| 19 | 0.280433 / 0.100545 | 0.008589 | 14.78 / 14.24 | 15 / 5 of 81 |
| 31 | 0.263399 / 0.047730 | 0.032907 | 13.25 / 12.93 | 15 / 7 of 81 |

Gated [M4 results](../out/m4/2026-10-17T07-08-25.077Z/results.md): **PASS**,
180.90 s. Each seed has 20/20 causal predictions at 3200 ms, 10/10 matched
thunder onsets, 0/20 bird probes with predictions (both worlds), and 0/30
shuffled probes with predictions. Causal/shuffled strength per lightning
probe is 1/0 in every seed. All probe weights remain frozen.

Gated [M5 results](../out/m5/2026-10-17T07-11-32.223Z/report.md): **PASS**,
193.71 s. Predicted N, fulfilled M, both jitter errors, rest rates and rest
bursts are zero in every seed; frozen weights and calibration checks pass.

| Seed | Unexpected N / probe | Omitted M / probe | Calibration trials |
| --- | --- | --- | --- |
| 7 | 108 | 105 | 63 |
| 19 | 110 | 106 | 35 |
| 31 | 107 | 108 | 25 |

Hit-reinforced [M6 results](../out/m6/2026-10-17T07-14-53.593Z/report.md):
**PASS at C60**, 731.46 s, including fresh M5 calibration caches. The original
C30 checkpoint exceeds 85% of A in every seed but **misses the halfway-to-baseline
target in every seed**. Both targets pass at C60; no learning constant changed.

| Seed | W initial = A = wMax | Threshold | End B | C30 | C60 | Required C target |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.329637 | 0.263029 | 0.243625 | 0.293735 | 0.309687 | 0.296333 |
| 19 | 0.291788 | 0.240311 | 0.234321 | 0.262322 | 0.275480 | 0.266050 |
| 31 | 0.232669 | 0.191414 | 0.186998 | 0.209107 | 0.219627 | 0.212042 |

| Seed | C30 / A | C60 / A | D / A | Largest false W at any phase end | B thunder M first/last 10 | C thunder N first/last 10 |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 89.11% | 93.95% | 100% | 0.096865 | 290 / 0 | 340 / 0 |
| 19 | 89.90% | 94.41% | 100% | 0.088490 | 200 / 0 | 100 / 0 |
| 31 | 89.87% | 94.39% | 100% | 0.069220 | 200 / 0 | 120 / 0 |

A starts at the snapshot maximum in all three seeds, so hits have zero
headroom and A cannot grow. Extinction stops predictions after 3/2/2 trials;
the last ten B trials have no predictions or M spikes. The final ten C trials
all predict and have no thunder N/M. Jitter keeps every prediction with zero
thunder N/M. Every false rule, including bird→thunder and thunder→lightning,
stays below threshold at A/B/C/D ends and the extra C30 checkpoint. Frozen
weights and snapshot references stay unchanged. An audit of all 57/59/59
nonzero C hit updates matches `eta_hit * e_M * (wMax-W)` exactly.

The pre-gate ablation uses a temporary bypass only on layer-2 EE synapses;
teacher learning keeps the gate. The existing post-only regression also runs
with that bypass and fails at 50 ms. Its surprise gate is held open by 100 N
spikes per window from an unrelated feature, so passing cannot be attributed
to globally frozen learning. The production regression retains this condition.
Five-second direct spike replays give the following rho from initial 0.01;
the presynaptic trace remains exactly zero throughout:

| Post rate | Pre-gate ON | Pre-gate OFF | First post-only LTP without pre-gate |
| --- | --- | --- | --- |
| 20 Hz | 0.002456 | 0.002456 | none |
| 40 Hz | 0.000000851 | 0.309582 | 50 ms |
| 200 Hz | ~0 | 0.616770 | 5 ms |

This prevents removing the pre-gate under the approved safety criterion:
global N gating cannot establish a particular synapse's presynaptic activity.

The full [pre-gate-off M3 ablation](../out/m3/2026-10-17T07-27-18.208Z/results.md)
still **passes M3 on all three seeds**, 837.47 s (13.96 min). All causal peaks
remain column 6; all structural and control-peak checks pass. Event schedules,
N counts, gate-open windows and final layer-1 groups exactly match the protected
runs. The temporary bypass and experiment flag were reverted; **keep the
pre-gate**, because the post-only regression fails despite M3 passing.

| Seed | Causal / shuffled L→T Δrho@6 | Causal bird→T Δrho@6 | Margin over shuffled / bird | Largest L2 component, causal / shuffled |
| --- | --- | --- | --- | --- |
| 7 | 0.271927 / 0.020583 | 0.066718 | 0.251344 / 0.205208 | 15 / 8 of 81 |
| 19 | 0.280984 / 0.103400 | 0.013500 | 0.177584 / 0.267484 | 15 / 5 of 81 |
| 31 | 0.263936 / 0.055567 | 0.034444 | 0.208369 / 0.229491 | 15 / 8 of 81 |

All five long experiments ran in the foreground: **2787.42 s (46.46 min)**
total. All three fresh M4/M5 caches pass their source checks and reload the
complete calibrated boundary exactly after the temporary edits are reverted.

Final `npm test`: **71/71 checks pass**, M0–M7 PASS, **16.11 s**. Four added
checks cover hit factor/bounds, tolerance/M silence, contributor/checkpoint/
freeze behavior, and static-weight freezing without recent N. The existing
post-only regression remains and now explicitly runs with the N gate open.

## M10c: dormant associations and pending action outcomes

Supervisor decision, consistent with settled design §8: the N surprise gate
applies to the whole layer-2 static update (LTP, LTD and bistable drift). Inside
open windows, the M3.1 pre-trace check also prevents post-only LTD on dormant
edges. M7's tick update already froze every rho term outside the N window;
the observed M10b erosion occurred inside open windows. Replica synchronization
now also respects frozen groups.

Implementation interpretation of the requested **zero dormant drift** invariant:
the layer-2 pre gate freezes bistable drift as well as calcium LTD when
`nmda[pre] <= 0.01`. This goes beyond merely adding the check to the calcium
LTD term, which would leave slow weight erosion during unrelated N windows.
All terms and parameters remain unchanged for active-pre synapses. Layer 1
retains its existing rule. Calcium, NMDA traces and delayed arrivals advance
even when learning is frozen. The layer-specific protection is checkpointed.
No authoritative design text was edited; no sleep or later milestone was added.

The [controlled replay](../out/m10c/plasticity-audit.json) uses 30 ten-second
slots, 200 ms of post spikes per slot, 100 unrelated N spikes at each onset,
and an exactly silent pre. Both versions have 570/3000 open N windows and
exactly zero rho change in closed windows. At initial rho 0.16:

| Post rate | Before: final rho / change | M10c: final rho / change |
| --- | --- | --- |
| 20 Hz | 0.111567 / −0.048433 | 0.160000 / 0 |
| 40 Hz | 0.020914 / −0.139086 | 0.160000 / 0 |
| 200 Hz | 0.000020 / −0.159980 | 0.160000 / 0 |

The same replay starting at rho 0.6 also stays exactly unchanged in M10c.
Fast regressions additionally verify active-pre LTD, bidirectional coincidence
(rho 0.616770 each way), expired pre traces, continued calcium dynamics,
frozen replica synchronization, and exact checkpoint continuation.

Seed 19's over-pressing came from partial pending suppression, rather than a
self-sustaining motor attractor or an early deadline. The first old light
probe executed at 100/700/900/1100/1400/1900/2800 ms. Its first prediction had
strength 0.533481, arrival 3300 ms and inclusive deadline 3800 ms; light arrived
at 3100 ms. Multiplying raw goal-M by `1−strength` left 55.98–65.31 effective
spikes, giving 0.359–0.395 drive. Motor P7 fell to 0.722 at 600 ms, below
theta_exec=0.75, then rose to 1 at 700 ms, rearming the execution onset.

M10c holds effective goal-M at zero while any matching positive prediction
is pending, from creation through the existing inclusive ±500 ms deadline.
The persistent goal resumes drive after a miss expires; real onset/cancellation
still clears it. Prediction strength and all learning/normalization equations
stay unchanged. On the [old-weight isolated rerun](../out/m10/2026-10-17T11-08-38.374Z/results.md),
seed 19 improves from 8.05/8.00 actions per bell/light probe to 1.00/1.00,
with 100% achievement and zero extra actions in all 40 planned probes.
Motor P7 is zero in the next window after drive is removed, so no output reset
or refractory constant is needed. [Before/after traces](../out/m10c/motor-audit.json).

Fresh [M3 acceptance](../out/m3/2026-10-17T11-09-38.470Z/results.md):
**PASS, all three seeds**, 887.20 s. Every causal peak remains column 6;
all six runs retain the three exact input groups. Largest causal components
are 15/81 cells; shuffled components are 9/8/9. Control peaks vary by seed.
The exact learned states replace the M4 caches used by M6/M7 calibration.

| Seed | Causal Δrho@6 | Shuffled Δrho@6 | Bird Δrho@6 | Margin vs shuffled / bird |
| --- | --- | --- | --- | --- |
| 7 | 0.308441 | 0.023909 | 0.084459 | 0.284532 / 0.223982 |
| 19 | 0.315471 | 0.110811 | 0.014557 | 0.204661 / 0.300914 |
| 31 | 0.305789 | 0.062842 | 0.041145 | 0.242946 / 0.264643 |

Fresh [M6/M7 calibration](../out/m6/2026-10-17T11-22-34.577Z/report.md):
**PASS at C60, all three seeds**, 785.16 s including regenerated M5 boundaries.
Comparator calibration takes the unchanged 63/35/25 trials. All seeds extinguish
after two omissions, restore all final-ten predictions, retain 100% under jitter,
and keep every false rule below threshold. Frozen weights and snapshot-reference
checks pass. C30 still misses the halfway target in each seed; the established
C60 protocol is unchanged.

| Seed | A | Threshold | B | C30 | C60 | C60/A | D/A | B thunder M first/last 10 | C thunder N first/last 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.345194 | 0.285196 | 0.275853 | 0.312778 | 0.327318 | 94.82% | 100% | 210/0 | 210/0 |
| 19 | 0.309226 | 0.264389 | 0.248324 | 0.283577 | 0.295159 | 95.45% | 100% | 200/0 | 300/0 |
| 31 | 0.263106 | 0.220883 | 0.211461 | 0.238656 | 0.249629 | 94.88% | 100% | 200/0 | 210/0 |

The [M7 mixed hit/miss rerun](../out/m7b/2026-10-17T11-32-58.672Z/report.md)
also **passes 3/3**, 216.43 s. The same 30 alternating trials weaken W by
19.01%/19.02%/21.97%; hit-only gain/miss-loss ratios are
0.004628/0.004874/0.004178 (required ≤0.2). The all-gains reference ratios,
which include surprise relearning, are 0.6290/0.5826/0.5695. Learning rates,
acceptance definitions, frozen weights and snapshot references stay unchanged.

Fresh M10 T1/T2 teachers preserve the silent **press@6 → light@0** direction
exactly in every seed. The reverse direction has active light presynaptic cells
during T2, so its ordinary pre-eligible LTD/drift remains permitted. Consequently
the bidirectional rule-readout mean still changes slightly; it is not a wholly
dormant directed synapse. All nine direct press→bell columns remain zero.

| Seed | Old pooled T2 Δrho | M10c pooled T2 Δrho | M10c silent forward Δrho | M10c active reverse Δrho |
| --- | --- | --- | --- | --- |
| 7 | −0.046000 | −0.001973 | 0 exactly | −0.003947 |
| 19 | −0.043302 | −0.001634 | 0 exactly | −0.006535 |
| 31 | −0.036573 | −0.003190 | 0 exactly | −0.004785 |

Forward/reverse edge counts are 1/1, 3/1, and 2/4, respectively; the pooled
change weights each direction by its actual edge count. Teacher sensory/motor
artifacts are unchanged; all rule-layer teachers are regenerated. Original M10
teachers are archived under `out/m10c/before/m10-cache/` for the comparison.

Fresh [M8 acceptance](../out/m8/2026-10-17T11-10-19.676Z/results.md):
**PASS, all three seeds**, 1954.65 s. Press peaks at column 6 and wave at
column 4 in every seed. The same six runs produce 540 executions and matching
efference copies; weak-drive actions and copies remain zero.

| Seed | Rule | Causal Δrho | Shuffled Δrho | Margin vs shuffled | Margin vs cross/bird controls |
| --- | --- | --- | --- | --- | --- |
| 7 | press→light @6 | 0.137377 | 0.035737 | 0.101640 | 0.103701 |
| 7 | wave→bell @4 | 0.192601 | 0.023164 | 0.169437 | 0.193010 |
| 19 | press→light @6 | 0.138773 | 0.020921 | 0.117852 | 0.094131 |
| 19 | wave→bell @4 | 0.188335 | −0.000588 | 0.188923 | 0.188629 |
| 31 | press→light @6 | 0.146371 | 0.025347 | 0.121025 | 0.108371 |
| 31 | wave→bell @4 | 0.116625 | −0.000360 | 0.116984 | 0.091708 |

Fresh [M10 acceptance](../out/m10/2026-10-17T11-11-21.810Z/results.md):
**PASS, all three seeds**, 1795.88 s elapsed (seed 31 teacher preparation ran
concurrently). Same 20 probes of each of five conditions, with unchanged limits.

| Seed | Press first, bell/light | Bell achieved / natural empty stack | Light achieved / natural empty stack | Actions/probe, bell/light | Extra actions/probe |
| --- | --- | --- | --- | --- | --- |
| 7 | 100% / 100% | 95% / 95% | 100% / 100% | 1 / 1 | 0 |
| 19 | 100% / 100% | 100% / 100% | 100% / 100% | 1 / 1 | 0 |
| 31 | 100% / 100% | 95% / 95% | 100% / 100% | 1 / 1 | 0 |

Each seed writes exactly 20 bell subgoals. All 180 control/ablation probes
execute zero actions; distractors and post-satisfaction actions are zero.
The [independent audit](../out/m10c/audit.json) verifies all 300 fresh probes,
120 executions = 120 efference copies, first-admitted W/cutoff retention,
unchanged sensory/motor teacher state, current calibration artifact hashes,
protected new rule-layer checkpoints, and every experiment's acceptance flags.

Final [npm test output](../out/m10c/tests.txt): **94/94 checks, M0–M10 PASS,
23.62 s**. Code changes: `src/stdp.mjs`, `src/layer.mjs`, `src/core/state.mjs`,
`src/goals.mjs`; regression changes: `verify/m3-dynamics.mjs`, `verify/goals.mjs`;
report/teacher diagnostics: `experiments/m3-causal.mjs`,
`experiments/m10-cache.mjs`, `experiments/m10-diagnostics.mjs`,
`experiments/m10-goals.mjs`. Notes are in this file and README. Existing M10/M10b
work is preserved, the authoritative design is untouched, and no commit was made.
