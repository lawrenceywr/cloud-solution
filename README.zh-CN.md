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
- `docs/backlog.md` —— 从 roadmap 阶段与场景覆盖中拆解出的可执行 backlog
- `docs/plans/next-stage.md` —— 当前阶段执行计划与按文件划分的范围
- `docs/plans/next-stage-testing.md` —— 当前阶段的 TDD 与验证计划

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

代码会在后续继续补充，但预期的源码布局如下：

```text
src/
├── index.ts
├── config/
├── domain/
├── normalizers/
├── validators/
├── tools/
├── hooks/
├── features/
├── renderers/
├── agents/
├── mcp/
└── shared/
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

当前实现覆盖了：

1. 稳定 issue 契约
2. 显式的 IP 分配建模与产物生成
3. 显式的端口连接建模与产物生成
4. 面向 `SCN-01` 的机柜感知物理规划，包括设备布线表与设备端口规划表
5. 覆盖 `SCN-01` 到 `SCN-03` 的规范场景验收
6. 在校验/工具执行前完成结构化输入归一化
7. 基于已验证模型状态生成可直接评审的假设/缺口报告

当前框架成熟度为：

1. 插件启动流程、runtime kernel、tool registry 以及一个执行前 readiness guard 已实现
2. 基于 tool 的校验、产物生成与评审摘要流程已经端到端打通
3. agent 编排、agent 间通信以及后台 workflow 模块尚未实现（`src/agents/` 与 `src/features/` 仍为空）

当前分支已经满足 roadmap 中对 MVP 的完成标准。

下一阶段的开发重点是 post-MVP：

1. 在评审输出之上继续构建 artifact bundle / export workflow
2. 为规范场景增加更丰富的 snapshot 维护
3. 在导出/评审基础更扎实之后，再推进 agent / 后台 workflow orchestration
4. 在不削弱信任边界的前提下，增加可选的多模态草稿能力和后续集成
