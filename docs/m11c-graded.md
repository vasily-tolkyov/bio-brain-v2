# M11c — design-faithful graded prediction

**FAIL**. Branch `m11c-graded`; no commit, branch switch or push. The authoritative design and gate5 comparator circuit are unchanged. Behavioral failures below are retained; no new gate, threshold, normalization, admission step or scene-specific parameter was added.

Measured failures include STDP contrast, residual chance-rule mass, false-goal actions, and the all-channel mixed hit/miss bound. Parameters were fixed after the initial pilot; failures were not followed by mechanism changes or scenario-specific tuning.

## Implementation and parameter choice

Layer 2 uses w_max=0.1, kappa=0.05, eta_N=0.05, eta_M=0.25, eta_hit=0.005, E0=100, tau=400 ms, and goal gain=3. These constants are shared by every seed/world/feature/column.

The cap 0.1 was selected as an initial layer-scale candidate from the earlier learned-rule order of magnitude, then retained after the seed-7 storm/action pilot produced true W=0.077942/0.069765/0.068405 (ratios 0.779420/0.697650/0.684051). No parameter sweep or per-scene fit was performed. Eta_M is five times eta_N; kappa=0.05 limits the additional co-occurrence channel. Goal gain 3 gives unit drive at half-saturated goal error and W/w_max≈2/3, without changing the motor threshold 0.75.

All cross-row A≠B, k=1…8 weights start at zero. Each 100 ms window applies N/M/hit to the shared W objects, then runs the unchanged surprise-gated layer-2 STDP and adds kappa times the positive change of the directed mean rho. The previous association measurement is bookkeeping only; negative rho changes never weaken W. Only M weakens. Diagnostic cumulative deltas never feed learning.

Predictions carry strength=onset×W/w_max and activation=onset. Per-prediction deadline eligibility traces activation, avoiding W being counted twice. The absolute W floor 1e-4 is only a prediction-scheduling optimization: N, STDP coupling, U and subgoal selection never use it. There is no threshold/library/admission state. U uses the same W objects; observation argmax expands independently of direct action weights. Pending goal-M is multiplied by 1−pending strength.

Every world/teacher/continuation phase uses the shared online learner, including comparator afferent-gated iSTDP. No initial comparator calibration was inserted before rule learning. M5 separately calibrates its frozen-teacher diagnostic comparator using the existing schedule and criteria. Its slots are 25 s to include all eight graded prediction deadlines and clear the 18.1 s past horizon; arrival centres and ±500 ms tolerance are unchanged. All predictions enter the comparator; the matched-trial statistic tracks the strongest learned lightning→thunder rule, while complete created entries and raw windows remain in JSON.

M11b lessons were read from git show m11b-graded-attempt:docs/m11b-correction.md. Its fixed scale 1, strength-based eM, symmetric rates, frozen teacher three-factor path and insufficient motor gain are not retained. Existing gate5 signed deviations, analytic 3σ deadbands, hit consumption and single hit payment remain intact.

## M3: unchanged STDP readout

| Seed | Peak | Causal Δrho@6 | Margin shuffled | Margin bird | Layer 1 intact | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 6 | 0.043649 | 0.019537 | 0.012946 | true | false |
| 19 | 6 | 0.050184 | -0.061401 | 0.050269 | true | false |
| 31 | 6 | 0.073778 | 0.014415 | 0.073811 | true | false |

## M4: graded predictions

Single-column acceptance compares causal column 6 with the maximum control column. Total ratios sum all columns and are diagnostic. Strengths use actual lightning/bird probe onsets.

| Seed | True strength@3200 | Max shuffled | Max bird | Single C/S | Single C/B | Total C/S | Total C/B | Measured arrival ms | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.779420 | 0.160822 | 0.143627 | 4.846480 | 5.426690 | 1.597253 | 1.498126 | 3200.000000 | false |
| 19 | 0.738754 | 0.350966 | 0.097311 | 2.104916 | 7.591699 | 1.072872 | 2.468586 | 3200.000000 | false |
| 31 | 0.672026 | 0.149675 | 0.042463 | 4.489917 | 15.826305 | 1.135719 | 13.118542 | 3200.000000 | false |

Full learned downward W table (absolute weights, all directed pairs):

