# M5a deterministic-analysis gold corpus

这套人工金标是已完成 M5a 的验收事实源。它锁定保守静态分析的公开输出，而不是把当前
实现自动录制成期望结果，也不把静态 finding 描述为对任意 C 程序的形式化证明。

`cfg-gold/` 中每个目录只允许包含：

- `source.c`：一个或多个独立验收的 C 函数定义。
- `cfg.expected.json`：人工审阅的完整函数级节点、边集、partial 原因和显式 reachability。
- `expected-findings.json`：同一源码的精确分析发现；schema v2 固定 rule、reason、置信度、所属
  primary 节点和全部证据 range，测试会与当前分析器输出逐项精确比对，多报或漏报都会失败。

`manifest.json` 双向固定目录和函数数量。`sourceSha256` 将两个期望文件绑定到源码原始字节，
`sourceLengthUtf16` 与所有半开 range 使用应用的 UTF-16 坐标。节点 key 由 kind、nodeType 和 range
组成，不依赖 tree-sitter 临时 node id 或分析器内部 id；重复文本仍可区分。测试只读金标，仓库
不提供从当前实现自动录制或覆盖期望值的命令。

CFG 门禁还会独立检查：每条边的端点存在且不重复、reachability 与从 ENTRY 做的独立 BFS 一致、
每条投影语句或声明恰好归属一个 `primary` CFG 教学节点。`do` 条件可作为所属积木的 primary
控制点；`for` 初始化/更新是 `auxiliary`，必须指回一个 primary owner。`partial` 样本仍需精确列出原因。

内存金标只覆盖直接、唯一的一级局部指针句柄。分配结果一旦 return、存储或传给未知调用，整句柄
按 escape-silence 规则不再发布内存 finding；重复分配与循环内分配的状态事实可以保留，但状态型
finding 暂不跨 allocation epoch 猜测。`certain` 内存 finding 还必须有顺序边或已建模空值守卫组成的
可信路径；普通条件相关性、回边和同一静态 `free` 的重复执行不会被提升为红色结论。

规则输出按证据强度区分 `certain`、`likely` 和 `hint`。金标覆盖不可达代码、未初始化读取、
字面量越界、可证明的循环 off-by-one、运行时边界提示、循环索引不匹配提示，以及分级的
leak、double-free、UAF、`sizeof(pointer)` 和未检查分配结果。partial、raw、预处理器、
不确定别名或未建模控制相关性会降级或静默，不能为了覆盖率制造结论。

本目录只验收 M5a 的只读静态事实。clang 静态诊断、ASan/UBSan、独立 plain `leaks`、
一次性原生确认和真实 Electron 联动由 M5b 与总 M5 验收脚本单独覆盖。
