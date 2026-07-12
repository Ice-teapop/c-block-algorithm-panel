import type { ProgramAnalysisSnapshot } from "../analysis/index.js";
import {
  LocalEvidenceMentor,
  type MentorHint,
  type MentorHintTarget,
  type RealExecutionPathSummary,
} from "../mentor/index.js";
import {
  RunHistoryError,
  analyzeRunHistoryEvidence,
  appendRunHistoryEntry,
  createEmptyRunHistory,
  parseRunHistoryDocument,
  summarizeComparableRuns,
  type RunComparisonKey,
  type RunHistoryDocument,
  type RunHistoryEntryInput,
  type RunHistoryEvidenceAnalytics,
  type RunHistorySummary,
  type RunScenarioIdentity,
  type RunToolchainIdentity,
} from "../runtime/index.js";
import type { Capabilities, PanelApi, RunResult } from "../shared/api.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type {
  SaveWorkspaceSidecarRequest,
  WorkspaceSidecarKind,
  WorkspaceSidecarReadResult,
  WorkspaceSidecarSaveResult,
} from "../shared/workspace-sidecar.js";
import {
  createAnalysisDashboard,
  type AnalysisDashboard,
  type AnalysisDashboardState,
  type AnalysisEvidenceCriterion,
  type AnalysisTrendPoint,
} from "../ui/analysis-dashboard.js";
import {
  createMentorPanel,
  type MentorPanel,
  type MentorRemoteContext,
} from "../ui/mentor-panel.js";
import type { ManualRunScenario, RunPanelCompletion } from "../ui/run-panel.js";
import { createWorkspaceSidecarPersistence } from "./workspace-sidecar-persistence.js";

const MANUAL_SCENARIO: RunScenarioIdentity = Object.freeze({
  id: "manual.ad-hoc",
  version: "1.0.0",
});

let fallbackRunId = 0;

export interface EvidenceWorkspaceControllerOptions {
  readonly metricsHost: HTMLElement;
  readonly mentorHost: HTMLElement;
  readonly analysisHost?: HTMLElement | undefined;
  readonly api?: Pick<
    PanelApi,
    "getAiProviderConfig" | "startAiMentor" | "readAiMentor" | "cancelAiMentor"
  > | undefined;
  readonly getSource?: (() => string) | undefined;
  readonly readSidecar: (
    entryId: string,
    kind: WorkspaceSidecarKind,
  ) => Promise<WorkspaceSidecarReadResult>;
  readonly saveSidecar: (
    request: SaveWorkspaceSidecarRequest,
  ) => Promise<WorkspaceSidecarSaveResult>;
  readonly delayMs?: number;
  readonly onLocate?: ((target: MentorHintTarget, hint: MentorHint) => void) | undefined;
  readonly now?: (() => Date) | undefined;
  readonly idFactory?: (() => string) | undefined;
}

export interface EvidenceWorkspaceController {
  setWorkspaceEntry(entryId: string | null, sourceFingerprint: string | null): Promise<void>;
  setAnalysis(analysis: ProgramAnalysisSnapshot | null): void;
  setRealPath(path: RealExecutionPathSummary | null): void;
  setBranchCoverage(coverage: BranchCoverageEvidence | null): void;
  recordRun(completion: RunPanelCompletion): void;
  flush(): Promise<void>;
  destroy(): Promise<void>;
}

interface AttemptEvidence {
  readonly compileDurationMs: number | null;
  readonly compileOk: boolean;
  readonly runResult: RunResult | null;
  readonly scenario: RunScenarioIdentity | null;
}

export interface BranchCoverageEvidence {
  readonly sourceFingerprint: string;
  readonly coveredBranchIds: readonly string[];
  readonly totalBranchIds: readonly string[];
}

interface MetricsView {
  setPersistence(message: string, state: string): void;
  render(
    message: string,
    state: "ready" | "working" | "failure" | "simulation",
    attempt: AttemptEvidence | null,
    summary: RunHistorySummary | null,
  ): void;
  destroy(): void;
}