| Seed | World | Pair | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | causal | lightning→thunder | 0.000041 | 0.000053 | 0.000265 | 0.000709 | 0.002297 | 0.077942 | 0.006289 | 0.000169 |
| 7 | causal | lightning→bird | 0.002641 | 0.001790 | 0.002415 | 0.004253 | 0.006268 | 0.009334 | 0.002398 | 0.000851 |
| 7 | causal | thunder→lightning | 0.000000 | 0.000000 | 0.000001 | 0.000009 | 0.000094 | 0.000087 | 0.000169 | 0.001202 |
| 7 | causal | thunder→bird | 0.003115 | 0.000563 | 0.003197 | 0.006881 | 0.006352 | 0.000592 | 0.000524 | 0.001115 |
| 7 | causal | bird→lightning | 0.004316 | 0.004534 | 0.004722 | 0.005960 | 0.005981 | 0.002898 | 0.002808 | 0.000843 |
| 7 | causal | bird→thunder | 0.013287 | 0.014363 | 0.010919 | 0.004107 | 0.005625 | 0.006746 | 0.003289 | 0.000185 |
| 7 | shuffled | lightning→thunder | 0.004121 | 0.002379 | 0.003488 | 0.005163 | 0.009562 | 0.016082 | 0.011793 | 0.002299 |
| 7 | shuffled | lightning→bird | 0.002427 | 0.001797 | 0.002417 | 0.004269 | 0.006129 | 0.011014 | 0.003360 | 0.000449 |
| 7 | shuffled | thunder→lightning | 0.002016 | 0.001074 | 0.003122 | 0.008618 | 0.019427 | 0.009188 | 0.002179 | 0.001193 |
| 7 | shuffled | thunder→bird | 0.002185 | 0.000006 | 0.000028 | 0.000171 | 0.001581 | 0.003658 | 0.001535 | 0.000770 |
| 7 | shuffled | bird→lightning | 0.004139 | 0.004192 | 0.004286 | 0.005513 | 0.004919 | 0.002761 | 0.002582 | 0.000898 |
| 7 | shuffled | bird→thunder | 0.007217 | 0.008499 | 0.011311 | 0.013045 | 0.004492 | 0.019256 | 0.011439 | 0.003193 |
| 19 | causal | lightning→thunder | 0.000013 | 0.000017 | 0.000086 | 0.000444 | 0.002182 | 0.073875 | 0.000012 | 0.000819 |
| 19 | causal | lightning→bird | 0.000033 | 0.000043 | 0.000096 | 0.000352 | 0.004684 | 0.024088 | 0.003543 | 0.000695 |
| 19 | causal | thunder→lightning | 0.000001 | 0.000001 | 0.000004 | 0.000029 | 0.000424 | 0.000370 | 0.000529 | 0.000367 |
| 19 | causal | thunder→bird | 0.002023 | 0.003314 | 0.008951 | 0.009083 | 0.000966 | 0.002661 | 0.000733 | 0.000367 |
| 19 | causal | bird→lightning | 0.000215 | 0.000277 | 0.001357 | 0.005056 | 0.008480 | 0.010797 | 0.017402 | 0.000370 |
| 19 | causal | bird→thunder | 0.007853 | 0.009731 | 0.006627 | 0.000027 | 0.000080 | 0.002465 | 0.004115 | 0.000531 |
| 19 | shuffled | lightning→thunder | 0.003718 | 0.004081 | 0.006853 | 0.008388 | 0.004728 | 0.035097 | 0.006549 | 0.002654 |
| 19 | shuffled | lightning→bird | 0.000034 | 0.000043 | 0.000098 | 0.000364 | 0.004798 | 0.023993 | 0.003510 | 0.000695 |
| 19 | shuffled | thunder→lightning | 0.001801 | 0.001787 | 0.002602 | 0.005042 | 0.008493 | 0.008984 | 0.003693 | 0.000328 |
| 19 | shuffled | thunder→bird | 0.000575 | 0.000739 | 0.005742 | 0.014345 | 0.004111 | 0.002668 | 0.000832 | 0.000524 |
| 19 | shuffled | bird→lightning | 0.000214 | 0.000277 | 0.001356 | 0.004696 | 0.008477 | 0.010970 | 0.016585 | 0.000185 |
| 19 | shuffled | bird→thunder | 0.006907 | 0.008906 | 0.005601 | 0.001647 | 0.004883 | 0.016913 | 0.010238 | 0.005723 |
| 31 | causal | lightning→thunder | 0.000008 | 0.000010 | 0.000050 | 0.000313 | 0.002196 | 0.067203 | 0.000262 | 0.000547 |
| 31 | causal | lightning→bird | 0.000149 | 0.000191 | 0.000963 | 0.006285 | 0.014145 | 0.004886 | 0.007612 | 0.001835 |
| 31 | causal | thunder→lightning | 0.000000 | 0.000000 | 0.000000 | 0.000003 | 0.000055 | 0.000310 | 0.000274 | 0.001361 |
| 31 | causal | thunder→bird | 0.000044 | 0.000057 | 0.000288 | 0.001744 | 0.009359 | 0.006425 | 0.000934 | 0.001642 |
| 31 | causal | bird→lightning | 0.000405 | 0.000520 | 0.002393 | 0.009141 | 0.011175 | 0.004227 | 0.006102 | 0.000000 |
| 31 | causal | bird→thunder | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000003 | 0.001129 | 0.004246 | 0.000000 |
| 31 | shuffled | lightning→thunder | 0.009482 | 0.006686 | 0.007107 | 0.003083 | 0.004088 | 0.011608 | 0.014967 | 0.005072 |
| 31 | shuffled | lightning→bird | 0.000149 | 0.000191 | 0.000963 | 0.006285 | 0.014147 | 0.005678 | 0.008148 | 0.001835 |
| 31 | shuffled | thunder→lightning | 0.003845 | 0.005069 | 0.006207 | 0.008153 | 0.004839 | 0.002378 | 0.000889 | 0.001607 |
| 31 | shuffled | thunder→bird | 0.000072 | 0.000092 | 0.000452 | 0.002014 | 0.002510 | 0.000883 | 0.001025 | 0.001334 |
| 31 | shuffled | bird→lightning | 0.000272 | 0.000349 | 0.001541 | 0.007317 | 0.009265 | 0.004206 | 0.005581 | 0.000370 |
| 31 | shuffled | bird→thunder | 0.003616 | 0.003784 | 0.003044 | 0.008031 | 0.021562 | 0.014408 | 0.009607 | 0.000000 |

[Seed 7: all M3/M4/M8 profiles, onsets and arrivals](../out/m11c-graded/readout/7.json)

[Seed 19: all M3/M4/M8 profiles, onsets and arrivals](../out/m11c-graded/readout/19.json)

[Seed 31: all M3/M4/M8 profiles, onsets and arrivals](../out/m11c-graded/readout/31.json)

## M5: gate5 criteria with learned graded rules

| Seed | Calibration trials / pass | Frozen matched silence | −500 / +500 silence | Unexpected Neff | Omitted Meff | Paired N / M | Weak deadband | All checks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 100 / true | 100.00% | 100.00% / 100.00% | 147.113942 | 110.625765 | 0.000000 / 0.000000 | true | true |
| 19 | 100 / true | 100.00% | 90.00% / 100.00% | 152.513942 | 98.225765 | 0.000000 / 0.000000 | true | true |
| 31 | 100 / true | 100.00% | 100.00% / 100.00% | 158.613942 | 97.025765 | 0.000000 / 0.000000 | true | true |

