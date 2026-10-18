# M11e step b — seed-7 Phase 1 pilot

**Step-b pilot complete. Stopped before three-seed acceptance; results below are not a milestone acceptance.** No parameter sweep, scene-specific constants, new learning gate, or context cell.

Artifacts: [summary.json](../out/m11e-pilot-b/summary.json), [parameters.json](../out/m11e-pilot-b/parameters.json), [audit.json](../out/m11e-pilot-b/audit.json), [sources.json](../out/m11e-pilot-b/sources.json), [run log](../out/m11e-pilot-b/run.log), [tests](../out/m11e-pilot-b/tests.log).

**False-weight endpoint target FAIL:** causal storm max u=0.180892 exceeds 0.1. No acceptance criterion or parameter was changed to remove this failure.

## Learning roles and fixed constants

`w_max=0.1`, `w_init=0.01`, `eta_S=0.04`, `B_boost=1`, `tau_boost=10000 ms`, `eta_M=0.05`, `g_floor=0.2`, eligibility `tau=400 ms`. All are shared layer-2 constants, fixed before the pilot.

The gate5 weak-miss table in [m11c-gate.md](m11c-gate.md) gives strength 0.1 omission detection of 9/10 (seed 7), 10/10 (19), 10/10 (31); mean Meff 17.243/22.026/15.726. Strength 0.05 detects only 7/10 in seed 7. Thus `w_init/w_max=0.1` is the lowest tested strength meeting the required ≥90% in every tabulated seed. This calibration refers to unit onset; fractional onsets remain graded.

N creates exactly w_init only when the connection is absent, Neff>0 and nonzero current past-line activity; it neither scales creation by N/activity magnitude nor retains an N eligibility tail. Existing weights receive no N addition. Creation time is serialized and reset on each recreation.

Downward STDP is now direct: `Δu=0.04*(1+exp(-age/10000))*a*(1-u)`, applied once at the first matched reality onset in that prediction’s inclusive ±500 ms window. The comparator’s consumed-prediction logic is unchanged. The additive, delayed pre-eligibility a retains its >0.01 gate. Only connections present before the post onset receive credit; birth is exactly u=0.1. Deleted generations cannot credit their replacements. There is no downward STDP LTD and no association-delta coupling.

These constants were fixed once before this pilot. A unit eligibility pairing immediately after birth would move u=0.1 to at most 0.172; at age 34 s it moves to 0.1372. With a=2.8577 (four unit arrivals in the existing 100 ms/400 ms trace), 15 hits spaced 34 s apart reach u≈0.85. The boost is 2× at birth, 1.368× after 10 s and 1.0025× after 60 s. This is an analytic reference, not a guarantee for every graded onset or a scenario-specific setting. Layer-2 attractor STDP remains ungated and unchanged.

`g(u)=0.2+0.8*(1-u)` is linear, decreasing, with a positive floor. An unconsumed deadline with Meff>0 subtracts `Δu=-0.05*g(u)*a`, independent of the magnitude of positive Meff. At u=0.1/0.5/1, unit eligibility decrements are 0.046/0.030/0.010. The unchanged additive per-prediction eligibility may exceed one. At zero the connection is removed from the store and its eligibility is deleted. N can create a new object later with fresh creation time, boost, and cumulative deltas. There are no retained zero-weight store entries.

The former N strengthening and separate capped hit term are removed, including their aggregate traces. SurpriseGate survives only as a comparator/rest statistic. Predictions use every positive W with strength onset×u (the old scheduling floor is removed). Goal gain, U, pending hold, output execution threshold, comparator circuit/deadbands/timing and hit consumption are unchanged. The sat(E) error transform remains solely in the goal consumer.

## Protocol and interpretation

Storm: 30 original causal trials and 30 matched shuffled trials, seed 7, full continuous P7/spiking simulation. End A adds the existing ten paired M6 trials; B60 omissions and E30 alternating hit/miss both branch from exactly end A. No recovery C or jitter D acceptance, nor full three-seed acceptance, is run.

Actions: fresh rule layer, the original M11a T1/T2 curriculum (30 trials each), then 60 natural-world trials with the unchanged teacher schedule and independent birds. Only the original M11c M8 sensory/motor teacher states are reused; no old downward weights, M11d states or context source. Provenance is in summary.json.

A live connection means W>0. False distributions include every non-causal matrix slot, including absent slots recorded as zero in the measurement grid only. Causal storm excludes only lightning→thunder@6; shuffled excludes none. Actions retain the M11a classification: press→light@6, light→bell@4 and transitive press→bell@6 are causal. The transitive 4 s outcome still lies outside the 3.2 s prediction’s ±500 ms tolerance; no timing fix is inserted.

Every trial endpoint records the fixed measurement grid; every birth/deletion is recorded at 100 ms resolution. A recreation is a new episode. Survival at h trials means still alive at the end of birthTrial+h, with cohorts lacking that much follow-up excluded. Death lifetime statistics describe completed episodes; living episodes are explicitly right-censored in JSON. These measurement definitions never affect the learner.

Restart provenance: the supervisor saved the interrupted implementation as 25c32a1. Generated out/ artifacts did not survive. The seed-7 M8 teacher was regenerated locally from b141af6 in out/m11e-pilot-b/reference-m11c; only its sensory/motor state is reused by the new pilot ([teacher-provenance.json](../out/m11e-pilot-b/teacher-provenance.json)). The historical B55 replay output was recovered from the preserved run log, with its provenance recorded explicitly. The step-b pilot below was rerun from the beginning.

Natural action measurement: ten equal blocks of six trials (204 s each). At each block endpoint, two frozen probes per condition (bell/light/none/bird/ablation) sample the current store; all network, motor, comparator and learning state is restored before continuing the teacher. Thus these are endpoint samples, not autonomous behavior during teacher trials. The final original 20-probe-per-condition suite is also retained, partitioned into ten equal 100 s probe-time blocks. A bell/light goal requires one press; subsequent presses, non-press distractors and all bird-goal actions count as false. PASS iff the last block total is zero, exactly the approved replacement criterion; the ≤2 actions in every bell probe remains unchanged.

## p1 — false-rule trajectories

### causal

Every trial: [full distribution/creation/death CSV](../out/m11e-pilot-b/causal-trials.csv). All weights, birth/death times and causal curves: [causal.json](../out/m11e-pilot-b/causal.json). The table samples every fifth trial; the CSV retains all trials. The JSON connectionCounts records every 100 ms: total, causal and noncausal, for the sole implemented downward projection L2→L1 (no higher layers exist).

All-trial peaks of mean/p95/max u: 0.021277/0.180381/0.208370.

