# 《C 积木算法面板》开发提示词 v1

> **用法**:新建空项目目录,把这份文档存为 `CLAUDE.md`(或整个作为首条消息)交给 Claude Code。按里程碑 M0→M9 推进,每个里程碑的验收命令全绿才能进入下一个,不许跳。
>
> 文中所有标注【实测】的结论,是 2026-07 在本机(macOS 27 / Apple Silicon / Apple clang 21 / web-tree-sitter 0.26.10 + tree-sitter-c 0.24.1)用探针脚本验证过的事实:直接采信,不要重新调研。M9 起构建规约已迁移到 Node 24 LTS,工具链支持 Apple clang 17.x–21.x;这些较新的发布规约覆盖下文残留的历史环境描述。标注【规约】的条目是强制约束,违反即返工。

---

## 0. 项目定位

给 COMP10002(C 语言算法课)学生做的 **macOS 本地 Electron 算法学习应用**:导入 C 代码 → 呈现为可视化积木结构 → 点击积木/代码互相高亮 → 受控地编辑积木反向修改代码 → 叠加确定性的程序分析(CFG、数据流、内存风险)与算法模式识别(线性搜索/二分/排序……,带置信度)→ 通过测试、执行轨迹、复杂度与正确性论证形成学习闭环 → AI 默认只解释和教学;用户在设置中显式授权后,才可经同一验证、diff、检查点和撤销管线提议或应用修改。

**北极星**:宁可显示"无法确定,保留原始 C",也绝不生成看起来漂亮但已经改变语义的积木。错误的算法标签对学习者是毒药,宁可漏报。

---

## 1. 不可协商的转换契约

**v1 输入边界【规约】**:输入是 UTF-8 编码(可带 BOM)、不超过 512 KiB 的单个 `.c` 翻译单元;CRLF/LF 原样保留。结构化投影的承诺范围是受支持的 Apple clang 17.x–21.x 以 `-std=c17` 接受的 C17 核心语法,加 D2 明列的预处理形式。v1 不解析项目本地头文件、不做跨文件符号解析、不承诺 GCC/Clang 扩展或任意构建参数的结构化投影;这些内容仍可导入,但不支持的最小源码区间必须降级为原始 C 积木。非 UTF-8 或超限文件必须给出明确错误,禁止以替换字符静默解码。这里的“可导入”不等于“全部结构化”或“可独立编译”。

1. 任意符合上述输入边界的源码文本都能导入;包含不支持或非法片段时也不许崩溃,必须按契约 2 降级。
2. 无法识别语义 → 语法积木;无法安全拆解 → 原始 C 积木(原文切片)。**绝不静默丢失任何一个字符**。
3. 绝不为积木美观改变程序语义;绝不强行贴算法标签。
4. 未编辑区域的注释、空白、源码位置逐字符保留。
5. 代码 → 积木 → 代码(零编辑)输出与原文件**逐字节相等**。
6. 积木编辑后:重解析必须无新增 ERROR/MISSING 节点(硬门禁);语义保持型编辑(如重命名)还必须通过 clang 编译 + 原 I/O 测试逐字节对比。
7. 所有推断(算法标签、风险警告、变量含义)必须带置信度分级展示。
8. 低置信度推断只进"可能的角色"侧面板,绝不上标签。
9. 可能改变语义的操作必须先给用户看 diff、经确认才执行。
10. 核心转换 100% 确定性;AI 不参与解析、类型检查、权威代码生成或语义等价判定。AI 产生的文本或补丁始终是不可信候选,只有现有确定性写管线验证通过后才可能生效。
11. 代码暂时无法解析时:积木面板保持上一棵有效树的展示 + 顶部横幅提示,反向同步(积木→代码)暂停。

---

## 2. 已定架构决策(经对抗审稿验证,不要重新讨论)

**D1 · 文本是唯一事实源,积木是投影。** 积木层只持有 CST 节点的 range(见 R1 索引规约),永不复制或重新生成未编辑区域的文本。积木编辑一律编译为对源码 range 的最小文本补丁,补丁后重解析刷新视图。**永远不做"从积木重新生成整个文件"**——这是契约 4/5 唯一能无条件成立的架构。

**D2 · 解析骨架 = web-tree-sitter@0.26.10 + tree-sitter-c@0.24.1。**【实测】两者兼容(语言 wasm ABI 15);tree-sitter-c 的 npm 包自带预编译 `tree-sitter-c.wasm`(约 626KB),无需 emscripten 自建;注释是显式 `comment` 节点、range 精确;ERROR/MISSING 容错;增量解析 `tree.edit()` + `parser.parse(newText, oldTree)` 可用。不用 libclang 做主干(无良好浏览器 WASM 发行、AST 丢注释与排版、体积大);不自写 parser(C 声明语法+错误恢复是数年工程量)。clang 的价值通过本机 CLI 获得(见 D8)。**预处理策略(不自建预处理器)**:`#include` → "声明来源"占位积木;`#define` 对象宏 → 语法积木,宏名进用户宏表(纯整型的参与 §5.4 常量折叠),使用点悬浮显示"= 值",**绝不参与解析**;`#ifdef/#ifndef` 分支内代码照常出积木(【实测】正常成树),外套"条件编译"包装积木;函数式宏定义与 `#if` 表达式块 → 原始 C 积木;函数体内出现条件编译 → 该函数只出语法积木和 CFG,不跑算法识别。

**D3 · 不用 Blockly,自研嵌套 DOM/CSS 积木渲染器。**【已查证】Blockly 核心只有 blocks→text 生成器,无 text→blocks;2025-11 移交 Raspberry Pi Foundation 后路线图是无障碍而非文本同步;业界唯一成规模的双向方案 MakeCode 是在 Blockly 之外自写整套 decompiler,且为"整文件重生成 + 灰积木兜底"模式——正是契约 4 禁止的路径。自研渲染器采用 frame-based editing 思路:语句 = 垂直列表,嵌套 = 缩进容器,表达式 = 行内槽,DOM 顺序即代码顺序。

**D4 · 积木只有两种互斥投影:语法积木和原始 C 积木。"算法积木"是 overlay 标注层。** 算法识别结果只是包住一组语法积木的可折叠壳 + 徽章(`{patternId, confidence, coveredRange, roles}`),纯元数据,永不改字节、永不锁定编辑。识别失败 = 没有徽章,视图与编辑完全不受影响——降级零成本,且天然满足契约 3。

**D5 · 编辑唯一原语:`replace(range, newText)` → 重解析。** 所有积木操作(改字面量、换运算符、插删语句、包裹解包、拖动)都编译成一组 span 补丁,经 CodeMirror 6 单事务 dispatch。

**D6 · undo/redo 全部收敛到 CodeMirror 6 历史。** 一个逻辑积木操作 = 恰好一个 CM6 事务(单事务多 change,坐标全在旧文档系),打 `userEvent` 注解防止与打字合并。undo 积木操作 = 回放文本逆补丁 → 重解析 → 刷新,与撤销手工打字走同一条管线。不建第二套积木历史栈。

**D7 · 应用形态从 M0 起就是 Electron + Vite + TypeScript。** renderer 负责 CodeMirror、积木 UI 与浏览器 WASM 解析;Electron main 负责文件对话框、clang、受限运行、项目持久化和 Ollama 调用;preload 只通过 `contextBridge` 暴露窄而有类型的 `window.panelApi`。进程间只用 `ipcRenderer.invoke`/`ipcMain.handle`,**不建本地 Node API 服务,不暴露 HTTP 业务端点**;开发态允许 Vite 临时监听 loopback 供热更新,打包态必须走 `file://` 且不监听端口。renderer 必须 `contextIsolation:true`、`sandbox:true`、`nodeIntegration:false`;main/IPC 不可达时投影与编辑继续可用,编译、运行、诊断、AI 按钮显式禁用并展示原因。`npm run dev` 必须直接启动桌面窗口,不是要求用户打开浏览器。

