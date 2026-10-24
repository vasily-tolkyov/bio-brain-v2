L8-r2 failure diagnosis — diagnosis only, NOT ACCEPTED

Owner: Vasily. Date: 2026-10-24, Asia/Shanghai. Original verdict remains `pass:false`, six failed runs and 28 recorded model failures. This task changes neither their classifications nor their acceptance decisions. No production code, thresholds, design decisions, or acceptance artifacts were changed.

**Direct answer to Question A: no, L5–L7 PASS does not establish “every component is fine; only merge/install failed.”** It establishes the predicates those phases actually tested, on their particular fixtures. L8 adds or reintroduces optical identity/separation requirements that those post-remount phases did not certify. It also substitutes a 30-trial acquisition for L5's 320-trial prediction acquisition. Several failures are systematic fixture/measurement-contract problems; there are also actual insufficient optical completion, excessive lit-area spill and nonselective P7 outputs under the locked measurements. There is no evidence of an install failure or a deadlocked L8-r2 execution.

“Hung” here means blocked at acceptance, not an observed runtime hang. Every `collection.json` says `complete:true, failures:[]`; every continuous index records 10,100 windows, and each saved audit reaches a final decision. All six runs pass their continuous loop/accounting, goal/body behavior, continuous prediction, and snapshot-continuation gates. Each has 10/10 in all five behavioral categories and 50/50 timely continuous predictions. These results are narrower than proof that every optical component works. [Original summary](../../acceptance/L8/summary.json), [campaign audit](../../acceptance/L8/campaign-7/audit.json), [holdout audit](../../acceptance/L8/holdout-407327421/audit.json).

**Evidence and method.** The binding PLAN measurement definitions and L8 requirements, DECISIONS overrides (especially contrast identity and zero teachers), WIRING phase intent, original L8 reports/failures/coverage review, and L5–L7 summaries were read. The current 71-file L8 frozen source closure is unchanged. Shared L7 snapshot files are byte-identical to current source; L5's predictor, learning, novelty, three-factor, retina, temporal-stack, catalogue and higher-catalogue modules are also unchanged. Some layer/persistence interfaces were extended after L5; byte equality is claimed per file, not for the whole L5 tree. See [source comparison](prior-comparison.json) and [preservation baseline](preservation-before.json).

The new [autopsy script](autopsy.py) reads saved arrays only, reconstructs contrast discovery independently, recounts M2 directly from strict `B>.3`, and computes denominators, Jaccard, half coverage, extra readouts, and F/S/D without stopping at the first rejected assertion. It produced [campaign 7](campaign-7.json), [holdout 407327421](holdout-407327421.json), corresponding files for the other four seeds, and [cross-seed comparisons](cross-seed.json). These are diagnostic calculations, not a new acceptance revision.

The additional [saved-field audit](saved-field-audit.json) checks both detailed seeds' 958 frozen higher replays and 200 full/half probe fields, including path witnesses, rho updates, raw color samples, H and P7. Each seed has 83 distinct fields and 113,458 arithmetic comparisons: maximum field/rho/sample arithmetic discrepancy `5.551115123125783e-17`; maximum P7 discrepancy `1.1102230246251565e-16`. This uses the independent saved-array auditor, not production model execution. Original overall arithmetic errors remain approximately `3.33e-16`; floating-point noise does not explain the failures.

**Question A — exact scope comparison.** “Same predicate” and “same fixture” must be separated:

| Failing L8 family | What L5–L7 actually demonstrated | Same predicate and same fixture already passed? | Origin of L8 evidence |
| --- | --- | --- | --- |
| Temporal causal/shuffled/distractor | L5 independently replayed upper rho/color updates and physical fields during 320 episodes. It did not assert target-exclusive size ≥3, A@6 completion ≥.9, or the optical k6/control gain profile. L6 checked lower-role C′ and temporal area <125. L7 checked continuation equality. | No. These are principally L3 optical efficacy gates, beyond arithmetic correctness. | Separate 30-trial `temporalStorm`, fresh empty upper channels, common seed-101 lower visual examples; not the continuous action pipeline. |
| Higher level-three membership | L5 saved higher catalogues but `auditAcquisition` does not recount this level-3 catalogue or require contrast=M2. L7 checks identical persisted/restored state and lower M2 before/after, not level-3 recognition quality. | No. Level-3 instantiation and higher membership efficacy belong to L4. | Separate `higherFixture`: new level-3 instance replaying 958 saved L5 development-101 upper inputs. |
| Higher five-pattern recognition | No post-remount L5–L7 gate ran these five selected higher IDs through the full J≥.8 / half≥.9 / no-other-ID / pairwise≤.2 requirements. Lower-role optical isolation is not this test. | No. The intended gates are L4 gates, newly exercised here in the surviving acceptance chain. | Same separate level-3 fixture; first five mature catalogue entries, not five predeclared distinct sequence classes. |
| Independent membership and arithmetic | L5 audited fields/W, L6 audited lower optical state and ledgers, L7 exact restoration. Each is useful but does not cover all the L8 membership predicates. | No. This L8 aggregate includes the failed level-3 equality assertion and propagates its failure. | Boolean conjunction over four other gate decisions, not a distinct model experiment. |
| Prediction timing and selectivity | L5 did pass the same `F>0 && F≥5S && F≥5D`, 3200 ms timing and ≥18/20 match/timeliness predicates. L6's relief ratios use different action/body rules. | Same numeric predicate in L5, different fixtures. L5: 320 acquired episodes, per-seed spatial inputs and schedule. L8 selectivity: 30 episodes from empty W, shared saved seed-101 P7, new seed-derived schedule. | Separate `predictionSuite.controls`. Timing probes use inherited mature L5 state; the selectivity controls use newly learned empty-start state. Neither reads the 1,010,000 ms pipeline's final W. |

Sources: [L5 acquisition/audit](../../../../src/light-line/tests/L5-audit.mjs), [L5 predicate](../../../../src/light-line/tests/L5-acceptance.mjs), [L5 protocol](../../../../src/light-line/tests/L5-protocol.mjs), [L6 optical audit](../../../../src/light-line/tests/L6-audit.mjs), [L7 audit](../../../../src/light-line/tests/L7-audit.mjs), [L8 branch construction](../../../../src/light-line/tests/L8-suite.mjs), [L8 predicates](../../../../src/light-line/tests/L8-audit.mjs).

Thus L5–L7 did **not** omit all optics: they exercised actual cores/fields/rho and narrower lower optical fixtures. But they did not re-establish the complete upstream optical-core, temporal-causal and higher-identity phase gates. L8 itself passes the scalar five-center core and lower full/half/mixed/blank gates on all six seeds, which argues against a broken core equation. Higher field selectivity is a separate requirement.

The continuous run uses frozen naturally formed lower optics and explicitly inherited W; upper optics and W continue learning. It cannot prove fresh acquisition of every capability. More specifically, its saved higher catalogues have **zero mature entries in all six seeds**:

| Seed | Continuous higher training frames | Catalogue entries | Mature M2 entries |
| --- | ---: | ---: | ---: |
| 7 | 197 | 39 | 0 |
| 19 | 197 | 39 | 0 |
| 31 | 196 | 39 | 0 |
| 407327421 | 197 | 38 | 0 |
| 1260921771 | 199 | 35 | 0 |
| 169666778 | 194 | 44 | 0 |

The contrast catalogues reproduce exactly, but the mature-M2 loop has no entries to test. The temporal-storm arms also have zero mature entries. This explains why their arithmetic/membership gates can pass while higher efficacy remains unproven. The separate level-3 fixture has nine mature entries and exposes the mismatch. No existing PASS is silently changed here; this is an applicability limitation of that PASS. Prediction W remains separate from optical rho, so successful W-driven actions/predictions do not imply successful higher attractor recognition. See [WIRING](../../design/WIRING-CHANGES.md) and [learning coordinator](../../../../src/light-line/learning.mjs).