| Trial | Mean u | p95 u | Max u | Live / noncausal slots | L2→L1 total / causal / chance | Creations (chance) | Deaths (chance) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0/47 | 0/0/0 | 0 | 0 |
| 5 | 0.008511 | 0.100000 | 0.100000 | 4/47 | 5/1/4 | 4 | 4 |
| 10 | 0.006383 | 0.100000 | 0.100000 | 3/47 | 4/1/3 | 3 | 7 |
| 15 | 0.006383 | 0.100000 | 0.100000 | 3/47 | 4/1/3 | 1 | 1 |
| 20 | 0.012763 | 0.100000 | 0.100000 | 10/47 | 11/1/10 | 0 | 0 |
| 25 | 0.010490 | 0.100000 | 0.100000 | 6/47 | 7/1/6 | 2 | 5 |
| 30 | 0.014185 | 0.100000 | 0.180892 | 6/47 | 7/1/6 | 3 | 1 |

### shuffled

Every trial: [full distribution/creation/death CSV](../out/m11e-pilot-b/shuffled-trials.csv). All weights, birth/death times and causal curves: [shuffled.json](../out/m11e-pilot-b/shuffled.json). The table samples every fifth trial; the CSV retains all trials. The JSON connectionCounts records every 100 ms: total, causal and noncausal, for the sole implemented downward projection L2→L1 (no higher layers exist).

All-trial peaks of mean/p95/max u: 0.022589/0.100000/0.252220.

| Trial | Mean u | p95 u | Max u | Live / noncausal slots | L2→L1 total / causal / chance | Creations (chance) | Deaths (chance) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0/48 | 0/0/0 | 0 | 0 |
| 5 | 0.010417 | 0.100000 | 0.100000 | 5/48 | 5/0/5 | 5 | 6 |
| 10 | 0.010417 | 0.100000 | 0.100000 | 5/48 | 5/0/5 | 5 | 8 |
| 15 | 0.011872 | 0.100000 | 0.100000 | 6/48 | 6/0/6 | 3 | 1 |
| 20 | 0.011699 | 0.100000 | 0.100000 | 6/48 | 6/0/6 | 4 | 6 |
| 25 | 0.013588 | 0.100000 | 0.252220 | 5/48 | 5/0/5 | 2 | 7 |
| 30 | 0.012221 | 0.100000 | 0.100000 | 6/48 | 6/0/6 | 4 | 2 |

### natural (after T1/T2)

Every trial: [full distribution/creation/death CSV](../out/m11e-pilot-b/natural-trials.csv). All weights, birth/death times and causal curves: [actions.json](../out/m11e-pilot-b/actions.json). The table samples every fifth trial; the CSV retains all trials. The JSON connectionCounts records every 100 ms: total, causal and noncausal, for the sole implemented downward projection L2→L1 (no higher layers exist).

All-trial peaks of mean/p95/max u: 0.014969/0.100000/0.282750.

| Trial | Mean u | p95 u | Max u | Live / noncausal slots | L2→L1 total / causal / chance | Creations (chance) | Deaths (chance) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0.008861 | 0.100000 | 0.100000 | 21/237 | 23/2/21 | — | — |
| 5 | 0.004641 | 0 | 0.100000 | 11/237 | 13/2/11 | 11 | 13 |
| 10 | 0.007247 | 0.100000 | 0.100000 | 19/237 | 21/2/19 | 14 | 11 |
| 15 | 0.012093 | 0.100000 | 0.247660 | 29/237 | 32/3/29 | 24 | 15 |
| 20 | 0.011483 | 0.100000 | 0.219698 | 28/237 | 30/2/28 | 23 | 13 |
| 25 | 0.005108 | 0.100000 | 0.100000 | 13/237 | 15/2/13 | 10 | 26 |
| 30 | 0.005869 | 0.100000 | 0.122247 | 14/237 | 16/2/14 | 6 | 8 |
| 35 | 0.011392 | 0.100000 | 0.100000 | 27/237 | 29/2/27 | 24 | 13 |
| 40 | 0.003695 | 0 | 0.205605 | 8/237 | 10/2/8 | 5 | 15 |
| 45 | 0.005959 | 0 | 0.255892 | 11/237 | 13/2/11 | 6 | 9 |
| 50 | 0.006768 | 0.100000 | 0.282750 | 15/237 | 17/2/15 | 10 | 17 |
| 55 | 0.005568 | 0.100000 | 0.100000 | 14/237 | 16/2/14 | 11 | 13 |
| 60 | 0.006273 | 0.100000 | 0.100000 | 15/237 | 17/2/15 | 11 | 12 |

## p2 — true-rule creation and growth

| World | Rule | First creation trial | First creation seconds | Birth u | First trial ≥0.8 | Final u |
| --- | --- | --- | --- | --- | --- | --- |
| causal storm | [0,6,6] | 1 | 8.400000 | 0.100000 | 14 | 0.971085 |

[0,6,6], trial-end u (including trial 0):

0, 0.100000, 0.208208, 0.298887, 0.379039, 0.450020, 0.512887, 0.568568, 0.617884, 0.661563, 0.700249, 0.734513, 0.764860, 0.791738, 0.815544, 0.836629, 0.855304, 0.871844, 0.886493, 0.899468, 0.902660, 0.913787, 0.923641, 0.932370, 0.940101, 0.946947, 0.953012, 0.958383, 0.963140, 0.967353, 0.971085.

| World | Rule | First creation trial | First creation seconds | Birth u | First trial ≥0.8 | Final u |
| --- | --- | --- | --- | --- | --- | --- |
| actions: T1/T2/natural | ["action:press",6,0] | 1 | 3.100000 | 0.100000 | 14 | 0.999982 |
| actions: T1/T2/natural | [0,4,6] | 31 | 1023.300000 | 0.100000 | 40 | 1.000000 |
| actions: T1/T2/natural | ["action:press",6,6] | 11 | 348 | 0.100000 | — | 0 |

["action:press",6,0], trial-end u (including trial 0):

0, 0.100000, 0.204617, 0.295600, 0.376120, 0.447434, 0.510597, 0.566540, 0.616087, 0.659972, 0.698840, 0.733265, 0.763755, 0.790759, 0.814677, 0.835861, 0.854623, 0.871241, 0.885959, 0.898995, 0.910541, 0.920767, 0.929824, 0.937845, 0.944950, 0.951243, 0.956816, 0.961752, 0.966124, 0.969997, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.973426, 0.976464, 0.979154, 0.981537, 0.983648, 0.985517, 0.987172, 0.988639, 0.989937, 0.991088, 0.992106, 0.993009, 0.993808, 0.994516, 0.995143, 0.995698, 0.996190, 0.996625, 0.997011, 0.997353, 0.997655, 0.997923, 0.998161, 0.998371, 0.998557, 0.998722, 0.998868, 0.998997, 0.999112, 0.999214, 0.999303, 0.999383, 0.999454, 0.999516, 0.999571, 0.999620, 0.999664, 0.999702, 0.999736, 0.999766, 0.999793, 0.999817, 0.999838, 0.999856, 0.999873, 0.999887, 0.999900, 0.999912, 0.999922, 0.999931, 0.999939, 0.999946, 0.999952, 0.999957, 0.999962, 0.999967, 0.999970, 0.999974, 0.999977, 0.999979, 0.999982.

[0,4,6], trial-end u (including trial 0):

