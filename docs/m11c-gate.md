**M11c-gate: FAIL.** Tonic rest and weak-error sensitivity pass. Calibration fails in every seed; seed 7 misses the M contrast criterion. The prescribed positive deviation also opens the surprise gate at rest and grows weights when source eligibility exists. Implementation stopped at these failures; no compensating mechanism or downward-weight formula change was added.

Artifacts: [full population/probe tables](../out/m11c-gate/2026-10-17T15-43-33.737Z/report.md), [raw counts, cells, bins, calibration and linearity trials](../out/m11c-gate/2026-10-17T15-43-33.737Z/results.json), [cache and rest-consumer audit](../out/m11c-gate/2026-10-17T15-43-33.737Z/audit.json), [npm test output](../out/m11c-gate/2026-10-17T15-43-33.737Z/tests.txt). Run with `node experiments/m5-errors.mjs`.

Only `ERRORS.tonicHz=10.3` and `targetHz=1.5` were introduced/changed. The existing external Poisson path draws independently for every N/M cell (60 afferents/cell, 10 contacts, release 0.3, recovery 100 ms); 10.3 Hz is the afferent rate, not the output rate. An isolated rest-only parameter check gave 1.334/1.481/1.636 Hz/cell at 10.2/10.3/10.4 Hz input (seed 7, 60 cells, 30 s); the middle value was fixed before any calibration or contrast probe. There are no N/M recurrent connections. Existing afferent-gated iSTDP, 5 ms synaptic recovery, other parameters and formulas are unchanged.

Each 100 ms readout exposes `Nraw/Mraw` and `N/M = max(0, raw − 1.5)`. Trial deviations sum these window values; they do not subtract a baseline again. ThreeFactor accepts fractional deviations, and both consumers continue reading N/M. No measured rest baseline, noise threshold or extra gate was introduced.

**Rest (a): PASS in all 18 populations.** Ten 30 s rest probes per seed, 10 cells per population, three features × N/M. Table rates are pooled per-cell rates over 300 s; the mean covers all 60 cells. Bursts and Fano show the worst population, so the limits are tested separately in every population. Each consecutive same-cell triple spanning ≤20 ms counts as a burst, including 100 ms boundaries; population bursts/s sums those cell counts. Fano uses population counts in 10 ms bins. Per-population and per-cell details are linked above.

| Seed | Mean Hz/cell | Min | Max | Max bursts/s/pop | Max Fano | Rest gate open |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 1.456 | 1.363 | 1.587 | 0.000 | 0.997 | 99.77% |
| 19 | 1.464 | 1.320 | 1.633 | 0.000 | 0.991 | 99.47% |
| 31 | 1.436 | 1.297 | 1.607 | 0.000 | 0.993 | 99.60% |

All population means lie in 0.5–3 Hz, all burst rates are zero (limit 0.5/s), and all Fano factors are ≤1.5. Thus the conditional continuous membrane/current-readout fallback was not triggered.

**M5 contrasts (b):** mean deviation (raw population spikes) per original 8 s probe, ten probes per condition. Thresholds remain ≥5× and ≥10 deviation spikes. Jitter is ±300 ms on the original schedule and must be ≤2× paired. All N and jitter checks pass; M fails only in seed 7.

| Seed | N paired | N unexpected | N ratio | M paired | M omitted | M ratio | N jitter | M jitter |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 28.95 (97.80) | 201.95 (284.50) | 6.98× | 48.45 (101.40) | 198.60 (280.80) | 4.10× | 33.10 (101.10) | 55.10 (108.50) |
| 19 | 32.60 (101.90) | 202.80 (284.80) | 6.22× | 30.05 (81.00) | 200.00 (278.50) | 6.66× | 38.75 (109.80) | 45.20 (97.00) |
| 31 | 24.90 (91.20) | 200.25 (283.20) | 8.04× | 18.25 (66.20) | 201.15 (282.10) | 11.02× | 32.90 (100.60) | 25.95 (72.80) |

**Calibration:** reused the original causal M5/M4 cache signature `a53e89d57f683e2a06840aa3a3245c659cf899f2f0d78c47ec322832e3d48088`; cached layers restore exactly and hashes remain unchanged. The old zero-target comparator is replaced with a fresh tonic comparator. Layer weights stay frozen. Actual continuous P7 drives calibration at learned arrival −500/0/+500 ms. Only comparator iSTDP learns; probes freeze all weights and preserve neural state.

The exact stopping criterion is 24 consecutive matched trials in which every predicted population's N and M trial deviations are each ≤61.999411. This is the mean + 3 SD of 80 independent max(0,Poisson(1.5)−1.5) windows: mean 40.163429, SD 7.278661. It is an experiment-only, one-sided near-rest criterion, not a runtime mechanism or proof of equality to the target rate. All seeds reach the original 150-trial cap; their longest qualifying streak is 11. Frozen results therefore use unconverged comparators.

**Linearity (c): PASS in all seeds.** Ten isolated omissions/reality onsets per strength, learning frozen, continuous state. Each 3 s slot delivers a 100 ms signal at offset 1100 ms; omission prediction is created at 0, arrives at 600, and reaches its deadline at 1100. Table values sum the unchanged 100 ms deviations over the 1 s response [1100,2100), including tails. Strength zero is a separate identically timed rest control; it is not subtracted from responses. The full artifact also reports raw counts, SEMs, each trial and the active 100 ms response.

| Strength | M seed 7 | M seed 19 | M seed 31 | N seed 7 | N seed 19 | N seed 31 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 5.20 | 4.95 | 4.15 | 4.30 | 3.95 | 4.30 |
| 0.05 | 15.90 | 15.10 | 14.55 | — | — | — |
| 0.1 | 32.00 | 25.90 | 28.20 | 27.85 | 27.60 | 33.60 |
| 0.2 | 55.95 | 52.40 | 51.50 | 48.95 | 49.10 | 50.55 |
| 0.3 | 68.25 | 73.65 | 74.55 | 68.60 | 72.90 | 73.60 |
| 0.5 | 106.40 | 105.90 | 110.45 | 103.65 | 104.95 | 101.30 |
| 1 | 167.85 | 160.85 | 165.85 | 168.80 | 165.95 | 165.60 |

At 0.1, mean M deviations are 32.00/25.90/28.20 versus rest 5.20/4.95/4.15; active-window M alone is 25.60/18.90/20.60. N also exceeds rest. All weak-minus-control differences exceed three combined SEMs, all weak means exceed 2, and all requested positive-strength sequences are monotone non-decreasing. This passes the requested monotonicity test, not a claim of exact proportionality.

**Why the consumer requirement fails:** positive rectification has a positive noise mean. For X~Poisson(1.5), E[max(0,X−1.5)] = 0.502043 spikes/window. The unchanged 400 ms surprise trace sums three N populations, giving a Poisson-reference stationary mean of 6.808924 versus its unchanged threshold 1. The measured N rest mean is 0.437–0.455 per population/window. All rest probe afferents are verified silent. Rest alone therefore keeps the gate open almost continuously.

An audit replays each recorded rest probe into the unchanged ThreeFactor with one source onset (strength 1), initial W=0, cap=1, and no predictions or hits. This supplies eligibility without a target event. A@1→B grows in every replay; without source eligibility, weights cannot change. The audit isolates the noise effect and does not alter the neural experiment.

| Seed | Minimum rest-driven ΔW | Maximum rest-driven ΔW |
| --- | --- | --- |
| 7 | 0.000350 | 0.002469 |
| 19 | 0.000514 | 0.001280 |
| 31 | 0.000522 | 0.001807 |