Holdout freshness concerns newly reserved seed values and seed-derived schedules. It does not make shared natural seed-101 input evidence freshly acquired. The complete higher numerical evidence, excluding its parameter object containing seed, is **identical across all six runs**. Its visual ports bind pixel p to cell p; that branch does not use random six-nearest geometry to vary the input mapping. Six identical higher failures are one systematic fixture result replicated, not six independent examples of seed-sensitive optical failure.

**Ranked hypotheses.** Confidence percentages below are engineering judgments about these specific explanations, not statistical posteriors or mutually exclusive probabilities. The strongest cross-cutting cause is a mismatch between L8 fixture construction, phase-gate preconditions and membership definitions; it is more precise than a generic “integration” label.

| Rank | Hypothesis | Assessment and confidence |
| --- | --- | --- |
| 1 | H-opt: higher optical completion/separation still fails | ≥95% for actual failure under the frozen L8 measurements: target-exclusive coverage=0, full J=.5/.6, C′=1 and extra P7 IDs are directly saved/reproduced. This is higher optical/fixture/readout failure, not a demonstrated wrong max-product or rho equation. The added claim “only fails when co-present under the full continuous loop” has ≤20% support: failures occur in independent branches. |
| 2 | H-replay: observer/evidence problem | ≥95% for a proven **semantic conflation**: contrast and M2 each reproduce, but the auditor demands they equal one another, then describes failure as unreproducibility. ≤5% support for missing fields/wrong saved schema in these level-3 failures. This explains two of the five gate families but cannot repair physical spill or temporal completion. |
| 3 | H-pred: insufficient selectivity | ≥95% for the 30-trial controls' measured violation, driven by shuffled S; ≥80% for acquisition-horizon and schedule-end effects explaining the difference from L5. ≤20% support for the proposed regression from continuous-loop learning: the failing branch never uses that loop's state. General long-run selectivity on arbitrary new schedules remains unproven. |
| 4 | H-remount: upstream proof gap | ≥95% that complete historical L0–L4 re-acceptance is absent and L5 PASS cannot restore it. L8 is the first surviving attempt in this chain to collect these broad optical efficacy gates, not the first time an upper optical model ran after remount. ≤20% support for remount changing model state/code as the direct numerical cause; missing evidence is a provenance gap, not proof of corruption. |
| 5 | H-int: pure integration/install failure, components otherwise all OK | ≤20% support as the sole explanation. No collection failure, freeze mismatch, continuous-accounting break or continuation mismatch is recorded. Some fixture/observer glue is demonstrably wrong or insufficient, but genuine measured efficacy failures remain. “Pure merge-only” overstates what L5–L7 certified. |

**Question B1 — temporal-causal-shuffled-distractor.**

Required: at least three identifiable target-exclusive cells for every evaluated probe; A@6 must light ≥90% at strict B>.3; causal mean target-exclusive B must peak at k6 and exceed shuffled/distractor k6 by ≥.05; reverse coverage ≤.05. Empty or inadequate denominators cannot pass.

For both detailed seeds and all three arms, target Lit is `[18,23]`. A@6 sources are `[181,188]`; distractor@6 sources are `[186,187]`. These are disjoint from the target, so the shared set is empty and the exclusive denominator is **2**, not 0. All 360 probes per arm fail the ≥3 precondition: 1,080 per seed. This is not a source/target alias, whole-network collapse, or an off-by-epsilon Lit calculation.

The source of the two-cell pattern is explicit: L5 `supports()` selects two pixels for each spatial example; `SliceRetina.topK=6` is a maximum, not a guarantee of six positive pixels. L8 reuses those examples. `TemporalStack` and `VisualAttractorLayer` map selected visual pixels directly to physical cells. The inherited two-pixel fixture does not meet the six-source fixture's ≥3-exclusive requirement in PLAN/WIRING. The gate is not waived by this observation.