[Seed 7](../out/m11c-graded/m5/2026-10-17T18-26-38.561Z/results.json): {"rest":true,"N":true,"M":true,"frozenMatched":true,"edges":true,"calibration":true,"weakDeadband":true,"linearity":true,"restGateClosed":true,"restDrift":true,"frozen":true}. All per-offset, weak-response and rest statistics are in this artifact.

[Seed 19](../out/m11c-graded/m5/2026-10-17T18-31-58.910Z/results.json): {"rest":true,"N":true,"M":true,"frozenMatched":true,"edges":true,"calibration":true,"weakDeadband":true,"linearity":true,"restGateClosed":true,"restDrift":true,"frozen":true}. All per-offset, weak-response and rest statistics are in this artifact.

[Seed 31](../out/m11c-graded/m5/2026-10-17T18-32-00.080Z/results.json): {"rest":true,"N":true,"M":true,"frozenMatched":true,"edges":true,"calibration":true,"weakDeadband":true,"linearity":true,"restGateClosed":true,"restDrift":true,"frozen":true}. All per-offset, weak-response and rest statistics are in this artifact.

## M6/M7: extinction, recovery, jitter

All learning channels remain on. D and E restore the exact full end-A state, including both layers, comparator, RNGs, W and eligibility. This is an experiment branch, never rule admission.

| Seed | A W | B60/A | Trials to 50% / 10% | C30/A | C60/A | Jitter/A | Checks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.082189 | 2.18% | 1 / 7 | 78.91% | 99.36% | 110.58% | {"extinction":true,"jitter":true,"asymmetry":false,"recovery":true} |
| 19 | 0.078905 | 1.82% | 1 / 6 | 84.23% | 104.87% | 113.15% | {"extinction":true,"jitter":true,"asymmetry":false,"recovery":true} |
| 31 | 0.075089 | 2.20% | 1 / 7 | 83.57% | 107.12% | 117.50% | {"extinction":true,"jitter":true,"asymmetry":false,"recovery":true} |

Seed 7, full B0…B60 W: 0.082189, 0.036093, 0.022103, 0.015809, 0.012926, 0.011058, 0.010109, 0.007914, 0.006962, 0.006365, 0.005876, 0.004847, 0.004565, 0.004479, 0.004348, 0.004137, 0.003896, 0.003896, 0.003822, 0.003711, 0.003359, 0.003101, 0.003043, 0.003016, 0.002785, 0.002785, 0.002732, 0.002732, 0.002680, 0.002680, 0.002629, 0.002579, 0.002504, 0.002410, 0.002429, 0.002358, 0.002314, 0.002314, 0.002246, 0.002246, 0.002246, 0.002246, 0.002137, 0.002119, 0.002078, 0.002018, 0.001900, 0.001900, 0.001900, 0.001900, 0.001900, 0.001845, 0.001845, 0.001845, 0.001755, 0.001934, 0.001858, 0.001823, 0.001823, 0.001789, 0.001789.

[All A/B/C/D/E trajectories and per-trial channel deltas, seed 7](../out/m11c-graded/m6-7/results.json)

Seed 19, full B0…B60 W: 0.078905, 0.039403, 0.024298, 0.017244, 0.012142, 0.010292, 0.007303, 0.007019, 0.006544, 0.006225, 0.005375, 0.005012, 0.004816, 0.004278, 0.004278, 0.004278, 0.003949, 0.003874, 0.003883, 0.003770, 0.003586, 0.003586, 0.003040, 0.002726, 0.002726, 0.002726, 0.002726, 0.002674, 0.002445, 0.002279, 0.002168, 0.002168, 0.002150, 0.002150, 0.002131, 0.002048, 0.002048, 0.001929, 0.001763, 0.001763, 0.001763, 0.001644, 0.001644, 0.001644, 0.001644, 0.001644, 0.001596, 0.001776, 0.001776, 0.001697, 0.001682, 0.001682, 0.001682, 0.001600, 0.001600, 0.001492, 0.001492, 0.001492, 0.001492, 0.001492, 0.001434.

[All A/B/C/D/E trajectories and per-trial channel deltas, seed 19](../out/m11c-graded/m6-19/results.json)

Seed 31, full B0…B60 W: 0.075089, 0.033329, 0.019461, 0.014143, 0.010617, 0.009520, 0.007784, 0.007116, 0.006202, 0.005841, 0.005613, 0.005075, 0.005075, 0.004594, 0.004119, 0.003730, 0.003312, 0.003312, 0.003235, 0.003235, 0.003207, 0.003207, 0.002822, 0.002822, 0.002822, 0.002822, 0.002822, 0.002530, 0.002313, 0.002313, 0.002313, 0.002223, 0.002204, 0.002204, 0.002344, 0.002277, 0.002102, 0.002102, 0.002062, 0.002062, 0.002062, 0.002045, 0.002045, 0.002045, 0.002045, 0.002027, 0.002027, 0.001988, 0.001988, 0.001971, 0.001971, 0.001971, 0.001894, 0.001894, 0.001839, 0.001649, 0.001649, 0.001649, 0.001649, 0.001649, 0.001649.

[All A/B/C/D/E trajectories and per-trial channel deltas, seed 31](../out/m11c-graded/m6-31/results.json)

## Hard asymmetry

The equal-W, equal-eligibility unit test uses W/w_max=0.8 and N=M=E0, with actual 100 ms layer-2 co-activity and its measured STDP coupling. Total strengthening/miss loss is 0.373550 (seed 7); hit-only is 0.010000. The same unit checks give total ratios 0.164926/0.063311 for seeds 19/31. No assumed co-occurrence gain enters this unit test.

M7b alternates 15 hits and 15 misses, starting from end A. Gain/loss includes every learning channel; hit-only is separately accumulated. A negative last-10-trial slope is used to check continuing downward trend.

