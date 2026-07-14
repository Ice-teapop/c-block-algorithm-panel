import type { ProgramAnalysisSnapshot } from "../analysis/index.js";
import type { TextRange } from "../core/index.js";
import type { FlowEdge, FlowProjection } from "../flow/index.js";
import {
  createBuiltinScenarioProvider,
  type RealExecutionPathSummary,
  type ScenarioProvider,
  type ScenarioRunCase,
} from "../mentor/index.js";
import {
  createCatalogScenarioProvider,
  createEmptyScenarioCatalog,
  createScenarioCatalogPanel,
  createScenarioCatalogStore,
  readScenarioCatalogExtension,
  type ScenarioCatalogDocument,
  type ScenarioCatalogPanel,
  type ScenarioCatalogStore,
} from "../scenarios/index.js";
import type { Capabilities, CompileResult, PanelApi, RunResult } from "../shared/api.js";
import { RUNNER_LIMITS } from "../shared/limits.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type { TraceEvent, TraceRunEvidence } from "../shared/trace.js";
import { scenarioReferenceWorkload } from "../runtime/index.js";
import type { BlockTree } from "../ui/block-tree.js";
import type { CodePane } from "../ui/code-pane.js";
import type { MentorRemoteContext } from "../ui/mentor-panel.js";
import type { FlowCanvasActivePath } from "../ui/flow-canvas.js";
import type {
  RealScenarioRunRequest,
  ScenarioBenchmarkRequest,
  ScenarioBranchTarget,
  TeachingSimulationRequest,
} from "../ui/scenario-panel.js";
import { createTracePanel, type TracePanel } from "../ui/trace-panel.js";
import {
  toRunnerSourceName,
  type ManualRunScenario,
  type RunPanelCompletion,
} from "../ui/run-panel.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";
import {
  createManualRunInput,
  emptyManualRunInput,
  sourceMayNeedRuntimeInput,
  type ManualRunInput,
  type ManualRunInputValue,
} from "../ui/manual-run-input.js";
import { createDiagnosticRunPanel, type DiagnosticRunPanel } from "./diagnostic-run-panel.js";
import {
  createEvidenceWorkspaceController,
  type EvidenceWorkspaceController,
} from "./evidence-workspace-controller.js";
import {
  createScenarioWorkbenchController,
  type ScenarioWorkbenchController,
} from "./scenario-workbench-controller.js";
import {
  createTraceController,
  type TraceController,
  type TraceControllerState,
  type TraceScheduler,
} from "./trace-controller.js";
import {
  projectTraceEventsToFlow,
  type TraceFlowProjectionResult,
} from "./trace-flow-projection.js";
import { createWorkspaceSidecarPersistence } from "./workspace-sidecar-persistence.js";
import type { FlowNodeRuntimeSnapshot } from "./flow-node-evidence.js";
import {
  createWorkbenchPrimaryActionState,
  reduceWorkbenchPrimaryActionState,
  selectWorkbenchPrimaryAction,
  type WorkbenchPrimaryActionState,
} from "./workbench-primary-action.js";

const SCENARIO_SIDECAR_VERSION = 1 as const;
const OBSERVATION_LIMIT = 256;
const MANUAL_TRACE_SCENARIO_ID = "manual.current-source";
const MANUAL_TRACE_SCENARIO_VERSION = "1.0.0";
const BRANCH_KINDS = new Set([
  "branch-true",
  "branch-false",
  "switch-case",
  "switch-default",
  "switch-miss",
]);

export type RuntimeObservedBranchKind = Extract<
  FlowEdge["kind"],
  "branch-true" | "branch-false" | "switch-case" | "switch-default" | "switch-miss"
>;

interface RuntimeLearningObservationBase {
  readonly workspaceId: string;
  readonly sourceFingerprint: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
}

export type RuntimeLearningObservation =
  | (RuntimeLearningObservationBase & {
      readonly type: "trace-completed";
      readonly size: number;
      readonly mapped: true;
      readonly truncated: false;
      readonly branchKinds: readonly RuntimeObservedBranchKind[];
    })
  | (RuntimeLearningObservationBase & {
      readonly type: "run-completed";
      readonly size: number;
      readonly ok: boolean;
      readonly stdout: string;
      readonly expectedStdout: string;
      readonly expectedMatch: boolean;
      readonly exitCode: number | null;
      readonly termination: RunResult["termination"];
      readonly historyDisposition: "success" | "teaching-failure";
    })
  | (RuntimeLearningObservationBase & {
      readonly type: "benchmark-completed";
      readonly sizes: readonly number[];
      readonly repetitions: number;
    });

interface ScenarioSelectionState {
  readonly scenarioId: string;
  readonly size: number;
  readonly targetBranchId: string | null;
}

interface BranchObservation {
  readonly sourceFingerprint: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly size: number;
  readonly edgeIds: readonly string[];
}

interface ScenarioDefinitionSnapshot {
  readonly id: string;
  readonly version: string;
  readonly family: string;
  readonly label: string;
  readonly description: string;
  readonly example: ScenarioRunCase;
  readonly sizeGenerator: {
    readonly minimum: number;
    readonly maximum: number;
    readonly defaultSizes: readonly number[];
    readonly inputModel: string;
  };
}

interface ScenarioSidecarDocument {
  readonly schemaVersion: typeof SCENARIO_SIDECAR_VERSION;
  readonly sourceFingerprint: string;
  readonly selection: ScenarioSelectionState | null;
  readonly activeCase: ScenarioRunCase;
  readonly definitions: readonly ScenarioDefinitionSnapshot[];
  readonly observations: readonly BranchObservation[];
  readonly customCatalog: ScenarioCatalogDocument;
  readonly manualInput: ManualInputSnapshot | null;
}

interface ManualInputSnapshot extends ManualRunInputValue {
  readonly sourceFingerprint: string;
}

export interface RuntimeWorkspaceControllerOptions {
  readonly elements: WorkbenchElements;
  readonly api: PanelApi;
  readonly codePane: CodePane;
  readonly blockTree: BlockTree;
  readonly getSource: () => string;
  readonly getAnalyzedSource: () => string | null;
  readonly getDisplayName: () => string;
  readonly getAnalysis: () => ProgramAnalysisSnapshot | null;
  readonly getProjection: () => FlowProjection | null;
  readonly onSetActivePath: (
    path: FlowCanvasActivePath,
    evidence: FlowNodeRuntimeSnapshot | null,
  ) => void;
  readonly onFocusNode: (nodeId: string) => void;
  readonly onRevealRange: (range: TextRange) => void;
  readonly onLearningObservation?: ((observation: RuntimeLearningObservation) => void) | undefined;
  readonly scenarioProvider?: ScenarioProvider | undefined;
  readonly traceScheduler?: TraceScheduler | undefined;
  readonly tracePollIntervalMs?: number | undefined;
  readonly sidecarDelayMs?: number | undefined;
}

export interface RuntimeWorkspaceController {
  readonly scenario: ScenarioWorkbenchController;
  readonly trace: TraceController;
  readonly hasPendingChanges: boolean;
  getRemoteMentorContext(): MentorRemoteContext | null;
  setWorkspaceEntry(entryId: string | null, fingerprint: string | null): Promise<void>;
  setAnalysis(analysis: ProgramAnalysisSnapshot | null): void;
  invalidateSource(): void;
  flush(): Promise<void>;
  destroy(): Promise<void>;
}

interface TraceWaiter {
  readonly generation: number;
  readonly resolve: (result: TraceFlowProjectionResult) => void;
  readonly reject: (error: Error) => void;
}

