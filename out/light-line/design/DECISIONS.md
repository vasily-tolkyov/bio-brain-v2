> REMOUNT 2026-10-23T14:02:48+08:00 (Asia/Shanghai): recovered exact DECISIONS text from logs/codex-light-line-impl-L5.log:315–402, including post-design A–D, zero-teacher L0–L8, and L3→L3b routing locks. Pre-remount freeze/acceptance trees are lost; their preservation and historical hashes cannot be verified.

# light-line — Locked decisions (Vasily)

Recorded 2026-10-22 Asia/Shanghai before L0 implementation.
Source conversation: A–D one-by-one lock, then "implement".
Design docs: WIRING-CHANGES.md, PLAN.md, ARCH-QUESTIONS.md.

## Locked architecture (override any earlier switch framing)

- Independent light line under `src/light-line/` (and matching tests/out trees).
- NOT a `BIO_BRAIN_BASE=light|legacy` switch. Do not keep a legacy LIF level2 on this line.
- Every layer's attractor base = accepted light base (N=250, m=6, eta=.2, kappa=.2, theta=.3, hill-q4-h1.5, sum/.05, M2, C′).
- Temporal unroll and the rest of the upper architecture stay unchanged. Only attractor morphology changes: spikes → light / brightness B / lit area.
- Verbatim owner lock: 「每一层的吸引子基座都用光基座，其它上层建筑和时序展开之类的都不变。」
- Level2 principle (also locked): 「第二层的时序处理，本质上是我们把网络按时间展开复制了很多份然后在这些之间建立了 STDP 的连接，最后映射到高层的网络吸引子中。」
- Prediction ledger W and optical channel ρ remain separate state.
- No commit / no push. Frozen light-base core parameters are not retuned.

## A–D (override design-doc recommended defaults)

### A — Concurrent multi-input color / fields
**Decided (Vasily):** Multi-input concurrent lighting means multiple attractors activated. Compute each color/field independently. If one cell sits in two fields, evaluate it **per attractor / per color separately** — do **not** take max-B across carriers.

Owner wording: 「多路同时亮的颜色就代表多个吸引子被激活，各算各的光场是对的，但是如果一个细胞同时处在两个光场中不能只取最大亮度，而是在对于每个吸引子（每种颜色）独立计算。」

This overrides the design default of “per-cell max brightness across carriers.”

### B — STDP / co-lighting update cadence
**Decided (Vasily):** Continuous updates (边传边学) — learn as the field is computed / sources are known, not batched once per 100 ms readout window. Use parameters to control attractor strength and formation speed.

Owner wording: 「改成连续更新，然后可以用参数控制吸引子的强弱/形成速度。」

This overrides the design default of “offline commit at the end of each 100 ms observation window.” Upper modules still recognize attractors by presence/stability; cadence is a formation-speed parameter, not an architecture change.

### C — How to read attractors from brightness patterns
**Decided (Vasily):** Optical-contrast rule. Clear, visible brightness patterns are attractor patterns. Noise links stay dim and become dimmer after the STDP boundary steepens; they are not members.

Owner wording: 「可以考虑类似光学实验用衬比度来定，清晰可见的图样就是吸引子图样。那些噪声连线本身就会很暗，在stdp边界陡峭以后会更暗。」

This overrides the design default of unsupervised clustering + earliest-20 M2 replay bookkeeping as the primary identity rule. Contrast/visibility is the recognition principle; any M2-style count is subordinate evidence, not the definition of “what an attractor is.”

### D — Novelty and goal-error units
**Decided (Vasily):** Binary step present/absent. “Rang / did not ring” is a step signal without intensity. Compare attractor presence (via contrast/threshold), not graded brightness magnitude. Intensity stays inside attractor formation; it does not enter the novelty/goal ledgers.

Owner wording confirmation: 「“响没响”应该本身就是阶跃信号吧，不带强度特征的？」 → 「是的就这样」

This overrides the design default of graded `max(0, realityB − predictedB)` / `max(0, goalB − realityB)` with a .05 deadband as the ledger unit. Ledger timing (±500 ms, first hit, miss-by-miss, rule gate .3, execute gate .75) stays; only the comparator becomes presence/absence.

## Implementation gate note

L0 copies the accepted light core and reproduces formation/completion/C′ brightness acceptance. A–D binding for wrappers (encoding, continuous STDP parameters, contrast readout, binary novelty/goal) starts at L1+; do not pretend L0 already implements A–D wrappers.

