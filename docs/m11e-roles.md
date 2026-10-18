# M11e step d — three-seed acceptance

**FAIL**. Overall acceptance requires every check to pass for all three seeds.

`997a835` runtime and constants retained; current branch `m11e-roles`. Only measurement/report files added. No M11d context cell, mechanism change, parameter change, branch switch, commit, or push.

Constants: eta_S=0.205, boost=0.05, tau_boost=5000 ms, eta_M=2.58, w_init=0.01, w_max=0.1, g(u)=0.2+0.8(1−u), eligibility τ=400 ms; event entry and a>0.01 pre gate unchanged.

Seed 7 reuses `out/m11e-pilot-c`. Fresh seeds use the same 30+30 storm trials, A10/B60/E30, T1/T2 30 each, natural 60, ten endpoint blocks and final 20-probe suites. M8 sensory/motor states are independent of downward learning; the new seed-7 M8 run exactly reproduces the existing M11c sensory/motor teacher.

Causal classifications remain those of the pilot: lightning→thunder@6 in causal storm; press→light@6, light→bell@4 and press→bell@6 in actions; none in shuffled storm. The direct true-rule endpoint checks cover press→light and light→bell. Slot k has centre 100×2^(k−1) ms.

The approved earlier M11e extinction and 50/50 replacements are recorded in SUPERVISION.md (2026-10-18 17:11). R1/R2 are the only additional acceptance replacements here. The M4 bird ratio remains a hard check.