export function createRuntimeWorkspaceController(
  options: RuntimeWorkspaceControllerOptions,
): RuntimeWorkspaceController {
  assertOptions(options);
  let destroyed = false;
  let generation = 0;
  let activeEntryId: string | null = null;
  let activeFingerprint: string | null = null;
  let observations: readonly BranchObservation[] = Object.freeze([]);
  let accumulatedTraceEvents: readonly TraceEvent[] = Object.freeze([]);
  let lastProjection: TraceFlowProjectionResult | null = null;
  let strictTraceMapping = true;
  let traceWaiter: TraceWaiter | null = null;
  let evidenceDirty = false;
  let suppressCatalogPersistence = true;
  let primaryActionState: WorkbenchPrimaryActionState = createWorkbenchPrimaryActionState(
    fingerprintSource(options.getSource()),
  );
  let primaryActionBusy = false;
  let primaryBusyAction: "run" | "observe" | null = null;
  let activeProblemIndex = 0;

  const evidence = createEvidenceWorkspaceController({
    metricsHost: options.elements.metricsHost,
    mentorHost: options.elements.mentorHost,
    analysisHost: options.elements.analysisHost,
    api: options.api,
    getSource: options.getSource,
    readSidecar: (entryId, kind) => options.api.readWorkspaceSidecar({ entryId, kind }),
    saveSidecar: (request) => options.api.saveWorkspaceSidecar(request),
    onOpenAiSettings: () => options.elements.executeMenuAction("settings", "ai-privacy"),
    ...(options.sidecarDelayMs === undefined ? {} : { delayMs: options.sidecarDelayMs }),
    onLocate: (target) => {
      const projection = currentProjectionOrNull(options);
      const node = projection?.nodes.find(
        (candidate) => candidate.id === target.nodeId || candidate.sourceNodeId === target.nodeId,
      );
      if (node !== undefined) options.onFocusNode(node.id);
      options.onRevealRange(target.range);
    },
  });

  const scenarioPersistence = createWorkspaceSidecarPersistence({
    kind: "scenarios",
    read: (entryId, kind) => options.api.readWorkspaceSidecar({ entryId, kind }),
    save: (request) => options.api.saveWorkspaceSidecar(request),
    ...(options.sidecarDelayMs === undefined ? {} : { delayMs: options.sidecarDelayMs }),
  });

  const builtinScenarios = options.scenarioProvider ?? createBuiltinScenarioProvider();
  const catalogStore: ScenarioCatalogStore = createScenarioCatalogStore({
    builtins: builtinScenarios,
    document: createEmptyScenarioCatalog(fingerprintSource(options.getSource())),
    onChange: () => {
      if (suppressCatalogPersistence || scenario === undefined) return;
      const preferred = scenario.getSnapshot().scenarioId;
      scenario.refreshScenarios(preferred);
      scenarioCatalogPanel?.refresh();
      persistScenarioState();
    },
  });
  const catalogProvider = createCatalogScenarioProvider(catalogStore);

  let scenario!: ScenarioWorkbenchController;
  let scenarioCatalogPanel: ScenarioCatalogPanel | undefined;
  let trace!: TraceController;
  let tracePanel!: TracePanel;
  let manualInputValue: ManualRunInputValue = emptyManualRunInput();
  let manualInputAcknowledged = false;
  let manualInputBindingFingerprint: string | null = null;
  const manualInput: ManualRunInput = createManualRunInput(options.elements.manualRunInputHost, {
    onRun: (value) => {
      manualInputValue = value;
      manualInputAcknowledged = true;
      manualInputBindingFingerprint = fingerprintSource(options.getSource());
      manualInput.setValue(value);
      resetPrimaryAction(fingerprintSource(options.getSource()));
      persistScenarioState();
      void invokePrimaryAction();
    },
  });

  const runPanel: DiagnosticRunPanel = createDiagnosticRunPanel(
    options.elements.getInspectorHost("run"),
    options.codePane,
    options.blockTree,
    {
      getSource: options.getSource,
      getAnalyzedSource: options.getAnalyzedSource,
      getDisplayName: options.getDisplayName,
      getManualScenario: () => manualScenario(manualInputValue),
      onRunComplete: (completion) => recordEvidence(completion),
    },
  );

  const publishActivePath = (
    path: FlowCanvasActivePath,
    nodeVisitCounts: Readonly<Record<string, number>> | null = null,
  ): void => {
    const projection = options.getProjection();
    const runtimeEvidence =
      projection === null || nodeVisitCounts === null
        ? null
        : Object.freeze({
            sourceFingerprint: projection.sourceFingerprint,
            mode: path.mode,
            currentNodeId: path.currentNodeId,
            nodeVisitCounts: Object.freeze({ ...nodeVisitCounts }),
          });
    options.onSetActivePath(path, runtimeEvidence);
  };

  const applyTraceProjection = (render: boolean): void => {
    const events = accumulatedTraceEvents;
    if (events.length === 0) {
      lastProjection = null;
      strictTraceMapping = true;
      if (render) publishActivePath(emptyPath("real"));
      return;
    }
    try {
      const source = options.getSource();
      const projection = requireCurrentProjection(options, source);
      const projected = projectTraceEventsToFlow(source, projection, events);
      if (
        projected.unmatchedEventCount !== 0 ||
        projected.matchedEventCount !== events.length ||
        projected.discontinuityCount !== 0
      ) {
        strictTraceMapping = false;
        lastProjection = null;
        publishActivePath(emptyPath("real"));
        return;
      }
      strictTraceMapping = true;
      lastProjection = projected;
      if (render) publishActivePath(projected.path, projected.nodeVisitCounts);
    } catch {
      strictTraceMapping = false;
      lastProjection = null;
      publishActivePath(emptyPath("real"));
    }
  };

  trace = createTraceController({
    api: options.api,
    getSource: options.getSource,
    getDisplayName: options.getDisplayName,
    resolveTraceEvent: (event, context) => {
      const projection = requireCurrentProjection(options, context.source);
      if (context.sourceFingerprint !== projection.sourceFingerprint) {
        throw new Error("Trace 与流程投影指纹不一致");
      }
      // TraceController deliberately renders only its newest 500 events. The resolver still
      // receives every bounded backend event, so keep the validation path independently.
      accumulatedTraceEvents = accumulateTraceEvents(accumulatedTraceEvents, [event]);
      applyTraceProjection(false);
      const projected = projectTraceEventsToFlow(context.source, projection, [event]);
      if (projected.unmatchedEventCount !== 0) return null;
      return projected.path;
    },
    onStateChange: (state) => {
      tracePanel?.setState(state);
      settleTraceWaiter(state);
    },
    onEventsChange: (events) => {
      tracePanel?.setEvents(events);
      accumulatedTraceEvents = accumulateTraceEvents(accumulatedTraceEvents, events);
      const paused = trace?.getState().playbackPaused ?? false;
      applyTraceProjection(!paused);
    },
    onPathUpdate: () => applyTraceProjection(true),
    onPathReset: () => publishActivePath(emptyPath("real")),
    ...(options.traceScheduler === undefined ? {} : { scheduler: options.traceScheduler }),
    ...(options.tracePollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: options.tracePollIntervalMs }),
  });

  tracePanel = createTracePanel(options.elements.traceHost, {
    showStartButton: false,
    onStart: async () => {
      await observeCurrentPath();
    },
    onCancel: () => trace.cancel(),
    onPausePlayback: () => trace.pausePlayback(),
    onResumePlayback: () => trace.resumePlayback(),
  });
  tracePanel.setState(trace.getState());
  tracePanel.setEvents(trace.getEvents());

  const scenarioHosts = createScenarioHosts(
    options.elements.scenarioHost,
    options.elements.shell.dataset.locale === "en",
  );
  scenario = createScenarioWorkbenchController({
    host: scenarioHosts.runner,
    provider: catalogProvider,
    onScenarioChange: () => {
      manualInputAcknowledged = false;
      refreshManualInput();
      resetPrimaryAction(fingerprintSource(options.getSource()));
      persistScenarioState();
    },
    onRealRunRequested: runScenarioReal,
    onTeachingSimulationRequested: runTeachingSimulation,
    onBenchmarkRequested: runBenchmark,
  });
  scenarioCatalogPanel = createScenarioCatalogPanel(scenarioHosts.catalog, {
    store: catalogStore,
    localeHost: options.elements.shell,
    confirmDelete: (label) => globalThis.confirm(label),
    onSelectionChange: (scenarioId) => {
      if (scenarioId === null) return;
      try {
        scenario.selectScenario(scenarioId);
        refreshBranchTargets();
      } catch {
        // Catalog selection can race a workspace replacement; the next refresh restores it.
      }
    },
  });
  suppressCatalogPersistence = false;
  refreshBranchTargets();
  evidence.setAnalysis(validAnalysis(options.getAnalysis(), options.getSource()));
  void runPanel.refreshCapabilities();
  const onPrimaryActionClick = (): void => {
    void invokePrimaryAction();
  };
  const onProblemShortcut = (event: KeyboardEvent): void => {
    if (event.key !== "F8" || event.altKey || event.ctrlKey || event.metaKey) return;
    const analysis = validAnalysis(options.getAnalysis(), options.getSource());
    if (actionableFindingCount(analysis) === 0) return;
    event.preventDefault();
    revealPrimaryProblem(event.shiftKey ? "previous" : "next");
  };
  const onPrimaryLocaleChange = (): void => {
    renderPrimaryAction();
    scenarioHosts.catalogSummary.textContent = scenarioCatalogSummaryLabel(
      options.elements.shell.dataset.locale === "en",
    );
  };
  options.elements.tracePrimaryButton.addEventListener("click", onPrimaryActionClick);
  options.elements.shell.addEventListener("keydown", onProblemShortcut);
  options.elements.shell.addEventListener("workbench-locale-change", onPrimaryLocaleChange);
  syncPrimaryProblem();
  renderPrimaryAction();
  refreshManualInput();

  function withoutCatalogPersistence(operation: () => void): void {
    const previous = suppressCatalogPersistence;
    suppressCatalogPersistence = true;
    try {
      operation();
    } finally {
      suppressCatalogPersistence = previous;
    }
  }

  function updatePrimaryAction(
    event: Parameters<typeof reduceWorkbenchPrimaryActionState>[1],
  ): void {
    primaryActionState = reduceWorkbenchPrimaryActionState(primaryActionState, event);
    renderPrimaryAction();
  }

  function refreshManualInput(): void {
    const needed = !scenario.hasScenarioBinding() && sourceMayNeedRuntimeInput(options.getSource());
    manualInput.setNeeded(needed);
    manualInput.setValue(manualInputValue);
  }

  function resetPrimaryAction(sourceFingerprint: string): void {
    activeProblemIndex = 0;
    primaryActionState = reduceWorkbenchPrimaryActionState(primaryActionState, {
      type: "source-reset",
      sourceFingerprint,
    });
    syncPrimaryProblem();
    renderPrimaryAction();
  }

  function syncPrimaryProblem(): void {
    const analysis = validAnalysis(options.getAnalysis(), options.getSource());
    updatePrimaryAction({
      type: "problem-changed",
      sourceFingerprint: primaryActionState.sourceFingerprint,
      present: actionableFindingCount(analysis) > 0,
    });
  }

  function renderPrimaryAction(): void {
    const button = options.elements.tracePrimaryButton;
    const action = selectWorkbenchPrimaryAction(primaryActionState);
    const english = options.elements.shell.dataset.locale === "en";
    const problemCount = actionableFindingCount(
      validAnalysis(options.getAnalysis(), options.getSource()),
    );
    if (problemCount > 0) activeProblemIndex %= problemCount;
    else activeProblemIndex = 0;
    button.dataset.primaryAction = action;
    button.disabled = primaryActionBusy;
    button.setAttribute("aria-busy", String(primaryActionBusy));
    if (action === "problem") {
      button.setAttribute("aria-keyshortcuts", "F8 Shift+F8");
      button.title = english
        ? "F8 next problem · Shift+F8 previous problem"
        : "F8 下一个问题 · Shift+F8 上一个问题";
    } else {
      button.removeAttribute("aria-keyshortcuts");
      button.title = "";
    }
    if (primaryActionBusy) {
      button.textContent =
        primaryBusyAction === "observe"
          ? english
            ? "Observing…"
            : "观察中…"
          : english
            ? "Running…"
            : "运行中…";
      return;
    }
    button.textContent =
      action === "run"
        ? english
          ? primaryActionState.run === "passed"
            ? "Run Again"
            : "Run"
          : primaryActionState.run === "passed"
            ? "再次运行"
            : "运行"
        : action === "observe"
          ? english
            ? "Observe Path"
            : "观察路径"
          : english
            ? problemCount > 0
              ? `Problem ${String(activeProblemIndex + 1)}/${String(problemCount)}`
              : "View Runtime Problem"
            : problemCount > 0
              ? `问题 ${String(activeProblemIndex + 1)}/${String(problemCount)}`
              : "查看运行问题";
  }

  async function invokePrimaryAction(): Promise<void> {
    if (destroyed || primaryActionBusy) return;
    const sourceFingerprint = fingerprintSource(options.getSource());
    if (sourceFingerprint !== primaryActionState.sourceFingerprint) {
      resetPrimaryAction(sourceFingerprint);
    }
    const action = selectWorkbenchPrimaryAction(primaryActionState);
    if (action === "problem") {
      revealPrimaryProblem();
      return;
    }
    if (
      action === "run" &&
      !scenario.hasScenarioBinding() &&
      !manualInputAcknowledged &&
      sourceMayNeedRuntimeInput(options.getSource()) &&
      manualInput.requestInput()
    ) {
      return;
    }
    primaryActionBusy = true;
    primaryBusyAction = action;
    renderPrimaryAction();
    try {
      if (action === "run") {
        if (scenario.hasScenarioBinding()) {
          await scenario.runReal();
        } else {
          const previousRun = primaryActionState.run;
          await runPanel.runCurrent();
          if (primaryActionState.run === previousRun) {
            updatePrimaryAction({ type: "run-finished", sourceFingerprint, ok: false });
          }
        }
      } else {
        await observeCurrentPath();
        updatePrimaryAction({ type: "observation-finished", sourceFingerprint, ok: true });
      }
    } catch {
      updatePrimaryAction({
        type: action === "run" ? "run-finished" : "observation-finished",
        sourceFingerprint,
        ok: false,
      });
    } finally {
      primaryActionBusy = false;
      primaryBusyAction = null;
      renderPrimaryAction();
    }
  }

  async function observeCurrentPath(): Promise<void> {
    options.elements.focusPanel("runtime");
    const bound = scenario.hasScenarioBinding();
    const runCase = bound ? scenario.getSnapshot().runCase : manualTraceRunCase(manualInputValue);
    const result = await runTrace(runCase);
    if (bound) observeBranches(runCase, result.path.edgeIds);
  }

  function revealPrimaryProblem(direction: "next" | "previous" = "next"): void {
    const analysis = validAnalysis(options.getAnalysis(), options.getSource());
    const findings = actionableFindings(analysis);
    if (findings.length === 0) {
      options.elements.focusPanel("runtime");
      return;
    }
    if (direction === "previous") {
      activeProblemIndex = (activeProblemIndex - 1 + findings.length) % findings.length;
    } else {
      activeProblemIndex %= findings.length;
    }
    const finding = findings[activeProblemIndex]!;
    options.elements.focusPanel("code");
    const projection = currentProjectionOrNull(options);
    const node = projection?.nodes.find(
      (candidate) =>
        candidate.id === finding.ownerNodeId || candidate.sourceNodeId === finding.ownerNodeId,
    );
    if (node !== undefined) options.onFocusNode(node.id);
    options.onRevealRange(finding.primaryRange);
    if (direction === "next") activeProblemIndex = (activeProblemIndex + 1) % findings.length;
    renderPrimaryAction();
  }

  function settleTraceWaiter(state: TraceControllerState): void {
    const waiter = traceWaiter;
    if (waiter === null || !isTerminalTraceState(state.status)) return;
    traceWaiter = null;
    if (waiter.generation !== generation) {
      waiter.reject(new Error("真实 Trace 已失效"));
      return;
    }
    if (
      state.status === "completed" &&
      state.evidence?.ok === true &&
      strictTraceMapping &&
      lastProjection !== null
    ) {
      waiter.resolve(lastProjection);
      return;
    }
    waiter.reject(new Error(`真实 Trace 未通过：${state.message}`));
  }

  async function runTrace(runCase: ScenarioRunCase): Promise<TraceFlowProjectionResult> {
    assertAlive(destroyed);
    const taskGeneration = generation;
    assertRunCase(runCase);
    const reference = scenarioReferenceWorkload(runCase.scenarioId, runCase.size);
    tracePanel.setReference(
      reference === null
        ? null
        : Object.freeze({
            inputSize: reference.inputSize,
            referenceOperationCount: reference.referenceOperationCount,
            label: reference.label,
          }),
    );
    if (traceWaiter !== null) {
      traceWaiter.reject(new Error("真实 Trace 已被新任务替换"));
      traceWaiter = null;
      await trace.cancel();
    }
    const terminal = new Promise<TraceFlowProjectionResult>((resolve, reject) => {
      traceWaiter = Object.freeze({ generation: taskGeneration, resolve, reject });
    });
    await trace.start({ stdin: runCase.stdin, args: runCase.arguments });
    const state = trace.getState();
    settleTraceWaiter(state);
    const result = await terminal;
    assertGeneration(taskGeneration);
    publishTraceLearningObservation(runCase, result);
    return result;
  }

  async function runScenarioReal(request: RealScenarioRunRequest): Promise<void> {
    const taskGeneration = generation;
    const source = sourceSnapshot(options);
    try {
      persistScenarioState();
      const projected = await runTrace(request.runCase);
      assertSnapshot(source, taskGeneration);
      if (
        request.targetBranch !== null &&
        !projected.path.edgeIds.includes(request.targetBranch.id)
      ) {
        throw new Error(`真实轨迹未经过目标分支：${request.targetBranch.label}`);
      }
      observeBranches(request.runCase, projected.path.edgeIds);
      const completion = await compileAndRun(
        request.runCase,
        source,
        taskGeneration,
        requireTraceCounts(trace.getState().evidence),
      );
      assertExpectedOutput(request.runCase, completion.runResult);
      recordEvidence(
        completion,
        realPathSummary(
          options,
          request.runCase,
          projected,
          trace.getState().evidence,
          request.targetBranch?.id ?? null,
        ),
      );
      const currentNodeId = projected.path.currentNodeId;
      if (currentNodeId !== null) options.onFocusNode(currentNodeId);
    } catch (error: unknown) {
      updatePrimaryAction({
        type: "run-finished",
        sourceFingerprint: source.fingerprint,
        ok: false,
      });
      throw error;
    }
  }

  async function runTeachingSimulation(request: TeachingSimulationRequest): Promise<void> {
    evidence.setRealPath(null);
    tracePanel.setReference(null);
    const source = options.getSource();
    const projection = requireCurrentProjection(options, source);
    const path = structuralSimulationPath(projection, request.targetBranch?.id ?? null);
    publishActivePath(
      path,
      Object.freeze(Object.fromEntries(path.nodeIds.map((nodeId) => [nodeId, 1]))),
    );
    if (path.currentNodeId !== null) options.onFocusNode(path.currentNodeId);
    persistScenarioState();
  }

  async function runBenchmark(request: ScenarioBenchmarkRequest): Promise<void> {
    const taskGeneration = generation;
    const source = sourceSnapshot(options);
    const completedSizes = validateBenchmarkRequest(request);
    persistScenarioState();
    for (const runCase of request.cases) {
      for (let repetition = 0; repetition < request.repetitions; repetition += 1) {
        assertSnapshot(source, taskGeneration);
        const projected = await runTrace(runCase);
        assertSnapshot(source, taskGeneration);
        observeBranches(runCase, projected.path.edgeIds);
        const completion = await compileAndRun(
          runCase,
          source,
          taskGeneration,
          requireTraceCounts(trace.getState().evidence),
        );
        assertExpectedOutput(runCase, completion.runResult);
        recordEvidence(
          completion,
          realPathSummary(options, runCase, projected, trace.getState().evidence, null),
        );
      }
    }
    assertSnapshot(source, taskGeneration);
    publishBenchmarkLearningObservation(request, source, completedSizes);
  }

  async function compileAndRun(
    runCase: ScenarioRunCase,
    snapshot: SourceSnapshot,
    taskGeneration: number,
    counts: TraceCounts,
  ): Promise<RunPanelCompletion> {
    assertRunCase(runCase);
    const capabilities = await options.api.capabilities();
    assertSnapshot(snapshot, taskGeneration);
    const compileResult = await options.api.compile({
      source: snapshot.source,
      sourceName: toRunnerSourceName(options.getDisplayName()),
    });
    assertSnapshot(snapshot, taskGeneration);
    const scenarioIdentity = toManualScenario(runCase, "real");
    if (!compileResult.ok) {
      throw new Error(`案例编译失败：${compileResult.error.message}`);
    }
    const runResult = await options.api.run({
      artifactId: compileResult.artifactId,
      stdin: runCase.stdin,
      args: runCase.arguments,
    });
    assertSnapshot(snapshot, taskGeneration);
    const measuredRunResult = Object.freeze({
      ...runResult,
      executedNodeCount: counts.executedNodeCount,
      operationCount: counts.operationCount,
    });
    const completed = completion(
      snapshot,
      compileResult,
      measuredRunResult,
      capabilities,
      scenarioIdentity,
    );
    publishRunLearningObservation(runCase, snapshot, measuredRunResult);
    if (!measuredRunResult.ok) {
      throw new Error(
        `案例真实运行失败：${measuredRunResult.error?.message ?? measuredRunResult.termination}`,
      );
    }
    return completed;
  }

  function publishTraceLearningObservation(
    runCase: ScenarioRunCase,
    projected: TraceFlowProjectionResult,
  ): void {
    if (activeEntryId === null || options.onLearningObservation === undefined) return;
    const projection = requireCurrentProjection(options, options.getSource());
    const branchKinds = observedBranchKinds(projection, projected.path.edgeIds);
    options.onLearningObservation(
      Object.freeze({
        type: "trace-completed",
        workspaceId: activeEntryId,
        sourceFingerprint: projection.sourceFingerprint,
        scenarioId: runCase.scenarioId,
        scenarioVersion: runCase.scenarioVersion,
        size: runCase.size,
        mapped: true,
        truncated: false,
        branchKinds,
      }),
    );
  }

  function publishRunLearningObservation(
    runCase: ScenarioRunCase,
    snapshot: SourceSnapshot,
    runResult: RunResult,
  ): void {
    if (activeEntryId === null || options.onLearningObservation === undefined) return;
    const stdout = decodeRunStdout(runResult);
    const expectedMatch = runResult.ok && stdout === runCase.expected.stdout;
    options.onLearningObservation(
      Object.freeze({
        type: "run-completed",
        workspaceId: activeEntryId,
        sourceFingerprint: snapshot.fingerprint,
        scenarioId: runCase.scenarioId,
        scenarioVersion: runCase.scenarioVersion,
        size: runCase.size,
        ok: runResult.ok,
        stdout,
        expectedStdout: runCase.expected.stdout,
        expectedMatch,
        exitCode: runResult.exitCode,
        termination: runResult.termination,
        historyDisposition: expectedMatch ? "success" : "teaching-failure",
      }),
    );
  }

  function publishBenchmarkLearningObservation(
    request: ScenarioBenchmarkRequest,
    snapshot: SourceSnapshot,
    sizes: readonly number[],
  ): void {
    if (activeEntryId === null || options.onLearningObservation === undefined) return;
    options.onLearningObservation(
      Object.freeze({
        type: "benchmark-completed",
        workspaceId: activeEntryId,
        sourceFingerprint: snapshot.fingerprint,
        scenarioId: request.scenario.id,
        scenarioVersion: request.scenario.version,
        sizes,
        repetitions: request.repetitions,
      }),
    );
  }

  function recordEvidence(
    completionValue: RunPanelCompletion,
    realPath: RealExecutionPathSummary | null = null,
  ): void {
    if (completionValue.scenario?.mode === "simulation") {
      throw new Error("教学模拟不得进入运行证据");
    }
    evidence.setRealPath(realPath);
    evidence.recordRun(completionValue);
    evidenceDirty = true;
    updatePrimaryAction({
      type: "run-finished",
      sourceFingerprint: completionValue.sourceFingerprint,
      ok: completionValue.compileResult.ok && completionValue.runResult?.ok === true,
    });
  }

  function observeBranches(runCase: ScenarioRunCase, edgeIds: readonly string[]): void {
    const source = options.getSource();
    const projection = requireCurrentProjection(options, source);
    const observed = edgeIds.filter((id) => {
      const edge = projection.edges.find((candidate) => candidate.id === id);
      return edge !== undefined && BRANCH_KINDS.has(edge.kind);
    });
    if (observed.length === 0) return;
    const next: BranchObservation = Object.freeze({
      sourceFingerprint: projection.sourceFingerprint,
      scenarioId: runCase.scenarioId,
      scenarioVersion: runCase.scenarioVersion,
      size: runCase.size,
      edgeIds: Object.freeze([...new Set(observed)]),
    });
    const key = observationKey(next);
    const previous = observations.find((item) => observationKey(item) === key);
    const merged =
      previous === undefined
        ? next
        : Object.freeze({
            ...next,
            edgeIds: Object.freeze([...new Set([...previous.edgeIds, ...next.edgeIds])]),
          });
    observations = Object.freeze(
      [...observations.filter((item) => observationKey(item) !== key), merged].slice(
        -OBSERVATION_LIMIT,
      ),
    );
    refreshBranchTargets();
    persistScenarioState();
  }

  function refreshBranchTargets(): void {
    const projection = currentProjectionOrNull(options);
    publishBranchCoverage(projection);
    if (scenario === undefined) return;
    const snapshot = scenario.getSnapshot();
    if (projection === null) {
      scenario.setBranchTargets(Object.freeze([]));
      return;
    }
    scenario.setBranchTargets(branchTargets(projection, snapshot.runCase, observations));
  }

  function publishBranchCoverage(projection: FlowProjection | null): void {
    if (projection === null) {
      evidence.setBranchCoverage(null);
      return;
    }
    const totalBranchIds = projection.edges
      .filter((edge) => BRANCH_KINDS.has(edge.kind))
      .map((edge) => edge.id);
    const allowed = new Set(totalBranchIds);
    const coveredBranchIds = [
      ...new Set(
        observations
          .filter((item) => item.sourceFingerprint === projection.sourceFingerprint)
          .flatMap((item) => item.edgeIds)
          .filter((id) => allowed.has(id)),
      ),
    ];
    evidence.setBranchCoverage(
      Object.freeze({
        sourceFingerprint: projection.sourceFingerprint,
        coveredBranchIds: Object.freeze(coveredBranchIds),
        totalBranchIds: Object.freeze(totalBranchIds),
      }),
    );
  }

  function persistScenarioState(): void {
    if (activeEntryId === null || activeFingerprint === null) return;
    const document = scenarioDocument(
      activeFingerprint,
      scenario,
      observations,
      catalogStore.document,
      manualInputValue,
      manualInputBindingFingerprint,
    );
    scenarioPersistence.update(JSON.stringify(document), activeFingerprint);
  }

  const controller: RuntimeWorkspaceController = {
    scenario,
    trace,
    get hasPendingChanges(): boolean {
      return scenarioPersistence.hasPendingChanges || evidenceDirty;
    },
    getRemoteMentorContext(): MentorRemoteContext | null {
      return evidence.getRemoteMentorContext();
    },
    async setWorkspaceEntry(entryId: string | null, fingerprint: string | null): Promise<void> {
      assertAlive(destroyed);
      assertWorkspaceIdentity(entryId, fingerprint);
      invalidateTasks("工作区已切换");
      manualInputValue = emptyManualRunInput();
      manualInputAcknowledged = false;
      manualInputBindingFingerprint = null;
      manualInput.setValue(manualInputValue);
      resetPrimaryAction(fingerprint ?? fingerprintSource(options.getSource()));
      await trace.cancel();
      if (entryId === null || fingerprint === null) {
        await Promise.all([
          scenarioPersistence.deactivate(),
          evidence.setWorkspaceEntry(null, null),
        ]);
        activeEntryId = null;
        activeFingerprint = null;
        observations = Object.freeze([]);
        evidenceDirty = false;
        withoutCatalogPersistence(() => {
          catalogStore.replaceDocument(
            createEmptyScenarioCatalog(fingerprintSource(options.getSource())),
          );
          scenario.refreshScenarios();
          scenario.clearScenarioBinding();
          scenarioCatalogPanel?.refresh();
        });
        refreshBranchTargets();
        refreshManualInput();
        return;
      }
      if (fingerprintSource(options.getSource()) !== fingerprint) {
        throw new Error("工作区源码指纹与当前编辑器不一致");
      }
      const [adoption] = await Promise.all([
        scenarioPersistence.adopt(entryId, fingerprint),
        evidence.setWorkspaceEntry(entryId, fingerprint),
      ]);
      activeEntryId = entryId;
      activeFingerprint = fingerprint;
      evidenceDirty = false;
      observations = Object.freeze([]);
      let restored: ScenarioSidecarDocument | null = null;
      if (adoption.document !== null && adoption.matchesSource) {
        restored = parseScenarioSidecar(adoption.document.serialized, fingerprint);
        if (restored !== null) {
          observations = restored.observations;
        }
      }
      withoutCatalogPersistence(() => {
        catalogStore.replaceDocument(
          restored?.customCatalog ?? createEmptyScenarioCatalog(fingerprint),
        );
        scenario.refreshScenarios(restored?.selection?.scenarioId);
        scenarioCatalogPanel?.refresh();
      });
      restoreSelection(scenario, restored?.selection ?? null);
      refreshBranchTargets();
      restoreTargetSelection(scenario, adoption.document, fingerprint);
      if (restored?.manualInput !== null && restored?.manualInput !== undefined) {
        manualInputValue = Object.freeze({
          stdin: restored.manualInput.stdin,
          arguments: restored.manualInput.arguments,
        });
        manualInputAcknowledged = true;
        manualInputBindingFingerprint = fingerprint;
        manualInput.setValue(manualInputValue);
      }
      evidence.setAnalysis(validAnalysis(options.getAnalysis(), options.getSource()));
      refreshManualInput();
    },
    setAnalysis(analysis: ProgramAnalysisSnapshot | null): void {
      assertAlive(destroyed);
      evidence.setAnalysis(validAnalysis(analysis, options.getSource()));
      refreshBranchTargets();
      syncPrimaryProblem();
    },
    invalidateSource(): void {
      assertAlive(destroyed);
      invalidateTasks("源码已改变");
      trace.invalidateSource();
      runPanel.invalidateSource();
      evidence.setAnalysis(null);
      observations = Object.freeze([]);
      activeFingerprint = activeEntryId === null ? null : fingerprintSource(options.getSource());
      manualInputAcknowledged = false;
      manualInputBindingFingerprint = null;
      resetPrimaryAction(activeFingerprint ?? fingerprintSource(options.getSource()));
      if (activeFingerprint !== null) {
        withoutCatalogPersistence(() => {
          catalogStore.rebindSource(activeFingerprint!);
          scenario.refreshScenarios();
          scenarioCatalogPanel?.refresh();
        });
      }
      refreshBranchTargets();
      refreshManualInput();
      persistScenarioState();
    },
    async flush(): Promise<void> {
      assertAlive(destroyed);
      await Promise.all([scenarioPersistence.flush(), evidence.flush()]);
      evidenceDirty = false;
    },
    async destroy(): Promise<void> {
      if (destroyed) return;
      invalidateTasks("Runtime 工作台已销毁", false);
      destroyed = true;
      options.elements.tracePrimaryButton.removeEventListener("click", onPrimaryActionClick);
      options.elements.shell.removeEventListener("keydown", onProblemShortcut);
      options.elements.shell.removeEventListener("workbench-locale-change", onPrimaryLocaleChange);
      trace.destroy();
      tracePanel.destroy();
      manualInput.destroy();
      scenarioCatalogPanel?.destroy();
      scenario.destroy();
      runPanel.destroy();
      try {
        await Promise.all([scenarioPersistence.flush(), evidence.destroy()]);
      } finally {
        scenarioPersistence.destroy();
      }
    },
  };
  return Object.freeze(controller);

  function assertGeneration(expected: number): void {
    if (destroyed || generation !== expected) throw new Error("Runtime 任务已失效");
  }

  function assertSnapshot(snapshot: SourceSnapshot, expectedGeneration: number): void {
    assertGeneration(expectedGeneration);
    const current = options.getSource();
    if (current !== snapshot.source || fingerprintSource(current) !== snapshot.fingerprint) {
      invalidateTasks("源码已改变");
      throw new Error("源码已改变；真实运行结果已作废");
    }
  }

  function invalidateTasks(reason: string, publishPath = true): void {
    generation += 1;
    const waiter = traceWaiter;
    traceWaiter = null;
    waiter?.reject(new Error(reason));
    lastProjection = null;
    accumulatedTraceEvents = Object.freeze([]);
    strictTraceMapping = true;
    if (publishPath) publishActivePath(emptyPath("real"));
  }
}