export function createEvidenceWorkspaceController(
  options: EvidenceWorkspaceControllerOptions,
): EvidenceWorkspaceController {
  assertOptions(options);
  const metrics = createMetricsView(options.metricsHost);
  const analysisDashboard: AnalysisDashboard | null =
    options.analysisHost === undefined
      ? null
      : createAnalysisDashboard(options.analysisHost, {
          ...(options.api === undefined ? {} : { remoteApi: options.api }),
          ...(options.onLocate === undefined
            ? {}
            : { onLocate: (target) => options.onLocate!(target, analysisLocateHint(target)) }),
        });
  const mentor = createMentorPanel(options.mentorHost, {
    ...(options.onLocate === undefined ? {} : { onLocate: options.onLocate }),
    ...(options.api === undefined ? {} : { remoteApi: options.api }),
  });
  const provider = new LocalEvidenceMentor();
  let destroyed = false;
  let destroyPromise: Promise<void> | null = null;
  let generation = 0;
  let currentEntryId: string | null = null;
  let currentSourceFingerprint: string | null = null;
  let analysis: ProgramAnalysisSnapshot | null = null;
  let realPath: RealExecutionPathSummary | null = null;
  let branchCoverage: BranchCoverageEvidence | null = null;
  let history: RunHistoryDocument = createEmptyRunHistory();
  let comparisonKey: RunComparisonKey | null = null;
  let lastAttempt: AttemptEvidence | null = null;
  let currentMessage = "尚未关联项目，真实运行不会写入 sidecar。";
  let currentState: Parameters<MetricsView["render"]>[1] = "ready";

  const persistence = createWorkspaceSidecarPersistence({
    kind: "run-history",
    read: options.readSidecar,
    save: options.saveSidecar,
    ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
    onStatus: (status) => {
      if (!destroyed) metrics.setPersistence(status.message, status.state);
    },
  });

  const render = (): void => {
    let summary: RunHistorySummary | null = null;
    if (comparisonKey !== null) {
      try {
        summary = summarizeComparableRuns(history, comparisonKey);
      } catch {
        summary = null;
      }
    }
    metrics.render(currentMessage, currentState, lastAttempt, summary);
    const source = options.getSource?.() ?? "";
    const remoteContext =
      analysis === null ? null : buildRemoteMentorContext(analysis, history, realPath, source);
    analysisDashboard?.setRemoteContext(remoteContext);
    analysisDashboard?.setState(
      buildAnalysisDashboardState({
        source,
        currentMessage,
        sourceFingerprint: currentSourceFingerprint,
        analysis,
        realPath,
        branchCoverage,
        history,
        comparisonKey,
        lastAttempt,
      }),
    );
    renderMentor(
      mentor,
      provider,
      analysis,
      realPath,
      history,
      comparisonKey,
      currentSourceFingerprint,
      source,
    );
  };

  render();

  const controller: EvidenceWorkspaceController = Object.freeze({
    async setWorkspaceEntry(
      entryId: string | null,
      sourceFingerprint: string | null,
    ): Promise<void> {
      assertAlive(destroyed);
      assertWorkspaceIdentity(entryId, sourceFingerprint);
      const requestGeneration = generation + 1;
      generation = requestGeneration;
      comparisonKey = null;
      lastAttempt = null;
      analysis = null;
      realPath = null;
      branchCoverage = null;
      if (entryId !== currentEntryId) currentEntryId = null;
      currentMessage = entryId === null ? "正在解除项目关联…" : "正在载入运行历史…";
      currentState = "working";
      render();

      if (entryId === null || sourceFingerprint === null) {
        try {
          await persistence.deactivate();
        } catch (error) {
          if (!destroyed && requestGeneration === generation) {
            currentMessage = `运行历史保存失败：${errorMessage(error)}`;
            currentState = "failure";
            render();
          }
          throw error;
        }
        if (destroyed || requestGeneration !== generation) return;
        currentEntryId = null;
        currentSourceFingerprint = null;
        history = createEmptyRunHistory();
        currentMessage = "尚未关联项目，真实运行不会写入 sidecar。";
        currentState = "ready";
        render();
        return;
      }

      try {
        const adoption = await persistence.adopt(entryId, sourceFingerprint);
        if (destroyed || requestGeneration !== generation) return;
        currentEntryId = entryId;
        currentSourceFingerprint = sourceFingerprint;
        history = createEmptyRunHistory();
        let recovered = false;
        if (adoption.document !== null) {
          try {
            history = parseRunHistoryDocument(JSON.parse(adoption.document.serialized));
          } catch {
            recovered = true;
          }
        }
        if (recovered) {
          currentMessage = "运行历史 sidecar 无效，已仅重置历史视图；main.c 未改动。";
          currentState = "failure";
        } else {
          const staleNote = adoption.matchesSource
            ? ""
            : "；sidecar 含旧源码记录，比较时仍按源码指纹隔离";
          currentMessage = `已载入 ${String(history.entries.length)} 条真实运行记录${staleNote}。`;
          currentState = "ready";
        }
        render();
      } catch (error) {
        if (!destroyed && requestGeneration === generation) {
          currentEntryId = null;
          currentSourceFingerprint = null;
          history = createEmptyRunHistory();
          currentMessage = `无法载入运行历史：${errorMessage(error)}`;
          currentState = "failure";
          render();
        }
        throw error;
      }
    },

    setAnalysis(snapshot: ProgramAnalysisSnapshot | null): void {
      assertAlive(destroyed);
      analysis = snapshot;
      if (snapshot === null || realPath?.sourceFingerprint !== snapshot.sourceFingerprint) {
        realPath = null;
      }
      if (snapshot === null || branchCoverage?.sourceFingerprint !== snapshot.sourceFingerprint) {
        branchCoverage = null;
      }
      render();
    },

    setRealPath(path: RealExecutionPathSummary | null): void {
      assertAlive(destroyed);
      if (
        path !== null &&
        (path.mode !== "real" ||
          (currentSourceFingerprint !== null &&
            path.sourceFingerprint !== currentSourceFingerprint) ||
          (analysis !== null && analysis.sourceFingerprint !== path.sourceFingerprint))
      ) {
        throw new Error("真实路径与当前源码证据不一致");
      }
      realPath = path;
      render();
    },

    setBranchCoverage(next: BranchCoverageEvidence | null): void {
      assertAlive(destroyed);
      branchCoverage = normalizeBranchCoverage(next, currentSourceFingerprint);
      render();
    },

    recordRun(completion: RunPanelCompletion): void {
      assertAlive(destroyed);
      const actualFingerprint = fingerprintSource(completion.source);
      const compileDurationMs = nullableFiniteMetric(completion.compileResult.compileDurationMs);
      const scenario = completion.scenario ?? MANUAL_SCENARIO;
      lastAttempt = Object.freeze({
        compileDurationMs,
        compileOk: completion.compileResult.ok,
        runResult: completion.runResult,
        scenario: Object.freeze({ id: scenario.id, version: scenario.version }),
      });
      comparisonKey = null;

      if (completion.sourceFingerprint !== actualFingerprint) {
        currentMessage = "运行证据的源码指纹不一致；已拒绝写入历史。";
        currentState = "failure";
        render();
        return;
      }
      currentSourceFingerprint = actualFingerprint;

      if (!completion.compileResult.ok) {
        currentMessage = "编译未通过；已显示编译证据，但未写入可比较性能历史。";
        currentState = "failure";
        render();
        return;
      }
      if (completion.runResult === null) {
        currentMessage = "编译已完成，但运行器未返回结果；未写入性能历史。";
        currentState = "failure";
        render();
        return;
      }

      const toolchain = parseRunToolchainIdentity(completion.capabilities);
      let entry: RunHistoryEntryInput;
      try {
        entry = toRunHistoryEntry(
          completion,
          actualFingerprint,
          scenario,
          toolchain,
          options.idFactory ?? defaultRunId,
          options.now ?? (() => new Date()),
          realPath,
        );
      } catch (error) {
        currentMessage = `运行证据无效，未写入历史：${errorMessage(error)}`;
        currentState = "failure";
        render();
        return;
      }

      if (completion.scenario?.mode === "simulation") {
        try {
          appendRunHistoryEntry(history, entry);
          currentMessage = "教学模拟错误地通过了真实历史门禁；已拒绝继续。";
          currentState = "failure";
        } catch (error) {
          if (!(error instanceof RunHistoryError) || error.code !== "SIMULATION_NOT_PERSISTABLE") {
            currentMessage = `教学模拟证据无效：${errorMessage(error)}`;
            currentState = "failure";
          } else {
            currentMessage = "教学模拟结果仅用于回放；未写入真实性能历史。";
            currentState = "simulation";
          }
        }
        render();
        return;
      }

      try {
        history = appendRunHistoryEntry(history, entry);
        comparisonKey = Object.freeze({
          sourceFingerprint: actualFingerprint,
          scenario: Object.freeze({ id: scenario.id, version: scenario.version }),
          toolchain,
          inputSize: completion.scenario?.inputSize ?? null,
          caseFingerprint: runCaseFingerprint(completion.scenario),
        });
        if (
          currentEntryId !== null &&
          persistence.activeEntryId !== null &&
          persistence.activeEntryId === currentEntryId
        ) {
          persistence.update(JSON.stringify(history), actualFingerprint);
        }
        currentMessage = completion.runResult.ok
          ? currentEntryId === null
            ? "真实运行已记录在当前会话；未关联项目，因此尚未持久化。"
            : "真实运行已记录；性能比较严格限定为同源码、同情景、同工具链。"
          : "真实运行失败已留档用于诊断，但不会进入成功性能中位数。";
        currentState = completion.runResult.ok ? "ready" : "failure";
      } catch (error) {
        currentMessage = `运行证据无效，未写入历史：${errorMessage(error)}`;
        currentState = "failure";
      }
      render();
    },

    async flush(): Promise<void> {
      if (destroyPromise !== null) return destroyPromise;
      assertAlive(destroyed);
      await persistence.flush();
    },

    async destroy(): Promise<void> {
      if (destroyPromise !== null) return destroyPromise;
      destroyed = true;
      generation += 1;
      destroyPromise = (async () => {
        try {
          await persistence.flush();
        } finally {
          persistence.destroy();
          mentor.destroy();
          analysisDashboard?.destroy();
          metrics.destroy();
        }
      })();
      return destroyPromise;
    },
  });

  return controller;
}