| Check | Seed 7 | Seed 19 | Seed 31 |
| --- | --- | --- | --- |
| R1 causal | 4/7 calibrated — **FAIL** | 6/7 calibrated — **FAIL** | 1/1 calibrated — **PASS** |
| R2 causal | 73/5/2 deleted/dying/violations (bounds) — **FAIL** | 54/7/0 deleted/dying/violations — **PASS** | 56/1/0 deleted/dying/violations — **PASS** |
| R1 shuffled | 5/6 calibrated — **FAIL** | 6/8 calibrated — **FAIL** | 3/3 calibrated — **PASS** |
| R2 shuffled | 116/5/1 deleted/dying/violations (bounds) — **FAIL** | 93/8/0 deleted/dying/violations — **PASS** | 94/3/0 deleted/dying/violations — **PASS** |
| R1 actions | 11/14 calibrated — **FAIL** | 23/24 calibrated — **FAIL** | 19/22 calibrated — **FAIL** |
| R2 actions | 1459/13/1 deleted/dying/violations (bounds) — **FAIL** | 1491/23/1 deleted/dying/violations — **FAIL** | 1387/21/1 deleted/dying/violations — **FAIL** |
| M3 peak / shuffled & bird margins ≥0.05 | 6; 0.279170 / 0.235600 — **PASS** | 6; 0.205690 / 0.296182 — **PASS** | 6; 0.245819 / 0.266141 — **PASS** |
| M4 causal/shuffled ≥5× | 9.494325× — **PASS** | 3.909331× — **FAIL** | 9.531341× — **PASS** |
| M4 causal/bird ≥5× | 4.480465× — **FAIL** | 9.527869× — **PASS** | ∞× — **PASS** |
| M4 timely predictions ≥90% | true — **PASS** | true — **PASS** | true — **PASS** |
| M8 peaks / margins / execution copies | 6: 0.058846/0.095960; 4: 0.169405/0.193014 — **PASS** | 6: 0.115636/0.088482; 4: 0.186792/0.186494 — **PASS** | 6: 0.129732/0.116572; 4: 0.117007/0.091725 — **PASS** |
| M5 storm-rest: no monotone growth, rest bounds | Δrho/W=0/0; growing=0/0 — **PASS** | Δrho/W=0/0; growing=0/0 — **PASS** | Δrho/W=0/0; growing=0/0 — **PASS** |
| M5 natural-rest: no monotone growth, rest bounds | Δrho/W=0/0; growing=0/0 — **PASS** | Δrho/W=0/0; growing=0/0 — **PASS** | Δrho/W=0/0; growing=0/0 — **PASS** |
| M6 extinction B60/A ≤0.1 | 0; first zero B10 — **PASS** | 0; first zero B10 — **PASS** | 0; first zero B10 — **PASS** |
| M6 stronger rules need more consecutive misses | 1 / 4 / 11 — **PASS** | 1 / 4 / 11 — **PASS** | 1 / 4 / 11 — **PASS** |
| M6 recovery C60/A ≥0.85 | 1.016350 — **PASS** | 1.015097 — **PASS** | 1.014968 — **PASS** |
| M6 jitter D/A ≥0.8 | 1.018141 — **PASS** | 1.016917 — **PASS** | 1.016790 — **PASS** |
| 50/50 alternating: not growing | 0.981738→0.000862; slope=-0.030601; last10=-0.043404 — **PASS** | 0.982950→0.003612; slope=-0.030553; last10=-0.043333 — **PASS** | 0.983075→0.003897; slope=-0.030548; last10=-0.043325 — **PASS** |
| gate5 calibration | 100 trials; last100=98/100 — **PASS** | 100 trials; last100=99/100 — **PASS** | 100 trials; last100=99/100 — **PASS** |
| gate5 frozenMatched | 100/100 — **PASS** | 100/100 — **PASS** | 100/100 — **PASS** |
| gate5 edges | -500ms: 10/10; 500ms: 10/10 — **PASS** | -500ms: 10/10; 500ms: 10/10 — **PASS** | -500ms: 10/10; 500ms: 10/10 — **PASS** |
| gate5 N | 147.113942 / paired 0 — **PASS** | 152.513942 / paired 0 — **PASS** | 158.613942 / paired 0 — **PASS** |
| gate5 M | 123.825765 / paired 0 — **PASS** | 115.725765 / paired 0 — **PASS** | 122.525765 / paired 0 — **PASS** |
| gate5 weakDeadband | u=0.1: 1 detected; Meff=18.425765, 3SEM=5.800000 — **PASS** | u=0.1: 1 detected; Meff=18.525765, 3SEM=7.014984 — **PASS** | u=0.1: 1 detected; Meff=16.525765, 3SEM=5.404628 — **PASS** |
| gate5 linearity | true — **PASS** | true — **PASS** | true — **PASS** |
| gate5 rest | Hz=1.433667…1.493333; Fano max=0.997996 — **PASS** | Hz=1.436667…1.468333; Fano max=0.998329 — **PASS** | Hz=1.429000…1.492667; Fano max=1.000800 — **PASS** |
| gate5 restGateClosed | 0.000667 — **PASS** | 0.001667 — **PASS** | 0.000333 — **PASS** |
| gate5 restDrift | true — **PASS** | true — **PASS** | true — **PASS** |
| gate5 frozen | true — **PASS** | true — **PASS** | true — **PASS** |
| True storm / press→light / light→bell ≥0.8 | 0.949433 / 0.999896 / 0.964340 — **PASS** | 0.952787 / 0.999896 / 0.964340 — **PASS** | 0.953134 / 0.999896 / 0.964340 — **PASS** |
| True goals and frozen controls | bell: first/achieved 1/1; light: first/achieved 1/1; none/ablation actions=0/0 — **PASS** | bell: first/achieved 1/1; light: first/achieved 1/1; none/ablation actions=0/131 — **FAIL** | bell: first/achieved 1/1; light: first/achieved 1/1; none/ablation actions=0/0 — **FAIL** |
| M11a frozen bell: every probe ≤2 actions | max=1 — **PASS** | max=8 — **FAIL** | max=1 — **PASS** |
| Natural action blocks: last total=0 | last=0; bird=2/0/0/2/0/2/0/0/22/0 — **PASS** | last=23; bird=14/2/0/0/12/0/0/0/17/0 — **FAIL** | last=2; bird=2/21/0/17/19/0/20/0/0/2 — **FAIL** |
| Frozen action blocks: last total=0 | last=0; bird=0 — **PASS** | last=24; bird=0 — **FAIL** | last=2; bird=20 — **FAIL** |
| Rest-tail creations pruned (R2 censoring) | storm-rest: 0/0 deleted, 0 dying, 0 unresolved; natural-rest: 0/0 deleted, 0 dying, 0 unresolved; A: 5/5 deleted, 0 dying, 0 unresolved; B: 38/38 deleted, 0 dying, 0 unresolved; E: 27/28 deleted, 1 dying, 0 unresolved — **PASS** | storm-rest: 0/0 deleted, 0 dying, 0 unresolved; natural-rest: 0/0 deleted, 0 dying, 0 unresolved; A: 5/6 deleted, 1 dying, 0 unresolved; B: 39/42 deleted, 3 dying, 0 unresolved; E: 29/29 deleted, 0 dying, 0 unresolved — **PASS** | storm-rest: 0/0 deleted, 0 dying, 0 unresolved; natural-rest: 0/0 deleted, 0 dying, 0 unresolved; A: 13/13 deleted, 0 dying, 0 unresolved; B: 37/37 deleted, 0 dying, 0 unresolved; E: 28/28 deleted, 0 dying, 0 unresolved — **PASS** |
| M11e-c A: single-event u≤0.3 (shared formula) | 0.142957 example; 0.293725 upper bound — **PASS** | 0.142957 example; 0.293725 upper bound — **PASS** | 0.142957 example; 0.293725 upper bound — **PASS** |
| npm test green, wall <30 s | 104/104; 15.751607 s — **PASS** | 104/104; 15.751607 s — **PASS** | 104/104; 15.751607 s — **PASS** |
| All original code matches 997a835 | 77 original files — **PASS** | 77 original files — **PASS** | 77 original files — **PASS** |