interface SourceSnapshot {
  readonly source: string;
  readonly fingerprint: string;
}

function validateBenchmarkRequest(request: ScenarioBenchmarkRequest): readonly number[] {
  if (!Number.isSafeInteger(request.repetitions) || request.repetitions < 1) {
    throw new TypeError("Benchmark 重复次数无效");
  }
  const sizes = [...new Set(request.sizes)];
  if (
    sizes.length === 0 ||
    sizes.some((size) => !Number.isSafeInteger(size) || size < 1) ||
    request.cases.length !== sizes.length
  ) {
    throw new TypeError("Benchmark 输入规模无效");
  }
  const caseSizes = new Set<number>();
  for (const runCase of request.cases) {
    if (
      runCase.scenarioId !== request.scenario.id ||
      runCase.scenarioVersion !== request.scenario.version ||
      !sizes.includes(runCase.size) ||
      caseSizes.has(runCase.size)
    ) {
      throw new TypeError("Benchmark 案例必须绑定同一情景、版本和唯一输入规模");
    }
    caseSizes.add(runCase.size);
  }
  return Object.freeze(sizes);
}

interface TraceCounts {
  readonly executedNodeCount: number;
  readonly operationCount: number;
}

function realPathSummary(
  options: RuntimeWorkspaceControllerOptions,
  runCase: ScenarioRunCase,
  projected: TraceFlowProjectionResult,
  evidence: TraceRunEvidence | null,
  targetBranchId: string | null,
): RealExecutionPathSummary {
  const counts = requireTraceCounts(evidence);
  const projection = requireCurrentProjection(options, options.getSource());
  const nodeVisits = Object.entries(projected.nodeVisitCounts).flatMap(([flowNodeId, count]) => {
    const node = projection.nodes.find((candidate) => candidate.id === flowNodeId);
    return node?.sourceNodeId === null || node?.sourceNodeId === undefined
      ? []
      : [
          Object.freeze({
            nodeId: node.sourceNodeId,
            range: node.range,
            count,
          }),
        ];
  });
  return Object.freeze({
    mode: "real" as const,
    sourceFingerprint: projection.sourceFingerprint,
    scenario: Object.freeze({ id: runCase.scenarioId, version: runCase.scenarioVersion }),
    nodeVisits: Object.freeze(nodeVisits),
    durationMs: evidence?.durationMs ?? 0,
    operationCount: counts.operationCount,
    edgeIds: Object.freeze([...projected.path.edgeIds]),
    targetBranchId,
  });
}

