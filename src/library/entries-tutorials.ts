import type {
  LibraryCodeExample,
  LibraryEntryInput,
  LibraryFeatureLink,
  LibraryTutorialArtifact,
  LibraryTutorialStep,
} from "./contracts.js";
import { INSERTION_SORT_LAB_SOURCE } from "../tutorials/insertion-sort-lab.js";

const MAXIMUM_SOURCE = `#include <stdio.h>

int main(void) {
  size_t count;
  if (scanf("%zu", &count) != 1 || count == 0) {
    fputs("count must be positive\\n", stderr);
    return 1;
  }

  int maximum;
  if (scanf("%d", &maximum) != 1) {
    fputs("missing value\\n", stderr);
    return 1;
  }

  for (size_t i = 1; i < count; i++) {
    int value;
    if (scanf("%d", &value) != 1) {
      fputs("missing value\\n", stderr);
      return 1;
    }
    if (value > maximum) maximum = value;
  }

  printf("%d\\n", maximum);
  return 0;
}`;

const POINTER_SOURCE = `#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

bool find_max(const int *values, size_t count, int *out) {
  if (values == NULL || out == NULL || count == 0) return false;
  int maximum = values[0];
  for (size_t i = 1; i < count; i++) {
    if (values[i] > maximum) maximum = values[i];
  }
  *out = maximum;
  return true;
}

int main(void) {
  size_t count;
  if (scanf("%zu", &count) != 1 || count == 0 || count > 100000) return 1;

  int *values = malloc(count * sizeof *values);
  if (values == NULL) return 1;
  for (size_t i = 0; i < count; i++) {
    if (scanf("%d", &values[i]) != 1) {
      free(values);
      return 1;
    }
  }

  int maximum;
  bool found = find_max(values, count, &maximum);
  free(values);
  values = NULL;
  if (!found) return 1;
  printf("%d\\n", maximum);
  return 0;
}`;