export function parseRunToolchainIdentity(
  capabilities: Pick<Capabilities, "toolchainId">,
): RunToolchainIdentity {
  const value = typeof capabilities.toolchainId === "string" ? capabilities.toolchainId : "";
  const compilerMatch =
    /\bApple clang version ([0-9]+(?:\.[0-9]+){1,3}(?:[-+][0-9A-Za-z.-]+)?)/u.exec(value);
  const targetMatch = /\bTarget:\s*([A-Za-z0-9][A-Za-z0-9._-]*)/u.exec(value);
  const runnerMatch =
    /\brunner(?:\s+version)?\s*(?:=|:)\s*v?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)/iu.exec(
      value,
    );
  return Object.freeze({
    compiler: compilerMatch === null ? "unknown" : "Apple clang",
    compilerVersion: compilerMatch?.[1] ?? "unknown",
    target: targetMatch?.[1] ?? "unknown",
    runnerVersion: runnerMatch?.[1] ?? "unknown",
  });
}

function toRunHistoryEntry(
  completion: RunPanelCompletion,
  sourceFingerprint: string,
  scenario: RunScenarioIdentity & {
    readonly mode?: "real" | "simulation";
    readonly inputSize?: number | null;
  },
  toolchain: RunToolchainIdentity,
  idFactory: () => string,
  now: () => Date,
  realPath: RealExecutionPathSummary | null,
): RunHistoryEntryInput {
  const runResult = completion.runResult;
  if (runResult === null) throw new TypeError("运行历史缺少 RunResult");
  if (!Number.isFinite(runResult.durationMs) || runResult.durationMs < 0) {
    throw new TypeError("运行墙钟耗时无效");
  }
  const recordedAt = now().toISOString();
  return Object.freeze({
    id: idFactory(),
    recordedAt,
    mode: scenario.mode ?? "real",
    sourceFingerprint,
    scenario: Object.freeze({ id: scenario.id, version: scenario.version }),
    caseFingerprint: runCaseFingerprint(completion.scenario),
    toolchain,
    inputSize: scenario.inputSize ?? null,
    trace: toRunTraceSummary(realPath, sourceFingerprint, scenario),
    measurement: Object.freeze({
      compileDurationMs: nullableFiniteMetric(completion.compileResult.compileDurationMs),
      durationMs: runResult.durationMs,
      peakRssBytes: positiveSafeIntegerOrNull(runResult.peakRssBytes),
      peakProcessCount: positiveSafeIntegerOrNull(runResult.peakProcessCount),
      outputBytes: outputByteCount(runResult),
      executedNodeCount: nonNegativeSafeIntegerOrNull(runResult.executedNodeCount),
      operationCount: nonNegativeSafeIntegerOrNull(runResult.operationCount),
      termination: runResult.termination,
      ok: runResult.ok,
    }),
  });
}