0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0.243516, 0.361932, 0.461704, 0.545872, 0.616879, 0.676784, 0.727322, 0.769957, 0.805927, 0.836272, 0.861872, 0.883470, 0.901690, 0.917062, 0.930030, 0.940971, 0.950200, 0.957987, 0.964556, 0.970098, 0.974774, 0.978718, 0.982046, 0.984853, 0.987221, 0.989219, 0.990905, 0.992327, 0.993527, 0.994539, 0.995393, 0.996113, 0.996721, 0.997234, 0.997666, 0.998031, 0.998339, 0.998599, 0.998818, 0.999003, 0.999159, 0.999290, 0.999401, 0.999495, 0.999574, 0.999640, 0.999697, 0.999744, 0.999784, 0.999818, 0.999846, 0.999870, 0.999891, 0.999908, 0.999922, 0.999934, 0.999945, 0.999953, 0.999961, 0.999967, 0.999972, 0.999976, 0.999980, 0.999983, 0.999986, 0.999988, 0.999990, 0.999991, 0.999993, 0.999994, 0.999995, 0.999996, 0.999996, 0.999997, 0.999997, 0.999998, 0.999998, 0.999998, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999, 1.000000, 1.000000, 1.000000, 1.000000, 1.000000.

["action:press",6,6], trial-end u (including trial 0):

0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0.100000, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0.100000, 0, 0, 0, 0.100000, 0, 0, 0, 0.100000, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0.100000, 0, 0, 0, 0.

## p3 — creation cohorts and chance survival

| World | Class | Created | Share | Alive at end | 1 trial | 5 trials | 20 trials |
| --- | --- | --- | --- | --- | --- | --- | --- |
| causal | causal | 1 | 1.27% | 1 | 1/1 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| causal | chance | 78 | 98.73% | 6 | 29/75 (38.67%) | 4/67 (5.97%) | 0/32 (0.00%) |

causal: completed chance lifetimes, trials mean/p95/max = 1.472222/3/6; seconds mean/p95/max = 46.772222/99.900000/184.600000. Right-censored episodes: 6.

| World | Class | Created | Share | Alive at end | 1 trial | 5 trials | 20 trials |
| --- | --- | --- | --- | --- | --- | --- | --- |
| shuffled | causal | 0 | 0.00% | 0 | 0/0 (—) | 0/0 (—) | 0/0 (—) |
| shuffled | chance | 122 | 100.00% | 6 | 31/118 (26.27%) | 1/106 (0.94%) | 0/52 (0.00%) |

shuffled: completed chance lifetimes, trials mean/p95/max = 1.336207/3/4; seconds mean/p95/max = 42.950000/96.600000/123.900000. Right-censored episodes: 6.

| World | Class | Created | Share | Alive at end | 1 trial | 5 trials | 20 trials |
| --- | --- | --- | --- | --- | --- | --- | --- |
| actions (T1+T2+natural) | causal | 13 | 0.87% | 2 | 2/13 (15.38%) | 2/12 (16.67%) | 2/10 (20.00%) |
| actions (T1+T2+natural) | chance | 1476 | 99.13% | 15 | 117/1465 (7.99%) | 19/1423 (1.34%) | 10/1207 (0.83%) |

actions (T1+T2+natural): completed chance lifetimes, trials mean/p95/max = 1.339493/2/33; seconds mean/p95/max = 46.664408/72.100000/1125.800000. Right-censored episodes: 15.

The two direct action-world rules were created in T1/T2 and remain alive throughout natural continuation. Natural-born causal episodes below are the transitive press→bell@6 connection; its delay mismatch is described above.

Natural-born completed chance lifetimes: trials mean/p95/max = 1.186652/2/15; seconds mean/p95/max = 41.626244/72.400000/510.500000.

| Natural-born class | Created | Share | 1 trial | 5 trials | 20 trials |
| --- | --- | --- | --- | --- | --- |
| causal | 10 | 1.10% | 0/10 (0.00%) | 0/9 (0.00%) | 0/7 (0.00%) |
| chance | 899 | 98.90% | 80/888 (9.01%) | 7/846 (0.83%) | 1/630 (0.16%) |

## p4 — extinction from end A

End A u=0.991411. First ≤50%: trial 7; first ≤10%: trial 10; first exact zero: trial 20. Full per-trial records and deltas: [calibration.json](../out/m11e-pilot-b/calibration.json).

Full B0…B60 u:

0.991411, 0.947639, 0.896458, 0.836613, 0.766638, 0.684818, 0.589148, 0.477284, 0.346485, 0.193545, 0.014717, 0.014717, 0.014717, 0.014717, 0.014717, 0.014717, 0.014717, 0.014717, 0.014717, 0.014717, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0.

Calibration measurement accounting includes both the deleted generation’s final M decrement and a same-window newborn’s N contribution. A replay using the final measurement code exactly matched all 100 saved A/B/E trial records, including raw changes ([calibration-replay.json](../out/m11e-pilot-b/calibration-replay.json)).

For comparison, pilot a started B at u=0.573676 and first reached zero at B4. The stronger step-b rule takes more omissions under the same M constants and comparator.

At equal unit eligibility and positive Meff on every miss, the unchanged g(u) rule reaches deletion in u=0.1: 3 misses; u=0.5: 14 misses; u=1: 42 misses. This controlled calculation verifies stronger weights need more misses; it is separate from the full neural B branch and its intermittent comparator detection.

## p5 — 50/50 alternating, 30 trials from end A

Full E0…E30 u (odd trials hit, even trials miss):

0.991411, 0.992393, 0.948787, 0.954641, 0.904645, 0.915545, 0.858931, 0.875056, 0.811589, 0.833125, 0.762560, 0.789701, 0.711786, 0.744731, 0.659203, 0.698159, 0.604747, 0.649928, 0.548352, 0.599979, 0.489949, 0.548251, 0.429465, 0.494682, 0.366827, 0.439204, 0.301959, 0.381750, 0.234780, 0.322250, 0.165208.

| Start u | End u | Full slope u/trial | Last10 slope | Mean hit ΔW | Mean miss loss W |
| --- | --- | --- | --- | --- | --- |
| 0.991411 | 0.165208 | -0.025821 | -0.033878 | 0.004096 | 0.009604 |

Observed 50/50 start/end u: 0.991411/0.165208; full slope -0.025821 and last-ten slope -0.033878. These finite trajectories do not establish a long-run asymptote. Repeated creation/deletion is shown explicitly in calibration.json.

## p6 — ungated STDP rest drift

storm-rest: 300 s continuous rest after learning; [storm-rest.json](../out/m11e-pilot-b/storm-rest.json) contains all per-edge/per-rule slopes and 1 s snapshots, plus raw 100 ms comparator windows. Overall rest audit: **PASS**.

| Quantity | Initial mean | Final mean | Δmean | Slope /s | SE | Monotone nondecreasing | Edges growing >3 SE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rho | 0.064821 | 0.064821 | 0 | 0 | 1.8473e-19 | true | 0 |
| W | 0.003412 | 0.003412 | 0 | 0 | 4.9069e-21 | true | 0 |