**Verification: 95/99 checks pass, 28.55 s; npm test exits 1.** Four failures remain visible: the original M3 smoke has its gate open for all 300 windows; synthetic tolerance calibration reaches only six consecutive near-rest trials in 100; tonic rest opens the gate in 299/300 windows; and rest N with one eligible source grows W from 0 to 0.001900742. All other checks pass, including fractional/raw consumer semantics, tonic rate/bursts, weak 0.1 signals, afferent-frozen iSTDP and state round trips. Tests finish under 30 s but are not green. No acceptance assertion was relaxed to hide these failures.

| Run | Wall seconds |
| --- | --- |
| Seed 7: calibration + all probes | 151.16 |
| Seed 19: calibration + all probes | 152.35 |
| Seed 31: calibration + all probes | 155.85 |
| Full gate experiment | 459.69 |
| Cache/rest-consumer audit | 0.22 |
| npm test | 28.55 |

Changed: `src/errors.mjs`, `src/three-factor.mjs`; `experiments/m5-{cache,errors,probe,statistics}.mjs`; `verify/errors.mjs`, `verify/three-factor.mjs`; this report. All files remain below 250 lines. The authoritative design, old repositories and existing supervisor edits were untouched. Current branch is `m11c-graded`; no commit, branch switch or push was made.

The gate is not accepted. Resolving calibration and eliminating rectified rest noise from consumers requires a supervisor decision beyond this authorized change.

## gate2 — signed consumers pass; calibration blocked

**FAIL / stopped at the requested calibration diagnostic boundary.** Signed readout, the analytic surprise gate, odd saturation, and signed goal-M are implemented. The 300 s rest consumer audits pass in seeds 7/19/31, and M3 passes again. A decaying iSTDP rate reduces weight oscillation substantially but does not remove systematic suppression of tonic firing during matched trials. Neither the 24-trial streak nor its analytic limit was relaxed. No downward-weight redesign was started.

Artifacts: [original-rate per-trial diagnostic log](../logs/m11c-gate2-diagnosis.txt), [all diagnostic weights/counts](../out/m11c-gate2/diagnosis.json), [600-trial scheduled calibration](../out/m11c-gate2/schedule.json), [calibration summaries](../out/m11c-gate2/diagnosis-summary.json), [frozen-weight diagnostic](../out/m11c-gate2/calibration-response.json), [300 s rest counts and trajectories](../out/m11c-gate2/rest-audit.json), [npm test output](../logs/m11c-gate2-tests.txt).

**Readout and consumers.** `N/M = raw − targetHz × cells × window/1000 = raw − 1.5`, with `Nraw/Mraw` retained. No rectification precedes subtraction, and no measured/adaptive baseline is used. ThreeFactor accepts signed values and uses `sat(E)=E/(|E|+100)`; its learning rates, eligibility and bounded weight formula are unchanged. The former rectified `M===0` hit test becomes signed `M<=0`, preserving exactly the same raw-count condition. Goal-M remains signed through saturation and summation; only the final motor drive is clipped. `tonicHz=10.3` and `targetHz=1.5` are unchanged.

For the surprise trace, independent Poisson population rest counts have variance λ=1.5/window. Summing F features gives Fλ. The existing recurrence is T[t]=dT[t−1]+Σdev[t], d=exp(−100/400); hence stationary variance is Fλ/(1−d²). The threshold is 3 SD (10.145 for three features), with one fixed `kGate=3`; the derivation is also commented in code.

**Diagnosis before changing calibration.** `node experiments/m5-diagnose.mjs` ran seed 7 for the original 150 trials at eta=0.2, printing every matched N/M deviation and both mean iSTDP weights, retaining all individual weights in JSON. Trials 46–48 changed mean M inhibition 3.540→3.540→1.765 and produced M=+48/−58/−48. The signed reference for an 8 s trial is Poisson(120)−120: mean 0, SD √120=10.954451, so the unchanged three-SD limit is **|dev|≤32.863353** for each predicted N and M. The original-rate longest streak under this signed criterion is 2.

The authorized attempted fix uses **eta(trial)=0.2/√trial**, applied to all comparator iSTDP groups between trials, with a cap of 600. This schedule is independent of feature, tolerance anchor, scene and observed probe performance. At trial 600 eta=0.008164966. The RMS change in mean M inhibitory weight across the final 90 trials falls from **1.193324 to 0.041407** (28.8× smaller), but convergence still fails: longest streak **2/24**.

Final 90 trials of each run; 30 per tolerance anchor, all matched. Values are mean signed deviations over the full original 8 s trial. The last column counts trials satisfying both N and M bounds in the scheduled run.

| Reality offset | Constant eta N | Constant eta M | Scheduled N | Scheduled M ± SEM | Qualifying / 30 |
| --- | --- | --- | --- | --- | --- |
| −500 ms | −17.10 | −4.20 | −15.50 | −11.87 ± 3.12 | 25 |
| 0 ms | −19.13 | −55.87 | −23.30 | −55.63 ± 0.99 | 0 |
| +500 ms | +1.87 | −46.93 | +4.13 | −42.20 ± 1.65 | 5 |

Scheduled mean M weights after the three anchors are 1.7883/1.7883/1.7404; within-anchor SDs are 0.0387/0.0387/0.0380. At the middle anchor the expected rest count is 120, but the measured mean raw M is only **64.37**. Its deviation is 22.77 spikes below the allowed lower bound, or 22.9 SEM. Lower learning noise has not made this a zero-mean rest process.

**Why the rest-only criterion is mismatched to these matched trials.** Reality drives the existing slow inhibitory synapse even outside M's 100 ms excitatory deadline. It suppresses tonic M before/after that deadline, while afferent-gated iSTDP can learn only during the deadline. The 8 s deviation includes this inhibited tonic activity. A learning-rate schedule changes update sizes; it cannot remove that physical inhibition or change which windows contribute to the trial deviation.

`node experiments/m5-calibration-response.mjs` isolates this effect with frozen M inhibitory weights, unit matched afferents at the same three tolerance anchors, 8 s continuous trials, ten repeats/anchor, seed 7. Identical afferent RNG is used across weight values. This is a diagnostic sweep only; no weight from it is installed as a parameter. No tested fixed weight keeps all three mean deviations inside ±32.86:

| Frozen M inhibitory weight | M at −500 ms | M at 0 ms | M at +500 ms |
| --- | --- | --- | --- |
| 0 | +162.50 | +169.10 | +150.70 |
| 0.25 | +102.00 | +67.50 | +47.70 |
| 0.50 | +74.50 | +19.50 | −1.90 |
| 0.75 | +55.00 | −20.80 | −25.50 |
| 1.00 | +38.40 | −40.60 | −35.40 |
| 1.50 | +6.40 | −46.90 | −42.90 |
| 2.00 | −18.10 | −48.50 | −47.10 |
| 3.00 | −52.10 | −52.00 | −52.00 |

These results show a systematic signed-baseline calibration problem, not evidence that the streak should be weakened. The prescribed stop applies: no offset correction, new gate, suppression compensation, alternate target, changed timing, or looser acceptance was introduced. A supervisor decision about the calibration/circuit mismatch is needed before claiming convergence. The sweep does not prove impossibility for every conceivable heterogeneous weight configuration.

**Continuous rest consumer audit: PASS for all three seeds.** Each run contains 300 s of fresh, uninterrupted neural rest with silent R/P/D afferents. Its counts are replayed into ThreeFactor with a strength-1 source onset every 10 s, auditing the first feature→second feature at slice 1, initial W=0.1 and 0, cap=1. No target onsets, prediction eligibility or hits enter the audit. Source bookkeeping stays outside the neural tick loop.

