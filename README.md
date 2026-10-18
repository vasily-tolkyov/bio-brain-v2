# bio-brain-v2

Plain Node.js >=20 ESM, with no dependencies or build step. Run `npm test`.

See [Architecture](ARCHITECTURE.md) for the implementation map and data flow.

M11c graded prediction now uses continuous downward weights from zero, with
online STDP coupling, N/hit strengthening and deadline-only M weakening.
The layer-wide constants are `wMax=0.1`, `kappa=0.05`, `etaM=0.25`, and goal gain
`3`; prediction eligibility traces onset activation. U shares those same weights.
The `1e-4` floor is used only to save prediction scheduling work. Gate5 consumption,
analytic deadbands, motor WTA and its execution threshold are preserved.
Implementation tests pass: 98/98 in 27.67 s. Behavioral acceptance fails, including
the total-strengthening asymmetry bound and false-rule/goal controls.
See [the M11c report](docs/m11c-graded.md) for all three seeds and reproduction.
Earlier milestone sections below describe historical implementations; M11c
supersedes their rule admission, snapshot retention and target normalization.

The authoritative design is [docs/multilayer-architecture-narrative.md](docs/multilayer-architecture-narrative.md).
The [reuse map](docs/new-project-reuse-map.md) guides ports. The old repositories
`/workspace/bio-brain` and `/workspace/bio-brain-inputlayer` are read-only references.

M0 provides resumable randomness, LIF neurons, depressing AMPA/NMDA/GABA and slow
synapses, sparse spiking networks, Vogels iSTDP, and atomic checkpoints.
Time is in ms, rates in Hz, voltage in mV, current in pA, conductance in nS.
Synaptic conductance is integrated implicitly so strong inhibition approaches
its reversal without numerical overshoot; current-only LIF retains its M0 update.

Construct `SpikingNetwork({pops: [{name, n, p}], seed, dt})`; `p` overrides LIF
parameters. `connect({from, to, p, ...})` uses independent edge probability;
`inDegree` instead sets expected incoming degree (Bernoulli wiring, excluding
autapses by default). Explicit global neuron ID `pairs` are also supported.
`step({extra: t => currents, rate: (i, t) => hz})` advances one tick;
`run(ms, options)` advances an integral number of ticks. Inputs are supplied by
the caller and must be supplied again after resuming.

Set a connection group's `frozen = true`, or pass `learn: false`, to pause weight
updates while neural dynamics and traces continue. `saveState()` / `loadState()`
restore full state into an identically wired network; `saveCheckpoint(file, net)`
and `loadCheckpoint(file, net)` persist it using an atomic rename.

M1 adds `AttractorLayer` in `src/layer.mjs`. Construct it with `{n: 24, R: 3, seed: 1}`:
`n` counts input lines. The default `level: 1` has one E cell per line;
`level: 2` has three, each with independent Poisson fibers. I size is derived
from E size. Recurrent wiring has no pattern labels. GB_NMDA calcium STDP
learns E→E associations, and Vogels iSTDP learns the I→E wall. Replicas have the
same topology, independent noise, and average both sets of plastic weights every
10 ms, including across separate `run` calls. `LAYER1` and `LAYER2` are module
constants, shared by every feature, time column and seed. Layer 1 restores its
3 Hz wall target and uses STDP acceleration 0.2. Layer 2 uses acceleration 1,
EE scale cap 2, expected EE degree 30, E→I scale 5, initial I→E scale 6 and a
0.1 Hz wall target. Both layers use the normal 2 ms E refractory period.
Layer 2 uses afferent scale 6. LTP requires that directed synapse's presynaptic
NMDA trace exceed 0.01 (a single spike remains eligible for about 184 ms).
This prevents post-only bursts from potentiating a silent input while retaining
bidirectional coincidence learning. M10c also protects dormant layer-2 edges
from depression and bistable drift using that same pre-trace threshold. The
active-pre rule and layer-1 plasticity stay unchanged; calcium/traces always advance.

Call `layer.run(ms, strengths, {learn: true})` repeatedly to train; `strengths` has
`n` entries in [0,1], and omitted input means silence. Durations must be multiples
of the fixed 0.5 ms tick. `layer.identify()` registers undirected components of
recurrent edges with normalized efficacy `rho > 0.4`, excluding isolated cells.
It returns `[{id, members}]` with local E indices and the smallest member as ID.

The official output is `layer.readout(start, {windowMs: 100, litThreshold: 0.25})`.
Run the complete window first, normally with `{learn: false}` for probes. For
`[start, start + windowMs)`, it returns `[{id, strength}]` above the lit threshold:
each strength is the fraction of members firing at least once, averaged across
replicas. Repeated spikes do not increase a member's contribution. Cue completion
can saturate strength at 1; residual activity may persist briefly after input ends.

The core now also accepts `{source: true}` populations driven directly by `rate`
and `connect({stdp: true, ...})` for excitatory calcium plasticity; an STDP object
can supply the per-layer `sMax` and `accel`. Checkpoints include those parameters,
calcium, delayed arrivals, and NMDA traces. `npm test` runs M0–M10;
`node verify/m3-dynamics.mjs` runs the deterministic bug regressions separately.
Later milestones are not implemented; time-slice copying and episodic bookkeeping
belong outside the per-tick loop.