| Mean Hz/cell | Min cell Hz | Max cell Hz | Max bursts/s | Max Fano | Gate open | Comparator audit gate | All populations pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.454167 | 1.290000 | 1.586667 | 0 | 0.990181 | 0.03% | 0.03% | true |

OLS slope SE describes the recorded drift series; per-edge monotonicity also checked. Constant trajectories have Δ=0. The independent gate5 consumer audit retains its original numerical Poisson drift/slope bounds, using the original diagnostic eta/E0 reference after removal of the N-strengthening formula.

natural-rest: 300 s continuous rest after learning; [natural-rest.json](../out/m11e-pilot-b/natural-rest.json) contains all per-edge/per-rule slopes and 1 s snapshots, plus raw 100 ms comparator windows. Overall rest audit: **PASS**.

| Quantity | Initial mean | Final mean | Δmean | Slope /s | SE | Monotone nondecreasing | Edges growing >3 SE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rho | 0.092742 | 0.092742 | 0 | 0 | 1.1084e-19 | true | 0 |
| W | 0.001453 | 0.001453 | 0 | 0 | 4.1853e-21 | true | 0 |

| Mean Hz/cell | Min cell Hz | Max cell Hz | Max bursts/s | Max Fano | Gate open | Comparator audit gate | All populations pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.453889 | 1.306667 | 1.623333 | 0 | 0.996595 | 0.00% | 0.07% | true |

OLS slope SE describes the recorded drift series; per-edge monotonicity also checked. Constant trajectories have Δ=0. The independent gate5 consumer audit retains its original numerical Poisson drift/slope bounds, using the original diagnostic eta/E0 reference after removal of the N-strengthening formula.

## p7 — indicative seed-7 margins, ratios and bird-goal behavior

| M3 peak | Causal Δrho@6 | C−shuffled margin (≥0.05) | C−bird margin (≥0.05) | Layer 1 intact | Reported M3 checks |
| --- | --- | --- | --- | --- | --- |
| 6 | 0.308311 | 0.279170 | 0.235600 | true | true |

| M4 causal strength | Single C/S (≥5) | Single C/B (≥5) | Timely | Reported M4 checks |
| --- | --- | --- | --- | --- |
| 0.971085 | 9.710852 | 5.368312 | true | true |

| Goal | Probes | Actions | Actions/probe | No-action fraction | Achieved fraction |
| --- | --- | --- | --- | --- | --- |
| bell | 20 | 20 | 1 | 0.00% | 100.00% |
| light | 20 | 20 | 1 | 0.00% | 100.00% |
| none | 20 | 0 | 0 | 100.00% | 0.00% |
| bird | 20 | 0 | 0 | 100.00% | 100.00% |
| bell-ablated | 20 | 0 | 0 | 100.00% | 0.00% |

Bell actions per probe: 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1; every probe ≤2: true. Full final suite PASS: true.

Frozen final probes (20 per condition): [goals.json](../out/m11e-pilot-b/goals.json). The original M6 recovery requirement C60/A≥0.85 remains untouched and was not tested in Phase 1.

## False/distractor actions by fixed block

Natural endpoint probes (six teacher trials per block): last-block criterion **PASS**.

| Block | Bird actions | Extra presses | Distractors | Other false actions | Total |
| --- | --- | --- | --- | --- | --- |
| 1 | 2 | 0 | 0 | 0 | 2 |
| 2 | 0 | 0 | 0 | 0 | 0 |
| 3 | 0 | 0 | 0 | 0 | 0 |
| 4 | 2 | 0 | 0 | 0 | 2 |
| 5 | 0 | 0 | 0 | 0 | 0 |
| 6 | 2 | 0 | 0 | 0 | 2 |
| 7 | 0 | 0 | 0 | 0 | 0 |
| 8 | 0 | 3 | 8 | 16 | 27 |
| 9 | 2 | 13 | 0 | 15 | 30 |
| 10 | 0 | 0 | 0 | 0 | 0 |

Final frozen suite (100 s per block): last-block criterion **PASS**.

| Block | Bird actions | Extra presses | Distractors | Other false actions | Total |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 0 | 0 |
| 2 | 0 | 0 | 0 | 0 | 0 |
| 3 | 0 | 0 | 0 | 0 | 0 |
| 4 | 0 | 0 | 0 | 0 | 0 |
| 5 | 0 | 0 | 0 | 0 | 0 |
| 6 | 0 | 0 | 0 | 0 | 0 |
| 7 | 0 | 0 | 0 | 0 | 0 |
| 8 | 0 | 0 | 0 | 0 | 0 |
| 9 | 0 | 0 | 0 | 0 | 0 |
| 10 | 0 | 0 | 0 | 0 | 0 |

## Diagnosis b

**(i) Discrete teacher actions.** idle is one command per T1/natural trial, like press and wave; it is not a tonic context input. T2 contains no actions. The unmodified schedule produces 30 T1 and 60 natural commands of each action. Birth timestamps were joined to that schedule and checked against the active past column. Detailed pairs and every episode are in [diagnosis.json](../out/m11e-pilot-b/diagnosis.json).

action:idle→action:wave@6: 16 episodes; 13 births exactly on the teacher post action with the within-trial pre action still in the matching past column. Completed lifetime mean/max 107.200000/1125.800000 s; 0 episodes remain alive; final u=0.000000. Last recorded death: trial 116, t=3918 s. Other births, including N tails/noise rather than exact post coincidences, remain explicitly listed.

action:idle→action:press@4: 10 episodes; 6 births exactly on the teacher post action with the within-trial pre action still in the matching past column. Completed lifetime mean/max 52.177778/134.700000 s; 1 episodes remain alive (censored ages 25.100000 s); final u=0.100000. Last recorded death: trial 118, t=3987.6 s. Other births, including N tails/noise rather than exact post coincidences, remain explicitly listed.

action:wave→action:press@5: 8 episodes; 5 births exactly on the teacher post action with the within-trial pre action still in the matching past column. Completed lifetime mean/max 56.712500/206.000000 s; 0 episodes remain alive; final u=0.000000. Last recorded death: trial 105, t=3543.3 s. Other births, including N tails/noise rather than exact post coincidences, remain explicitly listed.

These lifetimes include the 1020 s action-silent T2 phase. An action→action connection surviving T1 receives no new action-driven predictions or M deadlines during T2; M-only weakening therefore need not delete it until its cause is executed again. This is not an age-based retention or probation mechanism.

**(ii) Direct versus transitive rules.** action:press→light@6 final u=0.999982 (1 birth episodes); light→bell@4 final u=1.000000 (1 birth episodes); action:press→bell@6 final u=0.000000 (11 birth episodes). The direct slots predict 3.2 s and 0.8 s, covering the world’s 3 s and 1 s delays. press→bell@6 predicts 3.2 s but reality arrives at 4 s, outside the unchanged ±0.5 s window. Its repeated N births and M deletions are therefore expected; no deadline or tolerance was changed.

