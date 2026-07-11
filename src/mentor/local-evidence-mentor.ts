import type { AnalysisFinding, AnalysisFindingRuleId, LoopRegion } from "../analysis/index.js";
import type { TextRange } from "../core/index.js";
import { summarizeComparableRuns } from "../runtime/index.js";
import type {
  MentorHint,
  MentorHintContext,
  MentorHintEvidence,
  MentorHintProvider,
  MentorHintTarget,
  RealExecutionPathSummary,
} from "./contracts.js";

const PROVIDER_ID = "builtin.local-evidence-mentor";

export class LocalEvidenceMentor implements MentorHintProvider {
  readonly id = PROVIDER_ID;
  readonly version = "1.0.0";
  readonly networkAccess = "none" as const;
  readonly sourceMutation = "none" as const;

  getHints(context: MentorHintContext): readonly MentorHint[] {
    assertContext(context);
    const hints: MentorHint[] = context.analysis.findings.map(findingHint);
    hints.push(...nestedLoopHints(context));
    const pathHint = realPathHint(context.realPath, context);
    if (pathHint !== null) hints.push(pathHint);
    hints.push(...historyHints(context));
    return Object.freeze(hints.sort(compareHints));
  }
}

function findingHint(finding: AnalysisFinding): MentorHint {
  const wording = findingWording(finding.ruleId, finding.subject);
  const target = freezeTarget(finding.primaryRange, finding.ownerNodeId);
  const evidence: MentorHintEvidence[] = [
    freezeEvidence("analysis-finding", "静态分析主位置", finding.primaryRange, finding.ownerNodeId),
    ...finding.evidence.map((item) =>
      freezeEvidence("analysis-finding", `证据：${item.role}`, item.range, finding.ownerNodeId),
    ),
  ];
  return freezeHint({
    id: `mentor.finding.${finding.id}`,
    level: finding.confidence === "certain" ? "verification" : "elaboration",
    confidence: finding.confidence,
    title: wording.title,
    summary: wording.summary,
    nextStep: wording.nextStep,
    target,
    evidence,
  });
}

function nestedLoopHints(context: MentorHintContext): MentorHint[] {
  const hints: MentorHint[] = [];
  for (const defUse of context.analysis.defUse) {
    const byId = new Map(defUse.loopRegions.map((loop) => [loop.id, loop]));
    for (const loop of defUse.loopRegions) {
      if (loop.availability !== "analyzable" || loop.parentLoopId === null) continue;
      const parent = byId.get(loop.parentLoopId);
      if (parent === undefined || parent.availability !== "analyzable") continue;
      hints.push(nestedLoopHint(loop, parent));
    }
  }
  return hints;
}

function nestedLoopHint(loop: LoopRegion, parent: LoopRegion): MentorHint {
  return freezeHint({
    id: `mentor.loop.nested.${loop.id}`,
    level: "strategy",
    confidence: "hint",
    title: "嵌套循环值得单独测量",
    summary: "静态结构显示这个循环位于另一个可分析循环内，但这本身不证明复杂度或低效。",
    nextStep: "为至少三个输入规模记录插桩操作计数，再检查重复工作是否随两个循环边界共同增长。",
    target: freezeTarget(loop.range, loop.conditionNodeId),
    evidence: [
      freezeEvidence("loop-structure", "内层循环", loop.range, loop.conditionNodeId),
      freezeEvidence("loop-structure", "外层循环", parent.range, parent.conditionNodeId),
    ],
  });
}

function realPathHint(
  value: RealExecutionPathSummary | null | undefined,
  context: MentorHintContext,
): MentorHint | null {
  if (
    value === null ||
    value === undefined ||
    value.mode !== "real" ||
    value.sourceFingerprint !== context.analysis.sourceFingerprint
  ) {
    return null;
  }
  const nodes = new Set(
    context.analysis.functions.flatMap((func) => func.nodes.map((node) => node.id)),
  );
  const visits = value.nodeVisits
    .filter(
      (visit) =>
        nodes.has(visit.nodeId) &&
        Number.isSafeInteger(visit.count) &&
        visit.count > 0 &&
        validRange(visit.range),
    )
    .sort((left, right) => right.count - left.count || compareRange(left.range, right.range));
  const hottest = visits[0];
  if (hottest === undefined || hottest.count < 2) return null;
  return freezeHint({
    id: `mentor.path.${value.scenario.id}.${hottest.nodeId}`,
    level: "elaboration",
    confidence: "hint",
    title: "真实路径重复经过此节点",
    summary: `当前真实情景路径经过此节点 ${String(hottest.count)} 次；该次数只代表本次输入。`,
    nextStep: "换用更大和更小的同一情景输入重复测量，再决定这里是否值得优化。",
    target: freezeTarget(hottest.range, hottest.nodeId),
    evidence: [
      freezeEvidence(
        "real-path",
        `真实路径访问 ${String(hottest.count)} 次`,
        hottest.range,
        hottest.nodeId,
      ),
    ],
  });
}

