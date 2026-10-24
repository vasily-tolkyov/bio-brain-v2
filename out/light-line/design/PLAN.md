> REMOUNT 2026-10-23T14:02:48+08:00 (Asia/Shanghai): recovered exact design-p3 text from logs/codex-light-line-design-p3.log:7730–7968. Later DECISIONS.md locks override these historical defaults (including teachers and comparator units). Referenced pre-remount out/ evidence was lost and is not recreated here.

# light-line-design-p3 — Build plan

Design only, 2026-10-22. This file specifies future implementation and acceptance work; none of those builds, harnesses or model runs was performed for this design task. The implementation must follow [WIRING-CHANGES.md](WIRING-CHANGES.md), especially its level2 section. Recommended but unvalidated boundary choices are isolated in [ARCH-QUESTIONS.md](ARCH-QUESTIONS.md).

## Fixed scope

Build an independent light line. Every attractor base, including the temporal layer, uses the accepted N=250 light core. Keep temporal unroll, higher-module responsibilities, event ledgers, goal recursion, action ordering and existing environment protocols. Replace spike/LIF/inhibition/GB-dependent surfaces with B, lit areas and rho/color channels. Do not add a `BIO_BRAIN_BASE` switch, import the wire adapter, retain a legacy level2, or use a legacy LIF comparator.

The old line's composition and timing are documented in `ARCHITECTURE.md:44-74`, `src/action-pipeline.mjs:10-33`, `src/learning.mjs:21-32` and `src/unroll.mjs:2-61`. Its direct LIF comparator construction is in `src/novelty.mjs:17-28` and `src/errors.mjs:23-40`. These citations define the preservation/replacement boundary; a copied old import chain would violate it.

## Proposed independent layout

This tree is a design, not files created by this task.

```text
src/light-line/
  index.mjs                         explicit public entrypoint; always light
  config.mjs                        frozen core + versioned boundary configuration
  core/
    light-base.mjs                  independent copy of accepted scalar core
    light-base-color.mjs            independent copy of accepted hill/propagation core
    light-base-color-v2.mjs         independent copy; construct sum/.05 explicitly
  utilities/
    rng.mjs                         local environment/schedule RNG implementation
    check-env.mjs                   local declaration validation
    sets.mjs                        local set/Jaccard helpers if needed
  layer.mjs                        N=250 core, clock, presentations, freeze, history
  encoding.mjs                     ports, six-nearest clusters, carriers, B composition
  catalogue.mjs                    label-free discovery, 20-replay M2, stable IDs
  readout.mjs                      100 ms physical B mean; strict .25 P7 threshold
  io.mjs                           unchanged env sampling/batching structure
  teachers.mjs                     unchanged outer curriculum; optical readiness
  unroll.mjs                       unchanged TimeUnroll algorithm
  temporal-ports.mjs               9×ID afferent map and oriented channel observations
  downward.mjs                     unchanged W store/algebra; optical rho/B observer
  predict.mjs                      unchanged FutureSlices and GoalRow algorithms
  novelty.mjs                      B comparator; unchanged pending/match ledger
  goal-errors.mjs                  B goal comparator, no neural dependency
  three-factor.mjs                 unchanged W credit/miss; B birth-signal boundary
  learning.mjs                     unchanged coordinator order; offline optical commits
  goals.mjs                        unchanged recursion/ownership/pending/drive control
  output.mjs                       same motor winner, threshold and onset execution
  action-pipeline.mjs              same environment-to-action loop
  interoception.mjs
  body-input.mjs
  body-changes.mjs
  drive.mjs
  source-labels.mjs                same-source guards and adapter metadata
  persistence/
    layer-state.mjs                optical layer validation and atomic in-memory fork
    pipeline-state.mjs             complete pipeline/environment state validation
    checkpoint.mjs                local atomic JSON writer/reader
  observations.mjs                B/lit/channel/ledger diagnostics; never drives model
  envs/
    storm.mjs
    actions.mjs
    interoceptive-actions.mjs
    two-quantities.mjs             independent ports of existing env behavior
tests/light-line/
  core.mjs
  boundary.mjs
  teachers.mjs
  unroll.mjs
  temporal-light.mjs
  predict-learning.mjs
  goals-actions-body.mjs
  persistence.mjs
  import-isolation.mjs
  run.mjs
  acceptance/
    protocols.mjs                 fixed schedules/seed roles/thresholds before runs
    L0-core.mjs ... L8-end-to-end.mjs
    audit-saved-fields.mjs         independent field/membership/path recomputation
out/light-line/
  design/                         these three documents; preserve _aborted-p1 if present
  freeze/<revision>/              source closure, configs, fixtures, hashes, decisions
  tuning/<revision>/<seed>/       only 101/202/303/404/505
  acceptance/<revision>/<phase>/<seed>/
  final/<revision>/<fresh-seed>/
```