| Seed | Start → end W | Net weakening | Hit gain | Miss loss | Total ratio ≤0.5 | Hit-only ≤0.2 | Full / last10 slope | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.082189 → 0.013842 | 83.16% | 0.005979 | 0.010535 | 0.567497 | 0.145363 | -0.001106 / -0.000674 | false |
| 19 | 0.078905 → 0.012911 | 83.64% | 0.005961 | 0.010360 | 0.575341 | 0.148621 | -0.001098 / -0.000133 | false |
| 31 | 0.075089 → 0.015925 | 78.79% | 0.005848 | 0.009793 | 0.597216 | 0.160640 | -0.001023 / -0.000119 | false |

## M8: unchanged STDP readout

Each causal/shuffled teacher is replayed with all learning enabled, recording executions and efference copies. The causal replay must reproduce its full cached downward state exactly.

| Seed | Rule | Peak | Margin shuffled | Margin cross/bird | Executions / copies | Weak actions | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | press→light | 6 | -0.014075 | 0.011305 | 90/90; 90/90 | 0/0 | false |
| 7 | wave→bell | 4 | 0.024894 | 0.048694 | 90/90; 90/90 | 0/0 | false |
| 19 | press→light | 6 | 0.034611 | 0.033083 | 90/90; 90/90 | 0/0 | false |
| 19 | wave→bell | 4 | 0.027591 | 0.027489 | 90/90; 90/90 | 0/0 | false |
| 31 | press→light | 6 | -0.019353 | 0.006146 | 90/90; 90/90 | 0/0 | false |
| 31 | wave→bell | 4 | 0.043541 | 0.043409 | 90/90; 90/90 | 0/0 | false |

## M9 direct goals

| Seed | Goal | Correct first | Achieved | Actions | Extra/probe | Max actions/probe | Distractors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | light | 95.00% | 100.00% | 22 | 0.100000 | 2 | 1 |
| 7 | bell | 100.00% | 100.00% | 20 | 0.000000 | 1 | 0 |
| 7 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 7 | bird | — | 80.00% | 88 | 7.800000 | 14 | 88 |
| 19 | light | 95.00% | 100.00% | 27 | 0.350000 | 3 | 2 |
| 19 | bell | 100.00% | 100.00% | 20 | 0.000000 | 1 | 0 |
| 19 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 19 | bird | — | 90.00% | 19 | 0.900000 | 3 | 19 |
| 31 | light | 100.00% | 100.00% | 20 | 0.000000 | 1 | 0 |
| 31 | bell | 100.00% | 100.00% | 20 | 0.000000 | 1 | 0 |
| 31 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 31 | bird | — | 100.00% | 102 | 9.200000 | 23 | 102 |

[Seed 7: raw goal windows](../out/m11c-graded/m9/2026-10-17T18-27-50.086Z/results.json)

[Seed 19: raw goal windows](../out/m11c-graded/m9/2026-10-17T18-50-01.924Z/results.json)

[Seed 31: raw goal windows](../out/m11c-graded/m9/2026-10-17T18-50-01.693Z/results.json)

## M10 recursive goals

| Seed | Goal | Correct first | Achieved | Actions | Extra/probe | Max actions/probe | Distractors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | bell | 100.00% | 100.00% | 21 | 0.050000 | 2 | 0 |
| 7 | light | 100.00% | 100.00% | 21 | 0.050000 | 2 | 0 |
| 7 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 7 | bird | — | 100.00% | 234 | 10.700000 | 20 | 234 |
| 7 | bell-ablated | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 19 | bell | 100.00% | 100.00% | 20 | 0.000000 | 1 | 0 |
| 19 | light | 100.00% | 100.00% | 20 | 0.000000 | 1 | 0 |
| 19 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 19 | bird | — | 100.00% | 34 | 0.700000 | 5 | 34 |
| 19 | bell-ablated | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 31 | bell | 100.00% | 100.00% | 20 | 0.000000 | 1 | 0 |
| 31 | light | 100.00% | 100.00% | 20 | 0.000000 | 1 | 0 |
| 31 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 31 | bird | — | 100.00% | 202 | 9.100000 | 24 | 202 |
| 31 | bell-ablated | — | 0.00% | 0 | 0.000000 | 0 | 0 |

[Seed 7: raw goal windows](../out/m11c-graded/m10/2026-10-17T18-38-26.909Z/results.json)

[Seed 19: raw goal windows](../out/m11c-graded/m10/2026-10-17T18-52-35.365Z/results.json)

[Seed 31: raw goal windows](../out/m11c-graded/m10/2026-10-17T18-52-35.601Z/results.json)

## M11a: 60 natural-world trials, continued online learning

All 237 non-causal rules are included, including zeros and every action/bird pair. Only press→light@6, light→bell@4 and valid transitive press→bell@6 are excluded. Slopes below use normalized W/w_max; true-rule slopes use the final 20 trials. Stability and recovery are reported numerically for supervisor assessment; no new numerical cutoff is imposed.

| Seed | Final non-causal mean | p95 | max ≤0.1 | Mean / p95 / max slope per trial | Checks |
| --- | --- | --- | --- | --- | --- |
| 7 | 0.034506 | 0.095850 | 0.275652 | 0.000032 / -0.000295 / -0.000282 | {"falseEnd":false,"falseTrend":false} |
| 19 | 0.037438 | 0.103606 | 0.210687 | 0.000062 / -0.000168 / -0.000375 | {"falseEnd":false,"falseTrend":false} |
| 31 | 0.035682 | 0.091902 | 0.213664 | 0.000115 / -0.000105 / -0.000608 | {"falseEnd":false,"falseTrend":false} |