| Measurement, each of 20 identical A@6 probe responses | Campaign 7 | Holdout 407327421 |
| --- | ---: | ---: |
| Target-exclusive denominator | 2 | 2 |
| B at each of cells 18 and 23, causal | 0.13288784077584984 | 0.13495496956635084 |
| Lit numerator / denominator | 0/2 | 0/2 |
| Required completion | ≥.9 | ≥.9 |
| Shuffled A@6 mean B | 0.00026619341845279424 | 0.000010919027177367168 |
| Causal distractor@6 mean B | 5.036619627861772e-8 | 3.886771463488285e-6 |
| Reverse A@6 mean B | 2.941398263811957e-15 | 1.4531942160718533e-9 |
| Causal k6 is peak; both gain margins ≥.05 | Yes | Yes |

The official assertion stops at the denominator and therefore never reports the completion failure. The latter is independently visible in the saved B. Lowering the denominator requirement alone would still fail the gate.

The causal winning path for target cell 18 is `[181,18]`. Seed 7's edge has rho `0.48414266783170323`, 30 co-lit / 5 one-end / 53 neither events; the holdout's edge has rho `0.4852555281875631`, 30 co-lit / 3 one-end / 57 neither. Raw color samples number 30, all on the matching carrier. Their hill transmissions reproduce the B values above. With dose `.1`, even 30 co-lit updates with **no depression** give rho `1-.8^(30*.1)=.488`, transmission `.14016776003870454`, below `.3`. A unit-source direct edge needs rho strictly above `.5482594573815012` to exceed B=.3; that would take at least 36 such co-lit updates in the no-depression calculation. This is an explanatory bound, **not a proposal to train until a touched seed passes**. Actual saved winning paths already establish the failed response.

Across all six causal arms the A@6 mean lies in `[.13146665612843855,.13547129235000518]`, coverage remains 0 and the denominator remains 2. The structural failure is shared; small exposure/order differences are seed-specific. All nine-column profiles, full source/exclusive/shared sets and per-probe B are retained in the diagnostic JSONs. The measured profile peaks correctly at k6: timing exists, but completion strength and identifiable-target preconditions do not meet the gate. [Temporal constructor](../../../../src/light-line/temporal-stack.mjs), [retina](../../../../src/light-line/retina.mjs), [visual layer](../../../../src/light-line/visual-layer.mjs).

**Question B2 — higher-level-three-membership.**

Both detailed seeds have a genuine level-3 N250 instance, 958 supplied input frames, 358 channels, 40 catalogue entries and 9 mature entries (largest mature contrast area: 10 cells, below 125). The first failure is not the count/level/size check. It is [L8-audit.mjs](../../../../src/light-line/tests/L8-audit.mjs), line 136:

`assert.deepEqual(m.entry.members[0], m.entry.m2[0].members)`

For id 1, actual contrast members are `[19,26,240,241]`; expected in that assertion is saved/recounted M2 `[18,19,23,26,181,188,240,241]`. Relative to M2, the contrast set omits `[18,23,181,188]` and adds nothing. These expected physical cell IDs come from the **current fixture's earliest 20 frozen replays**, not a hand-coded class template, historical catalogue or prior seed's expected IDs. Discovery attaches stable IDs to fields; the harness subsequently chooses entries for probes.

Every omitted cell exceeds B=.3 in 20/20 replays, but remains below the relative contrast cutoff: id 1 has background 0, peak 1, and membership additionally requires B≥.5. Cells 18/23 range `.32047925939369604–.47470606088201894`; 181/188 range `.3204796210328934–.4747065965557445`. Thus their M2 inclusion and contrast exclusion are both faithful to their definitions.

The same two-seed result is identical across all six seeds:

| Entry ID | Cells only in contrast | Cells only in M2 | Independent counts and saved M2 exact? |
| --- | --- | --- | --- |
| 1 | none | 18, 23, 181, 188 | Yes |
| 2 | none | 19, 26, 240, 241 | Yes |
| 3 | none | none | Yes |
| 4 | none | 18, 23, 181, 188 | Yes |
| 5 | 159, 160 | none | Yes |
| 6 | none | 19, 26, 240, 241 | Yes |
| 8 | none | 18, 23, 181, 188 | Yes |
| 11 | none | none | Yes |
| 18 | 208, 215 | none | Yes |

There are two mechanisms, not just a threshold difference. Entries 5 and 18 demonstrate catalogue drift: `observeCatalogue` replaces members with the latest matching contrast field, while M2 uses the earliest 20 assigned replays. Cells 159/160 occur above .3 only 1/20 times for entry 5; 208/215 only 6/20 for entry 18. Local J≥.8 matching permits the representative to change across frames. Exact replay correctly reproduces both the latest representative and the earlier vote; it does not prove they must match.

To satisfy the **frozen assertion**, every mature contrast set would have to equal its M2 set exactly; seven of nine do not. DECISIONS C makes contrast the identity rule and M2 subordinate evidence, which makes unconditional equality a contract question. Removing the assertion is not a schema-only correction and was not done. A revision proposal appears below. [Catalogue update](../../../../src/light-line/catalogue.mjs), [higher M2 selection](../../../../src/light-line/higher-catalogue.mjs), [DECISIONS C](../../design/DECISIONS.md).

**Question B3 — higher-five-pattern-full-half-recognition.**

Required by the frozen implementation: five IDs, 20 probes each; every full J≥.8 and half coverage≥.9; expected ID strength>.25 in ≥18/20 full/half probes; no unintended readout IDs; pairwise membership J≤.2. PLAN also requires C′≤.05. The current higher gate does not calculate C′; this diagnosis calculates it as an additional measurement, without changing official failure counts.

For seed 7 **and** holdout 407327421, first probe of id 1:

- Contrast members: `[19,26,240,241]`.
- Full Lit: `[18,19,23,26,181,188,240,241]`; extra cells `[18,23,181,188]`, missing cells none. J=`4/8=.5` versus required ≥.8. This is a field that is too broad under strict Lit, not a shifted/missing target.
- B at cells 18/23 is `.32047925939369604`, at 181/188 `.3204796210328934`, at 19 `1`, at 26 `.9999999999979989`, at 240/241 `.6751109492856178`. The extra cells are real above-.3 halo, far above numerical-error scale.
- Half Lit is the same eight cells: target coverage 1, but extra lighting persists.
- Full and half P7 both emit id 1 `.8375554746423086`, id 2 `.3204794402132947`, id 4 `.566594023820273`, id 5 `.463270189537197`, id 8 `.5598099835833698`. The contrast identification result is correctly id 1; the P7 reader nevertheless averages every mature catalogue entry and emits five IDs above .25. Contrast identity and P7 emission are separate implementation surfaces.

All six seeds have the following identical results; “passes” in this table means only the named subpredicate, not the gate:

| Selected ID | Full J values | Full-J successes /20 | Half-coverage successes /20 | Expected ID emitted, full/half | No-extra-ID successes, full/half |
| --- | --- | ---: | ---: | --- | --- |
| 1 | .5 | 0 | 20 | 20/20, 20/20 | 0/20, 0/20 |
| 2 | .5 | 0 | 20 | 20/20, 20/20 | 0/20, 0/20 |
| 3 | 1 | 20 | 20 | 20/20, 20/20 | 0/20, 0/20 |
| 4 | .6 | 0 | 20 | 20/20, 20/20 | 0/20, 0/20 |
| 5 | 2/3, .8, 1 | 19 | 1 | 20/20, 20/20 | 0/20, 0/20 |