**(iii) Bell goals.** Presses per probe: 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1; mean 1.000000 versus pilot-a 4.8. Total actions per probe: 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1; the unchanged every-probe ≤2 action bound is PASS. Goal gain, U, pending suppression, comparator consumption, and output execution threshold were unchanged. The old first probe pressed at 0.1/1.3/2.3 s: pending light strength stayed 0.453215, leaving effective light-M 52.764736 before the second press and motor drive 0.469620. This is incomplete graded pending suppression with a weak direct connection. The new direct weight and full pending/consumption records are in goals.json and diagnosis.json; no wrong-prediction consumption fix was inserted.

New bell probes: minimum pending strength while waiting for light ranges 0.999982–0.999982. The unchanged action bound passes with the new learned chain strengths.

Correct direct predictions fully consumed at their matched onsets: action:press→light@6 20/20 bell probes; light→bell@4 20/20 bell probes. Per-onset entries and remaining drives are preserved in the raw windows.

**Transient bell failures remain visible.** Block 8: 2/3 presses and 5/8 total actions per bell probe; Block 9: 9/6 presses and 9/6 total actions per bell probe. These endpoint suites fail the unchanged ≤2 action bound. Their extra-action contribution records are in diagnosis.json, alongside the full final suite; they are not reclassified as passing probes.

At block 9’s second press (t=0.4 s), the correct light prediction has strength 0.999962, leaving light-M 0.005692. Root bell-M is still 135.450000. Newly recreated press→bell@6 and press→bell@8, each u=0.1, contribute 0.172584+0.172584 motor drive, producing total 0.345340. The cause is summed weak direct paths to the still-unsatisfied bell goal; the strong press→light pending hold is functioning. This occurs before either correct outcome arrives, so it is not wrong hit consumption. No new goal gate, normalization, or quarantine was added.

**(iv) Why B55 recreated an omitted outcome.** Before the restart, an isolated replay of bee1ea8 matched all 56 original B-trial records. That evidence survives in [the archived run log](../logs/codex-M11e-b.log) at line 8999; [prior-b55.json](../out/m11e-pilot-b/prior-b55.json) preserves its exact output and source hash. This historical replay was not rerun after the restart. At t=2550.3 s, thunder reality/prediction/deadline were all 0; Nraw=6, rest expectation=1.5, Ndev=4.5, so Neff=max(0,Ndev−3√1.5)=0.825765>0. Lightning’s column-6 activity was 1, from its onset 3.8 s earlier. N therefore created u=0.1 without any external thunder. This was a rare Poisson-rest tail admitted by the approved N-only rule. Requiring a reality onset would add a gate and was not done.

Step b B recreations: B55 at 2550.3 s, Neff=0.825765, reality=0. The full changes include onset, cause activity and raw comparator counts.

**Remaining review targets.** Final maximum false u: causal=0.180892, shuffled=0.100000, natural=0.100000. Last-ten max slopes (u/trial): causal=0.003783, shuffled=-0.009916, natural=-0.013838. These values are reported without weakening the ≤0.1 target or claiming convergence from a finite run. The pilot is stopped for review; no additional seed or parameter sweep is run.

The strongest remaining causal-storm false rule is bird→thunder@2, born at 578.7 s. Its current generation has N/STDP/M contributions Δu=0.100000/0.247236/-0.166344. Chance matched onsets strengthened it enough to survive the recorded M losses; the endpoint above 0.1 is a failed target, not a waived newborn exception.

The existing M11a false-weight checks are also retained, using its unchanged slope function: final max≤0.1 is PASS; full-continuation mean/p95/max slopes are -0.000001/-0.000013/0.000880, so all three strictly negative is FAIL. The last-ten slopes above are additional diagnostics and do not replace that check.

**Single-hit parameter limitation.** The unit-eligibility reference in the constants section is not a general bound. With one new cause onset at 200 ms and one matched post at 800 ms (k=1, birth at 100 ms), seven eligible windows give a=3.735212 and age=700 ms. One direct STDP pairing then yields u=0.359844, above the requested “well below 0.3” aim. This is a shared-formula calculation, not an extra trained scene. The fixed constants were not swept or replaced, and no eligibility normalization or weight gate was introduced; this remains a supervisor review item.

## Verification and limits

npm test: **101/101 checks pass**, exit 0, 16.32 s suite / 17.173000 s wall. Under 30 s: true. [Full test output](../out/m11e-pilot-b/tests.log).

The birth/coupling tests were updated for the explicitly approved direct-STDP replacement and structural deletion. Consumption tests retain their deadline/overlap checks while including the new positive pairing increment. Only the explicitly approved false/distractor-action acceptance was replaced. M6 C60/A≥0.85, M3/M4 margins, the bell ≤2-per-probe bound, and all rest limits remain intact.

After restart, the initial serial suite passed 100/100 functional checks in 34.24 s, missing the 30 s target on this machine. verify/all.mjs now runs its two slow independent suites in isolated Node workers while the other checks run in the main thread. No assertions, simulations or timing limits were shortened. The added pruning-index regression checks same-window deletion/recreation and prevents stale generations from gaining credit.

Pilot wall time: 3661.218467 s. Reproduce with `node experiments/m11e-pilot.mjs`, then `node experiments/m11e-replay.mjs`, `node experiments/m11e-prior-evidence.mjs`, `node experiments/m11e-diagnose.mjs` and `node experiments/m11e-report.mjs`. The teacher, test-summary and teacher-provenance artifacts are required. Prior pilot numbers remain in the bee1ea8 report and archived logs; its original out/ files were lost. No three-seed run, branch switch, commit or push. The authoritative design and supervisor’s existing diff were not edited.

Changed implementation: src/{downward,learning,predict,three-factor,goals}.mjs; pilot, measurements, calibration/rest and goal-probe diagnostics under experiments/; affected role/store/consumption/prediction/goal fixtures under verify/; this report.

## Step c

**Pilot FAIL — STOP after seed 7; no three-seed acceptance run**. A=true, B=false, C=true. No acceptance criterion was relaxed.

Artifacts: [summary.json](../out/m11e-pilot-c/summary.json), [parameters.json](../out/m11e-pilot-c/parameters.json), [audit.json](../out/m11e-pilot-c/audit.json), [sources.json](../out/m11e-pilot-c/sources.json), [teacher-provenance.json](../out/m11e-pilot-c/teacher-provenance.json), [run log](../out/m11e-pilot-c/run.log), [tests](../out/m11e-pilot-c/tests.log).

### Event eligibility and one-time parameter choice

Each delayed cause contributes its activation exactly once when its prediction first enters the existing inclusive tolerance window (or at creation if already inside it). Later reads only decay that contribution with τ=400 ms. Distinct onsets keep separate eligibility and independent pairings/deadlines; their sum is not normalized or capped. STDP and M read the same trace. Birth exclusion, structural pruning, generation checks, the a>0.01 pre gate and comparator consumption are unchanged.