| Seed | True rule | Final W/w_max | Last20 mean | Last20 slope/trial | Equal-credit hit-only/miss at E0 |
| --- | --- | --- | --- | --- | --- |
| 7 | [0,4,6] | 0.910328 | 0.888357 | 0.002448 | 0.003940 |
| 7 | ["action:press",6,0] | 0.925062 | 0.904425 | 0.002194 | 0.003240 |
| 7 | ["action:press",6,6] | 0.028473 | 0.025180 | 0.000089 | 1.364839 |
| 19 | [0,4,6] | 0.907048 | 0.884238 | 0.002571 | 0.004099 |
| 19 | ["action:press",6,0] | 0.915693 | 0.895119 | 0.002291 | 0.003683 |
| 19 | ["action:press",6,6] | 0.024866 | 0.024656 | 0.000449 | 1.568648 |
| 31 | [0,4,6] | 0.912544 | 0.890625 | 0.002479 | 0.003834 |
| 31 | ["action:press",6,0] | 0.911613 | 0.889491 | 0.002447 | 0.003878 |
| 31 | ["action:press",6,6] | 0.033276 | 0.033298 | -0.000336 | 1.162067 |

[Every rule: peak, time to 50%/10%, final W and final ratio](../out/m11c-graded/rule-decay.csv)

Crossings are measured after each rule’s global within-continuation peak (sampled every 100 ms). Blank crossings mean not reached within the 60 trials. Full trajectories remain in the per-seed JSON.