function requireTraceCounts(evidence: TraceRunEvidence | null): TraceCounts {
  if (
    evidence === null ||
    !Number.isSafeInteger(evidence.executedNodeCount) ||
    evidence.executedNodeCount < 0 ||
    !Number.isSafeInteger(evidence.operationCount) ||
    evidence.operationCount < 0
  ) {
    throw new Error("真实 Trace 缺少可信的节点或操作计数");
  }
  return Object.freeze({
    executedNodeCount: evidence.executedNodeCount,
    operationCount: evidence.operationCount,
  });
}

function sourceSnapshot(options: RuntimeWorkspaceControllerOptions): SourceSnapshot {
  const source = options.getSource();
  return Object.freeze({ source, fingerprint: fingerprintSource(source) });
}

function manualTraceRunCase(value: ManualRunInputValue): ScenarioRunCase {
  return Object.freeze({
    scenarioId: MANUAL_TRACE_SCENARIO_ID,
    scenarioVersion: MANUAL_TRACE_SCENARIO_VERSION,
    size: 1,
    stdin: value.stdin,
    arguments: Object.freeze([...value.arguments]),
    expected: Object.freeze({ stdout: "", explanation: "当前源码的手动输入观察轨迹" }),
  });
}

function manualScenario(value: ManualRunInputValue): ManualRunScenario {
  return Object.freeze({
    id: MANUAL_TRACE_SCENARIO_ID,
    version: MANUAL_TRACE_SCENARIO_VERSION,
    mode: "real",
    stdin: value.stdin,
    arguments: Object.freeze([...value.arguments]),
    inputSize: null,
  });
}

