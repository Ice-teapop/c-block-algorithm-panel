# 架构决策记录

系统当前的进程边界、模块地图、数据所有权和写入路径见
[当前架构总览](../README.md)。本目录只保存已经做出的重要决策；Accepted
记录不直接改写，需要变化时新增替代 ADR。

| ID                                                               | 决策                             | 状态     | 日期       |
| ---------------------------------------------------------------- | -------------------------------- | -------- | ---------- |
| [0001](0001-versioned-workbench-modules.md)                      | 采用版本化本地工作台模块注册表   | Accepted | 2026-07-10 |
| [0002](0002-managed-documents-workspace.md)                      | 采用 Documents 托管工作区        | Accepted | 2026-07-11 |
| [0003](0003-source-authoritative-flow-projection.md)             | 采用源码权威的自由流程投影       | Accepted | 2026-07-12 |
| [0004](0004-bounded-shadow-trace.md)                             | 采用有界影子源码运行轨迹         | Accepted | 2026-07-12 |
| [0005](0005-evidence-separated-efficiency.md)                    | 分离实测效率与复杂度结论         | Accepted | 2026-07-12 |
| [0006](0006-project-scoped-ai-conversations-and-gated-writes.md) | 采用项目级 AI 对话与显式授权写入 | Accepted | 2026-07-14 |