| Seed | Trial | Non-causal mean | p95 | max |
| --- | --- | --- | --- | --- |
| 7 | 0 | 0.030436 | 0.122238 | 0.239132 |
| 7 | 1 | 0.031820 | 0.111734 | 0.255231 |
| 7 | 2 | 0.031553 | 0.100924 | 0.270030 |
| 7 | 3 | 0.031113 | 0.104314 | 0.254553 |
| 7 | 4 | 0.031149 | 0.100072 | 0.197590 |
| 7 | 5 | 0.031465 | 0.106146 | 0.188609 |
| 7 | 6 | 0.030667 | 0.105879 | 0.227475 |
| 7 | 7 | 0.031702 | 0.100583 | 0.192492 |
| 7 | 8 | 0.032684 | 0.104781 | 0.211118 |
| 7 | 9 | 0.033867 | 0.119441 | 0.189743 |
| 7 | 10 | 0.033673 | 0.115875 | 0.236844 |
| 7 | 11 | 0.034503 | 0.118041 | 0.243102 |
| 7 | 12 | 0.033017 | 0.107319 | 0.221343 |
| 7 | 13 | 0.032864 | 0.109097 | 0.212364 |
| 7 | 14 | 0.032511 | 0.105214 | 0.173022 |
| 7 | 15 | 0.033005 | 0.100857 | 0.211797 |
| 7 | 16 | 0.033797 | 0.103216 | 0.210017 |
| 7 | 17 | 0.033569 | 0.112760 | 0.165835 |
| 7 | 18 | 0.033373 | 0.110036 | 0.207104 |
| 7 | 19 | 0.033407 | 0.108645 | 0.179211 |
| 7 | 20 | 0.032494 | 0.107041 | 0.190920 |
| 7 | 21 | 0.031489 | 0.096090 | 0.167175 |
| 7 | 22 | 0.034425 | 0.115717 | 0.171483 |
| 7 | 23 | 0.034816 | 0.112677 | 0.230753 |
| 7 | 24 | 0.036390 | 0.103156 | 0.230963 |
| 7 | 25 | 0.036248 | 0.113357 | 0.203518 |
| 7 | 26 | 0.035834 | 0.110091 | 0.227074 |
| 7 | 27 | 0.036035 | 0.109866 | 0.194087 |
| 7 | 28 | 0.037309 | 0.121716 | 0.214243 |
| 7 | 29 | 0.035494 | 0.104575 | 0.263897 |
| 7 | 30 | 0.035754 | 0.120588 | 0.203002 |
| 7 | 31 | 0.034826 | 0.103728 | 0.237601 |
| 7 | 32 | 0.034870 | 0.104670 | 0.195987 |
| 7 | 33 | 0.033641 | 0.095941 | 0.180084 |
| 7 | 34 | 0.035676 | 0.115009 | 0.183720 |
| 7 | 35 | 0.035961 | 0.112886 | 0.209926 |
| 7 | 36 | 0.035159 | 0.102454 | 0.182889 |
| 7 | 37 | 0.034711 | 0.099367 | 0.197544 |
| 7 | 38 | 0.035416 | 0.117678 | 0.203775 |
| 7 | 39 | 0.034516 | 0.096770 | 0.149284 |
| 7 | 40 | 0.034003 | 0.099371 | 0.153231 |
| 7 | 41 | 0.033603 | 0.094623 | 0.165077 |
| 7 | 42 | 0.033109 | 0.091948 | 0.172886 |
| 7 | 43 | 0.033768 | 0.094296 | 0.163962 |
| 7 | 44 | 0.035164 | 0.093783 | 0.201496 |
| 7 | 45 | 0.034363 | 0.099251 | 0.162657 |
| 7 | 46 | 0.034799 | 0.095727 | 0.204607 |
| 7 | 47 | 0.033723 | 0.094362 | 0.217406 |
| 7 | 48 | 0.033415 | 0.089766 | 0.245502 |
| 7 | 49 | 0.035131 | 0.109499 | 0.196641 |
| 7 | 50 | 0.033775 | 0.099461 | 0.213640 |
| 7 | 51 | 0.032651 | 0.092462 | 0.182447 |
| 7 | 52 | 0.034214 | 0.088102 | 0.184742 |
| 7 | 53 | 0.032929 | 0.087226 | 0.226229 |
| 7 | 54 | 0.032486 | 0.079582 | 0.242602 |
| 7 | 55 | 0.033034 | 0.103021 | 0.260404 |
| 7 | 56 | 0.032753 | 0.087547 | 0.201588 |
| 7 | 57 | 0.032672 | 0.093955 | 0.212285 |
| 7 | 58 | 0.034228 | 0.102798 | 0.169974 |
| 7 | 59 | 0.034202 | 0.108593 | 0.187393 |
| 7 | 60 | 0.034506 | 0.095850 | 0.275652 |
| 19 | 0 | 0.029541 | 0.104068 | 0.260429 |
| 19 | 1 | 0.030025 | 0.112109 | 0.226976 |
| 19 | 2 | 0.030341 | 0.106152 | 0.187614 |
| 19 | 3 | 0.030431 | 0.101055 | 0.205265 |
| 19 | 4 | 0.030542 | 0.103472 | 0.173994 |
| 19 | 5 | 0.032938 | 0.102100 | 0.227231 |
| 19 | 6 | 0.032506 | 0.104657 | 0.239921 |
| 19 | 7 | 0.032941 | 0.129110 | 0.184935 |
| 19 | 8 | 0.032861 | 0.114524 | 0.194868 |
| 19 | 9 | 0.034663 | 0.120159 | 0.239454 |
| 19 | 10 | 0.034255 | 0.115400 | 0.178294 |
| 19 | 11 | 0.034364 | 0.117722 | 0.183922 |
| 19 | 12 | 0.035269 | 0.122240 | 0.250515 |
| 19 | 13 | 0.035221 | 0.132475 | 0.223518 |
| 19 | 14 | 0.035439 | 0.125989 | 0.210258 |
| 19 | 15 | 0.035247 | 0.121206 | 0.198675 |
| 19 | 16 | 0.035517 | 0.112666 | 0.256184 |
| 19 | 17 | 0.035279 | 0.104830 | 0.278459 |
| 19 | 18 | 0.034567 | 0.104830 | 0.365763 |
| 19 | 19 | 0.034184 | 0.113906 | 0.233674 |
| 19 | 20 | 0.035140 | 0.113996 | 0.289816 |
| 19 | 21 | 0.034810 | 0.104528 | 0.187850 |
| 19 | 22 | 0.034463 | 0.108751 | 0.212001 |
| 19 | 23 | 0.034115 | 0.099535 | 0.258934 |
| 19 | 24 | 0.034908 | 0.115285 | 0.249807 |
| 19 | 25 | 0.036771 | 0.124044 | 0.201704 |
| 19 | 26 | 0.036930 | 0.116376 | 0.188351 |
| 19 | 27 | 0.039324 | 0.120287 | 0.211314 |
| 19 | 28 | 0.037067 | 0.104830 | 0.194949 |
| 19 | 29 | 0.036535 | 0.103188 | 0.187149 |
| 19 | 30 | 0.035478 | 0.092401 | 0.161703 |
| 19 | 31 | 0.036810 | 0.109394 | 0.192554 |
| 19 | 32 | 0.035799 | 0.095638 | 0.203889 |
| 19 | 33 | 0.035017 | 0.087143 | 0.220734 |
| 19 | 34 | 0.034534 | 0.084079 | 0.254075 |
| 19 | 35 | 0.035767 | 0.126079 | 0.170878 |
| 19 | 36 | 0.036064 | 0.103499 | 0.271967 |
| 19 | 37 | 0.035797 | 0.109563 | 0.184881 |
| 19 | 38 | 0.036160 | 0.104516 | 0.290730 |
| 19 | 39 | 0.034093 | 0.105301 | 0.216473 |
| 19 | 40 | 0.033260 | 0.092336 | 0.145589 |
| 19 | 41 | 0.032743 | 0.090748 | 0.176719 |
| 19 | 42 | 0.034095 | 0.114112 | 0.180965 |
| 19 | 43 | 0.035844 | 0.106838 | 0.185095 |
| 19 | 44 | 0.037468 | 0.122214 | 0.262163 |
| 19 | 45 | 0.035642 | 0.111180 | 0.241009 |
| 19 | 46 | 0.034687 | 0.102960 | 0.206645 |
| 19 | 47 | 0.035282 | 0.109091 | 0.177556 |
| 19 | 48 | 0.034609 | 0.111131 | 0.256535 |
| 19 | 49 | 0.035146 | 0.106613 | 0.172532 |
| 19 | 50 | 0.035734 | 0.106613 | 0.177010 |
| 19 | 51 | 0.035240 | 0.107120 | 0.183595 |
| 19 | 52 | 0.035818 | 0.108889 | 0.194863 |
| 19 | 53 | 0.034999 | 0.099371 | 0.188295 |
| 19 | 54 | 0.035459 | 0.096052 | 0.252844 |
| 19 | 55 | 0.035586 | 0.102924 | 0.226174 |
| 19 | 56 | 0.034368 | 0.102924 | 0.156437 |
| 19 | 57 | 0.036452 | 0.110650 | 0.161626 |
| 19 | 58 | 0.036244 | 0.095561 | 0.270669 |
| 19 | 59 | 0.038114 | 0.115851 | 0.213547 |
| 19 | 60 | 0.037438 | 0.103606 | 0.210687 |
| 31 | 0 | 0.029511 | 0.104629 | 0.204464 |
| 31 | 1 | 0.029605 | 0.108792 | 0.225209 |
| 31 | 2 | 0.030471 | 0.111319 | 0.215130 |
| 31 | 3 | 0.030701 | 0.114822 | 0.199321 |
| 31 | 4 | 0.030799 | 0.107637 | 0.193526 |
| 31 | 5 | 0.030377 | 0.111013 | 0.226673 |
| 31 | 6 | 0.032004 | 0.112773 | 0.208229 |
| 31 | 7 | 0.032040 | 0.114177 | 0.228967 |
| 31 | 8 | 0.031944 | 0.113861 | 0.236368 |
| 31 | 9 | 0.032345 | 0.114687 | 0.180721 |
| 31 | 10 | 0.032413 | 0.110138 | 0.232980 |
| 31 | 11 | 0.032194 | 0.103913 | 0.249210 |
| 31 | 12 | 0.031072 | 0.095426 | 0.273866 |
| 31 | 13 | 0.034287 | 0.117576 | 0.278601 |
| 31 | 14 | 0.035580 | 0.128193 | 0.228485 |
| 31 | 15 | 0.034524 | 0.118746 | 0.205952 |
| 31 | 16 | 0.035024 | 0.107366 | 0.297926 |
| 31 | 17 | 0.034376 | 0.110049 | 0.204973 |
| 31 | 18 | 0.033165 | 0.109441 | 0.201394 |
| 31 | 19 | 0.032901 | 0.100872 | 0.226180 |
| 31 | 20 | 0.033643 | 0.094456 | 0.259781 |
| 31 | 21 | 0.032189 | 0.107050 | 0.308685 |
| 31 | 22 | 0.030342 | 0.095482 | 0.168165 |
| 31 | 23 | 0.031437 | 0.105851 | 0.192362 |
| 31 | 24 | 0.031792 | 0.093822 | 0.247456 |
| 31 | 25 | 0.032822 | 0.108942 | 0.178404 |
| 31 | 26 | 0.032299 | 0.111488 | 0.248334 |
| 31 | 27 | 0.033373 | 0.108851 | 0.268957 |
| 31 | 28 | 0.033025 | 0.100010 | 0.285448 |
| 31 | 29 | 0.032900 | 0.100010 | 0.236083 |
| 31 | 30 | 0.033662 | 0.105841 | 0.171440 |
| 31 | 31 | 0.033128 | 0.106779 | 0.168715 |
| 31 | 32 | 0.033925 | 0.097555 | 0.204350 |
| 31 | 33 | 0.035321 | 0.098815 | 0.205240 |
| 31 | 34 | 0.036543 | 0.102732 | 0.232406 |
| 31 | 35 | 0.036121 | 0.117635 | 0.239957 |
| 31 | 36 | 0.034923 | 0.115729 | 0.160585 |
| 31 | 37 | 0.035254 | 0.110717 | 0.139371 |
| 31 | 38 | 0.036417 | 0.099687 | 0.204310 |
| 31 | 39 | 0.035737 | 0.101544 | 0.195954 |
| 31 | 40 | 0.035545 | 0.106600 | 0.255264 |
| 31 | 41 | 0.036928 | 0.130055 | 0.216802 |
| 31 | 42 | 0.036634 | 0.115285 | 0.156381 |
| 31 | 43 | 0.035983 | 0.107209 | 0.152956 |
| 31 | 44 | 0.037444 | 0.101553 | 0.222695 |
| 31 | 45 | 0.038133 | 0.105495 | 0.210539 |
| 31 | 46 | 0.038667 | 0.114175 | 0.204483 |
| 31 | 47 | 0.037560 | 0.114304 | 0.204923 |
| 31 | 48 | 0.038180 | 0.123135 | 0.223988 |
| 31 | 49 | 0.037348 | 0.104495 | 0.185833 |
| 31 | 50 | 0.036413 | 0.105161 | 0.192505 |
| 31 | 51 | 0.036473 | 0.110896 | 0.165684 |
| 31 | 52 | 0.037133 | 0.103684 | 0.204909 |
| 31 | 53 | 0.036189 | 0.093247 | 0.276738 |
| 31 | 54 | 0.036675 | 0.103776 | 0.203104 |
| 31 | 55 | 0.035751 | 0.096913 | 0.225311 |
| 31 | 56 | 0.034664 | 0.098030 | 0.152649 |
| 31 | 57 | 0.036845 | 0.106263 | 0.183286 |
| 31 | 58 | 0.036603 | 0.104916 | 0.229182 |
| 31 | 59 | 0.036949 | 0.107432 | 0.159348 |
| 31 | 60 | 0.035682 | 0.091902 | 0.213664 |

