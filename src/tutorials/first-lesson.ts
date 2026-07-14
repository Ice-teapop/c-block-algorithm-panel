import { fingerprintSource } from "../shared/source-snapshot.js";
import { FIRST_ALGORITHM_SOURCE, type FirstAlgorithmCase } from "./first-algorithm.js";
import {
  defineGuidedLesson,
  type GuidedExactDiff,
  type GuidedLessonDefinition,
  type GuidedMissionDefinition,
  type GuidedRealRunRequirement,
  type GuidedRealTraceRequirement,
  type GuidedRequirement,
  type GuidedSourceProfile,
} from "./guided-lesson.js";

export const FIRST_GUIDED_LESSON_ID = "lesson.first.maximum-scan";
export const FIRST_GUIDED_LESSON_VERSION = "6.1.0";
export const MAXIMUM_SCENARIO_ID = "scenario.searching.maximum";
export const MINIMUM_SCENARIO_ID = "scenario.searching.minimum";
export const FIRST_ALGORITHM_SCENARIO_VERSION = "1.0.0";
export const MAXIMUM_UPDATE_PRESET_ID = "builtin.search.update-maximum";

const MAXIMUM_UPDATE_BLOCK = `    if (value > maximum) {
      maximum = value;
    }`;
const MAXIMUM_SKELETON_MARKER = [
  "    /* 补全任务 @preset-slot builtin.search.update-maximum */",
  "    ;",
].join("\n");
const MAXIMUM_CORRECT_CONDITION = "if (value > maximum)";
const MAXIMUM_BUG_CONDITION = "if (value < maximum)";

export const FIRST_ALGORITHM_SOURCE_FINGERPRINT = fingerprintSource(FIRST_ALGORITHM_SOURCE);

export interface GuidedSourceTransformSuccess {
  readonly ok: true;
  readonly source: string;
  readonly previousFingerprint: string;
  readonly sourceFingerprint: string;
}

export interface GuidedSourceTransformFailure {
  readonly ok: false;
  /** Always the exact input source. A rejected transform never returns a partial edit. */
  readonly source: string;
  readonly reason: "fingerprint-mismatch" | "pattern-missing" | "pattern-ambiguous";
}

export type GuidedSourceTransformResult =
  GuidedSourceTransformSuccess | GuidedSourceTransformFailure;

export interface FirstAlgorithmWalkthroughRow {
  readonly inputIndex: number;
  readonly value: number;
  readonly maximumBefore: number | null;
  readonly comparison: string | null;
  readonly branchTaken: boolean | null;
  readonly maximumAfter: number;
}

export const FIRST_ALGORITHM_SKELETON_SOURCE = requireStaticTransform(
  replaceSourceExactlyOnce(
    FIRST_ALGORITHM_SOURCE,
    FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    MAXIMUM_UPDATE_BLOCK,
    MAXIMUM_SKELETON_MARKER,
  ),
);

export const FIRST_ALGORITHM_SKELETON_FINGERPRINT = fingerprintSource(
  FIRST_ALGORITHM_SKELETON_SOURCE,
);

export const FIRST_ALGORITHM_BUG_SOURCE = requireStaticTransform(
  replaceSourceExactlyOnce(
    FIRST_ALGORITHM_SOURCE,
    FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    MAXIMUM_CORRECT_CONDITION,
    MAXIMUM_BUG_CONDITION,
  ),
);

export const FIRST_ALGORITHM_BUG_FINGERPRINT = fingerprintSource(FIRST_ALGORITHM_BUG_SOURCE);

export const FIRST_MINIMUM_ALGORITHM_SOURCE = `#include <stdio.h>

int main(void) {
  int count;
  if (scanf("%d", &count) != 1 || count <= 0) {
    return 1;
  }

  int minimum;
  if (scanf("%d", &minimum) != 1) {
    return 1;
  }

  for (int i = 1; i < count; i++) {
    int value;
    if (scanf("%d", &value) != 1) {
      return 1;
    }
    if (value < minimum) {
      minimum = value;
    }
  }

  printf("%d\\n", minimum);
  return 0;
}
`;

export const FIRST_MINIMUM_ALGORITHM_FINGERPRINT = fingerprintSource(
  FIRST_MINIMUM_ALGORITHM_SOURCE,
);

