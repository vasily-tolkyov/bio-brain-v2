# 新项目复用对照表：多层新设计 ↔ 旧 bio-brain 代码

- 新设计（以此为准）：`plans/multilayer-architecture-narrative.md`（§0–14，冲突表见 §9）
- 旧代码：`/workspace/bio-brain`（w4r4-acceptance @11bcd5b），Node ≥20 ESM（`.mjs`），`src/` 共约 2.7k 行；实验工作树 `bio-brain-inputlayer`（exp/input-layer @28a1047）、`bio-brain-inputgain`
- 复用等级：**原样**＝直接拷过去用；**改造**＝代码可用，接口或逻辑要改；**仅概念**＝思路可参考，代码不能直接用；**无**＝没有对应实现，需要新写
- 本次只读代码，没有改动任何文件，也没有跑仿真。行号以上述提交为准。

## 1. 逐组件对照

| 新设计组件 | 旧代码中的对应 (file:line) | 复用等级 | 说明 / 实验中的坑 |
|---|---|---|---|
| 单层吸引子网（静态 STDP 成团） | `src/L4-network/spiking-network.mjs:84`（SpikingNetwork），`:136` connect(plastic=…)；规则 `src/L3-plasticity/calcium-rule.mjs:7,15,19`（GB_DP/GB_NMDA/GB_RATE）；学出的输入层 `bio-brain-inputlayer/experiments/input-layer/lib.mjs:2-3,42`，吸引子识别 `v1.mjs:35`（连通分量）、`v1-ident.mjs:9`（Louvain） | **改造**（核心可直接拿） | GB_DP 原参数在网络里会全部推到 ρ≈0.5、分不开组（calcium-rule.mjs:14 注释），所以要用 GB_RATE/GB_NMDA。输入层 V1e/V1f 的成团结果可信，是新项目“第 1 层”最好的起点。 |
| iSTDP 墙 | `spiking-network.mjs:132-158`（Vogels 2011 iSTDP，istdp:{eta,target,tau,wMax,tauPre}），更新 `:305-312`；E1 用法 `src/loop/e1.mjs:60` | **原样** | 能稳住发放率，但它的目标是一个**发放率**（3 Hz），并不能直接做到“抵消到零”。墙的强度随层数怎么调，还要靠实验定。 |
| P7 读出（点亮的吸引子 + 强度） | `bio-brain-inputlayer/experiments/input-layer/scene1.mjs:12`（窗内放电≥1 次的成员比例，跨副本平均）；分箱工具 `src/loop/readout.mjs:7,12,25`、`src/loop/decode.mjs:5` | **改造** | 旧代码里 P7 只用来写报告，新项目要把它做成层的正式输出接口。窗口取 100 ms，开窗时间相对刺激起点要对齐。 |
| 多副本带噪输入层 | `inputlayer/.../lib.mjs:2-3,42,129`（R 个副本拓扑相同、权重平均共享）；接入主线 `inputlayer/src/loop/build.mjs:151,155` | **改造** | 副本之间共享权重靠每 syncMs 取一次平均，可以直接沿用。代价是规模和运行时间都按 R 倍增长。 |
| 时间展开 / 亮点复制推移 | 旧代码用脉冲时间细胞 C，对数 8 档：`src/loop/context.mjs:4`（DELAYS=100·2^k ms），`:21` buildContext；`decode.mjs:2,15` synthesizeContext（合成“事件→档位”的活动） | **仅概念**（复制推移在旧代码里**没有**） | 新设计改用移位寄存器，只推起始边沿。8 档对数档位（0.1–12.8 s）可以照搬；synthesizeContext 的思路可以拿来写测试桩。 |
| 立方体压平成下一层输入 | `src/L4-network/layered-network.mjs:43` buildLayered（逐层前馈/反馈），`:125` inputRate | **仅概念** | 旧版只有“层→层”的发放率前馈，没有“吸引子×时间片”这种输入线。 |
| 下行预测连接 | `src/loop/expect.mjs:12`（C→P 由 TD 学出的预期）；`layered-network.mjs:24,34`（fb 反馈、PC_DEFAULTS） | **仅概念** | 新设计改为学习时一并形成的独立下行连接，C→P 的 TD 预期不沿用（§9）。 |
| 未来片（预测行/目标行） | 无 | **无** | Y 字形是全新的。 |
| N/M 比较器 + iSTDP 零点校准 | `src/loop/errors.mjs:18-39`：N←E1 兴奋，S→N 抑制 iSTDP（:30）；M←慢受体兴奋，V→M 抑制 iSTDP（:31）；saveState 在 :34 | **改造**（结构最值得保留） | “兴奋 vs 错位抑制 + iSTDP”这个结构可以直接复用，但输入要改成“下行预测 vs 现在片”，iSTDP 的目标要从 3 Hz 改成零点。**坑：** ① N 成团放电（scene1b r5：闪电在场 12.8 Hz，N 起始幅度被削到 17–26 Hz）；② V→M 的平衡点被静息期压制主导：V 静息 14–30 Hz 而 M <3 Hz，增益越高权重越低（约 1/gain，0.68→0.47→0.41）；③ V 超过 100 Hz 时短时程抑制只剩 0.2–0.26 的释放；④ 增益×2 能修好 N（误报 0，命中 100%），但 M 误报反而升到 161/476/549 次/分（×1/1.5/2）。新项目的 iSTDP 学习应改成**由传入门控**或给静息期打折，STD 恢复要快一些，并且要训练到收敛。 |
| 三因子 + 资格痕迹 | `src/L4-network/three-factor.mjs:4-47`（突触前痕迹 tauE=200、平滑的 δ、权重截断在 [0,wMax]，导出/导入状态） | **改造**（几乎可以直接拿） | 要改两处：第三因子从 U 的 δ 换成 N/M 误差，并加上饱和函数 sat(E)，以及按剩余空间 w / (wmax−w) 缩放。`factor` 回调参数（:8,:37）正好可以用来换误差源。 |
| 意外门控 | `src/loop/context.mjs:18`（L 装入当写入门）；边界检测 `decode.mjs:59`、`readout.mjs:57,59` | **仅概念** | 新设计不需要显式边界，用 N 去门控学习率即可。 |
| 传出副本 / 动作行 | `src/loop/actions.mjs:3-23`（A 群，只在动作开始的 50 ms 装入 L）；世界 `world.mjs:120` actionTrial | **改造** | 新设计里副本走专用输入线，进入过去片的动作行。 |
| 输出运动吸引子 + WTA + 执行阈值 | `src/L5-brain/hippocampus.mjs` 里的 kWTA（速率版）；`L5-brain/prefrontal.mjs` | **仅概念** | 脉冲版的 WTA 可以用吸引子网加抑制群来搭，但没有现成的。 |
| 倒推 / 上行索引连接 | 无 | **无** | |
| 内感受层 + 偏差检测器 + 全局奖励因子 | 无（旧代码里唯一的“类多巴胺”是 U 的 δ：expect.mjs:4 GAMMA、decode.mjs:55 integrateU） | **无**（偏差检测器可以套用 errors.mjs 的结构，但接线固定、不学习） | |
| 好奇 | 无 | **无** | 奖励要用“意外下降了多少”，不能用意外的绝对量。 |
| 事件驱动的高层 | 无（C 只有秒级固定档位） | **无** | |
| 跨层直连（先多长再修剪） | `spiking-network.mjs:136`（pairs/p 稀疏随机连接）可作底层工具 | **仅概念** | |
| 睡眠回放 + 整体缩放 | `hippocampus.mjs:1-6`（速率版 CA3 有序重放，主线不调用）；`spiking-network.mjs:354`（budget 突触归一化） | **仅概念** | |
| 情景缓存 | 无（`protocol.mjs` 只存检查点） | **无**（新写最简单：一张事件流表） | |

