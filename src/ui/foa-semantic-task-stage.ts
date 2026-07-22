import type {
  FoaLessonDefinition,
  FoaLocale,
  FoaSemanticEvent,
} from "../tutorials/foa-contracts.js";
import type {
  FoaLocalEvidenceType,
  FoaTaskLesson,
  FoaTaskLessonOptions,
  FoaTaskLessonPhase,
} from "./foa-task-lesson-contracts.js";
import {
  createTaskLessonMotionController,
  readableTaskLessonSemanticDuration,
  type TaskLessonMotionController,
  type TaskLessonMotionKind,
} from "./task-lesson-motion.js";
import { createTeachingSourceView, type TeachingSourceView } from "./teaching-source-view.js";
import { buildFoaSourceBlockDescriptors } from "./foa-source-block-descriptors.js";
import {
  createFoaDataFlowDemo,
  type FoaDataFlowDemoController,
  type FoaDataFlowFrameChange,
} from "./foa-data-flow-demo.js";
import { getFoaSceneProfile } from "../tutorials/foa-scene-profiles.js";
import {
  defaultFoaInteractiveRun,
  getFoaInteractiveInputDefinition,
  type FoaInteractiveRun,
} from "../tutorials/foa-interactive-inputs.js";
import type { FoaSemanticSceneController } from "./foa-semantic-scene.js";
import { createFoaRuntimeScene } from "./foa-runtime-scene.js";
import { createFoaSpecializedSemanticScene } from "./foa-specialized-semantic-scene.js";
import {
  createFoaInteractiveInputDialog,
  type FoaInteractiveInputDialogController,
} from "./foa-interactive-input-dialog.js";

interface SemanticStageCopy {
  readonly lesson: string;
  readonly start: string;
  readonly reset: string;
  readonly repeat: string;
  readonly viewSummary: string;
  readonly slotEmpty: string;
  readonly undo: string;
  readonly previous: string;
  readonly play: string;
  readonly pause: string;
  readonly next: string;
  readonly timeline: string;
  readonly source: string;
  readonly showFullSource: string;
  readonly showTaskSource: string;
  readonly hiddenSetup: (count: number) => string;
  readonly resizeCode: string;
  readonly expected: string;
  readonly goal: string;
  readonly action: string;
  readonly result: string;
  readonly noResult: string;
  readonly actionInstruction: string;
  readonly availableEvents: string;
  readonly executionArea: string;
  readonly confirmedResults: string;
  readonly previewing: string;
  readonly returnToCurrent: string;
  readonly previewStatus: string;
  readonly ready: string;
  readonly correct: string;
  readonly incorrect: string;
  readonly complete: string;
  readonly input: string;
  readonly output: string;
  readonly complexity: string;
  readonly knowledge: string;
  readonly backToIntro: string;
  readonly currentStep: string;
  readonly completedStep: string;
  readonly pendingStep: string;
  readonly previewStep: string;
  stepLabel(index: number, total: number, label: string): string;
}

const REDUCED_MOTION_RUN_STATE_HOLD_MS = 160;

const COPY: Readonly<Record<FoaLocale, SemanticStageCopy>> = Object.freeze({
  zh: {
    lesson: "课程",
    start: "开始任务",
    reset: "重置",
    repeat: "再来一遍",
    viewSummary: "查看总结",
    slotEmpty: "下一步",
    undo: "撤销",
    previous: "上一步",
    play: "播放",
    pause: "暂停",
    next: "下一步",
    timeline: "预览时间线",
    source: "当前步骤对应的 C 代码",
    showFullSource: "展开完整源码",
    showTaskSource: "只看任务代码",
    hiddenSetup: (count) => `已收起 ${String(count)} 行环境准备代码`,
    resizeCode: "拖动以调整代码区高度",
    expected: "当前应执行",
    goal: "目标",
    action: "操作",
    result: "结果",
    noResult: "尚未执行",
    actionInstruction: "单击高亮步骤，或把它拖入执行区。",
    availableEvents: "可执行步骤",
    executionArea: "执行这一步",
    confirmedResults: "已确认",
    previewing: "你正在查看其他步骤；这里不会改变任务进度。",
    returnToCurrent: "回到当前任务",
    previewStatus: "预览位置",
    ready: "选择当前事件并送入执行槽。",
    correct: "正确，已进入下一事件。",
    incorrect: "未推进：该事件不符合当前关系。",
    complete: "任务完成：全部语义事件均由你的操作确认。",
    input: "stdin",
    output: "期望 stdout",
    complexity: "复杂度模型",
    knowledge: "关联知识",
    backToIntro: "返回介绍",
    currentStep: "当前",
    completedStep: "已完成",
    pendingStep: "待处理",
    previewStep: "预览中",
    stepLabel: (index, total, label) => `步骤 ${String(index)}/${String(total)}：${label}`,
  },
  en: {
    lesson: "Lesson",
    start: "Start task",
    reset: "Reset",
    repeat: "Try again",
    viewSummary: "View summary",
    slotEmpty: "Next step",
    undo: "Undo",
    previous: "Previous",
    play: "Play",
    pause: "Pause",
    next: "Next",
    timeline: "Preview timeline",
    source: "C code for the selected step",
    showFullSource: "Show full source",
    showTaskSource: "Show task code only",
    hiddenSetup: (count) => `${String(count)} setup lines hidden`,
    resizeCode: "Drag to resize the code area",
    expected: "Expected now",
    goal: "Goal",
    action: "Action",
    result: "Result",
    noResult: "Not run yet",
    actionInstruction: "Click the highlighted step, or drag it into the execution area.",
    availableEvents: "Available steps",
    executionArea: "Run this step",
    confirmedResults: "Confirmed",
    previewing: "You are inspecting another step; this does not change task progress.",
    returnToCurrent: "Return to current task",
    previewStatus: "Previewing",
    ready: "Choose the current event and send it to the execution slot.",
    correct: "Correct. The next event is now active.",
    incorrect: "No progress: that event does not satisfy the current relation.",
    complete: "Task complete: every semantic event was confirmed by your actions.",
    input: "stdin",
    output: "Expected stdout",
    complexity: "Complexity model",
    knowledge: "Related knowledge",
    backToIntro: "Back to introduction",
    currentStep: "Current",
    completedStep: "Done",
    pendingStep: "Pending",
    previewStep: "Preview",
    stepLabel: (index, total, label) => `Step ${String(index)} of ${String(total)}: ${label}`,
  },
});

const INTERACTIVE_EVENT_COPY: Readonly<
  Record<FoaLocale, Readonly<Record<FoaSemanticEvent["type"], string>>>
> = Object.freeze({
  zh: Object.freeze({
    read: "读取当前输入",
    bind: "绑定当前值",
    compare: "比较当前值",
    branch: "选择当前分支",
    iterate: "执行下一轮",
    call: "调用当前函数",
    return: "返回当前结果",
    write: "输出当前结果",
    allocate: "申请所需内存",
    release: "释放已用内存",
    measure: "记录运行证据",
  }),
  en: Object.freeze({
    read: "Read the current input",
    bind: "Bind the current value",
    compare: "Compare the current value",
    branch: "Choose the current branch",
    iterate: "Execute the next iteration",
    call: "Call the current function",
    return: "Return the current result",
    write: "Output the current result",
    allocate: "Allocate the required memory",
    release: "Release the allocated memory",
    measure: "Record runtime evidence",
  }),
});