## R1: surviving non-causal rules

p counts all observed cause onsets and matching outcome onsets in the inclusive ±500 ms window for each slot, including periods when no connection exists. Natural includes the whole T1/T2/natural run. Wilson intervals use z=1.959963984540054. S=eta_S×mean(boost at hit)×mean(a at hit); the measured boost is approximately 1. The exact mean of the product is also reported. M=eta_M×mean(a at unconsumed deadline), including comparator-silent misses. These statistics never alter learning.

Writing x=pS and y=(1−p)M, the stable clipped equilibrium is 0 when x≤y, otherwise (x−y)/(x−0.8y). The allowed band is [u*(p_lo)−0.1,u*(p_hi)+0.1]. If u*(p_hi)=0, survival also requires birth within the last n_kill cause onsets, without the R2 slack.

| Seed | World / raw generations | Mean hit a (n) | Mean miss a (n) | S | M | Mean boost | Exact boosted S |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | [causal](../out/m11e-roles/7/causal-calibration.json) | 0.468704 (34) | 0.085288 (112) | 0.096085 | 0.220044 | 1.000008 | 0.096085 |
| 7 | [shuffled](../out/m11e-roles/7/shuffled-calibration.json) | 0.344773 (5) | 0.098765 (131) | 0.070688 | 0.254815 | 1.000140 | 0.070689 |
| 7 | [actions](../out/m11e-roles/7/actions-calibration.json) | 0.336826 (239) | 0.086520 (1636) | 0.069051 | 0.223222 | 1.000017 | 0.069051 |
| 19 | [causal](../out/m11e-roles/19/causal-calibration.json) | 0.457418 (32) | 0.084761 (57) | 0.093771 | 0.218682 | 1.000006 | 0.093771 |
| 19 | [shuffled](../out/m11e-roles/19/shuffled-calibration.json) | 0.403409 (7) | 0.086837 (100) | 0.082705 | 0.224040 | 1.000069 | 0.082707 |
| 19 | [actions](../out/m11e-roles/19/actions-calibration.json) | 0.355500 (255) | 0.088329 (1665) | 0.072879 | 0.227890 | 1.000020 | 0.072879 |
| 31 | [causal](../out/m11e-roles/31/causal-calibration.json) | 0.490053 (30) | 0.077677 (60) | 0.100461 | 0.200406 | 1.000003 | 0.100461 |
| 31 | [shuffled](../out/m11e-roles/31/shuffled-calibration.json) | 0.688435 (3) | 0.086586 (98) | 0.141140 | 0.223393 | 1.000078 | 0.141134 |
| 31 | [actions](../out/m11e-roles/31/actions-calibration.json) | 0.343367 (248) | 0.087091 (1580) | 0.070391 | 0.224694 | 1.000018 | 0.070392 |

