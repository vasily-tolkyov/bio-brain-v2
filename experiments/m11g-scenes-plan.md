# Fresh M11g scene rebuild plan

Status: source reconstructed from retained task history. No recovered numerical scene result is fresh evidence. No neural scene has been run for this rebuild.

## First durable checkpoint

Save this plan, `experiments/m11g-scenes.mjs`, and the parent's rebuilt runtime/helper patch before starting simulations. `node --check experiments/m11g-scenes.mjs` and `node experiments/m11g-scenes.mjs --plan` perform no neural simulation. The shared `goalPipeline` and `probeChain` must forward/report `actionThreshold`; the gate phase fails preflight if they do not.

Fresh comparator calibration must be completed and saved first. Preflight requires the rebuilt schema, complete/calibrationPass, passing declared seeds and frozen held-out probes, unchanged calibration sources, matching runtime floor/constants, all current comparator import-closure hashes, and the hash-verified start-source manifest. Freeze the runtime/helper sources before teachers: subsequent phases reject different source signatures. Use a new output root for a materially changed implementation rather than silently continuing old states.

## Commands and durable phase boundaries

Each invocation runs exactly one phase and stops. Example:

`node experiments/m11g-scenes.mjs teachers --seed=7 --out=out/m11g-fresh/seed-7 --calibration=PATH_TO_FRESH_CALIBRATION.json --run`

Use the same command with `--preflight` instead of `--run` to validate sources/calibration without creating outputs or constructing neural populations. Keep the same seed, output root, and fresh calibration evidence for following phases. `BIO_BRAIN_PROGRESS_LOG` optionally enables a progress file; console output always remains. Existing phase directories are never overwritten. Save/upload each completed phase package before starting the next long phase.

1. `teachers`: fresh isolated storm sensory and action sensory/motor teachers. Writes two full initial states.
2. `storm-causal`, `storm-shuffled`: matched30-trial worlds, each from the identical fresh storm teacher state. Save actual neural/learning states, profiles, event schedules and audits.
3. `m4-causal`, `m4-shuffled`: unchanged frozen prediction probes,10 per kind; no learned-state reconstruction.
4. `storm-A`:10 paired trials from fresh causal end state. `storm-B`:60 omissions from A. `storm-C`:60 recovery pairs from B. `storm-D`:30 jittered pairs (±300ms) from the identical saved A. `storm-E`:30 alternating hit/miss trials from that same A. Every phase saves full state and generation history.
5. `action-M8`:30 fresh causal teacher trials. `action-T1`: retain its sensory/motor states but reset the rule layer/online learner as in the legacy curriculum, then30 press→light trials. `action-T2`:30 light→bell observation trials.
6. `action-natural`:60 full-world trials using the legacy teacher action schedule. This is not natural goal-driven behavior validation. Intermediate distribution samples occur at exact trial boundaries, before the next neural window.
7. `gate-0.2`, `gate-0.3`, `gate-0.4`: each restores the exact same end-natural full state. Three repeats each of bell, light, no-goal, bird and recursion-ablated bell, with matched environment seeds. Record true success, latency, extra/distractor/false actions and the unchanged probe predicate. This is screening, not20-repeat acceptance or selection of a default.
8. `rest`:300s zero external input from the saved fresh causal state, actual sensory/layer-2/learner running. Record spontaneous onsets, births/deaths, downward weights, actual error outputs, and separate sensory versus layer-2 rho drift.
9. `report`:read-only aggregation of completed fresh artifacts. Run once after the intended phases; no `--run` is needed. Missing phases remain NOT RUN. Do not infer an overall pass from selected pilot checks.

## Evidence in every phase

- Before neural work: exact source-byte snapshot (including the untracked runner), SHA-256 manifest, git HEAD/status/diff, verified fresh calibration reference/hash, manifest-verified input checkpoint hashes/sizes and constants. Each dependency also verifies its completion/provenance bytes against its prior artifact manifest, whose hash is recorded. The raw calibration and its source manifest are archived once under the run-root `calibration/` directory; upload that dependency once. Every phase records its exact hash/reference instead of duplicating the large raw artifact.
- Completion: full checkpoints where applicable, all actual environment events, per-trial live downward states, audit records, comparator inhibitory scales, `complete.json` and `artifact-manifest.json`. Any archived source change during execution, including the runner, marks the phase invalid; its original exact bytes remain preserved.
- Generation identity includes rule key and birth time. Deletion/rebirth cycles are preserved, not collapsed into a key-level absence claim.
- Actual unmatched deadlines retain spike count Mraw, signed deviation Mdev, Meff, applicable eligibility, prediction/aggregate drive, time since real target activity and live Minh scale summaries. Full saved error networks and all final row scales are also retained.
- Matched/consumed predictions are explicitly distinguished from positive STDP. Zero triangular-credit boundary matches are recorded. “No strengthening” is never used as proof of “no hit.”
- First observed .2/.3/.4 eligibility is measured per generation at each real update. Freshly born generations have window-resolution first-crossing evidence; existing generations are labeled as observation bounds.

## Interpretation boundaries

Keep unchanged M4 thresholds and the existing frozen goal predicate. Current adaptation checks cover end-B≤10%end-A plus original-generation deletion, recovery≥85%, jitter≥80%, and no sustained strengthening in the actual alternating branch. Preserve any same-key rebirths and real failures. Removed separate-hit ratios, strict additional decay after early zero, and all-negative false-weight trend slopes are legacy diagnostics, not current mandatory criteria.

A supra-floor edge surviving genuine unmatched deadlines with Meff0 is unresolved contextual comparator silence, even when an action gate blocks its use. Preserve its full generation/deadline evidence and live inhibitory scales. Do not inject ideal misses, fit target strengths, change thresholds to force acceptance, or call a shadow causally isolated without a perturbation test.

A seed-7 pilot is not multi-seed acceptance. Teacher-scheduled natural continuation is not natural goal-driven false-action validation. Prior lost results are reference history only and are not embedded in this runner or plan as new results.
