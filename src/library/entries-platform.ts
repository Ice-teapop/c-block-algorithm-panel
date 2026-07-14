import type { LibraryEntryInput } from "./contracts.js";

export const PLATFORM_LIBRARY_ENTRIES: readonly LibraryEntryInput[] = [
  e(
    "manual.dashboard",
    "manual",
    "Dashboard",
    "应用启动后的文件工作台，集中显示项目、沙箱和测试条目，并支持整行单击直接进入工作区。",
    [
      "Dashboard 读取 Documents 下的专属工作区目录，不扫描无关文件。条目由 entry.json 标识，主源码保存在各自子目录。",
      "项目适合长期维护，沙箱适合快速实验，测试条目用于组织输入与回归思路。三者共享安全保存链路。",
    ],
    {
      featureLink: link("打开 Dashboard", "dashboard", "dashboard"),
      related: ["manual.workspace-kinds", "manual.autosave"],
    },
  ),
  e(
    "manual.workspace-kinds",
    "manual",
    "项目、沙箱与测试",
    "三种工作区条目使用相同的 C 编辑底座，但在用途、生命周期和后续扩展方向上不同。",
    [
      "项目承载持续演进的课程作业或算法设计；沙箱保存短期验证；测试条目预留结构化输入、期望输出和回归集合。",
      "选择类型不会改变 C 语言语义。它影响 Dashboard 分组、目录元数据和未来可挂载的课程或测试能力。",
    ],
    { related: ["manual.dashboard", "examples.test-matrix"] },
  ),
  e(
    "manual.source-authority",
    "manual",
    "main.c 是事实源",
    "画布、积木、解释和流程图都是 main.c 的可验证投影，不能静默取代或重写用户源码。",
    [
      "任意导入 C 会先保真保存，再由 Tree-sitter 建立结构投影。无法确认的区域显示为 raw 或 partial，而不是猜测结构。",
      "结构修改必须生成精确旧坐标补丁，重新解析候选源码，并验证无损往返和结构后置条件后才能提交。",
    ],
    {
      featureLink: link("打开 C 代码", "build", "code-pane"),
      related: ["canvas.locked-regions", "recovery.stale-snapshot"],
    },
  ),
  e(
    "manual.autosave",
    "manual",
    "本地自动保存",
    "打开工作区条目后，源码会在停止输入片刻后自动保存到 Documents 的专属目录。",
    [
      "底部状态栏会显示正在保存、已保存或存在冲突。发生冲突时应用会停止覆盖，并要求你先重新载入磁盘版本。",
      "自动保存用于防止意外丢稿，不等于版本历史。重要项目仍建议使用 Git 或另行备份。",
    ],
    {
      featureLink: link("查看保存状态", "build", "local-save"),
      related: ["recovery.disk-conflict", "manual.source-authority"],
    },
  ),
  e(
    "manual.presets",
    "manual",
    "预设积木",
    "预设积木按流程、C 基础、内存、数据结构和算法模式组织，可拖成草稿或插入明确语句槽位。",
    [
      "每个预设携带版本、源码、用途、放置范围和学习阶段。虚拟控制节点不会伪装成独立 C 语句。",
      "插入请求必须落在可编辑 statement-list；宏、解析恢复和无大括号控制体等危险边界会被拒绝。",
    ],
    {
      featureLink: link("打开预设块", "build", "preset-blocks"),
      related: ["canvas.drafts", "manual.custom-blocks"],
    },
  ),
  e(
    "manual.code-editor",
    "manual",
    "C 代码编辑器",
    "代码面板始终显示精确源码，可直接输入、粘贴和撤销；结构化能力会随解析状态自动启停。",
    [
      "直接编辑会立即刷新积木、符号和控制流程；正在显示的旧分析结果不会套用到新源码。",
      "出现语法错误时仍保留文本编辑和保存，但暂停可能破坏结构的重命名、改线和语句重排。",
    ],
    {
      featureLink: link("打开代码面板", "build", "code-pane"),
      related: ["recovery.parse-recovery", "manual.inspectors"],
    },
  ),
  e(
    "manual.inspectors",
    "manual",
    "解释、编辑与运行检查器",
    "右侧检查器把通俗解释、受约束修改和本机运行分开，避免把推测、补丁和执行结果混为一谈。",
    [
      "解释页读取语法、符号和确定性分析事实；编辑页先生成 diff；运行页展示编译、stdout、stderr 和终止原因。",
      "切换视图不会修改源码。任何真正的代码变化都必须经过预览、语法检查和明确确认。",
    ],
    {
      featureLink: link("打开解释", "explanation", "explanation"),
      related: ["extension.inspector", "execution.diagnostics"],
    },
  ),
  e(
    "manual.layouts",
    "manual",
    "面板与布局",
    "项目、预设、画布、代码、流程、指标和诊断面板各自滚动，并通过分隔条独立调整尺寸。",
    [
      "学习、搭建、调试、分析和极简布局只改变面板可见性与比例，不改变源码、草稿或运行数据。",
      "布局随项目保存在独立视图文件中。源码变化后仍保留面板比例，无法可靠对应的节点位置会恢复默认。",
    ],
    { related: ["canvas.view-state", "extension.panel", "extension.layout"] },
  ),
  e(
    "manual.custom-blocks",
    "manual",
    "自定义积木生命周期",
    "经过单语句解析验证的个人 C 片段可以保存为积木，并经历 active、deprecated 和 retired 生命周期。",
    [
      "弃用阻止新推荐但允许已有使用；退休阻止新实例化。项目中的源码快照不依赖模板继续存在。",
      "自定义定义必须是一个完整顶层语句或控制结构，不能通过 NUL、多个顶层语句或解析恢复区域。",
    ],
    {
      featureLink: link("管理自定义积木", "block-library", "block-library-create"),
      related: ["manual.presets", "c.statement"],
    },
  ),
  e(
    "manual.library",
    "manual",
    "Library 电子词典",
    "Library 同时承担完整软件手册、C/DSA 词典、案例、恢复指南和扩展接口参考；第一课则负责真实操作训练。",
    [
      "左侧目录与右侧详情独立滚动；搜索覆盖标题、别名、正文、关键词和示例源码，并可通过交叉链接追踪概念。",
      "第一课使用独立教学沙箱和真实运行证据；Library 负责随时检索和深入理解。课程不会修改已有项目。",
    ],
    {
      featureLink: link("打开 Library", "software-library", "software-library"),
      related: ["onboarding.library", "extension.registry"],
    },
  ),
  e(
    "manual.ai-assistant",
    "manual",
    "AI 助手",
    "AI 助手把本地确定性检查与用户自带模型的对话分开，用于识别和解释算法、查找可能的边界缺口、比较设计与优化方案并规划下一步实验。",
    [
      "“本地检查”无需 API，会根据静态诊断、真实 Trace 路径和运行历史给出可定位的证据提示；单击提示可以回到对应代码或节点。",
      "“AI 对话”需要在设置中连接模型。可以直接输入、按 Enter 发送，或单击解释算法、设计测试、分析复杂度等常用问题；最多最近 6 轮只保留在当前窗口，用于连续追问。",
      "默认只发送 main / 首个可分析函数、诊断、控制流摘要和运行证据；完整 main.c 必须在“发送范围”中手动选择。源码更新后旧对话仍可查看，但不会继续作为新版本的上下文。",
      "分析页的 AI 证据复核会结合当前证据寻找语义缺口、边界遗漏和下一步实验，但确定性测试、真实输出和复杂度证据仍应由用户验证。",
    ],
    {
      aliases: ["AI 提示", "模型对话", "本地检查", "算法助手"],
      keywords: ["API", "优化", "边界", "运行证据", "隐私", "完成度"],
      featureLink: link("打开 AI 助手", "build", "mentor-hints"),
      related: ["manual.inspectors", "manual.source-authority", "execution.metrics"],
    },
  ),

  e(
    "canvas.free-layout",
    "canvas-wires",
    "自由节点画布",
    "每个流程节点拥有自由坐标，可拖动、框选、缩放和平移；默认位置只负责首次打开时提供稳定起点。",
    [
      "节点位置不改变 C 的执行顺序。真实顺序由 CFG 边决定，视图坐标仅保存在 flow-view.json。",
      "多函数默认分列排列，用户可按个人阅读习惯重排。源码变化导致锚点失效时，视图回退到确定性布局。",
    ],
    { related: ["canvas.view-state", "canvas.control-ports"] },
  ),
  e(
    "canvas.control-ports",
    "canvas-wires",
    "控制端口",
    "输入端口接收控制流，输出端口按 next、true、false、case、return 等精确 CFG 语义区分。",
    [
      "普通顺序语句只能有一个控制输出；if、loop、switch 和 assert 通过不同语义端口表达合法扇出。",
      "同一 switch-case 端口可关联多个 case 边，但每条边仍有独立 ID、目标和 slot，不会合并为一条模糊连线。",
    ],
    { related: ["canvas.edge-kinds", "canvas.branching"] },
  ),
  e(
    "canvas.edge-kinds",
    "canvas-wires",
    "CFG 连线类型",
    "连线保留 entry、next、branch、switch、break、continue、goto、return 和 terminate 等完整边类型。",
    [
      "边类型来自真实 C 控制流，不是颜色标签。true 与 false 即使到达同一节点，也必须作为两条独立语义边保存。",
      "改线规划只判断结构可行性，不直接制造 C 补丁；写入适配器还必须重解析并核对候选 CFG。",
    ],
    { related: ["canvas.connection-gate", "c.control-flow"] },
  ),
  e(
    "canvas.branching",
    "canvas-wires",
    "合法分支与汇合",
    "分支节点可连接多条语法允许的路径，普通节点不能任意扇出，任意环也不能冒充结构化循环。",
    [
      "if 与 assert 通常各有 true/false 两个容量为一的端口；switch-case 可多路；循环通过条件边和回边闭合。",
      "真实运行由输入和 C 条件决定路径。手选分支属于教学模拟，必须与真实性能数据分开。",
    ],
    { related: ["execution.real-vs-simulation", "algorithms.graph-traversal"] },
  ),
  e(
    "canvas.drafts",
    "canvas-wires",
    "未接入草稿",
    "从预设或复制产生的节点先作为自由草稿存在，可移动、选择和删除，但不会立即改写 main.c。",
    [
      "草稿可携带 presetId、源码快照和控制端口。拖线到真实输入端口只产生 draft connection intent。",
      "只有完整 CFG 的唯一 statement-list 插槽可以生成 provisional 插入补丁；确认、重解析和 CFG 后置条件由上层执行。",
    ],
    { related: ["manual.presets", "canvas.connection-gate", "recovery.partial-cfg"] },
  ),
  e(
    "canvas.locked-regions",
    "canvas-wires",
    "partial 与 raw 锁定",
    "解析恢复、宏边界、unsupported syntax 和不完整 CFG 会显示为锁定节点，允许查看与运行但禁止危险改线。",
    [
      "锁定原因携带具体 range 和 partial code，便于定位问题；锁定不是删除，也不会修改原始文本。",
      "修复源码并重新获得完整分析后，新投影会恢复可编辑端口。系统不会通过猜测消除锁定。",
    ],
    { related: ["recovery.parse-recovery", "recovery.partial-cfg", "manual.source-authority"] },
  ),
  e(
    "canvas.connection-gate",
    "canvas-wires",
    "连线安全门",
    "连线规划检查源码 fingerprint、节点锁定、函数边界、端口容量、重复边和非结构化环，并以拒绝为默认。",
    [
      "accepted 只代表图层结构可以继续验证，不代表 C 已改变。计划明确携带 cSourcePatch: null 或 provisional patch。",
      "真正提交必须满足 exact diff、source reparse、roundtrip、CFG edge match 和 no-new-partial 等后置条件。",
    ],
    {
      audience: "developer",
      related: ["recovery.stale-snapshot", "extension.registry"],
    },
  ),
  e(
    "canvas.view-state",
    "canvas-wires",
    "Flow view sidecar",
    "节点坐标、视口、选择和详情窗口保存在版本化 sidecar；投影临时 ID 不落盘，恢复使用源码与结构锚点。",
    [
      "v2 锚点组合源码 fingerprint、结构路径、节点类型、范围和文本 fingerprint；源码小改后只恢复唯一候选，重复文本或失配会丢弃对应定位。",
      "sidecar 失败只重置视图，不触碰 main.c。旧 v1 同源码可读并在下次保存迁移；v2 序列化不保存 node、port 或 edge 临时 ID。",
    ],
    {
      audience: "developer",
      example: code(
        "json",
        "最小视图状态",
        '{"schemaVersion":2,"sourceFingerprint":"…","viewport":{"x":0,"y":0,"zoom":1},"positions":[],"selectedNodes":[],"detailNode":null}',
      ),
      related: ["manual.layouts", "recovery.sidecar"],
    },
  ),

  e(
    "execution.toolchain",
    "execution-diagnostics",
    "本机编译工具链",
    "运行器调用受支持的 clang 编译当前 C 快照，并把编译与执行阶段分开报告。",
    [
      "工具链检查确认 clang 路径与版本，但不会绕过源码校验。编译产物位于受控临时目录并在结束后清理。",
      "编译失败只返回诊断，不启动程序；诊断位置映射回 UTF-16 源码范围和对应积木节点。",
    ],
    { related: ["execution.diagnostics", "recovery.compile-failure"] },
  ),
  e(
    "execution.trust",
    "execution-diagnostics",
    "可信执行确认",
    "首次运行或风险边界变化时，应用明确提醒本机 C 程序不是强隔离沙箱，并要求用户确认。",
    [
      "确认只授权当前受控运行流程，不授予 renderer 任意 shell 或文件系统能力。预览、解析和教学模拟不等于执行。",
      "来源不明的 C 仍可能消耗资源或调用系统能力。运行前应检查源码，并保留资源限制。",
    ],
    {
      featureLink: link("打开运行面板", "run", "run"),
      related: ["execution.resource-limits", "recovery.runtime-limit"],
    },
  ),
  e(
    "execution.resource-limits",
    "execution-diagnostics",
    "运行资源限制",
    "运行器限制墙钟时间、输出字节、进程数量和临时资源，超限时终止进程组并报告明确原因。",
    [
      "限制用于降低失控循环、输出洪泛和子进程扩散的影响，但不能把本机执行变成完整安全沙箱。",
      "终止原因与正常非零退出分开显示。输出被截断时保留标记，避免把不完整文本当作完整结果。",
    ],
    { related: ["recovery.runtime-limit", "c.undefined-behavior"] },
  ),
  e(
    "execution.diagnostics",
    "execution-diagnostics",
    "编译与运行诊断",
    "诊断包含阶段、严重级别、消息和源码位置，并可关联最具体的流程节点。",
    [
      "error 通常阻止编译；warning 提示潜在问题但可能仍生成程序。stderr 是程序输出通道，不自动等于编译错误。",
      "先修复第一条根因诊断，再重新编译。后续错误可能只是解析器在错误上下文中的级联结果。",
    ],
    { related: ["recovery.compile-failure", "manual.inspectors"] },
  ),
  e(
    "execution.trace",
    "execution-diagnostics",
    "受限执行轨迹",
    "Trace 使用临时影子源码插桩记录节点事件，不修改项目 main.c，并按 session 增量读取。",
    [
      "轨迹只对应当前源码和这一次运行；达到事件数或数据上限后会明确截断，并且可以随时取消。",
      "界面持续刷新并高亮真实路径。源码一旦改变，旧轨迹立即失效，避免拿旧结果解释新代码。",
    ],
    { related: ["execution.real-vs-simulation", "execution.metrics"] },
  ),
  e(
    "execution.real-vs-simulation",
    "execution-diagnostics",
    "真实运行与教学模拟",
    "真实运行由 C 条件和输入决定路径；教学模拟允许选择分支以解释结构，但不能冒充程序实际执行。",
    [
      "真实模式可以关联 stdout、终止原因和资源指标。模拟模式只改变可视回放和提示，不写入真实性能历史。",
      "若案例输入声明目标分支，运行后还要验证轨迹确实经过该分支，否则案例不成立。",
    ],
    { related: ["canvas.branching", "examples.branch-scenario"] },
  ),
  e(
    "execution.metrics",
    "execution-diagnostics",
    "时间与内存指标",
    "每次运行分别记录编译时间、墙钟时间、峰值 RSS、输出量、节点数和终止原因，不合成虚假总分。",
    [
      "一次运行受系统负载影响，只能描述该次样本。比较必须绑定同一源码、工具链、参数和案例。",
      "Big-O 描述输入增长趋势，毫秒和内存字节描述实测资源；两者必须分栏展示并注明证据。",
    ],
    { related: ["execution.benchmark", "algorithms.big-o"] },
  ),
  e(
    "execution.benchmark",
    "execution-diagnostics",
    "Benchmark 模式",
    "Benchmark 对多个输入规模重复运行并使用中位数，结合操作计数观察增长曲线。",
    [
      "先预热并固定输入生成器，再比较相同环境中的中位数。不要用一次最快结果代表稳定性能。",
      "增长曲线只能辅助判断复杂度；编译优化、缓存、分配器和输入分布都会影响实测常数。",
    ],
    { related: ["algorithms.big-o", "algorithms.amortized", "examples.sort-benchmark"] },
  ),

  e(
    "recovery.parse-recovery",
    "recovery",
    "解析恢复",
    "源码存在缺失标点或错误节点时，文本仍可编辑和保存，但结构化写操作会暂停。",
    [
      "查看第一处语法错误附近的括号、分号和声明。修复后等待重新解析，投影会自动更新。",
      "不要删除 raw 节点来隐藏错误；raw 保存的是无法安全结构化的原文。",
    ],
    { related: ["manual.code-editor", "canvas.locked-regions"] },
  ),
  e(
    "recovery.stale-snapshot",
    "recovery",
    "过期源码快照",
    "补丁、连线和布局都绑定源码 fingerprint 或 revision，源码变化后旧计划必须丢弃。",
    [
      "重新选择当前节点并重新生成计划。系统拒绝把旧坐标补丁套到长度相同但内容不同的源码。",
      "过期拒绝不会修改源码；它是并发编辑和异步结果的保护边界。",
    ],
    {
      audience: "developer",
      related: ["canvas.connection-gate", "manual.autosave"],
    },
  ),
  e(
    "recovery.partial-cfg",
    "recovery",
    "不完整 CFG",
    "unsupported control flow、解析错误或不透明语法会让所属函数 CFG 标记 partial。",
    [
      "partial 函数的流程节点和边全部锁定，分析结果不会声称完整。仍可在代码面板修复并正常尝试编译。",
      "修复原因 range 后重新解析；不要通过强制连线绕过 partial 标记。",
    ],
    { related: ["canvas.locked-regions", "execution.diagnostics"] },
  ),
  e(
    "recovery.compile-failure",
    "recovery",
    "编译失败",
    "clang 失败时程序不会启动，运行面板保留诊断、命令阶段和源码位置。",
    [
      "从第一条 error 开始，确认头文件、声明、类型和链接符号。修复后重新编译，不复用旧二进制。",
      "warning 不是自动失败，但内存、符号转换和未初始化警告应在算法验证前处理。",
    ],
    { related: ["execution.toolchain", "std.assert"] },
  ),
  e(
    "recovery.runtime-limit",
    "recovery",
    "超时、输出或进程超限",
    "资源监督器在程序超过边界时终止整个进程组，并区分 timeout、output-limit 和 process-limit。",
    [
      "无限循环先检查循环变量和终止条件；输出洪泛先减少循环内打印；子进程扩散应删除系统调用。",
      "超限结果不是算法输出，不能与成功样本做性能比较。",
    ],
    { related: ["execution.resource-limits", "c.loops"] },
  ),
  e(
    "recovery.disk-conflict",
    "recovery",
    "磁盘版本冲突",
    "同一文件在应用外被修改后，自动保存会停止覆盖并要求你明确重新载入。",
    [
      "先复制未保存代码，再比较磁盘版本。选择重载会采用磁盘事实源，不能静默合并不确定文本。",
      "需要协作历史时使用 Git；冲突保护只避免单机误覆盖，不替代版本控制。",
    ],
    { related: ["manual.autosave", "manual.source-authority"] },
  ),
  e(
    "recovery.sidecar",
    "recovery",
    "布局 sidecar 损坏",
    "flow-view.json 无效或属于旧源码时，只重置坐标和面板布局，绝不修改 main.c。",
    [
      "删除或忽略损坏 sidecar 后可重新生成默认布局。未知版本、异常坐标和未知节点都会 fail-closed。",
      "源码仍由 main.c 和 entry 元数据管理；sidecar 不是源码备份。",
    ],
    {
      audience: "developer",
      related: ["canvas.view-state", "manual.layouts"],
    },
  ),

  e(
    "extension.manifest",
    "extension-api",
    "WorkbenchModuleManifest",
    "每个模块用稳定 id、语义版本、显示标签和 capability 列表声明身份。",
    [
      "id 必须符合稳定标识符规则并全局唯一；version 必须是合法语义版本。capability 只用于发现，不授予执行权限。",
      "manifest 注册后被深拷贝冻结，调用方后续修改原对象不会改变注册表。",
    ],
    {
      example: code(
        "typescript",
        "模块清单",
        'const manifest = { id: "course.graphs", version: "1.0.0", label: "图算法", capabilities: ["course.graphs"] };',
      ),
      related: ["extension.module-definition", "extension.registry"],
    },
  ),
  e(
    "extension.module-definition",
    "extension-api",
    "WorkbenchModuleDefinition",
    "模块定义把 manifest 与各类可选静态贡献数组组合，不能携带 DOM、Electron handle 或任意执行代码。",
    [
      "可贡献 inspectorViews、dockGroups、dockMenus、panels、layoutPresets、pages、commands 和 algorithmElements。",
      "未提供的数组按空数组规范化；一次 registerAll 会先验证整批定义，再原子提交。",
    ],
    { related: ["extension.manifest", "extension.registry"] },
  ),
  e(
    "extension.inspector",
    "extension-api",
    "InspectorViewContribution",
    "检查器贡献使用 id、label 和 order 注册右侧解释、编辑或运行类视图的可发现元数据。",
    [
      "id 全局唯一，order 决定稳定排序。接口不包含渲染函数，实际视图必须由受信任应用代码挂载。",
      "注册快照会附加 moduleId 形成 RegisteredInspectorView，便于追踪所有者。",
    ],
    { related: ["manual.inspectors", "extension.registry"] },
  ),
  e(
    "extension.dock-group",
    "extension-api",
    "DockGroupContribution",
    "导航分组贡献使用 id、label 和 order 定义页面所属的稳定工作台分组。",
    [
      "WorkbenchPageContribution 的 groupId 必须引用已注册分组；注册表在提交整批模块前验证该关系。",
      "分组只影响发现和排序，不创建页面、菜单或执行权限。内建 home、core、inspect、execute 和 learn 都使用此契约。",
    ],
    { related: ["extension.page", "extension.registry"] },
  ),
  e(
    "extension.dock",
    "extension-api",
    "DockMenuContribution",
    "Dock 菜单贡献包含根菜单 id、label、order，以及带 actionId 的 DockMenuBranchContribution 分支。",
    [
      "根菜单 ID 与每个分支 ID 都必须全局唯一。actionId 是静态路由标识，不直接执行任意函数。",
      "分支 order 控制菜单内顺序；当前内建 Library 的 11 个分支由同一契约声明。",
    ],
    { related: ["manual.library", "extension.registry"] },
  ),
  e(
    "extension.panel",
    "extension-api",
    "PanelContribution",
    "面板贡献声明 id、label、region、order 和 defaultVisible，region 仅允许 left、center、right、bottom 或 floating。",
    [
      "面板元数据决定布局发现和默认可见性，不持有真实 HTMLElement。宿主负责创建、销毁和权限边界。",
      "布局预设只能引用已经注册的 panel id，否则整批注册失败。",
    ],
    { related: ["manual.layouts", "extension.layout"] },
  ),
  e(
    "extension.layout",
    "extension-api",
    "LayoutPresetContribution",
    "布局预设使用 id、label、order 和 panelIds 描述一组面板组合。",
    [
      "注册表验证每个 panelIds 引用存在。预设只切换显示和比例，不能修改源码或运行状态。",
      "学习、搭建、调试、分析和极简布局都是此静态贡献的内建实例。",
    ],
    { related: ["extension.panel", "manual.layouts"] },
  ),
  e(
    "extension.page",
    "extension-api",
    "WorkbenchPageContribution",
    "页面贡献声明稳定 id、label、groupId 和 order，并必须引用已注册的 DockGroupContribution。",
    [
      "groupId 决定页面在工作台导航中的逻辑分组。注册表在原子提交前验证跨模块分组引用。",
      "页面贡献不包含路由实现或 DOM；宿主仍需为该 page id 提供明确挂载点。",
    ],
    { related: ["extension.dock-group", "extension.registry"] },
  ),
  e(
    "extension.command",
    "extension-api",
    "CommandContribution",
    "命令贡献只声明 id、label 和 order，作为可发现命令的静态契约。",
    [
      "命令 id 全局唯一。当前接口不接受回调，因此第三方元数据不能绕过应用权限调用文件或进程。",
      "未来命令执行器必须单独定义授权、输入验证、取消和错误边界。",
    ],
    { related: ["extension.module-definition", "extension.registry"] },
  ),
  e(
    "extension.algorithm-element",
    "extension-api",
    "AlgorithmElementDefinition",
    "算法元素贡献使用 type、version、label 和 category 描述可扩展算法节点类型。",
    [
      "type 是全局唯一稳定标识，version 描述数据契约。它只定义元数据，不等于一段可直接运行的 C。",
      "生成源码、端口规则和迁移策略必须由后续受信任实现显式提供并通过解析门。",
    ],
    { related: ["manual.presets", "extension.registry"] },
  ),
  e(
    "extension.registry",
    "extension-api",
    "WorkbenchModuleRegistry",
    "注册表提供 register、registerAll、能力查询和不可变 snapshot，并对所有贡献 ID 做确定性冲突检查。",
    [
      "registerAll 先规范化并占用临时 ID 集合；任一冲突或悬空引用会让整批失败，不留下半注册状态。",
      "snapshot 按 order、label 和 id 稳定排序，并为贡献附加 moduleId。它是发现层，不是插件代码加载器。",
    ],
    {
      example: code(
        "typescript",
        "原子注册",
        "const registry = new WorkbenchModuleRegistry();\nregistry.registerAll([courseModule]);\nconst snapshot = registry.snapshot();",
      ),
      related: ["extension.module-definition", "extension.manifest"],
    },
  ),

  e(
    "onboarding.dashboard",
    "onboarding",
    "第一步：创建或打开条目",
    "从 Dashboard 新建项目、沙箱或测试，或整行单击最近条目直接进入工作区。",
    [
      "第一次学习建议使用沙箱，确认思路后再建立项目。命名应说明算法和用途，例如 binary-search-lab。",
      "确认文件状态显示已保存，再进入搭建。所有条目都位于 Documents 专属目录。",
    ],
    { related: ["manual.dashboard", "manual.workspace-kinds"] },
  ),
  e(
    "onboarding.presets",
    "onboarding",
    "第二步：选择预设",
    "在预设块中按阶段或类别查找开始、变量、条件、循环、输入输出和算法模板。",
    [
      "先阅读预设用途和放置范围，再拖到画布形成草稿。初学阶段避免一次加入过多结构。",
      "预设只是起点；最终应能解释每一行 C 和每一条控制边。",
    ],
    { related: ["manual.presets", "canvas.drafts"] },
  ),
  e(
    "onboarding.canvas",
    "onboarding",
    "第三步：组织画布",
    "移动紧凑节点建立清晰阅读顺序，并用端口识别真实 CFG，而不是按视觉位置猜执行顺序。",
    [
      "单击节点只选择，拖动用于布局；双击节点或按 Enter 才打开详情。锁定节点应先回到代码面板修复。",
      "使用框选和布局分隔条调整工作区，不要通过拖动位置试图改变程序语义。",
    ],
    { related: ["canvas.free-layout", "canvas.control-ports"] },
  ),
  e(
    "onboarding.code",
    "onboarding",
    "第四步：核对 C 源码",
    "在代码面板检查积木对应的精确 C，并确认变量声明、边界条件和 return 路径。",
    [
      "遇到不理解的 token 先在 C 语法词典搜索。解析错误时从第一处错误修复。",
      "任何结构改动都先阅读 diff；不要在不清楚含义时确认大范围补丁。",
    ],
    { related: ["manual.code-editor", "c.statement"] },
  ),
  e(
    "onboarding.run",
    "onboarding",
    "第五步：运行与输入",
    "确认本机执行边界，填写最小正常输入、边界输入和错误倾向输入，再编译运行。",
    [
      "先验证输出正确，再观察路径和指标。一次成功样本不能证明算法对所有输入正确。",
      "超时或输出超限时先停止运行，检查循环和打印位置，不要连续重试同一错误程序。",
    ],
    { related: ["execution.trust", "examples.test-matrix"] },
  ),
  e(
    "onboarding.review",
    "onboarding",
    "第六步：诊断与复盘",
    "把编译诊断、真实路径、耗时、内存和复杂度推理分开记录，形成可复现结论。",
    [
      "点击提示定位节点，但要求每条优化建议给出源码或运行证据。Big-O 结论需要说明输入规模变量。",
      "保存案例输入和期望输出；优化后用相同基准重复测试，避免比较不同条件。",
    ],
    { related: ["execution.metrics", "algorithms.big-o"] },
  ),
  e(
    "onboarding.library",
    "onboarding",
    "随时返回 Library",
    "第一课提供可恢复的真实操作路线，Library 提供可重复检索的功能、语法、数据结构和算法参考。",
    [
      "Dock 的 Library 分支可直接跳到对应词典。搜索支持中文、英文别名、关键词和示例代码。",
      "选择“开始第一课”会新建专用教学沙箱，不会覆盖已有项目、源码或布局。",
    ],
    {
      featureLink: link("重新打开 Library", "software-library", "software-library"),
      related: ["manual.library", "onboarding.dashboard"],
    },
  ),
];