| Seed | World | Rule | hits/onsets; p | Wilson CI | u* | Band | Final u | Zero-equilibrium age exception | R1 | Old ≤0.1 (info) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | causal | thunder→lightning@8 | 0/35; 0 | 6.938894e-18…0.098901 | 0 | -0.100000…0.100000 | 0.013406 | 14<1: false | FAIL | PASS |
| 7 | causal | lightning→bird@5 | 3/30; 0.100000 | 0.034600…0.256211 | 0 | -0.100000…0.100000 | 0.007095 | 8<2: false | FAIL | PASS |
| 7 | causal | bird→thunder@3 | 5/15; 0.333333 | 0.151763…0.582865 | 0 | -0.100000…0.100000 | 0.211905 | 1<2: true | FAIL | FAIL |
| 7 | causal | bird→thunder@2 | 5/15; 0.333333 | 0.151763…0.582865 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | causal | lightning→bird@7 | 0/30; 0 | 0…0.113513 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | causal | thunder→bird@6 | 0/35; 0 | 6.938894e-18…0.098901 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | causal | thunder→bird@8 | 0/35; 0 | 6.938894e-18…0.098901 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | shuffled | lightning→bird@5 | 3/30; 0.100000 | 0.034600…0.256211 | 0 | -0.100000…0.100000 | 0.007095 | 8<1: false | FAIL | PASS |
| 7 | shuffled | bird→thunder@7 | 0/15; 0 | 0…0.203883 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | shuffled | lightning→thunder@6 | 0/30; 0 | 0…0.113513 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | shuffled | lightning→bird@7 | 0/30; 0 | 0…0.113513 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | shuffled | thunder→bird@7 | 0/32; 0 | 0…0.107179 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | shuffled | thunder→bird@8 | 0/32; 0 | 0…0.107179 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | light→bell@5 | 0/120; 0 | 0…0.031019 | 0 | -0.100000…0.100000 | 0.100000 | 45<1: false | FAIL | PASS |
| 7 | actions | action:wave→action:idle@7 | 2/90; 0.022222 | 0.006115…0.077445 | 0 | -0.100000…0.100000 | 0.100000 | 1<1: false | FAIL | PASS |
| 7 | actions | bird→action:idle@8 | 0/120; 0 | 0…0.031019 | 0 | -0.100000…0.100000 | 0.100000 | 1<1: false | FAIL | PASS |
| 7 | actions | action:wave→action:press@4 | 6/90; 0.066667 | 0.030910…0.137901 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | action:wave→action:press@7 | 9/90; 0.100000 | 0.053507…0.179242 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | action:idle→action:press@4 | 14/90; 0.155556 | 0.094983…0.244328 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | action:press→bird@4 | 8/90; 0.088889 | 0.045730…0.165705 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | action:wave→bird@7 | 5/90; 0.055556 | 0.023961…0.123537 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | action:idle→bird@5 | 11/90; 0.122222 | 0.069636…0.205737 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | light→action:idle@7 | 1/120; 0.008333 | 0.001473…0.045696 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | bell→action:idle@7 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | bird→action:idle@7 | 4/120; 0.033333 | 0.013038…0.082580 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | action:press→action:idle@8 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 7 | actions | action:wave→action:idle@8 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | causal | lightning→bird@6 | 2/30; 0.066667 | 0.018477…0.213235 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | causal | thunder→bird@4 | 2/32; 0.062500 | 0.017311…0.201471 | 0 | -0.100000…0.100000 | 0.100000 | 1<1: false | FAIL | PASS |
| 19 | causal | bird→thunder@2 | 3/16; 0.187500 | 0.065916…0.430089 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | causal | bird→thunder@3 | 3/16; 0.187500 | 0.065916…0.430089 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | causal | lightning→bird@8 | 0/30; 0 | 0…0.113513 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | causal | thunder→bird@8 | 0/32; 0 | 0…0.107179 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | causal | bird→thunder@8 | 0/16; 0 | 0…0.193608 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | shuffled | bird→thunder@6 | 4/16; 0.250000 | 0.101821…0.494983 | 0 | -0.100000…0.100000 | 0.007080 | 2<1: false | FAIL | PASS |
| 19 | shuffled | lightning→thunder@6 | 6/30; 0.200000 | 0.095051…0.373057 | 0 | -0.100000…0.100000 | 0.243721 | 1<2: true | FAIL | FAIL |
| 19 | shuffled | lightning→bird@6 | 2/30; 0.066667 | 0.018477…0.213235 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | shuffled | bird→thunder@2 | 2/16; 0.125000 | 0.034977…0.360228 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | shuffled | bird→thunder@3 | 2/16; 0.125000 | 0.034977…0.360228 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | shuffled | lightning→bird@8 | 0/30; 0 | 0…0.113513 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | shuffled | thunder→bird@8 | 0/33; 0 | 0…0.104270 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | shuffled | bird→thunder@8 | 0/16; 0 | 0…0.193608 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:idle→bird@7 | 7/90; 0.077778 | 0.038185…0.151939 | 0 | -0.100000…0.100000 | 0.007085 | 6<1: false | FAIL | PASS |
| 19 | actions | bird→action:idle@2 | 14/120; 0.116667 | 0.070781…0.186334 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:wave→action:idle@7 | 2/90; 0.022222 | 0.006115…0.077445 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | bird→action:idle@3 | 13/120; 0.108333 | 0.064411…0.176554 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:idle→bird@3 | 9/90; 0.100000 | 0.053507…0.179242 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | bird→action:press@5 | 10/120; 0.083333 | 0.045894…0.146622 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:wave→action:press@7 | 7/90; 0.077778 | 0.038185…0.151939 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:idle→action:press@5 | 8/90; 0.088889 | 0.045730…0.165705 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | bird→bell@6 | 9/120; 0.075000 | 0.039957…0.136409 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:press→bell@4 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:wave→bell@7 | 2/90; 0.022222 | 0.006115…0.077445 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:idle→bell@5 | 5/90; 0.055556 | 0.023961…0.123537 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | light→action:wave@3 | 5/120; 0.041667 | 0.017927…0.093841 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:press→action:wave@6 | 7/90; 0.077778 | 0.038185…0.151939 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | light→action:press@7 | 0/120; 0 | 0…0.031019 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | bell→action:press@7 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | bird→action:press@8 | 0/120; 0 | 0…0.031019 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:wave→action:press@8 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:idle→action:press@8 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | light→action:press@8 | 0/120; 0 | 0…0.031019 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | light→bell@8 | 0/120; 0 | 0…0.031019 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | bird→bell@8 | 2/120; 0.016667 | 0.004583…0.058736 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:press→bell@8 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 19 | actions | action:idle→bell@8 | 2/90; 0.022222 | 0.006115…0.077445 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | causal | lightning→bird@5 | 1/30; 0.033333 | 0.005909…0.166704 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | shuffled | bird→thunder@5 | 3/9; 0.333333 | 0.120584…0.645798 | 0 | -0.100000…0.531712 | 0.243689 | not needed | PASS | FAIL |
| 31 | shuffled | lightning→bird@5 | 1/30; 0.033333 | 0.005909…0.166704 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | shuffled | lightning→thunder@6 | 4/30; 0.133333 | 0.053097…0.296813 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | light→bell@5 | 0/120; 0 | 0…0.031019 | 0 | -0.100000…0.100000 | 0.100000 | 50<1: false | FAIL | PASS |
| 31 | actions | action:idle→action:press@4 | 11/90; 0.122222 | 0.069636…0.205737 | 0 | -0.100000…0.100000 | 0.119448 | 1<1: false | FAIL | FAIL |
| 31 | actions | action:press→bird@7 | 7/90; 0.077778 | 0.038185…0.151939 | 0 | -0.100000…0.100000 | 0.115146 | 1<1: false | FAIL | FAIL |
| 31 | actions | action:idle→action:press@5 | 8/90; 0.088889 | 0.045730…0.165705 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | light→action:wave@1 | 7/120; 0.058333 | 0.028541…0.115526 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:press→action:wave@6 | 8/90; 0.088889 | 0.045730…0.165705 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:idle→action:wave@6 | 7/90; 0.077778 | 0.038185…0.151939 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | light→action:wave@2 | 8/120; 0.066667 | 0.034165…0.126051 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | light→action:wave@3 | 7/120; 0.058333 | 0.028541…0.115526 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | light→bird@6 | 6/120; 0.050000 | 0.023114…0.104803 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | bell→bird@6 | 6/90; 0.066667 | 0.030910…0.137901 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:wave→bird@6 | 8/90; 0.088889 | 0.045730…0.165705 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:idle→bird@7 | 2/90; 0.022222 | 0.006115…0.077445 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | bell→light@6 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | bird→light@4 | 13/120; 0.108333 | 0.064411…0.176554 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:press→light@7 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:wave→light@6 | 3/90; 0.033333 | 0.011400…0.093473 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:idle→light@7 | 1/90; 0.011111 | 0.001964…0.060284 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | light→bird@7 | 4/120; 0.033333 | 0.013038…0.082580 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | bird→light@5 | 10/120; 0.083333 | 0.045894…0.146622 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:wave→light@7 | 16/90; 0.177778 | 0.112497…0.269439 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |
| 31 | actions | action:idle→light@8 | 0/90; 0 | 0…0.040936 | 0 | -0.100000…0.100000 | 0.100000 | 0<1: true | PASS | PASS |

