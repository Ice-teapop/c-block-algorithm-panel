import {
  RUN_HISTORY_MAX_ENTRIES,
  RUN_HISTORY_SCHEMA_VERSION,
  RunHistoryError,
  type OperationGrowthEvidence,
  type OperationGrowthPoint,
  type RunComparisonKey,
  type RunHistoryDocument,
  type RunHistoryEntry,
  type RunHistoryEntryInput,
  type RunHistorySummary,
  type RunMetricSummary,
  type RunScenarioIdentity,
  type RunToolchainIdentity,
} from "./contracts.js";

const SEMVER_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export function createEmptyRunHistory(): RunHistoryDocument {
  return Object.freeze({
    schemaVersion: RUN_HISTORY_SCHEMA_VERSION,
    revision: 0,
    entries: Object.freeze([]),
  });
}

export function parseRunHistoryDocument(value: unknown): RunHistoryDocument {
  if (!isRecord(value) || value.schemaVersion !== RUN_HISTORY_SCHEMA_VERSION) {
    throw historyError("INVALID_DOCUMENT", "run-history schemaVersion 不受支持");
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw historyError("INVALID_DOCUMENT", "run-history revision 无效");
  }
  if (!Array.isArray(value.entries) || value.entries.length > RUN_HISTORY_MAX_ENTRIES) {
    throw historyError("INVALID_DOCUMENT", "run-history entries 缺失或超过 100 条");
  }
  const ids = new Set<string>();
  const entries = value.entries.map((entry) => {
    const normalized = normalizeRealEntry(entry);
    if (ids.has(normalized.id)) {
      throw historyError("INVALID_DOCUMENT", `run-history id ${normalized.id} 重复`);
    }
    ids.add(normalized.id);
    return normalized;
  });
  return Object.freeze({
    schemaVersion: RUN_HISTORY_SCHEMA_VERSION,
    revision: value.revision as number,
    entries: Object.freeze(entries),
  });
}

export function appendRunHistoryEntry(
  document: RunHistoryDocument,
  input: RunHistoryEntryInput,
): RunHistoryDocument {
  const current = parseRunHistoryDocument(document);
  if (isRecord(input) && input.mode === "simulation") {
    throw historyError("SIMULATION_NOT_PERSISTABLE", "教学模拟不得写入真实运行历史或性能证据");
  }
  const entry = normalizeRealEntry(input);
  if (current.entries.some((candidate) => candidate.id === entry.id)) {
    throw historyError("DUPLICATE_RUN_ID", `运行记录 ${entry.id} 已存在`);
  }
  if (current.revision === Number.MAX_SAFE_INTEGER) {
    throw historyError("REVISION_LIMIT", "run-history revision 已达到安全上限");
  }
  const entries = [...current.entries, entry].slice(-RUN_HISTORY_MAX_ENTRIES);
  return Object.freeze({
    schemaVersion: RUN_HISTORY_SCHEMA_VERSION,
    revision: current.revision + 1,
    entries: Object.freeze(entries),
  });
}

export function selectComparableRuns(
  document: RunHistoryDocument,
  key: RunComparisonKey,
): readonly RunHistoryEntry[] {
  const current = parseRunHistoryDocument(document);
  const normalizedKey = normalizeComparisonKey(key);
  return Object.freeze(
    current.entries.filter(
      (entry) =>
        entry.sourceFingerprint === normalizedKey.sourceFingerprint &&
        sameScenario(entry.scenario, normalizedKey.scenario) &&
        sameToolchain(entry.toolchain, normalizedKey.toolchain) &&
        entry.inputSize === normalizedKey.inputSize &&
        entry.caseFingerprint === normalizedKey.caseFingerprint,
    ),
  );
}