interface EntryOptions {
  readonly aliases?: readonly string[];
  readonly keywords?: readonly string[];
  readonly example?: LibraryEntryInput["example"];
  readonly related?: readonly string[];
  readonly featureLink?: LibraryEntryInput["featureLink"];
  readonly audience?: LibraryEntryInput["audience"];
  readonly syntax?: LibraryEntryInput["syntax"];
  readonly complexity?: LibraryEntryInput["complexity"];
  readonly pitfalls?: LibraryEntryInput["pitfalls"];
}

function e(
  id: string,
  branchId: LibraryEntryInput["branchId"],
  title: string,
  summary: string,
  details: readonly string[],
  options: EntryOptions = {},
): LibraryEntryInput {
  return {
    id,
    branchId,
    title,
    summary,
    details,
    aliases: options.aliases,
    keywords: options.keywords,
    example: options.example,
    relatedEntryIds: options.related,
    featureLink: options.featureLink,
    audience: options.audience,
    syntax: options.syntax,
    complexity: options.complexity,
    pitfalls: options.pitfalls,
  };
}

function link(label: string, pageId: string, targetId: string) {
  return { label, pageId, targetId } as const;
}

function code(language: "c" | "typescript" | "json" | "text", caption: string, value: string) {
  return { language, caption, code: value } as const;
}
