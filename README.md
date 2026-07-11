# C 积木算法面板

面向墨尔本大学 `COMP10002` 与后续算法课程的本地学习软件。用户可以导入 C17 单文件源码，将其无损投影为语法积木，在代码与积木之间同步定位，并使用保守的确定性程序分析与本机诊断。算法识别和 AI 导师仍属于后续能力。

## 当前状态

**M3：积木编辑闭环已完成。** 2026-07-10 执行 `npm run accept:m3`，M0–M3 全量门禁通过：369 个单元/集成测试、20 个金样本、5 个真实压力样本、2000 例变异 fuzz、72 个 M2 专项断言、97 个 M3b 专项断言及 36 个 Electron E2E。局部重命名等价矩阵覆盖 118 个目标：92 个安全目标完成重新编译与 I/O 逐字节对比，26 个目标因遮蔽风险明确拒绝。当前版本是可直接启动的本地 Electron 工作台；尚不包含算法识别、算法图或 AI。

**M4：降级健壮化与组装学习工作台已完成。** 该里程碑增加了 Dashboard、Documents 托管工作区、跨页面视觉引导与 Software Library。验收覆盖 481 个单元/集成测试和 60 个 Electron E2E，并保留 20 个金样本、5 个压力样本、2000 例变异 fuzz、5000 例课程 C 生成式 fuzz 和 16 份困难语料。M5 以这一只读投影和本地 runner 边界为底座。

**M5：保守静态分析与本机诊断闭环已完成。** M5a 在与编辑管线隔离的只读 CST 上建立函数级 CFG、顺序 def-use、到达定义、循环与固定数组事实，以及直接唯一堆句柄的 memory event 和五态 typestate。所有 finding 明确区分 `certain`、`likely` 与 `hint`；只有已建模且证据充分的路径才能成为确定结论。partial CFG、raw/预处理器边界、不确定别名、多 allocation epoch 和未建模的谓词相关性会降级或静默。堆句柄一旦 return、存储或传给未知调用，就进入 escape-silence，不再猜测 leak、double-free 或 UAF。Explanation v2 只把与当前源码指纹和所选积木精确匹配的冻结事实注入解释面板，不做算法识别或 AI 推断。为避免同步分析冻结 renderer，当前 UI 对超过 16,384 个 UTF-16 单元或 256 个投影积木的源码保守停用 M5 事实；无损投影、编辑和本机诊断仍可继续使用。

M5b 在运行页提供 clang 静态诊断，并把 clang 的 UTF-8 字节列安全映射到源码 UTF-16 range、代码高亮和对应积木。完整内存诊断先执行静态门；无静态错误时，再运行独立 sanitizer 构建的 ASan/UBSan，以及重新编译的 plain 制品上的 `/usr/bin/leaks`。`leaks` 零结果必须先通过故意泄漏正控。当 Seatbelt 不可用而进入 trusted-only 模式时，用户只需为整套完整诊断确认一次；这一不可复用授权绑定当前精确请求，并贯穿 clang、ASan/UBSan、`leaks` 正控和目标程序检查。

2026-07-11 最终执行 `npm run accept:m5`：931 个单元/集成测试、架构门禁、工具链锁定、生产构建与 5 个 M5 真实 Electron 用例全部通过；另行执行的 M0–M5 完整 Electron 回归为 65/65 通过。

已建立：

