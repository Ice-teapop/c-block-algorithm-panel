# C 积木算法面板

面向本科 C、数据结构与算法课程的本地 Electron 工作台。应用始终把
`main.c` 作为唯一事实源，同时将源码投影为可自由摆放的节点、经过验证的
控制连线、可随时查看的代码，以及真实运行和分析证据。

`v0.0.1` 是项目版本线重置后的首个公开版本。GitHub 将它作为普通 Release
发布，而不是 prerelease。此前的 `v0.1.0-beta.1` 至
`v0.1.0-beta.12` 是开发阶段快照，不代表从更高版本向 `v0.0.1` 降级。

> `v0.0.1` 的 Universal DMG 仍然未签名、未公证。公开发布不代表 Apple
> 已验证该应用。安装前必须核对 `SHA256SUMS.txt`，首次打开时可能需要在
> Gatekeeper 中显式批准。

## 主要能力

### 源码权威的积木工作台

- 保真导入任意单文件 C17 源码。CRLF、BOM、注释和无法结构化的原始文本
  不会被静默丢失。
- 代码与积木双向定位。节点可以自由拖动，画布支持平移、缩放、框选、
  对齐、复制、删除和撤销。
- 控制线可以从兼容端口的任一端发起，再统一规范化为
  `output → input`。连线只有在候选 C 可生成、完整重解析且 CFG 后置条件
  成立后才会写入 `main.c`。
- `raw`、宏边界和 partial CFG 节点仍可查看、编译和运行，但危险拓扑操作
  会被拒绝。
- 节点单击只选择，双击或按 Enter 打开画布内详情。详情窗、运行区和主要
  面板可以移动或调整尺寸。

### 真实运行、Trace 和分析

- 使用本机 Apple clang 编译和运行 C 程序，并提供编译诊断、
  ASan/UBSan 和独立 `leaks` 检查。
- 受限 Trace 使用临时影子源码插桩，不修改项目源码。实际 stdin、参数和
  fixture 决定真实路径，节点会随事件高亮。
- Trace 绑定源码指纹和单次运行授权；取消、源码变化、10,000 条事件或
  8 MiB 上限都会使旧证据失效。
- 分开展示编译耗时、墙钟时间、峰值 RSS、峰值进程数、输出字节、执行
  节点、操作计数和终止原因。
- Benchmark 使用多个输入规模和重复运行的中位数。图表区分实测时间、
  操作次数和参考增长，不生成虚假的综合效率分数，也不把曲线当作 Big-O
  证明。
- 教学模拟与真实执行严格隔离。模拟结果不会进入真实性能历史，也不能
  支持真实输出结论。

### 学习与算法设计

- 内置 80 个版本化预设：75 个源码积木和 5 个 Start、End、Pause、
  Checkpoint、Merge 虚拟流程节点。
- Library 包含 114 个实质词条，覆盖 C 语法、标准库、数据结构、常见
  算法、复杂度、案例、故障恢复和工作台使用方法。
- 第一课“扫描求最大值”使用独立教学沙箱和真实任务证据，依次训练运行、
  Trace、补全、图表阅读、调试和迁移为最小值算法。
- 保守静态分析提供函数级 CFG、def-use、到达定义、循环和数组事实，以及
  直接唯一堆句柄 typestate。结果明确区分 `certain`、`likely` 和 `hint`。
- 本地证据提示无需 API，根据静态诊断、Trace 路径和运行历史给出可定位
  建议。

### 项目、界面和快捷操作

- Dashboard 管理 Projects、Sandboxes 和 Tests。整行单击或按 Enter
  直接打开条目。
- 顶部使用纯文字 Dock；工作区、Library、分析和设置保持独立界面，主要
  区域独立滚动并可调整尺寸。
- 默认使用纯白背景和黑色文字，也可切换背景和深色主题。
- 首次启动根据 macOS 首选语言选择中文或英文；之后可在设置中切换。
- Quick Open、统一主运行入口、可视化运行路径和可折叠高级诊断减少重复
  按钮与界面跳转。

### 可选的联网 AI 助手

应用支持用户自备密钥连接以下官方服务：

- OpenAI
- Anthropic
- Gemini
- OpenRouter
- DeepSeek
- 智谱 GLM
- Kimi 中国区和 Kimi 国际区

联网 AI 默认不启用。用户必须在设置中输入自己的 API 密钥并主动发起
请求。密钥由 Electron `safeStorage` 使用操作系统能力加密保存；renderer
只能看到厂商、模型和是否已配置凭据，不能读取明文或密文。

默认上下文只包含当前函数、诊断摘要、控制流摘要、运行证据和有限的当前
对话历史。文件路径、stdin 和程序参数不会发送。只读模式不发送完整源码；
用户显式切换到“建议修改”或“代理”后，该模式下的请求会包含完整 `main.c`，
弹窗会持续显示这一外发提示。请求只会发送给用户选定厂商的
官方白名单主机，不会轮询其他厂商试钥。

每个托管工作区对应一个本地 AI Project，可保存多批对话。AI 修改源码的
权限默认关闭。开启“修改前复核”或受控执行后，模型仍只能返回候选替换；
应用会绑定工作区 revision 和源码指纹，生成精确 diff，建立检查点，并经过
重解析、无损往返和 CFG 门禁。失败或过期提案不会写入 `main.c`。

## 版本历程

