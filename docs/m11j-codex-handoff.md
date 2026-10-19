# Bio-brain-v2: local Codex execution, training and test continuation

## Status and boundary

The user requested transfer to Codex during T1. The native gpt-6-astra worker finished and persisted T1, then stopped before T2. T2 and every later neural stage are NOT RUN at handoff. Do not duplicate T1 or the completed teachers.

Latest user instruction supersedes the earlier cloud-only split: run project work, training and testing in local Codex using the user's CPU. The assistant coordinates Codex, reviews its work, and discusses results with the user. Do not raise a foreground terminal or other window on the user computer. Cloud T2 remains paused; there must be only one resumed test sequence, on the user computer.

Use gpt-6-astra with xhigh reasoning if supported. Verify the actual selected model. Do not substitute a different model silently. The user authorized committing and publishing the full current project to the existing work branch, with no force push or main merge. Do not use unsafe/bypass permissions, copy credentials, or access denied Codex session paths.

## Code and source of truth

Remote: https://github.com/vasily-tolkyov/bio-brain-v2
Pinned base: 142e8cf56461c053d533e5cb54445216e3e2f19b
Working branch: work/arrival-ledger-balance-pruning-action
Existing cloud repo: /workspace/scratch/7f2277e91e40/bio-brain-v2

The package contains the full current repository tree and a cumulative changes.patch against that pinned base. This includes the approved M11h runtime, prior experiments, and the new M11j experiment-only runner. It does not mean every historical experiment supports the new runtime. Read current docs/m11h-event-learning.md and docs/m11j-actions-online.md.

Current runtime is FROZEN. Do not change src/, learning laws, parameters, action threshold, timers, or neural topology for this test. New M11j files are also sealed in prepare/provenance.json. Their hashes must match before every phase. The runner checks them itself.

Current approved mechanisms:
- Learning N retained. Learning M removed. Goal/action M retained unchanged.
- Each prediction instance has arrival-centred +/-500ms matching and full-window deadline settlement.
- Timing-weighted hit learning and original direct miss weakening. No artificial target strength.
- Delete only W<=0. No positive pruning floor, epsilon, or timed decay.
- Persistent generation identity protects reborn edges and stale goal paths.
- Per-edge action threshold .3 remains PROVISIONAL. Do not tune it.

## Predeclared experiment

Read out/m11j-actions-online/prepare/plan.json and all schedule-7/19/31.json. Independent review approved this protocol BEFORE any new neural training.

Preparation:
1. Fresh sensory and motor isolated teachers: COMPLETE.
2. T1: 30 x 34-second slots with exactly the original 90 press/wave/idle teacher commands: COMPLETE at final handoff checkpoint.
3. T2: 30 x 34-second observation-only light -> bell slots, no motor commands: NOT RUN.
4. Original 24-trial independent GoalErrors calibration: NOT RUN. It does not advance/change the trained sensory/rule network. Time labels end at p.t-100 so online goal stepping resumes exactly.

Autonomous tests: three environmental seeds 7, 19, 31, each from the SAME fresh prepared training-seed7 full state. These are not three independent neural training seeds.
- normal: 24 x 10-second slots, light/bell/none/bird targets 6 each.
- broken: 20 x 10-second slots, light/bell 6 each and none/bird 4 each.
- restored: 24 x 10-second slots, light/bell/none/bird 6 each.
- One independently timed external bird in every slot.
- Actual press causes light +3s and bell +4s in normal/restored. In broken, press causes neither. Wave/idle have no effects.
- Preserve all queued physical effects, neural state, RNG, receptor states, traces, output previous winner, goal-M state, past/future, pending instances and learning state across phases. No resets or extra rest.
- All original online learning paths use normal advanceActions. Motor readout and calibrated goal-M retain their original fixed semantics. Do NOT use the frozen advanceGoals helper as online acceptance.
- The runner writes only goals during autonomy. No teacher rescue, manually selected actions, or new exploration after preparation.
- A caller cancels an unmet goal at its fixed 10-second slot end. This is recorded separately and is NOT natural completion.

Fixed criteria include light/bell causal success and first-press >=90%; with 6 each this requires 6/6. Controls must have zero actions. No extra action after completion, no duplicate action while waiting for a relevant actual above-gate prediction of the same goal request. Fault phase must observe a real execution followed by missing outcome; its last fixed 4 light/bell slots must be silent. Recovery gets no rescue. If suppressing action stops experience and prevents relearning, report FAIL. Do not extend the protocol to make it pass.