ID 5 half coverage is .8 in 19 trials and .9 in one. Pairwise J(id1,id4)=2/3, J(id1,id5)=.4 and J(id2,id5)=.4, already above .2. The collector takes `M2.slice(0,5)` from natural transient catalogues; it does not establish the deliberately distinct five-sequence/AB-vs-BA fixture precondition. Some sets are nested: id4→id1 has an empty exclusive target set, reported as null, never a separation success.

There is also nonvacuous leakage: id1 and id2 contrast memberships are disjoint, but the id1 full probe lights all four id2-exclusive cells, giving C′=4/4=1 (required ≤.05). Replacing contrast with M2 would make id1/id2 membership sets identical, destroying distinctness instead of fixing it. Replacing Lit with the stronger contrast filter would conceal measured above-.3 spill and requires an explicit decision; it is not an arithmetic fix. Merely dropping contrast=M2 equality would leave this recognition gate failing. [Higher fixture](../../../../src/light-line/tests/L8-suite.mjs), lines 312–325; [P7 reader](../../../../src/light-line/readout.mjs).

**Question B4 — independent-membership-and-arithmetic-acceptance.**

This is a dependent failure, not separate evidence of missing fields. At the end of `auditSeed`, `membershipReproduced100Percent` is the conjunction of the natural, temporal, higher-level-three and continuous-accounting gate flags. In both detailed seeds, three flags are true and the level-3 flag is false at the contrast=M2 assertion. The aggregate copies the failure and emits “At least one saved membership cannot be reproduced…”. All six seeds follow that path.

Diagnosis reproduces all 40 contrast entries per seed, including members, contrast statistics, stable IDs, frame assignments and maturity, exactly; all nine mature M2 count arrays and member sets per seed are exact, each from 20 distinct replay frames. That is 240 catalogue entries and 54 mature recounts across the six identical higher fixtures. Their fields/P7/rho also pass the independent arithmetic check for the two detailed seeds. No absent schema field is needed to explain either failure.

What was required to pass the frozen aggregate: all four upstream gate flags true and error≤1e−12. It remains false. The confirmed bug is that the aggregate's reason labels a failed **cross-definition equality** as failed **reconstruction**, and the child gate defaults to `classification:'model'`. No historical classification is rewritten. Do not count this aggregate and its child as two independent physical model defects. The 28 failure records contain dependent failures.

**Question B5 — prediction-timing-and-selectivity.**

The fixed source P7 is `.2699999999884702`. F is the causal `[A=4,k=6,B=2]` contributor. S is the strongest corresponding target contributor across shuffled delays; D the strongest C→B contributor in the causal branch. These are single contributors, not target sums. All six runs have 20/20 timely and 20/20 matched probes, and F=`.17874985718151648` in their separate empty-start controls.

| Seed | F | S | D | F/S | F/D | Selectivity |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 7 | .178749857182 | .046252774372 | .010903680000 | 3.864630 | 16.393535 | FAIL: S |
| 19 | .178749857182 | .026999999999 | 0 | 6.620365 | ∞ (D=0) | Pass subpredicate |
| 31 | .178749857182 | .038034157902 | .010903680000 | 4.699719 | 16.393535 | FAIL: S |
| 407327421 | .178749857182 | .049961888009 | .010903680000 | 3.577724 | 16.393535 | FAIL: S |
| 1260921771 | .178749857182 | .040454581284 | .026999999999 | 4.418532 | 6.620365 | FAIL: S |
| 169666778 | .178749857182 | .026999999999 | .026999999999 | 6.620365 | 6.620365 | Pass subpredicate |

All D comparisons pass. F is positive and substantial; the failing margin is shuffled S. With this F, each control must be ≤`.0357499714363033`. Seed 7 needs F≥`.2312638718594725` at its measured S; holdout 407327421 needs F≥`.2498094400438257`.

