# Architecture

`bio-brain-v2` is a dependency-free Node.js ESM research implementation of
spiking attractor networks, temporal associations, prediction calibration,
and goal-directed actions. Node.js 20 or newer is required; run `npm test`.

The authoritative conceptual design is the
[multilayer architecture narrative](docs/multilayer-architecture-narrative.md).
This document maps that design to the current implementation. Milestone reports
and [SUPERVISION.md](SUPERVISION.md) record experimental decisions and acceptance
results; passing implementation tests does not imply behavioral acceptance.

```mermaid
flowchart TD
    world[World or action environment] --> sensory[Sensory attractor layer]
    sensory --> readout[P7 readout]
    readout --> past[Onsets and logarithmic past slices]
    past --> rules[Temporal association layer]
    past --> future[Downward connections and future predictions]
    rules --> learning[Online learning]
    learning --> future
    future --> errors[Prediction and reality comparator]
    readout --> errors
    errors --> calibration[Novelty, hit and miss calibration]
    calibration --> future
    goals[Persistent goals and subgoals] --> motor[Motor drive and output layer]
    future --> motor
    motor --> world
    motor --> past
```

## Neural dynamics

`src/core/` supplies reproducible randomness and state helpers.
`src/neuron/lif.mjs`, `src/synapse.mjs`, `src/stdp.mjs`, and `src/network.mjs`
implement neurons, receptor dynamics, sparse connectivity, excitatory plasticity,
and inhibitory plasticity. `src/checkpoint.mjs` persists resumable network state.

`src/layer.mjs` builds attractor layers from these primitives. Replicas share
topology while retaining independent noise; inhibitory learning separates
assemblies. `src/readout.mjs` measures attractor activation over 100 ms windows
using member participation rather than repeated-spike counts.

## Temporal memory and prediction

`src/unroll.mjs` converts newly active attractors into nine logarithmic past
columns. Column zero represents the immediate past; delayed columns have centers
from 100 ms through 12.8 s. Their inputs let a higher attractor layer learn
temporal relationships through simultaneous activation.

`src/downward.mjs` owns plastic downward connections and directed association
measurements. `src/predict.mjs` maintains future predictions with contributor
identity and arrival times, alongside a separate persistent goal row.
`src/learning.mjs` couples the rule layer to online learning. These bookkeeping
operations run between readout windows, outside the neural tick loop.

## Calibration and actions

`src/novelty.mjs` retains only the spiking novelty (N) comparator for prediction
learning. Its per-prediction ledger records actual onsets within the inclusive
arrival-centred window. `src/three-factor.mjs` creates connections when N exceeds
its unchanged noise deadband, reinforces the first real match, and directly
weakens each unmatched instance at its deadline. No neural M or M threshold gates
this learning. Connections are deleted only at exact zero; each generation has a
store-local persistent identity. `src/errors.mjs` is now explicitly goal-only and
retains the original action-driving M circuit without changing its amplitude.
See the [current event-learning report](docs/m11h-event-learning.md). The
[historical M11f pilot](docs/m11f-pilot.md) records the earlier mechanism and its
failed criteria; it is not current validation.

`src/goals.mjs` handles goal drive and bounded subgoal recursion.
`src/output.mjs` implements motor readout and execution; `src/io.mjs` connects
observations and efference copies to the shared feature interface.
`src/world.mjs` and `src/envs/actions.mjs` provide experimental environments.

## Repository layout and reproduction

| Path | Purpose |
| --- | --- |
| `src/` | Runtime modules and environment implementations |
| `verify/` | Deterministic checks and implementation regression suites |
| `experiments/` | Milestone training, probes, diagnostics, and reports |
| `docs/` | Design narrative, reuse map, calibration notes, and milestone findings |
| `README.md` | Usage and historical milestone results |
| `SUPERVISION.md` | Research decisions and experiment constraints |
| `out/`, `logs/` | Local generated artifacts, excluded from Git |

Run `npm test` for the verification suite. Run individual experiment scripts with
`node experiments/<script>.mjs`; inspect each script and its milestone report for
arguments and required cached artifacts. Historical learning-M scripts require
their archived runtime; old learning snapshots are explicitly incompatible.
Some experiments depend on earlier teacher checkpoints. Existing links into ignored `out/` refer to local artifacts
and will require those artifacts to be regenerated or distributed separately.
