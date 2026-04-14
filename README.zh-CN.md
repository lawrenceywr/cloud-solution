# cloud-solution

`cloud-solution` 是一个面向云与数据中心方案设计的新 OpenCode 插件项目。

它的目标是帮助用户将需求、设备清单、拓扑信息、机柜信息以及支持文档，转化为经过验证的规划产物，例如：

- 设备布线表
- 设备端口规划表
- 设备端口连接表
- IP 分配表
- 方案说明、假设项与评审项

## 产品方向

这个项目受 OMO 架构启发，但会作为一个独立插件存在，拥有自己的领域模型和校验规则。

核心设计原则是：

> 只有经过验证、归一化的领域数据，才能生成最终产物。

这意味着图纸、PDF、截图以及 agent 推理都可以作为有价值的输入，但不会被自动视为真实事实。

## MVP 承诺

MVP 采用 human-in-the-loop 模式。

- 它应当能够接收结构化与半结构化输入。
- 它可以使用多模态提取作为草稿辅助。
- 它必须显式暴露歧义、缺失字段和低置信度假设。
- 它不能基于薄弱输入宣称自己生成了完全自治、高置信度的最终设计。

## 目标产物流转

```text
需求 / 设备清单 / 拓扑 / 机柜文档
  -> 提取
  -> 归一化
  -> 规范领域模型
  -> 校验与规则检查
  -> 产物生成
  -> 评审与导出
```

## 初始文档地图

- `AGENTS.md` —— 面向编码 agent 与贡献者的仓库工作规则
- `docs/architecture.md` —— 架构、信任边界、模块布局与工作流
- `docs/domain-model.md` —— 核心实体、关系与校验契约
- `docs/roadmap.md` —— 从 MVP 到后续扩展的分阶段交付计划
- `docs/scenarios.md` —— 应驱动测试与 fixture 的规范场景
- `docs/progress-snapshot.md` —— 当前实现快照
- `docs/backlog-active.md` —— 当前仍活跃的 backlog
- `docs/backlog-archive.md` —— 已完成 backlog 历史
- `docs/plans/current.md` —— 当前阶段计划或最近一次阶段记录
- `docs/plans/stage-07-evidence-reconciliation.md` —— Phase 7 详细记录

## 建议的首轮开发顺序

1. 完成领域 schema。
2. 构建确定性的校验规则。
3. 构建目标表格所需的行构建器。
4. 增加 Markdown 与机器可读渲染器。
5. 将工具与 hook 接入插件。
6. 只有在信任边界稳定之后，才增加多模态辅助提取。

## 预期仓库结构

```text
cloud-solution/
├── AGENTS.md
├── README.md
└── docs/
    ├── architecture.md
    ├── domain-model.md
    ├── roadmap.md
    └── scenarios.md
```

当前源码布局如下：

```text
src/
├── index.ts
├── artifacts/
├── agents/
├── config/
├── coordinator/
├── domain/
├── features/
├── hooks/
├── normalizers/
├── plugin/
├── renderers/
├── scenarios/
├── shared/
├── tools/
├── validators/
└── workers/
```

## 当前状态

当前目录已经包含：

- 架构与交付文档
- 一个基于 Bun/TypeScript 的插件脚手架
- 面向 IP 分配、端口连接、设备布线和设备端口规划产物的确定性 schema / 校验 / tooling
- `SCN-01`、`SCN-02`、`SCN-03` 的可执行验收覆盖
- 面向结构化物理/网络输入的首版归一化层，用于生成规范模型
- 用于阻止薄弱物理与 IP 事实驱动最终产物的确认门控
- 一个确定性的 `summarize_design_gaps` 评审工具和假设报告渲染器
- 一个确定性的 `export_artifact_bundle` 工作流，用于打包请求产物、评审输出和 bundle index
- `SCN-01` 到 `SCN-03` 的 bundle 回归基线
- 面向 SCN-02 双归属与 SCN-03 多机柜语义的更深一层确定性校验
- `src/features/` 中一个轻量确定性的 `solution-review-workflow` 协调器
- 基于该协调器的首个 `start_solution_review_workflow` 编排启动器
- `src/workers/` 中首个 `requirements-clarification` 子 worker
- `src/agents/` 中首个确定性的 `solution_review_assistant` brief 与实际响应模块
- `src/coordinator/` 中可复用的 child-session / worker 协调基础设施
- 已经收敛的 review-workflow 公共 handoff 结果：公开 `agentBrief` / `agentResponse`，同时保留 `finalResponse` / `nextActions` 兼容字段
- `SCN-04` 的可执行 cloud-allocation fixture / validation / artifact / acceptance 覆盖
- `SCN-05` 的 document-assisted candidate-fact drafting / confirmation 可执行覆盖
- `SCN-06` 的多文档冲突检测与阻断性 review 覆盖
- 首个前门输入工具：`capture_solution_requirements` 与 `draft_topology_model`
- 基于现有 coordinator 的显式多 worker review orchestration，以及 worker 间消息传递
- 面向 extraction / drafting / review-summary 的 feature 层入口，让 tool 保持轻薄
- 正式的 `document-assisted-extraction` agent + worker 拆分
- 面向设备布线、设备端口规划、端口连接、IP 分配的 4 个 advisory planner slices