**D8 · 合法性 oracle 永远是 clang,tree-sitter 只管投影定位。** tree-sitter 是容错解析器,它接受的代码 clang 未必接受;绝不用 tree-sitter 判定合法性。

**D9 · 分析引擎 = 纯确定性四层管线**(详见 §5):语句级 CFG → 变量级到达定义 def-use → 唯一句柄 typestate 内存分析 → 归一化 IR 上的算法规则引擎。全部输出 `Object.freeze`;分析包无任何写 API;补丁引擎在依赖图上**禁止 import 分析包**(lint 规则强制)。

**D10 · AI 物理隔离,默认只读,写入须显式授权。** 详见 §8 和 ADR-0006;M8 的学习闭环可以消费 AI 解释,但不得把 AI 变成核心能力的硬依赖。允许修改不等于直接文件写权限:`src/ai/` 仍不得导入核心写接口,候选修改必须交给应用层既有的源码 revision、diff、重解析、CFG/clang 后置条件、检查点与撤销边界。

---

## 3. 技术栈与版本锁定

| 组件 | 版本(锁死) | 备注 |
|---|---|---|
| Node.js | 24.x LTS | 仅开发工具和 Electron main;打包后用户不需安装 Node |
| npm | 11.11.0 | 只用 `npm ci`,提交 lockfile v3 |
| @types/node | 24.13.3 | Node 24 LTS 类型声明 |
| Electron | 43.0.0 | macOS 本地应用、main/preload/renderer 三进程边界 |
| web-tree-sitter | 0.26.10 | 具名导出 `{ Parser, Language }`;ESM + `.cjs` 双发行 |
| tree-sitter-c | 0.24.1 | 包根自带 `tree-sitter-c.wasm`(ABI 15) |
| codemirror | 6.0.2 | decoration 高亮、单事务多 change、history |
| vite | 8.1.3 | renderer 与 preload 构建 |
| typescript | 7.0.2 | 全工程 `strict:true` |
| vitest | 4.1.10 | 纯逻辑、main/preload 与 IPC 单元/集成测试 |
| fast-check | 4.9.0 | 属性测试 + fuzz 驱动 |
| dependency-cruiser | 17.4.3 | 用于 D9/D10 依赖边界；升级必须重跑完整架构门禁 |
| @playwright/test | 1.61.1 | Electron 自动 E2E;不以人工冒烟代替验收 |
| electron-builder | 26.15.3 | M9 arm64 `.dmg` 打包 |
| concurrently | 10.0.3 | 开发态编排 Vite 与 Electron,不进入产品运行架构 |
| prettier | 3.9.5 | 格式化;CI 只检查不自动改写 |
| Apple clang | 21.0.0 | 由 `xcrun --find clang` 探测的外部系统依赖 |

`package.json` 的全部直接依赖必须写精确版本,禁止 `^`/`~`/`latest`;提交 `package-lock.json`,本地与 CI 均以 `npm ci` 安装。上表版本需要变更时,先提交独立的工具链升级变更并重跑 M0–当前里程碑全部验收,不得在功能提交中顺手漂移。

本机工具链 gate 固定先执行 `/usr/bin/clang --version`,找不到或版本不在 Apple clang 17.x–21.x 时必须显示“工具链不可用/未验证”并禁用编译、运行、诊断与 trace,绝不悄悄换 gcc。【M9 兼容性修正】`/usr/bin/clang` 在 Seatbelt 内会再走 xcrun/xcodebuild并尝试写宿主 `xcrun_db-*`,不可直接拿来执行编译;main 必须在目标沙箱外用固定 `/usr/bin/xcrun --no-cache --find clang` 和 `--no-cache --sdk macosx --show-sdk-path` 解析 clang/SDK,对两者 `realpath`,验证均位于同一受信 Apple Developer root、`/usr/bin/clang` 与解析出的 clang 主版本一致,并验证动态 `--print-runtime-dir` 与该主版本匹配,再在 Seatbelt 内直接调用该 clang 并显式传 `-fintegrated-cc1 -isysroot <validated-sdk>`。解析、realpath、root、版本或 Seatbelt canary 任一失败即禁用工具链,不得放宽到系统 temp 可写。普通构建其余固定参数为 `-std=c17 -O0 -g0 -Wall -Wextra -Wpedantic -fno-color-diagnostics`;静态诊断追加 `-fsyntax-only`;R13 的 sanitizer/plain 两套参数在各自脚本中集中定义,禁止散落 magic flags。所有工具调用都用 `spawn(executable,args,{shell:false})`。

**已查证的坑(照抄官方文档会翻车的地方)**:

- 【实测】0.26 的运行时文件名是 `web-tree-sitter.wasm`;官方 README 里 `cp node_modules/web-tree-sitter/tree-sitter.wasm public` 是过时旧名,照抄 404。两枚锁定 WASM vendored 到 `resources/wasm/`,再由 Vite `?url` 各自生成唯一的哈希资产;`Parser.init({ locateFile: () => runtimeWasmUrl })` 显式指定运行时。构建门禁必须同时验证 npm 源文件、vendored 副本与两个构建产物逐字节一致。
- 【实测】`Language.loadSync` **不存在**,只有 `await Parser.init()` + `await Language.load(path)`。
- 【实测】Electron renderer 中 `Language.load(stringUrl)` 会误入 Node 文件路径分支;语言 WASM 必须先按 URL 读取为 `Uint8Array`,再传给 `Language.load(bytes)`。生产 `file://` 与开发 HTTP 两条加载路径都要由真实 Electron E2E 覆盖。
- 【实测】当前 CSP 下 WebAssembly 编译需要 `script-src 'wasm-unsafe-eval'`;只加入这一枚窄 token,仍明确禁止 `'unsafe-eval'` 与 `'unsafe-inline'`。
- 【实测】`node.hasError / isError / isMissing` 自 0.25 起是**属性**不是方法。
- 【实测】`@vscode/tree-sitter-wasm` **不含 C 语言**,别用;直接用 tree-sitter-c 包自带的 wasm。
- 【实测】Tree/Query 是 WASM 堆对象,需要手动 `.delete()` 释放;防抖策略下新旧树并存,旧树不释放会稳定泄漏。

初始化样板(【实测】可运行):

```ts
import { Parser, Language } from 'web-tree-sitter';
import runtimeWasmUrl from '../resources/wasm/web-tree-sitter.wasm?url';
import languageWasmUrl from '../resources/wasm/tree-sitter-c.wasm?url';
await Parser.init({ locateFile: () => runtimeWasmUrl });
const languageWasm = await readWasmBytes(languageWasmUrl); // 同时支持 HTTP 与 file://
const C = await Language.load(languageWasm);
const parser = new Parser();
parser.setLanguage(C);
let tree = parser.parse(src);
// 增量:tree.edit({startIndex, oldEndIndex, newEndIndex, startPosition, oldEndPosition, newEndPosition});
// tree = parser.parse(newSrc, tree);  // 用完的旧树 .delete()
```

**工程约定**:

- 目录结构:`src/core/`(投影器 + 补丁引擎,零 DOM 依赖,纯函数为主)、`src/analysis/`(CFG/def-use/内存/规则引擎)、`src/ui/`(积木渲染 + CodeMirror)、`src/ai/`(M7,只读教学 UI)、`electron/main/`(文件、工具链、运行、持久化、Ollama)、`electron/preload/`(窄 IPC bridge)、`tests/e2e/`、`samples/`、`corpus/regressions/`、`scripts/`、`resources/wasm/`。
- TypeScript `strict: true`;Prettier 默认配置。
- D9 的依赖禁令用 **dependency-cruiser** 强制:`src/core/`(补丁/emitter 路径)禁止 import `src/analysis/`;`src/ai/` 禁止 import `src/core` 的写接口。规则进 `npm test`。
- renderer wasm 接线的验收形态:`scripts/verify-wasm-assets.mjs` 静态检查 Vite/TypeScript 构建产物包含两枚 wasm;随后 Playwright 启动 Electron,在真实 renderer 中执行 `Parser.init()` 并 parse `hello.c`,断言无资源加载错误。M1 起纳入验收,禁止用仅检查文件存在替代真实加载。

---

## 4. 关键实现规约(每条都是审稿实测踩出来的坑)

**R1 · 索引单位 = UTF-16 码元,不是字节。**【实测】web-tree-sitter 解析 JS 字符串时 `startIndex/endIndex` 是原始 JS 字符串的 UTF-16 code unit 偏移;含中文注释的文件里它**不等于** UTF-8 字节偏移(`// 中文注释` 是 7 码元 / 15 字节)。另一个容易漏掉的边界是:CM6 的逻辑文档把 LF、CR 和 CRLF 都计作 1 个换行位置,所以 CRLF 在 SourceDoc 中占 2 个码元、在 CM6 中只占 1 个位置,两域不能直接互用。【规约】(a) 全代码库术语统一叫 `range`(源码码元),禁止叫 byte range;(b) SourceDoc range 与 CM6 pos 之间必须经预扫描的 CRLF 坐标映射转换,编译/round-trip 永远使用原始 source;(c) 禁止用 Buffer 字节切片做任何断言或补丁(逐字节比较只允许对完整文件的 rebuild===src 用);(d) clang 诊断的列号是**字节**基准——回贴积木前必须做"该行 UTF-8 前缀字节数 → 码元"换算,落盘/读盘同理。

**R2 · ERROR 恢复必须"挖掘"而不是"整块降级"。**【实测】`#if 0` 包住写坏的代码、或不配对花括号,会产生一个从错误点延伸到文件末尾的顶层 ERROR 节点,把后面完全合法的 `main()` 整个吞进去——而"用 `#if 0` 注释掉坏代码"恰是学生最常见操作。【规约】降级算法:遇到 ERROR 节点,**递归进入其内部,把结构完整(hasError=false)的子树(function_definition、declaration 等)照常映射为语法积木,只把真正碎掉的 token 区间降级为原始 C 积木**。禁止"最小语句级祖先整体降级"这种一刀切。

**R3 · 注释吸附规则(确定性、表驱动;归属数据 M1 落地,移动语义 M3 落地)。**【实测】函数上方的 doc 注释是 translation_unit 层的兄弟节点,不在 function_definition 的 range 内;comment 是 extra 节点,可合法出现在任意两个 token 之间(如 `a + /*x*/ b`)。【规约】(a) 前导注释(紧邻上方、无空行分隔)吸附到后继积木;行尾注释吸附到所在行语句;函数顶部 doc 注释吸附到函数积木;(b) **多行块注释默认不随语句移动**(保守);(c) 移动/删除积木的"扩展区间"包含其吸附注释;(d) 补丁拼接缝(加括号、插模板)遇到缝内 extra 注释节点时,注释必须完整留在原语义侧,不许被括号隔断。积木视图必须把注释渲染为可见附注,不许吞。

**R4 · 运算符替换的括号化检查必须双向。**【实测反例】`return a + b + c;` 选外层 `+` 换成 `*`,只做 token 替换得 `a + b * c`,解析为 `a + (b*c)`,而用户操作语义是 `(a+b)*c`——静默改语义。【规约】除父上下文最小优先级检查外,还要比较新运算符要求的**操作数侧**最小优先级与每个现有操作数的顶层优先级(含结合性:左结合运算符的右操作数同优先级也要括号),不足则给该操作数 range 补括号。此规则必须有专门单测矩阵(全部二元运算符 × 左右操作数形态)。

**R5 · 悬垂 else 防护。**【实测反例】对 `if (a) b = 1; else c = 1;` 的 then 分支执行"包裹进 if(cond){…}",新内层 if 会捕获外层的 else,行为改变。【规约】包裹目标是某 if 的无括号 then/else 子语句时,先给外层补 `{}`(作为同一事务的显式改动);解包做对称审查(去壳后暴露的 if 是否会捕获外部 else)。

**R6 · 语句"扩展区间"只在语句独占一行时启用。**【规约】(a) 语句前只有空白、后只有空白/行尾注释 → 扩展区间 = [行首缩进, 行尾换行];否则退化为精确节点区间;(b) 一行多语句(`int a=1; int b=2;`)时整行插删操作直接**拒绝**并提示;(c) 拖走无大括号控制体的唯一子语句(`if (x) foo();` 拖走 `foo();`)必须回填 `;` 占位或先补 `{}`,否则留下悬空 if 头必产 ERROR。

**R7 · 多 change 事务的 tree.edit 坐标。**【实测】错报 edit 位置 tree-sitter 不会自愈,产出与文本错位的坏树,后续补丁从坏树取 range 会连锁损坏源码。【规约】单 change(打字)才走增量解析;**多 change 事务(包裹等积木操作)直接全量重解析**——教学单文件毫秒级,增量是锦上添花不值得冒险。若日后确要增量:按文档序迭代 `iterChanges`,用 `fromB / fromB+(toA-fromA) / toB` 作三元组。另加不变量测试:每次重解析后随机抽节点断言 `node.text === doc.sliceString(node.startIndex, node.endIndex)`。

**R8 · 积木身份键。**【实测】`node.id` 跨增量解析不稳定(编辑函数 g,未动的函数 f 的 id 也会变),不能用。【规约】身份匹配优先级:① 编辑偏移重定位后的 range 精确匹配;② (节点类型 + 文本哈希);③ (类型, 父路径, 兄弟序) 启发式兜底。ID 只承载视图状态(折叠/选中)与徽章锚定,**永不参与代码生成**——错绑最坏后果是丢折叠状态,不是丢代码。徽章 range 在事务间用 `transaction.changes.mapPos` 随编辑映射。

**R9 · 内置符号表是三张表,不是一张(M2 落地,解释面板依赖它)。** 光有库函数签名不够——每个 hello-world 都用 `FILE`、`size_t`(typedef)和 `NULL`、`EOF`、`INT_MAX`(对象宏)。【规约】手写 JSON 三张表:① 库函数签名(stdio/stdlib/string/math/ctype/assert/limits 约 100 个:name、signatureText、header、一句话教学说明);② 标准 typedef 名单(FILE、size_t、time_t、va_list、ptrdiff_t……);③ 标准对象宏名单(NULL、EOF、RAND_MAX、INT_MAX/MIN、SIZE_MAX、EXIT_SUCCESS/FAILURE……)。符号解析兜底链:局部作用域 → 文件作用域 → 用户宏表 → 三张内置表 → "未知外部符号"中性标签(不是错误)。

**R10 · clang 的软硬门禁划分。**【规约】硬门禁(每次编辑必须满足):重解析后 CST 无新增 ERROR/MISSING。软标注(不阻塞编辑):`clang -fsyntax-only -Wall -Wextra` 的诊断经 R1 换算贴回积木——注意 `-fsyntax-only` 做完整语义分析,删掉一条后文还在用的声明是完全合法的中间态编辑,报错不代表操作非法。只有**语义保持型编辑**(重命名、等价改写)才把"clang 通过 + 原 I/O 测试逐字节相同"作为硬验收。