## Strongest false-rule decomposition

Strongest means maximum W reached over the continuation, including the initial boundary. Totals are actual cumulative channel deltas; clamp corrections are shown separately.

| Seed | Rule | Period | STDP coupling | N | M | Hit | Clamp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | ["action:wave",7,"action:idle"] | lifetime | 0.000176 | 0.092964 | -0.069352 | 0.003778 | 0.000000 |
| 7 | ["action:wave",7,"action:idle"] | continuation | 0.000176 | 0.057427 | -0.036723 | 0.003778 | 0.000000 |
| 19 | [12,7,"action:press"] | lifetime | 0.005005 | 0.145342 | -0.152340 | 0.005544 | 0.000000 |
| 19 | [12,7,"action:press"] | continuation | 0.003706 | 0.106067 | -0.111959 | 0.003718 | 0.000000 |
| 31 | ["action:idle",7,"action:press"] | lifetime | 0.000301 | 0.110098 | -0.111204 | 0.006835 | 0.000000 |
| 31 | ["action:idle",7,"action:press"] | continuation | 0.000301 | 0.083840 | -0.089250 | 0.005101 | 0.000000 |

## M11a frozen goal probes

| Seed | Goal | Correct first | Achieved | Actions | Extra/probe | Max actions/probe | Distractors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | bell | 100.00% | 100.00% | 132 | 5.600000 | 9 | 15 |
| 7 | light | 100.00% | 100.00% | 110 | 4.500000 | 8 | 0 |
| 7 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 7 | bird | — | 100.00% | 228 | 10.400000 | 23 | 228 |
| 7 | bell-ablated | — | 0.00% | 1 | 0.000000 | 1 | 1 |
| 19 | bell | 95.00% | 100.00% | 152 | 6.600000 | 10 | 119 |
| 19 | light | 100.00% | 100.00% | 107 | 4.350000 | 11 | 0 |
| 19 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 19 | bird | — | 100.00% | 96 | 3.800000 | 12 | 96 |
| 19 | bell-ablated | — | 0.00% | 251 | 11.550000 | 18 | 251 |
| 31 | bell | 70.00% | 100.00% | 179 | 7.950000 | 12 | 145 |
| 31 | light | 100.00% | 100.00% | 65 | 2.250000 | 7 | 0 |
| 31 | none | — | 0.00% | 0 | 0.000000 | 0 | 0 |
| 31 | bird | — | 100.00% | 29 | 0.450000 | 5 | 29 |
| 31 | bell-ablated | — | 0.00% | 476 | 22.800000 | 28 | 476 |