- Electron + Vite + TypeScript 本地应用骨架
- Dashboard 首屏，以及项目、沙箱、测试三类 Finder 式本地条目
- `Documents/C Algorithm Workbench` 托管目录、独立条目子文件夹与 300 ms 源码自动保存
- 原生文件选择、磁盘文件拖放与粘贴三种 C 源码导入入口
- 深色/浅色可切换并持久化的工业风三栏工作台，以及正式 macOS App 图标
- 语句级积木树、可直接编辑且保留 CRLF/BOM 的 CodeMirror C 代码区与确定性解释面板
- 积木 ↔ 代码双向定位，以及变量声明/使用点联动高亮
- 改字面量、换二元运算符、编辑 `for` 三段与 `if` 条件的结构化表单
- 运算符优先级安全括号化、最小补丁预览、显式 diff 确认与精确 undo/redo
- 整行语句插入/删除、同父相邻语句上移/下移与受限真实拖拽
- 函数内局部变量保守重命名；字段、标签、字符串、注释、宏与不确定绑定不会被误改
- 120 ms 源码重解析防抖；大范围语法恢复时保留上一棵稳定积木树并暂停反向编辑
- 所有 M3b 操作统一经过旧快照校验、精确补丁、完整重解析、ERROR/MISSING 硬门禁、结构后置条件与 diff 确认
- 局部、文件、用户宏和 C 标准库三张内置表组成的符号解析链
- R11 可疑解析提示，以及无法可靠结构化时的原始 C 降级
- 只读 CFG、def-use、到达定义、循环/数组边界、直接唯一堆句柄 typestate 与分级 finding
- Explanation v2：按所选积木显示冻结的读写、逃逸、分配、释放、解引用和 finding 置信度
- 能力探测、编译、运行、clang 静态诊断、stdout/stderr 和终止状态面板
- clang UTF-8 字节列到源码 UTF-16 range 的严格映射，以及诊断到代码和积木的联动高亮
- 精确锁定的工具链与 lockfile 验证
- 20 个正常 C 金样本与 5 个资源/故障压力样本
- 逐字节 I/O、ASan + UBSan 与独立 plain `leaks` 双闸；`leaks` 零结果受故意泄漏正控约束
- macOS Seatbelt 最佳努力隔离、资源限制、进程组清理，以及完整诊断的一次性原生信任确认
- `SourceDoc` / `Block` 不可变模型，以 UTF-16 半开区间保存语句级 `syntax` 与保真 `raw`
- 显式注释节点及确定性吸附归属，可从 Tree-sitter `ERROR` 中挖出仍完整的函数
- 两枚精确锁定的 Tree-sitter WASM 资产，以及真实 Electron renderer 解析冒烟
- 版本化本地工作台模块注册表、动态检查器入口与算法元素描述契约
- 顶部 Dock、分阶段预制积木库、真实前后插槽组装与代码 diff 确认
- 自定义积木的创建、弃用、恢复与退休；退休不会删除已经生成的 C 源码
- 可跳过、可重复打开、自动切换真实页面并高亮目标的 14 步视觉引导
- 顶部 Software Library：逐项说明功能作用、适用场景、当前边界和扩展点，并可跳转到对应界面
- 16 份 M4 困难 C 语料、严格投影 oracle 与课程 C 生成器
- TypeScript 源码 + 编译产物双层架构门禁，阻止类型导入绕过模块边界
- 真实 Electron Dashboard 落盘/重开、自动保存和跨页面视觉引导回归

当前扩展层是后续算法工具的**第一阶段地基**：它已经提供模块、检查器、命令和算法元素的稳定发现契约，并由 M5 的确定性分析模型提供只读事实。它仍不执行第三方插件，也没有算法图、元素持久化、算法识别或完整的算法创建/改进工作流；这些能力需要在后续里程碑中单独建模。架构决策见 [ADR-0001](./docs/architecture/decisions/0001-versioned-workbench-modules.md) 与 [ADR-0002](./docs/architecture/decisions/0002-managed-documents-workspace.md)。

## 本地工作区

应用启动后首先进入 Dashboard，不会静默载入演示代码。生产环境默认使用以下结构：

```text
~/Documents/C Algorithm Workbench/
├── Projects/<project-id>/
│   ├── entry.json
│   └── main.c
├── Sandboxes/<sandbox-id>/
│   ├── entry.json
│   └── main.c
└── Tests/<test-id>/
    ├── entry.json
    └── main.c
```

- Dashboard 新建条目后立即创建独立子目录，并直接进入“搭建”页。
- 托管条目的源码修改在 300 ms 防抖后原子写入 `main.c`；底部状态栏显示待保存、保存中、已保存或错误。
- 切换文档、刷新或关闭窗口前会先 flush 未完成修改；保存失败时保留 dirty 源码并阻止正常关闭，以便重试。
- revision 冲突会显示“重新载入磁盘版本”；只有用户确认后才放弃本地修改，恢复失败时仍保留 dirty 源码。
- 渲染器只持有不可推导路径的条目 ID；绝对路径、文件读取和写入仍由 Electron 主进程验证。
- 通过“打开 C 文件”、拖放或粘贴导入的外部源码仍是临时文档，不会静默覆盖原文件。
- 当前不提供文件条目的删除、重命名、外部编辑器监听或跨设备同步；这些能力需要单独的数据恢复与冲突设计。