function toRunTraceSummary(
  path: RealExecutionPathSummary | null,
  sourceFingerprint: string,
  scenario: RunScenarioIdentity,
): RunHistoryEntryInput["trace"] {
  if (
    path === null ||
    path.sourceFingerprint !== sourceFingerprint ||
    path.scenario.id !== scenario.id ||
    path.scenario.version !== scenario.version
  ) {
    return null;
  }
  return Object.freeze({
    status: "validated" as const,
    nodeVisits: Object.freeze(
      path.nodeVisits
        .slice(0, 2_048)
        .map((visit) => Object.freeze({ nodeId: visit.nodeId, count: visit.count })),
    ),
    edgeIds: Object.freeze([...(path.edgeIds ?? [])].slice(0, 4_096)),
    targetBranchId: path.targetBranchId ?? null,
  });
}

function runCaseFingerprint(scenario: ManualRunScenario | null): string {
  return fingerprintSource(
    JSON.stringify(
      scenario === null
        ? { id: MANUAL_SCENARIO.id, version: MANUAL_SCENARIO.version, stdin: "", arguments: [] }
        : {
            id: scenario.id,
            version: scenario.version,
            stdin: scenario.stdin,
            arguments: scenario.arguments,
            inputSize: scenario.inputSize,
          },
    ),
  );
}

function renderMentor(
  panel: MentorPanel,
  provider: LocalEvidenceMentor,
  analysis: ProgramAnalysisSnapshot | null,
  realPath: RealExecutionPathSummary | null,
  history: RunHistoryDocument,
  comparisonKey: RunComparisonKey | null,
  sourceFingerprint: string | null,
  source: string,
): void {
  if (analysis === null) {
    panel.setHints(Object.freeze([]));
    panel.setStatus("等待当前源码的静态分析证据");
    panel.setRemoteContext(null);
    return;
  }
  if (sourceFingerprint !== null && analysis.sourceFingerprint !== sourceFingerprint) {
    panel.setHints(Object.freeze([]));
    panel.setStatus("静态分析与当前源码指纹不一致，提示已隐藏。", "error");
    panel.setRemoteContext(null);
    return;
  }
  panel.setRemoteContext(buildRemoteMentorContext(analysis, history, realPath, source));
  try {
    panel.setHints(
      provider.getHints({
        analysis,
        realPath,
        runHistory: history,
        comparisonKey,
      }),
    );
  } catch {
    panel.setHints(Object.freeze([]));
    panel.setStatus("本地证据不足或无效，未生成提示。", "error");
  }
}

