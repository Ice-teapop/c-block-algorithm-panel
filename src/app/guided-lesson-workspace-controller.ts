import type { FlowProjection } from "../flow/index.js";
import type { PanelApi } from "../shared/api.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type { WorkspaceEntrySummary } from "../shared/workspace.js";
import {
  FIRST_ALGORITHM_SOURCE_FINGERPRINT,
  FIRST_ALGORITHM_WALKTHROUGH,
  FIRST_GUIDED_LESSON,
  FIRST_MINIMUM_ALGORITHM_FINGERPRINT,
  MAXIMUM_SCENARIO_ID,
  MINIMUM_SCENARIO_ID,
  createFirstAlgorithmSkeleton,
  injectFirstAlgorithmBug,
} from "../tutorials/first-lesson.js";
import {
  createGuidedLessonController,
  deserializeGuidedLessonProgress,
  getGuidedLessonCheckpoint,
  type GuidedLessonController,
  type GuidedLessonProgress,
  type GuidedMissionDefinition,
  type GuidedRequirement,
  type GuidedSourceRequirement,
  type LearningEvidenceBinding,
  type LearningEvidenceEvent,
} from "../tutorials/guided-lesson.js";
import { createFirstRunStart, type FirstRunStart } from "../ui/first-run-start.js";
import {
  createGuidedLessonRail,
  type GuidedLessonHintLevel,
  type GuidedLessonRail,
  type GuidedLessonRailSnapshot,
} from "../ui/guided-lesson-rail.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";
import { createWorkspaceSidecarPersistence } from "./workspace-sidecar-persistence.js";
import type { WorkspaceController } from "./workspace-controller.js";

const FIRST_RUN_STORAGE_KEY = "c-block-algorithm-panel:first-run-v6";
const TUTORIAL_TITLE = "教程 · 扫描求最大值";
const MAXIMUM_CHECKPOINT_ID = "checkpoint.maximum-correct";

export type GuidedSourceChangeReason =
  "editor" | "preset" | "connection" | "lesson-transform" | "reset";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GuidedLessonWorkspaceControllerOptions {
  readonly elements: WorkbenchElements;
  readonly api: Pick<PanelApi, "readWorkspaceSidecar" | "saveWorkspaceSidecar">;
  readonly workspace: Pick<WorkspaceController, "activeEntry" | "createDocument">;
  readonly getSource: () => string;
  readonly getProjection: () => FlowProjection | null;
  readonly applySource: (source: string, reason: "lesson-transform" | "reset") => boolean;
  readonly configureScenario: (scenarioId: string, size: number) => void;
  readonly onError: (error: Error) => void;
  readonly storage?: StorageLike | undefined;
  readonly sidecarDelayMs?: number | undefined;
}

export interface GuidedLessonWorkspaceController {
  readonly hasPendingChanges: boolean;
  readonly active: boolean;
  showFirstRunIfNeeded(): void;
  startLesson(): Promise<void>;
  setWorkspaceEntry(entry: WorkspaceEntrySummary | null): Promise<void>;
  binding(
    sourceFingerprint: string,
    scenarioId?: string | null,
    scenarioVersion?: string | null,
  ): LearningEvidenceBinding | null;
  recordEvidence(event: LearningEvidenceEvent): boolean;
  handleSourceChanged(sourceFingerprint: string, reason: GuidedSourceChangeReason): void;
  verifyCurrentProjection(roundTripLossless: boolean): void;
  flush(): Promise<void>;
  destroy(): void;
}