## R2: generations

K=n_kill(u_peak)+2; n_kill iterates the actual clipped subtraction using measured M. Each recreation starts a new generation. Deleted generations pass; a live generation with fewer than K cause onsets after its last hit (or birth) is still dying.

| Seed | World | Deleted | Still dying | Violations | R2 |
| --- | --- | --- | --- | --- | --- |
| 7 | causal | 73 | 5 | 2 | FAIL |
| 7 | shuffled | 116 | 5 | 1 | FAIL |
| 7 | actions | 1459 | 13 | 1 | FAIL |
| 19 | causal | 54 | 7 | 0 | PASS |
| 19 | shuffled | 93 | 8 | 0 | PASS |
| 19 | actions | 1491 | 23 | 1 | FAIL |
| 31 | causal | 56 | 1 | 0 | PASS |
| 31 | shuffled | 94 | 3 | 0 | PASS |
| 31 | actions | 1387 | 21 | 1 | FAIL |

| Seed | World | Violating generation | Peak u | Final u | Birth s | Last hit s | Later onsets | K |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | causal | [6,8,0] | 0.100000 | 0.013406 | 595.900000 | none | 14 | 3 |
| 7 | causal | [0,5,12] | 0.187164 | 0.007095 | 667.900000 | 697.200000 | 7 | 4 |
| 7 | shuffled | [0,5,12] | 0.187164 | 0.007095 | 667.900000 | 697.200000 | 7 | 3 |
| 7 | actions | [0,5,6] | 0.100000 | 0.100000 | 2522.900000 | none | 45 | 3 |
| 19 | actions | ["action:idle",7,12] | 0.187155 | 0.007085 | 3849.200000 | 3884.500000 | 5 | 3 |
| 31 | actions | [0,5,6] | 0.100000 | 0.100000 | 2356.300000 | none | 50 | 3 |