M2 adds `TimeUnroll` in `src/unroll.mjs`: construct with an attractor count (IDs
0…n−1) or an ordered array of IDs. Call `update(tMs, litList)` once per 100 ms
P7 readout window, outside the tick loop; entries accept `{id, strength}` or
`{index, strength}`. Only newly lit attractors create onsets, stamped with `tMs`.
For onset age `a`, column 0 holds `a < 100/√2` ms; columns 1…8 hold
`d/√2 ≤ a < d*√2`, with centres `d = 100*2^(column−1)` ms. Entries expire at
`12800*√2` ms. Each onset keeps its strength; simultaneous entries in a cell
combine by max. `lines(tMs)` returns a `Float64Array` indexed by
`attrIndex*9 + column`, ready for the next layer's `run` input. Times must be
at least the last update time. `saveState()` / `loadState()` restore entries and
onset detection into a module with the same ordered IDs.

M3 adds the minimal storm world in `src/world.mjs` and the two-layer experiment
`node experiments/m3-causal.mjs` (separate from `npm test`). Six fixed input lines
per feature drive an 18-line layer. The teacher presents each group alone using
M1's 500 ms / 300 ms protocol until three complete attractors are identified
(at most 12 epochs). Both layers use their own module constants. In M7,
layer-2 static STDP is gated per 100 ms window by the total N-spike trace
(400 ms decay, threshold >1); its wall iSTDP keeps learning continuously.
Layer 1 retains three replicas for P7; layer 2 uses one replica because M3 reads
its weights rather than a completion probability, spending runtime on more trials.
This reduces upper-layer noise averaging; the three matched seeds still expose
variation, and upstream P7 retains its original replica count.
Feature IDs remain fixed for P7 during the world; final layer-1
membership is also recorded to reveal any drift. Every 100 ms, P7 feeds
`TimeUnroll.update(t, lit).lines(t)` and then the 27-line, 81-E-cell second layer for 100 ms.
Time labels use window starts. World edges are presented exactly at 0.5 ms ticks.
Onset bookkeeping and spike-log cleanup stay outside the spiking loop.
Profiles pool all existing edges between the E cells of the two input lines.
The three evaluated seed topologies provide 2–11 edges per measured pair
(mean 6.35), with no missing pairs; the old single-cell representation had 0–2.

The world preserves the reference's 100/2000/200 ms lightning/thunder/bird
durations, fixed 3000 ms causal delay, 50% bird probability, uniform 0–10 s bird
timing. Both conditions additionally randomize lightning
within a 10 s onset interval in each slot. Shuffled thunder uses a
separate random onset with the same marginal distribution as causal thunder,
allowing either order. Paired worlds have identical lightning, birds, durations,
counts and trial boundaries. Each slot ends 20 s after the later last event end
in the two schedules. This trims the empty slot tail and rest jitter while
exceeding M2's actual 18.1 s expiry. Every neural tick, including quiet gaps, is
simulated; trial boundaries never reset the networks or time unroll.

The experiment uses seeds 7, 19, 31 and 30 trials per world, with a 30 minute
runtime budget. It writes `out/m3/<timestamp>/results.json` and `results.md`,
including all nine learned changes `Δrho = rho_end − rho_main_start` for
lightning→thunder, bird→thunder and thunder→lightning, per-column paired
causal-minus-shuffled differences, peak columns, and layer-2 components as
`feature@col`. Each value averages existing edges in both directions;
missing edges are `null`, with edge counts reported. Initial existing edges
all have `rho = 0.01`, so baseline subtraction does not change peak locations.
Causal and shuffled runs restore the same teacher state and start with identical
layer-2 weights. JSON also retains per-trial profiles and input/joint exposure.

No bin-dwell normalization is applied: bounded, nonlinear `rho` is not an event
count. At 100 ms input holding, col 6 lasts 2.3 s per onset and col 0 lasts 0.1 s;
independent input does not imply flat learned weights. Acceptance requires a
col-6 forward Δrho peak in every causal seed, col-6 separation of at least 0.05
rho from both matched shuffled and causal bird controls in every seed, and no
single peak shared by all seeds in each control profile. Layer 1 must retain its
three exact teacher groups in every run. The layer-2 collapse check requires
every component to contain fewer than half of its 81 E cells. The learning
result is reported honestly, not enforced by the smoke test. That
test uses two compact trials and checks P7, indexing, shapes and col-6/col-0
co-activity; it does not assert a learned rule. No later milestones are included.

Iteration 2 **failed acceptance**: 30 trials × 3 matched seeds × 2 worlds
finished in 1763.08 s (29.38 min); causal Δrho peaks were columns 0, 8, 2.
No seed met both 0.05 col-6 margins. All 90 intended causal onset overlaps were
present. Seed 7 merged its input groups; seeds 19 and 31 kept them separate but
their strongest upper-layer pairs had zero joint input exposure. All three
causal upper layers formed 24-cell strong-edge components. The 1 Hz wall target
was insufficient in that run. Full profiles, paired
differences, counts and diagnosis are in
[the iteration-2 report](out/m3/2026-10-16T18-45-31.730Z/results.md).
Its M0–M3 checks passed (34/34, 16.38 s); its smoke test did not assert learning.

M3c's bug hunt reproduced two distinct problems before fixing them. Disjoint
input presentations produced cross-line rho 0.258995 with zero uncued spikes,
unchanged with recurrent transmission disabled: post-only bursts alone can
potentiate GB_NMDA (rho 0.309582 at 40 Hz versus 0.002456 at 20 Hz). The layer-2
refractory limit originally prevented that rate regime; M3.1 replaces it with
the per-synapse presynaptic-trace gate above. Separately, 21 inhibitory cells
firing once drove an unstimulated E cell to -112.771 mV and generated four false
E spikes through Euler overshoot. Implicit conductance integration gives zero
E spikes and a minimum of -74.949 mV in the same test. The regressions also cover
silent activity, independent replica traces, checkpoints, ID/line mapping and
independent flatten/baseline buffers.