function buildRemoteMentorContext(
  analysis: ProgramAnalysisSnapshot,
  history: RunHistoryDocument,
  realPath: RealExecutionPathSummary | null,
  source: string,
): MentorRemoteContext | null {
  if (fingerprintSource(source) !== analysis.sourceFingerprint) return null;
  const currentFunction =
    analysis.functions.find((candidate) => candidate.name === "main") ??
    analysis.functions[0] ??
    null;
  const functionSource =
    currentFunction === null ||
    currentFunction.range.from < 0 ||
    currentFunction.range.to > source.length ||
    currentFunction.range.from > currentFunction.range.to
      ? ""
      : source.slice(currentFunction.range.from, currentFunction.range.to);
  const findings = analysis.findings.slice(0, 64).map(
    (finding) =>
      `${finding.ruleId} · ${finding.reason} · ${finding.confidence} · offset ${String(finding.primaryRange.from)}`,
  );
  const flow = currentFunction;
  const controlFlowSummary =
    flow === null
      ? `函数 0；静态分析尚未形成完整 CFG。`
      : `${flow.name}: ${String(flow.nodes.length)} 个 CFG 节点，${String(flow.edges.length)} 条边，${flow.partial ? "partial" : "complete"}；全文件 ${String(analysis.functions.length)} 个函数。`;
  const runEvidence = history.entries
    .filter((entry) => entry.sourceFingerprint === analysis.sourceFingerprint)
    .slice(-8)
    .map((entry) => {
    const measurement = entry.measurement;
    return [
      `scenario=${entry.scenario.id}@${entry.scenario.version}`,
      `inputSize=${entry.inputSize === null ? "n/a" : String(entry.inputSize)}`,
      `duration=${String(measurement.durationMs)}ms`,
      `rss=${measurement.peakRssBytes === null ? "n/a" : String(measurement.peakRssBytes)}`,
      `ops=${measurement.operationCount === null ? "n/a" : String(measurement.operationCount)}`,
      `termination=${measurement.termination}`,
      `ok=${String(measurement.ok)}`,
    ].join("; ");
    });
  if (realPath !== null && realPath.sourceFingerprint === analysis.sourceFingerprint) {
    const visits = realPath.nodeVisits.reduce((sum, visit) => sum + visit.count, 0);
    runEvidence.push(`validated real trace: ${String(visits)} node visits`);
  }
  return Object.freeze({
    sourceFingerprint: analysis.sourceFingerprint,
    sourceRevision: analysis.revision,
    currentFunction: functionSource,
    diagnosticSummary: Object.freeze(findings),
    controlFlowSummary,
    runEvidence: Object.freeze(runEvidence),
    fullSource: source,
  });
}

function buildAnalysisDashboardState(input: {
  readonly source: string;
  readonly currentMessage: string;
  readonly sourceFingerprint: string | null;
  readonly analysis: ProgramAnalysisSnapshot | null;
  readonly realPath: RealExecutionPathSummary | null;
  readonly branchCoverage: BranchCoverageEvidence | null;
  readonly history: RunHistoryDocument;
  readonly comparisonKey: RunComparisonKey | null;
  readonly lastAttempt: AttemptEvidence | null;
}): AnalysisDashboardState {
  const analytics = analysisEvidenceOrNull(
    input.history,
    input.sourceFingerprint,
    input.comparisonKey,
  );
  const trendPoints = trendPointsForAnalytics(analytics);
  const coverage =
    input.branchCoverage !== null &&
    input.branchCoverage.sourceFingerprint === input.sourceFingerprint
      ? input.branchCoverage
      : null;
  const criteria = completionCriteria(input, analytics, coverage);
  const hotspots = realPathHotspots(input.realPath, input.source, input.sourceFingerprint);
  const scenarioId = analytics?.cohort?.scenario.id ?? input.lastAttempt?.scenario?.id ?? null;
  return Object.freeze({
    sourceFingerprint: input.sourceFingerprint,
    statusMessage: input.currentMessage,
    scenarioLabel: scenarioLabel(scenarioId),
    referenceLabel:
      analytics?.reference === null || analytics?.reference === undefined
        ? null
        : `${analytics.reference.label} · ${growthStatusLabel(analytics.growth.status)}`,
    trendEvidence:
      analytics === null
        ? "当前源码没有可用的跨规模真实运行。"
        : `${analytics.evidence} ${analytics.growth.evidence}`,
    trendPoints,
    criteria,
    branchCovered: coverage?.coveredBranchIds.length ?? 0,
    branchTotal: coverage?.totalBranchIds.length ?? branchOutcomeCount(input.analysis),
    hotspots,
  });
}

function analysisEvidenceOrNull(
  history: RunHistoryDocument,
  sourceFingerprint: string | null,
  comparisonKey: RunComparisonKey | null,
): RunHistoryEvidenceAnalytics | null {
  if (sourceFingerprint === null) return null;
  try {
    return analyzeRunHistoryEvidence(history, sourceFingerprint, comparisonKey);
  } catch {
    return null;
  }
}

function trendPointsForAnalytics(
  analytics: RunHistoryEvidenceAnalytics | null,
): readonly AnalysisTrendPoint[] {
  if (analytics === null) return Object.freeze([]);
  const growth = new Map(analytics.growth.points.map((point) => [point.inputSize, point]));
  const anchor =
    analytics.growth.anchorInputSize === null
      ? null
      : (analytics.points.find(
          (point) => point.inputSize === analytics.growth.anchorInputSize,
        ) ?? null);
  const anchorOperations = anchor?.operationCount.median ?? null;
  return Object.freeze(
    analytics.points.map((point) => {
      const growthPoint = growth.get(point.inputSize);
      return Object.freeze({
        inputSize: point.inputSize,
        sampleCount: point.sampleCount,
        medianDurationMs: point.durationMs.median,
        minDurationMs: point.durationMs.min,
        maxDurationMs: point.durationMs.max,
        medianOperationCount: point.operationCount.median,
        minOperationCount: point.operationCount.min,
        maxOperationCount: point.operationCount.max,
        medianPeakRssBytes: point.peakRssBytes.median,
        referenceOperationCount:
          anchorOperations === null || growthPoint === undefined
            ? null
            : anchorOperations * growthPoint.referenceGrowth,
      });
    }),
  );
}