export const TUTORIAL_LIBRARY_ENTRIES: readonly LibraryEntryInput[] = [
  tutorialEntry(
    "tutorial.maximum-stream",
    "找最大值：第一个完整算法",
    "从一串整数中找出最大值，并用三个可观察输入确认初始化、循环与比较方向都正确。",
    [
      "这节把一个小问题走完整：读数量、读第一个值、逐个比较、输出答案。每一步都能在代码和运行结果中核对。",
      "关键不是背写法，而是让 maximum 始终代表“目前读过的数中的最大值”。这样全是负数时也不会被错误的零值干扰。",
    ],
    {
      guidedLessonId: "lesson.first.maximum-scan",
      order: 1,
      estimatedMinutes: 18,
      prerequisites: ["c.loops", "c.control-flow", "std.formatted-io"],
      goals: [
        "把自然语言步骤对应到可运行的 C 程序",
        "解释为什么最大值必须从第一个输入初始化",
        "用典型、全负数和单元素输入核对结果",
      ],
      steps: [
        step(
          "read-program",
          "先读完整程序",
          "在代码面板中找到 count、maximum、for 循环和最终 printf，按执行先后把它们读一遍。",
          [artifact("source", c("完整可运行源码", MAXIMUM_SOURCE))],
          link("打开代码面板", "build", "code-pane"),
          "能指出 maximum 第一次取值来自第一个输入，而不是常量零。",
        ),
        step(
          "assemble-flow",
          "在画布核对步骤",
          "观察输入、循环、比较与输出积木之间的连接，并确认每个积木都能在右侧源码中找到对应语句。",
          [],
          link("打开组装画布", "build", "assembly-canvas"),
          "画布顺序与源码执行顺序一致，开始和结束只表示流程边界。",
        ),
        step(
          "run-normal",
          "运行典型输入",
          "先用四个不同整数运行程序，预测答案后再查看实际输出。",
          [
            artifact("stdin", text("输入", "4\n3 7 2 5\n")),
            artifact("expected-output", text("预期输出", "7\n")),
          ],
          link("打开运行面板", "run", "runtime-flow"),
          "实际输出恰好是 7，并且程序正常结束。",
        ),
        step(
          "run-boundaries",
          "补上边界输入",
          "再运行全负数与单元素输入，确认初始化方式没有把不存在的零当成候选答案。",
          [
            artifact("stdin", text("全负数输入", "3\n-9 -4 -12\n")),
            artifact("expected-output", text("全负数预期", "-4\n")),
            artifact("stdin", text("单元素输入", "1\n42\n")),
            artifact("expected-output", text("单元素预期", "42\n")),
          ],
          link("再次运行", "run", "runtime-flow"),
          "两次实际输出分别是 -4 和 42，没有读取多余元素。",
        ),
      ],
      checks: [
        "我能用一句话说出 maximum 的循环不变量。",
        "我能解释循环为什么从 i = 1 开始。",
        "三组输入的实际输出都与预期一致。",
      ],
    },
    {
      aliases: ["maximum", "最大元素", "第一个算法"],
      keywords: ["流式读取", "循环不变量", "全负数", "单元素"],
      example: c("完整找最大值程序", MAXIMUM_SOURCE),
      related: ["c.loops", "algorithms.correctness", "examples.test-matrix"],
      featureLink: link("开始搭建", "build", "assembly-canvas"),
      complexity: "读取 n 个整数时，时间 O(n)，额外空间 O(1)。",
      pitfalls: ["把 maximum 初始化为 0 会让全负数输入得到错误答案。"],
    },
  ),
  tutorialEntry(
    "tutorial.blocks-to-c",
    "积木与 C 源码逐句核对",
    "把积木当作 C 结构的可视表示，逐句核对声明、输入、循环、判断和输出，而不是只看外形。",
    [
      "积木帮助你看清结构，但真正运行的仍是 C 源码。拖入一个语句后，要能在源码中找到它的精确写法。",
      "开始和结束只是帮助阅读的流程标记，不会偷偷生成一条 C 语句；控制结构内部的语句仍受 C 语法约束。",
    ],
    {
      order: 2,
      estimatedMinutes: 14,
      prerequisites: ["tutorial.maximum-stream", "manual.presets", "c.statement"],
      goals: [
        "把五类常见积木映射到具体 C 语句",
        "区分视觉流程标记与真正执行的语句",
        "每次搭建后主动核对源码变化",
      ],
      steps: [
        step(
          "place-blocks",
          "拖入基础积木",
          "从预设块依次找到声明、输入、循环、条件和输出，把需要的积木拖到画布空白处。",
          [],
          link("打开预设块", "build", "preset-blocks"),
          "画布上出现五类积木，并且未接入的积木被清楚标记。",
        ),
        step(
          "connect-structure",
          "按语法连接结构",
          "把顺序语句接入主流程，把比较语句放进循环体；遇到不兼容端口时先读提示，不强行跨层连接。",
          [
            artifact(
              "snippet",
              text(
                "积木到源码的核对表",
                '声明 -> int maximum;\n输入 -> scanf("%d", &maximum);\n循环 -> for (...) { ... }\n判断 -> if (value > maximum) ...\n输出 -> printf(...);',
              ),
            ),
          ],
          link("打开组装画布", "build", "assembly-canvas"),
          "控制结构的子语句位于对应花括号内，主流程没有悬空语句。",
        ),
        step(
          "compare-source",
          "逐句核对 C",
          "在代码面板中从上到下点名每个积木对应的源码，特别检查分号、花括号和比较符号。",
          [],
          link("打开代码面板", "build", "code-pane"),
          "能从任一积木定位到对应源码，也能从源码反向找到积木。",
        ),
      ],
      checks: [
        "我知道开始和结束标记不改变 C 的运行语义。",
        "我能解释声明、输入、循环、判断和输出的对应关系。",
        "我会在连接后检查代码面板，而不是只看画布。",
      ],
    },
    {
      aliases: ["积木转 C", "源码映射", "blocks to C"],
      keywords: ["预设块", "组装", "逐句核对", "语法连接"],
      example: c("判断积木对应的 C", "if (value > maximum) {\n  maximum = value;\n}"),
      related: ["manual.presets", "manual.code-editor", "c.statement"],
      featureLink: link("打开预设块", "build", "preset-blocks"),
      pitfalls: ["只按视觉顺序摆放而不检查花括号，会误解语句真实所属的控制结构。"],
    },
  ),
  tutorialEntry(
    "tutorial.input-cases",
    "建立输入案例矩阵",
    "把“看起来能运行”改成可重复核对：为正常、边界和错误输入提前写下预期结果。",
    [
      "单次成功只能说明这一组输入没有暴露问题。案例矩阵让你有意识地覆盖不同结构，而不是随机多试几次。",
      "先写预期输出，再真实运行。若结果不同，保留这组输入作为以后每次修改都要重新检查的回归案例。",
    ],
    {
      order: 3,
      estimatedMinutes: 16,
      prerequisites: ["tutorial.maximum-stream", "examples.test-matrix"],
      goals: [
        "从算法前置条件推导测试输入",
        "在运行前写出明确的预期输出",
        "把失败输入保留为可重复检查的案例",
      ],
      steps: [
        step(
          "draft-matrix",
          "先列六类输入",
          "为找最大值列出典型、全负数、单元素、最大值在开头、最大值在结尾和重复最大值六类输入。",
          [
            artifact(
              "snippet",
              text(
                "案例矩阵",
                "典型: 3 7 2 5 -> 7\n全负数: -9 -4 -12 -> -4\n单元素: 42 -> 42\n最大在首: 8 3 2 -> 8\n最大在尾: 1 2 9 -> 9\n重复最大: 5 5 1 -> 5",
              ),
            ),
          ],
          null,
          "每一行都包含具体输入、具体预期输出和它覆盖的风险。",
        ),
        step(
          "run-matrix",
          "逐项真实运行",
          "在运行面板逐项输入案例，先遮住输出做预测，再核对程序输出和结束状态。",
          [],
          link("打开运行面板", "run", "runtime-flow"),
          "六个有效案例都正常结束，实际输出与预期逐项相同。",
        ),
        step(
          "reject-invalid",
          "检查无效数量",
          "输入 count 为 0，确认程序明确拒绝，而不是读取不存在的第一个值或继续输出答案。",
          [
            artifact("stdin", text("无效输入", "0\n")),
            artifact("expected-output", text("预期错误提示", "count must be positive\n")),
          ],
          link("检查失败路径", "run", "runtime-flow"),
          "程序以非零状态结束，并给出可理解的错误提示。",
        ),
      ],
      checks: [
        "我的案例不只包含随机正常输入。",
        "每个案例都有运行前写下的预期结果。",
        "无效输入的失败方式也被明确核对。",
      ],
    },
    {
      aliases: ["测试矩阵", "边界案例", "input cases"],
      keywords: ["全负数", "单元素", "重复值", "回归测试"],
      example: text(
        "最小案例表",
        "normal -> 7\nall negative -> -4\nsingle -> 42\ncount zero -> rejected",
      ),
      related: ["examples.test-matrix", "algorithms.correctness", "tutorial.maximum-stream"],
      featureLink: link("开始运行案例", "run", "runtime-flow"),
      pitfalls: ["只测试一组正常输入，容易漏掉初始化和边界条件错误。"],
    },
  ),
  tutorialEntry(
    "tutorial.debug-comparison",
    "调试比较方向错误",
    "用失败输出定位 value < maximum 的方向错误，做一次最小修改后重新运行全部边界案例。",
    [
      "这类程序可以编译，也会输出一个整数，但结果语义错了。调试重点是从预期与实际的差异反推哪条判断改变了状态。",
      "一次只改一个地方。把小于号改为大于号后，先重跑触发错误的输入，再重跑全负数与单元素案例。",
    ],
    {
      order: 4,
      estimatedMinutes: 15,
      prerequisites: ["tutorial.input-cases", "c.operators"],
      goals: ["区分能编译与算法正确", "用最小失败输入定位比较方向", "修改后执行有针对性的回归检查"],
      steps: [
        step(
          "reproduce-bug",
          "稳定复现错误",
          "把比较写成小于号，用典型输入运行并记录预期 7 与实际 2 的差异。",
          [
            artifact("snippet", c("有缺陷的判断", "if (value < maximum) maximum = value;")),
            artifact("stdin", text("触发输入", "4\n3 7 2 5\n")),
            artifact("expected-output", text("正确预期", "7\n")),
          ],
          link("打开运行面板", "run", "runtime-flow"),
          "缺陷版本稳定输出 2，问题可以重复出现。",
        ),
        step(
          "inspect-updates",
          "追踪状态更新",
          "观察 maximum 在哪些比较后被更新，说明小于号为什么让变量逐步保存较小值。",
          [],
          link("查看真实 Trace", "run", "runtime-flow"),
          "能指出 value 为 2 时错误分支成立，并把 maximum 改成了 2。",
        ),
        step(
          "fix-one-symbol",
          "只改比较符号",
          "在代码面板把小于号改为大于号，不同时重写循环或输入逻辑，然后再次编译运行。",
          [artifact("snippet", c("修正后的判断", "if (value > maximum) maximum = value;"))],
          link("打开代码面板", "build", "code-pane"),
          "典型输入的实际输出从 2 变为 7，且没有引入编译错误。",
        ),
        step(
          "rerun-boundaries",
          "回归边界案例",
          "重新运行全负数和单元素案例，确认修复不只对最初那一组输入有效。",
          [],
          link("重新运行", "run", "runtime-flow"),
          "全负数输出 -4，单元素输出 42。",
        ),
      ],
      checks: [
        "我能说明错误版本实际求出的是较小值。",
        "修复只改变了一个比较符号。",
        "修复后典型与边界案例全部通过。",
      ],
    },
    {
      aliases: ["逻辑错误", "comparison bug", "小于号方向"],
      keywords: ["调试", "比较符", "失败输入", "回归"],
      example: c(
        "一处方向错误",
        "/* wrong */ if (value < maximum) maximum = value;\n/* right */ if (value > maximum) maximum = value;",
      ),
      related: ["c.operators", "algorithms.correctness", "tutorial.input-cases"],
      featureLink: link("打开代码面板", "build", "code-pane"),
      pitfalls: ["看到程序能编译就判断正确，会漏掉这类纯逻辑错误。"],
    },
  ),
  tutorialEntry(
    "tutorial.real-trace",
    "用真实 Trace 解释分支",
    "先预测每次比较的真假，再用同一组真实输入的运行轨迹核对实际经过的节点和分支。",
    [
      "Trace 回答的是“这一次输入实际走了哪里”。它能帮助解释输出和定位分支，但一条路径不能证明所有输入都正确。",
      "找最大值示例中，初始 maximum 为 3；随后 7 触发更新，2 和 5 都不触发更新，最终输出 7。",
    ],
    {
      order: 5,
      estimatedMinutes: 14,
      prerequisites: ["tutorial.debug-comparison", "examples.branch-scenario"],
      goals: ["运行前预测分支真假", "把运行事件对应回画布节点", "区分一次路径证据与普遍正确性"],
      steps: [
        step(
          "predict-path",
          "先写下分支预测",
          "对初始值 3 后面的 7、2、5 分别判断 value > maximum 的真假，并写下 maximum 的变化。",
          [
            artifact(
              "snippet",
              text("预测表", "7 > 3: true, maximum = 7\n2 > 7: false\n5 > 7: false"),
            ),
          ],
          null,
          "预测包含三次比较、真假结果和最终 maximum = 7。",
        ),
        step(
          "start-trace",
          "真实运行并观察路径",
          "使用同一输入启动真实 Trace，观察画布高亮和事件列表，不把教学模拟当作本次运行证据。",
          [artifact("stdin", text("Trace 输入", "4\n3 7 2 5\n"))],
          link("启动真实 Trace", "run", "runtime-flow"),
          "事件顺序与三次预测一致，最终运行输出是 7。",
        ),
        step(
          "compare-evidence",
          "说明证据边界",
          "用一句话总结这次 Trace 证明了什么，再指出还需要哪些输入案例才能提高正确性信心。",
          [],
          link("查看案例矩阵", "run", "runtime-flow"),
          "答案明确区分“这次路径符合预期”和“所有输入都正确”。",
        ),
      ],
      checks: [
        "三次分支预测与真实事件逐项一致。",
        "我能从事件定位到对应画布节点。",
        "我不会用单次 Trace 代替完整案例测试。",
      ],
    },
    {
      aliases: ["真实轨迹", "execution trace", "分支路径"],
      keywords: ["Trace", "运行事件", "路径高亮", "真假分支"],
      example: text("预期分支", "true -> false -> false -> output 7"),
      related: ["examples.branch-scenario", "execution.real-vs-simulation", "canvas.branching"],
      featureLink: link("打开运行流程", "run", "runtime-flow"),
      pitfalls: ["一组输入的真实路径只能解释该次运行，不能单独证明算法对所有输入正确。"],
    },
  ),
  tutorialEntry(
    "tutorial.complexity-growth",
    "用输入规模观察复杂度",
    "用多个输入规模、重复中位数和操作计数观察增长趋势，并把实测时间与 Big-O 分开解释。",
    [
      "墙钟时间会受电脑负载和编译环境影响，单次快慢不稳定。重复运行取中位数，再配合操作计数更容易看出增长形状。",
      "对线性扫描，输入从 8 增到 32 再到 128，核心比较次数应大致按四倍增长；这支持线性解释，但不是数学证明。",
    ],
    {
      order: 6,
      estimatedMinutes: 18,
      prerequisites: ["tutorial.real-trace", "algorithms.big-o", "execution.benchmark"],
      goals: [
        "建立多个输入规模的可比运行",
        "读取中位耗时与操作计数趋势",
        "避免把实测曲线直接当作复杂度证明",
      ],
      steps: [
        step(
          "choose-sizes",
          "选择三个输入规模",
          "准备规模 8、32 和 128 的同类输入，并保证每组都完成同一个找最大值任务。",
          [artifact("snippet", text("规模设置", "8\n32\n128"))],
          link("打开分析界面", "analysis", "analysis"),
          "三组输入只改变规模，不改变算法、工具链和正确性目标。",
        ),
        step(
          "repeat-median",
          "重复运行取中位数",
          "每个规模至少重复三次，先确认输出正确，再记录中位耗时、内存和核心比较次数。",
          [],
          link("运行 Benchmark", "analysis", "analysis"),
          "每个规模都有相同重复次数，错误运行没有混入性能比较。",
        ),
        step(
          "read-growth",
          "解释增长趋势",
          "比较规模扩大四倍时操作计数如何变化，再把时间波动、空间使用和 Big-O 分栏说明。",
          [],
          link("查看完整分析", "analysis", "analysis"),
          "结论写成时间 O(n)、额外空间 O(1)，并注明实测只提供支持证据。",
        ),
      ],
      checks: [
        "三个规模使用可比的算法和运行条件。",
        "我优先用操作计数判断增长形状。",
        "我没有把一条耗时曲线写成复杂度证明。",
      ],
    },
    {
      aliases: ["复杂度实验", "growth curve", "benchmark"],
      keywords: ["输入规模", "中位数", "操作计数", "时间效率"],
      example: text("规模与比较次数", "n=8 -> about 7\nn=32 -> about 31\nn=128 -> about 127"),
      related: ["execution.benchmark", "algorithms.big-o", "examples.sort-benchmark"],
      featureLink: link("打开分析界面", "analysis", "analysis"),
      complexity: "找最大值的核心比较随 n 线性增长：时间 O(n)，额外空间 O(1)。",
      pitfalls: ["只比较一次墙钟时间，容易把系统噪声误当作算法增长。"],
    },
  ),
  tutorialEntry(
    "tutorial.pointer-memory",
    "指针与动态内存：传入数组",
    "把输入保存到动态数组，通过只读指针传入函数，再用输出指针返回最大值并完整释放内存。",
    [
      "指针让函数访问调用者的数据。const int *values 表示函数只读取数组，int *out 表示函数可以写回一个结果。",
      "动态内存需要完整生命周期：验证数量、malloc、检查失败、使用、free，释放后不再解引用旧指针。",
    ],
    {
      order: 7,
      level: "intermediate",
      estimatedMinutes: 24,
      prerequisites: ["tutorial.complexity-growth", "c.pointers", "c.dynamic-memory"],
      goals: [
        "读懂数组指针与输出指针的职责",
        "检查 malloc 失败和每条提前退出路径",
        "在最后一次使用后释放动态数组",
      ],
      steps: [
        step(
          "read-contract",
          "读懂函数契约",
          "先只看 find_max 的参数与返回值，说明 values、count 和 out 分别由谁提供、谁读取、谁写入。",
          [
            artifact(
              "snippet",
              c("函数接口", "bool find_max(const int *values, size_t count, int *out);"),
            ),
          ],
          link("打开解释面板", "explanation", "explanation"),
          "能解释调用时为什么传 values、count 和 &maximum。",
        ),
        step(
          "allocate-read",
          "分配并读取数组",
          "验证 count 合法后再分配，立即检查 values 是否为 NULL；读取中途失败也要先释放再返回。",
          [artifact("source", c("完整动态数组程序", POINTER_SOURCE))],
          link("打开代码面板", "build", "code-pane"),
          "每一条分配后的提前返回路径都先调用 free。",
        ),
        step(
          "call-and-free",
          "调用后释放",
          "调用 find_max(values, count, &maximum)，在最后一次需要 values 后 free，并避免释放后继续读取。",
          [],
          link("查看运行结果", "run", "runtime-flow"),
          "正常输入输出正确，运行结束前动态数组恰好释放一次。",
        ),
        step(
          "check-failures",
          "检查失败路径",
          "分别检查 count 为 0 和输入元素不足的情况，确认程序不会越界读取或泄漏已分配内存。",
          [artifact("stdin", text("元素不足", "3\n7 2\n"))],
          link("运行失败案例", "run", "runtime-flow"),
          "失败案例以非零状态结束，且没有继续输出未初始化的 maximum。",
        ),
      ],
      checks: [
        "我能解释 *out 写回结果、&maximum 提供地址。",
        "malloc 的返回值在使用前被检查。",
        "正常与失败路径都不会在 free 后继续使用 values。",
      ],
    },
    {
      aliases: ["pointer", "malloc free", "动态数组"],
      keywords: ["输出参数", "内存所有权", "NULL", "释放"],
      example: c("完整动态数组程序", POINTER_SOURCE),
      related: ["c.pointers", "c.dynamic-memory", "examples.memory-lifecycle"],
      featureLink: link("打开代码面板", "build", "code-pane"),
      complexity: "函数扫描 n 个元素，时间 O(n)；保存输入的动态数组使用 O(n) 堆空间。",
      pitfalls: ["分配成功后若读取中途失败，直接 return 会遗漏 free。"],
    },
  ),
  tutorialEntry(
    "tutorial.failure-recovery",
    "从编译失败和超时中恢复",
    "用固定顺序处理两类常见失败：先停止或复现，再读第一条有效诊断，做最小修改并重新核对输出。",
    [
      "编译错误与运行超时是不同阶段的问题。编译失败时程序尚未运行；超时则通常表示循环条件或更新没有让程序走向结束。",
      "不要一次改很多处。保留最小输入和错误信息，修复一处后立即重试，才能知道是哪次修改真正解决问题。",
    ],
    {
      order: 8,
      estimatedMinutes: 16,
      prerequisites: [
        "tutorial.pointer-memory",
        "recovery.compile-failure",
        "recovery.runtime-limit",
      ],
      goals: ["区分编译失败与运行超时", "优先处理第一条可行动诊断", "用最小修改和原始输入确认恢复"],
      steps: [
        step(
          "compile-failure",
          "复现编译失败",
          "运行缺少分号的版本，读取第一条编译诊断并定位到对应源码行，不继续猜测后续连锁错误。",
          [artifact("snippet", c("缺少分号", "int maximum = values[0]"))],
          link("打开代码与诊断", "build", "code-pane"),
          "能指出缺少分号的准确位置，程序尚未进入运行阶段。",
        ),
        step(
          "fix-compile",
          "做一次最小修复",
          "只补上分号后重新编译；编译成功再用原输入检查实际输出，不顺便重写其他代码。",
          [artifact("snippet", c("修复", "int maximum = values[0];"))],
          link("重新编译运行", "run", "runtime-flow"),
          "编译通过，并且原输入得到原本写下的预期输出。",
        ),
        step(
          "cancel-timeout",
          "停止不会结束的循环",
          "运行缺少 i++ 的循环，出现超时迹象时先取消，再检查条件中的变量是否会在循环体内变化。",
          [
            artifact(
              "snippet",
              c("不会推进的循环", "size_t i = 1;\nwhile (i < count) {\n  /* missing i++ */\n}"),
            ),
          ],
          link("查看运行状态", "run", "runtime-flow"),
          "已停止旧运行，并指出 i 不变导致条件持续为真。",
        ),
        step(
          "verify-recovery",
          "补更新并重新核对",
          "在循环体末尾补 i++，用最小输入重新运行，确认程序在资源限制内结束且输出正确。",
          [artifact("snippet", c("恢复终止", "i++;"))],
          link("再次运行", "run", "runtime-flow"),
          "程序正常结束，输出与预期一致，没有继续使用已取消运行的旧结果。",
        ),
      ],
      checks: [
        "我能先判断失败发生在编译还是运行阶段。",
        "每次只做一项可解释的修改。",
        "修复后使用原始失败输入重新核对结果。",
      ],
    },
    {
      aliases: ["编译错误", "timeout", "故障恢复"],
      keywords: ["缺少分号", "无限循环", "取消运行", "最小修复"],
      example: text("恢复顺序", "停止或稳定复现 -> 读取第一条诊断 -> 修改一处 -> 用原输入重试"),
      related: ["recovery.compile-failure", "recovery.runtime-limit", "execution.diagnostics"],
      featureLink: link("打开运行面板", "run", "runtime-flow"),
      pitfalls: ["同时修改多处会让你无法判断真正根因，也可能引入新的错误。"],
    },
  ),
  tutorialEntry(
    "tutorial.insertion-sort-lab",
    "插入排序实验",
    "先操作教材的相邻交换版本，再对照 key+右移优化，并用分布明确的场景完成运行、Trace 和 Benchmark。",
    [
      "教材主路径让当前元素通过相邻交换逐步向左，直到已排序前缀恢复有序；它更直观地呈现每次比较和交换。",
      "key+右移版本是完成教材路径后的优化对照：先保存当前值，再右移较大前驱，最后写回空位，减少部分写入。",
      "Trace 只证明循环和分支实际经过的路径，不显示数组每一步的值。数组结果由真实输出核对，增长趋势由多规模 Benchmark 观察。",
    ],
    {
      taskLessonId: "lesson.task.insertion-sort",
      order: 9,
      level: "intermediate",
      estimatedMinutes: 15,
      prerequisites: ["c.arrays", "c.loops", "algorithms.sorting", "tutorial.complexity-growth"],
      goals: [
        "把已排序前缀对应到教材相邻交换的每次比较与交换",
        "区分教材主路径与 key+右移优化对照",
        "用普通、逆序和重复值输入核对排序结果",
        "区分真实路径、操作增长和墙钟时间三类证据",
      ],
      steps: [
        step(
          "compare-insertion-block",
          "先交换，再看优化",
          "先运行教材相邻交换源码并观察当前元素逐格左移；理解后再搜索“右移较大元素”，对照 key 暂存、批量右移和最后写回。两者排序语义相同，但具体写入路径不同。",
          [
            artifact("source", c("教材相邻交换主路径", INSERTION_SORT_LAB_SOURCE)),
            artifact(
              "snippet",
              c(
                "优化对照 · key+右移",
                "while (j > 0 && values[j - 1] > key) {\n  values[j] = values[j - 1];\n  j--;\n}\nvalues[j] = key;",
              ),
            ),
          ],
          link("打开预设块", "build", "preset-blocks"),
          "能指出教材版每次交换的两个位置，并说明优化版为什么必须先保存 key。",
        ),
        step(
          "run-input-families",
          "运行三类输入",
          "先写下预期结果，再依次运行普通、完全逆序和包含重复值的输入；每次都检查正常退出和完整升序输出。",
          [
            artifact(
              "snippet",
              text("普通案例", "stdin:\n5\n5 2 4 6 1\nexpected stdout:\n1 2 4 5 6\n"),
            ),
            artifact(
              "snippet",
              text("逆序案例", "stdin:\n5\n5 4 3 2 1\nexpected stdout:\n1 2 3 4 5\n"),
            ),
            artifact(
              "snippet",
              text("重复值案例", "stdin:\n6\n3 1 3 2 1 2\nexpected stdout:\n1 1 2 2 3 3\n"),
            ),
          ],
          link("打开运行面板", "run", "runtime-flow"),
          "三次运行均正常结束，实际输出逐字符匹配对应预期。",
        ),
        step(
          "trace-reverse-path",
          "追踪逆序路径",
          "再次使用逆序输入启动真实 Trace，观察内层 while 的执行和退出路径；不要把路径高亮解释为数组值采样。",
          [artifact("stdin", text("Trace 输入", "5\n5 4 3 2 1\n"))],
          link("启动真实 Trace", "run", "runtime-flow"),
          "Trace 映射到当前源码并经过右移循环；结论只描述实际路径，不声称看到了每次数组内容。",
        ),
        step(
          "benchmark-insertion-growth",
          "比较规模增长",
          "分别选择“插入排序 · 已排序”“插入排序 · 逆序”和“插入排序 · 重复值”场景，对 8、32、128 三个规模各重复至少 3 次。不同输入分布保持为独立 cohort，再分别阅读操作增长与墙钟时间。",
          [
            artifact(
              "snippet",
              text(
                "Benchmark 设置",
                "scenarios: 插入排序 · 已排序 / 逆序 / 重复值\nsizes: 8, 32, 128\nrepetitions: 3",
              ),
            ),
          ],
          link("打开分析", "analysis", "analysis"),
          "三档结果来自同一源码和场景；解释中不把一次耗时或一条曲线写成复杂度证明。",
        ),
      ],
      checks: [
        "我能用相邻交换解释 values[0..i) 为什么在每轮结束后恢复有序。",
        "我能说明 key+右移是优化对照，而不是另一种排序结论。",
        "普通、逆序和重复值输入都得到完整升序输出。",
        "我能区分 Trace 路径、操作增长和实际耗时各自能证明什么。",
      ],
    },
    {
      aliases: ["insertion sort", "插入法排序", "相邻交换", "已排序前缀"],
      keywords: ["交换", "右移", "key", "逆序", "重复值", "Benchmark"],
      example: c("教材相邻交换插入排序", INSERTION_SORT_LAB_SOURCE),
      related: [
        "algorithms.sorting",
        "examples.sort-benchmark",
        "examples.test-matrix",
        "tutorial.complexity-growth",
      ],
      featureLink: link("打开代码面板", "build", "code-pane"),
      complexity: "最坏和平均时间 O(n²)，已排序输入最好 O(n)；使用 O(1) 额外空间。",
      pitfalls: [
        "教材版交换时漏掉任一写回会复制并丢失元素；优化版若忘记把 key 写回 values[j] 也会破坏排列。",
      ],
    },
  ),
];