Seed-7 saved-artifact counterexample: light→bell@5, born at 2522.9 s, remains u=0.1 at 4080 s with STDP=M=0 over its entire generation. Its 45 recorded unit-activation predictions all completed without hit credit. Mean deadline a=0.0820849986, M=0.2117792964, n_kill=1, K=3. Even the lowest possible whole-world mean implied by existing sensory/action thresholds gives K≤5. This is an R2 violation regardless of missing whole-world measurements. [Exact records and derivation](../out/m11e-roles/7/pilot-audit.json).

Seed-7 measured R2 counts exactly confirm the previous saved-artifact bounds. The acceptance rows retain their original values and bounds labels; the generation table above now uses measured M and complete cause-onset histories.

The supervisor authorised deterministic seed-7 replay on 2026-10-18 at 23:55, using committed 55176d6 code (runtime identical to 997a835). Saved storm/action trajectories and full phase endpoints, and every B/E calibration trial, matched exactly. The replay supplied missing onset/eligibility measurements and B/E checkpoints. Checkpoint verification also exactly reproduced M4 probe records, all ten natural action-block probe suites, final frozen goals and the A endpoint. Original pilot artifacts were retained. No parameter or acceptance change was made.

## Old false-rule checks (information only)

| Seed | World | Final max u | Old ≤0.1 | Mean slope | p95 slope | Max slope | Old all <0 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | causal | 0.211905 | FAIL | 0.000132 | 0.000209 | 0.003599 | FAIL |
| 7 | shuffled | 0.100000 | PASS | -0.000009 | 0.000605 | 0.001573 | FAIL |
| 7 | actions | 0.100000 | PASS | -1.841871e-7 | 0.000333 | 0.000481 | FAIL |
| 19 | causal | 0.100000 | PASS | -0.000123 | -0.001737 | -0.000489 | PASS |
| 19 | shuffled | 0.243721 | FAIL | 0.000037 | 0.000726 | 0.001496 | FAIL |
| 19 | actions | 0.100000 | PASS | -0.000030 | -0.000434 | 0.000380 | FAIL |
| 31 | causal | 0.100000 | PASS | 0.000108 | 0.000242 | 0.003256 | FAIL |
| 31 | shuffled | 0.243689 | FAIL | 0.000109 | 0.000444 | 0.003883 | FAIL |
| 31 | actions | 0.119448 | FAIL | 0.000016 | 0.000292 | -0.000507 | FAIL |