function historyHints(context: MentorHintContext): MentorHint[] {
  if (
    context.runHistory === null ||
    context.runHistory === undefined ||
    context.comparisonKey === null ||
    context.comparisonKey === undefined ||
    context.comparisonKey.sourceFingerprint !== context.analysis.sourceFingerprint
  ) {
    return [];
  }
  let summary;
  try {
    summary = summarizeComparableRuns(context.runHistory, context.comparisonKey);
  } catch {
    return [];
  }
  if (summary.runIds.length < 2) return [];
  const hints: MentorHint[] = [
    freezeHint({
      id: `mentor.history.median.${context.comparisonKey.scenario.id}`,
      level: "elaboration",
      confidence: summary.runIds.length >= 5 ? "likely" : "hint",
      title: "同条件运行中位数",
      summary: `同源码、同情景、同工具链、同规模和同案例共有 ${String(summary.runIds.length)} 次真实运行；耗时中位数为 ${formatMetric(summary.durationMs.median, "ms")}，峰值内存中位数为 ${formatMetric(summary.peakRssBytes.median, "bytes")}。`,
      nextStep: "分别比较耗时、内存和操作计数，不要把它们压成一个综合分。",
      target: null,
      evidence: [freezeRunEvidence("严格可比运行历史", summary.runIds)],
    }),
  ];
  if (summary.growth.points.length >= 3) {
    hints.push(
      freezeHint({
        id: `mentor.history.growth.${context.comparisonKey.scenario.id}`,
        level: "strategy",
        confidence: summary.growth.confidence === "medium" ? "likely" : "hint",
        title: "操作计数增长证据",
        summary: `${summary.growth.evidence} 观察趋势：${growthLabel(summary.growth.trend)}。`,
        nextStep: "检查操作计数点和输入生成器是否代表目标问题；不要把经验斜率当作 Big-O 证明。",
        target: null,
        evidence: [freezeRunEvidence("插桩操作计数增长曲线", summary.growthRunIds)],
      }),
    );
  }
  return hints;
}