The observer records exact action/physical-event cause IDs, positive drive contributions, all eligible path generations, onsets, prediction instances, per-generation changes and exact miss formula checks. Waiting checks are observation only. There is no added control lock.

## Verify and materialize before local resume

1. Use the current Library transfer workflow in the consuming local executor. Materialize the confirmed handoff archive to a local path, verify its SHA256 and internal manifest, then restore prepare/teachers/T1 under the local repo out/m11j-actions-online/. A cloud absolute path is not a local file. Confirm no neural process from this test is still running. On the original cloud, the T1 process should already be finished. Do not assume a disconnected terminal means it stopped.
2. Verify all archive manifest hashes and the prepare/teachers/T1 artifact manifests.
3. Verify T1 complete.json valid=true and state.json schema m11j-action-state-v1.
4. Record the local Node/V8 versions, OS/platform/architecture, CPU, start time and checked-out commit in an execution-host sidecar outside the frozen runner. Verify all 29 source hashes and T1 state SHA c73e3ba012d5144475d3e1207416b19ef16762deeb63d99ad3032cc9288a7d5a. The existing full-state deepEqual on restore must pass; do not loosen it. Exact initial restoration does not assert that later cross-platform floating-point trajectories will be identical. Check T1 result preparationChecks, including exact90 commands/executions and copies, no physical bell. A preparation failure is a real failure, not permission for more teaching.
5. Current shared-cloud T2 directory may contain ONLY PAUSED-NOT-RUN.txt. That is an intentional overwrite guard, not experiment output. Preserve a copy of that marker in the handoff evidence, then remove that one file and rmdir the empty T2 directory only in the selected local checkout when the parent authorizes local continuation after GitHub sync and handoff. The original cloud guard remains in place. Never remove a populated/result-bearing phase directory.
6. Prefer fetching/checking out the published work branch and verifying its full commit hash. Do NOT apply the cumulative patch again on that updated branch. Only when reconstructing from the pinned base, apply the cumulative patch or restore the supplied current repository tree. Restore out/m11j-actions-online/prepare, teachers, and T1 at their original relative paths. The absolute repo root may differ; sealed paths are relative.

## Exact remaining local Codex commands

After the supervising parent confirms the handoff, local Codex runs these from the verified local repo root, sequentially, using the user CPU in the background. Do not launch a foreground window. Do not also resume them on the cloud. After EACH successful process exit, inspect complete.json and result.json, save source/state/results and the phase manifest durably to Library BEFORE the next phase. A behavioral FAIL does not authorize changes or extending counts; continue the remaining predeclared sequence and preserve that failure.

node experiments/m11j-actions-online.mjs T2
node experiments/m11j-actions-online.mjs calibrate
node experiments/m11j-actions-online.mjs run 7 normal
node experiments/m11j-actions-online.mjs run 7 broken
node experiments/m11j-actions-online.mjs run 7 restored
node experiments/m11j-actions-online.mjs run 19 normal
node experiments/m11j-actions-online.mjs run 19 broken
node experiments/m11j-actions-online.mjs run 19 restored
node experiments/m11j-actions-online.mjs run 31 normal
node experiments/m11j-actions-online.mjs run 31 broken
node experiments/m11j-actions-online.mjs run 31 restored
node experiments/m11j-actions-online.mjs report

The runner refuses to overwrite any existing phase directory. Do not bypass this. Inspect uncertain/partial outcomes before retrying. The report aggregate includes preparation checks; do not report success just because a process exits0.

The original cloud estimate was about 25-35 minutes after T1, plus review/persistence. Local CPU speed is not yet measured. Re-estimate from the actual local T2 rate; do not promise the cloud timing on different hardware. Do not launch an extra full suite or performance benchmark; the previous M2 53.72ms >50ms failure remains historical and unchanged.

## Delivery

Keep the user informed through the parent. In the original cloud, /workspace/shared/bio-brain-progress.log feeds the visible foreground viewer. Use short human-facing phase/results, not prompts or internal reasoning. Do not raise a foreground terminal or other window on the user computer. The parent provides the verified local Codex task link, reviews results, and coordinates the local background execution.

Request independent read-only review of each completed phase and final report. Final result must distinguish prepared-path validity, autonomous normal/fault/recovery results, transient wrong/repeated actions, caller cancellations, and missing exploration. Return a full code patch and evidence archive, exact source/state hashes and confirmed Library IDs. Do not erase old failures or claim indefinite/general acceptance.