[Seed 7: raw goal windows](../out/m11c-graded/m11a/7.json)

[Seed 19: raw goal windows](../out/m11c-graded/m11a/19.json)

[Seed 31: raw goal windows](../out/m11c-graded/m11a/31.json)

Seed-19 over-pressing (M10): 20 presses and 0 extra actions across 20 bell probes (0.000000 extra/probe). See raw windows for graded pending strengths and effective goal-M.

0 repeated presses occur before the first light onset; 0 have positive pending light strength and positive effective goal-M in the preceding drive window. Examples: [].

Seed-19 over-pressing (after M11a): 33 presses and 132 extra actions across 20 bell probes (6.600000 extra/probe). See raw windows for graded pending strengths and effective goal-M.

13 repeated presses occur before the first light onset; 13 have positive pending light strength and positive effective goal-M in the preceding drive window. Examples: [{"repeat":0,"t":1400,"pending":0.9156933109896056,"effective":11.845089805960413},{"repeat":2,"t":1800,"pending":0.9156933109896056,"effective":11.592169738929229},{"repeat":5,"t":1700,"pending":0.9156933109896056,"effective":12.013703183981201}].

## Diagnosis and stopping boundary

Correct predictions close the unchanged layer-2 surprise gate during teaching. Causal/shuffled storm gate-open windows are 472/658, 500/672 and 450/652, respectively. Causal peaks survive, but the unchanged STDP margin requirements fail. This is consistent with learning shifting into N/hit before the layer-2 association readout reaches its former separation.

The event-level unit bound does not imply the full 30-trial bound. As W falls, miss loss scales with W and the weaker prediction’s Meff, while N and hit retain headroom w_max−W. All three mixed runs have downward slopes and large net weakening, yet total gain/loss remains above 0.5. Chance events keep replenishing false rules; their cumulative N/STDP/hit and M totals are exposed above.

Summing weak columns through fixed-gain U can still execute false goals. For example, seed-7 M8 normalized action→bird sums are press 0.504071, wave 0.415609 and idle 0.568982; these are substantial summed drives despite individually weak rules. Graded pending suppression also leaves residual motor drive, explaining repeated executions in the saved windows.

The transitive press→bell delay is 3000+1000=4000 ms. It occupies past column 6, but the unchanged future centre is 3200 ms and the deadline is 3700 ms. The outcome is outside that prediction’s tolerance. Seed 7’s natural continuation transitive delta is N +0.007015, M −0.004265, STDP 0, hit 0; its final ratio is only 0.028473. No timing mechanism was changed to compensate.

The true-rule endpoints and last-20 slopes are finite-run estimates, not proof of equilibrium. Behavioral acceptance is failed and awaits supervisor judgment. No extra mechanism or scenario-specific parameter was introduced to repair these failures.

## Wall times and verification

[Cache provenance and channel-accounting audit](../out/m11c-graded/audit.json)

| Seed | Run | Wall seconds |
| --- | --- | --- |
| 7 | M4 causal | 188.860195 |
| 7 | M4 shuffled | 154.018732 |
| 7 | M8 causal | 378.388162 |
| 7 | M10 T1/T2 | 681.036407 |
| 19 | M4 causal | 158.153158 |
| 19 | M4 shuffled | 156.383463 |
| 19 | M8 causal | 342.554784 |
| 19 | M10 T1/T2 | 705.302079 |
| 31 | M4 causal | 155.578764 |
| 31 | M4 shuffled | 153.491715 |
| 31 | M8 causal | 340.109149 |
| 31 | M10 T1/T2 | 711.438952 |
| 7 | M3/M4/M8 readout | 805.759777 |
| 19 | M3/M4/M8 readout | 816.753767 |
| 31 | M3/M4/M8 readout | 815.197675 |
| 7 | M5 | 741.764299 |
| 19 | M5 | 756.171097 |
| 31 | M5 | 745.714190 |
| 7 | M6/M7/M7b | 869.318312 |
| 19 | M6/M7/M7b | 803.535440 |
| 31 | M6/M7/M7b | 801.279621 |
| 7 | M9 | 94.118442 |
| 19 | M9 | 153.158840 |
| 31 | M9 | 153.590926 |
| 7 | M10 probes | 237.734358 |
| 19 | M10 probes | 190.711070 |
| 31 | M10 probes | 191.572483 |
| 7 | M11a + probes | 917.153569 |
| 19 | M11a + probes | 961.073047 |
| 31 | M11a + probes | 965.799984 |

98/98 checks passed.

[Full npm test output](../out/m11c-graded/tests.txt)

[Measured test wall time](../out/m11c-graded/tests-time.txt)

The fast suite checks implementation invariants; it does not replace the failed long behavioral acceptance above.



M0: PASS; M1: PASS; M2: PASS; M3: PASS; M4: PASS; M5: PASS; M6/M7: PASS (27.25 s)

M8: PASS

M9/M10: PASS

Experiment/report elapsed wall time: 5083.996576 s (84.733276 min). Independent foreground terminal processes overlap, so individual wall times must not be added.

Reproduce per seed (7/19/31): node experiments/m4-learning.mjs SEED; node experiments/m8-cache.mjs SEED; node experiments/m10-cache.mjs SEED; node experiments/m11c-readout.mjs SEED; node experiments/m5-errors.mjs SEED; node experiments/m6-calibrate.mjs SEED; node experiments/m9-goals.mjs SEED; node experiments/m10-goals.mjs SEED; node experiments/m11a-extinction.mjs SEED. Finally npm test and node experiments/m11c-report.mjs. Fresh caches have source signatures; historical caches are not accepted.

Changed code: src/downward.mjs and src/learning.mjs; prediction, three-factor and goal consumers; removal of layer downNoiseK; online experiment/cache adapters and graded verification. Added M11a continuation/measurement files, M11c readout/report scripts and this report; README notes the current implementation. The unused frozen M6 cache was removed. SUPERVISION.md was changed externally during this session and was not edited here.