function findingWording(
  ruleId: AnalysisFindingRuleId,
  subject: string | null,
): { readonly title: string; readonly summary: string; readonly nextStep: string } {
  const name = subject === null ? "相关表达式" : subject;
  const messages: Readonly<
    Record<AnalysisFindingRuleId, readonly [title: string, summary: string, nextStep: string]>
  > = {
    "unreachable-code": [
      "发现不可达路径",
      "CFG 中没有从函数入口到达该节点的路径。",
      "检查此前的 return、break 或恒定控制转移，确认这段代码应删除还是控制条件写错。",
    ],
    "uninitialized-read": [
      "读取前缺少可靠初始化",
      `${name} 的到达定义证据不足以证明读取前已经写入。`,
      "沿证据位置逐条检查每条可达分支是否都先赋值，再决定在哪里补初始化。",
    ],
    "literal-out-of-bounds": [
      "固定下标越过数组范围",
      `${name} 的字面量下标与已知固定长度不一致。`,
      "对照数组声明的有效区间 0 到 length-1，修正下标或数据结构尺寸。",
    ],
    "loop-off-by-one": [
      "循环边界可能多走一步",
      `${name} 的循环条件可能到达固定数组长度本身。`,
      "对照有效下标上界检查 < 与 <=，并用最小长度和满长度案例运行。",
    ],
    "memory-leak": [
      "所有正常出口仍持有分配",
      `${name} 在当前建模的正常退出路径上仍为已分配状态。`,
      "逐个正常出口确认所有权应释放还是转移；只有当前函数仍拥有时才添加 free。",
    ],
    "possible-memory-leak": [
      "部分正常出口可能保留分配",
      `${name} 仅在部分已建模路径上仍为已分配状态。`,
      "比较泄漏路径与已释放路径的分支差异，再决定清理位置。",
    ],
    "double-free": [
      "同一所有权可能重复释放",
      `${name} 在这次 free 前已处于必然释放状态。`,
      "沿分配和两次释放证据检查所有权；保留唯一释放责任。",
    ],
    "possible-double-free": [
      "部分路径可能重复释放",
      `${name} 在这次 free 前可能已经释放。`,
      "检查汇合前各分支的释放行为，并避免多个路径共享同一释放责任。",
    ],
    "use-after-free": [
      "释放后仍被解引用",
      `${name} 在该解引用前已处于必然释放状态。`,
      "确认对象生命周期；把使用移到释放前，或重新设计所有权而不是仅隐藏指针值。",
    ],
    "possible-use-after-free": [
      "部分路径可能释放后使用",
      `${name} 在该解引用前可能已经释放。`,
      "比较进入该节点的路径，找出释放与继续使用发生分歧的位置。",
    ],
    "malloc-sizeof-pointer": [
      "分配大小使用了指针宽度",
      `${name} 的分配表达式使用 sizeof(pointer) 而非指向对象。`,
      "核对元素类型与数量；优先让 sizeof 绑定解引用后的目标类型。",
    ],
    "unchecked-allocation": [
      "分配结果未证明非空",
      `${name} 在解引用前没有可证明的非空保护。`,
      "在首次解引用前处理分配失败路径，并保持错误处理路径可达。",
    ],
    "runtime-bound-check": [
      "运行时下标需要边界证据",
      `${name} 的运行时下标无法由当前静态事实证明安全。`,
      "在访问前明确验证 0 <= index 且 index < length，并加入边界案例。",
    ],
    "loop-index-mismatch": [
      "循环条件没有约束实际下标",
      `${name} 使用的数组下标与循环边界约束的变量不一致。`,
      "确认循环条件约束的是同一个索引，或在访问前增加独立边界检查。",
    ],
  };
  const [title, summary, nextStep] = messages[ruleId];
  return Object.freeze({ title, summary, nextStep });
}

function freezeHint(input: Omit<MentorHint, "sourceMutation">): MentorHint {
  return Object.freeze({
    ...input,
    evidence: Object.freeze([...input.evidence]),
    sourceMutation: "none",
  });
}

function freezeTarget(range: TextRange, nodeId: string): MentorHintTarget {
  return Object.freeze({ range: freezeRange(range), nodeId });
}

function freezeEvidence(
  kind: MentorHintEvidence["kind"],
  label: string,
  range: TextRange,
  nodeId: string,
): MentorHintEvidence {
  return Object.freeze({
    kind,
    label,
    range: freezeRange(range),
    nodeId,
    runIds: Object.freeze([]),
  });
}

function freezeRunEvidence(label: string, runIds: readonly string[]): MentorHintEvidence {
  return Object.freeze({
    kind: "run-history",
    label,
    range: null,
    nodeId: null,
    runIds: Object.freeze([...runIds]),
  });
}

function freezeRange(range: TextRange): TextRange {
  return Object.freeze({ from: range.from, to: range.to });
}

function assertContext(context: MentorHintContext): void {
  if (
    context === null ||
    typeof context !== "object" ||
    context.analysis === null ||
    typeof context.analysis !== "object" ||
    typeof context.analysis.sourceFingerprint !== "string"
  ) {
    throw new TypeError("LocalEvidenceMentor 缺少 ProgramAnalysisSnapshot");
  }
}

function validRange(range: TextRange): boolean {
  return (
    Number.isSafeInteger(range.from) &&
    Number.isSafeInteger(range.to) &&
    range.from >= 0 &&
    range.to >= range.from
  );
}

function compareHints(left: MentorHint, right: MentorHint): number {
  const leftFrom = left.target?.range.from ?? Number.MAX_SAFE_INTEGER;
  const rightFrom = right.target?.range.from ?? Number.MAX_SAFE_INTEGER;
  return leftFrom - rightFrom || left.id.localeCompare(right.id, "en");
}

function compareRange(left: TextRange, right: TextRange): number {
  return left.from - right.from || left.to - right.to;
}

function formatMetric(value: number | null, unit: string): string {
  return value === null ? "无有效样本" : `${String(Math.round(value * 1000) / 1000)} ${unit}`;
}

function growthLabel(value: "insufficient" | "stable" | "increasing" | "non-monotonic"): string {
  const labels = {
    insufficient: "证据不足",
    stable: "近似稳定",
    increasing: "随输入增长",
    "non-monotonic": "非单调",
  } as const;
  return labels[value];
}