`w_max=0.1`, `w_init=0.01`, `eta_S=0.205`, `B_boost=0.05`, `tau_boost=5000 ms`, `eta_M=2.58`, `g(u)=0.2+0.8*(1-u)`. These layer-2 constants were fixed once before this pilot; no sweep or per-scene values.

At the full-window deadline, old a=4.231806 and event a=0.082085. Preserving M requires a 51.553949× rescale, larger than the approximate 4× because the event decays for the full 1000 ms. At fresh u=0.1 the unclipped decrement changes from 0.194663 to 0.194837; both prune to zero. The rescale preserves or increases M at every column, including fractional activations. g(u) is unchanged.

Diagnosis-b example: birth 100 ms, cause 200 ms, k=1, post 800 ms; a=0.223130, single-hit u=0.142957 (≤0.15). The all-timings single-event upper bound is 0.293725 (≤0.3, above the 0.15 aim). With a unit onset paired 300 ms after entering tolerance, 15 repeated hits spaced 34 s apart analytically reach u=0.804681. The boost is 1.05 at birth and decays toward 1 with τ=5 s.

Implementation tests now use one decaying event in their expected values. The g(u) check verifies the raw decrement and zero clipping separately, since the approved larger eta_M can clip weak connections. The strong-versus-weak miss-count check uses the physical deadline eligibility. Acceptance thresholds and the original M11a slope function remain unchanged.

### Protocol

Same seed-7 pilot as step b: 30 causal + 30 shuffled storm trials; A10 then separate B60/E30 branches; fresh action rule layer with T1/T2 30 trials each and natural continuation 60 trials. Only the original M11c sensory/motor teacher is reused. Each learned network receives 300 s uninterrupted rest. Every 100 ms records L2→L1 total/causal/chance counts. No higher layers or context source were added.

The same fixed grid records absent weights as zero for measurement. Natural action probes sample ten equal six-trial blocks, then the full frozen suite retains 20 probes per condition and ten equal probe-time blocks. Last-block false actions must be zero; the final bell ≤2-actions-per-probe bound remains unchanged.

### p1 — false rules and connection counts

**causal** — [every-trial CSV](../out/m11e-pilot-c/causal-trials.csv), [causal.json](../out/m11e-pilot-c/causal.json) (all weights, births/deaths, 100 ms counts).

| Trial | Mean u | p95 u | Max u | Live total/causal/chance | Chance births/deaths |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0/0/0 | — |
| 5 | 0.008511 | 0.100000 | 0.100000 | 5/1/4 | 4/4 |
| 10 | 0.006383 | 0.100000 | 0.100000 | 4/1/3 | 3/7 |
| 15 | 0.006383 | 0.100000 | 0.100000 | 4/1/3 | 1/1 |
| 20 | 0.012755 | 0.100000 | 0.100000 | 11/1/10 | 0/0 |
| 25 | 0.008947 | 0.100000 | 0.100000 | 7/1/6 | 2/4 |
| 30 | 0.013455 | 0.100000 | 0.211905 | 8/1/7 | 3/1 |

**shuffled** — [every-trial CSV](../out/m11e-pilot-c/shuffled-trials.csv), [shuffled.json](../out/m11e-pilot-c/shuffled.json) (all weights, births/deaths, 100 ms counts).

| Trial | Mean u | p95 u | Max u | Live total/causal/chance | Chance births/deaths |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0/0/0 | — |
| 5 | 0.010417 | 0.100000 | 0.100000 | 5/0/5 | 5/6 |
| 10 | 0.010417 | 0.100000 | 0.100000 | 5/0/5 | 5/8 |
| 15 | 0.010417 | 0.100000 | 0.100000 | 5/0/5 | 3/2 |
| 20 | 0.010417 | 0.100000 | 0.100000 | 5/0/5 | 4/7 |
| 25 | 0.011085 | 0.100000 | 0.124972 | 6/0/6 | 2/6 |
| 30 | 0.010564 | 0.100000 | 0.100000 | 6/0/6 | 4/2 |

**natural** — [every-trial CSV](../out/m11e-pilot-c/natural-trials.csv), [actions.json](../out/m11e-pilot-c/actions.json) (all weights, births/deaths, 100 ms counts).

| Trial | Mean u | p95 u | Max u | Live total/causal/chance | Chance births/deaths |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.008861 | 0.100000 | 0.100000 | 23/2/21 | — |
| 5 | 0.004641 | 0 | 0.100000 | 13/2/11 | 11/10 |
| 10 | 0.007355 | 0.100000 | 0.100000 | 21/2/19 | 14/12 |
| 15 | 0.011106 | 0.100000 | 0.132065 | 28/2/26 | 23/16 |
| 20 | 0.009283 | 0.100000 | 0.100000 | 24/2/22 | 21/10 |
| 25 | 0.005063 | 0.100000 | 0.100000 | 14/2/12 | 10/26 |
| 30 | 0.005063 | 0.100000 | 0.100000 | 14/2/12 | 7/9 |
| 35 | 0.011392 | 0.100000 | 0.100000 | 29/2/27 | 24/13 |
| 40 | 0.003351 | 0 | 0.187155 | 10/2/8 | 5/16 |
| 45 | 0.006334 | 0.100000 | 0.211929 | 19/3/16 | 9/12 |
| 50 | 0.006029 | 0.100000 | 0.214615 | 17/2/15 | 10/19 |
| 55 | 0.005633 | 0.100000 | 0.120938 | 17/2/15 | 11/13 |
| 60 | 0.005907 | 0.100000 | 0.100000 | 16/2/14 | 11/13 |

Final false max u (causal/shuffled/natural): 0.211905/0.100000/0.100000; target each ≤0.1. Unchanged M11a full-continuation mean/p95/max slopes: -1.841871e-7/0.000333/0.000481; all strictly negative: **FAIL**. No last-ten replacement or newborn exception.

| World | Strongest residual false rule | Birth s | Final u | N Δu | STDP Δu | M Δu |
| --- | --- | --- | --- | --- | --- | --- |
| causal | [12,3,6] | 727.900000 | 0.211905 | 0.100000 | 0.111905 | 0 |
| shuffled | [12,7,6] | 828.700000 | 0.100000 | 0.100000 | 0 | 0 |
| natural | [0,5,6] | 2522.900000 | 0.100000 | 0.100000 | 0 | 0 |

The strongest causal-storm residual is bird→thunder@3. Its current generation made 1 prediction(s), at onset times 824.100000 s. There are 0 later scheduled cause events beyond that onset's readout window. Its ΔM=0; the false endpoint is not waived because there was no later omission opportunity. Raw prediction provenance is in audit.json.

### p2 — true-rule growth

| World | Rule | Creation trial/time s | First trial ≥0.8 | Final u |
| --- | --- | --- | --- | --- |
| storm | [0,6,6] | 1/8.4 | 16 | 0.949433 |

[0,6,6], full trial-end curve (including 0):