Both detailed seeds' causal rule ends at W=`.06620365081079617`, from birth `.01` plus STDP `.05620365081079617`, with zero miss/clamp loss. Its first birth is t=3000; the last hit is t=728000. Thus the common F is a 30-episode learning result, not extinction, missing launch or timing failure.

Seed 7's strongest shuffled contributor is also `[4,6,2]`, W=`.017130657175507272`. The final two shuffled targets arrive at delays 3200/3200, producing consecutive credits at t=703200 and 728200. W rises `.0071350055799949035 → .01227508302092269 → .017130657175507272`. S consequently remains too high at the endpoint. Its strongest distractor W is `.004038400000007799`, below the allowed ratio bound.

Holdout 407327421's strongest shuffled contributor is **k3**, `[4,3,2]`, W=`.018504402966999504`, not k6. The last three shuffled delays are 400,400,200 ms; the k3 arrival is 400 ms and its ±500 ms match window legitimately credits these events. The last recorded changes are `.005537347080952561 → .010765854919802195 → .01570496484978025 → .018504402966999504`. Taking the strongest control across bins, as L5 also did, catches this short-delay rule. The saved ledger audit agrees with this computation.

L5's three official forecasts were approximately F=.269994912, S=.027, D=0, giving F/S≈9.9998. Its causal/shuffled acquisition ran **320** episodes, not the 30 in the L8 controls; calling L5 merely a “short suite” obscures this relevant difference. L8 timing/calibration probes inherit the mature development-101 state, while its selectivity controls start empty. Its 30-trial optical branch additionally changes A/C exposure duration from L5's 27 ms to 100 ms. These fixture differences prevent a like-for-like regression claim. The shared W algorithm and exact ledgers support a finite-training/schedule explanation, not a regression caused by continuous goal/body activity.

This gate is seed-specific in S and final pass/fail, although the construction and causal F are shared. We have not proved that longer training guarantees ≥5 on arbitrary schedules; endpoint control births/credits can recur. Changing horizon, control sampling or averaging would require a new frozen protocol, not an after-the-fact rescue.

**Remount and coverage limits.** The lost L0–L4 freeze/acceptance artifacts are not recreated. L5's remount PASS explicitly covers fresh L5 behavior and says historical optical acceptance is unverifiable; L6/L7 repeat that limitation. L8 does recheck the scalar optical fixture, but its [coverage review](../../acceptance/L8/coverage-review.json) additionally marks `fullPlanCoverage:false`: missing L1 call-partition comparison, insufficient L2 simultaneous-mixture sample count, missing L6 simultaneous tie fixture, incomplete L7 boundary/disk-atomicity taxonomy, and incomplete raw boundary-fixture reconstruction. The new zero-mature observation further limits what the continuous membership PASS certifies. Fixing one observer assertion cannot restore these missing prerequisites or turn L8 into ACCEPTED.

**Development isolation and why no new model probe was needed.** Saved development seed 101 already exhibits the same five rejected families in `acceptance/L8/development/r2/audit.json`; its F=.17874985718151648, S=.044747710380686895, D=.026999999998847016. The source freeze and constructor/data flow already isolate the failing independent branches from the passing continuous pipeline. Existing saved arrays allow exact inspection of the mechanisms and shared candidate files. A new 1,010,000 ms run would add cost without resolving an ambiguity identified here; a nominal “L5 short versus L8 long” comparison would confound the 320-versus-30 acquisition distinction. No model probes or trials were executed on any seed. Only saved-field calculations were run. No one-line production fix was applied: the proven equality problem changes gate semantics, so it is proposed explicitly instead of removed silently.

**Ranked next steps — proposals only; no execution authorized by this report.**