## M4 bird co-occurrence diagnosis

Seed 7: causal/bird=4.480465×, FAIL; strongest bird rule [12,3,6], u=0.211905. Whole-run bird→thunder hit rate at that slot: 5/15=0.333333; Wilson CI 0.151763…0.582865.

Seed 19: causal/bird=9.527869×, PASS; strongest bird rule [12,2,6], u=0.100000. Whole-run bird→thunder hit rate at that slot: 3/16=0.187500; Wilson CI 0.065916…0.430089.

Seed 31: causal/bird=∞×, PASS; strongest bird rule absent, u=0. No bird→thunder connection survives.

Seed 7 has 0/15 external bird→thunder sound-onset matches at column 3, but saved P7 records show a neural match: sound starts 822947 ms; P7 thunder onsets at 822900 and 824300 ms; bird onset at 824100 ms. The second P7 onset lies within the bird prediction window centred at 824500 ms. Thus the residual reflects a neural onset co-occurrence during a sustained sound, not a high external sound-onset rate. This explains the observed credit; it does not waive the failed 5× check or establish R1 calibration.

## Rest-tail creations and action blocks

| Seed | Exposure | Quiet s | Births | Per 300 s | Pruned | Alive/censored |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | storm-rest | 300 | 0 | 0 | 0 | 0 |
| 7 | natural-rest | 300 | 0 | 0 | 0 | 0 |
| 7 | A | 248 | 5 | 6.048387 | 5 | 0 |
| 7 | B | 1494 | 38 | 7.630522 | 38 | 0 |
| 7 | E | 745.500000 | 28 | 11.267606 | 27 | 1 |
| 19 | storm-rest | 300 | 0 | 0 | 0 | 0 |
| 19 | natural-rest | 300 | 0 | 0 | 0 | 0 |
| 19 | A | 248 | 6 | 7.258065 | 5 | 1 |
| 19 | B | 1494 | 42 | 8.433735 | 39 | 3 |
| 19 | E | 745.500000 | 29 | 11.670020 | 29 | 0 |
| 31 | storm-rest | 300 | 0 | 0 | 0 | 0 |
| 31 | natural-rest | 300 | 0 | 0 | 0 | 0 |
| 31 | A | 248 | 13 | 15.725806 | 13 | 0 |
| 31 | B | 1494 | 37 | 7.429719 | 37 | 0 |
| 31 | E | 745.500000 | 28 | 11.267606 | 28 | 0 |