export function createGuidedLessonWorkspaceController(
  options: GuidedLessonWorkspaceControllerOptions,
): GuidedLessonWorkspaceController {
  assertOptions(options);
  const storage = options.storage ?? browserStorage();
  const persistence = createWorkspaceSidecarPersistence({
    kind: "tutorial-progress",
    read: (entryId, kind) => options.api.readWorkspaceSidecar({ entryId, kind }),
    save: (request) => options.api.saveWorkspaceSidecar(request),
    ...(options.sidecarDelayMs === undefined ? {} : { delayMs: options.sidecarDelayMs }),
  });
  let destroyed = false;
  let creatingTutorial = false;
  let resolveCreatedTutorial: (() => void) | null = null;
  let adoptionGeneration = 0;
  let controller: GuidedLessonController | null = null;
  let firstRun: FirstRunStart | null = null;
  let rail: GuidedLessonRail | null = null;
  let railHost: HTMLElement | null = null;
  let activeEntry: WorkspaceEntrySummary | null = null;
  let hintLevel: GuidedLessonHintLevel = 0;
  let whyExpanded = false;
  let busy = false;
  let status: GuidedLessonRailSnapshot["status"] = Object.freeze({
    state: "idle",
    message: "等待完成当前操作。",
  });
  let configuredStageId: string | null = null;
  let pendingResetFingerprint: string | null = null;
  let highlightedTarget: HTMLElement | null = null;
  let pendingEvidence: LearningEvidenceEvent[] = [];
  const panelVisibility = new Map<HTMLElement, boolean>();

  const persist = (): void => {
    if (controller === null || persistence.activeEntryId === null) return;
    const progress = controller.getProgress();
    persistence.update(controller.serialize(), progress.sourceFingerprint);
  };

  const createController = (progress: GuidedLessonProgress): GuidedLessonController =>
    createGuidedLessonController({
      definition: FIRST_GUIDED_LESSON,
      progress,
      onChange: () => {
        persist();
        render();
      },
    });

  async function startLesson(): Promise<void> {
    assertActive(destroyed);
    if (controller?.getProgress().status === "active" && activeEntry !== null) {
      options.elements.showPage("build");
      mountRail();
      return;
    }
    creatingTutorial = true;
    const ready = new Promise<void>((resolve) => {
      resolveCreatedTutorial = resolve;
    });
    try {
      const created = await options.workspace.createDocument(
        "sandbox",
        TUTORIAL_TITLE,
        FIRST_GUIDED_LESSON.initialSource,
      );
      if (!created) throw new Error("教学沙箱创建失败");
      const entry = options.workspace.activeEntry;
      if (entry === null) throw new Error("教学沙箱创建后没有活动工作区");
      await waitForCreatedTutorial(ready);
      storage?.setItem(FIRST_RUN_STORAGE_KEY, "lesson-started");
      firstRun?.destroy();
      firstRun = null;
      options.elements.showPage("build");
    } finally {
      resolveCreatedTutorial = null;
      creatingTutorial = false;
    }
  }

  async function setWorkspaceEntry(entry: WorkspaceEntrySummary | null): Promise<void> {
    if (destroyed) return;
    const generation = ++adoptionGeneration;
    await persistence.deactivate();
    if (destroyed || generation !== adoptionGeneration) return;
    activeEntry = entry;
    controller = null;
    pendingEvidence = [];
    configuredStageId = null;
    unmountRail();
    if (entry === null) return;

    const sourceFingerprint = fingerprintSource(options.getSource());
    const adoption = await persistence.adopt(entry.id, sourceFingerprint);
    if (destroyed || generation !== adoptionGeneration || activeEntry?.id !== entry.id) return;
    const tutorialOwned =
      entry.kind === "sandbox" && (creatingTutorial || adoption.document !== null);
    if (!tutorialOwned) {
      await persistence.deactivate();
      return;
    }
    const read = deserializeGuidedLessonProgress(
      adoption.document?.serialized,
      FIRST_GUIDED_LESSON,
      Object.freeze({ workspaceId: entry.id, sourceFingerprint }),
    );
    controller = createController(read.progress);
    persist();
    mountRail();
    configureCurrentStage();
    status = Object.freeze({
      state: read.status === "restored" ? "idle" : "working",
      message:
        read.status === "restored"
          ? "已恢复上次课程进度。"
          : "课程进度已按当前源码安全重建；没有覆盖 main.c。",
    });
    render();
    if (options.getProjection()?.sourceFingerprint === sourceFingerprint) {
      verifyCurrentProjection(true);
    }
    resolveCreatedTutorial?.();
  }

  function showFirstRunIfNeeded(): void {
    if (destroyed || firstRun !== null || storage?.getItem(FIRST_RUN_STORAGE_KEY) !== null) return;
    const host = options.elements.getPageHost("dashboard");
    const content = host.querySelector<HTMLElement>(".workspace-dashboard__content") ?? host;
    firstRun = createFirstRunStart(content, {
      onStartLesson: startLesson,
      onContinue: () => {
        storage?.setItem(FIRST_RUN_STORAGE_KEY, "direct");
        firstRun?.destroy();
        firstRun = null;
        options.elements.showPage("build");
      },
    });
  }

  function binding(
    sourceFingerprint: string,
    scenarioId: string | null = null,
    scenarioVersion: string | null = null,
  ): LearningEvidenceBinding | null {
    const progress = controller?.getProgress();
    if (
      progress === undefined ||
      progress.status !== "active" ||
      activeEntry === null ||
      activeEntry.id !== progress.workspaceId
    ) {
      return null;
    }
    return Object.freeze({
      lessonId: FIRST_GUIDED_LESSON.id,
      lessonVersion: FIRST_GUIDED_LESSON.version,
      workspaceId: progress.workspaceId,
      sourceFingerprint,
      scenarioId,
      scenarioVersion,
    });
  }

  function recordEvidence(event: LearningEvidenceEvent): boolean {
    if (destroyed || controller === null) return false;
    const progress = controller.getProgress();
    if (
      event.type !== "source-changed" &&
      event.binding.sourceFingerprint !== progress.sourceFingerprint &&
      event.binding.sourceFingerprint === fingerprintSource(options.getSource())
    ) {
      pendingEvidence.push(event);
      status = Object.freeze({ state: "working", message: "操作已提交，等待新源码投影完成。" });
      render();
      return false;
    }
    const result = controller.recordEvidence(event);
    if (result.status === "accepted") {
      status = Object.freeze({
        state: controller.canAdvance() ? "success" : "working",
        message: controller.canAdvance()
          ? "当前任务已通过；可进入下一任务。"
          : result.stageAdvanced
            ? "阶段验收通过；继续完成下一项。"
            : "已记录一项真实证据。",
      });
      configureCurrentStage();
      render();
      return true;
    }
    if (result.reason !== "duplicate" && result.reason !== "no-requirement-match") {
      status = Object.freeze({ state: "error", message: evidenceRejectionMessage(result.reason) });
      render();
    }
    return false;
  }

  function handleSourceChanged(sourceFingerprint: string, reason: GuidedSourceChangeReason): void {
    const progress = controller?.getProgress();
    if (progress === undefined || progress.status !== "active") return;
    if (progress.sourceFingerprint === sourceFingerprint) return;
    const eventBinding = binding(sourceFingerprint);
    if (eventBinding === null) return;
    const result = controller!.recordEvidence({
      type: "source-changed",
      binding: eventBinding,
      previousSourceFingerprint: progress.sourceFingerprint,
      reason,
    });
    if (result.status !== "accepted") return;
    status = Object.freeze({
      state: "working",
      message: "源码已变化；旧运行与 Trace 证据已失效。",
    });
    const queued = pendingEvidence.filter(
      (event) => event.binding.sourceFingerprint === sourceFingerprint,
    );
    pendingEvidence = [];
    for (const event of queued) recordEvidence(event);
    if (pendingResetFingerprint === sourceFingerprint) {
      pendingResetFingerprint = null;
      controller!.resetCurrentMission(sourceFingerprint);
      status = Object.freeze({ state: "idle", message: "已恢复当前任务检查点，等待重新验收。" });
    }
    render();
  }

  function verifyCurrentProjection(roundTripLossless: boolean): void {
    const progress = controller?.getProgress();
    const projection = options.getProjection();
    if (
      progress === undefined ||
      projection === null ||
      projection.sourceFingerprint !== progress.sourceFingerprint
    ) {
      return;
    }
    const cfgComplete =
      !projection.documentHasError &&
      projection.functions.length > 0 &&
      projection.functions.every((item) => !item.partial);
    const eventBinding = binding(projection.sourceFingerprint);
    if (eventBinding === null) return;
    recordEvidence({
      type: "projection-ready",
      binding: eventBinding,
      completeness: cfgComplete ? "complete" : projection.documentHasError ? "raw" : "partial",
      roundTripLossless,
    });
    const requirement = currentStageRequirements(progress).find(
      (item): item is GuidedSourceRequirement =>
        item.kind === "source-verified" &&
        (item.expectedSourceFingerprint === null ||
          item.expectedSourceFingerprint === projection.sourceFingerprint),
    );
    if (requirement === undefined) return;
    const semanticMinimum =
      requirement.profile === "minimum-complete" &&
      isSinglePassMinimumSource(options.getSource(), projection);
    if (requirement.profile === "minimum-complete" && !semanticMinimum) return;
    recordEvidence({
      type: "source-verified",
      binding: eventBinding,
      profile: requirement.profile,
      exactDiff: requirement.exactDiff,
      reparsed: !projection.documentHasError,
      roundTripLossless,
      cfgComplete,
      linearScan:
        semanticMinimum ||
        projection.sourceFingerprint === FIRST_ALGORITHM_SOURCE_FINGERPRINT ||
        projection.sourceFingerprint === FIRST_MINIMUM_ALGORITHM_FINGERPRINT,
    });
  }

  function mountRail(): void {
    const progress = controller?.getProgress();
    if (progress === undefined || progress.status === "exited") return;
    if (railHost === null) {
      const document = options.elements.leftPane.ownerDocument;
      railHost = document.createElement("section");
      railHost.className = "guided-lesson-host";
      railHost.setAttribute("aria-label", "课程任务轨");
      options.elements.leftPane.append(railHost);
      for (const selector of ["#presets-pane", "#outline-pane"]) {
        const panel = options.elements.leftPane.querySelector<HTMLElement>(selector);
        if (panel !== null && !panelVisibility.has(panel)) {
          panelVisibility.set(panel, panel.hidden === true);
        }
      }
    }
    if (rail === null) {
      rail = createGuidedLessonRail(railHost, railSnapshot(), {
        onLocate: locateCurrentTarget,
        onToggleWhy: () => {
          whyExpanded = !whyExpanded;
          render();
        },
        onNextHint: () => {
          hintLevel = Math.min(3, hintLevel + 1) as GuidedLessonHintLevel;
          render();
        },
        onReset: resetCurrentMission,
        onExit: exitLesson,
        onNext: nextMission,
        onPrepareSkeleton: prepareSkeleton,
        onInjectBug: injectBug,
      });
    }
    updateLeftPanels();
    render();
  }

  function unmountRail(): void {
    clearTargetHighlight();
    rail?.destroy();
    rail = null;
    railHost?.remove();
    railHost = null;
    for (const [panel, wasHidden] of panelVisibility) panel.hidden = wasHidden;
    panelVisibility.clear();
  }

  function updateLeftPanels(): void {
    const progress = controller?.getProgress();
    const showPresets =
      progress?.status === "active" &&
      progress.currentMissionId === "mission.complete" &&
      progress.currentStageId === "mission.complete.assemble";
    const presets = options.elements.leftPane.querySelector<HTMLElement>("#presets-pane");
    const outline = options.elements.leftPane.querySelector<HTMLElement>("#outline-pane");
    if (presets !== null) presets.hidden = !showPresets;
    if (outline !== null) outline.hidden = true;
    options.elements.leftPane.classList.toggle("is-guided-lesson", rail !== null);
    options.elements.leftPane.classList.toggle("is-guided-lesson-with-presets", showPresets);
  }

  function railSnapshot(): GuidedLessonRailSnapshot {
    const progress = controller?.getProgress();
    if (progress === undefined) throw new Error("课程任务轨没有活动进度");
    const missionIndex = Math.max(
      0,
      FIRST_GUIDED_LESSON.missions.findIndex((item) => item.id === progress.currentMissionId),
    );
    const mission = FIRST_GUIDED_LESSON.missions[missionIndex]!;
    const stage = mission.stages.find((item) => item.id === progress.currentStageId)!;
    const satisfied = new Set(progress.satisfiedRequirements.map((item) => item.requirementId));
    const completed = progress.status === "completed";
    return Object.freeze({
      lessonLabel: `第一课 · ${String(missionIndex + 1)}/${String(FIRST_GUIDED_LESSON.missions.length)}`,
      missionIndex: missionIndex + 1,
      missionCount: FIRST_GUIDED_LESSON.missions.length,
      title: completed ? "第一课完成" : stage.title,
      instruction: completed
        ? "你已完成搭建、Trace、调试与最小值迁移。下一课：最小值首次下标。"
        : stage.instruction,
      requirements: completed
        ? Object.freeze([])
        : Object.freeze(
            stage.requirements.map((item) =>
              Object.freeze({
                label: item.label,
                status: satisfied.has(item.id) ? ("passed" as const) : ("pending" as const),
              }),
            ),
          ),
      canAdvance: !completed && controller?.canAdvance() === true,
      expandedWhy: whyExpanded,
      hintLevel,
      predictionRows:
        mission.id === "mission.observe"
          ? Object.freeze(
              FIRST_ALGORITHM_WALKTHROUGH.map((row) =>
                Object.freeze({
                  iteration: String(row.inputIndex),
                  input: String(row.value),
                  comparison: row.comparison ?? "初始化",
                  maximum: String(row.maximumAfter),
                }),
              ),
            )
          : Object.freeze([]),
      busy,
      status: completed
        ? Object.freeze({ state: "success" as const, message: "5 个任务已全部通过真实证据验收。" })
        : status,
      why: mission.why,
      hints: mission.hints,
      showPrepareSkeleton:
        mission.id === "mission.complete" &&
        stage.id === "mission.complete.skeleton" &&
        progress.sourceFingerprint === FIRST_ALGORITHM_SOURCE_FINGERPRINT,
      showInjectBug:
        mission.id === "mission.debug" &&
        stage.id === "mission.debug.reproduce" &&
        progress.sourceFingerprint === FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    });
  }

  function render(): void {
    if (destroyed || controller === null || rail === null) return;
    updateLeftPanels();
    rail.update(railSnapshot());
  }

  function configureCurrentStage(): void {
    const progress = controller?.getProgress();
    if (progress === undefined || progress.status !== "active") return;
    if (configuredStageId === progress.currentStageId) return;
    configuredStageId = progress.currentStageId;
    hintLevel = 0;
    whyExpanded = false;
    if (progress.currentMissionId === "mission.migrate") {
      options.configureScenario(MINIMUM_SCENARIO_ID, 5);
    } else if (progress.currentMissionId === "mission.debug") {
      options.configureScenario(MAXIMUM_SCENARIO_ID, 4);
    } else {
      options.configureScenario(MAXIMUM_SCENARIO_ID, 5);
    }
  }

  function locateCurrentTarget(): void {
    const progress = controller?.getProgress();
    if (progress === undefined) return;
    const mission = currentMission(progress);
    options.elements.showPage("build");
    clearTargetHighlight();
    let target: HTMLElement;
    if (mission.locateTargetId === "run-panel") {
      options.elements.focusPanel("runtime");
      target = options.elements.scenarioHost;
    } else if (mission.locateTargetId === "trace-panel") {
      options.elements.focusPanel("runtime");
      target = options.elements.traceHost;
    } else if (mission.locateTargetId === "code-pane") {
      options.elements.focusPanel("code");
      target = options.elements.codePane;
    } else {
      if (progress.currentMissionId === "mission.complete") {
        options.elements.focusPanel("presets");
        const EventConstructor = options.elements.shell.ownerDocument.defaultView?.CustomEvent;
        if (EventConstructor !== undefined) {
          options.elements.shell.dispatchEvent(
            new EventConstructor("workbench-action", {
              detail: Object.freeze({ rootId: "presets", branchId: "algorithm-patterns" }),
            }),
          );
        }
      } else {
        options.elements.focusPanel("canvas");
      }
      const slotNode = options
        .getProjection()
        ?.nodes.find((node) => node.sourceText.trim() === ";" && !node.locked);
      const slotElement = [
        ...options.elements.flowCanvas.querySelectorAll<HTMLElement>("[data-flow-node-id]"),
      ].find((element) => element.dataset.flowNodeId === slotNode?.id);
      target = slotElement ?? options.elements.flowCanvas;
    }
    target.classList.add("guided-lesson-target");
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    target.focus({ preventScroll: true });
    highlightedTarget = target;
  }

  function clearTargetHighlight(): void {
    highlightedTarget?.classList.remove("guided-lesson-target");
    highlightedTarget = null;
  }

  function prepareSkeleton(): void {
    runTransform(() => {
      const progress = requireActiveProgress();
      saveMaximumCheckpoint(progress);
      return createFirstAlgorithmSkeleton(options.getSource(), progress.sourceFingerprint);
    }, "lesson-transform");
  }

  function injectBug(): void {
    runTransform(() => {
      const progress = requireActiveProgress();
      saveMaximumCheckpoint(progress);
      return injectFirstAlgorithmBug(options.getSource(), progress.sourceFingerprint);
    }, "lesson-transform");
  }

  function runTransform(
    transform: () => ReturnType<typeof createFirstAlgorithmSkeleton>,
    reason: "lesson-transform" | "reset",
  ): void {
    if (busy) return;
    busy = true;
    render();
    try {
      const result = transform();
      if (!result.ok) throw new Error(`课程源码与预期不一致：${result.reason}`);
      if (!options.applySource(result.source, reason)) throw new Error("课程源码没有发生预期变化");
      status = Object.freeze({
        state: "working",
        message: "源码已切换，正在等待重解析与 CFG 验证。",
      });
    } catch (error: unknown) {
      if (reason === "reset") pendingResetFingerprint = null;
      const problem = error instanceof Error ? error : new Error(String(error));
      status = Object.freeze({ state: "error", message: problem.message });
      options.onError(problem);
    } finally {
      busy = false;
      render();
    }
  }

  function saveMaximumCheckpoint(progress: GuidedLessonProgress): void {
    if (getGuidedLessonCheckpoint(progress, MAXIMUM_CHECKPOINT_ID) !== null) return;
    if (progress.sourceFingerprint !== FIRST_ALGORITHM_SOURCE_FINGERPRINT) {
      throw new Error("当前源码不是可保存的正确最大值版本");
    }
    controller!.saveCheckpoint({
      id: MAXIMUM_CHECKPOINT_ID,
      label: "正确最大值版本",
      source: options.getSource(),
      sourceFingerprint: progress.sourceFingerprint,
    });
  }

  function resetCurrentMission(): void {
    const progress = requireActiveProgress();
    const checkpoint = getGuidedLessonCheckpoint(progress, MAXIMUM_CHECKPOINT_ID);
    const source = checkpoint?.source ?? FIRST_GUIDED_LESSON.initialSource;
    const nextFingerprint = fingerprintSource(source);
    if (options.getSource() === source) {
      controller!.resetCurrentMission(nextFingerprint);
      status = Object.freeze({ state: "idle", message: "当前任务证据已重置；源码保持不变。" });
      render();
      return;
    }
    pendingResetFingerprint = nextFingerprint;
    runTransform(
      () =>
        Object.freeze({
          ok: true as const,
          source,
          previousFingerprint: progress.sourceFingerprint,
          sourceFingerprint: nextFingerprint,
        }),
      "reset",
    );
  }

  function nextMission(): void {
    if (controller === null || !controller.canAdvance()) return;
    controller.next();
    status = Object.freeze({ state: "idle", message: "已进入下一任务。" });
    configureCurrentStage();
    render();
  }

  function exitLesson(): void {
    if (controller === null) return;
    controller.exit();
    persist();
    unmountRail();
    options.elements.showPage("dashboard");
  }

  function requireActiveProgress(): GuidedLessonProgress {
    const progress = controller?.getProgress();
    if (progress === undefined || progress.status !== "active" || activeEntry === null) {
      throw new Error("当前没有活动课程沙箱");
    }
    return progress;
  }

  return Object.freeze({
    get hasPendingChanges(): boolean {
      return persistence.hasPendingChanges;
    },
    get active(): boolean {
      return controller?.getProgress().status === "active";
    },
    showFirstRunIfNeeded,
    startLesson,
    setWorkspaceEntry,
    binding,
    recordEvidence,
    handleSourceChanged,
    verifyCurrentProjection,
    flush: () => persistence.flush(),
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      adoptionGeneration += 1;
      firstRun?.destroy();
      firstRun = null;
      unmountRail();
      controller = null;
      pendingEvidence = [];
      persistence.destroy();
    },
  });
}