- **M0**：安全 Electron 骨架、具名 IPC、本机编译运行器和资源边界。
- **M1**：任意 C 的无损投影、注释归属、金样本和变异 fuzz。
- **M2**：积木/代码双向高亮、变量定位、运行面板和确定性解释。
- **M3**：受控源码编辑、结构 diff、撤销/重做和受限拖拽闭环。
- **M4**：Documents 托管 Dashboard、工业组装画布、自定义积木生命周期。
- **M5**：CFG、def-use、循环、数组和内存诊断，并保留历史回归门禁。
- **`v0.1.0-beta.1`**：自由画布、可验证改线、Trace、运行历史、预设、
  Library 和 Universal DMG 发布基础。
- **`v0.1.0-beta.2–12`**：集中修复 Apple clang 兼容、`leaks` 监督、
  CRLF 撤销、进程回收、Electron E2E 和托管发布门禁。
- **`v0.0.1`**：重置公开版本线，加入 v6 教程、分析图、多厂商 AI、项目级
  对话、显式授权改码、双语界面和整体交互重构。

完整发布说明见
[v0.0.1 release notes](./docs/releases/v0.0.1.md)。

## 本地工作区与迁移

应用启动后进入 Dashboard。托管条目位于：

```text
~/Documents/C Algorithm Workbench/
├── Projects/<project-id>/
│   ├── entry.json
│   ├── main.c
│   ├── flow-view.json
│   ├── scenarios.json
│   ├── run-history.json
│   ├── tutorial-progress.json
│   └── ai-project.json
├── Sandboxes/<sandbox-id>/
└── Tests/<test-id>/
```

- `main.c` 始终是程序事实源，并由主进程原子保存。
- sidecar 只保存视图、案例、运行摘要、课程进度和 AI 对话。损坏、未知版本
  或指纹过期只会使相应辅助数据被忽略或重置，不会改写源码。
- `flow-view.json` v1 会按需迁移为结构和文本锚点 v2。锚点不唯一时只丢弃
  对应节点的位置、选择或详情状态。
- 旧 AI Provider 配置升级为 v2 后会要求重新连接。旧密文没有绑定厂商，
  因此应用不会猜测其归属或向多个服务发送密钥。
- `ai-project.json` 是新增的项目级对话文件。旧版本会忽略它；删除或损坏
  它不会影响 `main.c`。
- 卸载应用不会自动删除 Documents 中的项目。

## 安装未签名 Universal DMG

1. 从同一个 GitHub Release 下载 DMG 和 `SHA256SUMS.txt`。
2. 在下载目录运行：

   ```sh
   shasum -a 256 --check SHA256SUMS.txt
   ```

3. 只有校验成功后才挂载 DMG，并把应用拖入 **Applications**。
4. 如果 Gatekeeper 阻止首次启动，在 Finder 中按住 Control 单击应用，
   选择 **打开**，然后再次确认。
5. 如果仍被阻止，打开 **系统设置 → 隐私与安全性**，确认应用来源后选择
   **仍要打开**。

不要全局关闭 Gatekeeper，也不要在校验失败时继续安装。

## 开发

要求 macOS、Node 24 LTS、npm 11.11.0 和 Apple clang 17.x–21.x。

```sh
npm ci
npm run verify:toolchain
npm run dev
npm run typecheck
npm run format:check
npm test
npm run build
npm run test:e2e
npm run accept:m0-m5-regression
npm run accept:m6-m8
npm run accept:m9
```

本地生成当前未签名 Universal DMG：

```sh
npm run accept:m9
npm run format:check
npm test
npm run accept:m0-m5-regression
npm run accept:m6-m8
npm run test:e2e
npm run dist:mac:beta
```

`dist:mac:beta` 是现有未签名构建脚本的历史名称。它不会签名、公证或上传
产物。

## 安全与隐私

应用会在本机编译并运行用户选择的 C 程序。未知 C 文件应按可执行代码
对待；资源限制和 macOS Seatbelt 最佳努力隔离不能把任意原生代码变成
安全文档。关键隔离能力不可用时，runner 会 fail closed。

应用不包含遥测、广告、账户或云同步。联网 AI 只在用户配置并主动调用后
向选定厂商发送明确上下文。详细边界见 [Privacy](./PRIVACY.md) 和
[Security Policy](./SECURITY.md)。

## 架构决策

- [ADR-0001：版本化工作台模块](./docs/architecture/decisions/0001-versioned-workbench-modules.md)
- [ADR-0002：Documents 托管工作区](./docs/architecture/decisions/0002-managed-documents-workspace.md)
- [ADR-0003：源码权威的自由流程投影](./docs/architecture/decisions/0003-source-authoritative-flow-projection.md)
- [ADR-0004：有界影子源码 Trace](./docs/architecture/decisions/0004-bounded-shadow-trace.md)
- [ADR-0005：性能证据与复杂度结论分离](./docs/architecture/decisions/0005-evidence-separated-efficiency.md)
- [ADR-0006：项目级 AI 对话与显式授权写入](./docs/architecture/decisions/0006-project-scoped-ai-conversations-and-gated-writes.md)

## 不可协商原则

> 宁可显示“无法确定，保留原始 C”，也不丢字符、不静默改语义、不把模拟
> 当实测、不把提示当证明。

完整工程契约、历史里程碑和验收条件见 [CLAUDE.md](./CLAUDE.md)。