interface SemanticStageElements {
  readonly root: HTMLElement;
  readonly intro: HTMLElement;
  readonly task: HTMLElement;
  readonly completion: HTMLElement;
  readonly introEyebrow: HTMLElement;
  readonly introTitle: HTMLElement;
  readonly introSummary: HTMLElement;
  readonly start: HTMLButtonElement;
  readonly identity: HTMLElement;
  readonly primary: HTMLElement;
  readonly goalLabel: HTMLElement;
  readonly goal: HTMLElement;
  readonly goalSource: HTMLElement;
  readonly actionLabel: HTMLElement;
  readonly instruction: HTMLElement;
  readonly resultLabel: HTMLElement;
  readonly result: HTMLElement;
  readonly previewBanner: HTMLElement;
  readonly previewText: HTMLElement;
  readonly returnToCurrent: HTMLButtonElement;
  readonly bankHeading: HTMLElement;
  readonly executionHeading: HTMLElement;
  readonly acceptedHeading: HTMLElement;
  readonly workspace: HTMLElement;
  readonly bank: HTMLElement;
  readonly executionSlot: HTMLElement;
  readonly executionPlaceholder: HTMLElement;
  readonly accepted: HTMLElement;
  readonly undo: HTMLButtonElement;
  readonly feedback: HTMLElement;
  readonly previous: HTMLButtonElement;
  readonly playPause: HTMLButtonElement;
  readonly next: HTMLButtonElement;
  readonly seek: HTMLInputElement;
  readonly rateButtons: ReadonlyMap<number, HTMLButtonElement>;
  readonly timelineItems: readonly HTMLElement[];
  readonly timelineButtons: readonly HTMLButtonElement[];
  readonly timelineStatuses: readonly HTMLElement[];
  readonly completionEyebrow: HTMLElement;
  readonly completionTitle: HTMLElement;
  readonly completionText: HTMLElement;
  readonly completionDetails: HTMLElement;
  readonly repeat: HTMLButtonElement;
  readonly backToIntro: HTMLButtonElement;
  readonly summary: HTMLButtonElement;
  readonly reset: HTMLButtonElement;
  readonly tokenElements: readonly HTMLButtonElement[];
  readonly sourceView: TeachingSourceView;
  readonly sourceSplitter: HTMLElement;
}

/**
 * Stable direct-manipulation stage with one mounted DOM tree and one display cursor. Only
 * validated learner actions advance local progress; workspace mastery remains external.
 */