Quiet means every reality-onset drive is zero; it is an observation label. Surviving right-censored generations are retained, never counted as pruned. A saved endpoint proving fewer than three cause onsets since birth establishes “still dying” because K≥3 for every positive generation. Missing endpoints remain unresolved. Per-episode evidence is in each seed’s pruning.json. Bird-goal behavior is included in the action-block rows above; all raw blocks remain in each seed’s action-blocks.json and goals.json.

| Seed | Final natural block | Bird | Extra presses | Distractors | Other | Total | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 10 | 0 | 0 | 0 | 0 | 0 | PASS |
| 19 | 10 | 0 | 3 | 3 | 17 | 23 | FAIL |
| 31 | 10 | 2 | 0 | 0 | 0 | 2 | FAIL |

Seed-7 final E-tail: 27/28 quiet-born generations deleted; 1 still dying; 0 violations; 0 unresolved. [6,6,0], born 1903.600000 s, final u=0.100000, 0 recorded cause onsets: still dying.

## Follow-up items

Growth speed is reported only: seed-7 light→bell needed 42 hit credits to reach 0.8. The new-connection boost is nominal: 1.05× at birth, decaying toward 1 with τ=5 s. Hit credit depends on arrival within tolerance because eligibility starts at window entry: unit activation gives a=1 at the early edge, exp(−500/400)=0.286505 at centre and exp(−1000/400)=0.082085 at the late edge. No timing or boost change was made.

| Seed | light→bell hits to 0.8 (follow-up) | Global trial | Final u |
| --- | --- | --- | --- |
| 7 | 42 | 73 | 0.964340 |
| 19 | 42 | 73 | 0.964340 |
| 31 | 42 | 73 | 0.964340 |

npm test: 104/104 checks, exit 0, wall 15.751607 s; under 30 s=true. [Output](../out/m11e-roles/tests.log).

[Runtime audit against 997a835](../out/m11e-roles/runtime-audit.json). Existing SUPERVISION.md edits belong to the supervisor and were not made by these scripts.

Seed-7 replay completed: [exact replay audit](../out/m11e-roles/7/replay-audit.json), [retained metric audit](../out/m11e-roles/7/replay-metrics.json), [replay log](../out/m11e-roles/7/replay.log). Recovery C uses m11e-d-m6.mjs from the reproduced B endpoint; the completed D check is retained.

Step d2 npm test: 104/104, exit 0, 15.150000 s. Original shared test row retained. [Captured output](../out/m11e-roles/7/d2-tests.log).