**R11 · 歧义解析的诚实处理(M2 落地)。**【实测】`a * b;`(a、b 均为已声明变量)被 tree-sitter-c 解析成声明(指针 b,类型 a);`foo (bar);` 在 foo 是 typedef 时被解析成函数调用。这类误解析部分**探测不到**(CST 里不出现 type_identifier)。【规约】(a) 能探测的(type_identifier 不在 typedef 表/内置表)→ 积木打"可疑解析"低置信标记 + 提供查看原文;(b) declaration 形态且"类型名"实为已声明变量 → 同上复核;(c) 在文档与 UI 中承认此边界,不承诺"绝不误解析",只承诺"单向可检 + 出错不丢字节"。

**R12 · 受限运行器(macOS 现实版,不是 hostile-code sandbox)。**【实测】macOS 27 无 `timeout`/`gtimeout`;`ulimit -d/-v` 限内存无效(Invalid argument);`ulimit -t` 可作为辅助 CPU 限制,但不能代替 Node 侧 wall-clock 与进程组监督;`ulimit -u` 是当前用户全局限制,不能拿来当单任务进程上限;`spawn(..., {detached:true})` + `process.kill(-pid, 'SIGKILL')` 可连孙进程一并回收,但必须等待 `close`/确认进程组清空后才可报告结束;`sandbox-exec` 存在但属于旧式 Seatbelt 接口,不能据此宣称能安全执行对抗性代码;ASan 的 `detect_leaks` 在 macOS 不支持。

【规约】安全口径固定为 **Seatbelt best-effort + trusted-only fail-closed**。默认模式先用真实 compile/run canary 检查 `sandbox-exec`:探针成功才把编译/运行放进各自独立的最小 Seatbelt profile;探针失败时该请求默认拒绝。只有 Electron main 针对**精确请求摘要**显示原生确认框,且用户明确确认“这是我编写或审阅过的可信代码”后,main 才签发不可经 preload/renderer 构造、不可复用的内部一次性授权,允许该**单次 compile 或 run 请求**走仅资源受限的 trusted-only 路径;public IPC 请求不得含 `trustedAcknowledgement`、布尔确认或可伪造 grant。另提供强制 `trusted-only`(每次都要求原生确认)与 `disabled`(一律拒绝)模式。所有会执行目标工具或二进制的路径(编译、普通运行、批量测试、trace、sanitizer、leaks)共用这个判定与 R12 运行器,不得另开绕行通道。UI 必须显著区分“Seatbelt best-effort”和“无 Seatbelt 的可信代码模式”,并写明“仅运行你编写或审阅过的代码”;禁止出现“可安全运行任意/恶意 C 代码”的宣传。

运行链路 = `mkdtemp` 后立即 `realpath` 的临时目录作唯一可写 cwd + 固定 `runner-limits.sh` 设置 `ulimit -t 2 -f 10240 -n 64` + detached 进程组 + Node 侧 wall-clock 3s 定时终止整个进程组 + stdout/stderr 合计 1 MiB 限额 + **RSS 看门狗**(每 100ms `ps -o rss=` 轮询进程组,超 1 GiB 即杀)+ **进程数看门狗**(同一轮询统计该进程组,超过 64 即杀)。`realpath` 是硬要求:macOS 的 `/var` 会规范化为 `/private/var`,未规范化路径会让 Seatbelt 错误拒绝自己的 workdir。不得用 `ulimit -u` 冒充单任务进程限制。终止后保留 stdin/stdout/stderr 错误监听并进入有界 kill/reap 阶段;只有收到 `close` 或确认进程组已清空后才返回,无法确认则以 process-control failure 失败关闭。全局最多 1 个 active native 任务,并发请求立即返回 `RUNNER_BUSY`,避免逐请求资源上限被并发放大。Seatbelt 路径在上述链路外再套固定 profile(显式拒绝网络,文件写仅允许该临时目录;运行 profile 禁止 fork 与二次 exec,编译 profile只读开放经验证的工具链/SDK;为解析 temp 路径祖先只允许 canonical user temp root 的 `file-read-metadata/file-test-existence`,不得读取其文件内容)。trusted-only 路径明确没有这层隔离。wrapper 是仓库内固定文本,所有用户值只走独立 argv,**禁止把源码、路径、stdin 或 argv 拼进 shell 命令字符串**。临时目录、资源限制、进程组、RSS/进程数监控或清理初始化失败时一律拒绝;只有“Seatbelt 探针失败 + main 为当前请求签发内部一次性授权”允许进入 trusted-only,其他错误不得触发降级。Seatbelt 本身和 trusted-only 都不构成 hostile-code 安全保证。资源失控样本验收判定为“被预期的任一资源机制终止即通过”,不绑定具体信号(墙钟 vs CPU 超时在高负载下会抖动)。

**R13 · 泄漏检测双闸,分开跑。**【实测】对 ASan 编译的二进制跑 `leaks --atExit` 会报零泄漏(ASan 接管了分配器)——两者叠加恰好放过泄漏。【规约】金样本准入 = 两道独立门槛:① `-fsanitize=address,undefined` 构建跑通全部 I/O 用例零报告;② **另行 plain 构建**过 `leaks --atExit -- ./prog` 零泄漏。`leaks --atExit` 必须直接启动目标可执行文件,禁止在中间插入再 `exec` 目标的 shell wrapper(macOS 27 实测只分析 wrapper);按本机 `leaks(1)` 契约以退出码 0/1/>1 分别判定“零泄漏/发现泄漏/工具错误”。样本门禁还必须先运行一个故意泄漏的 plain 正控,确认同一 Runner/Seatbelt 链能得到退出码 1 与明确非零泄漏报告,正控未命中时拒绝相信后续零泄漏结果。【macOS 27 实测修正】ASan/leaks 外层链在整套几十次进程启动中会偶发撞到 3s wall-time,但单独复跑通常远低于 3s;金样本套件只允许消费**全套件唯一一次**纯 wall-time 环境恢复重试,第二次仍失败即拒绝。恢复必须顺序走同一 Runner/Seatbelt 与相同 3s/CPU/RSS/进程/输出上限;已有 sanitizer/非零泄漏证据、其他资源/进程错误、正控与压力样本一律不得重试,且日志必须打印样本、模式与首次 duration。禁止用重试替代真实失败,禁止增加 verification 专用 timeout。

**R14 · 编辑风暴防护(自动补括号配置 M2 落地,可观察编辑与有效树保持 M3 落地)。** 在文件中部敲 `int f() {`,配对 `}` 出现前下半个文件会被解析进 f 的函数体,每次击键整个下半面板重排。【规约】(a) M2 的 CM6 工厂接入自动补括号配置,但产品编辑器按 M2 铁律保持只读,因此不制造虚假的可输入验收;M3 启用源码编辑时才验收实际配对输入;(b) 重解析后若新增 ERROR 影响区域超过文件的 ~30%,积木面板保持上一棵有效树渲染 + 横幅提示(契约 11),不跟随坏树重排。