Uncertainty is an analytic conservative Poisson bound: since |sat′|≤1/E0 and headroom≤1, each N-update variance is bounded by `(eta × eN/E0)² × λ`. Summing gives endpoint noise SD=0.00534713. The reported slope is least-squares W versus elapsed seconds. Its SE bound accounts for integrated noise: each independent increment contributes to every later trajectory sample, so those regression coefficients are summed before squaring. This avoids treating correlated weight samples as independent. Clamping at W=0 can leave a positive finite-sample displacement; it does not imply an exactly zero expected reflected trajectory.

| Seed | Rest gate open | Initial W | Final W | ΔW | Slope /s | Slope SE bound /s |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 1/3000 = 0.033% | 0.1 | 0.088651 | −0.011349 | −4.8162e−5 | 1.9522e−5 |
| 7 | 1/3000 = 0.033% | 0 | 0.002658 | +0.002658 | +9.8709e−6 | 1.9522e−5 |
| 19 | 0/3000 = 0% | 0.1 | 0.091403 | −0.008597 | −4.1116e−5 | 1.9522e−5 |
| 19 | 0/3000 = 0% | 0 | 0.001179 | +0.001179 | −3.1033e−6 | 1.9522e−5 |
| 31 | 1/3000 = 0.033% | 0.1 | 0.100516 | +0.000516 | +5.5080e−7 | 1.9522e−5 |
| 31 | 1/3000 = 0.033% | 0 | 0.002744 | +0.002744 | +9.4993e−6 | 1.9522e−5 |

Every endpoint displacement and slope is within three corresponding noise SDs; none of the six trajectories grows monotonically. The unit suite also checks 300 s of independent Poisson signed rest in seeds 7/19/31, actual 30 s neural rest, odd-symmetric N/M updates, signed goal-drive cancellation, and raw-count independence.

**Verification: 97/99 checks pass, 28.90 s; `npm test` exits 1.** M3 passes (smoke 6.39 s), as do signed consumers, the derived rest gate, drift, raw readout, weak 0.1 errors, goals, and state round trips. The two remaining failures are left explicit: synthetic calibration reaches at most 2/24 consecutive qualifying trials within its original 100-trial unit budget; its frozen matched probe gives N=−16, M=−37 against the 3 s limit ±20.124612. The separate 600-trial synthetic diagnostic likewise reached only 2/24, with a frozen matched M=−44. No test assertion was relaxed to make the suite green.

| Run | Wall seconds |
| --- | --- |
| Seed 7 original-rate 150-trial diagnosis | 98.93 |
| Seed 7 scheduled 600-trial calibration | 374.05 |
| Frozen-weight response diagnostic | 13.96 |
| 300 s rest consumer audits, all three seeds | 19.16 |
| npm test | 28.90 |

**Full gate status:** the original rest/linearity results above are retained, and the full runner now implements signed readout, the exact signed criterion, and the new rest audits. The full three-seed M5 contrast/linearity rerun was **not executed** after the calibration stop; neither those results nor all-seed calibration convergence are claimed for gate2. The requested all-green gate remains unmet.

Gate2 files changed: `src/{errors,three-factor,goals}.mjs`; `experiments/m3-causal.mjs`, `experiments/m5-{probe,statistics,errors}.mjs`; new `experiments/m5-{diagnose,calibration-response,rest-audit}.mjs`; `verify/{errors,three-factor,m3-dynamics,goals}.mjs`; this report, plus diagnostic artifacts/logs. Existing supervisor edits and the prior cache change are preserved. All changed code files remain below 250 lines. The authoritative design, old repositories and downward-weight formulas are untouched. Branch remains `m11c-graded`; no commit, branch switch or push was made.

## gate3 — deadline-only M implemented; calibration still blocked

**FAIL.** Option A is implemented, but moving the read windows does not yield the required 24 consecutive calibrated trials. No compensation, alternate baseline, relaxed streak, new circuit mechanism, or later downward-weight change was introduced. The failing calibration assertions remain visible.

Artifacts: [full gate report](../out/m11c-gate3/2026-10-17T16-19-58.216Z/report.md), [per-window counts, calibration weights, population statistics, drift trajectories and individual omission trials](../out/m11c-gate3/2026-10-17T16-19-58.216Z/results.json), [full gate log](../logs/m11c-gate3.txt), [600-trial synthetic diagnostic](../out/m11c-gate3/synthetic.json), [synthetic summary](../logs/m11c-gate3-synthetic.txt), [npm test output](../logs/m11c-gate3-tests.txt). Reproduce the full gate with `node experiments/m5-errors.mjs`.

**Read windows and consumers.** The neural comparator still exposes signed `N/M = raw − rest`, retaining raw counts for diagnosis. ThreeFactor reads M only when a pending prediction to that target reaches its deadline; other windows contribute zero M regardless of residual eligibility. At that deadline it uses `Meff = max(0, Mdev − 3σ_rest)`. The weight helper also rejects negative effective M. Confirmed hits receive the existing bounded hit term only at their deadline when `Meff === 0`. N remains signed in every learning/surprise window, odd saturation and the surprise threshold are unchanged, and Goal-M is unchanged. The existing M6 probe's accounting follows the same deadline/deadband selection; its learning law and experiment phases were not redesigned.

The analytic layer-1 population rest count is `λ = 1.5 Hz × 10 cells × duration/1000`. For the 100 ms deadline, `λM = 1.5`, `σM = √1.5 = 1.224745`, and **3σM = 3.674235 spikes**. Integer raw M must therefore reach 6 spikes for positive Meff. No measured rest estimate is used. N calibration uses the existing inclusive window labels: arrival 3200 means starts 2700, 2800, …, 3700, each spanning 100 ms. Thus `λN = 16.5`, `σN = 4.062019`, and **3σN = 12.186058 spikes** over 1100 ms. Each matched prediction must satisfy both absolute signed bounds, for 24 consecutive trials.

Calibration retains `eta(trial) = 0.2/√trial` and the common 600-trial cap, cycling reality at learned arrival −500/0/+500 ms. At the cap eta is 0.008164966. Layer weights remain frozen; only comparator iSTDP learns. Frozen contrasts compare N over the expectation span and M over the deadline. Unexpected N is measured over the learned arrival relative to slot start, without inserting a neural prediction. Ratios use the absolute paired signed mean as denominator; jitter compares absolute means, so a negative denominator cannot produce a trivial pass. All original schedules, cache teachers and rest criteria remain unchanged.

**Synthetic diagnostic.** Extending the unchanged one-feature unit protocol to 600 trials reaches only **2/24**, taking 13.27 s. The final 90 trials give the following means (30 per anchor):

| Reality offset | N expectation deviation | N within ±12.186 / 30 | M deadline deviation | M within ±3.674 / 30 |
| --- | --- | --- | --- | --- |
| −500 ms | −11.867 | 13 | +32.700 | 2 |
| 0 ms | −14.300 | 6 | −1.500 | 30 |
| +500 ms | −14.833 | 4 | +8.933 | 2 |

This identifies two remaining problems: suppression of N during the prediction's expectation span, and positive deadline M for early/late matched reality. The new M readout correctly ignores inhibition outside the deadline; it cannot correct these deviations inside the required comparison spans. In particular, N's prediction afferents run throughout eleven windows while reality excites N only at its onset. Its existing afferent-gated iSTDP targets the rest rate during reality, leaving the other prediction-driven windows suppressed. Changing that balance or the early/late M response requires a further design decision; no such change was attempted.