function completion(
  source: SourceSnapshot,
  compileResult: CompileResult,
  runResult: RunResult | null,
  capabilities: Capabilities,
  scenario: ManualRunScenario,
): RunPanelCompletion {
  return Object.freeze({
    source: source.source,
    sourceFingerprint: source.fingerprint,
    compileResult,
    runResult,
    capabilities,
    scenario,
  });
}

function toManualScenario(runCase: ScenarioRunCase, mode: "real"): ManualRunScenario {
  return Object.freeze({
    id: runCase.scenarioId,
    version: runCase.scenarioVersion,
    mode,
    stdin: runCase.stdin,
    arguments: Object.freeze([...runCase.arguments]),
    inputSize: runCase.size,
  });
}

function assertExpectedOutput(runCase: ScenarioRunCase, result: RunResult | null): void {
  if (result === null || !result.ok) throw new Error("案例没有成功的真实运行结果");
  const actual = decodeRunStdout(result);
  if (actual !== runCase.expected.stdout) {
    throw new Error("真实输出与案例期望不一致；未写入该情景的性能历史");
  }
}

function decodeRunStdout(result: RunResult): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(result.stdout);
}

function observedBranchKinds(
  projection: FlowProjection,
  edgeIds: readonly string[],
): readonly RuntimeObservedBranchKind[] {
  const edgeById = new Map(projection.edges.map((edge) => [edge.id, edge]));
  return Object.freeze([
    ...new Set(
      edgeIds.flatMap((id) => {
        const kind = edgeById.get(id)?.kind;
        return kind !== undefined && isObservedBranchKind(kind) ? [kind] : [];
      }),
    ),
  ]);
}