0, 0.100000, 0.187163, 0.265874, 0.336964, 0.401169, 0.459157, 0.511529, 0.558831, 0.601551, 0.640135, 0.674983, 0.706456, 0.734881, 0.760554, 0.783741, 0.804682, 0.823596, 0.840678, 0.856106, 0.859977, 0.873536, 0.885782, 0.896842, 0.906832, 0.915854, 0.924002, 0.931361, 0.938008, 0.944011, 0.949433.

| World | Rule | Creation trial/time s | First trial ≥0.8 | Final u |
| --- | --- | --- | --- | --- |
| actions | ["action:press",6,0] | 1/3.1 | 16 | 0.999896 |
| actions | [0,4,6] | 31/1023.3 | 73 | 0.964340 |
| actions | ["action:press",6,6] | 11/348 | — | 0 |

["action:press",6,0], full trial-end curve (including 0):

0, 0.100000, 0.187153, 0.265865, 0.336955, 0.401161, 0.459150, 0.511523, 0.558825, 0.601546, 0.640130, 0.674978, 0.706452, 0.734878, 0.760551, 0.783738, 0.804680, 0.823594, 0.840676, 0.856104, 0.870038, 0.882623, 0.893989, 0.904255, 0.913526, 0.921900, 0.929463, 0.936293, 0.942462, 0.948034, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.953066, 0.957611, 0.961716, 0.965423, 0.968771, 0.971795, 0.974527, 0.976993, 0.979221, 0.981233, 0.983051, 0.984692, 0.986174, 0.987513, 0.988722, 0.989814, 0.990801, 0.991691, 0.992496, 0.993223, 0.993879, 0.994472, 0.995007, 0.995491, 0.995927, 0.996322, 0.996678, 0.996999, 0.997290, 0.997552, 0.997789, 0.998004, 0.998197, 0.998371, 0.998529, 0.998672, 0.998800, 0.998916, 0.999021, 0.999116, 0.999202, 0.999279, 0.999349, 0.999412, 0.999469, 0.999520, 0.999567, 0.999609, 0.999647, 0.999681, 0.999712, 0.999740, 0.999765, 0.999788, 0.999808, 0.999827, 0.999844, 0.999859, 0.999872, 0.999885, 0.999896.

[0,4,6], full trial-end curve (including 0):

0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0.132062, 0.162981, 0.192799, 0.221554, 0.249285, 0.276028, 0.301819, 0.326691, 0.350677, 0.373808, 0.396115, 0.417628, 0.438374, 0.458381, 0.477675, 0.496283, 0.514227, 0.531532, 0.548220, 0.564314, 0.579835, 0.594803, 0.609238, 0.623158, 0.636582, 0.649529, 0.662014, 0.674054, 0.685665, 0.696863, 0.707662, 0.718076, 0.728119, 0.737805, 0.747145, 0.756153, 0.764839, 0.773217, 0.781296, 0.789087, 0.796600, 0.803846, 0.810834, 0.817573, 0.824071, 0.830338, 0.836382, 0.842211, 0.847832, 0.853253, 0.858481, 0.863522, 0.868384, 0.873072, 0.877594, 0.881955, 0.886160, 0.890215, 0.894126, 0.897898, 0.901535, 0.905043, 0.908425, 0.911688, 0.914834, 0.917868, 0.920793, 0.923615, 0.926336, 0.928960, 0.931491, 0.933932, 0.936285, 0.938555, 0.940744, 0.942855, 0.944891, 0.946854, 0.948747, 0.950573, 0.952334, 0.954032, 0.955669, 0.957248, 0.958771, 0.960240, 0.961656, 0.963022, 0.964340.

["action:press",6,6], full trial-end curve (including 0):

0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0.100000, 0, 0, 0.100000, 0, 0, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0, 0.

press→bell@6 remains the original transitive classification; its 4 s reality lies outside the 3.2 s slot ±0.5 s tolerance. The two direct rules are the true-strength pilot criterion.

**Growth-time limitation:** light→bell's first paid pairing has measured a=0.173774 (700 ms decay), versus 300 ms for the storm/press→light pairings. It first reaches 0.8 at global trial 73, after 42 paid pairings. Keeping every single-event chance hit at u≤0.3 from u=0.1 bounds eta_S*boost by 0.222222. Even granting that maximum on every one of 15 such late pairings gives only u≤0.501468. The 10–15-hit growth aim is therefore not met for this direct rule with the preserved tolerance-entry timing. Its measured curve and final strength are reported above; no timing change, normalization or additional mechanism was inserted.

### p3 — birth cohorts and survival

| World | Class | Created | Share | Alive at end | After 1/5/20 trials |
| --- | --- | --- | --- | --- | --- |
| causal | causal | 1 | 0.012346 | 1 | 1/1 (1); 1/1 (1); 1/1 (1) |
| causal | chance | 80 | 0.987654 | 7 | 32/77 (0.415584); 4/68 (0.058824); 0/32 (0) |

causal completed chance lifetimes mean/p95/max: trials 1.520548/4/6; seconds 48.126027/121/184.600000. Living episodes are right-censored, retained in JSON.

| World | Class | Created | Share | Alive at end | After 1/5/20 trials |
| --- | --- | --- | --- | --- | --- |
| shuffled | causal | 0 | 0 | 0 | 0/0 (—); 0/0 (—); 0/0 (—) |
| shuffled | chance | 122 | 1 | 6 | 31/118 (0.262712); 1/106 (0.009434); 0/52 (0) |

shuffled completed chance lifetimes mean/p95/max: trials 1.327586/3/4; seconds 42.783621/97/127.500000. Living episodes are right-censored, retained in JSON.

| World | Class | Created | Share | Alive at end | After 1/5/20 trials |
| --- | --- | --- | --- | --- | --- |
| T1/T2/natural | causal | 10 | 0.006743 | 2 | 2/10 (0.200000); 2/10 (0.200000); 2/6 (0.333333) |
| T1/T2/natural | chance | 1473 | 0.993257 | 14 | 114/1462 (0.077975); 15/1423 (0.010541); 10/1197 (0.008354) |

T1/T2/natural completed chance lifetimes mean/p95/max: trials 1.310487/2/33; seconds 45.728787/69.100000/1125.800000. Living episodes are right-censored, retained in JSON.

| Natural-born class | Created | Share | After 1/5/20 trials |
| --- | --- | --- | --- |
| causal | 7 | 0.007795 | 0/7 (0); 0/7 (0); 0/3 (0) |
| chance | 891 | 0.992205 | 76/880 (0.086364); 5/841 (0.005945); 1/615 (0.001626) |

### p4 — extinction

End A u=0.981738; first ≤50% B7, ≤10% B10, exact zero B10. Full B0…B60:

0.981738, 0.936288, 0.883138, 0.820983, 0.748298, 0.663298, 0.563897, 0.447655, 0.311719, 0.152752, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.100000, 0, 0, 0, 0, 0.

Controlled equal-activation deadline omissions (a=0.082085, Meff>0): u=0.1: 1 misses; u=0.5: 4 misses; u=1: 11 misses. Strong rules require more misses. The full neural branch can miss detection or recreate connections. Raw changes: [calibration.json](../out/m11e-pilot-c/calibration.json).