The shared **runtime file allowlist is empty**. Node standard-library modules are allowed; no runtime import may resolve outside `src/light-line/` to another repository module. This intentionally avoids even indirect legacy imports. For example, old `world.mjs` imports old IO (`src/world.mjs:2-3`), and old `predict.mjs` imports readout/downward (`src/predict.mjs:2-5`); preserving their algorithms requires local copies with local imports, not a re-export.

Explicitly reusable utility **algorithms**, copied locally: set/Jaccard arithmetic (`src/light-base.mjs:34-65`), environment validation (`src/core/check.mjs:18-42`), and environment RNG (`src/core/rng.mjs:2-35`). RNG instances are stateful and therefore are not a shared pure service. Keep the accepted core's distinct no-spare RNG implementation unchanged (`src/light-base.mjs:6-23`); replacing it with the cached-spare environment RNG would alter its protocol. Copy atomic checkpoint file handling separately (`src/checkpoint.mjs:6-20`); it has IO side effects and is not on a “pure utilities” exception list. Share no runtime singleton or configuration with legacy.

Copy the accepted core's three-file import closure into the new directory, preserving algorithm bodies and provenance hashes; the original accepted files/evidence stay untouched. Do not bring `light-base-adapter.mjs`, `base-selection.mjs`, old `brightness.mjs`, `network.mjs`, `neuron/lif.mjs`, `stdp.mjs`, `synapse.mjs`, `ee-growth.mjs` or old `core/state.mjs` into the closure. Their dependencies/mechanisms are explicit in `src/layer.mjs:2-9`, `src/network.mjs:3-7`, `src/brightness.mjs:2-20`, `src/core/state.mjs:4-7`. A future entrypoint can run directly with Node; no package-level switch or change to the old test command is required.

## Common measurements and seed discipline

Use physical `Lit(B)={i:B_i>.3}`. For candidate membership M, completion is `|Lit(B)∩M|/|M|`; full identity is Jaccard(Lit(B),M). For ordered patterns i,j, C′ is `|Lit(B_i)∩(M_j\M_i)|/|M_j\M_i|`. Record shared-cell B separately. Empty denominators are explicit null/vacuous diagnostics, never a way to pass distinct-pattern separation or an identifiable temporal-target test. These definitions come from `src/light-base-color-v2.mjs:68-88` and `out/light-base/p4b/REPORT.md`.

P7 is the 100 ms mean B over measured physical members and replicas, with strict strength>.25; it is neither lit-cell fraction nor spike count (`src/readout.mjs:3-4`, `:16-46`). Carry all three quantities separately. Forecast strength remains the existing normalized W transfer acting on B-derived P7 (`src/predict.mjs:101-105`); W and optical rho are separate state (`src/downward.mjs:15-38`, `:41-66`). For the L5 extinction/recovery trajectory, F means the launched brightness of the specified `(A,6,B)` contributor under a fixed source-P7 probe, or zero after its connection is deleted. It is not a sum over other rules or a rho statistic. For selectivity, compare that contributor with the strongest corresponding control contributor using the same source strength; report total target forecast separately.

| Seed role | Protocol |
| --- | --- |
| Tuning | 101,202,303,404,505 only. Tune only unresolved wrapper choices such as encoding/cadence/comparator units. N, m, eta, kappa, theta, hill curve and sum/.05 remain frozen. Retain every failed configuration and its reason. |
| Acceptance | 7,19,31, after freezing source closure, all boundary defaults, curricula, metrics and thresholds. Require every seed at every applicable phase to pass. These are known reference seeds, not fresh holdouts. No seed-specific retry or parameter change. |
| Final fresh holdout | Reserve three previously unused seed values **after** the entire implementation/config/protocol freeze. Check local evidence/manifests for prior use, record the chosen seeds and seed-derived schedules before first execution, then run once. Do not reuse 41/53/67: they are already in `out/light-base/p4b/holdout-results.json`. If a proposed seed has prior local use, replace it before any model run and log why. Do not claim freshness outside the evidence inspected. |
| Failure policy | A failed gate stays failed. Fixes return to a new tuning revision; any touched acceptance seeds are thereafter known data. A failed final holdout requires a new revision and new holdout, never overwrite/rerun-as-first. Missing/timeout/observer failures are distinct from a model failure and never PASS. Wire's classifications are the precedent (`out/light-base/wire/per-milestone-diagnosis.md`). |