**R15 · Electron IPC 是公开安全边界。** M0 的 preload 只暴露固定形状的 `window.panelApi.capabilities/compile/run`;后续里程碑按需增加 `openSource`、`loadProject`、`saveProject`、`diagnose`、`trace`、`explain`,但始终禁止暴露通用 `send/on`、`ipcRenderer`、`process`、`Buffer`、任意路径读写或 shell 能力。每个 `ipcMain.handle` 先验证请求来自当前主 frame,再用独立 schema 做运行时校验:source ≤512 KiB、stdin ≤1 MiB、argv ≤64 项且单项 ≤16 KiB/合计 ≤64 KiB、fixtures ≤64 个且单个 ≤1 MiB/合计 ≤8 MiB、拒绝 NUL 和越界/绝对路径;所有超时、进程数、内存与输出上限由 main 固定且 renderer 无权放宽。文件打开/保存只通过原生对话框或 main 持有的项目句柄。`capabilities` 在 main 内返回冻结快照;Electron structured clone 不保留 `Object.freeze`,所以 preload 每次给 renderer 防御性新副本,验收必须证明 renderer 修改自己的副本不会污染下一次 main 快照,不得用 renderer 侧 `Object.isFrozen` 作虚假保证。compile/run/diagnose/trace/explain 等操作返回带判别字段的结果(`{ok:true,...}` / `{ok:false,error:{code,message}}`),预期错误不靠 throw 穿过 IPC。CSP 禁止远程脚本和 `unsafe-eval`;导航、弹窗、权限请求和外链默认拒绝,允许项必须显式列入 main allowlist。

---

## 5. 程序分析与算法识别规约(M5/M6 的设计蓝图)

### 5.1 CFG(语句级,函数粒度)

每个 CFG 节点对应一条可高亮语句/一块积木,不拆表达式、不合并基本块(教学上语句粒度更好)。递归下降构建,携带 `ctx = {breakTarget, continueTarget, exitBlock, labelMap, gotoFixups}`:

- if:cond --true→ consequence、--false→ alternative 或 join。【实测】`if_statement` 的 `alternative` 字段是 **else_clause 包装节点**,要取其子语句再递归(else-if 链 = else_clause 内嵌 if_statement),别取错一层。
- while:cond→body→cond;for:init→cond→body→update→cond(continueTarget=update);do:body→cond→body。
- break→breakTarget;continue→continueTarget;return→exit;同块后续语句建节点标 unreachable(保积木完整)。
- switch:头块对每个直接子 case/default 发边;相邻 case 间保留顺序边即 fallthrough;**无 default 时必须补一条头块→switch 出口的隐式边**(否则 switch 后代码被误标不可达,产生 certain 级误报);case 出现在嵌套结构里(Duff 式)→ `cfg.partial = true`,禁用下游分析。
- goto:两趟(先收集 label 再补边);label 缺失/交叉进循环体 → `cfg.partial = true`。
- `exit()/abort()` 视为终结;**`assert(expr)` 特判为"expr 为假 → 终结边"的分支节点**(课程代码 malloc 后必跟 assert,不建模会灌满误报)。
- 短路 `&&/||` 与三目:CFG 不拆边(可视化不需要),但见 5.4 归一化。

### 5.2 def-use(变量级、流敏感到达定义)

worklist + bitset。规则:

- 未取地址的局部标量:强 def/kill,精确——三条识别规则的谓词只消费这类"干净标量"。
- 数组元素写 `a[i]=v`:a 的 weak def(不 kill);元素读:a 的 use。整数组粒度。
- **取地址的两种命运(关键修正)**:`&x` **直接作调用实参**(`scanf("%d",&n)`、`swap(&a[j],&a[j+1])`)→ 只在该调用点记一次 def,之后**恢复精确跟踪**(nocapture 语义);地址**被存储**(`p=&x`、存入 struct/数组)→ 才永久 escaped、退出跟踪。若不做这个区分,所有 `scanf` 读入尺寸的程序(课程代码最常见形态)的 n 都无法判 loop-invariant,识别系统性失效。
- 派生谓词库(每个独立单测):`isLoopInvariant(v,L)`、`singleDefIn(v,L)`、`isInductionVar(i,L)`(唯一 def 且为 Step(i,±c) 形)。

### 5.3 内存/风险分析(诚实划界)

"唯一句柄" typestate 五态自动机 {unalloc, alloc, maybeNull, freed, escaped}:

- **certain(红,可跳转)**:唯一句柄全路径未 free 达 EXIT(泄漏);must-freed 后再 free(double-free)/解引用(UAF);字面量索引 vs 字面量数组大小的越界(含负索引);严格形态的 `<=` off-by-one;全路径未初始化读取;不可达代码。
- **likely(黄)**:部分路径漏 free;may-freed 使用。
- **hint(灰,折叠)**:`malloc(sizeof(指针))` 疑似漏 `*`;malloc 未判 NULL 即解引用(assert 建模后);循环条件变量与下标变量不一致;运行时来源的边界"建议检查"。
- **逃逸即沉默铁律**:malloc 结果被 return、存入容器、传给非 free 函数 → escaped,零输出。跨函数配对(make_empty_list/free_list 风格)、链表内堆对象、多级别名:**明确放弃**,写进文档。用课程风格 listops.c/stack.c 作为零 certain 误报的验收语料。

### 5.4 归一化管线 NormIR(只读匹配副本)

每节点持 `{tsNodeId, range}` 指回原文,无 text 回写能力;analysis 包输出全冻结,emitter 禁止 import analysis(lint 强制),CI 加"开/关分析各跑一次积木→代码,结果逐字节相同"的回归。变换清单:

1. for/while/do → 统一 LoopNorm{init[], cond, update[], body}。
2. **cond 顶层 &&/|| 语法性拆成 conjunct 列表**(关键修正:教科书插入排序 `while (j>=0 && A[j]>key)` 和守卫式线性搜索 `while (i<n && a[i]!=t)` 的条件都是顶层 &&,不拆则两类规则在最规范写法上零命中)。CFG 不拆,只有匹配层拆。
3. 步进规范化:`i++/++i/i+=1/i=i+1` → Step(i,+1)。
4. 比较规范化:操作数序、`!(a<b)→a>=b`(单层)、`0<i→i>0`、`strcmp(x,y)==0 → StrEq(x,y)`。
5. 整数常量折叠(#define 纯整型对象宏参与);`>>1` 归一为 `/2`。
6. 索引线性形式 LinForm = c0+Σci·vi(相邻性判定:`a[j+1]` 与 `a[j]` 差恰为 1)。**注意**:整除不是线性运算,`(lo+hi)/2 ≡ lo+(hi-lo)/2` 的判定需要"仿射 + 单 floor-div 项"扩展形,且仅在操作数非负前提下成立(循环内 lo≤hi 可保证,要作为前提写明)。
7. 单语句体补花括号视图。三目→if 变换 MVP 不做。

### 5.5 置信度契约

- **certain**(score≥0.85 且全部 mandatory 谓词通过)→ 生成算法积木分组 + 标签 + evidence 高亮。
- **likely**(0.65–0.85)→ 结构不变,仅贴"推测:二分搜索 78%"徽标,点开显示未通过的谓词清单。
- **hint**(0.4–0.65)→ 只进"可能的角色"侧面板,文案模板:"这个循环可能在做 X,因为观察到 Y,但未能确认 Z"。
- <0.4 完全沉默。同一范围多条 certain 冲突 → 全部降 likely。重解析防闪烁:旧档位保持,除非新分数越出档位边界 0.05 以上。
- 数据结构"用途"标签(栈/队列/链表用途)统一封顶 likely;**哈希、图遍历(一般形)、贪心、DP 永久 hint-only**——"贪心/DP"是语义断言,结构上不可判;DP 可给结构性名称"递推表填充"(dp[i][j] 由更小下标项计算,可判)但绝不断言"动态规划"。

### 5.6 三条首发规则(骨架 + mandatory 谓词)

**线性搜索**(base 0.6):LoopNorm 有归纳变量 i(±1 步进,界 loop-invariant);命中形态 A(体内 `if (a[i]==t 或 StrEq)` + 提前退出 return/break/found 标志)**或形态 B(守卫式:cond conjuncts 含 `i<n` 与 `a[i]!=t`,体仅步进)**。mandatory:归纳唯一、a/t 不变、退出可达。加分:体内无 a 写、范围从 0 起、体短。evidence:loopHeader/comparison/earlyExit。

**二分搜索**(base 0.7):lo/hi 标量、cond `lo<=hi` 或 `lo<hi`、mid 唯一 def 为中点形(floor-div 扩展判定)、分支内 lo:=mid+1 / hi:=mid-1(或 hi:=mid 变体)。mandatory:def 唯一性、每条非退出路径恰含一侧更新(区间必减)、a/t 不变且 a 仅被 mid 索引。**招牌能力**:一致性配对谓词 `(<= ∧ hi=mid-1) ∨ (< ∧ hi=mid)` 失败但其余全过 → 封顶 likely 并产出教学诊断"疑似二分,但边界配对可能死循环/漏元素"。注:`(lo+hi+1)/2` 配 `lo=mid` 的上取整变体首发不覆盖,静默即可,不许误标。

**冒泡排序**(base 0.65):双层直接嵌套、内层界依赖外层 i(n-1-i 形加分)或常量;内层体 = `if (CMP(a[j],a[j+1])) swap`,相邻性用 LinForm 差=1 判定;swap 两形态:三赋值(tmp 任意名,def-use 验证互换)或 `f(&a[j],&a[j+1])` 调用形(依赖 5.2 的 nocapture 修正才能验证"无其他 a 写")。互斥仲裁:与选择排序区分靠相邻性(选择是 a[j] vs a[min_idx]),与插入排序区分靠 swap vs 移位;同一嵌套命中两条排序规则 → 全部降 likely。

**注意工作量分档**:遍历/累加极值/线性搜索是一档;冒泡是二档;**选择排序需要新的"条件累积 argmin"谓词、插入排序依赖 && 拆分 + "移位+收尾放置"两段式匹配**,是三档——里程碑内按档推进,不要按清单平推。

### 5.7 16 类模式的实施批次

- **第一批**(单双循环 + def-use 即可):遍历、累加/极值/计数、线性搜索、冒泡、选择、插入。
- **第二批**:二分、双指针(反向步进+交叉条件)、递归检测→分治骨架→归并/快排(递归骨架上叠 merge/partition 谓词)。
- **第三批**(符号表驱动的 struct 形状识别):链表(自指针字段+p=p->next)、栈/队列(封顶 likely)、树遍历(双自指针+双递归,visit 位置定 pre/in/post)、BST。
- **永久降档**:哈希/图(一般形)/贪心/DP → hint-only;回溯结构可识别,先 hint 后视语料升 likely。

---

## 6. 里程碑(每个都有单一聚合验收命令 `npm run accept:mN`,全绿才进下一个)

**M0 · Electron 骨架、IPC 与可信运行器。** 用锁定版本建立 Electron + Vite + TS + vitest + fast-check + concurrently + Playwright 工程;main/preload/renderer 边界从第一天按 D7/R15 落地,Electron 安全开关和 CSP 有自动断言。`electron/main/runner/` 按 R12 实现 `panel:capabilities`、`panel:compile`、`panel:run`(含 Seatbelt best-effort、trusted-only fail-closed、进程组回收、RSS/进程数看门狗),renderer 只有最小状态页用于证明 IPC。金样本库 v0 ≥20 个 COMP10002 程序(线性/二分搜索、冒泡/插入/选择/归并/快排、链表增删、BST、递归、字符串、struct、qsort 比较器、文件读写),目录约定 `samples/NN-name/{main.c, tests/*.in, tests/*.expected, meta.json}`——`meta.json` 定义 `fixtures`(只从该样本目录复制到临时 cwd)与 `args`(argv);准入过 R13 双闸。另设 **5 个资源/故障压力样本**(忙等/死等/段错误/写大文件/循环 malloc+memset),只验证资源闸和错误回收,不把它们描述为对抗性安全测试。验收 `npm run accept:m0`:Playwright 自动启动 Electron 并通过 preload 调通 capabilities/compile/run;默认拒绝无 Seatbelt 的请求,main 原生确认并为当前请求签发一次性内部授权后可在 trusted-only 路径编译/运行 hello,下一请求必须重新原生确认;全部金样本 I/O 逐字节相同;压力样本被预期机制终止;模拟资源监控失败时拒绝且不得降级。**不做**:任何解析、积木、正式 UI。

**M1 · 无损投影层。** SourceDoc/Block 数据结构(不变式:兄弟 range 有序不重叠、父覆盖子并集、注释必为节点);投影器 v0(函数级积木 + 其余 raw);注释吸附归属数据(R3a,块只需记录归属,移动语义留 M3);属性测试 P1/P2 + P5 的“无崩溃/保字符”基础部分(逐 range 的 `syntax/raw` oracle 到 M4 才成为硬门禁,禁止在 M1 把“全 raw”固化为正确快照);变异 fuzz v0;`verify-wasm-assets.mjs` 真实 Electron renderer 冒烟。验收:全样本投影→重建逐字节相等;fuzz 2000 例零崩溃零丢字符。**不做**:UI、语句级积木、编辑。

**M2 · 面板与双向高亮。** **导入入口**:原生文件选择器 + 拖拽 + 粘贴三种,按 §1 输入边界读取(BOM/换行交给 P1 保真);左积木树右 CodeMirror(只读);积木细化到语句级;`offsetToBlock`(laminar 区间,排序数组+二分取最内层,不用区间树)与 `blockToRange`;点击互相高亮;点击变量高亮其声明与全部使用(符号表 usages);**运行面板**(按钮调 `window.panelApi.capabilities/compile/run`,显示 stdout/诊断/测试结果、Seatbelt 状态与可信确认);**确定性解释面板 v1**:点击积木显示节点类型驱动的模板解释(C 语法含义 + R9 三张表的库函数/宏说明 + 对象宏使用点悬浮"= 值"),这是原需求"代码解释"的确定性底座,AI(M7)只是增强,Ollama 离线时它仍完整可用;R11 可疑解析标记;R14 自动补括号。验收:映射属性测试(任意 offset 命中唯一最深积木、两函数互逆)+ 语句级重跑 M1 全部属性 + Playwright 自动覆盖至少 5 条 Electron E2E(文件选择、拖拽、粘贴、积木→代码高亮、代码→积木高亮、可信确认后运行),**不得以人工冒烟作为通过条件**。**不做**:一切编辑、分析、AI——这是铁律检查点。

**M3 · 积木编辑闭环。** 拆两个子检查点:
- **M3a**:补丁引擎地基 + 改字面量、换运算符(R4 双向括号化)、表单式字段编辑(for 三段/if 条件);P3/P4;undo/redo 走 D6。验收 `accept:m3a` = P3/P4 属性 + 这三类操作的 edit-equiv。
- **M3b**:整行语句插删(R6 防护)、同级相邻语句交换(受限拖拽的唯一形态,含 R3 注释吸附移动语义)、保守重命名(仅函数内局部变量;按 node 类型过滤掉 field_identifier/label/enum 常量/宏名;检测到遮蔽或可疑即拒绝——宁可拒绝合法编辑,不产生错误补丁);可能改变语义的操作走契约 9 的 diff 确认弹层;R14 有效树保持。验收 `accept:m3` = 全量 edit-equiv 矩阵(样本×语义保持操作 → 重编译 → I/O 逐字节相同)。

**不做**:自由拖拽重排、表达式级拖拽(降级为就地小文本框,永久方案)、跨层语句移动、格式化。

**M4 · 降级健壮化。** 刁钻语料 ≥15(goto 迷宫、函数宏、#ifdef、`__attribute__`、K&R 参数、CRLF、注释藏代码、截断文件、`#if 0` 包坏代码);验收采用**逐样本 expected 投影快照**——该 raw 的必须 raw(函数宏定义、`__attribute__`、截断残片),该正常成积木的必须正常(#ifdef 分支内代码、goto、CRLF 都能正常成树,见附录 A;`#if 0` 用例还必须按 R2 从 ERROR 里挖出完好的 main 为语法积木),不许一揽子断言"必产 raw";外加 P1 成立、UI 不崩。语法生成器 fuzz(fast-check letrec 写 ~200 行课程子集 C 生成器,附 metamorphic 断言:生成了 for 则投影必现 for 积木);`corpus/regressions/` 全量回归入 CI。**不做**:对刁钻结构语义积木化(停在 raw 即正确)。

**M5 · 确定性程序分析。** 拆两个子检查点:
- **M5a**:分析引擎(§5.1–5.3 全部)+ CFG 金标 30–50 函数(边集快照 + 性质断言:每块可达或显式 unreachable、每语句恰属一块、含 switch-无-default 用例)+ 每金样本 `expected-findings.json` 精确匹配(多报漏报皆 fail)+ 课程风格语料零 certain 误报。解释面板升级 v2(注入 def-use/内存事实);可选:点击变量高亮其作用域范围。
- **M5b**:工具链回填——Electron main 实现 `panel:diagnose`,经 preload 暴露为 `window.panelApi.diagnose`;clang `-Wall -Wextra` stderr 经 R1 码元换算挂到积木;ASan/UBSan 与 leaks(R13 分开跑)回填"内存风险"面板。

**不做**:过程间、别名、路径敏感。

**M6 · 算法识别。** §5.4–5.7,按批次推进。**必做最小集**:遍历、累加/极值/计数、线性搜索(含守卫形)、冒泡、二分(含 §5.6 的边界一致性教学诊断)。**可延期集**(工作量三档,见 5.6):选择排序(需新"条件累积 argmin"谓词)、插入排序(依赖 && 拆分 + 两段式匹配)——做不完就顺延,不算 M6 失败。每规则 ≥5 正样本 + ≥5 易混淆负样本(选择 vs 冒泡、插入 vs 冒泡、错误边界二分——负样本策展是最大隐性成本,给足预算);verdict 快照回归。验收:混淆矩阵,**零误贴(certain 档 precision 必须 100%,出现任何误贴即 fail)**,必做集 recall 在语料+变体上 ≥70%(诚实目标,识别不了就沉默是产品语义,不是 bug)。**不做**:ML/LLM 参与识别。

**M7 · AI 解释层。** Electron main 的受限 Provider handler 处理模型请求,preload 只暴露具名 AI API;prompt 注入选中积木原文 + M5/M6 确定性事实;渐进提示与苏格拉底提问;`src/ai/` 物理隔离。验收:`check-ai-isolation.mjs` 静态遍历 `src/ai/` import 图,出现补丁引擎或任何写接口即 fail;mock Provider 单测 + Electron IPC E2E;远程或本地模型离线时 AI 增强区优雅缺席、M2 的确定性解释面板与其余全功能不受影响。后续允许的 AI 修改遵循 ADR-0006:默认关闭,用户显式授权,候选 diff 经确定性验证、检查点和撤销后才生效;AI 仍不得自动贴算法标签。

**M8 · 学习闭环与可回放执行轨迹。** 建立本地 `StudyProject`(问题、输入/输出/约束、假设、边界例、源码/积木版本、测试、轨迹、复杂度判断、循环不变量/递归论证、AI 对话、复盘),流程固定为“定义问题 → 先预测/写计划 → 组装或改代码 → 测试与轨迹 → 解释正确性/复杂度 → 复盘”。轨迹 v1 采用**临时影子源码插桩 + 事件回放**,绝不改事实源:仅对已结构化且无 raw/宏/goto/可疑解析的函数,按 CST range 在临时副本插入语句、函数进入/退出、干净标量 def-use 和可静态确定边界数组的 JSONL 事件;`-O0 -g` 编译,事件走独立 fd,不污染 stdout,最多 10,000 个事件或 8 MiB,先到即停止并标“轨迹已截断”。直接且未被遮蔽的 `malloc/calloc/realloc/free` 可经强制包含的 trace runtime 记录;不支持的类型/别名只显示“不可观测”,不猜值。trace 必须复用 R12 授权、Seatbelt 和资源上限。UI 的暂停/前进/后退是在不可变事件序列上回放,同时高亮代码/积木并显示变量、调用栈、数组和已观测分配;不把它宣传为任意 C 的 live debugger。复杂度工作台让用户先填写 Big-O/Theta/Omega 与理由,再用选定基础操作的计数和多规模输入曲线作证据;正确性工作台保存前/后置条件、循环不变量、递归 base/step、终止理由,系统与 AI 只指出缺口,不声称形式化证明。项目以带 `schemaVersion` 的 JSON 原子写入 `app.getPath('userData')/projects`,每个项目保留最近 50 个源码/积木版本并支持 Markdown/C 导出。验收 `npm run accept:m8`:Playwright 从空白项目完成二分搜索闭环,回放时 `low/mid/high` 与代码/积木同步、前后移动确定性一致,测试与操作计数可复现,论证和复盘重启后仍在;含 raw/宏样本明确禁用轨迹但普通运行仍可用;Ollama 离线不影响闭环。

**M9 · 可安装 macOS 应用。** 用 electron-builder 产出 Apple Silicon `.app` + `.dmg`;打包必须内含 renderer、两枚 wasm、Seatbelt profile、固定 runner wrapper 与 trace runtime,用户无需 Node 或终端。首次启动运行工具链预检:clang 缺失时给出安装 Command Line Tools 的明确提示并保持投影/编辑/项目功能可用;Ollama 缺失只关闭 AI。项目数据只写 `app.getPath('userData')`,升级前后迁移按 `schemaVersion`、原子写 + 备份,卸载应用不主动删除学习数据。主进程实施 single-instance lock,退出时终止所有编译/运行/trace 进程组。无 Apple Developer 凭据的本地验收产物允许 ad-hoc 签名并明确标注“未公证”;若 CI 提供签名/公证凭据则走同一配置生成 release,不得把凭据写入仓库。验收 `npm run accept:m9`:clean `npm ci` 后构建 arm64 DMG,自动挂载并启动打包后的 app,Playwright 完成导入→投影→授权运行 hello→保存→重启加载;断言无外部 Node、无 localhost 监听、无孤儿子进程,wasm 与工具链缺失降级符合预期。

**里程碑之外的长期路线**(不排期,仅记录方向):多文件支持——用同一管线解析 `#include "foo.h"`,把其文件作用域符号挂为外层作用域;表达式级拖拽**永久不做**(就地小文本框是终态方案,不是权宜)。

---

## 7. 测试策略

**自动化测试分层【规约】**:纯投影、补丁、分析、runner 与 IPC handler 用 Vitest 在 fresh process 中跑;renderer 交互、preload bridge、Electron 安全开关和真实 wasm 加载用 Playwright Electron E2E;M9 另对打包后的 `.app` 跑安装态 E2E。CI 可以使用无头模式,本机也允许测试窗口短暂出现,但所有断言和退出码必须自动产生。人工探索可以补充,**绝不能是任何 `accept:mN` 的唯一证据或必需步骤**。

**五条核心属性**(fast-check + vitest 驱动;金样本 ∪ 变异体 ∪ 生成器产物):

- **P1 覆盖完整性**:`project(src)` 永不 throw;叶子按 start 排序无重叠;叶子 + gap 依序拼接 `rebuilt === src` **逐字符相等——这是唯一硬断言**。gap 含非空白内容只作告警不 fail(【实测】BOM、`\f`、`\v`、标识符内 `\<换行>` 行拼接都是 clang 合法但产生非空白 gap 的输入,当硬断言必然误红)。
- **P2 投影幂等**:`render(project(src)) === src`(render 是独立代码路径);`project(render(project(src)))` 与 `project(src)` 树形状同构——防解析-序列化漂移。
- **P3 补丁最小性**:每个 span ⊆ 目标积木 range ∪ 其 trivia 邻域;apply 后 span 并集之外逐字符不变;重投影后除受影响子树外结构与文本 identical。
- **P4 编辑合法性**:apply 后重解析无新增 ERROR/MISSING(硬);语义保持型编辑额外过 clang + I/O 逐字节(硬);其余 clang 诊断只作软标注(见 R10)。
- **P5 降级决策与保字符**:每个刁钻 fixture 带 expected 投影快照,对标记 range 逐项断言 `syntax` 或 `raw`,同时 P1 成立且不 throw;**禁止“一出现刁钻语法就整文件 raw”的宽松断言**。最低 oracle:goto 语句、`#ifdef/#ifndef` 分支内完整语句、CRLF 正常投影为语法积木;函数式宏定义、无法支持的 `__attribute__` 最小区间、真正非法/截断残片投影为 raw;`#if 0` 吞入 ERROR 的完整后续函数按 R2 挖出为语法积木。【实测】含非法 token 的源码仍可由叶子 + gap 逐字符重建,但“保字符”不能替代投影类型快照。

**双层 fuzz**:① 变异(删行/删 token/换运算符/删配对符号之一/截断/插 goto 与宏/两样本拼接),断言不崩+P1;② 语法生成器(产物保证可编译),跑全链路 P1–P4 + metamorphic 积木断言。失败例自动 shrink 落 `corpus/regressions/` 永久回归,seed 打印可复现。`npm test` 内嵌 500 例快跑,`npm run fuzz -- --runs 5000` 夜间深跑。

**脚本职责**:`roundtrip.mjs`(投影→重建→比较,打印首个差异偏移)、`edit-equiv.mjs`(样本×操作矩阵)、`fuzz.mjs`、`verify-runner.mjs`、`verify-analysis.mjs` / `verify-patterns.mjs`(expected JSON 精确比对 + 混淆矩阵)、`check-ai-isolation.mjs`、`verify-package.mjs`;`npm run test:e2e` 运行 Electron Playwright 套件。全部由断言和退出码判定,无人工判读。

---

## 8. AI 职责边界

**默认可以**:解释选中积木/代码(注入确定性分析事实后复述与扩展)、推测变量与函数的业务含义(标"推测")、对已识别模式做自然语言教学、渐进提示(先问后答)、根据编辑轨迹与报错教学、提议更高层积木合并。

**受控修改**:默认关闭。用户只能在设置中显式开启当前权限模式;AI 输出是候选 diff,不得直接写文件。每批修改绑定 workspace opaque ID、源码 revision 与 fingerprint,必须展示 diff、建立检查点,经重解析、CFG/clang 等确定性门禁后由现有编辑管线提交,并提供单击撤销。删除文件、项目外写入与外部命令不在该总开关授权范围内。

**始终不可以**:参与 C 解析、类型检查、单独裁定语义等价、绕过源码权威写管线、在未授权时修改程序、给算法贴标签(标签只能来自 §5 规则引擎)。

**接入与对话**:仅 Electron main 可访问受支持 Provider;renderer 经窄 `window.panelApi` 请求,离线优雅缺席。一个托管 workspace opaque ID 对应一个本地 AI Project,重复打开恢复同一 Project;每个 Project 可有多批独立对话。对话使用版本化、有界、原子写的本地存储,不保存 API 密钥或绝对路径,损坏时不得改写 `main.c`。`src/ai/` 与 `src/core/` 写接口继续物理隔离,import 图白名单由脚本强制。

---

## 9. 给你(Claude Code)的行为准则

1. 每个里程碑验收命令全绿才进下一个;**不许为通过测试而弱化测试**;fuzz 失败例必须 shrink 后入回归语料,不许删。
2. 支持新 C 语法:先加金样本(过 R13 双闸)再写转换代码。
3. 拿不准的第三方 API:写冒烟测试验证,不凭记忆断言(本文档【实测】条目除外)。
4. 两难时的优先序:不丢字符 > 不改语义 > 不误标 > 功能覆盖 > 美观。宁可拒绝一次合法编辑,不产生一个错误补丁;宁可漏识别,不误贴标签。
5. 分析/识别做不到的,降级路径永远存在且是产品语义的一部分(raw 积木、无标签、空面板),不要硬撑。
6. 保持每个里程碑结束时应用可运行(`npm run dev` 单命令直接打开 Electron);纯逻辑测试用 fresh-process Vitest,界面/IPC/wasm 用 Playwright 自动 E2E,不依赖浏览器或桌面人工验证。
7. 改动 `src/core/`(投影器/补丁引擎)必须先跑全量 P1–P5 再提交。

---

## 附录 A · 本机已验证事实速查(2026-07,不要重新调研)

- macOS 27:无 `timeout`/`gtimeout`;`ulimit -t` 只作辅助,`-d/-v` 无效,`-u` 不得作为单任务进程上限;`sandbox-exec`、`leaks` 存在;ASan `detect_leaks` 不支持;ASan 二进制 + `leaks` = 假阴性。
- Node 24 LTS:`spawn detached:true` + `kill(-pid)` 连孙进程回收,已验证。
- web-tree-sitter 0.26.10:`{Parser, Language}` 具名导出;运行时文件 `web-tree-sitter.wasm`(README 旧名是坑);无 `loadSync`;`hasError/isError/isMissing` 是属性;`startIndex/endIndex` 为 UTF-16 码元;`node.id` 跨解析不稳定;`getChangedRanges` 对纯 token 修改返回空(失效判定须并上编辑区间);Node 端无浏览器环境直接可跑(测试无头化)。
- tree-sitter-c 0.24.1:自带 wasm(ABI 15);节点与字段名已核对(`for_statement{initializer,condition,update,body}`、`if_statement{condition,consequence,alternative→else_clause 包装}`、`subscript_expression{argument,index}`、`update_expression{operator,argument}` 等,以包内 `node-types.json` 为准);comment/preproc_* 均为显式节点;`#ifdef` 分支内代码正常成树;`#if 0` 包非法代码会产生延伸到 EOF 的 ERROR(见 R2);`a*b;` 解析为声明(见 R11)。
- clang(Apple 21):诊断列号为 UTF-8 字节基准(见 R1);`-fsyntax-only` 做完整语义分析(见 R10)。
- tree-sitter Query 谓词(`#eq?/#match?` 等)仅字符串/正则级,数据流谓词必须在自有 IR 上程序化实现,Query 只用于粗筛。

## 附录 B · 金样本库建议清单

线性搜索(break 形/守卫形/found 标志形)、二分(标准/lower-bound/错误边界负样本)、冒泡(朴素/界收缩/swapped 提前终止/swap 函数形)、选择、插入(教科书 && 形)、归并、快排、链表(build/insert/delete/free)、BST(insert/search/中序)、栈(数组形/链表形)、队列、递归(阶乘/斐波那契/汉诺塔)、字符串(strlen/reverse/词频)、struct 数组排序(qsort+比较器)、二维数组、文件读写、getchar 循环、动态二维分配、含中文注释样本(测 R1)、CRLF 样本。