**Unit verification: 99/101 checks pass; `npm test` exits 1 in 26.35 s.** The synthetic convergence check reaches a longest streak of 1/24 within its original 100-trial unit budget. Its frozen on-time matched probe reports N = −15.5 (raw 1) against ±12.186058, while deadline M = −1.5 (raw 0) is within ±3.674235 and gives Meff = 0. The other checks pass, including analytic deadband, negative M never adding weight, M inactivity outside target deadlines, deadline hit credit, signed N/saturation, rest/drift, Goal-M and state resumption. The suite remains below 30 s; it is deliberately not claimed green.

**Full three-seed calibration: FAIL.** All 1800 trials are matched; each seed reaches the 600-trial cap. Longest streaks for seeds 7/19/31 are **1/2/2**, against 24 required. Final 90-trial means, 30 at each reality offset:

| Seed | Offset ms | N deviation | N passes / 30 | M deviation | M passes / 30 | Both / 30 |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | -500 | -11.733 | 12 | 35.333 | 0 | 0 |
| 7 | 0 | -15.133 | 4 | -1.500 | 30 | 4 |
| 7 | 500 | -15.867 | 1 | 9.967 | 3 | 0 |
| 19 | -500 | -12.133 | 10 | 35.667 | 0 | 0 |
| 19 | 0 | -14.400 | 6 | -1.500 | 30 | 6 |
| 19 | 500 | -14.333 | 7 | 9.233 | 4 | 2 |
| 31 | -500 | -12.933 | 10 | 36.200 | 0 | 0 |
| 31 | 0 | -14.767 | 6 | -1.500 | 30 | 6 |
| 31 | 500 | -14.900 | 4 | 8.833 | 5 | 0 |

**Rest and drift: PASS.** Ten 30 s rest probes per seed, six populations each; all 18 population means satisfy 0.5–3 Hz, burst rates ≤0.5/s, Fano ≤1.5, and rest gate open <1%. Min/max below are individual-cell rates; Fano and bursts show the worst population. All rest afferents are silent. The separate 300 s drift audit retains the gate2 eligibility schedule and analytic uncertainty bounds.

| Seed | Mean Hz/cell | Min | Max | Max bursts/s | Max Fano | Rest gate open | Audit gate open |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 1.460 | 1.320 | 1.620 | 0.000 | 0.998 | 0.10% | 0.03% |
| 19 | 1.449 | 1.310 | 1.583 | 0.000 | 0.991 | 0.00% | 0.00% |
| 31 | 1.456 | 1.317 | 1.563 | 0.000 | 0.995 | 0.00% | 0.03% |

| Seed | Initial W | Final W | ΔW | Slope /s |
| --- | --- | --- | --- | --- |
| 7 | 0.1 | 0.088651 | -0.011349 | -4.8162e-5 |
| 7 | 0 | 0.002658 | 0.002658 | 9.8709e-6 |
| 19 | 0.1 | 0.091403 | -0.008597 | -4.1116e-5 |
| 19 | 0 | 0.001179 | 0.001179 | -3.1033e-6 |
| 31 | 0.1 | 0.100516 | 0.000516 | 5.5080e-7 |
| 31 | 0 | 0.002744 | 0.002744 | 9.4993e-6 |

All six drift trajectories are non-monotone. Every |ΔW| is within 3 × 0.00534713 and every absolute slope within 3 × 1.9522e−5/s, the unchanged conservative Poisson bounds.

**M5 contrasts: N/M PASS; jitter FAIL in every seed.** Each mean uses ten frozen probes. Ratios divide by the magnitude of the paired mean; ≥5× and ≥10 deviation spikes are both required. N jitter passes ≤2× paired in all seeds. M jitter ratios are 7: 10.67×, 19: 8.77×, 31: 2.77× (limit 2×).

| Seed | N paired | N unexpected | N ratio | M paired | M omitted | M ratio | N jitter | M jitter |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | -16.50 | 162.20 | 9.83× | -1.20 | 124.20 | 103.50× | -16.50 | 12.80 |
| 19 | -15.20 | 165.80 | 10.91× | -1.30 | 134.70 | 103.62× | -14.10 | 11.40 |
| 31 | -15.30 | 161.80 | 10.58× | -1.30 | 128.10 | 98.54× | -12.60 | 3.60 |

**Weak-miss deadband: PASS.** Ten isolated omissions per strength/seed. Each cell below reports **mean deadline Mdev / mean Meff / fraction Meff > 0**; the same analytic 3σ = 3.674235 applies throughout.

| Strength | Seed 7 | Seed 19 | Seed 31 |
| --- | --- | --- | --- |
| 0.05 | 10.70 / 7.44 / 90.00% | 9.70 / 6.03 / 100.00% | 10.90 / 7.24 / 90.00% |
| 0.1 | 21.20 / 17.53 / 100.00% | 25.10 / 21.43 / 100.00% | 24.20 / 20.53 / 100.00% |
| 0.2 | 39.00 / 35.33 / 100.00% | 38.80 / 35.13 / 100.00% | 40.40 / 36.73 / 100.00% |
| 0.3 | 56.60 / 52.93 / 100.00% | 57.70 / 54.03 / 100.00% | 52.60 / 48.93 / 100.00% |
| 0.5 | 80.30 / 76.63 / 100.00% | 79.70 / 76.03 / 100.00% | 81.80 / 78.13 / 100.00% |
| 1 | 126.60 / 122.93 / 100.00% | 125.40 / 121.73 / 100.00% | 121.10 / 117.43 / 100.00% |

At strength 0.1, Meff mean ± SEM is 7: 17.526 ± 2.300; 19: 21.426 ± 2.156; 31: 20.526 ± 2.616. Each mean exceeds three SEM above zero; all 30 omissions clear the deadband.

**Matched-hit deadband: FAIL for jittered matches.** Ordinary paired probes give Meff = 0. Early jittered reality produces positive deadline Meff despite a confirmed onset inside tolerance. Each cell below is **mean Meff / fraction > 0**, with ten trials per condition and twenty pooled; no matched trials are excluded.

| Seed | Paired (10) | Jitter (10) | All matched (20) |
| --- | --- | --- | --- |
| 7 | 0.000 / 0.00% | 12.648 / 30.00% | 6.324 / 15.00% |
| 19 | 0.000 / 0.00% | 11.348 / 30.00% | 5.674 / 15.00% |
| 31 | 0.000 / 0.00% | 3.030 / 40.00% | 1.515 / 20.00% |

**Linearity: PASS under the unchanged weak-response and monotonicity checks.** Mean signed deviations below use N expectation and M deadline spans (each cell **M / N**, ten probes each). Strength zero is a separately timed rest control, never subtracted from the readout. At 0.1 both channels exceed 2 spikes and exceed control by three combined SEMs; all positive-strength series are monotone. This is not a claim of exact proportionality.

| Strength | Seed 7 | Seed 19 | Seed 31 |
| --- | --- | --- | --- |
| 0 | 0.00 / -1.40 | 0.10 / -1.40 | 0.00 / -0.60 |
| 0.05 | 10.70 / — | 9.70 / — | 10.90 / — |
| 0.1 | 21.20 / 21.90 | 25.10 / 20.60 | 24.20 / 27.10 |
| 0.2 | 39.00 / 48.00 | 38.80 / 48.40 | 40.40 / 48.50 |
| 0.3 | 56.60 / 64.90 | 57.70 / 67.50 | 52.60 / 67.70 |
| 0.5 | 80.30 / 101.10 | 79.70 / 96.70 | 81.80 / 105.40 |
| 1 | 126.60 / 166.50 | 125.40 / 162.60 | 121.10 / 168.10 |