Numerical gates below are proposed light-line gates, not historical assertions. Optical floating-point comparisons allow absolute error≤1e−12 where stated; snapshot/ID/event/order equality is exact. Persist original arrays and compute all summary gates from saved evidence. Do not replace an original Hz metric with a number called “brightness spikes”. No harness is run by the present design task.

## Phased order and dependencies

### L0 — Freeze an independent copy of the accepted light core

Depends on: design freeze; no legacy runtime. Preserves M0's reproducibility/basic-state intent and the accepted optical baseline, not M0's LIF mechanism. The source baseline is `src/light-base-color-v2.mjs`, its two imports, and `out/light-base/p4b/REPORT.md`; the legacy M0 nature is documented in `out/light-base/wire/per-milestone-diagnosis.md`.

Acceptance:

- Explicit config N250/m6/eta.2/kappa.2/theta.3, sum/.05 and hill-q4-h1.5. Freeze code and verify the copied algorithm bodies against the accepted sources; zero legacy module imports.
- Reproduce the five-center,20-presentations/class, sigma.03 protocol without new input mapping. For color, require full J≥.8, five distinct attractors with pairwise J≤.2, half completion≥.9, C′≤.05, every near-J>far-J comparison, and exact source-only clearing. These are the accepted A/B/C′/D/E gates (`out/light-base/p4b/REPORT.md`).
- For saved reference inputs, reconstructed B agrees within1e−12 and membership exactly. Keep seed31 monochrome's recorded failure as a control; do not require a historically failing control to pass or erase it (`out/light-base/p4b/reference-results.json`).
- For all new fixture fields, max-product residual≤1e−12; B and rho within[0,1]; no channels means exactly unit sources and zeros elsewhere. One co-lit update from0 gives .2, a one-end update from.2 gives .192, neither-lit leaves it unchanged, and .3 exactly is unlit.

### L1 — Wrap the light attractor contract and B readout

Depends on L0. Preserves M1's cue/identity interface, M8 IO equivalence intent and the frozen-probe/state intent tested by `verify/io-equivalence.mjs`, `verify/brightness.mjs`; concrete assumptions are `src/io.mjs:119-154`, `src/readout.mjs:16-46` and wire's Q2–Q5/Q8 evidence.

Implement the common boundary from WIRING: stable input carriers, six-nearest physical clusters, per-carrier solve/max, explicit elementary color presentations, offline commits between immutable observation windows, optical freeze, half-open history, stable IDs and a **layer-level** in-memory save/restore. The latter is needed now for teacher readiness; full disk/pipeline persistence is L7.

Acceptance:

- For each of20 scripted source/strength segments per seed, B equals an independent composition of frozen-core solves within1e−12. Include simultaneous ports, source overlap, partial cues, blank input and amplitudes0/.001/.25/.5/1. Never promote a positive amplitude to unit readout strength.
- Pure source-scaled probes obey B(a)=a·B(1) within1e−12 for a single carrier. Multiple carriers obey pointwise max exactly; verify that the remaining cue retains its original carrier.
- Source-only blank-to-cue and cue-to-blank boundaries are exact at .5 ms IO resolution; every100 ms readout agrees with independent integration within1e−12. A single constant B=.25 is excluded by strict P7; B>.25 is included.
- One500 ms call and1000 calls of.5 ms produce exactly the same elementary presentation records, rho/color maps, clock and B history. K distinct carriers in a frame have the explicitly specified K updates; verify the `.8^K`/`.96^K` identities within1e−12. No implicit extra update at call boundaries.
- At least20 original input-frame records per mature catalogue entry; membership equals a saved20-replay recount exactly. No semantic labels enter core or candidate discovery; frozen probes mutate zero learned fields. Malformed layer restore leaves state byte-for-byte unchanged.
- No prototype can satisfy the gate using the old `.EE`, `.groups` or spike-array interface. All diagnostics use actual physical B/channel state.