## 2. 值得带走的基础设施

| 部件 | 位置 | 等级 | 备注 |
|---|---|---|---|
| LIF / AdEx 神经元，顶树突分区 | `src/L1-neuron/lif.mjs`，`spiking-network.mjs:73,113` | 原样 | 已在 L1–L3 验证 |
| 突触：短时程抑制（tauRec）、慢受体（NMDA 样） | `src/L2-synapse/synapse.mjs`；`spiking-network.mjs:136,167,199` | 原样 | 注意 STD 在高发放率下会把释放压得很低 |
| 仿真主循环、frozen 冻结学习、步钩 | `spiking-network.mjs`（step 约 :190–360）、`src/L4-network/step-hooks.mjs` | 原样 | |
| 按入度接线、入度表 | `src/loop/build.mjs:19,33` | 原样 | |
| 随机数 / 可恢复 RNG | `src/core/rng.mjs:2`，`e1.mjs:22`，`spiking-network.mjs:49` | 原样 | 能复现，也能断点续跑 |
| 网络状态序列化、拓扑哈希 | `spiking-network.mjs:57,383-429`；`readout.mjs:48,54` | 原样 | |
| 检查点（原子写入、分块续跑） | `src/loop/protocol.mjs:21-72,129,153` | 改造 | 去掉旧协议里的阶段名 |
| 模块接口约定 | `readout.mjs:32` moduleInterface（ids/handles/saveState/loadState/selfTest） | 原样 | 新项目每层、每个模块都可以照这个约定写 |
| 场景 / 世界生成器（雷电、坚果、石头、果子；带动作试次） | `src/loop/world.mjs:22-153` | 改造 | 雷电场景可直接用来测因果学习；坚果、石头、果子场景带动作，可以用来测行为 |
| 指标：误报 / 命中 | `inputlayer/.../scene1b-metrics.mjs:3,19,23,42`；`readout.mjs:35,40,44` | 改造 | 验收按已同意的口径：主指标是下游误报和命中，幅度比只作参考 |
| 测试框架 | `verify/all.mjs`、`verify/L*.mjs`、`src/core/check.mjs:2` | 改造 | `npm test` |
| 画图 | `src/core/png.mjs:41`（Canvas、热图） | 原样 | |