Every neural tick, including rests, still runs. Caching constant source rates,
updating only the iSTDP traces used by each group, and flushing receptor/calcium
tails below 1e-300 avoid wasted work and slow subnormal arithmetic. The isolated
optimization audit preserved spikes, weights, RNG and all consequential state;
only residual tails of at most 2e-322 differed. No later milestone is implemented.

M3c **passes acceptance**: 30 trials × 3 paired seeds × 2 worlds in 790.23 s
(13.17 min). The [final report](out/m3/2026-10-16T20-43-19.825Z/results.md)
contains every profile, paired difference, component and acceptance flag.

| Seed | Causal L→T Δrho@6 | Shuffled L→T Δrho@6 | Causal bird→T Δrho@6 | Causal/shuffled L→T peaks | Largest L2 component, causal/shuffled |
| --- | --- | --- | --- | --- | --- |
| 7 | 0.1978 | 0.0286 | 0.0052 | 6 / 7 | 36 / 30 of 81 |
| 19 | 0.2093 | 0.0453 | -0.0063 | 6 / 6 | 33 / 25 of 81 |
| 31 | 0.1788 | 0.0108 | 0.0032 | 6 / 7 | 30 / 27 of 81 |

Minimum col-6 margins: 0.1640 over shuffled and 0.1756 over bird, versus the
fixed requirement 0.05. Bird peaks are 3/7/6 in causal worlds and 7/6/6 in
shuffled worlds. Every run retains three six-cell layer-1 groups. All 90 intended
causal onset overlaps occur. All 95 measured profile columns with zero joint
input windows lose weight (largest Δrho -0.006354). The
[saved audit](out/m3/2026-10-16T20-43-19.825Z/audit.json) checks all 180 snapshots,
deltas, paired schedules, baselines and component criteria.

M3c `npm test`: **42/42 passed**, M0/M1/M2/M3 PASS, **15.83 s**.

M3.1 **passes the same acceptance criteria** with per-synapse presynaptic-gated
LTP and the normal 2 ms refractory period. The only other parameter change is
layer-2 afferent scale 8 → 6: at 2 ms, scale 8 caused pre-only calcium buildup
in the generic disjoint-input regression (max cross-line rho 0.037369); scale 6
keeps drive effective (646 spikes) with zero uncued spikes and max rho 0.009026.
No other plasticity terms, M2 bins, P7 readout, or acceptance criteria changed.

The [M3.1 report](out/m3/2026-10-17T04-17-13.485Z/results.md) covers
30 trials × 3 paired seeds × 2 worlds in **842.12 s (14.04 min)**.

| Seed | Causal L→T Δrho@6 | Shuffled L→T Δrho@6 | Causal bird→T Δrho@6 | Margin vs shuffled / bird | Largest L2 component, causal/shuffled |
| --- | --- | --- | --- | --- | --- |
| 7 | 0.1431 | 0.0068 | 0.0037 | 0.1363 / 0.1394 | 24 / 21 of 81 |
| 19 | 0.1385 | 0.0395 | -0.0052 | 0.0991 / 0.1438 | 20 / 21 of 81 |
| 31 | 0.1262 | 0.0085 | 0.0056 | 0.1176 / 0.1205 | 21 / 21 of 81 |

Every causal peak is column 6. Shuffled L→T peaks are 7/6/7; bird peaks are
2/8/6 in causal worlds and 4/6/5 in shuffled worlds. Every run retains the
three six-cell layer-1 groups, and all 90 causal onset overlaps occur. The
[audit](out/m3/2026-10-17T04-17-13.485Z/audit.json) independently checks all six
acceptance criteria, 180 trial snapshots, deltas, baselines and paired schedules.
All 96 zero-joint-exposure profile columns lose weight (largest Δrho -0.003175).

M3.1 `npm test`: **44/44 passed** in **14.41 s** (M0 10, M1 13, M2 8,
M3 dynamics 9, M3 pipeline 4). Regressions cover 20/40/200 Hz post-only drive
with silent pre in either direction, simultaneous bidirectional potentiation
(rho 0.616770 each way), and an expired presynaptic trace under later post-only
bursts. All three new regression scenarios failed against the original rule.

M4 adds downward bookkeeping in `src/predict.mjs`, outside every neural tick.
Copy layer-2 EE `rho` arrays at learning start, then call
`readDownward(layer2, baseline, orderedAttractorIds)`: mean
`max(0, rho_end - rho_start)` over existing **directed A@k → B@0** edges and
replicas, k=1…8, A≠B. Missing wiring has no entry. `maxW` is the largest eligible
directed mean in that learned layer.

M4b replaces the fixed gain floor with `threshold = mean(W) + K*SD(W)`.
The noise reference contains **all wired cross-attractor A@k → B@0 columns** in
that same learned layer, equally weighted, including zero gains. Distinct rows
provide a generic background population; no feature labels, selected delay,
shuffled run or probe outcome select its members. Real rules remain in the pool
and conservatively raise the cutoff. SD is the population standard deviation;
`readDownward` returns `{noise: {count, mean, sd}, threshold, maxW, weights}`.
Only `W > threshold` triggers. An empty pool or uniform weights triggers nothing.