function isObservedBranchKind(kind: FlowEdge["kind"]): kind is RuntimeObservedBranchKind {
  return BRANCH_KINDS.has(kind);
}

function assertRunCase(runCase: ScenarioRunCase): void {
  if (runCase.stdin.includes("\0") || runCase.arguments.some((value) => value.includes("\0"))) {
    throw new TypeError("案例输入不得包含 NUL");
  }
}

function requireCurrentProjection(
  options: RuntimeWorkspaceControllerOptions,
  source: string,
): FlowProjection {
  const projection = options.getProjection();
  const fingerprint = fingerprintSource(source);
  if (
    projection === null ||
    projection.sourceFingerprint !== fingerprint ||
    projection.sourceLength !== source.length
  ) {
    throw new Error("当前流程投影缺失或与源码指纹不一致");
  }
  return projection;
}

function currentProjectionOrNull(
  options: RuntimeWorkspaceControllerOptions,
): FlowProjection | null {
  try {
    return requireCurrentProjection(options, options.getSource());
  } catch {
    return null;
  }
}

function branchTargets(
  projection: FlowProjection,
  runCase: ScenarioRunCase,
  observations: readonly BranchObservation[],
): readonly ScenarioBranchTarget[] {
  const observed = new Set(
    observations
      .filter(
        (item) =>
          item.sourceFingerprint === projection.sourceFingerprint &&
          item.scenarioId === runCase.scenarioId &&
          item.scenarioVersion === runCase.scenarioVersion &&
          item.size === runCase.size,
      )
      .flatMap((item) => item.edgeIds),
  );
  const nodes = new Map(projection.nodes.map((node) => [node.id, node]));
  return Object.freeze(
    projection.edges
      .filter((edge) => BRANCH_KINDS.has(edge.kind))
      .map((edge) => {
        const from = nodes.get(edge.from.nodeId);
        const to = nodes.get(edge.to.nodeId);
        const structuralReachable = from?.reachable === true && to?.reachable === true;
        return Object.freeze({
          id: edge.id,
          label: `${from?.label ?? "?"} · ${branchLabel(edge)} → ${to?.label ?? "?"}`,
          structuralReachable,
          validCase: structuralReachable && observed.has(edge.id),
          explanation: structuralReachable
            ? observed.has(edge.id)
              ? "该案例输入的真实 Trace 已经过此分支"
              : "该 scenario + size 尚未由真实 Trace 观察到此分支"
            : "流程结构不可达",
        });
      }),
  );
}