当前实现覆盖了：

1. 稳定 issue 契约
2. 显式的 IP 分配建模与产物生成
3. 显式的端口连接建模与产物生成
4. 面向 `SCN-01` 的机柜感知物理规划，包括设备布线表与设备端口规划表
5. 覆盖 `SCN-01` 到 `SCN-06` 的规范场景验收
6. 在校验/工具执行前完成结构化输入归一化
7. 基于已验证模型状态生成可直接评审的假设/缺口报告
8. 在已验证/已评审输出之上完成 artifact bundle 打包
9. 锁定 `SCN-01` 到 `SCN-03` 的 bundle 回归基线
10. 在 agent 工作之前增强 `SCN-02` / `SCN-03` 的确定性规则深度
11. 在 agent 层之前加入共享的 review/export workflow state 协调器
12. 加入 queued→running→terminal 的 workflow launcher
13. 加入面向 agent 的 handoff brief
14. 加入首个实际 review assistant 与对外收敛后的 handoff contract
15. 把 `SCN-04` 落成云侧 IP allocation 的验收锚点
16. 加入前门 requirement capture 与 draft topology intake 工具
17. 把 review path 扩成显式的 dependency-ordered multi-worker orchestration
18. 落地 document-provenanced 的 SCN-05 candidate-fact draft / promote 路径
19. 落地把文档/图片/图输入接到 SCN-05 草稿链路的 extraction helper
20. 落地正式的 extraction agent 拆分与 4 个 advisory planner slices

当前框架成熟度为：

1. 插件启动流程、runtime kernel、tool registry 以及一个执行前 readiness guard 已实现
2. 基于 tool 的校验、产物生成、评审摘要、workflow launcher、`SCN-04` 验收、requirement capture 与 draft-topology intake 已端到端打通
3. review workflow 已经跑在显式多 worker orchestration 上，SCN-05 的 extraction + candidate-fact draft / promote 路径与 SCN-06 的冲突阻断都已落地，同时新增了 4 个 advisory planner slices，并且 Phase 9 已经补齐了挂在 extraction 路径后的窄版 advisory MCP source adapter

## 当前 Agent / Orchestration 状态

当前仓库已经有 6 个正式 child-agent 模块及其对应的 worker / feature 适配层：

1. `start_solution_review_workflow` + `src/features/solution-review-agent-handoff.ts` 组成外层 orchestrator。
2. `src/workers/requirements-clarification/worker.ts` 负责澄清问题子 worker。
3. `src/workers/evidence-reconciliation/worker.ts` 负责证据冲突核对子 worker。
4. `src/workers/solution-review-assistant/worker.ts` 负责依赖有序的 review-assistant worker。
5. `src/agents/solution-review-assistant.ts` 负责 review assistant 子 agent。
6. `src/agents/document-assisted-extraction.ts` 与 4 个 planner agents 负责 extraction / planning 的 child-session 合同。

这意味着仓库已经有显式的多 worker review path、正式的 extraction agent 拆分、document-provenanced 的 candidate-fact draft / promote 路径、4 个会把建议重新送回 `draft_topology_model` 的 advisory planner slices，以及一个挂在 `extract_document_candidate_facts` 后面的、受配置控制的窄版 MCP advisory source adapter。最终产物仍然只能由经过验证的模型生成，外部证据也仍然必须重新经过 draft 确认与验证，而不会绕过 trust boundary。

当前分支已经满足 roadmap 中对 MVP 以及当前 Phase 9 的完成标准。

当前没有正在进行中的 roadmap phase。后续如果出现新的场景需求，可以在现有 advisory MCP slice 之外继续扩展外部适配层。