export function summarizeComparableRuns(
  document: RunHistoryDocument,
  key: RunComparisonKey,
): RunHistorySummary {
  const normalizedKey = normalizeComparisonKey(key);
  const entries = selectComparableRuns(document, normalizedKey).filter(
    (entry) => entry.measurement.ok && entry.measurement.termination === "process-exit",
  );
  const compileDurationMs = metric(
    entries.flatMap((entry) =>
      entry.measurement.compileDurationMs === null ? [] : [entry.measurement.compileDurationMs],
    ),
  );
  const durationMs = metric(entries.map((entry) => entry.measurement.durationMs));
  const peakRssBytes = metric(
    entries.flatMap((entry) =>
      entry.measurement.peakRssBytes === null ? [] : [entry.measurement.peakRssBytes],
    ),
  );
  const operationCount = metric(
    entries.flatMap((entry) =>
      entry.measurement.operationCount === null ? [] : [entry.measurement.operationCount],
    ),
  );
  const growthEntries = selectGrowthRuns(document, normalizedKey);
  return Object.freeze({
    key: normalizedKey,
    runIds: Object.freeze(entries.map((entry) => entry.id)),
    growthRunIds: Object.freeze(growthEntries.map((entry) => entry.id)),
    compileDurationMs,
    durationMs,
    peakRssBytes,
    operationCount,
    growth: operationGrowthEvidence(growthEntries),
    evidence:
      entries.length === 0
        ? "没有与源码、情景、工具链、输入规模和案例指纹完全一致的真实运行记录。"
        : `直接指标仅汇总 ${String(entries.length)} 条同源码、同情景、同工具链、同规模、同案例且成功完成的真实运行；跨规模数据只进入操作计数增长证据。`,
  });
}

function selectGrowthRuns(
  document: RunHistoryDocument,
  key: RunComparisonKey,
): readonly RunHistoryEntry[] {
  const current = parseRunHistoryDocument(document);
  return Object.freeze(
    current.entries.filter(
      (entry) =>
        entry.sourceFingerprint === key.sourceFingerprint &&
        sameScenario(entry.scenario, key.scenario) &&
        sameToolchain(entry.toolchain, key.toolchain) &&
        entry.measurement.ok &&
        entry.measurement.termination === "process-exit",
    ),
  );
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const right = ordered[middle];
  if (right === undefined) return null;
  if (ordered.length % 2 === 1) return right;
  const left = ordered[middle - 1];
  return left === undefined ? null : (left + right) / 2;
}

function operationGrowthEvidence(entries: readonly RunHistoryEntry[]): OperationGrowthEvidence {
  const bySize = new Map<number, number[]>();
  for (const entry of entries) {
    const size = entry.inputSize;
    const count = entry.measurement.operationCount;
    if (size === null || count === null) continue;
    const samples = bySize.get(size) ?? [];
    samples.push(count);
    bySize.set(size, samples);
  }
  const points = Object.freeze(
    [...bySize.entries()]
      .sort(([left], [right]) => left - right)
      .map(([inputSize, samples]) =>
        Object.freeze({
          inputSize,
          sampleCount: samples.length,
          medianOperationCount: median(samples) ?? 0,
        }),
      ),
  );
  if (points.length < 3) {
    return freezeGrowth(
      points,
      "insufficient",
      null,
      "insufficient",
      "至少需要 3 个不同输入规模的插桩操作计数；当前数据不能支持增长判断。",
    );
  }

  const nonMonotonic = points.some(
    (point, index) =>
      index > 0 && point.medianOperationCount < points[index - 1]!.medianOperationCount,
  );
  const first = points[0]!;
  const last = points.at(-1)!;
  const trend = nonMonotonic
    ? "non-monotonic"
    : last.medianOperationCount <= first.medianOperationCount * 1.1
      ? "stable"
      : "increasing";
  const slope = estimateLogLogSlope(points);
  const confidence =
    points.length >= 4 && points.every((point) => point.sampleCount >= 3) ? "medium" : "low";
  return freezeGrowth(
    points,
    trend,
    slope,
    confidence,
    `${String(points.length)} 个输入规模的操作计数中位数；斜率只是经验趋势，不是 Big-O 证明。`,
  );
}