function branchLabel(edge: FlowEdge): string {
  if (edge.kind === "branch-true") return "true";
  if (edge.kind === "branch-false") return "false";
  if (edge.kind === "switch-case") return `case ${String(edge.slot + 1)}`;
  if (edge.kind === "switch-default") return "default";
  return "switch miss";
}

function structuralSimulationPath(
  projection: FlowProjection,
  targetEdgeId: string | null,
): FlowCanvasActivePath {
  const fn = projection.functions.find((item) => item.name === "main") ?? projection.functions[0];
  if (fn === undefined) return emptyPath("simulation");
  const target =
    targetEdgeId === null
      ? null
      : (projection.edges.find((edge) => edge.id === targetEdgeId) ?? null);
  const destination = target?.from.nodeId ?? fn.exitNodeId;
  const prefix = shortestPath(projection.edges, fn.entryNodeId, destination);
  if (prefix === null) return emptyPath("simulation");
  const nodeIds = [...prefix.nodeIds];
  const edgeIds = [...prefix.edgeIds];
  if (target !== null) {
    edgeIds.push(target.id);
    if (nodeIds.at(-1) !== target.to.nodeId) nodeIds.push(target.to.nodeId);
  }
  return Object.freeze({
    nodeIds: Object.freeze(nodeIds),
    edgeIds: Object.freeze(edgeIds),
    currentNodeId: nodeIds.at(-1) ?? null,
    mode: "simulation",
  });
}

function shortestPath(
  edges: readonly FlowEdge[],
  start: string,
  destination: string,
): { readonly nodeIds: readonly string[]; readonly edgeIds: readonly string[] } | null {
  const queue: Array<{ nodeIds: string[]; edgeIds: string[] }> = [
    { nodeIds: [start], edgeIds: [] },
  ];
  const visited = new Set([start]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const nodeId = current.nodeIds.at(-1)!;
    if (nodeId === destination) return current;
    for (const edge of edges.filter((candidate) => candidate.from.nodeId === nodeId)) {
      if (visited.has(edge.to.nodeId)) continue;
      visited.add(edge.to.nodeId);
      queue.push({
        nodeIds: [...current.nodeIds, edge.to.nodeId],
        edgeIds: [...current.edgeIds, edge.id],
      });
    }
  }
  return null;
}

function scenarioDocument(
  sourceFingerprint: string,
  scenario: ScenarioWorkbenchController,
  observations: readonly BranchObservation[],
  customCatalog: ScenarioCatalogDocument,
  manualInput: ManualRunInputValue,
  manualInputBindingFingerprint: string | null,
): ScenarioSidecarDocument {
  const snapshot = scenario.getSnapshot();
  return Object.freeze({
    schemaVersion: SCENARIO_SIDECAR_VERSION,
    sourceFingerprint,
    selection: scenario.hasScenarioBinding()
      ? Object.freeze({
          scenarioId: snapshot.scenarioId,
          size: snapshot.size,
          targetBranchId: snapshot.targetBranch?.id ?? null,
        })
      : null,
    activeCase: snapshot.runCase,
    definitions: Object.freeze(
      scenario.provider.list().map((definition) =>
        Object.freeze({
          id: definition.id,
          version: definition.version,
          family: definition.family,
          label: definition.label,
          description: definition.description,
          example: definition.example,
          sizeGenerator: definition.sizeGenerator,
        }),
      ),
    ),
    observations: Object.freeze([...observations]),
    customCatalog,
    manualInput: manualInputSnapshot(sourceFingerprint, manualInput, manualInputBindingFingerprint),
  });
}

function parseScenarioSidecar(
  serialized: string,
  expectedFingerprint: string,
): ScenarioSidecarDocument | null {
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.schemaVersion !== SCENARIO_SIDECAR_VERSION) return null;
    if (
      value.sourceFingerprint !== expectedFingerprint ||
      !Array.isArray(value.observations) ||
      !Array.isArray(value.definitions)
    ) {
      return null;
    }
    const observations = value.observations.slice(-OBSERVATION_LIMIT).map(parseObservation);
    if (observations.some((item) => item === null)) return null;
    const selection = parseSelection(value.selection);
    if (value.selection !== null && selection === null) return null;
    const activeCase = parseScenarioRunCase(value.activeCase);
    const definitions = value.definitions.map(parseDefinitionSnapshot);
    const customCatalog = readScenarioCatalogExtension(value, expectedFingerprint);
    const manualInput = parseManualInputSnapshot(value.manualInput, expectedFingerprint);
    if (activeCase === null || definitions.some((item) => item === null)) return null;
    return Object.freeze({
      schemaVersion: SCENARIO_SIDECAR_VERSION,
      sourceFingerprint: expectedFingerprint,
      selection,
      activeCase,
      definitions: Object.freeze(definitions as ScenarioDefinitionSnapshot[]),
      observations: Object.freeze(observations as BranchObservation[]),
      customCatalog,
      manualInput,
    });
  } catch {
    return null;
  }
}

function parseDefinitionSnapshot(value: unknown): ScenarioDefinitionSnapshot | null {
  if (!isRecord(value) || !isRecord(value.sizeGenerator)) return null;
  const example = parseScenarioRunCase(value.example);
  const generator = value.sizeGenerator;
  if (
    example === null ||
    typeof value.id !== "string" ||
    typeof value.version !== "string" ||
    typeof value.family !== "string" ||
    typeof value.label !== "string" ||
    typeof value.description !== "string" ||
    !Number.isSafeInteger(generator.minimum) ||
    !Number.isSafeInteger(generator.maximum) ||
    !Array.isArray(generator.defaultSizes) ||
    generator.defaultSizes.some((size) => !Number.isSafeInteger(size)) ||
    typeof generator.inputModel !== "string"
  )
    return null;
  return Object.freeze({
    id: value.id,
    version: value.version,
    family: value.family,
    label: value.label,
    description: value.description,
    example,
    sizeGenerator: Object.freeze({
      minimum: generator.minimum as number,
      maximum: generator.maximum as number,
      defaultSizes: Object.freeze([...(generator.defaultSizes as number[])]),
      inputModel: generator.inputModel,
    }),
  });
}

function parseScenarioRunCase(value: unknown): ScenarioRunCase | null {
  if (!isRecord(value) || !isRecord(value.expected) || !Array.isArray(value.arguments)) {
    return null;
  }
  if (
    typeof value.scenarioId !== "string" ||
    typeof value.scenarioVersion !== "string" ||
    !Number.isSafeInteger(value.size) ||
    (value.size as number) <= 0 ||
    typeof value.stdin !== "string" ||
    value.arguments.some((item) => typeof item !== "string") ||
    typeof value.expected.stdout !== "string" ||
    typeof value.expected.explanation !== "string"
  )
    return null;
  return Object.freeze({
    scenarioId: value.scenarioId,
    scenarioVersion: value.scenarioVersion,
    size: value.size as number,
    stdin: value.stdin,
    arguments: Object.freeze([...(value.arguments as string[])]),
    expected: Object.freeze({
      stdout: value.expected.stdout,
      explanation: value.expected.explanation,
    }),
  });
}