function completionCriteria(
  input: {
    readonly analysis: ProgramAnalysisSnapshot | null;
    readonly lastAttempt: AttemptEvidence | null;
  },
  analytics: RunHistoryEvidenceAnalytics | null,
  coverage: BranchCoverageEvidence | null,
): readonly AnalysisEvidenceCriterion[] {
  const snapshot = input.analysis;
  const attempt = input.lastAttempt;
  const functionsComplete =
    snapshot !== null && snapshot.functions.length > 0 && snapshot.functions.every((fn) => !fn.partial);
  const certainFindings =
    snapshot?.findings.filter((finding) => finding.confidence === "certain").length ?? 0;
  const benchmarkReady =
    analytics !== null &&
    analytics.points.length >= 3 &&
    analytics.points.every((point) => point.sampleCount >= 3);
  const branchTotal = coverage?.totalBranchIds.length ?? branchOutcomeCount(snapshot);
  const branchCovered = coverage?.coveredBranchIds.length ?? 0;
  return Object.freeze([
    criterion(
      "analysis",
      "结构分析",
      functionsComplete ? "passed" : "pending",
      snapshot === null
        ? "等待当前源码分析"
        : functionsComplete
          ? `${String(snapshot.functions.length)} 个函数 CFG 完整`
          : "存在 partial CFG，危险改线仍保持锁定",
    ),
    criterion(
      "compile-run",
      "编译与运行",
      attempt === null ? "pending" : attempt.compileOk && attempt.runResult?.ok === true ? "passed" : "failed",
      attempt === null
        ? "尚无本次运行"
        : attempt.compileOk
          ? attempt.runResult?.ok === true
            ? "进程正常完成"
            : `运行终止：${attempt.runResult?.termination ?? "未启动"}`
          : "编译未通过",
    ),
    criterion(
      "expected-output",
      "给定案例输出",
      attempt?.scenario !== null &&
        attempt?.scenario !== undefined &&
        attempt.scenario.id !== MANUAL_SCENARIO.id &&
        attempt.runResult?.ok === true
        ? "passed"
        : "pending",
      attempt?.scenario?.id === MANUAL_SCENARIO.id
        ? "手动运行没有绑定预期输出"
        : attempt?.runResult?.ok === true
          ? "情景输出已在写入历史前逐字节验证"
          : "等待真实案例运行",
    ),
    criterion(
      "boundary-cases",
      "多规模与边界案例",
      benchmarkReady ? "passed" : "pending",
      analytics === null
        ? "等待 Benchmark"
        : `${String(analytics.points.length)} 个规模；需要至少 3 个规模且每组 3 次`,
    ),
    criterion(
      "branches",
      "可达分支",
      branchTotal === 0 ? "passed" : branchCovered === branchTotal ? "passed" : "pending",
      branchTotal === 0
        ? "当前 CFG 没有结构分支"
        : `真实覆盖 ${String(branchCovered)} / ${String(branchTotal)} 条分支出口`,
    ),
    criterion(
      "diagnostics",
      "阻断诊断",
      snapshot === null ? "pending" : certainFindings === 0 ? "passed" : "failed",
      snapshot === null
        ? "等待静态诊断"
        : certainFindings === 0
          ? "没有确定性 finding"
          : `${String(certainFindings)} 项确定性 finding 待处理`,
    ),
    criterion(
      "growth",
      "复杂度增长证据",
      analytics?.growth.status === "ready" ? "passed" : "pending",
      analytics === null ? "等待跨规模操作计数" : analytics.growth.evidence,
    ),
  ]);
}

function criterion(
  id: string,
  label: string,
  state: AnalysisEvidenceCriterion["state"],
  detail: string,
): AnalysisEvidenceCriterion {
  return Object.freeze({ id, label, state, detail });
}

function realPathHotspots(
  path: RealExecutionPathSummary | null,
  source: string,
  sourceFingerprint: string | null,
) {
  if (path === null || path.sourceFingerprint !== sourceFingerprint) return Object.freeze([]);
  const total = path.nodeVisits.reduce((sum, visit) => sum + visit.count, 0);
  return Object.freeze(
    [...path.nodeVisits]
      .sort((left, right) => right.count - left.count)
      .slice(0, 6)
      .map((visit) => {
        const snippet = source
          .slice(visit.range.from, visit.range.to)
          .replace(/\s+/gu, " ")
          .trim();
        return Object.freeze({
          nodeId: visit.nodeId,
          label: snippet.length === 0 ? visit.nodeId : snippet.slice(0, 72),
          count: visit.count,
          share: total === 0 ? 0 : visit.count / total,
          target: Object.freeze({ range: visit.range, nodeId: visit.nodeId }),
        });
      }),
  );
}