## 开发命令

```sh
npm ci
npm run verify:toolchain
npm run dev
npm test
npm run build
npm run verify:samples
npm run verify:roundtrip
npm run fuzz -- --runs 2000
npm run accept:m0
npm run accept:m1
npm run accept:m2
npm run accept:m3a
npm run verify:m3b
npm run verify:edit-equiv
npm run test:e2e:m3b
npm run accept:m3
npm run verify:m4
node scripts/generator-fuzz.mjs --runs 5000
npm run test:e2e:m4
npm run accept:m4
npm run verify:m5a:cfg
npm run verify:m5a:analysis
npm run accept:m5a
npm run verify:m5b
npm run test:e2e:m5
npm run accept:m5b
npm run accept:m5
```

### M4 使用与验收

- `npm run verify:m4`：运行 16 份固定语料、历史回归和默认 500 例课程 C 生成式性质测试。
- `node scripts/generator-fuzz.mjs --runs 5000`：执行深度生成式检查；失败时输出 seed、shrink path，并可写入本地回归样本。
- `npm run test:e2e:m4`：生产构建后运行积木组装 E2E，并逐份通过可见“打开 C 文件”入口导入 16 份 M4 语料，检查解析状态、无损往返、积木交互与 renderer 崩溃。
- `npm run accept:m4`：依次执行 M3 全量回归、M4 专项测试、5000 例深度生成 fuzz 和 M4 Electron E2E；任一阶段失败即停止并返回非零状态。
- `npm run verify:m5a:cfg`：验证只读 CST 生命周期边界、人工完整 CFG 金标、不可达与归属性质，以及分析/编辑依赖隔离。
- `npm run verify:m5a:analysis`：在 CFG 门之上运行完整 analysis 套件，锁定 def-use、循环/数组事实、内存事件、五态 typestate、分级 finding、深冻结与精确金标。

### M5 使用与验收

- `npm run accept:m5a`：依次检查格式、M5a analysis、Explanation v2 和生产构建。
- `npm run verify:m5b`：检查类型与架构边界，并运行 runner、诊断 UI、积木联动和 Explanation v2 单元门禁。
- `npm run test:e2e:m5`：生产构建后运行真实 Electron 回归，覆盖 clang 定位、Explanation v2 和一次授权下的 ASan/UBSan + plain `leaks` 完整诊断。
- `npm run accept:m5b`：检查 Apple clang 工具链，执行 M5b 单元门禁和真实 Electron M5 回归。
- `npm run accept:m5`：执行工具链、格式、全量单元/集成/架构回归、生产构建和 M5 Electron 验收；任一阶段失败即停止。

Electron 43 不再在 `npm ci` 的 `postinstall` 阶段下载原生二进制；首次执行 Electron 命令时会按需下载并校验。离线开发前应先在有网络或已有 Electron 缓存的环境启动一次。

## 安全边界

Electron renderer 不拥有 Node 或文件系统权限，只能经 preload 调用具名 IPC。C 编译与运行必须经过能力探测、输入校验、临时目录、进程组回收及资源限制。

macOS `sandbox-exec`/Seatbelt 是已弃用的最佳努力隔离机制，不等于 hostile-code 级沙箱。关键隔离能力不可用时，runner 必须 fail closed；只有 Electron main 针对当前请求显示原生确认框并获得用户确认后，才会签发不可复用的内部授权。需要可信回退时，完整内存诊断只为精确请求确认一次，同一授权覆盖静态诊断、两次独立构建、ASan/UBSan 运行、`leaks` 正控和目标检查；renderer 不能自行声明“已确认”或复用授权。

## 不可协商原则

> 宁可显示“无法确定，保留原始 C”，也不丢字符、不静默改语义、不误贴算法标签。

完整工程契约、里程碑与验收条件见 [CLAUDE.md](./CLAUDE.md)。