function parseObservation(value: unknown): BranchObservation | null {
  if (!isRecord(value) || !Array.isArray(value.edgeIds)) return null;
  if (
    typeof value.sourceFingerprint !== "string" ||
    typeof value.scenarioId !== "string" ||
    typeof value.scenarioVersion !== "string" ||
    !Number.isSafeInteger(value.size) ||
    (value.size as number) <= 0 ||
    value.edgeIds.some((id) => typeof id !== "string" || id.length === 0)
  )
    return null;
  return Object.freeze({
    sourceFingerprint: value.sourceFingerprint,
    scenarioId: value.scenarioId,
    scenarioVersion: value.scenarioVersion,
    size: value.size as number,
    edgeIds: Object.freeze([...new Set(value.edgeIds as string[])]),
  });
}

function parseSelection(value: unknown): ScenarioSelectionState | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.scenarioId !== "string" ||
    !Number.isSafeInteger(value.size) ||
    (value.size as number) <= 0 ||
    (value.targetBranchId !== null && typeof value.targetBranchId !== "string")
  )
    return null;
  return Object.freeze({
    scenarioId: value.scenarioId,
    size: value.size as number,
    targetBranchId: value.targetBranchId as string | null,
  });
}

function restoreSelection(
  scenario: ScenarioWorkbenchController,
  selection: ScenarioSelectionState | null,
): void {
  if (selection === null) {
    scenario.clearScenarioBinding();
    return;
  }
  try {
    scenario.selectScenario(selection.scenarioId);
    scenario.setInputSize(selection.size);
  } catch {
    // Invalid or retired scenario selection resets only this view state.
  }
}

function restoreTargetSelection(
  scenario: ScenarioWorkbenchController,
  document: { readonly serialized: string } | null,
  expectedFingerprint: string,
): void {
  const serialized = document?.serialized;
  if (serialized === undefined) return;
  const restored = parseScenarioSidecar(serialized, expectedFingerprint);
  const target = restored?.selection?.targetBranchId;
  if (target === null || target === undefined) return;
  try {
    scenario.selectTargetBranch(target);
  } catch {
    // A stale or no-longer-observed target is deliberately left unselected.
  }
}

function observationKey(value: BranchObservation): string {
  return [
    value.sourceFingerprint,
    value.scenarioId,
    value.scenarioVersion,
    String(value.size),
  ].join("\u0001");
}

function validAnalysis(
  analysis: ProgramAnalysisSnapshot | null,
  source: string,
): ProgramAnalysisSnapshot | null {
  return analysis?.sourceFingerprint === fingerprintSource(source) ? analysis : null;
}

function actionableFindingCount(analysis: ProgramAnalysisSnapshot | null): number {
  return actionableFindings(analysis).length;
}

function actionableFindings(
  analysis: ProgramAnalysisSnapshot | null,
): ProgramAnalysisSnapshot["findings"] {
  return Object.freeze(
    analysis?.findings.filter((finding) => finding.confidence === "certain") ?? [],
  );
}

const MANUAL_INPUT_SIDECAR_MAX_BYTES = 256 * 1024;

function manualInputSnapshot(
  sourceFingerprint: string,
  value: ManualRunInputValue,
  bindingFingerprint: string | null,
): ManualInputSnapshot | null {
  if (bindingFingerprint !== sourceFingerprint || !validManualInput(value)) return null;
  return Object.freeze({
    sourceFingerprint,
    stdin: value.stdin,
    arguments: Object.freeze([...value.arguments]),
  });
}

function parseManualInputSnapshot(
  value: unknown,
  expectedFingerprint: string,
): ManualInputSnapshot | null {
  if (value === undefined || value === null || !isRecord(value)) return null;
  const candidate = {
    stdin: value.stdin,
    arguments: value.arguments,
  };
  if (value.sourceFingerprint !== expectedFingerprint || !validManualInput(candidate)) return null;
  return Object.freeze({
    sourceFingerprint: expectedFingerprint,
    stdin: candidate.stdin as string,
    arguments: Object.freeze([...(candidate.arguments as string[])]),
  });
}

function validManualInput(value: {
  readonly stdin: unknown;
  readonly arguments: unknown;
}): value is ManualRunInputValue {
  if (
    typeof value.stdin !== "string" ||
    value.stdin.includes("\0") ||
    utf8Length(value.stdin) > MANUAL_INPUT_SIDECAR_MAX_BYTES ||
    !Array.isArray(value.arguments) ||
    value.arguments.length > RUNNER_LIMITS.maxArgumentCount ||
    value.arguments.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.includes("\0") ||
        utf8Length(argument) > RUNNER_LIMITS.maxArgumentBytes,
    )
  ) {
    return false;
  }
  return (
    (value.arguments as string[]).reduce((total, argument) => total + utf8Length(argument), 0) <=
    RUNNER_LIMITS.maxTotalArgumentBytes
  );
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function emptyPath(mode: "real" | "simulation"): FlowCanvasActivePath {
  return Object.freeze({
    nodeIds: Object.freeze([]),
    edgeIds: Object.freeze([]),
    currentNodeId: null,
    mode,
  });
}

function isTerminalTraceState(status: TraceControllerState["status"]): boolean {
  return ["completed", "cancelled", "error", "resource", "truncated", "unsupported"].includes(
    status,
  );
}

function createScenarioHosts(
  host: HTMLElement,
  english: boolean,
): {
  readonly runner: HTMLElement;
  readonly catalog: HTMLElement;
  readonly catalogSummary: HTMLElement;
} {
  const document = host.ownerDocument;
  const workspace = document.createElement("div");
  workspace.className = "scenario-workspace";
  const runner = document.createElement("div");
  runner.className = "scenario-workspace__runner";
  const catalogDisclosure = document.createElement("details");
  catalogDisclosure.className = "scenario-workspace__catalog-disclosure";
  const catalogSummary = document.createElement("summary");
  catalogSummary.textContent = scenarioCatalogSummaryLabel(english);
  const catalog = document.createElement("div");
  catalog.className = "scenario-workspace__catalog";
  catalogDisclosure.append(catalogSummary, catalog);
  workspace.append(runner, catalogDisclosure);
  host.replaceChildren(workspace);
  return Object.freeze({ runner, catalog, catalogSummary });
}

export function scenarioCatalogSummaryLabel(english: boolean): string {
  return english ? "Manage Cases" : "管理案例";
}

function accumulateTraceEvents(
  previous: readonly TraceEvent[],
  visible: readonly TraceEvent[],
): readonly TraceEvent[] {
  if (visible.length === 0) return Object.freeze([]);
  const bySequence = new Map(previous.map((event) => [event.sequence, event]));
  for (const event of visible) bySequence.set(event.sequence, event);
  return Object.freeze(
    [...bySequence.values()].sort((left, right) => left.sequence - right.sequence).slice(-10_000),
  );
}

function assertWorkspaceIdentity(entryId: string | null, fingerprint: string | null): void {
  if ((entryId === null) !== (fingerprint === null)) {
    throw new TypeError("工作区 entryId 与源码指纹必须同时存在或同时为空");
  }
  if (entryId !== null && (entryId.length === 0 || fingerprint?.length === 0)) {
    throw new TypeError("工作区身份不得为空文本");
  }
}

function assertOptions(options: RuntimeWorkspaceControllerOptions): void {
  if (
    typeof options.getSource !== "function" ||
    typeof options.getProjection !== "function" ||
    typeof options.onSetActivePath !== "function"
  ) {
    throw new TypeError("RuntimeWorkspaceController 缺少必要回调");
  }
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("RuntimeWorkspaceController 已销毁");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
