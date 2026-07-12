import type {
  RunComparisonKey,
  RunHistoryDocument,
  RunHistoryEntry,
  RunScenarioIdentity,
  RunToolchainIdentity,
} from "./contracts.js";
import { median, parseRunHistoryDocument, selectComparableRuns } from "./run-history.js";

export type ComplexityCurve =
  "constant" | "log-n" | "linear" | "n-log-n" | "quadratic" | "cubic" | "v-plus-e";

export interface ComplexityReference {
  readonly curve: ComplexityCurve;
  readonly label: string;
  readonly source: "builtin-scenario" | "user-confirmed" | "ai-suggested";
  readonly confirmed: boolean;
  readonly evidence: string;
}

export interface EvidenceMetricRange {
  readonly sampleCount: number;
  readonly median: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

export interface EvidenceMetricMedian {
  readonly sampleCount: number;
  readonly median: number | null;
}

export interface EvidenceAnalyticsPoint {
  readonly inputSize: number;
  /** Successful process-exit runs in this source/scenario/toolchain cohort. */
  readonly sampleCount: number;
  readonly runIds: readonly string[];
  readonly durationMs: EvidenceMetricRange;
  readonly operationCount: EvidenceMetricRange;
  readonly peakRssBytes: EvidenceMetricMedian;
}

export interface EvidenceAnalyticsCohort {
  readonly sourceFingerprint: string;
  readonly scenario: RunScenarioIdentity;
  readonly toolchain: RunToolchainIdentity;
  readonly selectedBy: "comparison-key" | "latest-successful-run";
}

export interface ReferenceGrowthPoint {
  readonly inputSize: number;
  readonly sampleCount: number;
  readonly actualGrowth: number;
  readonly referenceGrowth: number;
  /** referenceGrowth / actualGrowth; a normalized comparison, never a score. */
  readonly ratio: number;
}

export interface ReferenceGrowthComparison {
  readonly status: "ready" | "insufficient" | "unconfirmed";
  readonly anchorInputSize: number | null;
  readonly points: readonly ReferenceGrowthPoint[];
  readonly evidence: string;
}

export interface RunHistoryEvidenceAnalytics {
  readonly sourceFingerprint: string;
  readonly cohort: EvidenceAnalyticsCohort | null;
  readonly runIds: readonly string[];
  readonly unscaledRunIds: readonly string[];
  readonly points: readonly EvidenceAnalyticsPoint[];
  readonly reference: ComplexityReference | null;
  readonly growth: ReferenceGrowthComparison;
  readonly evidence: string;
}

export interface ScenarioReferenceWorkload {
  readonly inputSize: number;
  readonly referenceOperationCount: number;
  readonly label: string;
  readonly evidence: string;
}

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const MINIMUM_GROWTH_SIZES = 3;

const BUILTIN_COMPLEXITY_REFERENCES: Readonly<Record<string, ComplexityReference>> = Object.freeze({
  "scenario.sorting.integers": reference(
    "n-log-n",
    "n log n",
    "内置整数排序情景使用 n log n 作为增长参考；它不是对当前实现的复杂度证明。",
  ),
  "scenario.searching.linear": reference("linear", "n", "内置线性搜索情景使用线性增长参考。"),
  "scenario.searching.maximum": reference(
    "linear",
    "n（线性扫描）",
    "内置最大值情景逐项扫描 count 个整数，使用线性增长作为参考；它不是对当前实现的复杂度证明。",
  ),
  "scenario.searching.minimum": reference(
    "linear",
    "n（线性扫描）",
    "内置最小值情景逐项扫描 count 个整数，使用线性增长作为参考；它不是对当前实现的复杂度证明。",
  ),
  "scenario.recursion.factorial": reference(
    "linear",
    "n",
    "内置递归阶乘情景使用线性调用深度增长参考。",
  ),
  "scenario.linked-list.reverse": reference(
    "linear",
    "n",
    "内置链表逆序遍历情景使用线性节点访问增长参考。",
  ),
  "scenario.tree.inorder": reference("linear", "n", "内置树中序遍历情景使用线性节点访问增长参考。"),
  "scenario.graph.bfs-chain": reference(
    "v-plus-e",
    "V + E",
    "内置链式图 BFS 情景以 V=n、E=n-1 近似 V+E 增长。",
  ),
  "scenario.dynamic-programming.fibonacci": reference(
    "linear",
    "n",
    "内置自底向上 Fibonacci 情景使用线性状态更新增长参考。",
  ),
});

/**
 * Builds immutable benchmark evidence from one homogeneous source/scenario/toolchain cohort.
 * When no comparison key is supplied, the newest successful current-source run selects the cohort.
 */
export function analyzeRunHistoryEvidence(
  document: RunHistoryDocument,
  currentSourceFingerprint: string,
  comparisonKey: RunComparisonKey | null | undefined = null,
): RunHistoryEvidenceAnalytics {
  const sourceFingerprint = assertFingerprint(currentSourceFingerprint);
  const current = parseRunHistoryDocument(document);
  if (comparisonKey !== null && comparisonKey !== undefined) {
    // Reuse the run-history contract validator before reading any caller-owned fields.
    selectComparableRuns(current, comparisonKey);
    if (comparisonKey.sourceFingerprint !== sourceFingerprint) {
      throw new TypeError("comparisonKey sourceFingerprint 与当前源码不一致");
    }
  }

  const successfulCurrentRuns = current.entries.filter(
    (entry) =>
      entry.sourceFingerprint === sourceFingerprint &&
      entry.measurement.ok &&
      entry.measurement.termination === "process-exit",
  );
  const selector =
    comparisonKey === null || comparisonKey === undefined
      ? (successfulCurrentRuns.at(-1) ?? null)
      : comparisonKey;
  if (selector === null) {
    return freezeAnalytics({
      sourceFingerprint,
      cohort: null,
      runIds: [],
      unscaledRunIds: [],
      points: [],
      reference: null,
      growth: unconfirmedGrowth("当前源码没有可用于选择同情景、同工具链 cohort 的成功真实运行。"),
      evidence: "当前源码没有成功完成的真实运行证据。",
    });
  }

  const selectedBy =
    comparisonKey === null || comparisonKey === undefined
      ? ("latest-successful-run" as const)
      : ("comparison-key" as const);
  const cohort = freezeCohort(sourceFingerprint, selector.scenario, selector.toolchain, selectedBy);
  const runs = successfulCurrentRuns.filter(
    (entry) =>
      sameScenario(entry.scenario, cohort.scenario) &&
      sameToolchain(entry.toolchain, cohort.toolchain),
  );
  const scaled = runs.filter((entry) => entry.inputSize !== null);
  const unscaled = runs.filter((entry) => entry.inputSize === null);
  const points = aggregateByInputSize(scaled);
  const complexityReference = defaultComplexityReference(cohort.scenario.id);
  const growth = compareGrowthToReference(points, complexityReference);
  return freezeAnalytics({
    sourceFingerprint,
    cohort,
    runIds: runs.map((entry) => entry.id),
    unscaledRunIds: unscaled.map((entry) => entry.id),
    points,
    reference: complexityReference,
    growth,
    evidence:
      runs.length === 0
        ? "当前源码没有同情景、同工具链且成功完成的真实运行。"
        : `${String(runs.length)} 条同源码、同情景、同工具链且成功完成的真实运行；按输入规模分别汇总，不合成为综合分。`,
  });
}

export function defaultComplexityReference(scenarioId: string): ComplexityReference | null {
  if (typeof scenarioId !== "string" || !STABLE_ID_PATTERN.test(scenarioId)) {
    throw new TypeError("scenarioId 必须是稳定标识符");
  }
  return BUILTIN_COMPLEXITY_REFERENCES[scenarioId] ?? null;
}

export function scenarioReferenceWorkload(
  scenarioId: string,
  inputSize: number,
): ScenarioReferenceWorkload | null {
  if (!Number.isSafeInteger(inputSize) || inputSize <= 0) {
    throw new TypeError("inputSize 必须是正安全整数");
  }
  const complexityReference = defaultComplexityReference(scenarioId);
  if (complexityReference === null || !complexityReference.confirmed) return null;
  return Object.freeze({
    inputSize,
    referenceOperationCount: Math.max(
      1,
      roundMetric(curveValue(complexityReference.curve, inputSize)),
    ),
    label: `${complexityReference.label} 参考工作量`,
    evidence: complexityReference.evidence,
  });
}

export function compareGrowthToReference(
  points: readonly EvidenceAnalyticsPoint[],
  complexityReference: ComplexityReference | null,
): ReferenceGrowthComparison {
  const normalizedPoints = normalizeAnalyticsPoints(points);
  if (complexityReference === null) {
    return unconfirmedGrowth("尚无已确认参考增长曲线；不会推断理想效率或复杂度。");
  }
  const normalizedReference = normalizeReference(complexityReference);
  if (!normalizedReference.confirmed) {
    return unconfirmedGrowth(
      `${normalizedReference.label} 仅是${referenceSourceLabel(normalizedReference.source)}，确认前不计算参考增长比。`,
    );
  }

  const valid = normalizedPoints.filter((point) => {
    const operations = point.operationCount.median;
    return (
      operations !== null &&
      operations > 0 &&
      Number.isFinite(operations) &&
      curveValue(normalizedReference.curve, point.inputSize) > 0
    );
  });
  const anchor = valid[0];
  if (anchor === undefined) {
    return insufficientGrowth(null, [], "没有同时具备正操作计数和有效参考曲线值的输入规模。");
  }
  const anchorOperations = anchor.operationCount.median!;
  const anchorReference = curveValue(normalizedReference.curve, anchor.inputSize);
  const growthPoints = valid.map((point) => {
    const operations = point.operationCount.median!;
    const actualGrowth = operations / anchorOperations;
    const referenceGrowth =
      curveValue(normalizedReference.curve, point.inputSize) / anchorReference;
    return Object.freeze({
      inputSize: point.inputSize,
      sampleCount: point.operationCount.sampleCount,
      actualGrowth: roundMetric(actualGrowth),
      referenceGrowth: roundMetric(referenceGrowth),
      ratio: roundMetric(referenceGrowth / actualGrowth),
    });
  });
  if (growthPoints.length < MINIMUM_GROWTH_SIZES) {
    return insufficientGrowth(
      anchor.inputSize,
      growthPoints,
      `至少需要 ${String(MINIMUM_GROWTH_SIZES)} 个不同输入规模的正操作计数；当前只有 ${String(growthPoints.length)} 个。`,
    );
  }
  return Object.freeze({
    status: "ready" as const,
    anchorInputSize: anchor.inputSize,
    points: Object.freeze(growthPoints),
    evidence: "按首个有效输入规模归一化；参考增长比只比较经验操作增长，不是 Big-O 证明或综合评分。",
  });
}

function aggregateByInputSize(
  entries: readonly RunHistoryEntry[],
): readonly EvidenceAnalyticsPoint[] {
  const grouped = new Map<number, RunHistoryEntry[]>();
  for (const entry of entries) {
    const inputSize = entry.inputSize;
    if (inputSize === null) continue;
    const group = grouped.get(inputSize) ?? [];
    group.push(entry);
    grouped.set(inputSize, group);
  }
  return Object.freeze(
    [...grouped.entries()]
      .sort(([left], [right]) => left - right)
      .map(([inputSize, group]) =>
        Object.freeze({
          inputSize,
          sampleCount: group.length,
          runIds: Object.freeze(group.map((entry) => entry.id)),
          durationMs: metricRange(group.map((entry) => entry.measurement.durationMs)),
          operationCount: metricRange(
            group.flatMap((entry) =>
              entry.measurement.operationCount === null ? [] : [entry.measurement.operationCount],
            ),
          ),
          peakRssBytes: metricMedian(
            group.flatMap((entry) =>
              entry.measurement.peakRssBytes === null ? [] : [entry.measurement.peakRssBytes],
            ),
          ),
        }),
      ),
  );
}

function metricRange(values: readonly number[]): EvidenceMetricRange {
  const sorted = [...values].sort((left, right) => left - right);
  return Object.freeze({
    sampleCount: sorted.length,
    median: median(sorted),
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
  });
}

function metricMedian(values: readonly number[]): EvidenceMetricMedian {
  return Object.freeze({ sampleCount: values.length, median: median(values) });
}

function normalizeAnalyticsPoints(
  points: readonly EvidenceAnalyticsPoint[],
): readonly EvidenceAnalyticsPoint[] {
  if (!Array.isArray(points)) throw new TypeError("points 必须是数组");
  let previousSize = 0;
  return Object.freeze(
    points.map((point) => {
      if (
        point === null ||
        typeof point !== "object" ||
        !Number.isSafeInteger(point.inputSize) ||
        point.inputSize <= previousSize ||
        !Number.isSafeInteger(point.sampleCount) ||
        point.sampleCount <= 0 ||
        !validMetricRange(point.durationMs) ||
        !validMetricRange(point.operationCount) ||
        !validMetricMedian(point.peakRssBytes) ||
        point.durationMs.sampleCount !== point.sampleCount ||
        point.operationCount.sampleCount > point.sampleCount ||
        point.peakRssBytes.sampleCount > point.sampleCount ||
        !Array.isArray(point.runIds) ||
        point.runIds.length !== point.sampleCount ||
        new Set(point.runIds).size !== point.runIds.length ||
        point.runIds.some((id: unknown) => typeof id !== "string" || !STABLE_ID_PATTERN.test(id))
      ) {
        throw new TypeError("benchmark point 无效或未按 inputSize 严格递增");
      }
      previousSize = point.inputSize;
      return Object.freeze({
        inputSize: point.inputSize,
        sampleCount: point.sampleCount,
        runIds: Object.freeze([...point.runIds]),
        durationMs: Object.freeze({ ...point.durationMs }),
        operationCount: Object.freeze({ ...point.operationCount }),
        peakRssBytes: Object.freeze({ ...point.peakRssBytes }),
      });
    }),
  );
}

function validMetricRange(value: EvidenceMetricRange): boolean {
  if (value === null || typeof value !== "object" || !Number.isSafeInteger(value.sampleCount)) {
    return false;
  }
  if (value.sampleCount === 0)
    return value.median === null && value.min === null && value.max === null;
  return (
    value.sampleCount > 0 &&
    validNonNegativeMetric(value.min) &&
    validNonNegativeMetric(value.median) &&
    validNonNegativeMetric(value.max) &&
    value.min <= value.median &&
    value.median <= value.max
  );
}

function validMetricMedian(value: EvidenceMetricMedian): boolean {
  if (value === null || typeof value !== "object" || !Number.isSafeInteger(value.sampleCount)) {
    return false;
  }
  return value.sampleCount === 0
    ? value.median === null
    : value.sampleCount > 0 && validNonNegativeMetric(value.median);
}

function validNonNegativeMetric(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function normalizeReference(value: ComplexityReference): ComplexityReference {
  if (
    value === null ||
    typeof value !== "object" ||
    !isComplexityCurve(value.curve) ||
    typeof value.label !== "string" ||
    value.label.trim().length === 0 ||
    value.label.length > 128 ||
    !["builtin-scenario", "user-confirmed", "ai-suggested"].includes(value.source) ||
    typeof value.confirmed !== "boolean" ||
    typeof value.evidence !== "string" ||
    value.evidence.trim().length === 0 ||
    value.evidence.length > 1_024
  ) {
    throw new TypeError("complexity reference 无效");
  }
  return Object.freeze({ ...value });
}

function curveValue(curve: ComplexityCurve, inputSize: number): number {
  if (!Number.isSafeInteger(inputSize) || inputSize <= 0) return 0;
  if (curve === "constant") return 1;
  if (curve === "log-n") return Math.log2(inputSize);
  if (curve === "linear") return inputSize;
  if (curve === "n-log-n") return inputSize * Math.log2(inputSize);
  if (curve === "quadratic") return inputSize ** 2;
  if (curve === "cubic") return inputSize ** 3;
  return inputSize + Math.max(0, inputSize - 1);
}

function isComplexityCurve(value: unknown): value is ComplexityCurve {
  return ["constant", "log-n", "linear", "n-log-n", "quadratic", "cubic", "v-plus-e"].includes(
    value as ComplexityCurve,
  );
}

function reference(curve: ComplexityCurve, label: string, evidence: string): ComplexityReference {
  return Object.freeze({
    curve,
    label,
    source: "builtin-scenario" as const,
    confirmed: true,
    evidence,
  });
}

function freezeCohort(
  sourceFingerprint: string,
  scenario: RunScenarioIdentity,
  toolchain: RunToolchainIdentity,
  selectedBy: EvidenceAnalyticsCohort["selectedBy"],
): EvidenceAnalyticsCohort {
  return Object.freeze({
    sourceFingerprint,
    scenario: Object.freeze({ ...scenario }),
    toolchain: Object.freeze({ ...toolchain }),
    selectedBy,
  });
}

function sameScenario(left: RunScenarioIdentity, right: RunScenarioIdentity): boolean {
  return left.id === right.id && left.version === right.version;
}

function sameToolchain(left: RunToolchainIdentity, right: RunToolchainIdentity): boolean {
  return (
    left.compiler === right.compiler &&
    left.compilerVersion === right.compilerVersion &&
    left.target === right.target &&
    left.runnerVersion === right.runnerVersion
  );
}

function insufficientGrowth(
  anchorInputSize: number | null,
  points: readonly ReferenceGrowthPoint[],
  evidence: string,
): ReferenceGrowthComparison {
  return Object.freeze({
    status: "insufficient" as const,
    anchorInputSize,
    points: Object.freeze([...points]),
    evidence: `${evidence} 当前结果只用于提示补充实验，不是 Big-O 证明。`,
  });
}

function unconfirmedGrowth(evidence: string): ReferenceGrowthComparison {
  return Object.freeze({
    status: "unconfirmed" as const,
    anchorInputSize: null,
    points: Object.freeze([]),
    evidence,
  });
}

function referenceSourceLabel(value: ComplexityReference["source"]): string {
  if (value === "ai-suggested") return "AI 建议";
  if (value === "user-confirmed") return "用户提供参考";
  return "内置情景参考";
}

function assertFingerprint(value: string): string {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    throw new TypeError("currentSourceFingerprint 必须是稳定标识符");
  }
  return value;
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new TypeError("增长比计算产生无效数值");
  return Math.round(value * 1_000_000) / 1_000_000;
}

function freezeAnalytics(input: {
  readonly sourceFingerprint: string;
  readonly cohort: EvidenceAnalyticsCohort | null;
  readonly runIds: readonly string[];
  readonly unscaledRunIds: readonly string[];
  readonly points: readonly EvidenceAnalyticsPoint[];
  readonly reference: ComplexityReference | null;
  readonly growth: ReferenceGrowthComparison;
  readonly evidence: string;
}): RunHistoryEvidenceAnalytics {
  return Object.freeze({
    sourceFingerprint: input.sourceFingerprint,
    cohort: input.cohort,
    runIds: Object.freeze([...input.runIds]),
    unscaledRunIds: Object.freeze([...input.unscaledRunIds]),
    points: Object.freeze([...input.points]),
    reference: input.reference,
    growth: input.growth,
    evidence: input.evidence,
  });
}