function normalizeBranchCoverage(
  coverage: BranchCoverageEvidence | null,
  sourceFingerprint: string | null,
): BranchCoverageEvidence | null {
  if (coverage === null) return null;
  if (sourceFingerprint !== null && coverage.sourceFingerprint !== sourceFingerprint) {
    throw new Error("分支覆盖证据与当前源码不一致");
  }
  const covered = [...new Set(coverage.coveredBranchIds)];
  const total = [...new Set(coverage.totalBranchIds)];
  if (covered.some((id) => !total.includes(id))) {
    throw new Error("分支覆盖包含当前 CFG 不存在的边");
  }
  return Object.freeze({
    sourceFingerprint: coverage.sourceFingerprint,
    coveredBranchIds: Object.freeze(covered),
    totalBranchIds: Object.freeze(total),
  });
}

function branchOutcomeCount(snapshot: ProgramAnalysisSnapshot | null): number {
  if (snapshot === null) return 0;
  const kinds = new Set(["branch-true", "branch-false", "switch-case", "switch-default", "switch-miss"]);
  return snapshot.functions.reduce(
    (total, fn) => total + fn.edges.filter((edge) => kinds.has(edge.kind)).length,
    0,
  );
}

function scenarioLabel(id: string | null): string {
  const labels: Readonly<Record<string, string>> = Object.freeze({
    "scenario.sorting.integers": "整数排序",
    "scenario.searching.linear": "线性搜索",
    "scenario.recursion.factorial": "递归阶乘",
    "scenario.linked-list.reverse": "链表逆序遍历",
    "scenario.tree.inorder": "二叉树中序遍历",
    "scenario.graph.bfs-chain": "链式图 BFS",
    "scenario.dynamic-programming.fibonacci": "动态规划 Fibonacci",
    [MANUAL_SCENARIO.id]: "手动运行",
  });
  return id === null ? "尚未选择情景" : (labels[id] ?? id);
}

function growthStatusLabel(status: RunHistoryEvidenceAnalytics["growth"]["status"]): string {
  if (status === "ready") return "已有 3+ 规模证据";
  if (status === "insufficient") return "数据不足";
  return "参考未确认";
}

function analysisLocateHint(target: MentorHintTarget): MentorHint {
  return Object.freeze({
    id: `analysis.hotspot.${target.nodeId}`,
    level: "verification" as const,
    confidence: "certain" as const,
    title: "运行热点",
    summary: "从分析页定位真实 Trace 热点。",
    nextStep: "检查该节点的循环、数据结构和重复工作。",
    target,
    evidence: Object.freeze([]),
    sourceMutation: "none" as const,
  });
}

function createMetricsView(host: HTMLElement): MetricsView {
  const document = host.ownerDocument;
  const root = document.createElement("section");
  root.className = "evidence-metrics";
  root.dataset.state = "ready";
  const heading = document.createElement("h2");
  heading.className = "evidence-metrics__title";
  heading.textContent = "运行证据";
  const boundary = document.createElement("p");
  boundary.className = "evidence-metrics__boundary";
  boundary.textContent = "分项展示 · 无综合分 · 实测不等于 Big-O";
  const status = document.createElement("output");
  status.className = "evidence-metrics__status";
  status.setAttribute("aria-live", "polite");
  const persistence = document.createElement("small");
  persistence.className = "evidence-metrics__persistence";
  const currentHeading = document.createElement("h3");
  currentHeading.textContent = "本次运行";
  const current = document.createElement("dl");
  current.className = "evidence-metrics__list";
  const currentFields = createMetricFields(document, current, [
    ["compile", "编译耗时"],
    ["duration", "运行墙钟耗时"],
    ["rss", "峰值 RSS"],
    ["processes", "峰值进程数"],
    ["output", "输出字节"],
    ["nodes", "执行节点数"],
    ["operations", "操作计数"],
    ["termination", "终止原因"],
  ]);
  const comparisonHeading = document.createElement("h3");
  comparisonHeading.textContent = "严格可比历史";
  const comparison = document.createElement("dl");
  comparison.className = "evidence-metrics__list";
  const comparisonFields = createMetricFields(document, comparison, [
    ["samples", "成功样本"],
    ["compile-median", "编译耗时中位数"],
    ["duration-median", "运行耗时中位数"],
    ["rss-median", "峰值 RSS 中位数"],
    ["operations-median", "操作计数中位数"],
    ["growth", "操作计数增长"],
  ]);
  const evidence = document.createElement("p");
  evidence.className = "evidence-metrics__evidence";
  root.append(
    heading,
    boundary,
    status,
    persistence,
    currentHeading,
    current,
    comparisonHeading,
    comparison,
    evidence,
  );
  host.replaceChildren(root);

  const resetAttempt = (): void => {
    for (const field of currentFields.values()) field.textContent = "不可用";
  };
  const resetComparison = (): void => {
    for (const field of comparisonFields.values()) field.textContent = "无可比证据";
    evidence.textContent = "比较必须同时匹配源码指纹、情景版本和工具链身份。";
  };
  resetAttempt();
  resetComparison();

  return Object.freeze({
    setPersistence(message: string, state: string): void {
      persistence.textContent = message;
      persistence.dataset.state = state;
    },
    render(
      message: string,
      state: "ready" | "working" | "failure" | "simulation",
      attempt: AttemptEvidence | null,
      summary: RunHistorySummary | null,
    ): void {
      root.dataset.state = state;
      status.textContent = message;
      resetAttempt();
      if (attempt !== null) {
        currentFields.get("compile")!.textContent = formatMilliseconds(attempt.compileDurationMs);
        currentFields.get("termination")!.textContent = attempt.runResult?.termination ?? "未运行";
        if (attempt.runResult !== null) {
          const result = attempt.runResult;
          currentFields.get("duration")!.textContent = formatMilliseconds(result.durationMs);
          currentFields.get("rss")!.textContent = formatBytes(
            positiveSafeIntegerOrNull(result.peakRssBytes),
          );
          currentFields.get("processes")!.textContent = formatInteger(
            positiveSafeIntegerOrNull(result.peakProcessCount),
          );
          currentFields.get("output")!.textContent = `${String(outputByteCount(result))} B`;
          currentFields.get("nodes")!.textContent = formatInteger(
            nonNegativeSafeIntegerOrNull(result.executedNodeCount),
          );
          currentFields.get("operations")!.textContent = formatInteger(
            nonNegativeSafeIntegerOrNull(result.operationCount),
          );
        }
      }
      resetComparison();
      if (summary !== null) {
        comparisonFields.get("samples")!.textContent = String(summary.runIds.length);
        comparisonFields.get("compile-median")!.textContent = formatMilliseconds(
          summary.compileDurationMs.median,
        );
        comparisonFields.get("duration-median")!.textContent = formatMilliseconds(
          summary.durationMs.median,
        );
        comparisonFields.get("rss-median")!.textContent = formatBytes(summary.peakRssBytes.median);
        comparisonFields.get("operations-median")!.textContent = formatInteger(
          summary.operationCount.median,
        );
        comparisonFields.get("growth")!.textContent = growthLabel(summary);
        evidence.textContent = `${summary.evidence} ${summary.growth.evidence}`;
      }
    },
    destroy(): void {
      host.replaceChildren();
    },
  });
}