interface TutorialOptions {
  readonly guidedLessonId?: string;
  readonly taskLessonId?: string;
  readonly order: number;
  readonly level?: "beginner" | "intermediate";
  readonly estimatedMinutes: number;
  readonly prerequisites: readonly string[];
  readonly goals: readonly string[];
  readonly steps: readonly LibraryTutorialStep[];
  readonly checks: readonly string[];
}

interface EntryOptions {
  readonly aliases: readonly string[];
  readonly keywords: readonly string[];
  readonly example: LibraryCodeExample;
  readonly related: readonly string[];
  readonly featureLink: LibraryFeatureLink;
  readonly complexity?: string;
  readonly pitfalls: readonly string[];
}

function tutorialEntry(
  id: string,
  title: string,
  summary: string,
  details: readonly string[],
  tutorial: TutorialOptions,
  options: EntryOptions,
): LibraryEntryInput {
  return {
    id,
    branchId: "examples",
    audience: "learner",
    title,
    summary,
    details,
    aliases: options.aliases,
    keywords: options.keywords,
    example: options.example,
    relatedEntryIds: options.related,
    featureLink: options.featureLink,
    complexity: options.complexity,
    pitfalls: options.pitfalls,
    tutorial: {
      ...(tutorial.guidedLessonId === undefined ? {} : { guidedLessonId: tutorial.guidedLessonId }),
      ...(tutorial.taskLessonId === undefined ? {} : { taskLessonId: tutorial.taskLessonId }),
      pathId: "beginner-core",
      order: tutorial.order,
      level: tutorial.level ?? "beginner",
      estimatedMinutes: tutorial.estimatedMinutes,
      prerequisiteEntryIds: tutorial.prerequisites,
      learningGoals: tutorial.goals,
      steps: tutorial.steps,
      completionChecks: tutorial.checks,
    },
  };
}

function step(
  id: string,
  title: string,
  instruction: string,
  artifacts: readonly LibraryTutorialArtifact[],
  featureLink: LibraryFeatureLink | null,
  check: string,
): LibraryTutorialStep {
  return { id, title, instruction, artifacts, featureLink, check };
}

function artifact(
  kind: LibraryTutorialArtifact["kind"],
  example: LibraryCodeExample,
): LibraryTutorialArtifact {
  return { kind, example };
}

function link(label: string, pageId: string, targetId: string): LibraryFeatureLink {
  return { label, pageId, targetId };
}

function c(caption: string, code: string): LibraryCodeExample {
  return { language: "c", caption, code };
}

function text(caption: string, code: string): LibraryCodeExample {
  return { language: "text", caption, code };
}