### L2 — Replace sensory, motor and body level1 attractors

Depends on L1. Preserves M1 isolated recognition, M8 motor readiness and M12 body teaching intent. Existing curriculum and predicates are in `src/io.mjs:9`, `:35-75`, `:79-116`; the legacy 8/9 exact-six-member allowance is `src/io.mjs:7-8`, `:93-100` and does not define light morphology.

Keep500 ms on/300 ms off, rotating isolated group order,1000 ms settling and the12-epoch cap. Construct the same kind of light base for all roles. Readiness is evaluated through measured M2 catalogues and actual B, not six-cell learned membership equality. Under the default100 ms presentation cadence, a held cue contributes five recorded training frames per epoch; fewer than20 recorded frames cannot certify M2. Do not insert hidden training or enlarge the epoch cap.

Acceptance for1/2/3/5/9-group teachers at each seed and each applicable role:

- Every declared group has an unambiguous measured M2 readout mapping within12 epochs (for this new line the target is all9, not a synthetic adoption of the old8/9 waiver). M2 sets contain≥2 cells; no requirement says they must contain exactly6.
- Full J≥.8; half cue completion≥.9; P7 for half cue strictly>.5; pairwise J≤.2 for these isolated distinct-group fixtures; C′≤.05. Test all six rotated partial-source choices where the adapter has six source positions. Quarter/half/full completion is nondecreasing; report equality honestly when small cues already complete the area. The old strict quarter<half gate is morphology-specific (`src/io.mjs:62-63`), not evidence against the accepted complete light field.
- Ten blank100 ms settling windows have maxB=0 and zero P7 identities. No teacher probe changes learned state, replay buffer or curriculum position. Demonstrate all emitted members from saved replay fields, not teacher group indices.
- At least20 simultaneous/mixed-input probes have exclusive spill≤.05 and no spurious third group above P7=.25; report all shared lighting. If250-cell geometry cannot separate the port catalogue, stop this phase with capacity evidence; do not fit per-group positions or expand N.

### L3 — Keep TimeUnroll and rewire inter-copy channels

Depends on L2 plus the unchanged TimeUnroll copy. Preserves M2 onset-copy behavior and M3 temporal association intent (`verify/unroll.mjs:19-103`; `experiments/m3-pipeline.mjs:14-32`; `experiments/m3-causal.mjs:95-114`).

Install the `(A,k)` port map inside the higher N250 light layer, and replace GB exposure with explicit co-light elementary presentations. Do not change bins, timing, copied strengths or source guards. Orient diagnostic relations from older copy to newer copy; physical rho remains symmetric. Keep all9×IDs ports, including body and actual-action-copy IDs.

Acceptance:

- Run the boundary/collision/sustained/repeated-onset/state fixtures with B strengths .2/.4/.7/.9/1. All TimeUnroll entries and nine-column arrays match the existing arithmetic exactly. Verify age3000→k6 and expiry `12800·sqrt(2)` without rounding it to18 seconds.
- Saved before/after channels and elementary presentation logs recompute every rho/color update within1e−12. Frozen and neither-lit channels have zero update. Direction is derivable only from port/time metadata; zero directed physical channels and zero legacy traces exist.
- For20 A@k-only probes per trained relation, target-exclusive lighting≥.9 at B>.3, with≥3 identifiable target-exclusive cells; wrong/reverse-exclusive lighting≤.05. Clearing channels gives zero lit cells outside the actual source set. Port aliases and shared cells are listed, not excluded from results.
- In the30-trial causal/shuffled/distractor storm schedule, the mean target-exclusive B gain peaks at k6 and exceeds corresponding shuffled and distractor k6 gains by≥.05 per seed. Use the same environmental timing/counts (`src/world.mjs:16-41`). Log per-column co-lit/one-end exposure counts to expose any over-depression from sustained old copies.
- Any chosen encoding/cadence fallback must be selected on tuning seeds, refrozen and rechecked from L1. It does not alter TimeUnroll. Failure is not a reason to add eligibility traces or another temporal algorithm.

### L4 — Identify and read the higher light attractor

Depends on L3. Preserves M3's association/noncollapse intent and the same upper attractor mapping (`experiments/m3-pipeline.mjs:57-62`; `experiments/m3-causal.mjs:112-114`).