### p5 — alternating 50/50

Full E0…E30 (odd hit, even miss):

0.981738, 0.983507, 0.938356, 0.944326, 0.892537, 0.902943, 0.844144, 0.859236, 0.793032, 0.813074, 0.739048, 0.764317, 0.682031, 0.712822, 0.621811, 0.658433, 0.558208, 0.600989, 0.491031, 0.540317, 0.420080, 0.476237, 0.345143, 0.408557, 0.265996, 0.337074, 0.182403, 0.261575, 0.094112, 0.181834, 0.000862.

| Initial u | Final u | Full slope | Last10 slope | Mean hit ΔW | Mean miss loss W |
| --- | --- | --- | --- | --- | --- |
| 0.981738 | 0.000862 | -0.030601 | -0.043404 | 0.003970 | 0.010510 |

End below start=true; full slope negative=true; last-ten slope negative=true. Finite-run trajectory only; no claim of an asymptotic limit. The original full acceptance mixed gain/loss check is not replaced by this diagnostic.

### p6 — rest drift and N-tail creations

storm-rest: 300 s, **PASS**; [storm-rest.json](../out/m11e-pilot-c/storm-rest.json) contains slopes/SE for every edge, snapshots and raw comparator windows.

| Quantity | Initial mean | Final mean | Δmean | Slope/s | SE | Nondecreasing | Growing beyond 3 SE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rho | 0.064821 | 0.064821 | 0 | 0 | 1.847316e-19 | true | 0 |
| W | 0.003295 | 0.003295 | 0 | 0 | 7.504721e-21 | true | 0 |

All populations pass=true; gate-open fraction=0.000333; independent gate5 audit=true.

| Mean Hz/cell | Min cell Hz | Max cell Hz | Max bursts/s | Max Fano | Audit gate fraction |
| --- | --- | --- | --- | --- | --- |
| 1.454167 | 1.290000 | 1.586667 | 0 | 0.990181 | 0.000333 |

natural-rest: 300 s, **PASS**; [natural-rest.json](../out/m11e-pilot-c/natural-rest.json) contains slopes/SE for every edge, snapshots and raw comparator windows.

| Quantity | Initial mean | Final mean | Δmean | Slope/s | SE | Nondecreasing | Growing beyond 3 SE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rho | 0.092742 | 0.092742 | 0 | 0 | 1.108390e-19 | true | 0 |
| W | 0.001402 | 0.001402 | 0 | 0 | 5.339898e-21 | true | 0 |

All populations pass=true; gate-open fraction=0; independent gate5 audit=true.

| Mean Hz/cell | Min cell Hz | Max cell Hz | Max bursts/s | Max Fano | Audit gate fraction |
| --- | --- | --- | --- | --- | --- |
| 1.453889 | 1.306667 | 1.623333 | 0 | 0.996595 | 0.000667 |

| Rest exposure | Quiet seconds | Creations | Creations /300 s | Pruned by end | Still alive |
| --- | --- | --- | --- | --- | --- |
| storm-rest | 300 | 0 | 0 | 0 | 0 |
| natural-rest | 300 | 0 | 0 | 0 | 0 |
| A quiet windows | 248 | 5 | 6.048387 | 5 | 0 |
| B quiet windows | 1494 | 38 | 7.630522 | 38 | 0 |
| E quiet windows | 745.500000 | 28 | 11.267606 | 27 | 1 |

Quiet exposure means every reality-onset drive is zero in that 100 ms window. Calibration exposure excludes active onset windows; the dedicated 300 s rests are uninterrupted. These are measurement labels only: N uses its unchanged deadband and active past lines, with no reality-onset gate. Each episode records Neff, raw counts, birth and death. Non-quiet births without the target onset are retained separately.

E quiet windows: [6,6,0], born 1903.600000 s, Neff=0.825765, still alive at the endpoint (right-censored). This episode is not counted as pruned.

B noise recreation of the extinguished true rule: t=2550.300000 s, reality/prediction/deadline=0/0/0, Nraw=6, Ndev=4.5, Neff=0.825765; pruned at 2575.200000 s. No reality-onset gate was added.

### p7 — seed-7 margins and goals

| M3 peak | Causal Δrho@6 | Margin shuffled | Margin bird | L1 intact | Pass |
| --- | --- | --- | --- | --- | --- |
| 6 | 0.308311 | 0.279170 | 0.235600 | true | true |

| M4 true strength | Single C/S | Single C/B | Timely | Pass |
| --- | --- | --- | --- | --- |
| 0.949433 | 9.494325 | 4.480465 | true | false |

| Goal | Probes | Actions | Actions/probe | No-action fraction | Achieved |
| --- | --- | --- | --- | --- | --- |
| bell | 20 | 20 | 1 | 0 | 1 |
| light | 20 | 20 | 1 | 0 | 1 |
| none | 20 | 0 | 0 | 1 | 0 |
| bird | 20 | 0 | 0 | 1 | 1 |
| bell-ablated | 20 | 0 | 0 | 1 | 0 |

Final bell actions per probe: 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1; every probe ≤2: true. Full frozen goals pass=true. Raw frozen probes: [goals.json](../out/m11e-pilot-c/goals.json).

**Natural endpoints (six trials/block)**; last-block-zero criterion: PASS.

| Block | Bird | Extra presses | Distractors | Other | Total | Bell actions/probe |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 0 | 0 | 0 | 2 | 1, 1 |
| 2 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 3 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 4 | 2 | 0 | 0 | 0 | 2 | 1, 1 |
| 5 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 6 | 2 | 0 | 0 | 0 | 2 | 1, 1 |
| 7 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 8 | 0 | 2 | 0 | 5 | 7 | 2, 2 |
| 9 | 22 | 12 | 0 | 15 | 49 | 8, 6 |
| 10 | 0 | 0 | 0 | 0 | 0 | 1, 1 |

**Final frozen suite (100 s/block)**; last-block-zero criterion: PASS.

| Block | Bird | Extra presses | Distractors | Other | Total | Bell actions/probe |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 2 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 3 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 4 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 5 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 6 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 7 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 8 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 9 | 0 | 0 | 0 | 0 | 0 | 1, 1 |
| 10 | 0 | 0 | 0 | 0 | 0 | 1, 1 |

### Verification and stop decision

npm test: **104/104 passed**, exit 0, suite 19.890000 s, wall 20.528000 s; <30 s=true.

Pilot wall time 3332.189493 s. Lifecycle counts reconcile; stores contain only positive connections; frozen goal probes retain the exact final store; runtime source hashes and the authoritative design hash match launch.

A=true, B=false, C=true. Stopped at the required pilot boundary. No full three-seed table or milestone acceptance is claimed. M6 C60/A≥0.85 recovery and other full acceptance checks remain unchanged and unrun.

Reproduce: `node experiments/m11e-pilot.mjs`, `npm test`, then `node experiments/m11e-c-report.mjs` with the recorded test summary and teacher artifacts. No branch switch, commit or push. The existing SUPERVISION.md diff and authoritative design were not edited.