`LAYER2.downNoiseK = 5` is one fixed per-layer constant: a conservative
five-standard-deviation contrast because an onset tests multiple target/delay
columns. There is no parameter sweep, per-scene/seed setting, absolute gain
floor or edge-support gate. This is an empirical contrast, not a Gaussian
false-positive probability. Median/MAD would both be zero in these sparse
matrices. Keeping true rules in the reference sacrifices sensitivity: a small
pool or many strong rules can suppress predictions. Multiplying all learned
gains by a common positive factor preserves selection and graded strength.

Construct `new FutureSlices(ids, downward)`; call `update(t, lit, p7)` every
100 ms. `lit` is thresholded P7; optional full `p7` (read with `litThreshold: 0`)
includes sub-threshold reality strengths. Its `past` is an unchanged `TimeUnroll`
of observed onsets. Each onset triggers all qualifying rules with strength
`min(1, onsetStrength * W/maxW)` and arrival `tOnset + 100*2**(k-1)`.
Entries retain `{A, B, k, ruleKey, strength, tOnset, tArrive}` for credit assignment.

`lines(t)` mirrors `TimeUnroll` bins using remaining time. Entries enter col 0
and `arrivals` on the first update with remaining < `100/√2` ms, then leave the
pending entries. `created` exposes new predictions. `records` exposes
`{t, B, predStrength, realStrength, entries}`: simultaneous arrivals use max but
retain every source; reality uses max P7 in the arrival window ±100 ms. Records
finalize after the next observation. Unpredicted reality onsets also get records.
`saveState()` / `loadState()` preserve weights, onsets and pending comparisons.
Predictions never enter past rows or STDP. M5 adds spiking N/M; M6/M7 add
downward calibration and hit reinforcement, described in
[the calibration report](docs/m6-calibration.md).

Run `node experiments/m4-predict.mjs`; `node experiments/m4-learning.mjs` can
prepopulate its `out/m4-cache/` with exact M3 states and per-edge baselines.
A learning-source hash rejects stale caches. Frozen probes continuously simulate
layer 1 in 25 s slots: 10 lightning-only, 10 lightning+thunder(+3 s), 10 bird-only
trials per world. Layer 2 supplies fixed weights; both layers are checked unchanged.
`out/m4/<timestamp>/results.{md,json}` retain weights and all onset/prediction/
comparison evidence. This separate experiment exits nonzero on failed acceptance.
The ±300 ms acceptance match and ±100 ms comparison coincidence are reported
separately; the col-6 centre stays 3200 ms. `npm test` includes the fast M4 checks.

M4a **failed full acceptance**: [report](out/m4/2026-10-17T04-53-41.928Z/results.md).
All three causal seeds predict thunder exactly once per lightning onset, at
3200 ms in 60/60 probes; all 30 actual thunder onsets match within ±300 ms.
Bird produces 0/60 thunder predictions. Shuffled seeds 19/31 produce none, but
seed 7 produces predictions in 20/20 lightning probes at 6400 ms: its directed
col-7 gain 0.054313 exceeds the fixed 0.05 threshold. No parameters were retuned.
Both layers' weights stay frozen. All 162 M3 profile values reproduce exactly;
the record audit passes. `npm test`: **51/51 passed, 13.77 s**.

M4b retains the causal timing/matching criteria and requires bird-only trials
with any predictions to stay below 10%. For shuffled learning, prefer no
predictions; require total prediction strength per lightning probe to be at most
0.2 times causal, separately for each seed. Sum all created strengths across all
sources, targets and delays, before max pooling, over lightning-only and paired
trials; divide by their combined trial count. Bird trials do not dilute this
ratio. Error-based pruning remains outside M4.

M4b **passes**: [report](out/m4/2026-10-17T05-08-23.881Z/results.md).
The 30-trial learning caches were regenerated because the layer source hash
changed. The [audit](out/m4/2026-10-17T05-08-23.881Z/audit.json) confirms all six
complete learned states and all causal prediction traces exactly reproduce M4a.

| Seed | Threshold causal / shuffled | Causal probes at 3200 ms | Thunder onsets matched ±300 ms | Bird trials with any prediction (both worlds) | Shuffled lightning probes with any prediction | Strength/probe causal / shuffled; ratio |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.143245 / 0.078109 | 20/20 | 10/10 | 0/20 | 0/20 | 1 / 0; 0 |
| 19 | 0.133238 / 0.042247 | 20/20 | 10/10 | 0/20 | 0/20 | 1 / 0; 0 |
| 31 | 0.073736 / 0.050386 | 20/20 | 10/10 | 0/20 | 0/20 | 1 / 0; 0 |

All 90 shuffled probes produce no predictions at any target/delay. Frozen-weight
checks pass in every run. `npm test`: **52/52 passed in 15.11 s**, including the
synthetic clear-peak/noise-only and common-gain-rescaling regression.

M8 adds the fixed environment boundary in `src/io.mjs`. An environment is a
plain object, with stable ordered names and one function:

```js
const env = {
  features: ['tone', 'shape'],
  actions: ['turn', 'jump'],
  step(ms, action = null) {
    // Apply this primitive once at the current interval's start.
    // Return strengths at that start, then advance the environment by ms.
    return { features: { tone: 0.8, shape: 0 } };
  },
};
```

`ms` is positive and a multiple of 0.5 ms. `action` is a declared name or
`null`; null advances time without issuing a command. Feature strengths are
finite numbers in [0,1]; omitted declared features mean zero. Unknown names
are rejected. The core samples every 0.5 ms and batches identical inputs into
`AttractorLayer.run` calls, preserving exact stimulus edges. Adapters can
internally buffer external observations and translate primitive commands.
Replacing the environment changes no layer, unroll, prediction, error,
three-factor, or motor implementation. There is no registry or adapter base
class. Interoception will later be one additional field in the returned object.