**Wall times.** Frozen-probe time includes rest, contrast, linearity and deadband measurements; the independent drift audit is separate.

| Seed | Calibration s | Frozen probes s | Rest audit s | Total s |
| --- | --- | --- | --- | --- |
| 7 | 382.16 | 59.41 | 7.31 | 448.88 |
| 19 | 384.17 | 58.37 | 7.43 | 449.97 |
| 31 | 371.09 | 56.80 | 7.31 | 435.20 |

Full gate: **1334.80 s**, exit 1. Synthetic diagnostic: 13.27 s. Unit suite: **26.35 s**, exit 1 (99/101). Cache file hashes were rechecked unchanged after all runs; frozen neural/comparator probe weights were asserted unchanged in every seed.

Gate3 files changed: `src/{errors,three-factor}.mjs`; `experiments/m5-{probe,statistics,errors}.mjs` and `experiments/m6-trial.mjs`; `verify/{errors,three-factor}.mjs`; this report, plus run artifacts/logs. All changed code files remain below 250 lines. The authoritative design, old repositories and later downward-weight work are untouched. Branch remains `m11c-graded`; no commit, branch switch or push was made.

## gate4 — strengthening-only N implemented; tolerance-derived M decay still fails

**FAIL / stopped at the prescribed comparator and calibration boundary.** All three seeds reach the unchanged 600-trial cap without 24 consecutive qualifying matched trials. N is now strengthening-only, but the authorized slow decay alone does not keep tolerance-boundary hits silent. No additional comparator mechanism, parameter tuning, relaxed streak, or later downward-weight redesign was attempted. The full gate and all requested tables were run despite the failed calibration; frozen probes therefore use unconverged comparators.

Artifacts: [full population/probe report](../out/m11c-gate4/2026-10-17T16-51-55.191Z/report.md), [raw windows, per-trial calibration counts/weights, distributions, drift trajectories and cache hashes](../out/m11c-gate4/2026-10-17T16-51-55.191Z/results.json), [full gate log](../logs/m11c-gate4.txt), [600-trial synthetic diagnostic](../out/m11c-gate4/synthetic.json), [synthetic log](../logs/m11c-gate4-synthetic.txt), [npm test output](../logs/m11c-gate4-tests.txt). Reproduce with `node experiments/m5-errors.mjs`, `node experiments/m5-synthetic-diagnostic.mjs`, and `npm test`.

**Implemented scope.** Neural N/M readouts remain signed, retaining raw counts. ThreeFactor reads `Neff = max(0, Ndev − 3√restCount(100 ms))` every learning window, including when no prediction exists; its weight helper also clamps negative effective N to zero. Negative N cannot weaken W. SurpriseGate still integrates signed N with its unchanged analytic 3σ threshold; odd saturation and the signed goal-M consumer remain unchanged. The only comparator parameter change is `slowDecayMs = 2 × toleranceMs = 1000 ms`; existing M iSTDP `tauPre` remains tied to that decay. M deadline selection, its deadband, afferent gates and the bounded hit term are unchanged. M6 trial accounting now passes effective N to the existing helper so its hit-only diagnostic stays correct; no later training or downward-weight change was started.

**Read spans and calibration.** Rest count is analytic: `λ = 1.5 Hz × 10 cells × duration/1000`. Learning N and deadline M each read 100 ms: λ=1.5, σ=1.224745, **3σ=3.674235 spikes**. Calibration/contrast N sums signed deviations over inclusive expectation labels 2700..3700 for arrival 3200, then rectifies once: λ=16.5 over 1100 ms, σ=4.062019, **3σ=12.186058**. A matched trial qualifies only if every predicted comparison has `Neff === 0 && Meff === 0`. The requirement remains **24 consecutive trials**, with **eta(trial)=0.2/√trial** and **cap 600** (eta at cap 0.008164966). Only comparator iSTDP learns; layers remain frozen. All 1800 calibration trials were confirmed matches, cycling arrival −500/0/+500 ms.

**Calibration: FAIL in every seed.** Each final-90 Neff distribution is identically zero (mean, SD, min and max all 0; 90/90 zero). Meff distributions and qualification rates below are computed per trial, not from rectified means. SD is the population SD over these trials.

| Seed | Trials | Longest / 24 | Qualified last 90 | Meff mean ± SD | Meff min..max |
| --- | --- | --- | --- | --- | --- |
| 7 | 600 | 5/24 | 36/90 = 40.00% | 11.618 ± 12.771 | 0.000..46.826 |
| 19 | 600 | 13/24 | 33/90 = 36.67% | 11.779 ± 12.712 | 0.000..51.826 |
| 31 | 600 | 11/24 | 34/90 = 37.78% | 11.236 ± 11.363 | 0.000..46.826 |

The measured late qualifying fraction p implies very short streaks under an IID Bernoulli approximation. The median longest streak and probability of any 24-run within 600 trials use the exact finite-state run recurrence; expected waiting time is `(1−p^24)/((1−p)p^24)`. These are diagnostic implications of the observed fraction, not independence claims about cycling anchors or changing learning rates. Early observed streaks can differ from this late-rate approximation.

| Seed | p | IID median longest in 600 | P(any 24-run in 600) | Expected wait for 24, trials |
| --- | --- | --- | --- | --- |
| 7 | 0.400000 | 6 | 9.756e-8 | 5.921e+9 |
| 19 | 0.366667 | 6 | 1.276e-8 | 4.527e+10 |
| 31 | 0.377778 | 6 | 2.566e-8 | 2.251e+10 |

Final 90 trials split by anchor, 30 each. N remains below its upper limit in every row. Δ inhibitory weight is the per-trial change in mean M iSTDP weight, including the preceding trial for the first entry of this span.

| Seed | Offset ms | Mean Ndev | Mean Mdev | Meff mean ± SD | Qualifying / 30 | Mean Δ M inhibition ± SD |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | -500 | -11.733 | 20.067 | 16.821 ± 14.493 | 5/30 | 0.07637 ± 0.05301 |
| 7 | 0 | -15.133 | -1.500 | 0.000 ± 0.000 | 30/30 | 0.00000 ± 0.00000 |
| 7 | 500 | -15.867 | 21.567 | 18.032 ± 8.723 | 1/30 | -0.07602 ± 0.03794 |
| 19 | -500 | -12.133 | 20.767 | 17.477 ± 15.111 | 3/30 | 0.07657 ± 0.05132 |
| 19 | 0 | -14.400 | -1.500 | 0.000 ± 0.000 | 30/30 | 0.00000 ± 0.00000 |
| 19 | 500 | -14.333 | 21.533 | 17.859 ± 6.945 | 0/30 | -0.07588 ± 0.03278 |
| 31 | -500 | -12.933 | 17.367 | 14.316 ± 11.641 | 4/30 | 0.06602 ± 0.04286 |
| 31 | 0 | -14.767 | -1.467 | 0.000 ± 0.000 | 30/30 | 0.00016 ± 0.00088 |
| 31 | 500 | -14.900 | 23.067 | 19.392 ± 7.041 | 0/30 | -0.06773 ± 0.03646 |