export function createFoaSemanticTaskStage(
  host: HTMLElement,
  lesson: FoaLessonDefinition,
  options: FoaTaskLessonOptions,
): FoaTaskLesson {
  if (lesson.mode !== "semantic") {
    throw new TypeError("The stable semantic stage only accepts semantic FOA lessons");
  }
  if (lesson.semanticEvents.length === 0) {
    throw new RangeError("A semantic FOA lesson requires at least one event");
  }

  const ownerDocument = host.ownerDocument;
  let locale = options.locale;
  let phase: FoaTaskLessonPhase = "intro";
  let destroyed = false;
  let confirmedCount = 0;
  let displayIndex = 0;
  let interactionMode: "act" | "preview" = "act";
  let lastResultIndex: number | null = null;
  let previousDisplayIndex: number | null = null;
  let feedbackKind: "ready" | "correct" | "incorrect" | "complete" = "ready";
  let playing = false;
  let playbackRate = 1;
  let playbackTimer: ReturnType<typeof setTimeout> | null = null;
  let playbackSegmentStartedAt = 0;
  let playbackSemanticRemaining = 0;
  let playbackSegmentRate = 1;
  let reducedMotion = options.reducedMotion ?? prefersReducedMotion(ownerDocument);
  let motion: TaskLessonMotionController = createMotion();
  let evidenceEmitted = false;
  let draggedEventId: string | null = null;
  let resizingSource = false;
  let sourcePanelHeight: number | null = null;
  let transitioning = false;
  let transitionEpoch = 0;
  let completionSummaryVisible = false;
  const sourceDescriptors = buildFoaSourceBlockDescriptors(lesson);
  const sourceDescriptorByEventId = new Map(
    sourceDescriptors.map((item) => [item.eventId, item] as const),
  );
  const sourceLineByEventId = new Map(
    sourceDescriptors.map((item) => [item.eventId, item.sourceLine] as const),
  );
  const elements = mountStableStage(ownerDocument, lesson);
  const interactiveInputDefinition = getFoaInteractiveInputDefinition(lesson.order);
  let interactiveRun: FoaInteractiveRun | null =
    interactiveInputDefinition === null
      ? null
      : defaultFoaInteractiveRun(interactiveInputDefinition);
  let flowDemo: FoaDataFlowDemoController | null = null;
  flowDemo = createFoaDataFlowDemo(ownerDocument, lesson, {
    locale,
    reducedMotion,
    onSubmitInput: resetAfterFlowInput,
    onCancelInitialInput: returnToIntro,
    onFrameChange: syncFlowFrame,
    onComplete: completeFlowLesson,
  });
  if (flowDemo !== null) {
    elements.root.dataset.flowDemoKind = flowDemo.kind;
    elements.workspace.append(flowDemo.root);
  }
  let semanticScene: FoaSemanticSceneController | null = null;
  if (flowDemo === null) {
    const profile = getFoaSceneProfile(lesson);
    const sceneOptions = {
      locale,
      reducedMotion,
      onAttempt: (eventId: string) => void attemptEvent(eventId),
      onChangeInput:
        interactiveInputDefinition === null ? undefined : () => interactiveInputDialog?.open(false),
    };
    semanticScene =
      createFoaSpecializedSemanticScene(ownerDocument, lesson, profile, sceneOptions) ??
      createFoaRuntimeScene(ownerDocument, lesson, profile, sceneOptions);
    elements.root.dataset.conceptScene = profile.kind;
    elements.workspace.append(semanticScene.root);
    semanticScene.setRuntimeCase?.(interactiveRun);
  }
  let interactiveInputDialog: FoaInteractiveInputDialogController | null = null;
  if (flowDemo === null && interactiveInputDefinition !== null) {
    interactiveInputDialog = createFoaInteractiveInputDialog(
      ownerDocument,
      interactiveInputDefinition,
      {
        locale,
        onSubmit: applyInteractiveRun,
        onCancelInitial: returnToIntro,
      },
    );
    elements.root.append(interactiveInputDialog.root);
    elements.root.dataset.interactiveInputGroup = interactiveInputDefinition.group;
  }
  const tokensById = new Map(
    lesson.semanticEvents.map(
      (event, index) => [event.id, elements.tokenElements[index]!] as const,
    ),
  );
  host.replaceChildren(elements.root);
  wireInteractions();
  applyLocale();
  layoutTokens(false);
  updateView();
  options.onPhaseChange?.(phase);

  return Object.freeze({
    get phase(): FoaTaskLessonPhase {
      return phase;
    },
    setLocale(nextLocale: FoaLocale): void {
      assertLive();
      locale = nextLocale;
      applyLocale();
      semanticScene?.setLocale(locale);
      interactiveInputDialog?.setLocale(locale);
      updateView();
    },
    setVerifiedWorkspaceEvidence(): void {
      assertLive();
      // Semantic stages never convert external workspace evidence into local progress.
    },
    setReducedMotion(nextReducedMotion: boolean): void {
      assertLive();
      if (reducedMotion === nextReducedMotion) return;
      reducedMotion = nextReducedMotion;
      motion.destroy();
      motion = createMotion();
      flowDemo?.setReducedMotion(reducedMotion);
      semanticScene?.setReducedMotion(reducedMotion);
      updateView();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      stopPlayback();
      motion.destroy();
      flowDemo?.destroy();
      semanticScene?.destroy();
      interactiveInputDialog?.destroy();
      elements.root.removeEventListener("keydown", onRootKeyDown);
      host.replaceChildren();
    },
  });

  function createMotion(): TaskLessonMotionController {
    return createTaskLessonMotionController({ reducedMotion, playbackRate });
  }

  function wireInteractions(): void {
    elements.start.addEventListener("click", startTask);
    elements.reset.addEventListener("click", restartTask);
    elements.repeat.addEventListener("click", restartTask);
    elements.backToIntro.addEventListener("click", returnToIntro);
    elements.summary.addEventListener("click", showCompletionSummary);
    elements.undo.addEventListener("click", undoConfirmedStep);
    elements.previous.addEventListener("click", () => setDisplay(displayIndex - 1));
    elements.next.addEventListener("click", () => setDisplay(displayIndex + 1));
    elements.returnToCurrent.addEventListener("click", returnToCurrentTask);
    elements.playPause.addEventListener("click", togglePlayback);
    elements.seek.addEventListener("input", () => setDisplay(Number(elements.seek.value)));
    elements.timelineButtons.forEach((button, index) => {
      button.addEventListener("click", () => setDisplay(index));
    });
    for (const [rate, button] of elements.rateButtons) {
      button.addEventListener("click", () => setRate(rate));
    }
    elements.executionSlot.addEventListener("dragover", (event) => {
      event.preventDefault();
      updateDropState(draggedEventId);
    });
    elements.executionSlot.addEventListener("dragleave", () => updateDropState(null));
    elements.executionSlot.addEventListener("drop", (event) => {
      event.preventDefault();
      const id = event.dataTransfer?.getData("text/plain") || draggedEventId;
      updateDropState(null);
      if (id !== null) void attemptEvent(id);
    });
    for (const [index, token] of elements.tokenElements.entries()) {
      const event = lesson.semanticEvents[index]!;
      token.addEventListener("click", () => void attemptEvent(event.id));
      token.addEventListener("dragstart", (dragEvent) => {
        stopPlayback();
        draggedEventId = event.id;
        dragEvent.dataTransfer?.setData("text/plain", event.id);
        dragEvent.dataTransfer?.setDragImage?.(token, 12, 12);
        elements.root.dataset.draggingEventId = event.id;
        updateDropState(event.id);
      });
      token.addEventListener("dragend", () => {
        draggedEventId = null;
        delete elements.root.dataset.draggingEventId;
        updateDropState(null);
      });
    }
    elements.root.addEventListener("keydown", onRootKeyDown);
    wireSourceSplitter();
  }

  function startTask(): void {
    if (phase !== "intro") return;
    phase = "task";
    feedbackKind = "ready";
    options.onPhaseChange?.(phase);
    updateView();
    animatePhaseEntry(elements.task);
    if (flowDemo !== null) flowDemo.openInput(true);
    else if (interactiveInputDialog !== null) interactiveInputDialog.open(true);
    else semanticScene?.focusActive();
  }

  function applyInteractiveRun(run: FoaInteractiveRun): void {
    if (phase !== "task" && phase !== "completed") return;
    interactiveRun = run;
    semanticScene?.setRuntimeCase?.(interactiveRun);
    applyLocale();
    resetLesson("task", false);
  }

  function resetAfterFlowInput(): void {
    if (phase !== "task" && phase !== "completed") return;
    resetLesson("task", false);
  }

  function wireSourceSplitter(): void {
    const splitter = elements.sourceSplitter;
    splitter.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      resizingSource = true;
      splitter.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    splitter.addEventListener("pointermove", (event) => {
      if (!resizingSource) return;
      const bounds = elements.primary.getBoundingClientRect();
      setSourcePanelHeight(bounds.bottom - event.clientY);
    });
    const finishResize = (event: PointerEvent): void => {
      if (!resizingSource) return;
      resizingSource = false;
      splitter.releasePointerCapture?.(event.pointerId);
    };
    splitter.addEventListener("pointerup", finishResize);
    splitter.addEventListener("pointercancel", finishResize);
    splitter.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const current = sourcePanelHeight ?? Math.max(220, elements.primary.clientHeight * 0.42);
      setSourcePanelHeight(current + (event.key === "ArrowUp" ? 24 : -24));
    });
  }

  function setSourcePanelHeight(value: number): void {
    const maximum = Math.max(220, elements.primary.clientHeight * 0.72);
    sourcePanelHeight = Math.round(Math.max(150, Math.min(maximum, value)));
    elements.primary.style.setProperty("--foa-source-height", `${String(sourcePanelHeight)}px`);
    elements.primary.style.setProperty("--foa-source-max", "72%");
    elements.sourceSplitter.setAttribute("aria-valuenow", String(sourcePanelHeight));
  }

  function restartTask(): void {
    resetLesson("task");
  }

  function returnToIntro(): void {
    flowDemo?.closeInput();
    interactiveInputDialog?.close();
    resetLesson("intro");
  }

  function resetLesson(
    nextPhase: Extract<FoaTaskLessonPhase, "intro" | "task">,
    resetFlow = true,
  ): void {
    stopPlayback();
    transitionEpoch += 1;
    semanticScene?.cancelAnimation();
    transitioning = false;
    delete elements.root.dataset.transitioning;
    confirmedCount = 0;
    displayIndex = 0;
    interactionMode = "act";
    lastResultIndex = null;
    previousDisplayIndex = null;
    feedbackKind = "ready";
    evidenceEmitted = false;
    completionSummaryVisible = false;
    if (resetFlow) flowDemo?.reset();
    const phaseChanged = phase !== nextPhase;
    phase = nextPhase;
    layoutTokens(false);
    if (phaseChanged) options.onPhaseChange?.(phase);
    updateView();
    const target = nextPhase === "intro" ? elements.intro : elements.task;
    animatePhaseEntry(target);
    if (nextPhase === "intro") elements.start.focus();
    else if (flowDemo !== null) flowDemo.focusFrame();
    else semanticScene?.focusActive();
  }

  function undoConfirmedStep(): void {
    if (phase !== "task" || confirmedCount === 0 || transitioning) return;
    stopPlayback();
    const before = motion.capture(elements.tokenElements);
    confirmedCount -= 1;
    displayIndex = confirmedCount;
    interactionMode = "act";
    lastResultIndex = confirmedCount === 0 ? null : confirmedCount - 1;
    previousDisplayIndex = null;
    feedbackKind = "ready";
    layoutTokens(false);
    updateView();
    void motion.animateFrom(before, elements.tokenElements, "settle");
    if (flowDemo !== null) flowDemo.focusFrame();
    else semanticScene?.focusActive();
  }

  async function attemptEvent(eventId: string): Promise<void> {
    if (phase !== "task" || interactionMode === "preview" || transitioning) return;
    const expected = lesson.semanticEvents[confirmedCount];
    const token = tokensById.get(eventId);
    if (expected === undefined || token === undefined) return;
    stopPlayback();
    for (const candidate of elements.tokenElements) delete candidate.dataset.attempt;
    if (expected.id !== eventId) {
      feedbackKind = "incorrect";
      displayIndex = confirmedCount;
      interactionMode = "act";
      previousDisplayIndex = null;
      token.dataset.attempt = "incorrect";
      updateView();
      animateRejectedToken(token);
      return;
    }

    const expectedIndex = confirmedCount;
    const epoch = ++transitionEpoch;
    transitioning = true;
    elements.root.dataset.transitioning = "true";
    updateView();
    const transition = semanticScene?.animateAdvance(
      expectedIndex,
      expectedIndex + 1 < lesson.semanticEvents.length ? expectedIndex + 1 : null,
    );
    if (transition !== null && transition !== undefined) await transition;
    else if (
      reducedMotion &&
      ownerDocument.defaultView !== null &&
      typeof ownerDocument.defaultView.setTimeout === "function"
    ) {
      const stageView = ownerDocument.defaultView;
      await new Promise<void>((resolve) => {
        stageView.setTimeout(resolve, REDUCED_MOTION_RUN_STATE_HOLD_MS);
      });
    }
    // A course switch destroys this stage while the scene animation settles. The cancelled
    // animation still resolves by design, so do not touch the detached stage or its scene again.
    if (destroyed) return;
    if (epoch === transitionEpoch) {
      transitioning = false;
      delete elements.root.dataset.transitioning;
    }
    if (!canCommitTransition(expectedIndex, epoch)) {
      updateView();
      return;
    }

    const before = motion.capture(elements.tokenElements);
    delete token.dataset.attempt;
    lastResultIndex = confirmedCount;
    confirmedCount += 1;
    previousDisplayIndex = displayIndex;
    displayIndex = Math.min(confirmedCount, lesson.semanticEvents.length - 1);
    interactionMode = "act";
    feedbackKind = confirmedCount === lesson.semanticEvents.length ? "complete" : "correct";
    layoutTokens(false);
    updateView();
    void motion.animateFrom(before, elements.tokenElements, motionKind(expected));

    if (confirmedCount === lesson.semanticEvents.length) completeFromLearnerActions();
    else if (flowDemo !== null) flowDemo.focusFrame();
    else semanticScene?.focusActive();
  }

  function completeFromLearnerActions(): void {
    if (!evidenceEmitted) {
      evidenceEmitted = true;
      options.onLocalEvidence?.(
        Object.freeze({
          type: "semantic-sequence-completed" as FoaLocalEvidenceType,
          lessonId: lesson.id,
          complete: true,
        }),
      );
    }
    phase = "completed";
    options.onPhaseChange?.(phase);
    updateView();
    if (flowDemo !== null) {
      animatePhaseEntry(flowDemo.root);
      flowDemo.focusFrame();
    } else {
      animatePhaseEntry(elements.task);
      elements.summary.focus();
    }
  }

  function showCompletionSummary(): void {
    if (phase !== "completed" || flowDemo !== null || completionSummaryVisible) return;
    completionSummaryVisible = true;
    updateView();
    animatePhaseEntry(elements.completion);
    elements.repeat.focus();
  }

  function syncFlowFrame(change: FoaDataFlowFrameChange): void {
    const bounded = Math.max(
      0,
      Math.min(lesson.semanticEvents.length - 1, change.sourceEventIndex),
    );
    displayIndex = bounded;
    previousDisplayIndex =
      change.previousSourceEventIndex === null
        ? null
        : Math.max(0, Math.min(lesson.semanticEvents.length - 1, change.previousSourceEventIndex));
    const current = lesson.semanticEvents[bounded];
    elements.root.dataset.timelinePosition = String(change.frameIndex);
    elements.root.dataset.currentEventId = current?.id ?? "";
    elements.sourceView.highlight({
      activeLine: semanticEventLine(lesson, bounded, sourceLineByEventId),
      previousLine:
        previousDisplayIndex === null
          ? null
          : semanticEventLine(lesson, previousDisplayIndex, sourceLineByEventId),
      status: change.summary,
    });
  }

  function completeFlowLesson(): void {
    if (phase !== "task" || flowDemo === null) return;
    stopPlayback();
    confirmedCount = lesson.semanticEvents.length;
    feedbackKind = "complete";
    if (!evidenceEmitted) {
      evidenceEmitted = true;
      options.onLocalEvidence?.(
        Object.freeze({
          type: "semantic-sequence-completed" as FoaLocalEvidenceType,
          lessonId: lesson.id,
          complete: true,
        }),
      );
    }
    phase = "completed";
    options.onPhaseChange?.(phase);
    updateView();
    flowDemo.focusFrame();
  }

  function setDisplay(nextIndex: number): void {
    if (phase !== "task" || transitioning) return;
    stopPlayback();
    const bounded = Math.max(0, Math.min(lesson.semanticEvents.length - 1, nextIndex));
    if (bounded === confirmedCount) {
      returnToCurrentTask();
      return;
    }
    interactionMode = "preview";
    updateDisplay(bounded);
  }

  function updateDisplay(nextIndex: number): void {
    if (displayIndex === nextIndex) {
      updateView();
      return;
    }
    const previousIndex = displayIndex;
    previousDisplayIndex = previousIndex;
    displayIndex = nextIndex;
    updateView();
    const previewTransition = semanticScene?.animatePreviewAdvance?.(previousIndex, nextIndex);
    if (previewTransition !== null && previewTransition !== undefined) {
      void previewTransition;
    }
    animateDisplayToken();
  }

  function togglePlayback(): void {
    if (phase !== "task") return;
    if (playing) {
      pausePlayback();
      updateView();
      return;
    }
    playing = true;
    interactionMode = "preview";
    if (displayIndex >= lesson.semanticEvents.length - 1 && playbackSemanticRemaining === 0) {
      previousDisplayIndex = displayIndex;
      displayIndex = 0;
    }
    motion.play();
    schedulePlayback();
    updateView();
  }

  function returnToCurrentTask(): void {
    if (phase !== "task") return;
    stopPlayback();
    previousDisplayIndex = displayIndex;
    displayIndex = Math.min(confirmedCount, lesson.semanticEvents.length - 1);
    interactionMode = "act";
    updateView();
    if (flowDemo !== null) flowDemo.focusFrame();
    else semanticScene?.focusActive();
  }

  function schedulePlayback(): void {
    clearPlaybackTimer();
    if (!playing || phase !== "task") return;
    const event = lesson.semanticEvents[displayIndex]!;
    const semanticDuration =
      playbackSemanticRemaining > 0
        ? playbackSemanticRemaining
        : readableTaskLessonSemanticDuration(
            previewDuration(event, lesson.experience.playbackMs),
            1.5,
          );
    playbackSemanticRemaining = semanticDuration;
    playbackSegmentStartedAt = Date.now();
    playbackSegmentRate = playbackRate;
    playbackTimer = setTimeout(() => {
      playbackTimer = null;
      playbackSegmentStartedAt = 0;
      playbackSemanticRemaining = 0;
      if (!playing || destroyed || phase !== "task") return;
      if (displayIndex >= lesson.semanticEvents.length - 1) {
        playing = false;
        updateView();
        return;
      }
      updateDisplay(displayIndex + 1);
      schedulePlayback();
    }, semanticDuration / playbackRate);
  }

  function pausePlayback(): void {
    if (playbackTimer !== null) {
      playbackSemanticRemaining = Math.max(
        0,
        playbackSemanticRemaining - (Date.now() - playbackSegmentStartedAt) * playbackSegmentRate,
      );
    }
    playing = false;
    clearPlaybackTimer();
    playbackSegmentStartedAt = 0;
    motion.pause();
    semanticScene?.cancelAnimation();
  }

  function stopPlayback(): void {
    playing = false;
    clearPlaybackTimer();
    playbackSegmentStartedAt = 0;
    playbackSemanticRemaining = 0;
    playbackSegmentRate = 1;
    motion.finish();
    semanticScene?.cancelAnimation();
  }

  function clearPlaybackTimer(): void {
    if (playbackTimer === null) return;
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }

  function setRate(rate: number): void {
    if (rate === playbackRate) return;
    playbackRate = rate;
    motion.setRate(rate);
    semanticScene?.setPlaybackRate?.(rate);
    if (playing) {
      if (playbackTimer !== null) {
        playbackSemanticRemaining = Math.max(
          0,
          playbackSemanticRemaining - (Date.now() - playbackSegmentStartedAt) * playbackSegmentRate,
        );
      }
      schedulePlayback();
    }
    updateView();
  }

  function onRootKeyDown(event: KeyboardEvent): void {
    if (phase !== "task" || isTypingTarget(event.target)) return;
    if (event.key === " ") {
      if (isButtonTarget(event.target)) return;
      event.preventDefault();
      togglePlayback();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setDisplay(displayIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setDisplay(displayIndex + 1);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setRate(previousRate(playbackRate));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setRate(nextRate(playbackRate));
    }
  }

  function visibleEventLabel(index: number, revealEvidence = false): string {
    const semanticEvent = lesson.semanticEvents[index];
    if (semanticEvent === undefined) return "";
    if (interactiveRun === null) return semanticEvent.label[locale];
    const evidence = interactiveRun.eventDetails[index]?.[locale];
    if (revealEvidence && evidence !== undefined && evidence.length > 0) return evidence;
    return INTERACTIVE_EVENT_COPY[locale][semanticEvent.type];
  }

  function applyLocale(): void {
    const strings = COPY[locale];
    elements.root.dataset.locale = locale;
    elements.root.dataset.visualFamily = lesson.experience.visualFamily;
    elements.root.dataset.playbackPolicy = lesson.experience.playbackPolicy;
    elements.root.dataset.visualModel = lesson.experience.visualModel[locale];
    elements.root.setAttribute("aria-label", `${strings.lesson}: ${lesson.title[locale]}`);
    elements.introEyebrow.textContent = `${strings.lesson} ${String(lesson.order)} · ${lesson.section}`;
    elements.introTitle.textContent = lesson.title[locale];
    const interactiveKnowledge = lesson.knowledgePoints[0]?.title[locale] ?? lesson.title[locale];
    elements.introSummary.textContent =
      interactiveInputDefinition === null
        ? lesson.summary[locale]
        : `${interactiveKnowledge}${locale === "zh" ? "。" : ". "}${
            interactiveInputDefinition.description[locale]
          }`;
    elements.start.textContent = strings.start;
    elements.identity.textContent = `${strings.lesson} ${String(lesson.order)} · ${lesson.title[locale]}`;
    elements.instruction.textContent = strings.actionInstruction;
    elements.instruction.dataset.semanticRole = "action";
    elements.goalLabel.textContent = strings.goal;
    elements.actionLabel.textContent = strings.action;
    elements.resultLabel.textContent = strings.result;
    elements.bankHeading.textContent = strings.availableEvents;
    elements.executionHeading.textContent = strings.executionArea;
    elements.acceptedHeading.textContent = strings.confirmedResults;
    elements.previewText.textContent = strings.previewing;
    elements.returnToCurrent.textContent = strings.returnToCurrent;
    elements.bank.setAttribute("aria-label", lesson.experience.visualModel[locale]);
    elements.executionSlot.setAttribute("aria-label", strings.expected);
    elements.executionPlaceholder.textContent = strings.slotEmpty;
    elements.undo.textContent = strings.undo;
    elements.previous.textContent = strings.previous;
    elements.next.textContent = strings.next;
    elements.sourceView.setLabel(strings.source);
    elements.sourceSplitter.setAttribute("aria-label", strings.resizeCode);
    elements.sourceView.setBoilerplateCopy({
      show: strings.showFullSource,
      hide: strings.showTaskSource,
      summary: strings.hiddenSetup,
    });
    elements.completionEyebrow.textContent = strings.complete;
    elements.completionTitle.textContent = lesson.title[locale];
    elements.completionText.textContent = strings.complete;
    const knowledgeTitles = lesson.knowledgePoints.map((point) => point.title[locale]).join(", ");
    const visibleStdin = interactiveRun?.stdin ?? lesson.case.stdin;
    const visibleStdout = interactiveRun?.stdout ?? lesson.case.stdout;
    elements.completionDetails.textContent = `${strings.input}: ${visibleStdin.length === 0 ? "∅" : visibleStdin}\n${strings.output}: ${visibleStdout.length === 0 ? "∅" : visibleStdout}\n${strings.complexity}: ${lesson.complexity.time} · ${lesson.complexity.space}\n${strings.knowledge}: ${knowledgeTitles}`;
    elements.repeat.textContent = strings.repeat;
    elements.backToIntro.textContent = strings.backToIntro;
    elements.reset.textContent = strings.reset;
    elements.summary.textContent = strings.viewSummary;
    flowDemo?.setLocale(locale);
    lesson.semanticEvents.forEach((semanticEvent, index) => {
      const visibleLabel = visibleEventLabel(index);
      const accessibleLabel = strings.stepLabel(
        index + 1,
        lesson.semanticEvents.length,
        visibleLabel,
      );
      elements.tokenElements[index]!.textContent = visibleLabel;
      elements.tokenElements[index]!.setAttribute("aria-label", accessibleLabel);
      elements.timelineItems[index]!.setAttribute("aria-label", accessibleLabel);
      elements.timelineButtons[index]!.textContent = `${String(index + 1)} · ${visibleLabel}`;
    });
  }

  function updateView(): void {
    const strings = COPY[locale];
    elements.root.dataset.phase = phase;
    elements.root.dataset.confirmedEvents = String(confirmedCount);
    elements.root.dataset.timelinePosition = String(displayIndex);
    elements.root.dataset.interactionMode = interactionMode;
    elements.root.dataset.playbackState = playing ? "playing" : "paused";
    const runState = runtimeState();
    elements.root.dataset.runState = runState;
    elements.root.dataset.previewing = String(interactionMode === "preview");
    elements.root.dataset.reducedMotion = String(reducedMotion);
    semanticScene?.setState({
      displayIndex,
      confirmedCount,
      previewing: interactionMode === "preview",
      completed: phase === "completed",
      runtimeState: runState,
    });
    const completedFlowDemo = flowDemo !== null && phase === "completed";
    const completedSemanticScene =
      semanticScene !== null && phase === "completed" && !completionSummaryVisible;
    elements.intro.hidden = phase !== "intro";
    elements.task.hidden = phase !== "task" && !completedFlowDemo && !completedSemanticScene;
    elements.completion.hidden =
      phase !== "completed" || completedFlowDemo || completedSemanticScene;
    elements.summary.hidden = !completedSemanticScene;
    elements.undo.disabled = confirmedCount === 0;
    elements.previous.disabled = displayIndex === 0;
    elements.next.disabled = displayIndex === lesson.semanticEvents.length - 1;
    elements.playPause.textContent = playing ? strings.pause : strings.play;
    elements.playPause.dataset.taskLessonAction = "play-pause";
    const timelineMaximum = Math.max(0, lesson.semanticEvents.length - 1);
    elements.seek.min = "0";
    elements.seek.max = String(timelineMaximum);
    elements.seek.value = String(displayIndex);
    elements.seek.setAttribute("aria-label", strings.timeline);
    elements.seek.setAttribute("aria-valuemin", "0");
    elements.seek.setAttribute("aria-valuemax", String(timelineMaximum));
    elements.seek.setAttribute("aria-valuenow", String(displayIndex));
    elements.seek.setAttribute(
      "aria-valuetext",
      `${String(displayIndex + 1)} / ${String(lesson.semanticEvents.length)}`,
    );
    elements.feedback.dataset.kind = feedbackKind;
    elements.feedback.textContent = feedbackText(strings);
    elements.previewBanner.hidden = interactionMode !== "preview";
    for (const [rate, button] of elements.rateButtons) {
      button.dataset.selected = String(rate === playbackRate);
      button.setAttribute("aria-pressed", String(rate === playbackRate));
    }

    const current = lesson.semanticEvents[displayIndex] ?? null;
    const expected = lesson.semanticEvents[confirmedCount] ?? null;
    const expectedDescriptor =
      expected === null ? null : (sourceDescriptorByEventId.get(expected.id) ?? null);
    elements.goal.textContent =
      expected === null ? strings.complete : visibleEventLabel(confirmedCount);
    elements.goalSource.textContent = expectedDescriptor?.sourceText ?? "";
    const lastResult =
      lastResultIndex === null ? null : (lesson.semanticEvents[lastResultIndex] ?? null);
    elements.result.textContent =
      lastResult === null
        ? strings.noResult
        : flowDemo === null
          ? (interactiveRun?.eventDetails[lastResultIndex ?? -1]?.[locale] ??
            `${lastResult.label[locale]} · ${lesson.experience.persistentEvidence[locale]}`)
          : flowDemo.outputText;
    const completedResult =
      lastResultIndex === null
        ? null
        : (interactiveRun?.eventDetails[lastResultIndex]?.[locale] ?? lastResult?.label[locale]);
    elements.completionText.textContent =
      lastResult === null
        ? strings.complete
        : `${strings.complete} ${strings.result}: ${completedResult ?? lastResult.label[locale]}.`;
    elements.root.dataset.currentEventId = current?.id ?? "";
    elements.executionPlaceholder.hidden = confirmedCount > 0;
    for (const [index, token] of elements.tokenElements.entries()) {
      const isViewed = current?.id === lesson.semanticEvents[index]?.id;
      const isExpected = index === confirmedCount;
      token.dataset.state =
        isExpected && interactionMode === "act"
          ? "active"
          : index < confirmedCount
            ? "done"
            : "pending";
      token.dataset.compatible = String(isExpected && interactionMode === "act");
      token.dataset.preview = String(isViewed && interactionMode === "preview");
      token.disabled = interactionMode === "preview" || index < confirmedCount;
      token.draggable = interactionMode === "act" && isExpected;
      if (token.dataset.attempt === "incorrect" && isExpected) delete token.dataset.attempt;
    }
    for (const [index, item] of elements.timelineItems.entries()) {
      const state =
        interactionMode === "preview" && index === displayIndex
          ? "preview"
          : interactionMode === "act" && index === confirmedCount
            ? "active"
            : index < confirmedCount
              ? "done"
              : "pending";
      item.dataset.state = state;
      elements.timelineStatuses[index]!.textContent =
        state === "active"
          ? strings.currentStep
          : state === "preview"
            ? strings.previewStep
            : state === "done"
              ? strings.completedStep
              : strings.pendingStep;
      item.setAttribute(
        "aria-current",
        interactionMode === "act" && index === confirmedCount ? "step" : "false",
      );
      elements.timelineButtons[index]!.setAttribute(
        "aria-pressed",
        String(interactionMode === "preview" && index === displayIndex),
      );
    }
    const activeLine = semanticEventLine(lesson, displayIndex, sourceLineByEventId);
    const previousLine =
      previousDisplayIndex === null
        ? null
        : semanticEventLine(lesson, previousDisplayIndex, sourceLineByEventId);
    elements.sourceView.highlight({
      activeLine,
      previousLine,
      status:
        current === null
          ? ""
          : interactionMode === "act"
            ? `${strings.expected}: ${visibleEventLabel(
                displayIndex,
                displayIndex < confirmedCount || phase === "completed",
              )}`
            : `${strings.previewStatus}: ${visibleEventLabel(displayIndex)}`,
    });
  }

  function layoutTokens(animate: boolean): void {
    const before = animate ? motion.capture(elements.tokenElements) : null;
    elements.accepted.replaceChildren();
    elements.executionSlot.replaceChildren(elements.executionPlaceholder);
    elements.bank.replaceChildren();
    for (const [index, token] of elements.tokenElements.entries()) {
      if (index < confirmedCount - 1) elements.accepted.append(token);
      else if (index === confirmedCount - 1) elements.executionSlot.append(token);
      else elements.bank.append(token);
    }
    if (before !== null) void motion.animateFrom(before, elements.tokenElements, "settle");
  }

  function updateDropState(eventId: string | null): void {
    const expectedId = lesson.semanticEvents[confirmedCount]?.id;
    elements.executionSlot.dataset.dropState =
      eventId === null ? "idle" : eventId === expectedId ? "compatible" : "invalid";
  }

  function animateRejectedToken(token: HTMLButtonElement): void {
    if (reducedMotion || typeof token.animate !== "function") return;
    const animation = token.animate([{ opacity: 1 }, { opacity: 0.48 }, { opacity: 1 }], {
      duration: 180,
      easing: "ease-out",
    });
    void animation.finished
      .catch(() => undefined)
      .finally(() => {
        delete token.dataset.attempt;
      });
  }

  function animateDisplayToken(): void {
    if (reducedMotion) return;
    const token = elements.tokenElements[displayIndex];
    if (token === undefined) return;
    const current = motion.capture([token]);
    const point = current.get(token.dataset.teachingTokenId ?? "");
    if (point === undefined) return;
    const offset = new Map(current);
    offset.set(token.dataset.teachingTokenId!, { left: point.left, top: point.top + 5 });
    void motion.animateFrom(offset, [token], motionKind(lesson.semanticEvents[displayIndex]!));
  }

  function animatePhaseEntry(target: HTMLElement): void {
    if (reducedMotion || typeof target.animate !== "function") return;
    target.animate([{ opacity: 0.7 }, { opacity: 1 }], {
      duration: 220,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }

  function feedbackText(strings: SemanticStageCopy): string {
    const current = lesson.semanticEvents[displayIndex];
    const expected = lesson.semanticEvents[confirmedCount];
    if (interactionMode === "preview" && current !== undefined && expected !== undefined) {
      return `${strings.previewStatus}: ${current.label[locale]}. ${strings.returnToCurrent}: ${expected.label[locale]}.`;
    }
    const suffix = current === undefined ? "" : ` ${strings.expected}: ${current.label[locale]}.`;
    if (feedbackKind === "incorrect") {
      return `${strings.incorrect}${suffix}`;
    }
    if (feedbackKind === "correct") return `${strings.correct}${suffix}`;
    if (feedbackKind === "complete") return strings.complete;
    return `${strings.ready}${suffix} ${lesson.experience.persistentEvidence[locale]}`;
  }

  function canCommitTransition(expectedIndex: number, epoch: number): boolean {
    return (
      !destroyed &&
      transitionEpoch === epoch &&
      phase === "task" &&
      interactionMode === "act" &&
      confirmedCount === expectedIndex
    );
  }

  function runtimeState(): "ready" | "running" | "paused" | "completed" {
    if (phase === "completed") return "completed";
    if (phase !== "task" || (confirmedCount === 0 && !playing && !transitioning)) return "ready";
    if (playing || transitioning) return "running";
    return "paused";
  }

  function assertLive(): void {
    if (destroyed) throw new Error("FOA semantic task stage has been destroyed");
  }
}

function mountStableStage(
  ownerDocument: Document,
  lesson: FoaLessonDefinition,
): SemanticStageElements {
  const root = element(
    ownerDocument,
    "section",
    "library-task-lesson library-task-lesson--v2 foa-semantic-stage",
  );
  root.tabIndex = -1;

  const intro = element(ownerDocument, "section", "library-task-lesson__intro");
  const introEyebrow = element(ownerDocument, "span", "library-task-lesson__eyebrow");
  const introTitle = element(ownerDocument, "h2");
  const introSummary = element(ownerDocument, "p", "library-task-lesson__lead");
  const start = actionButton(ownerDocument, "start", true);
  const introFooter = element(ownerDocument, "footer");
  introFooter.append(start);
  intro.append(introEyebrow, introTitle, introSummary, introFooter);

  const task = element(ownerDocument, "section", "library-task-stage foa-semantic-stage__task");
  const header = element(ownerDocument, "header", "library-task-stage__header");
  const identity = element(ownerDocument, "strong", "foa-semantic-stage__identity");
  const timeline = element(ownerDocument, "ol", "library-task-stage__progress");
  const timelineButtons: HTMLButtonElement[] = [];
  const timelineStatuses: HTMLElement[] = [];
  const timelineItems = lesson.semanticEvents.map((semanticEvent, index) => {
    const item = element(ownerDocument, "li");
    item.dataset.semanticEventId = semanticEvent.id;
    const button = actionButton(ownerDocument, `preview-step-${String(index + 1)}`);
    button.className = "foa-semantic-stage__timeline-button";
    const status = element(ownerDocument, "span", "foa-semantic-stage__timeline-status");
    item.append(button, status);
    timelineButtons.push(button);
    timelineStatuses.push(status);
    return item;
  });
  timeline.append(...timelineItems);
  timeline.style.gridTemplateColumns = `repeat(${String(lesson.semanticEvents.length)}, minmax(28px, 1fr))`;
  const headerActions = element(ownerDocument, "div", "library-task-stage__header-actions");
  const summary = actionButton(ownerDocument, "show-summary");
  summary.hidden = true;
  const reset = actionButton(ownerDocument, "reset");
  headerActions.append(summary, reset);
  header.append(identity, timeline, headerActions);

  const main = element(ownerDocument, "div", "foa-semantic-stage__main");
  const primary = element(ownerDocument, "div", "foa-semantic-stage__primary");
  const prompt = element(ownerDocument, "section", "library-task-stage__prompt");
  const guide = element(ownerDocument, "div", "foa-semantic-stage__guide");
  const goalRow = element(ownerDocument, "div", "foa-semantic-stage__guide-row");
  goalRow.dataset.semanticRole = "goal";
  const goalLabel = element(ownerDocument, "span");
  goalLabel.dataset.semanticLabel = "goal";
  const goal = element(ownerDocument, "strong");
  const goalSource = element(ownerDocument, "code");
  goalRow.append(goalLabel, goal, goalSource);
  const actionRow = element(ownerDocument, "div", "foa-semantic-stage__guide-row");
  actionRow.dataset.semanticRole = "action";
  const actionLabel = element(ownerDocument, "span");
  actionLabel.dataset.semanticLabel = "action";
  const instruction = element(ownerDocument, "p");
  actionRow.append(actionLabel, instruction);
  const resultRow = element(ownerDocument, "div", "foa-semantic-stage__guide-row");
  resultRow.dataset.semanticRole = "result";
  const resultLabel = element(ownerDocument, "span");
  resultLabel.dataset.semanticLabel = "result";
  const result = element(ownerDocument, "p");
  result.setAttribute("aria-live", "polite");
  resultRow.append(resultLabel, result);
  guide.append(goalRow, actionRow, resultRow);
  const previewBanner = element(ownerDocument, "div", "foa-semantic-stage__preview-banner");
  const previewText = element(ownerDocument, "span");
  const returnToCurrent = actionButton(ownerDocument, "return-to-current");
  previewBanner.append(previewText, returnToCurrent);
  previewBanner.hidden = true;
  prompt.append(guide);

  const workspace = element(ownerDocument, "section", "foa-semantic-stage__workspace");
  const bankRegion = element(ownerDocument, "section", "foa-semantic-stage__region");
  const bankHeading = element(ownerDocument, "strong");
  const bank = element(ownerDocument, "div", "foa-semantic-stage__bank");
  const tokenElements = lesson.semanticEvents.map((semanticEvent, index) => {
    const token = actionButton(ownerDocument, "semantic-event");
    token.classList.add("foa-semantic-stage__token");
    token.dataset.semanticEventId = semanticEvent.id;
    token.dataset.teachingTokenId = semanticEvent.id;
    token.dataset.eventType = semanticEvent.type;
    token.dataset.eventIndex = String(index);
    token.draggable = true;
    return token;
  });
  bank.append(...tokenElements);
  bankRegion.append(bankHeading, bank);

  const executionRegion = element(ownerDocument, "section", "foa-semantic-stage__region");
  const executionHeading = element(ownerDocument, "strong");
  const executionSlot = element(ownerDocument, "div", "foa-semantic-stage__execution-slot");
  executionSlot.dataset.taskLessonAction = "execution-slot";
  executionSlot.dataset.dropState = "idle";
  executionSlot.tabIndex = -1;
  executionSlot.setAttribute("role", "group");
  const executionPlaceholder = element(ownerDocument, "span", "foa-semantic-stage__placeholder");
  executionSlot.append(executionPlaceholder);
  executionRegion.append(executionHeading, executionSlot);

  const acceptedRegion = element(ownerDocument, "section", "foa-semantic-stage__region");
  const acceptedHeading = element(ownerDocument, "strong");
  const accepted = element(ownerDocument, "div", "foa-semantic-stage__accepted");
  const undo = actionButton(ownerDocument, "undo");
  acceptedRegion.append(acceptedHeading, accepted, undo);
  const feedback = element(ownerDocument, "p", "foa-semantic-stage__feedback");
  feedback.setAttribute("aria-live", "polite");
  workspace.append(bankRegion, executionRegion, acceptedRegion, feedback);

  const controls = element(ownerDocument, "section", "library-task-stage__controls");
  const previous = actionButton(ownerDocument, "previous");
  const playPause = actionButton(ownerDocument, "play-pause", true);
  const next = actionButton(ownerDocument, "next");
  const seek = ownerDocument.createElement("input");
  seek.type = "range";
  seek.min = "0";
  seek.max = String(Math.max(0, lesson.semanticEvents.length - 1));
  seek.step = "1";
  seek.value = "0";
  seek.dataset.taskLessonInput = "timeline";
  const speed = element(ownerDocument, "div", "library-task-stage__speed");
  const rateButtons = new Map<number, HTMLButtonElement>();
  for (const rate of [0.5, 1, 1.5] as const) {
    const button = actionButton(ownerDocument, `rate-${String(rate).replace(".", "-")}`);
    button.textContent = `${String(rate)}×`;
    rateButtons.set(rate, button);
    speed.append(button);
  }
  controls.append(previewBanner, previous, playPause, next, seek, speed);

  const sourceView = createTeachingSourceView(ownerDocument, {
    source: lesson.code.text,
    startLine: 1,
    collapseBoilerplate: true,
  });
  const sourceSplitter = element(ownerDocument, "div", "foa-semantic-stage__source-splitter");
  sourceSplitter.dataset.taskLessonAction = "resize-source";
  sourceSplitter.tabIndex = 0;
  sourceSplitter.setAttribute("role", "separator");
  sourceSplitter.setAttribute("aria-orientation", "horizontal");
  sourceSplitter.setAttribute("aria-label", "Resize code panel");
  primary.append(prompt, workspace, controls, sourceSplitter, sourceView.root);
  main.append(primary);
  task.append(header, main);

  const completion = element(ownerDocument, "section", "library-task-lesson__completion");
  const completionEyebrow = element(ownerDocument, "span", "library-task-lesson__eyebrow");
  const completionTitle = element(ownerDocument, "h2");
  const completionText = element(ownerDocument, "p");
  const completionDetails = element(ownerDocument, "pre", "foa-semantic-stage__completion-details");
  const repeat = actionButton(ownerDocument, "repeat", true);
  const backToIntro = actionButton(ownerDocument, "back-to-intro");
  const completionFooter = element(ownerDocument, "footer");
  completionFooter.append(repeat, backToIntro);
  completion.append(
    completionEyebrow,
    completionTitle,
    completionText,
    completionDetails,
    completionFooter,
  );

  root.append(intro, task, completion);
  return {
    root,
    intro,
    task,
    completion,
    introEyebrow,
    introTitle,
    introSummary,
    start,
    identity,
    primary,
    goalLabel,
    goal,
    goalSource,
    actionLabel,
    instruction,
    resultLabel,
    result,
    previewBanner,
    previewText,
    returnToCurrent,
    bankHeading,
    executionHeading,
    acceptedHeading,
    workspace,
    bank,
    executionSlot,
    executionPlaceholder,
    accepted,
    undo,
    feedback,
    previous,
    playPause,
    next,
    seek,
    rateButtons,
    timelineItems,
    timelineButtons,
    timelineStatuses,
    completionEyebrow,
    completionTitle,
    completionText,
    completionDetails,
    repeat,
    backToIntro,
    summary,
    reset,
    tokenElements,
    sourceView,
    sourceSplitter,
  };
}

function actionButton(ownerDocument: Document, action: string, primary = false): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = primary ? "button button--primary" : "button";
  button.dataset.taskLessonAction = action;
  return button;
}

function element<K extends keyof HTMLElementTagNameMap>(
  ownerDocument: Document,
  tagName: K,
  className = "",
): HTMLElementTagNameMap[K] {
  const result = ownerDocument.createElement(tagName);
  result.className = className;
  return result;
}

function semanticEventLine(
  lesson: FoaLessonDefinition,
  index: number,
  sourceLineByEventId: ReadonlyMap<string, number>,
): number {
  const semanticEvent =
    lesson.semanticEvents[Math.max(0, Math.min(index, lesson.semanticEvents.length - 1))];
  if (semanticEvent === undefined) return 1;
  return sourceLineByEventId.get(semanticEvent.id) ?? 1;
}

function motionKind(event: FoaSemanticEvent): TaskLessonMotionKind {
  if (event.type === "read") return "pick-key";
  if (event.type === "compare" || event.type === "branch") return "compare";
  if (event.type === "write" || event.type === "return") return "insert";
  if (event.type === "iterate" || event.type === "call") return "shift";
  return "settle";
}

function previewDuration(event: FoaSemanticEvent, baseMs: number): number {
  const kind = motionKind(event);
  if (kind === "compare") return Math.min(3_000, baseMs + 180);
  if (kind === "insert") return Math.min(3_000, baseMs + 240);
  return baseMs;
}

function previousRate(rate: number): number {
  const rates = [0.5, 1, 1.5] as const;
  return rates[Math.max(0, rates.indexOf(rate as (typeof rates)[number]) - 1)]!;
}

function nextRate(rate: number): number {
  const rates = [0.5, 1, 1.5] as const;
  const index = rates.indexOf(rate as (typeof rates)[number]);
  return rates[Math.min(rates.length - 1, Math.max(0, index) + 1)]!;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !("matches" in target)) return false;
  return (target as Element).matches("input, textarea, select, [contenteditable='true']");
}

function isButtonTarget(target: EventTarget | null): boolean {
  if (target === null || !("matches" in target)) return false;
  return (target as Element).matches("button, [role='button']");
}

function prefersReducedMotion(ownerDocument: Document): boolean {
  return (
    ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}