function createMetricFields(
  document: Document,
  list: HTMLElement,
  definitions: readonly (readonly [id: string, label: string])[],
): ReadonlyMap<string, HTMLElement> {
  const fields = new Map<string, HTMLElement>();
  for (const [id, label] of definitions) {
    const row = document.createElement("div");
    row.className = "evidence-metrics__row";
    const term = document.createElement("dt");
    term.textContent = label;
    const value = document.createElement("dd");
    value.dataset.metric = id;
    row.append(term, value);
    list.append(row);
    fields.set(id, value);
  }
  return fields;
}

function growthLabel(summary: RunHistorySummary): string {
  const labels = {
    insufficient: "证据不足",
    stable: "经验上稳定",
    increasing: "经验上增长",
    "non-monotonic": "非单调",
  } as const;
  const slope = summary.growth.estimatedLogLogSlope;
  return `${labels[summary.growth.trend]}${slope === null ? "" : `；经验斜率 ${String(slope)}`}（${summary.growth.confidence}）`;
}

function nullableFiniteMetric(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function positiveSafeIntegerOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonNegativeSafeIntegerOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function outputByteCount(result: RunResult): number {
  return result.outputBytes !== undefined &&
    Number.isSafeInteger(result.outputBytes) &&
    result.outputBytes >= 0
    ? result.outputBytes
    : result.stdout.byteLength + result.stderr.byteLength;
}

function formatMilliseconds(value: number | null): string {
  return value === null ? "不可用" : `${formatNumber(value)} ms`;
}

function formatBytes(value: number | null): string {
  return value === null ? "未取得有效样本" : `${String(value)} B`;
}

function formatInteger(value: number | null): string {
  return value === null ? "不可用" : formatNumber(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function defaultRunId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `run:${globalThis.crypto.randomUUID()}`;
  }
  fallbackRunId += 1;
  return `run:fallback-${Date.now().toString(36)}-${fallbackRunId.toString(36)}`;
}

function assertOptions(options: EvidenceWorkspaceControllerOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.metricsHost !== "object" ||
    typeof options.mentorHost !== "object" ||
    typeof options.readSidecar !== "function" ||
    typeof options.saveSidecar !== "function"
  ) {
    throw new TypeError("EvidenceWorkspaceController options 无效");
  }
}

function assertWorkspaceIdentity(entryId: string | null, sourceFingerprint: string | null): void {
  if ((entryId === null) !== (sourceFingerprint === null)) {
    throw new TypeError("entryId 与 sourceFingerprint 必须同时提供或同时为 null");
  }
  if (
    entryId !== null &&
    (entryId.length === 0 || sourceFingerprint === null || sourceFingerprint.length === 0)
  ) {
    throw new TypeError("工作区身份必须是非空字符串");
  }
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("EvidenceWorkspaceController 已销毁");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