**Diagnosis: not just a zero-mean iSTDP noise floor.** On-time trials qualify 30/30 in every seed, while the late boundary qualifies only 1/30, 0/30 and 0/30. Early trials systematically strengthen M inhibition; late trials systematically weaken it. The existing iSTDP rule uses `alpha = target × (tau + tauPre)/1000`, now 1.53 with tau=20 and tauPre=1000. Reality at the late boundary activates presynaptic updates in the same 100 ms window as M excitation; early reality has already left a decaying trace at that window. The measured opposite weight steps support a persistent timing-dependent calibration bias plus stochastic variation. Frozen probes below still fail after iSTDP updates stop, so reducing update noise alone has not established hit silence. This is evidence that the prescribed change is insufficient under this calibration, not a proof that every possible fixed heterogeneous weight configuration is impossible.

| Seed | Final-90 mean M inhibition ± SD | RMS trial-to-trial change |
| --- | --- | --- |
| 7 | 0.83165 ± 0.05672 | 0.07311 |
| 19 | 0.80521 ± 0.05914 | 0.07071 |
| 31 | 0.86080 ± 0.06236 | 0.06282 |

**Synthetic diagnostic:** the unchanged one-feature protocol extended to 600 trials reaches longest **22/24**, with 38/90 qualifying in the final 90; Neff is always zero there. Meff mean ± SD is 9.366 ± 11.057, range 0..44.826. The IID late-rate median longest is 7, with expected wait 1.680e+9 trials for 24. Its final-90 −500/0/+500 anchors qualify 8/30, 30/30 and 0/30. Frozen boundary Meff means are 18.843 at −500 and 14.026 at +500, with silence in 10% and 0% respectively. This independent diagnosis does not replace the three actual-P7 gate runs.

**Rest and drift: PASS under the numerical bounds.** Ten 30 s rest probes per seed; all 18 populations satisfy mean 0.5–3 Hz/cell, bursts ≤0.5/s and Fano ≤1.5. Min/max below are per-cell pooled rates, while Fano and bursts show the worst population. All R/P/D rest afferents were checked silent. The separate audit is uninterrupted 300 s fresh neural rest.

| Seed | Mean Hz/cell | Min | Max | Max bursts/s/pop | Max Fano | Rest gate open | Audit gate open |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 1.433 | 1.270 | 1.597 | 0.000 | 1.008 | 0.00% | 0.03% |
| 19 | 1.439 | 1.280 | 1.587 | 0.000 | 0.990 | 0.00% | 0.00% |
| 31 | 1.461 | 1.307 | 1.650 | 0.000 | 0.992 | 0.00% | 0.03% |

| Seed | Initial W | Final W | ΔW | Slope /s |
| --- | --- | --- | --- | --- |
| 7 | 0.1 | 0.100008673 | 8.673e-6 | 3.347e-8 |
| 7 | 0 | 0.000009637 | 9.637e-6 | 3.719e-8 |
| 19 | 0.1 | 0.100007971 | 7.971e-6 | 1.932e-8 |
| 19 | 0 | 0.000008857 | 8.857e-6 | 2.146e-8 |
| 31 | 0.1 | 0.100000001 | 5.054e-10 | 2.453e-12 |
| 31 | 0 | 0.000000001 | 5.616e-10 | 2.725e-12 |

All drift magnitudes remain within the original 3 × 0.00534713 bound and slopes within 3 × 1.9522e−5/s. The old requirement for *non-monotone* trajectories is incompatible with the newly mandated strengthening-only N: all six trajectories are now non-decreasing. The audit checks that sign invariant and preserves the numerical bounds. It does not claim zero drift. Under the analytic Poisson(1.5) reference, raw counts ≥6 occur in 0.445598% of windows and E[Neff]=0.004807614 spikes/window; a 3σ deadband leaves a small positive tail. No baseline correction or new runtime gate was added.

**Effective-channel contrasts: PASS.** Ten probes per condition. Unexpected N reads Neff over the expectation span without injecting a prediction; omitted M reads Meff at its deadline. Each error mean must be ≥10 and ≥5× its paired effective mean. A zero paired mean passes when the error mean is ≥10. The original paired schedule (reality at 3000 ms, learned arrival 3200 ms) is retained, so paired reality is itself a −200 ms hit.

| Seed | Paired Neff | Unexpected Neff | N contrast | Paired Meff | Omitted Meff | M ratio |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.000 | 151.814 | PASS (paired 0) | 0.183 | 115.326 | 631.66× |
| 19 | 0.000 | 152.614 | PASS (paired 0) | 0.483 | 122.826 | 254.52× |
| 31 | 0.000 | 149.414 | PASS (paired 0) | 3.230 | 122.326 | 37.87× |

**Weak-miss deadband: PASS.** Ten omissions per strength/seed, using the new slow decay. Each cell is **mean deadline Mdev / mean Meff / fraction Meff > 0**. The same 3σ=3.674235 applies at every strength.

| Strength | Seed 7 | Seed 19 | Seed 31 |
| --- | --- | --- | --- |
| 0.05 | 9.20 / 6.08 / 70.00% | 10.10 / 6.76 / 80.00% | 9.30 / 5.74 / 90.00% |
| 0.1 | 24.70 / 21.03 / 100.00% | 22.70 / 19.03 / 100.00% | 22.60 / 18.93 / 100.00% |
| 0.2 | 39.20 / 35.53 / 100.00% | 40.00 / 36.33 / 100.00% | 37.60 / 33.93 / 100.00% |
| 0.3 | 57.80 / 54.13 / 100.00% | 55.70 / 52.03 / 100.00% | 55.90 / 52.23 / 100.00% |
| 0.5 | 82.60 / 78.93 / 100.00% | 77.90 / 74.23 / 100.00% | 77.50 / 73.83 / 100.00% |
| 1 | 128.20 / 124.53 / 100.00% | 128.40 / 124.73 / 100.00% | 126.40 / 122.73 / 100.00% |

At strength 0.1, Meff mean ± SEM is 7: 21.026 ± 2.632; 19: 19.026 ± 2.265; 31: 18.926 ± 1.980. Every mean exceeds three SEM above zero. All 150 omissions at strength ≥0.1 clear the deadband. The unchanged signed weak-response/monotonicity checks also pass for both channels in all seeds; full raw, active-window and individual linearity results are in the linked report.

**Matched/jittered-hit Meff: FAIL.** Jitter now covers every 100 ms offset in −500..+500 around learned arrival, ten trials per offset (110 total per seed), interleaved with the original paired/unexpected/omitted/rest probes. All 360 paired/jitter probes were verified as actual onset matches; none were excluded. Every cell is **mean Meff / fraction Meff = 0**. “Paired” and the separately repeated −200 ms jitter condition have independent samples.

| Condition / offset ms | Seed 7 | Seed 19 | Seed 31 |
| --- | --- | --- | --- |
| paired | 0.183 / 90.00% | 0.483 / 90.00% | 3.230 / 60.00% |
| jitter | 3.898 / 72.73% | 4.960 / 71.82% | 4.092 / 74.55% |
| -500 | 10.761 / 20.00% | 8.961 / 20.00% | 9.113 / 50.00% |
| -400 | 5.013 / 50.00% | 10.095 / 40.00% | 8.578 / 30.00% |
| -300 | 4.048 / 70.00% | 7.030 / 60.00% | 3.548 / 70.00% |
| -200 | 0.865 / 80.00% | 0.765 / 80.00% | 1.048 / 70.00% |
| -100 | 0.565 / 80.00% | 0.683 / 90.00% | 0.000 / 100.00% |
| 0 | 0.000 / 100.00% | 0.000 / 100.00% | 0.000 / 100.00% |
| 100 | 0.000 / 100.00% | 0.000 / 100.00% | 0.000 / 100.00% |
| 200 | 0.000 / 100.00% | 0.000 / 100.00% | 0.000 / 100.00% |
| 300 | 0.000 / 100.00% | 0.000 / 100.00% | 0.000 / 100.00% |
| 400 | 0.000 / 100.00% | 0.000 / 100.00% | 0.000 / 100.00% |
| 500 | 21.626 / 0.00% | 27.026 / 0.00% | 22.726 / 0.00% |
| all matched | 3.588 / 74.17% | 4.587 / 73.33% | 4.020 / 73.33% |