`stormWorld()` now returns this interface alongside schedule metadata used
only by experiment reports. `stormEnv(events, start)` adapts the existing
frozen probe schedules. M3–M7 experiment paths use the shared input boundary.
`verify/io-equivalence.mjs` compares 54 short-run windows against the old
event-boundary presenter, including fractional-ms edges: P7, full neural/RNG
state, weights, N/M, surprise gate and time unroll must match exactly.

`new OutputLayer(env.actions, seed)` uses the same `AttractorLayer` and isolated
500 ms / 300 ms teacher protocol as sensory input, six lines per action.
The teacher identifies learned groups; it does not prewire associations.
`output.step(drive)` takes a `Float64Array` in action order, holds it for one
100 ms window, and reads P7. Existing layer inhibition plus readout argmax
selects one winner; equal strengths keep action order. The fixed motor
`OUTPUT.thetaExec = 0.75` applies to the **P7 winner strength**, not raw drive.
Subthreshold winners return `action: null`. Motor weights freeze after the
teacher phase. A sustained executed winner emits only its onset; it can
execute again after falling below threshold or another winner intervenes.
Each learned motor attractor maps to its environment action name; richer
primitive sequences belong inside the adapter.

`stepIO({env, layer1, output, unroll}, t, drive)` executes the selected onset
through `env.step` and places its efference copy into the same `TimeUnroll`
as the observed P7 onsets. Ordered IDs are sensory attractor IDs first, then
`action:<name>` for each action in environment order. Flattening remains
`row*9 + column`: observation rows occupy `[0, nObs*9)` and action rows follow
at `(nObs + actionIndex)*9 + column`. Namespaced action IDs cannot collide
with sensory neuron IDs. Copies retain executed P7 strength. Suppressed or
subthreshold candidates never create action onsets. Bookkeeping runs once
per 100 ms window, outside all spiking loops. Future prediction rows retain
their existing separate storage; M9 adds the separate goal branch below.

Run `node experiments/m8-actions.mjs` for three seeds (7, 19, 31), each with
30 slots in causal and shuffled environments. Each slot has one press, wave
and idle teacher drive at random separated times, plus an independently timed
bird distractor. Press causes light after 3000 ms; wave causes bell after
1000 ms; idle has no sensory effect. Shuffled light/bell times are independent
of commands with equal counts. The motor, sensory and second layers run
continuously, including rests. Layer 2 retains the M7 STDP and N gate, now
over observation and executed-action onsets. Reports contain all nine-column
Δrho profiles, edge counts, exposure, execution/copy logs and per-seed margins.
Column 4 has centre 800 ms and covers [565.685,1131.371) ms; column 6 has
centre 3200 ms and covers [2262.742,4525.483) ms. Acceptance requires both
correct causal peaks and margins ≥0.05 over matched shuffled and cross/bird
controls at those columns, exact execution/copy counts, and no weak-drive
execution or copies.

M8 **passes all three seeds**: [full report](out/m8/2026-10-17T09-11-44.658Z/results.md),
**1879.57 s (31.33 min)** for six continuous runs, 30 slots per run.
Margins below are at the specified column; the cross/bird margin is the
minimum over press→bell, wave→light and bird→light at that column.

| Seed | Rule | Peak | Causal Δrho | Shuffled Δrho | Margin vs shuffled | Min margin vs cross/bird |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | press→light | 6 | 0.1032 | 0.0193 | 0.0839 | 0.0858 |
| 7 | wave→bell | 4 | 0.1399 | 0.0063 | 0.1335 | 0.1457 |
| 19 | press→light | 6 | 0.0997 | 0.0100 | 0.0897 | 0.0599 |
| 19 | wave→bell | 4 | 0.1472 | -0.0058 | 0.1530 | 0.1529 |
| 31 | press→light | 6 | 0.1137 | 0.0109 | 0.1028 | 0.0950 |
| 31 | wave→bell | 4 | 0.0738 | -0.0058 | 0.0796 | 0.0611 |

The [saved audit](out/m8/2026-10-17T09-11-44.658Z/audit.json) checks 180 trial
snapshots and 8100 profile-column deltas. All 180 intended causal overlaps
occur. Every run has exactly 90 executions and 90 matching efference copies
(540 total), with no extra action onsets. Ten subsequent 100 ms windows of
0.001 drive on every motor input produce zero env actions and zero copies in
every run. The fast tests separately check a positive P7 winner just below
the 0.75 execution threshold and equality at the threshold. Every sensory
event is detected, and all sensory/motor teachers retain their three exact
six-cell groups. Full M3–M7 reruns were unnecessary: the short deterministic
storm equivalence check and M3 smoke both pass.

Final [test output](out/m8/2026-10-17T09-11-44.658Z/tests.txt): **77/77 checks
pass, M0–M8 PASS, 22.57 s** (under the 30 s M8 suite limit).

M9 adds `GoalRow` in `src/predict.mjs` and `GoalActions` in `src/goals.mjs`.
The caller writes a sensory attractor ID and strength with
`goal.goals.write(id, strength)`. This future branch persists without a timeout;
only an observed reality onset or `goal.goals.cancel(id)` removes an entry.
It is never passed to `TimeUnroll`, sensory input, prediction eligibility, or
STDP. `SpikingErrors.stepGoals` runs a second instance of the M5 circuit:
goal afferents excite M, reality afferents inhibit M through the same slow
synapses and afferent-gated Vogels iSTDP. Raw population spikes per 100 ms
are `E_goal`; these counts are distinct from prediction N/M.