Use the **same** higher optical core's learned fields for level2 M2, not a second sequence classifier. A higher light area is the learned completion of the unrolled cue; all identification/replay is frozen. Generalize the existing five-class evaluation counter without importing class labels into runtime (`src/light-base-color-v2.mjs:62-94`).

Acceptance:

- Freeze five distinct temporal-pattern fixtures, including AB versus BA and shuffled controls. At least20 real training-frame records per discovered candidate; M2 counts exactly10/20 at strict B>.3. Candidate grouping is field-based and labels are attached only after discovery.
- On20 full/half probes per fixture: full J≥.8, half coverage≥.9, pairwise J≤.2, C′≤.05, and each temporal attractor contains<125 physical cells. This last bound preserves the existing “less than half the layer” noncollapse intent without E-cell counts.
- Higher P7 equals saved physical-field integration within1e−12; ≥18/20 full and half probes emit the expected measured ID at strength>.25, with zero unintended distinct-pattern IDs in the isolated fixtures.
- Exercise an additional instance with `level=3` through the same layer interface: zero legacy imports, same N250/core config and optical gates. This is a type/instantiation proof for every-layer light, not an invented higher-layer time curriculum; reuse the specified upper clock when that pipeline is built.

### L5 — Adapt prediction, novelty, three-factor and goal surfaces to B

Depends on L4; retain the readout/teacher interfaces already exercised in L1–L2. Preserves M4 forecast timing/selectivity, current M5 comparison role, M6/M7 calibration, M9/M10 goal control and M11 per-instance accounting. Source anchors: `src/predict.mjs:88-142`, `src/novelty.mjs:32-62`, `src/three-factor.mjs:19-28`, `:83-126`, `src/goals.mjs:62-144`. The historical learning-M APIs are obsolete (`out/light-base/wire/historical-api-findings.json`; `docs/m11h-event-learning.md:26-32`).

Default optical transduction: N_B=max(0,R_B−P_B), creation deadband .05; M_B=max(0,G_B−R_B); goal saturation z/(|z|+1). Preserve inclusive ±500 ms match windows, max contributors, first hit once, each miss once, exact-zero W deletion, generations, source guards, pending multiplication, goal depth3 and action gate.3. Do not multiply co-light eta by novelty or W. The only unavoidable local redesign is replacing the comparator's neural internals; no LIF comparator survives under a different name.

Acceptance:

- For R/P/G∈{0,.001,.1,.25,.5,.75,1}, comparator B values match the declared formulas within1e−12. Blank/matched inputs have N_B=0; residual≤.05 creates zero W connections; residual≥.1 with eligible distinct-time past input creates the expected existing-store connection, exactly once. No goal signal creates a prediction-learning connection.
- Across all11 arrival offsets−500..+500 ms, boundary hits settle without a miss; first-match credit equals the unchanged triangle within1e−12. Overlapping predictions remain independent; deleted/reborn generations share zero credit. Tests preserve the intent of `verify/prediction-consumption.mjs`, `verify/three-factor.mjs`, `verify/source-labels.mjs`, `verify/rule-store.mjs`.
-20 frozen next-item probes: arrival3200 ms at k6; timely and paired-real-onset match fractions≥.9; causal target forecast brightness≥5× each shuffled/distractor target with positive causal response. Preserve the actual source-onset launch and FutureSlices path, not just an optical completion demonstration (`experiments/m4-predict.mjs:25-41`).
- For the existing10 paired /60 omitted /60 recovery /30 jitter /30 alternating schedule (`experiments/m6-calibrate.mjs:25-30`), use B-derived target forecast strength F on fixed-strength source probes: F_omission60≤.1F_paired10 and less than F_omission30; F_recovery60≥.85F_paired10; F_jitter30≥.8F_paired10; mixed final F≤.95 initial F with negative full and last10 slopes. Require positive starting F. Report exact W-ledger deltas alongside these optical outcomes. Do not read nonexistent `deltas.hit` or reintroduce learning-M (`experiments/m6-calibrate.mjs:38-51`; wire historical-API evidence).
- Saturated/partial goal fixtures preserve cancellation before execution, graded pending suppression and recursion depth≤3, with zero hypothetical goals entering the past. Freeze leaves all optical channels and W unchanged while ledgers advance. Standalone comparator formula checks alone do not establish end-to-end goal success.

### L6 — Close the action/body/drive loop

