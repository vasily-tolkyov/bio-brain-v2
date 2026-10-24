L8 时序开发试验：已应用的局部协议修订

授权：Vasily，2026-10-24，Asia/Shanghai；本轮用户明确批准剂量校准和 temporal target-exclusive≥1。仅 seed 101，输出限本诊断目录。这不是 L8 新验收版本，历史 L8-r2 仍为 FAIL。

1. 时序光学通道沿用原饱和规律：共亮 `ρ′=1−(1−ρ)·0.8^d`，单端亮 `ρ′=ρ·0.96^d`，双暗不变。选择 `d=ln(.25)/(10·ln(.8))≈.6212567439`，从零出发、无抑制时 `ρ₁₀=.75`，随后渐近 1。剂量同时作用于原有单端抑制，未单独削弱抑制。一次真实 onset 仍只提供一次 .5ms 机会，颜色样本仍只追加一次。这里 75% 指通道强度 ρ，不是经 Hill 函数转换后的光场亮度 B，也不是预测权重 W。
2. 开发试验的 target-exclusive 分母下限从 3 改为 1；成员是目标输入 `selected.values>0` 的物理细胞，exclusive 是其中不在当前探针输入源里的细胞。目标完成后的 `field.lit` 不用于扩大分母。至少一个 exclusive 细胞可承载非空测量；空分母必 FAIL。仍用严格 `B>.3`、完成率≥.9、因果 k6 为峰、相对乱序/干扰均差≥.05、反序覆盖≤.05；仅有一个 exclusive 时，它实际辐射到 `B>.3` 即满足完成率。
3. `TemporalStack` 默认只校准上层时序剂量；下层 snapshot 剂量 .1 不变。显式 `continuous` 仍可同时设置两层，新增 `temporalContinuous` 可单独设置上层。共用 `TEMPORAL_DEFAULTS` 的 `TemporalLightLayer` 同步采用该校准。其余运行路径的独立 ROLE_CONTINUOUS 保持原值，未做全系统重验收。
4. 使用保存的 L8 development/r2 seed-101 schedule、同一自然输入、30 次每臂训练及 20 次每 k/输入的探针。只调用现有 `temporalStorm(101, schedule)`；基线直接读取已保存数据，不重跑历史模型。先固定本参数，再报告全部数值，不根据结果延长训练或换种子。
5. 保留 [L8 失败诊断](../L8-fail/REPORT.md) 中所有其他 PROPOSAL；没有应用 higher membership、五图样、预测或总验收的修复/豁免。独立保存字段审计继续调用原有 temporal membership 断言，若因新剂量暴露差异则记录 FAIL，不修改定义。

原 `L8-protocol.json`、`L8-audit.mjs` 和 `out/light-line/acceptance/L8/` 保留原文；本局部协议由 `src/light-line/tests/L8-temporal-gate.mjs` 执行。这里明确记录成员来源及分母修订，避免把历史验收静默改写。无教师、无适配器、无旧运行时导入、无提交推送、无 L9 工作。