function estimateLogLogSlope(points: readonly OperationGrowthPoint[]): number | null {
  if (points.some((point) => point.inputSize <= 0 || point.medianOperationCount <= 0)) return null;
  const samples = points.map((point) => ({
    x: Math.log(point.inputSize),
    y: Math.log(point.medianOperationCount),
  }));
  const meanX = samples.reduce((total, sample) => total + sample.x, 0) / samples.length;
  const meanY = samples.reduce((total, sample) => total + sample.y, 0) / samples.length;
  const denominator = samples.reduce((total, sample) => total + (sample.x - meanX) ** 2, 0);
  if (denominator === 0) return null;
  const numerator = samples.reduce(
    (total, sample) => total + (sample.x - meanX) * (sample.y - meanY),
    0,
  );
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function freezeGrowth(
  points: readonly OperationGrowthPoint[],
  trend: OperationGrowthEvidence["trend"],
  estimatedLogLogSlope: number | null,
  confidence: OperationGrowthEvidence["confidence"],
  evidence: string,
): OperationGrowthEvidence {
  return Object.freeze({
    basis: "instrumented-operation-count",
    points,
    trend,
    estimatedLogLogSlope,
    confidence,
    evidence,
  });
}

function metric(values: readonly number[]): RunMetricSummary {
  return Object.freeze({ sampleCount: values.length, median: median(values) });
}

function normalizeRealEntry(value: unknown): RunHistoryEntry {
  if (!isRecord(value) || value.mode !== "real") {
    throw historyError("INVALID_ENTRY", "运行历史只接受 mode=real 的记录");
  }
  if (!isRecord(value.measurement)) {
    throw historyError("INVALID_ENTRY", "运行记录缺少 measurement");
  }
  const measurement = value.measurement;
  const termination = assertText(measurement.termination, "termination");
  if (typeof measurement.ok !== "boolean") {
    throw historyError("INVALID_ENTRY", "measurement.ok 必须是 boolean");
  }
  return Object.freeze({
    id: assertId(value.id, "run id"),
    recordedAt: assertIsoDate(value.recordedAt),
    mode: "real",
    sourceFingerprint: assertId(value.sourceFingerprint, "source fingerprint"),
    scenario: normalizeScenario(value.scenario),
    caseFingerprint: assertId(value.caseFingerprint, "case fingerprint"),
    toolchain: normalizeToolchain(value.toolchain),
    inputSize: assertNullablePositiveInteger(value.inputSize, "inputSize"),
    trace: normalizeTraceSummary(value.trace),
    measurement: Object.freeze({
      compileDurationMs: assertNullableMetric(measurement.compileDurationMs, "compileDurationMs"),
      durationMs: assertMetric(measurement.durationMs, "durationMs"),
      peakRssBytes: assertNullableSafeInteger(measurement.peakRssBytes, "peakRssBytes"),
      peakProcessCount: assertNullableSafeInteger(measurement.peakProcessCount, "peakProcessCount"),
      outputBytes: assertSafeInteger(measurement.outputBytes, "outputBytes"),
      executedNodeCount: assertNullableSafeInteger(
        measurement.executedNodeCount,
        "executedNodeCount",
      ),
      operationCount: assertNullableSafeInteger(measurement.operationCount, "operationCount"),
      termination: termination as RunHistoryEntry["measurement"]["termination"],
      ok: measurement.ok,
    }),
  });
}

function normalizeTraceSummary(value: unknown): RunHistoryEntry["trace"] {
  if (value === undefined || value === null) return null;
  if (
    !isRecord(value) ||
    value.status !== "validated" ||
    !Array.isArray(value.nodeVisits) ||
    value.nodeVisits.length > 2_048 ||
    !Array.isArray(value.edgeIds) ||
    value.edgeIds.length > 4_096 ||
    (value.targetBranchId !== null && typeof value.targetBranchId !== "string")
  ) {
    throw historyError("INVALID_ENTRY", "trace summary 结构或上限无效");
  }
  const nodeIds = new Set<string>();
  const nodeVisits = value.nodeVisits.map((visit) => {
    if (!isRecord(visit)) throw historyError("INVALID_ENTRY", "trace node visit 必须是对象");
    const nodeId = assertId(visit.nodeId, "trace node id");
    if (nodeIds.has(nodeId) || !Number.isSafeInteger(visit.count) || (visit.count as number) <= 0) {
      throw historyError("INVALID_ENTRY", "trace node visit 必须唯一且 count 为正整数");
    }
    nodeIds.add(nodeId);
    return Object.freeze({ nodeId, count: visit.count as number });
  });
  const edgeIds = (value.edgeIds as unknown[]).map((id) => assertId(id, "trace edge id"));
  if (new Set(edgeIds).size !== edgeIds.length) {
    throw historyError("INVALID_ENTRY", "trace edge id 不得重复");
  }
  return Object.freeze({
    status: "validated" as const,
    nodeVisits: Object.freeze(nodeVisits),
    edgeIds: Object.freeze(edgeIds),
    targetBranchId:
      value.targetBranchId === null
        ? null
        : assertId(value.targetBranchId, "trace target branch id"),
  });
}

function normalizeComparisonKey(value: unknown): RunComparisonKey {
  if (!isRecord(value)) {
    throw historyError("INVALID_COMPARISON_KEY", "comparison key 必须是对象");
  }
  try {
    return Object.freeze({
      sourceFingerprint: assertId(value.sourceFingerprint, "source fingerprint"),
      scenario: normalizeScenario(value.scenario),
      toolchain: normalizeToolchain(value.toolchain),
      inputSize: assertNullablePositiveInteger(value.inputSize, "inputSize"),
      caseFingerprint: assertId(value.caseFingerprint, "case fingerprint"),
    });
  } catch (error) {
    if (error instanceof RunHistoryError) {
      throw historyError("INVALID_COMPARISON_KEY", error.message);
    }
    throw error;
  }
}

function normalizeScenario(value: unknown): RunScenarioIdentity {
  if (!isRecord(value)) throw historyError("INVALID_ENTRY", "scenario 必须是对象");
  const version = assertText(value.version, "scenario version");
  if (!SEMVER_PATTERN.test(version)) {
    throw historyError("INVALID_ENTRY", "scenario version 必须是语义化版本");
  }
  return Object.freeze({ id: assertId(value.id, "scenario id"), version });
}

function normalizeToolchain(value: unknown): RunToolchainIdentity {
  if (!isRecord(value)) throw historyError("INVALID_ENTRY", "toolchain 必须是对象");
  return Object.freeze({
    compiler: assertText(value.compiler, "toolchain compiler"),
    compilerVersion: assertText(value.compilerVersion, "toolchain compilerVersion"),
    target: assertText(value.target, "toolchain target"),
    runnerVersion: assertText(value.runnerVersion, "toolchain runnerVersion"),
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

function assertId(value: unknown, field: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw historyError("INVALID_ENTRY", `${field} 必须是稳定标识符`);
  }
  return value;
}

function assertText(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    throw historyError("INVALID_ENTRY", `${field} 必须是无首尾空白、无 NUL 的非空文本`);
  }
  return value;
}

function assertIsoDate(value: unknown): string {
  if (typeof value !== "string") throw historyError("INVALID_ENTRY", "recordedAt 必须是字符串");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw historyError("INVALID_ENTRY", "recordedAt 必须是规范 ISO 时间");
  }
  return value;
}

function assertMetric(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw historyError("INVALID_ENTRY", `${field} 必须是非负有限数`);
  }
  return value;
}

function assertNullableMetric(value: unknown, field: string): number | null {
  return value === null ? null : assertMetric(value, field);
}

function assertSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw historyError("INVALID_ENTRY", `${field} 必须是非负安全整数`);
  }
  return value as number;
}

function assertNullableSafeInteger(value: unknown, field: string): number | null {
  return value === null ? null : assertSafeInteger(value, field);
}

function assertNullablePositiveInteger(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw historyError("INVALID_ENTRY", `${field} 必须是正安全整数或 null`);
  }
  return value as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function historyError(
  code: ConstructorParameters<typeof RunHistoryError>[0],
  message: string,
): RunHistoryError {
  return new RunHistoryError(code, message);
}