Depends on L5 and all light sensory/motor/body layers. Preserves M8 execution/efference, M9/M10 goal chains and M12 innate-drive/source-label intent (`src/output.mjs:6-40`; `src/action-pipeline.mjs:23-33`; `src/interoception.mjs:25-50`; `src/body-changes.mjs:19-45`; `src/drive.mjs:25-46`).

Acceptance:

- Motor brightness at .75 executes; .749 and.001 do not. A sustained winner yields exactly one execution onset; each actual env action yields exactly one action-copy onset; zero weak/imagined output copies or forecasts arise from unsent actions. Keep tie order. Test20 trials each, not a rate inferred from spikes.
-10 episodes each of direct goals, two-step goals, innate body relief, relief ranking and external-goal override:≥9/10 correct first actions/outcomes; at setpoint10,000 ms yields zero deficit-driven actions. Rule eligibility remains W/.1≥.3, motor execution remains≥.75. These preserve the numeric behavioral intent in `experiments/m12-protocol.mjs:14-19`.
- Body bin/change evidence is derived from actual B P7; no raw reading bypass. Every change event has a decoded bin onset and trace age≤500 ms. Same-label same-time or missing-target-history cases create zero forbidden connections; valid distinct-time cases remain eligible (`src/source-labels.mjs:15-26`; `src/three-factor.mjs:97-125`).
- For fixed body/action teachers, each actually produced relief magnitude has a live causal rule above.3 normalized W and target forecast brightness≥5× the maximum noncausal target response on equal-strength probes. Keep the separate exact W ratio≥5 report because existing M12 asks for it (`experiments/m12-protocol.mjs:6`, `:19-20`); never substitute a sum-of-predictions ratio for a single-edge ratio.
- Reward off/on/positive/negative replays over60,000 ms have exactly identical B histories, channels, W and action events for identical sensory/body inputs; changing reward does not become a light source. The old counterfactual intent is `experiments/m12-protocol.mjs:11-13`. Use the second adapter's independent names/ranges/effects unchanged (`src/envs/two-quantities.mjs:1-20`).
- Light counterparts of old A8: zero blank-state light, isolated/mixed-group C′≤.05, no isolated teacher readout spanning all groups, and temporal area<125. Report actual lit-cell peaks/occupancy; do not enforce “≤6 active spikes” on a completed light attractor or manufacture growth-cap counters. Historical failure remains recorded (`docs/m12-codex-handoff.md:3-7`).

### L7 — Seal snapshots, caches and complete continuation

Depends on L6 plus L1 layer forks. Preserves M0/M1 resumability, frozen teacher probes and M11/M12 continuation. Old state shape/dependencies: `src/core/state.mjs:33-57`, `experiments/m8-cache.mjs:14-40`, `experiments/m12-state.mjs:10-28`; wire Q8 and missing JSON dependency qualification: `out/light-base/wire/REPORT.md`.

Acceptance:

- Full `light-line-v1` snapshot includes every field listed in WIRING persistence, including pending optical presentations, raw color samples, stable catalogue IDs, goals/drive/environment and future generations. Source closure includes config/JSON as well as modules; zero dependency on old caches.
- Fork at at least10 predetermined cuts: mid-IO segment, before/after optical commit, cue boundary, delayed future, first match, inclusive deadline, connection deletion/rebirth, pending action/goal and body trace. Resume each for100 windows. B arrays, rho/sample maps, M2 counts, IDs, ledger entries, W, action events and final snapshot equal uninterrupted execution exactly.
- At least12 malformed/incompatible cases spanning nonfinite/range violations, changed geometry/config, missing samples, inconsistent catalogue IDs, time/cursor mismatch, duplicate generations and old legacy/wire schemas are rejected atomically with zero live-state changes.
- Frozen-probe layer/pipeline snapshots restore learned/upper state exactly. No fake legacy neuronal fields, inferred histogram-to-sample reconstruction or silent state reset.

### L8 — End-to-end brightness acceptance and fresh final holdout

Depends on L0–L7 acceptance and immutable source/config/protocol freeze. Preserves the integrated M0–M12 intentions without requiring their spike predicates. Use current M11 event learning semantics (`docs/m11h-event-learning.md:14-22`) and current M12 source guards (`docs/m12-codex-handoff.md:9-13`), not obsolete historical imports.