1. **Observer/evidence fix first.** Preserve separate outputs for contrast reconstruction, M2 reconstruction, contrast-vs-M2 difference, and optical efficacy. Report the exact failed assertion and continue collecting diagnostic submetrics after a failed precondition. Fix the aggregate reason/classification so it does not claim unreproducibility when both definitions reproduce. This requires no core parameter tuning and is the clearest code repair. Retain the L8-r2 decisions as historical evidence.
2. **Fixture/harness repair before model retuning.** On development seed 101 only, preflight effective retinal source count and exclusive denominator before expensive suites. Reconcile two-pixel support with the locked ≥3-exclusive fixture. Select and document genuinely distinct temporal-pattern fixtures, including AB/BA and shuffled controls, before probe outcomes; `first five mature entries` is not that contract. Preserve all rejected fixtures. Do not add a teacher, per-seed wiring, larger N or sharding. A coherent fixture that still fails capacity must be rejected honestly.
3. **Diagnose actual higher optics and readout on that coherent fixture.** Trace co-light/one-end dose and channels producing the .32/.47 halo; test temporal completion, full/half identity, C′ and unintended P7 separately. Examine latest-representative drift versus earliest-replay membership and the gap between correct contrast identification and multiple P7 emissions. Any remedy that gates P7 by identity or changes the contrast/optical boundary is an architecture/behavior change requiring an explicit design decision and dependent revalidation; it is not a one-line evidence repair. Do not loosen Lit, Jaccard or spill thresholds.
4. **Prediction comparison with controlled acquisition.** Preserve source P7, initial W state, horizon, and schedule when comparing L5-style controls with L8 controls on seed 101. First quantify the current 30-trial limitation; separately test a predeclared horizon if required by the intended capability. Keep strongest single-control contributors, all nine bins and endpoint credits visible. Do not extend training until acceptance/holdout seeds pass, omit short-delay controls or change the fivefold rule silently.
5. **Restore the prerequisite evidence chain before any later official L8 decision.** A future owner-approved revision must address the missing upstream proofs, coverage-review gaps and nonvacuous higher membership coverage. Freeze changes and use new fresh holdouts according to PLAN; all six touched L8 seeds are now known data. This report initiates no new phase or official campaign.

**PROPOSAL A — explicit membership-audit amendment (not applied).** Under DECISIONS C, define independent reproduction as: saved contrast catalogue equals an independently rebuilt contrast catalogue; saved subordinate M2 counts/sets equal an independent strict-B>.3, 10-of-20 recount; fields, paths and P7 reproduce within the existing arithmetic tolerance. Report contrast≠M2 as a named, measured diagnostic. Do not make their unconditional equality part of generic replay correctness unless the owner explicitly requires that additional invariant for a defined fixture. Keep full-Lit J≥.8, half≥.9, C′≤.05, pairwise≤.2, no-unintended-ID and noncollapse gates separate and unchanged. This proposal would address a misleading audit assertion, **not** accept the current optical behavior.

**PROPOSAL B — explicit fixture and applicability contract (not applied).** Require predeclared distinguishable fixtures with ≥3 target-exclusive cells, sufficient real replay support and five intended distinct temporal patterns; reject an incompatible fixture as a prerequisite/harness failure while retaining measured model outcomes. Require positive mature-entry coverage wherever a gate claims mature higher recognition. State whether prediction selectivity must hold after the locked 30-trial storm or a separately defined acquisition protocol. Any decision to allow two-cell targets, alter learning horizon, replace Lit with contrast or change control sampling must be a new explicit DECISIONS/protocol proposal, with rationale and dependent tests. None is adopted here; the current rejected result stands.

**Isolation and deliverables.** Teacher modules/calls remain zero; no adapters tree or legacy runtime dependency was introduced. No code edits, model runs, predecessor reruns, official L8 reruns, commits, pushes or work beyond L8 occurred. All new files are under `out/light-line/diagnosis/L8-fail/`. [Preservation verification](preservation-after.json) checks all 1,975 protected source/design/L5–L8 files against their pre-diagnosis SHA-256 values. The original L8-r2 remains NOT ACCEPTED.