**Supervisor decisions for §10.1 B9/B10 and §11.2–11.4:** upward indexing reads
the same downward weight objects, with `U[X ← A,k] = W[A→X][k]`; it has no
independent learning. Only namespaced ACTION-row preconditions map to motors.
Observation-row preconditions contribute nothing in M9. For each goal,
`E_eff = E_goal * (1 - clip(max pending prediction strength))`, then
`motorDrive[a] = clip(sum_X,k sat(E_eff[X]) * W[a→X][k] / maxW)`.
These are the original M9 equations: M10b below uses a per-target motor
denominator, and M10c holds `E_eff=0` while a matching outcome is pending.
This uses the existing `sat` and all stored delay weights, without selecting
a rule by its feature name. A missing/zero store produces zero drive.
`readActionRules` initializes this shared store from both directions of each
M8 `A@k/B@0` binding (M8's verified rule readout), clipping the joint signed
edge-gain mean at zero after averaging, with the unchanged `mean + 5*SD` noise
cutoff. Clipping individual edges first would inflate the M8 noise reference.
Only admitted rules enter W/U; raw noise candidates are not predictive connections. M4's original
one-direction readout remains unchanged. The distinction matters: in seed 7
the one-direction reader misses press→light, while indexing all raw noise
candidates produces bird→idle actions. No neural weights or parameters change.
Pending covers prediction creation through M5's existing arrival + 500 ms
deadline, including the transition out of future bins. This preserves the
existing tolerance for quantized learned delays. Suppression leaves the goal
present until reality arrives. Cancellation and satisfaction also gate any
residual goal-M spikes out of motor drive.

`experiments/m9-pipeline.mjs` connects this to the unchanged M8 output layer
and environment interface. Each window executes the previous goal-M window's
drive, samples reality, writes only executed efference copies, creates downward
predictions, satisfies goals, and computes the next drive. All bookkeeping is
outside the spiking loop. **Supervisor's simplest rehearsal choice (§11.7):**
a sub-threshold result writes nothing, including no imagined prediction.
The environment still advances through null-action samples. Sensory/motor
learning, prediction/goal iSTDP, and three-factor weight changes are frozen
during probes; layer 2 supplies its stored rules without further learning.

Run `node experiments/m9-goals.mjs`. On a cache miss,
`experiments/m8-cache.mjs` replays the unchanged 30-slot M8 causal teacher
for seeds 7, 19, 31 and saves full neural states and per-edge baselines in
`out/m8-cache/`, protected by a training-source hash. Reports alone cannot
reconstruct those states. Before probes, only the new goal comparator learns
from 24 synthetic all-feature trials (500 ms goal, 100 ms paired reality,
5 s rest). This calibration sees no environment, action identities or rules.
Each seed then runs 20 light and 20 bell goals plus 10 no-goal and 10 bird-goal
controls, 8 s each, with continuous neural dynamics and independent bird
onsets. Unresolved goals are explicitly cancelled by the caller at probe end.
The report checks every execution against past action onsets and compares all
layer, motor, downward and comparator weights before/after frozen probes.
M9 did not include subgoals, recursive planning or imagined feedback.

M9 **passes all three seeds**: [full report](out/m9/2026-10-17T10-11-20.736Z/results.md),
**248.15 s** from cached M8 states. The one-time causal cache replay took
**938.46 s** total. The [replay audit](out/m9/2026-10-17T10-11-20.736Z/replay-audit.json)
matches all five accepted M8 rule profiles exactly for every seed.

| Seed | Light→press first | Bell→wave first | Mean latency light / bell | Actions per light/bell probe | Raw goal-M/window after onset, light / bell |
| --- | --- | --- | --- | --- | --- |
| 7 | 20/20 | 20/20 | 150 / 100 ms | 1 / 1 | 0.0619 / 0.0217 |
| 19 | 20/20 | 20/20 | 180 / 100 ms | 1 / 1 | 0.0415 / 0.0072 |
| 31 | 20/20 | 20/20 | 100 / 180 ms | 1 / 1 | 0.0306 / 0.0440 |

Every seed: zero distractor actions; zero actions in all ten no-goal and ten
bird-goal probes; zero actions after satisfaction. The raw goal-M rates above
include brief synaptic tails in the reality-onset window; every later window
has exactly zero spikes. There are **120 executions and 120 matching past-row
action onsets** overall, and all frozen-weight comparisons pass.
The [audit](out/m9/2026-10-17T10-11-20.736Z/audit.json) retains admitted-rule margins:
seed 31's wave→bell is only 0.000060 above the unchanged noise cutoff; the
acceptance result covers these three frozen learned states.

Final [test output](out/m9/2026-10-17T10-11-20.736Z/tests.txt):
**83/83 checks pass, M0–M9 PASS, 22.89 s**, below the 30 s suite limit.

M10 adds bounded observation-precondition recursion to `src/goals.mjs`.
If no admitted action precondition exists, the strongest admitted observation
precondition becomes a persistent `SUBGOAL`, with strength `parent * U/maxW`.
Links record the parent and depth; the maximum stack has three goals including
the root, and no feature is added twice. A child's reality onset clears its
goal while its satisfied link remains until the parent clears. The parent
waits for its own reality onset; cancellation removes remaining descendants
before queued motor drive is used. Goals and links remain outside past rows,
STDP and the neural tick loop. M9 goal-M, pending suppression and rehearsal
behavior are unchanged.

`chainEnv` in `src/envs/actions.mjs` keeps the existing environment interface.
T1 has random teacher actions: press causes light after 3000 ms, and bell never
occurs. T2 has no actions: spontaneous light causes bell after 1000 ms.
The goal environment composes both delays; wave and idle have no consequences.
`experiments/m10-cache.mjs` reuses the exact M8 sensory/motor artifacts and
trains a fresh rule layer for 30 slots in each phase, continuously with M8's
learning protocol. It records artifact hashes, both phase histories and all
nine raw press→bell weight columns. The original M8 cache files remain unchanged.

Run `node experiments/m10-goals.mjs` (or supply one seed: 7, 19 or 31).
Each seed has 20 ten-second probes of bell, light, no goal, bird, and bell with
recursion disabled. Probe results are cached against their sources and teacher
artifact; the all-seed command combines valid caches. Reports include every
execution, subgoal write, final stack before caller cancellation, frozen-weight
checks and the direct press→bell profile against the unchanged trigger cutoff.

M10a **failed acceptance in all three seeds**:
[full report](out/m10/2026-10-17T10-42-50.019Z/results.md).
The first iteration stopped for supervisor review without retuning learning,
admission, motor normalization or execution thresholds.

| Seed | Bell: press first | Bell achieved ≤10 s | Light achieved ≤10 s | T2 press→light W / cutoff |
| --- | --- | --- | --- | --- |
| 7 | 60% | 40% | 45% | 0.106377 / 0.101063 |
| 19 | 0% | 0% | 0% | 0.084064 / 0.101187 |
| 31 | 0% | 0% | 0% | 0.071062 / 0.104536 |

Each condition has 20 probes per seed. All ablation, no-goal and bird-goal
probes execute zero actions; all nine direct press→bell W columns are zero.
There are no distractor or extra actions. Bell subgoal writes are 20/20/40;
natural empty-stack fractions are 40%/0%/0%. Seed 31 additionally follows its
spurious bird→light observation rule after the action rule loses admission.
The [audit](out/m10/2026-10-17T10-42-50.019Z/audit.json) checks all 300 probes,
24 executed actions and matching copies, real environment support for every
observed onset, depth limits, and parent persistence after child satisfaction.
Frozen-weight assertions pass in every seed.

T1 admits press→light in every seed, but T2 weakens it and raises the layer's
noise cutoff. Seeds 19/31 lose that executable rule. Seed 7 retains it with
`W/maxW = 0.516`, typically giving about 0.28 motor drive; a spurious bird→light
prediction further suppresses it. The direct light goal also fails, so this
is not resolved by changing recursion. These findings led to the supervisor's
M10b decisions on sequential-teacher retention and motor normalization below.

M10a [test output](out/m10/2026-10-17T10-42-50.019Z/tests.txt):
**88/88 checks pass, M0–M10 PASS, 23.49 s**. The separate learning/behavior
experiment exits nonzero and retains its failed acceptance result.

M10b accumulates the T1 and T2 phase-end snapshots into an independent downward
store (`accumulateRules` in `src/predict.mjs`). Existing entries retain their W
and original admission threshold, even after extinction; later snapshots add
only previously absent entries exceeding that phase's mean + 5 SD cutoff.
Existing W changes only through M6/M7 calibration and hit reinforcement, which
remain frozen in M10 probes. Global maxW is the largest snapshot maximum and
stays fixed between snapshots. Each rule uses its own stored trigger cutoff.

`upwardDrive` now divides each U by the largest current U for the same target
feature, across all preconditions and delays. A strong rule for another goal
therefore cannot reduce this goal's drive. Prediction strength remains
`s * W/maxW`; subgoal strength remains `parent * U/maxW`. No neural parameter,
LTD equation, teacher schedule, recursion rule or acceptance criterion changes.

The unchanged teacher caches already contain both phase-end snapshots. M10b
replays them in order and reruns the behavioral probes. This is equivalent to
accumulating at the phase boundaries because teacher training never consumes
downward predictions or updates downward W. `experiments/m10-diagnostics.mjs`
reports bird→light admission and layer-2 erosion. Δrho uses the same bidirectional
edge mean as the cached rule profiles; a direction-specific T1 breakdown was
not saved. Post-only LTD/drift remains an open architecture question.

M10b **fails overall acceptance**; seeds 7/31 pass, seed 19 fails the unchanged
extra-actions limit. [Report](out/m10/2026-10-17T10-55-13.763Z/results.md),
[audit](out/m10/2026-10-17T10-55-13.763Z/audit.json),
[seed 19 evidence](out/m10/2026-10-17T10-55-13.763Z/seed19-diagnosis.json).
All 300 behavioral probes were rerun; teacher artifacts remain byte-identical.
All planned probes press first, all controls execute zero actions, all nine
press→bell columns remain zero, and all frozen-weight assertions pass.

| Seed | Bell achieved ≤10 s | Light achieved ≤10 s | Extra/probe bell / light | Result |
| --- | --- | --- | --- | --- |
| 7 | 95% | 100% | 0 / 0.05 | PASS |
| 19 | 100% | 100% | 7.05 / 7.00 | FAIL |
| 31 | 95% | 100% | 0.05 / 0.30 | PASS |

Seed 19's retained press→light W is 0.127366, with per-target motor ratio 1,
but global prediction normalization gives 0.533481. In its first light probe,
pending suppression leaves about 0.36–0.40 motor drive; readout drops below
execution threshold and returns, generating seven press onsets before light
arrives at 3100 ms. There are no actions after satisfaction. Across all seeds,
409 executions have 409 matching efference copies. No further fix is applied.

| Seed | T2 peak bird→light W / threshold | Admitted | press@6 ↔ light@0 rho T1 → T2 | Δrho |
| --- | --- | --- | --- | --- |
| 7 | 0.156404 / 0.101063 | Yes, k=6 | 0.162377 → 0.116377 | −0.046000 |
| 19 | 0.057673 / 0.101187 | No, peak k=4 | 0.137366 → 0.094064 | −0.043302 |
| 31 | 0.151845 / 0.104536 | Yes, k=6 | 0.117635 → 0.081062 | −0.036573 |

Bird→light was not admitted after T1; it newly crosses the T2 cutoff in seeds
7/31, so accumulation retains it. No special case removes it. The downward
press→light weights remain at their T1 values 0.152377/0.127366/0.107635 with
their T1 cutoffs 0.078827/0.070337/0.068274 despite the layer-2 erosion above.

M10b [test output](out/m10/2026-10-17T10-55-13.763Z/tests.txt):
**92/92 checks pass, M0–M10 PASS, 22.62 s**. Added coverage for cumulative
snapshot retention, per-entry cutoffs through prediction/recursion/JSON,
extinction surviving later snapshots, and per-target motor normalization.
The behavioral experiment exits 1; implementation stops at this result.

M10c **passes all three seeds with the same acceptance criteria**:
[full report](out/m10/2026-10-17T11-11-21.810Z/results.md).
All rule-layer teachers and 300 behavioral probes were rerun. The unchanged
sensory/motor teachers are reused; original M10 teachers are archived for audit.

The supervisor's §8 decision protects dormant layer-2 associations. M7 already
froze LTP, LTD and drift outside N windows; M10c also makes replica averaging
respect freezing. Inside open windows, the existing pre-trace threshold gates
the layer-2 weight update. To satisfy zero dormant drift, this includes bistable
drift as well as post-only LTD. The active-pre rule, layer-1 learning, calcium
and trace dynamics are unchanged. The new layer-specific flag is checkpointed.

Seed 19's repeated presses were caused by partial pending suppression: prediction
strength 0.533481 left 0.359–0.395 motor drive. P7 fell to 0.722 (below the 0.75
execution threshold), then rose to 1, creating another execution onset. The
prediction was still pending: arrival 3300 ms, inclusive deadline 3800 ms,
actual light 3100 ms. M10c holds effective goal-M at zero while an outcome is
pending through the existing tolerance. Removing drive silences the motor in
the next window; no reset, refractory change or execution-threshold tuning is
needed. On the isolated old-weight rerun, extra presses drop from 7.05/7.00 per
bell/light probe to zero, with 100% achievement. Missing outcomes release the
drive after expiry; reality and cancellation still clear the persistent goal.

| Seed | Press first, bell/light | Bell achieved ≤10 s | Light achieved ≤10 s | Actions/probe, bell/light | Extra/probe | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | 100% / 100% | 95% | 100% | 1 / 1 | 0 | PASS |
| 19 | 100% / 100% | 100% | 100% | 1 / 1 | 0 | PASS |
| 31 | 100% / 100% | 95% | 100% | 1 / 1 | 0 | PASS |

Every seed writes 20 bell subgoals; natural stack completion matches achievement.
All 180 no-goal/bird/recursion-ablation probes execute zero actions. All planned
actions are press; there are zero post-satisfaction actions, 120 executions and
120 matching efference copies. All probe weights remain frozen. Every direct
press→bell column remains zero. T2's silent press@6→light@0 edges have exactly
zero drift in all seeds. Pooled bidirectional Δrho is −0.001973/−0.001634/−0.003190,
versus −0.046000/−0.043302/−0.036573 before; remaining change belongs to the reverse
direction whose light pre is active. The controlled 20 Hz dormant-edge replay
changes from 0.160000→0.111567 before to 0.160000→0.160000 after.

[Calibration notes](docs/m6-calibration.md#m10c-dormant-associations-and-pending-action-outcomes) record the supervisor decision,
implementation interpretation, before/after evidence, and fresh acceptance runs.
The authoritative design is untouched. No later milestone or scene-specific
parameter was added. [Fast tests](out/m10c/tests.txt): **94/94, M0–M10 PASS,
23.62 s**. New regressions cover dormant/expired pre traces, normal active-pre
LTD, bidirectional coincidence, closed-window replica averaging, checkpoint
continuation, and weak pending predictions through tolerance and expiry.

Fresh acceptance reruns also pass 3/3 each: [M3](out/m3/2026-10-17T11-09-38.470Z/results.md)
(minimum margins 0.204661 vs shuffled and 0.223982 vs bird),
[M8](out/m8/2026-10-17T11-10-19.676Z/results.md) (0.101640 vs shuffled and
0.091708 vs cross/bird), and [M6/M7](out/m6/2026-10-17T11-22-34.577Z/report.md)
(C60/A 94.82%/95.45%/94.88%; jitter 100% each). The
[mixed hit/miss check](out/m7b/2026-10-17T11-32-58.672Z/report.md) passes with
hit-only gain/loss ratios 0.004628/0.004874/0.004178. The
[cross-report audit](out/m10c/audit.json) verifies fresh cache provenance,
retention, copies and acceptance flags. Detailed per-seed tables and the file
change summary are in the calibration notes above.