**运行速度的坑：** 单线程 JS 逐拍仿真很慢，一次场景一的完整测试要跑几个小时。新项目一开始就要考虑：复制推移、情景缓存这些非脉冲部分不要放进逐拍循环；层规模要控制好；以后考虑在 GPU 上重写。

## 3. 不要带过去的部分

| 旧部件 | 位置 | 原因 |
|---|---|---|
| 预分组标签线 E1 | `src/loop/e1.mjs` | 已被学出的吸引子输入层取代 |
| E2 原型池 + N→E2 的“解释掉” | `src/loop/e2.mjs:11,50` | 新设计用层内吸引子加下行预测，E2 没有对应角色 |
| L 装入 + C 时间细胞 | `src/loop/context.mjs` | 被复制推移取代（档位常数可以留下） |
| C→P 的 TD 预期、U 二级误差 | `src/loop/expect.mjs`、`decode.mjs:55` | 被下行连接和 N/M 三因子取代（§9） |
| S/V 用慢受体做的“保持现状”预测 | `errors.mjs:22-27` | 新设计里的预测来自上层，不再来自“保持现状”的慢拷贝；而且这一路正是 N 成团放电和 r5 卡住的根源之一 |
| 人为背景放电表 BACKGROUNDS | `build.mjs:14-15` | 新设计应该靠增益让输入远强于噪声；背景只保留维持网络工作的最低值 |
| scene1b 的各种补丁参数 | `inputlayer/.../scene1b-lib.mjs:11` | 是针对特定场景调出来的，不应进入新项目 |
| 代谢账 / ATP | `core/ledger.mjs`、`L4-network/metabolism.mjs`、`core/units.mjs` | 与新设计目标无关（如果还想保留能耗统计，可以作为可选项） |
| 速率模型、L5 各脑区 | `rate-network.mjs`、`L5-brain/*` | 是速率单元，与脉冲主线不统一；只保留其中的思路 |