export const FIRST_MINIMUM_ALGORITHM_CASES: readonly FirstAlgorithmCase[] = Object.freeze([
  Object.freeze({
    id: "normal",
    label: "普通输入",
    stdin: "5\n3 8 2 7 4\n",
    stdout: "2\n",
    purpose: "最小值位于中间，能确认循环与更新分支都执行。",
  }),
  Object.freeze({
    id: "negative",
    label: "全负数输入",
    stdin: "4\n-9 -4 -12 -7\n",
    stdout: "-12\n",
    purpose: "验证算法不会因为负号或初始值而遗漏真正的最小值。",
  }),
  Object.freeze({
    id: "single",
    label: "单元素输入",
    stdin: "1\n42\n",
    stdout: "42\n",
    purpose: "循环不执行时，初始元素仍应直接成为最小值。",
  }),
]);

export const FIRST_ALGORITHM_WALKTHROUGH = buildMaximumWalkthrough([3, 8, 2, 7, 4]);

export const FIRST_GUIDED_LESSON: GuidedLessonDefinition = defineGuidedLesson({
  id: FIRST_GUIDED_LESSON_ID,
  version: FIRST_GUIDED_LESSON_VERSION,
  title: "第一课 · 扫描求最大值",
  summary: "用真实运行、Trace、读图、Benchmark、积木补全和回归测试建立第一个算法与调试闭环。",
  initialSource: FIRST_ALGORITHM_SOURCE,
  initialScenarioId: MAXIMUM_SCENARIO_ID,
  initialScenarioVersion: FIRST_ALGORITHM_SCENARIO_VERSION,
  initialCaseId: "normal",
  missions: Object.freeze([
    mission(
      "mission.run",
      "运行",
      "在运行面板执行已选中的普通案例。",
      "先得到可核对的输出，后面的观察与修改才有基线。",
      ["确认案例是“普通输入”。", "stdin 应以 5 开头。", "点击“真实运行”，不要选择教学模拟。"],
      "run-panel",
      [
        stage("mission.run.execute", "得到第一个结果", "真实运行普通案例，输出必须为 8。", [
          runRequirement(
            "mission.run.normal",
            MAXIMUM_SCENARIO_ID,
            "normal",
            "8\n",
            FIRST_ALGORITHM_SOURCE_FINGERPRINT,
          ),
        ]),
      ],
    ),
    mission(
      "mission.observe",
      "观察",
      "启动真实 Trace，确认比较分支既走过 true，也走过 false。",
      "算法不是静态代码；路径证据能说明 maximum 何时更新、何时保持。",
      ["仍使用普通案例。", "打开运行流程中的 Trace。", "在画布上寻找比较节点的两种路径高亮。"],
      "trace-panel",
      [
        stage(
          "mission.observe.trace",
          "观察真实路径",
          "Trace 必须成功映射并覆盖比较节点的 true/false 分支。",
          [
            traceRequirement(
              "mission.observe.branches",
              MAXIMUM_SCENARIO_ID,
              "normal",
              FIRST_ALGORITHM_SOURCE_FINGERPRINT,
            ),
          ],
        ),
      ],
    ),
    mission(
      "mission.read-trace-chart",
      "读工作区图",
      "用刚才的真实 Trace 学会读横纵轴、事件点、参考线和工作量比值。",
      "运行图展示的是一次执行的事件证据。先读懂它，才能避免把事件密度、墙钟时间和复杂度混成一个结论。",
      [
        "横轴标题会明确写“事件顺序”或“事件时间跨度”。",
        "实心小点是语句，较大的分支点会标出 true / false。",
        "实测/参考比只比较同规模工作量，不是速度评分。",
      ],
      "trace-chart",
      [
        stage(
          "mission.read-trace-chart.axes",
          "先读轴与事件点",
          "查看刚才生成的 Trace 图，再选择横轴为“事件顺序”时最准确的解释。",
          [
            visualizationAnswerRequirement(
              "mission.read-trace-chart.axes.answer",
              "trace-chart",
              "later-event",
              "能正确解释事件顺序轴与累计事件轴",
            ),
          ],
        ),
        stage(
          "mission.read-trace-chart.reference",
          "再读参考线与比值",
          "根据同规模参考线，判断 1.25× 的工作量比值能够说明什么。",
          [
            visualizationAnswerRequirement(
              "mission.read-trace-chart.reference.answer",
              "trace-chart",
              "work-above-reference",
              "能区分工作量比值、速度和 Big-O",
            ),
          ],
        ),
      ],
    ),
    mission(
      "mission.complete",
      "补全",
      "先进入缺少更新块的骨架，再把“更新最大值”积木接入循环。",
      "把代码拆开再组回去，能建立积木、控制流和 C 源码之间的对应关系。",
      ["先点击“开始补全”。", "搜索预设“更新最大值”。", "拖到高亮连接位置，等待 CFG 验证后再运行。"],
      "flow-canvas",
      [
        stage(
          "mission.complete.skeleton",
          "进入补全骨架",
          "确认源码只缺少 maximum 更新块，仍能重解析并生成完整 CFG。",
          [
            sourceRequirement(
              "mission.complete.skeleton.verified",
              "maximum-skeleton",
              "maximum-update-removed",
              FIRST_ALGORITHM_SKELETON_FINGERPRINT,
              false,
            ),
          ],
        ),
        stage(
          "mission.complete.assemble",
          "接回更新块",
          "插入预设、合法连接、验证源码，再运行普通案例。",
          [
            Object.freeze({
              id: "mission.complete.preset",
              kind: "preset-inserted",
              label: "已插入“更新最大值”预设",
              presetId: MAXIMUM_UPDATE_PRESET_ID,
            }),
            Object.freeze({
              id: "mission.complete.connection",
              kind: "connection-committed",
              label: "连接已通过 CFG 安全门",
              presetId: MAXIMUM_UPDATE_PRESET_ID,
            }),
            sourceRequirement(
              "mission.complete.source",
              "maximum-complete",
              "maximum-update-inserted",
              FIRST_ALGORITHM_SOURCE_FINGERPRINT,
              true,
            ),
            runRequirement(
              "mission.complete.normal",
              MAXIMUM_SCENARIO_ID,
              "normal",
              "8\n",
              FIRST_ALGORITHM_SOURCE_FINGERPRINT,
            ),
          ],
        ),
      ],
    ),
    mission(
      "mission.read-analysis-chart",
      "读分析图",
      "先生成三个输入规模的可比 Benchmark，再解释中位数、波动范围、实测线和参考增长线。",
      "单次运行只能说明一个点。跨规模、重复运行且保持源码、情景和工具链一致，才有资格讨论增长趋势。",
      [
        "使用规模 8、32、128，每个规模重复 3 次。",
        "竖线是最小值到最大值；越长表示这组测量波动越大。",
        "判断增长形状优先看操作次数；实测曲线只支持、不能证明 Big-O。",
      ],
      "analysis-chart",
      [
        stage(
          "mission.read-analysis-chart.benchmark",
          "生成可比数据",
          "运行预设的 8 / 32 / 128 三组 Benchmark，每组至少重复 3 次。",
          [
            benchmarkRequirement(
              "mission.read-analysis-chart.benchmark.series",
              MAXIMUM_SCENARIO_ID,
              FIRST_ALGORITHM_SOURCE_FINGERPRINT,
              [8, 32, 128],
              3,
            ),
          ],
        ),
        stage(
          "mission.read-analysis-chart.variation",
          "读中位数与波动",
          "进入分析页查看实测点和竖线，再判断竖线变长代表什么。",
          [
            visualizationAnswerRequirement(
              "mission.read-analysis-chart.variation.answer",
              "analysis-chart",
              "larger-variation",
              "能正确解释中位数点与最小值—最大值范围",
            ),
          ],
        ),
        stage(
          "mission.read-analysis-chart.growth",
          "判断增长但不夸大",
          "切换到操作次数，比较实测线与参考线，再选择可以成立的结论。",
          [
            visualizationAnswerRequirement(
              "mission.read-analysis-chart.growth.answer",
              "analysis-chart",
              "supports-not-proves",
              "能用操作次数支持增长判断，同时保留 Big-O 证明边界",
            ),
          ],
        ),
      ],
    ),
    mission(
      "mission.debug",
      "调试",
      "复现比较符错误，用 Trace 找到错误路径，修复后完成三组回归。",
      "可复现输入、路径证据和边界回归比凭感觉改代码更可靠。",
      [
        "载入故障版本后选择全负数案例。",
        "错误输出应稳定为 -12。",
        "把 < 恢复为 >，再依次运行三组案例。",
      ],
      "code-pane",
      [
        stage(
          "mission.debug.reproduce",
          "复现并定位",
          "确认唯一比较符错误，得到 -12，并用真实 Trace 覆盖两条分支。",
          [
            sourceRequirement(
              "mission.debug.bug-source",
              "maximum-bug",
              "maximum-comparator-bug",
              FIRST_ALGORITHM_BUG_FINGERPRINT,
              true,
            ),
            runRequirement(
              "mission.debug.wrong-output",
              MAXIMUM_SCENARIO_ID,
              "negative",
              "-12\n",
              FIRST_ALGORITHM_BUG_FINGERPRINT,
              "teaching-failure",
            ),
            traceRequirement(
              "mission.debug.bug-trace",
              MAXIMUM_SCENARIO_ID,
              "negative",
              FIRST_ALGORITHM_BUG_FINGERPRINT,
            ),
          ],
        ),
        stage(
          "mission.debug.repair",
          "修复并回归",
          "恢复正确比较符，普通、全负数和单元素三组案例必须全部通过。",
          [
            sourceRequirement(
              "mission.debug.fixed-source",
              "maximum-complete",
              "maximum-comparator-restored",
              FIRST_ALGORITHM_SOURCE_FINGERPRINT,
              true,
            ),
            runRequirement(
              "mission.debug.normal",
              MAXIMUM_SCENARIO_ID,
              "normal",
              "8\n",
              FIRST_ALGORITHM_SOURCE_FINGERPRINT,
            ),
            runRequirement(
              "mission.debug.negative",
              MAXIMUM_SCENARIO_ID,
              "negative",
              "-4\n",
              FIRST_ALGORITHM_SOURCE_FINGERPRINT,
            ),
            runRequirement(
              "mission.debug.single",
              MAXIMUM_SCENARIO_ID,
              "single",
              "42\n",
              FIRST_ALGORITHM_SOURCE_FINGERPRINT,
            ),
          ],
        ),
      ],
    ),
    mission(
      "mission.migrate",
      "迁移",
      "独立把算法改为扫描最小值，并运行三组边界案例。",
      "迁移要求保留算法结构，只改变状态含义和比较方向。",
      [
        "maximum 与输出都要改成 minimum。",
        "更新条件应为 value < minimum。",
        "保持一次循环扫描，并运行普通、全负数、单元素案例。",
      ],
      "flow-canvas",
      [
        stage(
          "mission.migrate.minimum",
          "完成最小值算法",
          "源码结构、三组输出和线性扫描证据必须同时成立。",
          [
            sourceRequirement(
              "mission.migrate.source",
              "minimum-complete",
              "minimum-migration",
              null,
              true,
            ),
            runRequirement("mission.migrate.normal", MINIMUM_SCENARIO_ID, "normal", "2\n", null),
            runRequirement(
              "mission.migrate.negative",
              MINIMUM_SCENARIO_ID,
              "negative",
              "-12\n",
              null,
            ),
            runRequirement("mission.migrate.single", MINIMUM_SCENARIO_ID, "single", "42\n", null),
          ],
        ),
      ],
    ),
  ]),
});