function currentMission(progress: GuidedLessonProgress): GuidedMissionDefinition {
  const mission = FIRST_GUIDED_LESSON.missions.find(
    (candidate) => candidate.id === progress.currentMissionId,
  );
  if (mission === undefined) throw new Error("课程进度指向未知任务");
  return mission;
}

function currentStageRequirements(progress: GuidedLessonProgress): readonly GuidedRequirement[] {
  const stage = currentMission(progress).stages.find(
    (candidate) => candidate.id === progress.currentStageId,
  );
  if (stage === undefined) throw new Error("课程进度指向未知阶段");
  return stage.requirements;
}

function evidenceRejectionMessage(reason: string): string {
  if (reason === "source-mismatch") return "证据来自旧源码版本，已拒绝。";
  if (reason === "workspace-mismatch") return "证据来自其他工作区，已拒绝。";
  if (reason === "scenario-binding-invalid") return "案例或版本绑定不完整，已拒绝。";
  return "当前证据未通过课程安全校验。";
}

export function isSinglePassMinimumSource(source: string, projection: FlowProjection): boolean {
  const loops = projection.nodes.filter((node) => node.kind === "loop" && !node.locked);
  if (loops.length !== 1 || projection.functions.some((item) => item.partial)) return false;
  return /if\s*\(\s*([A-Za-z_]\w*)\s*<\s*([A-Za-z_]\w*)\s*\)\s*\{\s*\2\s*=\s*\1\s*;\s*\}/u.test(
    source,
  );
}

function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function assertOptions(options: GuidedLessonWorkspaceControllerOptions): void {
  if (
    typeof options.api?.readWorkspaceSidecar !== "function" ||
    typeof options.api.saveWorkspaceSidecar !== "function" ||
    typeof options.workspace?.createDocument !== "function" ||
    typeof options.getSource !== "function" ||
    typeof options.getProjection !== "function" ||
    typeof options.applySource !== "function" ||
    typeof options.configureScenario !== "function" ||
    typeof options.onError !== "function"
  ) {
    throw new TypeError("GuidedLessonWorkspaceController options 无效");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("GuidedLessonWorkspaceController 已销毁");
}

async function waitForCreatedTutorial(ready: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("教学沙箱初始化超时")), 10_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