Jitter requires ≥90% silent trials and mean Meff ≤2×paired Meff + deadband noise. The stated noise allowance here is the analytic deadline **3σ=3.674235**. The silence requirement fails in every seed; the mean bound additionally fails in seed 19.

| Seed | Jitter mean Meff | 2×paired + 3σ | Mean bound | Jitter silent / 110 | ≥90% silent |
| --- | --- | --- | --- | --- | --- |
| 7 | 3.898 | 4.039 | PASS | 80/110 = 72.73% | FAIL |
| 19 | 4.960 | 4.639 | FAIL | 79/110 = 71.82% | FAIL |
| 31 | 4.092 | 10.135 | PASS | 82/110 = 74.55% | FAIL |

All 30 frozen +500 ms hits have positive Meff. The mean is 21.626/27.026/22.726 for seeds 7/19/31 despite confirmed reality inside tolerance. Earlier boundary hits also frequently fail. Real omissions remain detectable, but the authorized 1000 ms slow inhibition and tied iSTDP trace do not satisfy the hit-silence requirement. This is the requested stop condition; no further comparator change was made.

**Verification: 100/102 checks pass; `npm test` exits 1 in 27.646 s** (suite timer 27.32 s, below 30 s). The one-sided calibration unit test retains its original fast 100-trial budget and reaches longest 22/24; the separate diagnostic and each full gate seed use the full 600 cap. The second failure is a frozen early matched probe: Ndev=−16.5 gives Neff=0, but Mdev=18.5 gives Meff=14.825765. Neither failure assertion was weakened. Negative N never decreasing W, the 100 ms deadband without predictions, signed surprise, rest/drift, signed goal-M, deadline M and JSON resumption all pass.

**Wall times.** Frozen probes include the expanded jitter grid, rest, contrasts, linearity and deadband; the uninterrupted rest audit is separate.

| Seed | Calibration s | Frozen probes s | Rest audit s | Total s |
| --- | --- | --- | --- | --- |
| 7 | 367.19 | 118.40 | 7.19 | 492.77 |
| 19 | 370.67 | 119.22 | 6.92 | 496.81 |
| 31 | 370.99 | 120.42 | 6.90 | 498.30 |

Full gate: **1488.85 s**, exit 1. Synthetic diagnostic: **14.27 s**. npm test: **27.65 s**, exit 1. The synthetic diagnostic and unit suite overlapped part of seed 7's full run; all times are measured wall times. Cache hashes were rechecked unchanged afterward, and frozen probe weights were asserted unchanged in every seed.

Gate4 files changed: `src/{errors,three-factor}.mjs`; `experiments/m5-{errors,probe,statistics,rest-audit}.mjs`, new `experiments/m5-synthetic-diagnostic.mjs`, and the existing `experiments/m6-trial.mjs` accounting call; `verify/{errors,three-factor}.mjs`; this appended section, plus run artifacts/logs. All changed code files remain below 250 lines. The authoritative design and old repositories are untouched. Branch remains `m11c-graded`; no commit, branch switch or push was made. The gate is not accepted and further mechanism work is stopped pending a supervisor decision.

## gate5 — hit consumes the prediction (命中即销账)

**PASS in seeds 7/19/31.** The 2026-10-18 §6 amendment is implemented. All seeds converge after 100 calibration trials with 99/100 joint Neff=Meff=0; each then passes 100/100 frozen matched trials. Every offset in the separate eleven-offset table is jointly silent in 10/10 trials, including both tolerance edges. Rest, drift, contrasts and weak-miss criteria pass. No later downward-weight changes were started.

Artifacts: [full population/probe report](../out/m11c-gate5/2026-10-17T17-38-25.534Z/report.md), [raw windows, calibration weights, frozen trials and drift trajectories](../out/m11c-gate5/2026-10-17T17-38-25.534Z/results.json), [deadline-drive/cache/rest audit](../out/m11c-gate5/2026-10-17T17-38-25.534Z/audit.json), [full gate log](../logs/m11c-gate5.txt), [synthetic diagnostic](../out/m11c-gate5/synthetic.json), [synthetic log](../logs/m11c-gate5-synthetic.txt), [npm test output](../logs/m11c-gate5-tests.txt), [npm wall time](../logs/m11c-gate5-tests-time.txt). Reproduce with `node experiments/m5-errors.mjs`, `node experiments/m5-synthetic-diagnostic.mjs`, and `npm test`.

**Circuit and eligibility.** Between 100 ms windows, every pending entry retains its strongest matched reality onset and remaining D drive `strength × max(0, 1 − strongest onset)`. At the original deadline, B receives the maximum remaining drive among entries due then. One onset shunts every currently pending prediction whose inclusive tolerance window contains it. The N prediction afferent retains its original strength. Nothing moves the deadline or runs this bookkeeping inside the spiking tick.

ThreeFactor retains the existing additive 400 ms eligibility trace separately for each `(ruleKey, tArrive)` prediction. At its deadline that trace contributes either to the unchanged capped hit term (consumed) or to M weakening (unconsumed). Consumed entries receive one hit credit even when another prediction to B generates positive Meff; another entry’s residual trace cannot supply their deadline credit. Repeated onsets do not duplicate the payment. The weight-update formula, learning rates, N/M deadbands, signed surprise gate and goal-M consumer are unchanged.

**Slow decay restored to 500 ms.** `slowDecayMs = toleranceMs = 500`, with the existing M iSTDP pre-trace tied to that value. Reality→M slow inhibition and its existing excitatory-afferent learning gate remain. Fully consumed predictions have D=0, so that gate freezes M iSTDP on those deadlines; M inhibitory weights remain at their initial 0.05 throughout these matched calibrations. Gate5 was tested at 500 ms only. The earlier gate4 1000 ms results above used the old circuit and are not a second gate5 run.

**Calibration and frozen matched criterion.** The original M5 causal caches and actual continuous P7 are reused; both layers stay frozen and only comparator iSTDP can learn. The schedule remains `eta(trial)=0.2/√trial`, cap 600. Offsets cycle −500, −400, …, +500 ms evenly, with no resets between trials. In a 100-trial batch, −500 has ten samples and each other offset has nine (the smallest possible count imbalance). Convergence requires at least 90 jointly silent trials among the last 100; no consecutive streak is required. Frozen evaluation uses a new 100-trial batch on the same offset cycle, followed by a separate ten-trials-per-offset table interleaved with contrasts and rest.

Expectation N still sums the eleven inclusive labels 2700..3700 ms for arrival 3200 and rectifies once: analytic 3σ=12.186058 for 1100 ms. Deadline M still reads [3700,3800): 3σ=3.674235 for 100 ms. “Silent” means both effective errors are zero, not zero tonic raw spikes. The 100 ms learning deadbands are unchanged.