export function replaceSourceExactlyOnce(
  source: string,
  expectedFingerprint: string,
  search: string,
  replacement: string,
): GuidedSourceTransformResult {
  if (fingerprintSource(source) !== expectedFingerprint) {
    return Object.freeze({ ok: false, source, reason: "fingerprint-mismatch" });
  }
  const first = source.indexOf(search);
  if (first < 0) return Object.freeze({ ok: false, source, reason: "pattern-missing" });
  if (source.indexOf(search, first + search.length) >= 0) {
    return Object.freeze({ ok: false, source, reason: "pattern-ambiguous" });
  }
  const next = `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
  return Object.freeze({
    ok: true,
    source: next,
    previousFingerprint: expectedFingerprint,
    sourceFingerprint: fingerprintSource(next),
  });
}

export function createFirstAlgorithmSkeleton(
  source: string,
  expectedFingerprint: string,
): GuidedSourceTransformResult {
  return replaceSourceExactlyOnce(
    source,
    expectedFingerprint,
    MAXIMUM_UPDATE_BLOCK,
    MAXIMUM_SKELETON_MARKER,
  );
}

export function restoreFirstAlgorithmUpdate(
  source: string,
  expectedFingerprint: string,
): GuidedSourceTransformResult {
  return replaceSourceExactlyOnce(
    source,
    expectedFingerprint,
    MAXIMUM_SKELETON_MARKER,
    MAXIMUM_UPDATE_BLOCK,
  );
}

export function injectFirstAlgorithmBug(
  source: string,
  expectedFingerprint: string,
): GuidedSourceTransformResult {
  return replaceSourceExactlyOnce(
    source,
    expectedFingerprint,
    MAXIMUM_CORRECT_CONDITION,
    MAXIMUM_BUG_CONDITION,
  );
}

export function restoreFirstAlgorithmBug(
  source: string,
  expectedFingerprint: string,
): GuidedSourceTransformResult {
  return replaceSourceExactlyOnce(
    source,
    expectedFingerprint,
    MAXIMUM_BUG_CONDITION,
    MAXIMUM_CORRECT_CONDITION,
  );
}

export function buildMaximumWalkthrough(
  values: readonly number[],
): readonly FirstAlgorithmWalkthroughRow[] {
  if (values.length === 0 || values.some((value) => !Number.isSafeInteger(value))) {
    throw new RangeError("推演输入必须是非空的安全整数序列");
  }
  let maximum = values[0]!;
  const rows: FirstAlgorithmWalkthroughRow[] = [
    Object.freeze({
      inputIndex: 0,
      value: maximum,
      maximumBefore: null,
      comparison: null,
      branchTaken: null,
      maximumAfter: maximum,
    }),
  ];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]!;
    const before = maximum;
    const taken = value > before;
    if (taken) maximum = value;
    rows.push(
      Object.freeze({
        inputIndex: index,
        value,
        maximumBefore: before,
        comparison: `${String(value)} > ${String(before)}`,
        branchTaken: taken,
        maximumAfter: maximum,
      }),
    );
  }
  return Object.freeze(rows);
}

export function firstMinimumAlgorithmCase(id: FirstAlgorithmCase["id"]): FirstAlgorithmCase {
  const item = FIRST_MINIMUM_ALGORITHM_CASES.find((candidate) => candidate.id === id);
  if (item === undefined) throw new RangeError(`未知最小值案例：${id}`);
  return item;
}

function mission(
  id: string,
  title: string,
  instruction: string,
  why: string,
  hints: readonly [string, string, string],
  locateTargetId: string,
  stages: GuidedMissionDefinition["stages"],
): GuidedMissionDefinition {
  return Object.freeze({ id, title, instruction, why, hints, locateTargetId, stages });
}

function stage(
  id: string,
  title: string,
  instruction: string,
  requirements: readonly GuidedRequirement[],
) {
  return Object.freeze({ id, title, instruction, requirements: Object.freeze(requirements) });
}

function sourceRequirement(
  id: string,
  profile: GuidedSourceProfile,
  exactDiff: GuidedExactDiff,
  expectedSourceFingerprint: string | null,
  linearScan: boolean,
): GuidedRequirement {
  return Object.freeze({
    id,
    kind: "source-verified",
    label: "源码通过精确差异、重解析、无损往返和 CFG 验证",
    profile,
    exactDiff,
    expectedSourceFingerprint,
    requireReparse: true,
    requireLosslessRoundTrip: true,
    requireCompleteCfg: true,
    requireLinearScan: linearScan,
  });
}

function runRequirement(
  id: string,
  scenarioId: string,
  caseId: FirstAlgorithmCase["id"],
  expectedStdout: string,
  expectedSourceFingerprint: string | null,
  historyDisposition: GuidedRealRunRequirement["historyDisposition"] = "success",
): GuidedRealRunRequirement {
  return Object.freeze({
    id,
    kind: "real-run",
    label: `${caseId} 真实运行输出 ${expectedStdout.trim()}`,
    scenarioId,
    scenarioVersion: FIRST_ALGORITHM_SCENARIO_VERSION,
    caseId,
    expectedSourceFingerprint,
    expectedStdout,
    historyDisposition,
  });
}

function traceRequirement(
  id: string,
  scenarioId: string,
  caseId: FirstAlgorithmCase["id"],
  expectedSourceFingerprint: string,
): GuidedRealTraceRequirement {
  return Object.freeze({
    id,
    kind: "real-trace",
    label: "真实 Trace 覆盖比较节点 true/false 分支",
    scenarioId,
    scenarioVersion: FIRST_ALGORITHM_SCENARIO_VERSION,
    caseId,
    expectedSourceFingerprint,
    branchRole: "maximum-update-condition",
    requiredOutcomes: Object.freeze(["true", "false"] as const),
    allowTruncated: false,
  });
}

function benchmarkRequirement(
  id: string,
  scenarioId: string,
  expectedSourceFingerprint: string,
  sizes: readonly number[],
  minRepetitions: number,
): GuidedRequirement {
  return Object.freeze({
    id,
    kind: "benchmark-series",
    label: "同源码、同情景、同工具链完成 8 / 32 / 128 三个规模，每个至少 3 次真实运行",
    scenarioId,
    scenarioVersion: FIRST_ALGORITHM_SCENARIO_VERSION,
    expectedSourceFingerprint,
    sizes: Object.freeze([...sizes]),
    minRepetitions,
  });
}

function visualizationAnswerRequirement(
  id: string,
  visualizationId: "trace-chart" | "analysis-chart",
  answerId: string,
  label: string,
): GuidedRequirement {
  return Object.freeze({ id, kind: "visualization-answer", label, visualizationId, answerId });
}

function requireStaticTransform(result: GuidedSourceTransformResult): string {
  if (!result.ok) throw new Error(`内置课程源码转换失败：${result.reason}`);
  return result.source;
}
