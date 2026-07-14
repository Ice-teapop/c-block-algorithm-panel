import type { InterfaceLocale } from "../shared/interface-locale.js";
import type { GuidedLessonVisualGuideSnapshot } from "./guided-lesson-rail.js";

export type GuidedChartAnswerState = "idle" | "incorrect" | "correct";

interface GuidedChartGuideCopy {
  readonly phase: string;
  readonly title: string;
  readonly explanation: string;
  readonly facts: readonly Readonly<{ label: string; description: string }>[];
  readonly question: string | null;
  readonly options: readonly Readonly<{ id: string; label: string }>[];
  readonly incorrect: string;
  readonly correct: string;
}

const GUIDES: Readonly<Record<InterfaceLocale, Readonly<Record<string, GuidedChartGuideCopy>>>> =
  Object.freeze({
    "zh-CN": Object.freeze({
      "mission.read-trace-chart.axes": guide({
        phase: "示范与跟练",
        title: "先确认图在记录什么",
        explanation:
          "这张图描述一次真实 Trace。先读轴标题，再看事件点；不要从线的斜率直接推断算法快慢。",
        facts: [
          fact("横轴", "显示真实事件顺序；仅在时间跨度可分辨时才显示事件时间。"),
          fact("纵轴", "从 0 开始累计已确认的真实 Trace 事件。"),
          fact("事件点", "小实心点是语句；较大的分支点会标出 true 或 false。"),
        ],
        question: "横轴写着“事件顺序”时，一个点更靠右，最准确的含义是什么？",
        options: [
          option("later-event", "它在本次真实执行中发生得更晚"),
          option("slower-run", "这一行代码一定耗时更长"),
          option("larger-input", "这一行处理了更大的输入规模"),
        ],
        incorrect: "再看横轴标题：事件顺序只说明先后，不直接说明某行耗时或输入规模。",
        correct: "正确：先后顺序与墙钟耗时是两种不同证据。",
      }),
      "mission.read-trace-chart.reference": guide({
        phase: "独立判断",
        title: "把参考线当作工作量基准",
        explanation:
          "虚线是同一输入规模的参考工作量。比值比较的是插桩工作量，不是速度评分，也不是复杂度证明。",
        facts: [
          fact("虚线", "表示当前 n 下的参考操作预算。"),
          fact("实测/参考", "用已观察工作量除以同规模参考工作量。"),
          fact("证据边界", "比值只描述这次、这个规模；不能单独推出 Big-O。"),
        ],
        question: "图中显示 1.25×（125 / 100），可以成立的结论是？",
        options: [
          option("work-above-reference", "本次观测工作量比同规模参考高 25%"),
          option("speed-slower", "程序运行速度一定慢了 25%"),
          option("big-o-worse", "算法复杂度一定比参考高一个数量级"),
        ],
        incorrect: "比值的分子和分母都是工作量，不是墙钟速度，也不足以证明 Big-O。",
        correct: "正确：这是同规模工作量比较，结论不能越过当前运行证据。",
      }),
      "mission.read-analysis-chart.benchmark": guide({
        phase: "示范",
        title: "先生成可比较的数据",
        explanation:
          "分析图只比较同源码、同情景、同工具链且成功退出的真实运行。现在生成三个规模、每个三次的中位数样本。",
        facts: [
          fact("规模", "使用 n = 8、32、128，只改变输入规模。"),
          fact("重复", "每个规模运行 3 次，避免把一次系统抖动当成趋势。"),
          fact("失败运行", "输出错误、模拟运行或不可比工具链不会混入增长曲线。"),
        ],
        question: null,
        options: [],
        incorrect: "",
        correct: "",
      }),
      "mission.read-analysis-chart.variation": guide({
        phase: "跟练",
        title: "先读点，再读波动范围",
        explanation:
          "每个圆点是该规模的中位数，竖线连接同组样本的最小值与最大值；蓝色实线只负责连接实测中位数。",
        facts: [
          fact("圆点", "该输入规模多次真实运行的中位数。"),
          fact("竖线", "同组运行的最小值—最大值范围。"),
          fact("蓝色实线", "连接实测中位数，便于观察增长形状。"),
        ],
        question: "某个规模的竖线明显更长，首先应该怎样解释？",
        options: [
          option("larger-variation", "这一组重复运行的波动更大，需要检查噪声或增加样本"),
          option("larger-median", "这一组的中位数一定更大"),
          option("incorrect-output", "这一组的程序输出一定错误"),
        ],
        incorrect: "竖线表达范围，不直接决定中位数，也不代表输出正确或错误。",
        correct: "正确：先把长竖线当作测量不稳定信号，再决定是否增加样本。",
      }),
      "mission.read-analysis-chart.growth": guide({
        phase: "独立判断",
        title: "用操作次数判断形状，但保留证明边界",
        explanation:
          "耗时会受系统负载影响。切换到操作次数，比较实测线和虚线参考增长，再结合代码结构讨论复杂度。",
        facts: [
          fact("操作次数", "更适合观察输入规模变化时的工作量增长。"),
          fact("虚线", "从首个有效规模归一化得到的参考增长，不是目标分数。"),
          fact("Big-O", "实测曲线提供支持证据；数学结论仍需分析循环、递归和操作上界。"),
        ],
        question: "实测操作次数大致贴合线性参考线，最严谨的结论是？",
        options: [
          option("supports-not-proves", "这些数据支持线性增长解释，但仍需代码分析证明 O(n)"),
          option("proves-big-o", "曲线已经独立证明算法必然是 O(n)"),
          option("duration-only", "只需再看一次墙钟耗时即可完成证明"),
        ],
        incorrect: "实测只能覆盖有限输入；Big-O 还需要对程序结构和操作上界进行推导。",
        correct: "正确：数据用于支持或质疑模型，复杂度证明仍来自算法结构。",
      }),
    }),
    en: Object.freeze({
      "mission.read-trace-chart.axes": guide({
        phase: "Model and guided practice",
        title: "Identify what the chart records",
        explanation:
          "This chart describes one real Trace. Read the axis title before the markers; do not infer speed directly from the line slope.",
        facts: [
          fact(
            "Horizontal axis",
            "Shows real event order, or event time only when the span is measurable.",
          ),
          fact("Vertical axis", "Accumulates backend-confirmed real Trace events from zero."),
          fact(
            "Markers",
            "Small solid points are statements; larger branch points identify true or false.",
          ),
        ],
        question:
          "When the horizontal axis says event order, what does a point farther right mean?",
        options: [
          option("later-event", "It occurred later in this real execution"),
          option("slower-run", "That source line definitely took longer"),
          option("larger-input", "That source line processed a larger input"),
        ],
        incorrect:
          "Read the axis title again: event order shows sequence, not line duration or input size.",
        correct: "Correct: execution order and wall-clock duration are different evidence.",
      }),
      "mission.read-trace-chart.reference": guide({
        phase: "Independent check",
        title: "Use the reference line as a work baseline",
        explanation:
          "The dashed line is same-size reference work. The ratio compares instrumented work, not speed, and does not prove complexity.",
        facts: [
          fact("Dashed line", "The reference operation budget for the current n."),
          fact("Measured/reference", "Observed work divided by same-size reference work."),
          fact(
            "Evidence boundary",
            "The ratio covers this run and size only; it cannot establish Big-O by itself.",
          ),
        ],
        question: "The chart shows 1.25× (125 / 100). Which conclusion is valid?",
        options: [
          option("work-above-reference", "Observed work is 25% above the same-size reference"),
          option("speed-slower", "The program is definitely 25% slower"),
          option("big-o-worse", "The algorithm is definitely one complexity class worse"),
        ],
        incorrect:
          "Both ratio terms are work counts, not wall-clock speed, and they cannot prove Big-O.",
        correct:
          "Correct: this is a same-size work comparison with a deliberately narrow conclusion.",
      }),
      "mission.read-analysis-chart.benchmark": guide({
        phase: "Model",
        title: "Generate comparable evidence first",
        explanation:
          "Analysis compares successful real runs with the same source, scenario, and toolchain. Generate three sizes with three repetitions each.",
        facts: [
          fact("Sizes", "Use n = 8, 32, and 128; change only input size."),
          fact(
            "Repetitions",
            "Run each size three times so one system fluctuation is not mistaken for a trend.",
          ),
          fact(
            "Excluded data",
            "Wrong output, simulation, and incompatible toolchains do not enter the growth curve.",
          ),
        ],
        question: null,
        options: [],
        incorrect: "",
        correct: "",
      }),
      "mission.read-analysis-chart.variation": guide({
        phase: "Guided practice",
        title: "Read the point, then its range",
        explanation:
          "Each point is the median for one size. The vertical range joins the minimum and maximum; the solid blue line connects measured medians.",
        facts: [
          fact("Point", "The median of repeated real runs at that input size."),
          fact("Vertical range", "The minimum-to-maximum range for that sample group."),
          fact("Solid blue line", "Connects measured medians to reveal the growth shape."),
        ],
        question: "A vertical range is much longer at one size. What should you infer first?",
        options: [
          option(
            "larger-variation",
            "That group varied more; inspect noise or collect more samples",
          ),
          option("larger-median", "Its median must be larger"),
          option("incorrect-output", "Its program output must be wrong"),
        ],
        incorrect:
          "The range shows spread; it does not determine the median or output correctness.",
        correct:
          "Correct: treat a long range as measurement instability before making a growth claim.",
      }),
      "mission.read-analysis-chart.growth": guide({
        phase: "Independent check",
        title: "Read operation growth without overstating it",
        explanation:
          "Timing is affected by system load. Compare operation counts with the dashed reference, then use code structure to reason about complexity.",
        facts: [
          fact("Operation count", "Better reveals how work changes with input size."),
          fact("Dashed line", "A normalized reference growth curve, not a target score."),
          fact(
            "Big-O",
            "Measurements support a model; loops, recursion, and operation bounds provide the proof.",
          ),
        ],
        question:
          "Measured operations roughly follow the linear reference. Which conclusion is rigorous?",
        options: [
          option(
            "supports-not-proves",
            "The data supports linear growth, but code analysis must still establish O(n)",
          ),
          option("proves-big-o", "The curve independently proves the algorithm is O(n)"),
          option("duration-only", "One more wall-clock timing is enough to complete the proof"),
        ],
        incorrect:
          "Measurements cover finite inputs; Big-O still requires reasoning about program structure and bounds.",
        correct:
          "Correct: data can support or challenge a model, while complexity is established from the algorithm.",
      }),
    }),
  });

export function guidedChartReadingSnapshot(
  stageId: string,
  locale: InterfaceLocale,
  selectedOptionId: string | null,
  answerState: GuidedChartAnswerState,
): GuidedLessonVisualGuideSnapshot | undefined {
  const copy = GUIDES[locale][stageId];
  if (copy === undefined) return undefined;
  const feedback =
    answerState === "incorrect" ? copy.incorrect : answerState === "correct" ? copy.correct : null;
  return Object.freeze({
    phase: copy.phase,
    title: copy.title,
    explanation: copy.explanation,
    facts: copy.facts,
    question: copy.question,
    options: copy.options,
    selectedOptionId,
    feedback,
    feedbackState: answerState,
  });
}

function fact(label: string, description: string) {
  return Object.freeze({ label, description });
}

function option(id: string, label: string) {
  return Object.freeze({ id, label });
}

function guide(copy: GuidedChartGuideCopy): GuidedChartGuideCopy {
  return Object.freeze({
    ...copy,
    facts: Object.freeze([...copy.facts]),
    options: Object.freeze([...copy.options]),
  });
}