| Seed | Calibration trials | Jointly silent last 100 | Final eta | Frozen joint silence | Frozen mean Neff / Meff |
| --- | --- | --- | --- | --- | --- |
| 7 | 100 | 99/100 | 0.02000 | 100/100 | 0.000 / 0.000 |
| 19 | 100 | 99/100 | 0.02000 | 100/100 | 0.000 / 0.000 |
| 31 | 100 | 99/100 | 0.02000 | 100/100 | 0.000 / 0.000 |

**Per-offset frozen table: PASS.** Each cell is joint Neff=Meff=0 trials / total. Mean Neff and mean Meff are both exactly zero in every cell. These 110 trials per seed are additional to the frozen 100 above.

| Offset ms | Seed 7 | Seed 19 | Seed 31 |
| --- | --- | --- | --- |
| -500 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| -400 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| -300 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| -200 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| -100 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| 0 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| 100 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| 200 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| 300 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| 400 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |
| 500 | 10/10 (100.00%) | 10/10 (100.00%) | 10/10 (100.00%) |

All 660 frozen matched/paired/jittered predictions have verified matched onsets and zero deadline afferent drive. The audit independently recomputed the prescribed strongest-onset/max-pooling formula for all 690 prediction deadlines, including 30 omissions; no matched trials were dropped. Cache hashes are unchanged, all frozen layer/comparator weights were asserted unchanged, and all rest R/P/D afferents were silent.

**Contrasts: PASS.** Ten probes per condition, unchanged original paired timing (reality 3000, learned arrival 3200 ms). Unexpected Neff and omitted Meff must each average ≥10 and ≥5× their paired effective mean; paired zero passes when the error mean is ≥10.

| Seed | Paired Neff | Unexpected Neff | Paired Meff | Omitted Meff | N / M contrast |
| --- | --- | --- | --- | --- | --- |
| 7 | 0.000 | 157.214 | 0.000 | 120.726 | PASS / PASS (paired 0) |
| 19 | 0.000 | 152.814 | 0.000 | 119.726 | PASS / PASS (paired 0) |
| 31 | 0.000 | 152.214 | 0.000 | 123.026 | PASS / PASS (paired 0) |

**Weak-miss deadband: PASS.** Ten omissions per strength and seed, learning frozen. Each cell is mean deadline Mdev / mean Meff / fraction Meff>0. Every strength ≥0.1 must clear in ≥90% of trials; 0.05 remains diagnostic.

| Strength | Seed 7 | Seed 19 | Seed 31 |
| --- | --- | --- | --- |
| 0.05 | 9.20 / 5.78 / 70.00% | 10.80 / 7.24 / 90.00% | 12.00 / 8.34 / 90.00% |
| 0.1 | 20.90 / 17.24 / 90.00% | 25.70 / 22.03 / 100.00% | 19.40 / 15.73 / 100.00% |
| 0.2 | 38.20 / 34.53 / 100.00% | 45.40 / 41.73 / 100.00% | 40.90 / 37.23 / 100.00% |
| 0.3 | 56.10 / 52.43 / 100.00% | 55.50 / 51.83 / 100.00% | 53.50 / 49.83 / 100.00% |
| 0.5 | 86.90 / 83.23 / 100.00% | 81.10 / 77.43 / 100.00% | 77.90 / 74.23 / 100.00% |
| 1 | 122.70 / 119.03 / 100.00% | 124.30 / 120.63 / 100.00% | 127.10 / 123.43 / 100.00% |

At strength 0.1, Meff mean ± SEM is 7: 17.243 ± 3.117; 19: 22.026 ± 2.632; 31: 15.726 ± 1.602. All exceed three SEM above zero. Seed 7 clears 9/10 at 0.1, meeting the approved 90% threshold; every other strength ≥0.1 cell clears 10/10. The unchanged N/M weak-response, above-rest-noise and monotonicity checks also pass; full signed/raw response tables are in the artifact.

**Rest and drift: PASS under the unchanged bounds.** Ten 30 s rest probes per seed; all 18 populations meet mean 0.5–3 Hz/cell, bursts ≤0.5/s and Fano ≤1.5. Mean below averages all cells; min/max are pooled per-cell rates; bursts/Fano show the worst population. The separate consumer audit is uninterrupted 300 s fresh neural rest.

| Seed | Mean Hz/cell | Min | Max | Max bursts/s/pop | Max Fano | Rest gate open | Audit gate open |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 1.450 | 1.293 | 1.640 | 0.000 | 0.988 | 0.00% | 0.03% |
| 19 | 1.453 | 1.337 | 1.577 | 0.000 | 0.997 | 0.03% | 0.00% |
| 31 | 1.453 | 1.323 | 1.597 | 0.000 | 0.997 | 0.03% | 0.03% |

| Seed | Initial W | Final W | ΔW | Slope /s |
| --- | --- | --- | --- | --- |
| 7 | 0.1 | 0.100008673 | 8.673e-6 | 3.347e-8 |
| 7 | 0 | 0.000009637 | 9.637e-6 | 3.719e-8 |
| 19 | 0.1 | 0.100007971 | 7.971e-6 | 1.932e-8 |
| 19 | 0 | 0.000008857 | 8.857e-6 | 2.146e-8 |
| 31 | 0.1 | 0.100000001 | 5.054e-10 | 2.453e-12 |
| 31 | 0 | 0.000000001 | 5.616e-10 | 2.725e-12 |

The audit retains source onsets every 10 s, cap=1, drift bound `3 × 0.00534713` and slope bound `3 × 1.95217e−5/s`. All six trajectories are non-decreasing, as expected with strengthening-only N. Their small positive drift remains within both bounds. Replaying the saved rest windows through the final ThreeFactor reproduces every recorded trajectory exactly.

**Verification: 107/107 checks pass; npm test exits 0 in 26.240 s** (suite timer 25.92 s, below 30 s). The calibration unit uses the same statistical criterion and all eleven offsets, qualifying 99/100. New tests cover early/±500 ms hits, outside-window onsets and omissions, one onset consuming multiple entries, a separate unconsumed window, fractional strongest-onset shunting and max pooling, JSON resumption, repeated hits credited once, consumed-rule protection despite another miss, and overlapping predictions of one rule with separate deadlines. Existing signed surprise, goal-M and other milestone tests pass.

The supplemental synthetic run converges at 99/100 and is jointly silent in all 110 frozen per-offset trials (including 10/10 at both edges). It is additional evidence; the acceptance tables above use actual P7.

**Wall times.** Frozen probes include the separate 100-trial matched batch, offset grid, contrasts, rest and linearity. Times are measured wall times; the supplemental synthetic diagnostic and focused unit checks briefly overlapped seed 7’s run.

| Seed | Calibration s | Frozen probes s | Rest audit s | Total s |
| --- | --- | --- | --- | --- |
| 7 | 61.56 | 180.52 | 7.09 | 249.17 |
| 19 | 60.39 | 179.28 | 7.04 | 246.71 |
| 31 | 61.00 | 176.20 | 6.83 | 244.02 |

Full gate: **741.02 s**, exit 0. Supplemental synthetic: **4.35 s**. Saved-window/cache audit: **0.55 s**. Final npm test: **26.240 s**, exit 0.

Gate5 files changed: `src/{errors,three-factor}.mjs`; `experiments/m5-{errors,probe,statistics,synthetic-diagnostic}.mjs`; `verify/{all,errors,three-factor}.mjs` and new `verify/prediction-consumption.mjs`; this appended section, plus run artifacts/logs. Changed code files are at most 250 lines. The authoritative design and old repositories are untouched. Branch remains `m11c-graded`; no branch switch, commit or push was made.