Run all phase gates on7/19/31, including one continuous sensory→unroll→higher-light→future→goal→motor→environment→body loop, then the frozen final suite once on each of three freshly reserved seeds. For each seed require: all optical core/teacher/temporal gates,≥.9 timely prediction and goal/body success,≤.05 exclusive spill, zero blank/weak spurious actions, exact snapshot continuation, zero legacy runtime imports, and every counted learning change explained by saved records. Also preserve L5 extinction/recovery/jitter/mixed thresholds; final evidence is not just a short successful action trace.

Persist source/config/schedule hashes, source maps, full B/per-carrier fields and path witnesses, M2 replay fields/counts, shared/exclusive denominators, cross-copy exposure logs, channel/sample deltas, all future/ledger/action/body events, failures and per-seed decisions. An independent saved-field audit must reproduce100% of membership and acceptance decisions, with maximum arithmetic discrepancy≤1e−12. Keep causal and shuffled branches starting from byte-identical light teachers. No result from the old wire or legacy snapshots counts toward this acceptance.

## Milestone-intent coverage and deliberate exclusions

| Legacy milestone | Preserved intent and source/evidence | New phase / optical observation |
| --- | --- | --- |
| M0 | Reproducibility, valid state and continuation; old checks specifically exercise spiking core (`out/light-base/wire/per-milestone-diagnosis.md`, M0). | L0/L7: exact light core/state, B path invariants; no LIF equivalence claim. |
| M1 | Isolated learned recognition and cue completion (`src/io.mjs:35-116`; `verify/layer.mjs`). | L1/L2: M2/B/P7/separation/quiet; no IE rates or exact-six-member rule. |
| M2 | Exact onset copying, collisions and expiry (`verify/unroll.mjs:19-103`). | L3: same algorithms and exact B-strength arrays. |
| M3 | Delayed association above matched controls and no collapse (`experiments/m3-causal.mjs:95-114`). | L3/L4: nine-column B response profiles, M2 temporal areas. |
| M4 | Timely, selective, graded prediction (`experiments/m4-predict.mjs:25-41`). | L5: actual future B strength/timing plus optical completion evidence. |
| M5 | Reality/prediction comparison; historical learning-M imports are obsolete (`out/light-base/wire/historical-api-findings.json`). | L5: B novelty and same inclusive per-prediction match ledger; retain separate goal comparator role. |
| M6/M7 | Extinction, recovery, jitter and mixed hit/miss calibration (`experiments/m6-calibrate.mjs:25-51`; `experiments/m7b-mixed.mjs:3-9`). | L5/L8: brightness forecast trajectories plus exact current delta audit; no nonexistent hit field. |
| M8 | Real executed actions, proper copies and subthreshold silence (`src/output.mjs:26-40`; `src/io.mjs:138-145`; `verify/output.mjs`). | L2/L6: motor B threshold and action/copy correspondence. |
| M9/M10 | Persistent goals, bounded subgoals, cancellation and pending hold (`src/goals.mjs:62-144`; `experiments/m9-pipeline.mjs:38-55`). | L5/L6: same control flow with light comparisons, chains and no imaginary past events. |
| M11 | Per-instance credit, generations, omission/recovery and online action continuation (`docs/m11h-event-learning.md:14-32`; `src/three-factor.mjs:83-126`). | L5/L7/L8: B-driven creation, unchanged W ledger, exact continuation. |
| M12 | Body coding, ordinary causal learning, relief ranking/override, reward independence and source guards (`experiments/m12-protocol.mjs:6-28`). | L6/L8: body/motor fields, actual relief, equal counterfactual replays; no legacy growth/spike-cap metric. |

Do not interpret wire's M4 prerequisite completion, isolated teacher pass or novelty component pass as a completed phase here. Actual blockers and incomplete native stages are retained in `out/light-base/wire/milestone-results.md`, `per-milestone-diagnosis.md` and `test-results.md`. The fresh design replaces those coupled observation surfaces; it does not edit or reinterpret their sealed evidence.

## Review boundaries before implementation

Four defaults need explicit recording in the future configuration: multi-carrier encoding and its K-update dose; fixed100 ms optical presentation cadence; replay-based unlabeled M2 catalogue discovery; B comparator/deadband/saturation units. Their questions are listed in ARCH-QUESTIONS. If a choice changes, refreeze only the affected interface and repeat its dependent phase gates. None of these choices permits reopening the independent line, every-layer light or existing temporal unroll.

This design task writes only the three requested documents under `out/light-line/design/`. It does not create this proposed source/test tree, change package.json, run acceptance, change existing evidence, commit or push.