## Teachers — external only (L2 override, 2026-10-22 Asia/Shanghai)

**Decided (Vasily):** Do **not** put a teacher program inside the light-line prototype for L2. Teachers are an optional external demonstration / guidance channel added **later**, after the prototype’s own closed loop (experience → rules → action → error calibration → exploration) already works without them. The core must remain runnable with teachers removed.

Owner wording:
- 「我认为教师层应该从外部接入，不应该混合在原型的架构里。也就是说，去除教师原型依然是可以正常工作的」
- 「原型之前那套从经验到规则、到动作、到误差校准、探索等的闭环是 OK 的，他们不需要教师也能进行。教师的作用是，规则性的让原型经历某种场景，从而加快训练…教师不直接干涉原型，他只是给原型进行演示和指导。」
- 「不在做 L2的时候，我们不要做教师程序，后面在原型本身闭环跑通了以后，再外加教师的程序。」
- Widget choice `L2-no-teacher`: replace sensory/motor/body attractors with light bases; **NO teacher program this phase**; acceptance via **natural env inputs only**.

Consequences (binding for L2 and later until teachers are re-introduced as an external addon):
- No `teachers.mjs`, no `teachGroups`, no hard-wired curriculum inside `src/light-line/` core / sensory / motor / body / io construction paths.
- L2 acceptance drives light sensory / motor / body bases from **natural environment samples** (feature events, executed actions, interoception readings) — not from an isolated rotating group-teacher schedule.
- PLAN.md L2 text that assumes 500/300/1000/12 teacher curricula and “1/2/3/5/9-group teachers” is **overridden** for this phase; those schedules belong to a later external-teacher addon, not L2.
- Removing any future external teacher module must leave the light-line prototype able to present env input, form contrast attractors, and run without that module.

## Teachers — nowhere in first-version light-line (L0–L8) — 2026-10-22 Asia/Shanghai

**Decided (Vasily, additional lock):** There is **NO teacher program anywhere** in the entire first-version light-line prototype across **all phases L0–L8**. Do not create `teachers.mjs`, `teachGroups`, 500/300 curricula, group-teacher schedules, or `src/light-line-adapters/` teacher modules in any phase of this first version. Teachers are added only **after** the prototype closed loop is complete.

This strengthens the earlier “Teachers — external only (L2 override)” section: the ban is not L2-only and is not satisfied by parking teachers under adapters. No teacher code in `src/light-line/`, no teacher code in `src/light-line-adapters/`, no teacher code in acceptance drivers for L0–L8.

Owner intent: 「不在做 L2的时候，我们不要做教师程序，后面在原型本身闭环跑通了以后，再外加教师的程序。」+ parent-relayed lock that this applies to the whole first-version line, not L2 alone.

## L3 higher-layer temporal port routing — separate dissimilar inputs (2026-10-22 Asia/Shanghai)

**Decided (Vasily):** The L3 delay:k6-peak failure is caused by **fixed higher-layer input wiring crowding**, not by wrong inter-copy co-light / STDP learning. TimeUnroll timing and A@6↔B@0 opportunities are correct. Crowding 3×9 logical ports onto one axis with six-nearest selection violates the single-layer principle that **similar inputs should cluster and dissimilar inputs should spread** — a precondition for forming identifiable attractors. This must be fixed **before** L4 and before any gate-only softening of delay specificity.

**Binding consequences:**
- Redesign the **global temporal port → physical source map** inside the single higher N=250 light layer so dissimilar time-copy ports (different k, and time-copy vs target clusters) are spatially identifiable / separable.
- Keep: nine TimeUnroll columns, exact unroll arithmetic, N=250, m=6 six-nearest semantics, frozen optical rule (eta/kappa/theta/hill/sum), per-ID carriers as routing metadata, no teachers, no directed rho.
- Do **not** treat metric-only / U-narrowing / dose-only changes as the fix for this decision.
- If a legal geometry cannot separate the required inputs under N=250, **capacity-reject** honestly; do not increase N, shard, or hide aliases.
- Rejected L3 acceptance remains REJECTED; any new candidate is a **new freeze + new acceptance tree** (e.g. L3b), never a silent reclassification of the failed run.
- Diagnosis evidence: `out/light-line/diagnosis/L3-delay/REPORT.md` (H1 primary).

Owner wording: 「对于单层网络来说相似的输入聚集，有差异的输入分散这是单层网络的基本原理…高层网络…差异输入全都挤到一起…是输入固定布线导致的原因。我们先得解决这个问题」
