import type { LibraryEntry } from "../library/index.js";
import type { InterfaceLocale } from "../shared/interface-locale.js";
import {
  INSERTION_SORT_LAB_CASES,
  INSERTION_SORT_LAB_SOURCE,
  INSERTION_SORT_SHIFT_OPTIMIZED_SOURCE,
  INSERTION_SORT_SEMANTIC_RELATIONS,
  createInsertionSortTeachingTimeline,
  insertionSortSnapshotValues,
  matchTextbookInsertionSortTutorialSignature,
  parseInsertionSortCustomInput,
  reduceInsertionSortTeachingEvent,
  validateInsertionSortLearnerAction,
  type InsertionSortCustomInputErrorCode,
  type InsertionSortLearnerAction,
  type InsertionSortRelationId,
  type InsertionSortTeachingEvent,
  type InsertionSortTeachingEventKind,
  type InsertionSortTeachingSnapshot,
  type InsertionSortTeachingTimeline,
} from "../tutorials/insertion-sort-lab.js";
import { createTaskLessonController, type TaskLessonController } from "../tutorials/task-lesson.js";
import type {
  LibraryTaskLesson,
  LibraryTaskLessonOptions,
  LibraryTaskLessonPhase,
} from "./library-task-lesson.js";
import {
  createTaskLessonMotionController,
  readableTaskLessonSemanticDuration,
  type TaskLessonMotionController,
} from "./task-lesson-motion.js";
import { createTeachingSourceView, type TeachingSourceView } from "./teaching-source-view.js";

type LessonStage = "observe" | "practice" | "transfer" | "experiment" | "reflect";
type ReflectionQuestion = "key" | "order";
type ReflectionChoice = "key-snapshot" | "key-count" | "key-output" | "reverse" | "sorted" | "same";

type InsertionController = TaskLessonController<
  InsertionSortTeachingSnapshot,
  InsertionSortTeachingEvent,
  InsertionSortLearnerAction
>;

interface LessonCopy {
  readonly introEyebrow: string;
  readonly introTitle: string;
  readonly introSummary: string;
  readonly introBoundary: string;
  readonly goalsTitle: string;
  readonly goals: readonly string[];
  readonly start: string;
  readonly exit: string;
  readonly stageNames: Readonly<Record<LessonStage, string>>;
  readonly stageLabel: (index: number) => string;
  readonly instructions: Readonly<Record<LessonStage, string>>;
  readonly evidenceBoundary: string;
  readonly keyTray: string;
  readonly keyEmpty: string;
  readonly sortedPrefix: string;
  readonly comparisons: string;
  readonly shifts: string;
  readonly writes: string;
  readonly activeRelation: string;
  readonly sourceLine: string;
  readonly sourceDisclosure: string;
  readonly previous: string;
  readonly play: string;
  readonly pause: string;
  readonly next: string;
  readonly timeline: string;
  readonly rate: string;
  readonly resetRound: string;
  readonly undoStep: string;
  readonly predictTitle: string;
  readonly predictShift: string;
  readonly predictStop: string;
  readonly expectedAction: Readonly<Record<InsertionSortTeachingEventKind, string>>;
  readonly eventNames: Readonly<Record<InsertionSortTeachingEventKind, string>>;
  readonly hintTitle: string;
  readonly hints: Readonly<Record<InsertionSortTeachingEventKind, readonly string[]>>;
  readonly showStep: string;
  readonly transferNote: string;
  readonly customTitle: string;
  readonly customPlaceholder: string;
  readonly runExperiment: string;
  readonly customErrors: Readonly<Record<InsertionSortCustomInputErrorCode, string>>;
  readonly reflectionTitle: string;
  readonly reflectionKey: string;
  readonly reflectionOrder: string;
  readonly reflectionChoices: Readonly<Record<ReflectionChoice, string>>;
  readonly correct: string;
  readonly tryAgain: string;
  readonly completionEyebrow: string;
  readonly completionTitle: string;
  readonly completionSummary: string;
  readonly recognitionTitle: string;
  readonly recognitionResult: string;
  readonly recognitionBoundary: string;
  readonly evidence: Readonly<Record<string, string>>;
  readonly caseTitle: string;
  readonly caseLabels: Readonly<Record<string, string>>;
  readonly caseInput: string;
  readonly caseOutput: string;
  readonly semanticTitle: string;
  readonly semanticBoundary: string;
  readonly detailsTitle: string;
  readonly fullSource: string;
  readonly replayLesson: string;
  readonly backToIntro: string;
  readonly relationRoles: Readonly<Record<InsertionSortRelationId, string>>;
  readonly eventStatus: (
    event: InsertionSortTeachingEvent | null,
    state: InsertionSortTeachingSnapshot,
  ) => string;
  readonly comparison: (left: number, right: number, result: boolean) => string;
}

interface StageElements {
  readonly root: HTMLElement;
  readonly intro: HTMLElement;
  readonly workspace: HTMLElement;
  readonly completion: HTMLElement;
  readonly lessonLabel: HTMLElement;
  readonly stageLabel: HTMLElement;
  readonly progress: HTMLOListElement;
  readonly exitButton: HTMLButtonElement;
  readonly title: HTMLElement;
  readonly instruction: HTMLElement;
  readonly boundary: HTMLElement;
  readonly board: HTMLElement;
  readonly boardGrid: HTMLElement;
  readonly keyTray: HTMLButtonElement;
  readonly keyTrayLabel: HTMLElement;
  readonly relationSvg: SVGElement;
  readonly relationText: HTMLElement;
  readonly sourceView: TeachingSourceView;
  readonly facts: HTMLElement;
  readonly expected: HTMLElement;
  readonly feedback: HTMLElement;
  readonly prediction: HTMLElement;
  readonly predictShift: HTMLButtonElement;
  readonly predictStop: HTMLButtonElement;
  readonly experiment: HTMLElement;
  readonly customTitle: HTMLElement;
  readonly customInput: HTMLInputElement;
  readonly customRun: HTMLButtonElement;
  readonly customError: HTMLElement;
  readonly reflection: HTMLElement;
  readonly reflectionTitle: HTMLElement;
  readonly reflectionQuestions: HTMLElement;
  readonly previous: HTMLButtonElement;
  readonly play: HTMLButtonElement;
  readonly next: HTMLButtonElement;
  readonly seek: HTMLInputElement;
  readonly timelineLabel: HTMLElement;
  readonly timelineText: HTMLElement;
  readonly rates: readonly HTMLButtonElement[];
  readonly resetRound: HTMLButtonElement;
  readonly undoStep: HTMLButtonElement;
  readonly showStep: HTMLButtonElement;
  readonly rateLabel: HTMLElement;
}

const NORMAL_INPUT = INSERTION_SORT_LAB_CASES[0]!.input;
const TRANSFER_INPUT = INSERTION_SORT_LAB_CASES[2]!.input;
const DEFAULT_EXPERIMENT_INPUT = Object.freeze([9, 3, 7, 1]);
const STAGES: readonly LessonStage[] = Object.freeze([
  "observe",
  "practice",
  "transfer",
  "experiment",
  "reflect",
]);
const CORE_SOURCE = `for (size_t i = 1; i < count; i++) {
  int key = values[i];
  size_t j = i;
  while (j > 0 && values[j - 1] > key) {
    values[j] = values[j - 1];
    j--;
  }
  values[j] = key;
}`;
const CORE_SOURCE_START_LINE = sourceLineFor(
  INSERTION_SORT_SHIFT_OPTIMIZED_SOURCE,
  "for (size_t i = 1; i < count; i++)",
);

export function createInsertionSortTaskLesson(
  host: HTMLElement,
  options: LibraryTaskLessonOptions,
): LibraryTaskLesson {
  const ownerDocument = host.ownerDocument;
  let locale = options.locale;
  let entry = options.entry;
  let phase: LibraryTaskLessonPhase = "intro";
  let stage: LessonStage = "observe";
  let destroyed = false;
  let playbackTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let deferredTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let playbackSegmentStartedAt = 0;
  let playbackSegmentSemanticRemaining = 0;
  let playbackSegmentRate = 1;
  let controller = createInsertionController(createInsertionSortTeachingTimeline(NORMAL_INPUT));
  let timeline = createInsertionSortTeachingTimeline(NORMAL_INPUT);
  let normalObserveEnd = positionAfterOuter(timeline, 1);
  let practiceEnd = positionAfterOuter(timeline, 2);
  let stageStartPosition = 0;
  let stageEndPosition = normalObserveEnd;
  let selectedTokenId: string | null = null;
  let lastRejectedCode: string | null = null;
  let customErrorCode: InsertionSortCustomInputErrorCode | null = null;
  let keyReflectionCorrect = false;
  let orderReflectionCorrect = false;
  let dragState: DragState | null = null;
  let suppressClick = false;
  let renderRevision = 0;
  let displayedSourceEventId: string | null = null;
  const tokenElements = new Map<string, HTMLButtonElement>();
  const slotElements = new Map<number, HTMLButtonElement>();
  const motion = createTaskLessonMotionController();
  const elements = createLessonSurface(ownerDocument, entry, currentCopy(), startLesson);
  const ResizeObserverConstructor = ownerDocument.defaultView?.ResizeObserver;
  const relationResizeObserver =
    ResizeObserverConstructor === undefined
      ? null
      : new ResizeObserverConstructor(() => updateRelationLine());

  host.replaceChildren(elements.root);
  relationResizeObserver?.observe(elements.boardGrid);
  elements.root.addEventListener("keydown", handleRootKeydown);
  attachSurfaceEvents();
  options.onPhaseChange?.(phase);
  refreshAll(false);

  return Object.freeze({
    get phase(): LibraryTaskLessonPhase {
      return phase;
    },
    setLocale(nextLocale: InterfaceLocale, nextEntry: LibraryEntry): void {
      if (destroyed) return;
      locale = nextLocale;
      entry = nextEntry;
      refreshAll(false);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearPlayback();
      motion.destroy();
      relationResizeObserver?.disconnect();
      detachDocumentDragListeners();
      elements.root.removeEventListener("keydown", handleRootKeydown);
      host.replaceChildren();
    },
  });

  function currentCopy(): LessonCopy {
    return locale === "en" ? ENGLISH_COPY : CHINESE_COPY;
  }

  function setPhase(next: LibraryTaskLessonPhase): void {
    if (phase === next) return;
    phase = next;
    options.onPhaseChange?.(phase);
  }

  function startLesson(): void {
    setPhase("task");
    setStage("observe");
    refreshAll(false);
  }

  function resetLesson(nextPhase: LibraryTaskLessonPhase): void {
    clearPlayback();
    motion.cancel();
    timeline = createInsertionSortTeachingTimeline(NORMAL_INPUT);
    controller = createInsertionController(timeline);
    normalObserveEnd = positionAfterOuter(timeline, 1);
    practiceEnd = positionAfterOuter(timeline, 2);
    stageStartPosition = 0;
    stageEndPosition = normalObserveEnd;
    stage = "observe";
    selectedTokenId = null;
    lastRejectedCode = null;
    customErrorCode = null;
    displayedSourceEventId = null;
    keyReflectionCorrect = false;
    orderReflectionCorrect = false;
    setPhase(nextPhase);
    mountTimelineTokens();
    refreshAll(false);
    if (nextPhase === "task") focusStageEntry();
  }

  function setStage(next: LessonStage): void {
    clearPlayback();
    const playbackRate = controller.getSnapshot().playbackRate;
    selectedTokenId = null;
    lastRejectedCode = null;
    stage = next;
    displayedSourceEventId = null;
    if (next === "observe") {
      timeline = createInsertionSortTeachingTimeline(NORMAL_INPUT);
      controller = createInsertionController(timeline);
      normalObserveEnd = positionAfterOuter(timeline, 1);
      practiceEnd = positionAfterOuter(timeline, 2);
      stageStartPosition = 0;
      stageEndPosition = normalObserveEnd;
      mountTimelineTokens();
    } else if (next === "practice") {
      stageStartPosition = normalObserveEnd;
      stageEndPosition = practiceEnd;
      if (controller.getSnapshot().position !== stageStartPosition)
        controller.seek(stageStartPosition);
    } else if (next === "transfer") {
      timeline = createInsertionSortTeachingTimeline(TRANSFER_INPUT);
      controller = createInsertionController(timeline);
      controller.setRate(playbackRate);
      motion.setRate(playbackRate);
      stageStartPosition = positionBeforeOuter(timeline, 3);
      stageEndPosition = positionAfterOuter(timeline, 3);
      controller.seek(stageStartPosition);
      mountTimelineTokens();
    } else if (next === "experiment") {
      setExperimentTimeline(DEFAULT_EXPERIMENT_INPUT);
      elements.customInput.value = DEFAULT_EXPERIMENT_INPUT.join(", ");
    } else {
      stageStartPosition = controller.getSnapshot().position;
      stageEndPosition = controller.timeline.length;
    }
    refreshAll(false);
    focusStageEntry();
  }

  function setExperimentTimeline(values: readonly number[]): void {
    const playbackRate = controller.getSnapshot().playbackRate;
    clearPlayback();
    timeline = createInsertionSortTeachingTimeline(values);
    controller = createInsertionController(timeline);
    controller.setRate(playbackRate);
    motion.setRate(playbackRate);
    stageStartPosition = 0;
    stageEndPosition = timeline.events.length;
    selectedTokenId = null;
    customErrorCode = null;
    displayedSourceEventId = null;
    mountTimelineTokens();
    refreshAll(false);
  }

  function mountTimelineTokens(): void {
    tokenElements.clear();
    slotElements.clear();
    elements.boardGrid.replaceChildren(elements.keyTray, elements.relationSvg);
    elements.boardGrid.style.gridTemplateColumns = `repeat(${String(timeline.initialState.slots.length)}, minmax(48px, 72px))`;
    for (const slot of timeline.initialState.slots) {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.className = "library-task-stage__slot";
      button.dataset.teachingSlotIndex = String(slot.index);
      button.style.gridColumn = String(slot.index + 1);
      button.style.gridRow = "2";
      button.setAttribute("aria-label", `slot ${String(slot.index)}`);
      button.addEventListener("click", () => commitSelectedToSlot(slot.index));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        commitSelectedToSlot(slot.index);
      });
      slotElements.set(slot.index, button);
      elements.boardGrid.append(button);
    }
    for (const token of timeline.initialState.tokens) {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.className = "library-task-stage__token";
      button.dataset.teachingTokenId = token.id;
      button.textContent = String(token.value);
      button.setAttribute("aria-label", `${String(token.value)} · ${token.id}`);
      button.addEventListener("click", () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        selectToken(token.id);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectToken(token.id);
      });
      button.addEventListener("pointerdown", (event) => beginTokenDrag(event, token.id));
      tokenElements.set(token.id, button);
      elements.boardGrid.append(button);
    }
    elements.keyTray.style.gridColumn = `1 / span ${String(timeline.initialState.slots.length)}`;
  }

  function refreshAll(animate: boolean, eventKind?: InsertionSortTeachingEventKind): void {
    if (destroyed) return;
    const previous = animate ? motion.capture(tokenElements.values()) : new Map();
    const copy = currentCopy();
    const snapshot = controller.getSnapshot();
    const state = snapshot.state;
    renderRevision += 1;
    elements.root.dataset.taskLessonPhase = phase;
    elements.root.dataset.taskLessonStage = stage;
    elements.root.dataset.timelinePosition = String(snapshot.position);
    elements.root.dataset.playbackState = snapshot.playbackState;
    elements.root.dataset.playbackRate = String(snapshot.playbackRate);
    elements.root.dataset.hintLevel = String(snapshot.hintLevels.timeline ?? 0);
    elements.root.dataset.renderRevision = String(renderRevision);
    setHidden(elements.intro, phase !== "intro");
    setHidden(elements.workspace, phase !== "task");
    setHidden(elements.completion, phase !== "completed");
    refreshIntroCopy(elements.intro, copy);
    refreshHeader(copy);
    refreshStageCopy(copy);
    refreshBoard(copy, state, snapshot.nextEvent);
    if (animate) displayedSourceEventId = snapshot.lastEvent?.id ?? null;
    const sourceEvent = resolveDisplayedSourceEvent(snapshot);
    refreshSourceHighlight(copy, sourceEvent);
    refreshControls(copy);
    refreshFeedback(copy, snapshot.nextEvent);
    if (phase === "completed") {
      refreshCompletion(
        elements.completion,
        entry,
        copy,
        () => resetLesson("task"),
        () => resetLesson("intro"),
      );
    }
    if (animate && eventKind !== undefined) {
      const revision = renderRevision;
      void motion.animateFrom(previous, tokenElements.values(), eventKind).then(() => {
        updateRelationLine();
        if (destroyed || renderRevision !== revision) return;
        const currentSnapshot = controller.getSnapshot();
        displayedSourceEventId =
          currentSnapshot.nextEvent?.id ?? currentSnapshot.lastEvent?.id ?? null;
        refreshSourceHighlight(currentCopy(), resolveDisplayedSourceEvent(currentSnapshot));
      });
    } else {
      updateRelationLine();
    }
  }

  function refreshHeader(copy: LessonCopy): void {
    const stageIndex = STAGES.indexOf(stage);
    elements.lessonLabel.textContent = copy.introTitle;
    elements.stageLabel.textContent = copy.stageLabel(stageIndex + 1);
    elements.exitButton.textContent = copy.exit;
    for (const [index, item] of Array.from(elements.progress.children).entries()) {
      const stageId = STAGES[index]!;
      item.textContent = copy.stageNames[stageId];
      (item as HTMLElement).dataset.state =
        phase === "completed" || index < stageIndex
          ? "done"
          : index === stageIndex
            ? "active"
            : "pending";
    }
  }

  function refreshStageCopy(copy: LessonCopy): void {
    elements.title.textContent = copy.stageNames[stage];
    elements.instruction.textContent = copy.instructions[stage];
    elements.boundary.textContent = copy.evidenceBoundary;
    elements.facts.setAttribute("aria-label", locale === "en" ? "Run evidence" : "运行证据");
    elements.keyTrayLabel.textContent = copy.keyTray;
    elements.sourceView.setLabel(copy.sourceDisclosure);
    elements.customTitle.textContent = copy.customTitle;
    elements.customInput.placeholder = copy.customPlaceholder;
    elements.customRun.textContent = copy.runExperiment;
    elements.reflectionTitle.textContent = copy.reflectionTitle;
    elements.previous.textContent = copy.previous;
    elements.play.textContent =
      controller.getSnapshot().playbackState === "playing" ? copy.pause : copy.play;
    elements.next.textContent = copy.next;
    elements.timelineText.textContent = copy.timeline;
    elements.rateLabel.textContent = copy.rate;
    elements.resetRound.textContent = copy.resetRound;
    elements.undoStep.textContent = copy.undoStep;
    elements.showStep.textContent = copy.showStep;
    elements.predictShift.textContent = copy.predictShift;
    elements.predictStop.textContent = copy.predictStop;
    setHidden(elements.prediction, stage !== "practice" && stage !== "transfer");
    setHidden(elements.experiment, stage !== "experiment");
    setHidden(elements.reflection, stage !== "reflect");
    setHidden(elements.board, stage === "reflect");
    refreshReflectionQuestions(copy);
  }

  function refreshBoard(
    copy: LessonCopy,
    state: Readonly<InsertionSortTeachingSnapshot>,
    nextEvent: InsertionSortTeachingEvent | null,
  ): void {
    const manual = stage === "practice" || stage === "transfer";
    const tokenSlot = new Map<string, number>();
    for (const slot of state.slots) {
      if (slot.tokenId !== null) tokenSlot.set(slot.tokenId, slot.index);
      const element = slotElements.get(slot.index);
      if (element === undefined) continue;
      element.dataset.state = state.hole?.index === slot.index ? "hole" : "occupied";
      element.dataset.dropState = compatibleSlot(nextEvent, slot.index) ? "compatible" : "neutral";
      element.dataset.interactive = String(manual);
      element.tabIndex = manual ? 0 : -1;
      element.setAttribute("aria-disabled", String(!manual));
      element.setAttribute(
        "aria-label",
        `${locale === "en" ? "slot" : "槽位"} ${String(slot.index)}${state.hole?.index === slot.index ? ` · ${locale === "en" ? "open" : "空位"}` : ""}`,
      );
    }
    for (const token of state.tokens) {
      const element = tokenElements.get(token.id);
      if (element === undefined) continue;
      const held = state.key?.tokenId === token.id;
      const slotIndex = tokenSlot.get(token.id);
      element.style.gridColumn = String(
        (held ? (state.hole?.index ?? token.originIndex) : (slotIndex ?? token.originIndex)) + 1,
      );
      element.style.gridRow = held ? "1" : "2";
      element.dataset.state = tokenState(token.id, state, nextEvent);
      element.dataset.selected = String(selectedTokenId === token.id);
      element.dataset.interactive = String(manual);
      element.dataset.slotIndex = held ? "key" : String(slotIndex ?? token.originIndex);
      element.tabIndex = manual ? 0 : -1;
      element.setAttribute("aria-disabled", String(!manual));
      element.setAttribute("aria-pressed", String(selectedTokenId === token.id));
    }
    elements.keyTray.dataset.state = state.key === null ? "empty" : "holding";
    elements.keyTray.dataset.dropState = nextEvent?.kind === "pick-key" ? "compatible" : "neutral";
    elements.keyTray.dataset.interactive = String(manual);
    elements.keyTray.tabIndex = manual ? 0 : -1;
    elements.keyTray.setAttribute("aria-disabled", String(!manual));
    elements.keyTrayLabel.textContent =
      state.key === null
        ? `${copy.keyTray} · ${copy.keyEmpty}`
        : `${copy.keyTray} · ${String(state.key.value)}`;
    const relation = INSERTION_SORT_SEMANTIC_RELATIONS.find(
      (candidate) => candidate.id === state.activeRelationId,
    );
    elements.relationText.textContent =
      relation === undefined
        ? `${copy.activeRelation} · —`
        : `${copy.activeRelation} · ${relation.from} → ${relation.to} · ${copy.relationRoles[relation.id]}`;
    elements.relationText.dataset.semanticRelationId = relation?.id ?? "none";
    refreshFacts(copy, state);
  }

  function resolveDisplayedSourceEvent(
    snapshot: ReturnType<InsertionController["getSnapshot"]>,
  ): InsertionSortTeachingEvent | null {
    const displayed = timeline.events.find((event) => event.id === displayedSourceEventId);
    if (displayed !== undefined) return displayed;
    const fallback = snapshot.nextEvent ?? snapshot.lastEvent;
    displayedSourceEventId = fallback?.id ?? null;
    return fallback;
  }

  function refreshSourceHighlight(
    copy: LessonCopy,
    activeEvent: InsertionSortTeachingEvent | null,
  ): void {
    const activeIndex =
      activeEvent === null ? -1 : timeline.events.findIndex((event) => event.id === activeEvent.id);
    const previousLine = activeIndex > 0 ? timeline.events[activeIndex - 1]!.sourceLine : null;
    elements.sourceView.highlight({
      activeLine: activeEvent?.sourceLine ?? null,
      previousLine,
      status:
        activeEvent === null
          ? "—"
          : `${copy.sourceLine} ${String(activeEvent.sourceLine)} · ${copy.eventNames[activeEvent.kind]}`,
    });
  }

  function refreshFacts(copy: LessonCopy, state: Readonly<InsertionSortTeachingSnapshot>): void {
    const facts = [
      [copy.sortedPrefix, `0…${String(Math.max(0, state.sortedEnd))}`],
      [copy.comparisons, String(state.metrics.comparisons)],
      [copy.shifts, String(state.metrics.shifts)],
      [copy.writes, String(state.metrics.writes)],
    ] as const;
    const rows = Array.from(elements.facts.children) as HTMLElement[];
    for (const [index, [label, value]] of facts.entries()) {
      const row = rows[index];
      if (row === undefined) continue;
      const children = Array.from(row.children) as HTMLElement[];
      if (children[0] !== undefined) children[0].textContent = label;
      if (children[1] !== undefined) children[1].textContent = value;
    }
  }

  function refreshControls(copy: LessonCopy): void {
    const snapshot = controller.getSnapshot();
    const manual = stage === "practice" || stage === "transfer";
    const localMaximum = Math.max(0, stageEndPosition - stageStartPosition);
    const localPosition = Math.min(
      localMaximum,
      Math.max(0, snapshot.position - stageStartPosition),
    );
    elements.previous.disabled = snapshot.position <= stageStartPosition;
    elements.play.disabled = manual || stage === "reflect";
    elements.next.disabled = manual || stage === "reflect" || snapshot.position >= stageEndPosition;
    elements.seek.min = "0";
    elements.seek.max = String(localMaximum);
    elements.seek.value = String(localPosition);
    elements.seek.setAttribute("aria-valuemin", "0");
    elements.seek.setAttribute("aria-valuemax", String(localMaximum));
    elements.seek.setAttribute("aria-valuenow", String(localPosition));
    elements.seek.setAttribute(
      "aria-valuetext",
      `${String(localPosition)} / ${String(localMaximum)}`,
    );
    elements.seek.disabled = manual || stage === "reflect";
    elements.timelineText.textContent = `${copy.timeline} · ${String(localPosition)} / ${String(localMaximum)}`;
    elements.undoStep.disabled = snapshot.position <= stageStartPosition;
    elements.resetRound.disabled = snapshot.position === stageStartPosition;
    const hintLevel = snapshot.hintLevels.timeline ?? 0;
    elements.showStep.disabled = !manual || hintLevel < 3 || snapshot.nextEvent === null;
    for (const button of elements.rates) {
      const rate = Number(button.dataset.rate);
      button.dataset.selected = String(rate === snapshot.playbackRate);
      button.setAttribute("aria-pressed", String(rate === snapshot.playbackRate));
    }
  }

  function refreshFeedback(copy: LessonCopy, nextEvent: InsertionSortTeachingEvent | null): void {
    elements.expected.textContent =
      nextEvent === null ? copy.correct : copy.expectedAction[nextEvent.kind];
    const state = controller.getSnapshot().state;
    const status = copy.eventStatus(controller.getSnapshot().lastEvent, state);
    const hintLevel = controller.getSnapshot().hintLevels.timeline ?? 0;
    const hintIndex = stage === "transfer" ? 0 : Math.min(hintLevel, 3) - 1;
    const hint =
      nextEvent === null || hintLevel === 0 ? "" : (copy.hints[nextEvent.kind][hintIndex] ?? "");
    const rejection = lastRejectedCode === null ? "" : `${copy.tryAgain} · ${hint}`;
    elements.feedback.textContent = rejection.length > 0 ? rejection : status;
    elements.feedback.dataset.state = lastRejectedCode === null ? "neutral" : "incorrect";
    const predictionVisible =
      nextEvent?.kind === "compare" && (stage === "practice" || stage === "transfer");
    setHidden(elements.prediction, !predictionVisible);
    if (predictionVisible && nextEvent.kind === "compare") {
      const stateValues = insertionSortSnapshotValues(state);
      const left = stateValues[nextEvent.compareSlot];
      const right = state.key?.value;
      const expression =
        left === null || left === undefined || right === null || right === undefined
          ? copy.predictTitle
          : `${copy.predictTitle} · ${String(left)} > ${String(right)} ?`;
      const title = elements.prediction.firstElementChild as HTMLElement | null;
      if (title !== null) title.textContent = expression;
    }
    elements.customError.textContent =
      customErrorCode === null ? "" : copy.customErrors[customErrorCode];
  }

  function refreshReflectionQuestions(copy: LessonCopy): void {
    const questions = Array.from(elements.reflectionQuestions.children) as HTMLElement[];
    const definitions: readonly [ReflectionQuestion, string, readonly ReflectionChoice[]][] = [
      ["key", copy.reflectionKey, ["key-snapshot", "key-count", "key-output"]],
      ["order", copy.reflectionOrder, ["reverse", "sorted", "same"]],
    ];
    for (const [index, [question, prompt, choices]] of definitions.entries()) {
      const fieldset = questions[index];
      if (fieldset === undefined) continue;
      const legend = fieldset.firstElementChild as HTMLElement | null;
      if (legend !== null) legend.textContent = prompt;
      const buttons = Array.from(
        fieldset.querySelectorAll?.("button") ?? [],
      ) as HTMLButtonElement[];
      for (const [choiceIndex, button] of buttons.entries()) {
        const choice = choices[choiceIndex]!;
        button.textContent = copy.reflectionChoices[choice];
        const isCorrect = question === "key" ? choice === "key-snapshot" : choice === "reverse";
        const answered = question === "key" ? keyReflectionCorrect : orderReflectionCorrect;
        button.dataset.state = answered && isCorrect ? "correct" : "neutral";
      }
    }
  }

  function updateRelationLine(): void {
    const snapshot = controller.getSnapshot();
    const relationId = snapshot.state.activeRelationId;
    elements.relationSvg.replaceChildren();
    if (relationId === null || elements.board.hidden) return;
    const endpoints = relationEndpoints(snapshot.state, snapshot.lastEvent, relationId);
    if (endpoints === null) return;
    const from = endpoints.from.getBoundingClientRect?.();
    const to = endpoints.to.getBoundingClientRect?.();
    const board = elements.boardGrid.getBoundingClientRect?.();
    if (from === undefined || to === undefined || board === undefined) return;
    const path = createSvgElement(ownerDocument, "path");
    const x1 = from.left + from.width / 2 - board.left;
    const y1 = from.top + from.height / 2 - board.top;
    const x2 = to.left + to.width / 2 - board.left;
    const y2 = to.top + to.height / 2 - board.top;
    const bend = Math.max(18, Math.abs(x2 - x1) * 0.28);
    path.setAttribute(
      "d",
      `M ${String(x1)} ${String(y1)} C ${String(x1 + bend)} ${String(y1)}, ${String(x2 - bend)} ${String(y2)}, ${String(x2)} ${String(y2)}`,
    );
    path.setAttribute("vector-effect", "non-scaling-stroke");
    elements.relationSvg.append(path);
  }

  function relationEndpoints(
    state: Readonly<InsertionSortTeachingSnapshot>,
    event: InsertionSortTeachingEvent | null,
    relationId: InsertionSortRelationId,
  ): { readonly from: HTMLElement; readonly to: HTMLElement } | null {
    if (event === null) return null;
    if (relationId === "array-to-key" && event.kind === "pick-key") {
      const token = tokenElements.get(event.tokenId);
      const from = slotElements.get(event.fromSlot);
      return token === undefined || from === undefined ? null : { from, to: token };
    }
    if (relationId === "predecessor-to-condition" && event.kind === "compare") {
      const from = tokenElements.get(event.predecessorTokenId);
      const to = tokenElements.get(event.keyTokenId);
      return from === undefined || to === undefined ? null : { from, to };
    }
    if (relationId === "predecessor-to-slot" && event.kind === "shift") {
      const from = slotElements.get(event.fromSlot);
      const to = tokenElements.get(event.tokenId);
      return from === undefined || to === undefined ? null : { from, to };
    }
    if (relationId === "key-to-slot" && event.kind === "insert") {
      const to = tokenElements.get(event.tokenId);
      return to === undefined ? null : { from: elements.keyTray, to };
    }
    void state;
    return null;
  }

  function selectToken(tokenId: string): void {
    if (phase !== "task" || (stage !== "practice" && stage !== "transfer")) return;
    selectedTokenId = selectedTokenId === tokenId ? null : tokenId;
    refreshAll(false);
  }

  function commitSelectedToSlot(slotIndex: number): void {
    if (stage !== "practice" && stage !== "transfer") return;
    if (selectedTokenId === null) return;
    const next = controller.getSnapshot().nextEvent;
    if (next?.kind === "shift") {
      dispatchLearnerAction({
        type: "shift",
        tokenId: selectedTokenId,
        fromSlot: Number(tokenElements.get(selectedTokenId)?.dataset.slotIndex ?? -1),
        toSlot: slotIndex,
      });
    } else if (next?.kind === "insert") {
      dispatchLearnerAction({ type: "insert", tokenId: selectedTokenId, toSlot: slotIndex });
    } else {
      rejectNonAction();
    }
  }

  function commitSelectedToKeyTray(): void {
    if (stage !== "practice" && stage !== "transfer") return;
    if (selectedTokenId === null) return;
    const next = controller.getSnapshot().nextEvent;
    const slotIndex = Number(tokenElements.get(selectedTokenId)?.dataset.slotIndex ?? -1);
    if (next?.kind === "pick-key") {
      dispatchLearnerAction({ type: "pick-key", tokenId: selectedTokenId, fromSlot: slotIndex });
    } else {
      rejectNonAction();
    }
  }

  function rejectNonAction(): void {
    const next = controller.getSnapshot().nextEvent;
    if (next === null || next.kind === "settle") return;
    if (next.kind === "compare") {
      dispatchLearnerAction({ type: "prediction", shouldShift: !next.shouldShift });
    } else if (next.kind === "pick-key") {
      dispatchLearnerAction({ type: "pick-key", tokenId: "invalid", fromSlot: -1 });
    } else if (next.kind === "shift") {
      dispatchLearnerAction({ type: "shift", tokenId: "invalid", fromSlot: -1, toSlot: -1 });
    } else {
      dispatchLearnerAction({ type: "insert", tokenId: "invalid", toSlot: -1 });
    }
  }

  function dispatchLearnerAction(action: InsertionSortLearnerAction): void {
    clearPlayback();
    const next = controller.getSnapshot().nextEvent;
    if (next === null) return;
    const result = controller.dispatch(action);
    if (result.status === "rejected") {
      lastRejectedCode = result.reason;
      selectedTokenId = null;
      refreshAll(false);
      return;
    }
    lastRejectedCode = null;
    selectedTokenId = null;
    refreshAll(true, next.kind);
    if (result.snapshot.nextEvent?.kind === "settle") {
      scheduleDeferred(
        applyAutomaticStep,
        semanticDelay(
          readableSemanticDuration(next.durationMs),
          controller.getSnapshot().playbackRate,
        ),
      );
    } else {
      checkStageBoundary();
    }
  }

  function applyAutomaticStep(): void {
    const next = controller.getSnapshot().nextEvent;
    if (next === null) return;
    controller.stepForward();
    refreshAll(true, next.kind);
    if (controller.getSnapshot().position >= stageEndPosition) {
      scheduleDeferred(
        checkStageBoundary,
        semanticDelay(
          readableSemanticDuration(next.durationMs),
          controller.getSnapshot().playbackRate,
        ),
      );
    }
  }

  function checkStageBoundary(): void {
    const position = controller.getSnapshot().position;
    if (position < stageEndPosition) return;
    clearPlayback();
    if (stage === "observe") setStage("practice");
    else if (stage === "practice") setStage("transfer");
    else if (stage === "transfer") setStage("experiment");
    else if (stage === "experiment") setStage("reflect");
  }

  function stepForward(): void {
    if (stage === "practice" || stage === "transfer" || stage === "reflect") return;
    clearPlayback();
    const next = controller.getSnapshot().nextEvent;
    if (next === null || controller.getSnapshot().position >= stageEndPosition) return;
    // Pausing transport also pauses in-flight WAAPI animations. A discrete step is a new learner
    // command, so let its transition finish even though automatic playback remains paused.
    motion.play();
    controller.stepForward();
    refreshAll(true, next.kind);
    checkStageBoundary();
  }

  function stepBack(): void {
    clearPlayback();
    if (controller.getSnapshot().position <= stageStartPosition) return;
    const previousKind = controller.getSnapshot().lastEvent?.kind ?? "settle";
    // Keep reverse stepping symmetric with forward stepping after transport has been paused.
    motion.play();
    controller.stepBack();
    selectedTokenId = null;
    lastRejectedCode = null;
    refreshAll(true, previousKind);
  }

  function seek(position: number): void {
    clearPlayback();
    const safe = Math.max(stageStartPosition, Math.min(stageEndPosition, Math.round(position)));
    const snapshot = controller.seek(safe);
    selectedTokenId = null;
    lastRejectedCode = null;
    displayedSourceEventId =
      safe === stageStartPosition
        ? (snapshot.nextEvent?.id ?? snapshot.lastEvent?.id ?? null)
        : (snapshot.lastEvent?.id ?? snapshot.nextEvent?.id ?? null);
    motion.cancel();
    refreshAll(false);
    checkStageBoundary();
  }

  function startPlayback(): void {
    if (stage !== "observe" && stage !== "experiment") return;
    if (controller.getSnapshot().position >= stageEndPosition) {
      controller.seek(stageStartPosition);
      playbackSegmentSemanticRemaining = 0;
    }
    motion.play();
    controller.play();
    refreshAll(false);
    if (playbackSegmentSemanticRemaining > 0) {
      schedulePlaybackCompletion(playbackSegmentSemanticRemaining);
    } else {
      schedulePlayback();
    }
  }

  function togglePlayback(): void {
    if (controller.getSnapshot().playbackState === "playing") {
      pausePlayback();
      refreshAll(false);
    } else {
      startPlayback();
    }
  }

  function schedulePlayback(): void {
    if (destroyed || controller.getSnapshot().playbackState !== "playing") return;
    const next = controller.getSnapshot().nextEvent;
    if (next === null || controller.getSnapshot().position >= stageEndPosition) {
      clearPlayback();
      checkStageBoundary();
      return;
    }
    controller.stepForward();
    refreshAll(true, next.kind);
    schedulePlaybackCompletion(readableSemanticDuration(next.durationMs));
  }

  function schedulePlaybackCompletion(semanticRemaining: number): void {
    if (destroyed) return;
    playbackSegmentStartedAt = nowMs();
    playbackSegmentSemanticRemaining = semanticRemaining;
    playbackSegmentRate = controller.getSnapshot().playbackRate;
    playbackTimer = globalThis.setTimeout(
      () => {
        playbackTimer = null;
        playbackSegmentSemanticRemaining = 0;
        if (controller.getSnapshot().position >= stageEndPosition) {
          clearPlayback();
          checkStageBoundary();
        } else {
          schedulePlayback();
        }
      },
      semanticDelay(semanticRemaining, playbackSegmentRate),
    );
  }

  function scheduleDeferred(callback: () => void, delay: number): void {
    if (deferredTimer !== null) globalThis.clearTimeout(deferredTimer);
    deferredTimer = globalThis.setTimeout(() => {
      deferredTimer = null;
      if (!destroyed) callback();
    }, delay);
  }

  function clearPlayback(): void {
    if (playbackTimer !== null) globalThis.clearTimeout(playbackTimer);
    if (deferredTimer !== null) globalThis.clearTimeout(deferredTimer);
    playbackTimer = null;
    deferredTimer = null;
    playbackSegmentStartedAt = 0;
    playbackSegmentSemanticRemaining = 0;
    playbackSegmentRate = 1;
    controller.pause();
    motion.finish();
  }

  function pausePlayback(): void {
    if (playbackTimer !== null) {
      playbackSegmentSemanticRemaining = Math.max(
        0,
        playbackSegmentSemanticRemaining -
          (nowMs() - playbackSegmentStartedAt) * playbackSegmentRate,
      );
      globalThis.clearTimeout(playbackTimer);
      playbackTimer = null;
    }
    playbackSegmentStartedAt = 0;
    controller.pause();
    motion.pause();
  }

  function setRate(rate: number): void {
    const wasPlaying =
      controller.getSnapshot().playbackState === "playing" || playbackTimer !== null;
    const remaining =
      wasPlaying && playbackTimer !== null
        ? Math.max(
            0,
            playbackSegmentSemanticRemaining -
              (nowMs() - playbackSegmentStartedAt) * playbackSegmentRate,
          )
        : null;
    if (playbackTimer !== null) globalThis.clearTimeout(playbackTimer);
    playbackTimer = null;
    controller.setRate(rate);
    motion.setRate(rate);
    if (wasPlaying) {
      if (remaining === null) schedulePlayback();
      else schedulePlaybackCompletion(remaining);
    }
    refreshAll(false);
  }

  function resetRound(): void {
    clearPlayback();
    const rate = controller.getSnapshot().playbackRate;
    controller = createInsertionController(timeline);
    controller.setRate(rate);
    controller.seek(stageStartPosition);
    selectedTokenId = null;
    lastRejectedCode = null;
    displayedSourceEventId = null;
    refreshAll(false);
  }

  function demonstrateStep(): void {
    if (stage !== "practice" && stage !== "transfer") return;
    const next = controller.getSnapshot().nextEvent;
    if (next === null) return;
    controller.stepForward();
    lastRejectedCode = null;
    selectedTokenId = null;
    refreshAll(true, next.kind);
    if (controller.getSnapshot().nextEvent?.kind === "settle") {
      scheduleDeferred(
        applyAutomaticStep,
        semanticDelay(
          readableSemanticDuration(next.durationMs),
          controller.getSnapshot().playbackRate,
        ),
      );
    } else checkStageBoundary();
  }

  function focusStageEntry(): void {
    if (phase !== "task") return;
    const next = controller.getSnapshot().nextEvent;
    if (stage === "observe") {
      elements.play.focus({ preventScroll: true });
      return;
    }
    if (stage === "experiment") {
      elements.customInput.focus({ preventScroll: true });
      return;
    }
    if (stage === "reflect") {
      const firstChoice = descendants(elements.reflectionQuestions).find(
        (element) => element.tagName === "BUTTON",
      );
      firstChoice?.focus({ preventScroll: true });
      return;
    }
    if (next?.kind === "compare") {
      elements.predictShift.focus({ preventScroll: true });
      return;
    }
    const tokenId =
      next?.kind === "pick-key" || next?.kind === "shift" || next?.kind === "insert"
        ? next.tokenId
        : null;
    if (tokenId !== null) tokenElements.get(tokenId)?.focus({ preventScroll: true });
  }

  function submitPrediction(shouldShift: boolean): void {
    dispatchLearnerAction({ type: "prediction", shouldShift });
  }

  function submitCustomExperiment(): void {
    const parsed = parseInsertionSortCustomInput(elements.customInput.value);
    if (!parsed.ok) {
      customErrorCode = parsed.code;
      refreshAll(false);
      return;
    }
    setExperimentTimeline(parsed.values);
    startPlayback();
  }

  function answerReflection(question: ReflectionQuestion, choice: ReflectionChoice): void {
    const correct = question === "key" ? choice === "key-snapshot" : choice === "reverse";
    if (question === "key") keyReflectionCorrect = correct;
    else orderReflectionCorrect = correct;
    refreshAll(false);
    if (keyReflectionCorrect && orderReflectionCorrect) {
      setPhase("completed");
      refreshAll(false);
    }
  }

  function handleRootKeydown(event: KeyboardEvent): void {
    if (phase !== "task" || isInteractiveInput(event.target, event.key)) return;
    if (event.key === " ") {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepBack();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepForward();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setRate(nextRate(controller.getSnapshot().playbackRate, 1));
    } else if (event.key === "-") {
      event.preventDefault();
      setRate(nextRate(controller.getSnapshot().playbackRate, -1));
    }
  }

  function beginTokenDrag(event: PointerEvent, tokenId: string): void {
    if (stage !== "practice" && stage !== "transfer") return;
    if (event.button !== 0) return;
    const token = tokenElements.get(tokenId);
    if (token === undefined) return;
    dragState = {
      tokenId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      element: token,
    };
    token.setPointerCapture?.(event.pointerId);
    ownerDocument.addEventListener("pointermove", handleDocumentPointerMove);
    ownerDocument.addEventListener("pointerup", handleDocumentPointerUp);
    ownerDocument.addEventListener("pointercancel", handleDocumentPointerCancel);
  }

  function handleDocumentPointerMove(event: PointerEvent): void {
    if (dragState === null || event.pointerId !== dragState.pointerId) return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < 4) return;
    dragState.moved = true;
    dragState.element.dataset.dragging = "true";
    dragState.element.style.transform = `translate(${String(deltaX)}px, ${String(deltaY)}px)`;
    highlightDropTarget(event.clientX, event.clientY);
  }

  function handleDocumentPointerUp(event: PointerEvent): void {
    if (dragState === null || event.pointerId !== dragState.pointerId) return;
    const finished = dragState;
    detachDocumentDragListeners();
    finished.element.releasePointerCapture?.(finished.pointerId);
    finished.element.style.transform = "";
    delete finished.element.dataset.dragging;
    clearDropHighlights();
    dragState = null;
    if (!finished.moved) return;
    suppressClick = true;
    selectedTokenId = finished.tokenId;
    const target = findDropTarget(event.clientX, event.clientY);
    if (target === "key") commitSelectedToKeyTray();
    else if (typeof target === "number") commitSelectedToSlot(target);
    else {
      selectedTokenId = null;
      rejectNonAction();
    }
  }

  function handleDocumentPointerCancel(): void {
    if (dragState === null) return;
    dragState.element.style.transform = "";
    delete dragState.element.dataset.dragging;
    dragState = null;
    clearDropHighlights();
    detachDocumentDragListeners();
  }

  function detachDocumentDragListeners(): void {
    ownerDocument.removeEventListener("pointermove", handleDocumentPointerMove);
    ownerDocument.removeEventListener("pointerup", handleDocumentPointerUp);
    ownerDocument.removeEventListener("pointercancel", handleDocumentPointerCancel);
  }

  function highlightDropTarget(clientX: number, clientY: number): void {
    const target = findDropTarget(clientX, clientY);
    clearDropHighlights();
    if (target === "key") elements.keyTray.dataset.dragOver = "true";
    else if (typeof target === "number") {
      const slot = slotElements.get(target);
      if (slot !== undefined) slot.dataset.dragOver = "true";
    }
  }

  function clearDropHighlights(): void {
    delete elements.keyTray.dataset.dragOver;
    for (const slot of slotElements.values()) delete slot.dataset.dragOver;
  }

  function findDropTarget(clientX: number, clientY: number): "key" | number | null {
    const next = controller.getSnapshot().nextEvent;
    if (next?.kind === "pick-key" && containsPoint(elements.keyTray, clientX, clientY))
      return "key";
    for (const [index, slot] of slotElements) {
      if (compatibleSlot(next, index) && containsPoint(slot, clientX, clientY)) return index;
    }
    return null;
  }

  function attachSurfaceEvents(): void {
    elements.exitButton.addEventListener("click", () => resetLesson("intro"));
    elements.keyTray.addEventListener("click", commitSelectedToKeyTray);
    elements.previous.addEventListener("click", stepBack);
    elements.play.addEventListener("click", togglePlayback);
    elements.next.addEventListener("click", stepForward);
    elements.seek.addEventListener("input", () =>
      seek(stageStartPosition + Number(elements.seek.value)),
    );
    elements.resetRound.addEventListener("click", resetRound);
    elements.undoStep.addEventListener("click", stepBack);
    elements.showStep.addEventListener("click", demonstrateStep);
    elements.predictShift.addEventListener("click", () => submitPrediction(true));
    elements.predictStop.addEventListener("click", () => submitPrediction(false));
    elements.customRun.addEventListener("click", submitCustomExperiment);
    for (const button of elements.rates) {
      button.addEventListener("click", () => setRate(Number(button.dataset.rate)));
    }
    for (const element of descendants(elements.reflectionQuestions)) {
      const question = element.dataset.question as ReflectionQuestion | undefined;
      const choice = element.dataset.choice as ReflectionChoice | undefined;
      if (question === undefined || choice === undefined) continue;
      element.addEventListener("click", () => answerReflection(question, choice));
    }
  }
}

interface DragState {
  readonly tokenId: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
  readonly element: HTMLButtonElement;
}

function createInsertionController(timeline: InsertionSortTeachingTimeline): InsertionController {
  return createTaskLessonController({
    id: "lesson.task.insertion-sort.timeline",
    version: "2",
    title: "Insertion-sort semantic timeline",
    knowledgeComponents: [
      {
        id: "insertion-sort.semantic-move",
        title: "Insertion sort semantic move",
        description: "Pick a key, compare, shift larger predecessors, and insert the key.",
      },
    ],
    stages: [
      {
        id: "timeline",
        title: "Semantic timeline",
        instruction: "Advance only when the learner action matches the next semantic event.",
        knowledgeComponentIds: ["insertion-sort.semantic-move"],
        events: timeline.events,
        hints: ["hint-1", "hint-2", "hint-3"],
        validateAction({ action, snapshot }) {
          const expected = snapshot.nextEvent;
          if (expected === null) return { status: "rejected", reason: "timeline-complete" };
          const result = validateInsertionSortLearnerAction(expected, action);
          return result.accepted
            ? { status: "accepted", advanceBy: 1 }
            : { status: "rejected", reason: result.code };
        },
      },
    ],
    initialState: timeline.initialState,
    reduceEvent: (state, event) => reduceInsertionSortTeachingEvent(state, event),
  });
}

function positionBeforeOuter(timeline: InsertionSortTeachingTimeline, outerIndex: number): number {
  const index = timeline.events.findIndex((event) => event.outerIndex === outerIndex);
  if (index < 0) throw new RangeError(`教学时间线缺少第 ${String(outerIndex)} 轮`);
  return index;
}

function positionAfterOuter(timeline: InsertionSortTeachingTimeline, outerIndex: number): number {
  const index = timeline.events.findIndex(
    (event) => event.outerIndex === outerIndex && event.kind === "settle",
  );
  if (index < 0) throw new RangeError(`教学时间线缺少第 ${String(outerIndex)} 轮稳定事件`);
  return index + 1;
}

function compatibleSlot(event: InsertionSortTeachingEvent | null, slotIndex: number): boolean {
  return (
    (event?.kind === "shift" && event.toSlot === slotIndex) ||
    (event?.kind === "insert" && event.toSlot === slotIndex)
  );
}

function tokenState(
  tokenId: string,
  state: Readonly<InsertionSortTeachingSnapshot>,
  nextEvent: InsertionSortTeachingEvent | null,
): string {
  if (state.key?.tokenId === tokenId) return "key";
  if (nextEvent?.kind === "pick-key" && nextEvent.tokenId === tokenId) return "active";
  if (nextEvent?.kind === "compare") {
    if (nextEvent.predecessorTokenId === tokenId || nextEvent.keyTokenId === tokenId)
      return "active";
  }
  if (nextEvent?.kind === "shift" && nextEvent.tokenId === tokenId) return "active";
  if (nextEvent?.kind === "insert" && nextEvent.tokenId === tokenId) return "active";
  const slot = state.slots.find((candidate) => candidate.tokenId === tokenId);
  if (slot !== undefined && slot.index <= state.sortedEnd) return "sorted";
  return "inactive";
}

function containsPoint(element: HTMLElement, x: number, y: number): boolean {
  const rectangle = element.getBoundingClientRect?.();
  return (
    rectangle !== undefined &&
    x >= rectangle.left &&
    x <= rectangle.right &&
    y >= rectangle.top &&
    y <= rectangle.bottom
  );
}

function nowMs(): number {
  return Date.now();
}

function semanticDelay(durationMs: number, rate: number): number {
  return Math.max(0, durationMs / rate);
}

function readableSemanticDuration(durationMs: number): number {
  return readableTaskLessonSemanticDuration(durationMs, 2);
}

function sourceLineFor(source: string, fragment: string): number {
  const index = source.indexOf(fragment);
  if (index < 0) throw new Error(`教学源码缺少片段：${fragment}`);
  return source.slice(0, index).split("\n").length;
}

function nextRate(current: number, direction: -1 | 1): number {
  const rates = [0.5, 1, 1.5, 2] as const;
  const currentIndex = Math.max(0, rates.indexOf(current as (typeof rates)[number]));
  return rates[Math.max(0, Math.min(rates.length - 1, currentIndex + direction))]!;
}

function isInteractiveInput(target: EventTarget | null, key: string): boolean {
  if (target === null || typeof target !== "object") return false;
  const candidate = target as {
    readonly tagName?: string | undefined;
    readonly isContentEditable?: boolean | undefined;
  };
  const tagName = candidate.tagName?.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return true;
  if (candidate.isContentEditable === true) return true;
  return tagName === "BUTTON" && key === " ";
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden;
  element.setAttribute("aria-hidden", String(hidden));
}

function createSvgElement(ownerDocument: Document, tagName: string): SVGElement {
  if (typeof ownerDocument.createElementNS === "function") {
    return ownerDocument.createElementNS("http://www.w3.org/2000/svg", tagName);
  }
  return ownerDocument.createElement(tagName) as unknown as SVGElement;
}

function createLessonSurface(
  ownerDocument: Document,
  entry: LibraryEntry,
  copy: LessonCopy,
  onStart: () => void,
): StageElements {
  const root = section(ownerDocument, "library-task-lesson library-task-lesson--v2");
  root.classList.add("insertion-sort-stage");
  root.tabIndex = -1;

  const intro = section(ownerDocument, "library-task-lesson__intro");
  intro.dataset.surface = "intro";
  const introHeader = section(ownerDocument, "library-task-lesson__intro-header");
  introHeader.append(
    boundText(ownerDocument, "p", "intro-eyebrow", "library-task-lesson__eyebrow"),
    boundText(ownerDocument, "h2", "intro-title"),
    boundText(ownerDocument, "p", "intro-summary", "library-task-lesson__lead"),
    boundText(ownerDocument, "p", "intro-boundary", "library-task-lesson__boundary"),
  );
  const goals = section(ownerDocument, "library-task-lesson__goals");
  goals.append(boundText(ownerDocument, "h3", "goals-title"));
  const goalList = ownerDocument.createElement("ol");
  for (let index = 0; index < 4; index += 1) {
    const item = ownerDocument.createElement("li");
    item.append(
      text(ownerDocument, "span", String(index + 1).padStart(2, "0")),
      boundText(ownerDocument, "strong", `goal-${String(index)}`),
    );
    goalList.append(item);
  }
  goals.append(goalList);
  const introFooter = ownerDocument.createElement("footer");
  const start = actionButton(ownerDocument, "", "start", true);
  start.addEventListener("click", onStart);
  introFooter.append(start);
  intro.append(introHeader, goals, introFooter);

  const workspace = section(ownerDocument, "library-task-stage");
  workspace.dataset.surface = "task";
  const header = ownerDocument.createElement("header");
  header.className = "library-task-stage__header";
  const identity = section(ownerDocument, "library-task-stage__identity");
  const lessonLabel = ownerDocument.createElement("span");
  const stageLabel = ownerDocument.createElement("strong");
  identity.append(lessonLabel, stageLabel);
  const progress = ownerDocument.createElement("ol");
  progress.className = "library-task-stage__progress";
  for (const _stage of STAGES) progress.append(ownerDocument.createElement("li"));
  const exitButton = actionButton(ownerDocument, "", "exit", false);
  header.append(identity, progress, exitButton);

  const main = section(ownerDocument, "library-task-stage__main");
  const prompt = section(ownerDocument, "library-task-stage__prompt");
  const title = ownerDocument.createElement("h2");
  const instruction = ownerDocument.createElement("p");
  const boundary = ownerDocument.createElement("p");
  boundary.className = "library-task-lesson__boundary";
  prompt.append(title, instruction, boundary);

  const board = section(ownerDocument, "library-task-stage__board");
  board.classList.add("insertion-sort-stage__board");
  const boardGrid = section(ownerDocument, "library-task-stage__board-grid");
  boardGrid.classList.add("insertion-sort-stage__array");
  const keyTray = actionButton(ownerDocument, "", "key-tray", false);
  keyTray.className = "library-task-stage__key-tray";
  keyTray.classList.add("insertion-sort-stage__key-tray");
  keyTray.dataset.teachingTarget = "key";
  keyTray.style.gridRow = "1";
  const keyTrayLabel = ownerDocument.createElement("span");
  keyTray.append(keyTrayLabel);
  const relationSvg = createSvgElement(ownerDocument, "svg");
  relationSvg.classList.add("library-task-stage__relation-svg");
  relationSvg.setAttribute("aria-hidden", "true");
  boardGrid.append(keyTray, relationSvg);
  const relationText = ownerDocument.createElement("p");
  relationText.className = "library-task-stage__relation-text";
  relationText.setAttribute("aria-live", "polite");
  const sourceView = createTeachingSourceView(ownerDocument, {
    source: CORE_SOURCE,
    startLine: CORE_SOURCE_START_LINE,
  });
  board.append(boardGrid, relationText, sourceView.root);

  const side = section(ownerDocument, "library-task-stage__side");
  side.classList.add("insertion-sort-stage__evidence");
  const facts = ownerDocument.createElement("dl");
  facts.className = "library-task-stage__facts";
  facts.classList.add("insertion-sort-stage__facts");
  for (let index = 0; index < 4; index += 1) {
    const row = ownerDocument.createElement("div");
    row.append(ownerDocument.createElement("dt"), ownerDocument.createElement("dd"));
    facts.append(row);
  }
  const actionState = section(ownerDocument, "library-task-stage__action-state");
  actionState.classList.add("insertion-sort-stage__next-action");
  const expected = ownerDocument.createElement("strong");
  const feedback = ownerDocument.createElement("p");
  feedback.setAttribute("aria-live", "polite");
  actionState.append(expected, feedback);

  const prediction = section(ownerDocument, "library-task-stage__prediction");
  const predictionTitle = ownerDocument.createElement("strong");
  const predictShift = actionButton(ownerDocument, "", "predict-shift", true);
  const predictStop = actionButton(ownerDocument, "", "predict-stop", false);
  prediction.append(predictionTitle, predictShift, predictStop);

  const experiment = section(ownerDocument, "library-task-stage__experiment");
  const customTitle = ownerDocument.createElement("label");
  const customInput = ownerDocument.createElement("input");
  customInput.type = "text";
  customInput.dataset.taskLessonInput = "custom-values";
  customTitle.htmlFor = "insertion-sort-custom-values";
  customInput.id = "insertion-sort-custom-values";
  const customRun = actionButton(ownerDocument, "", "run-experiment", true);
  const customError = ownerDocument.createElement("p");
  customError.className = "library-task-stage__input-error";
  customError.setAttribute("aria-live", "polite");
  experiment.append(customTitle, customInput, customRun, customError);

  const reflection = section(ownerDocument, "library-task-stage__reflection");
  const reflectionTitle = ownerDocument.createElement("h3");
  const reflectionQuestions = section(ownerDocument, "library-task-stage__reflection-questions");
  reflectionQuestions.append(
    reflectionQuestion(ownerDocument, "key", ["key-snapshot", "key-count", "key-output"]),
    reflectionQuestion(ownerDocument, "order", ["reverse", "sorted", "same"]),
  );
  reflection.append(reflectionTitle, reflectionQuestions);
  side.append(facts, actionState, prediction, experiment);
  main.append(prompt, board, side, reflection);

  const controls = ownerDocument.createElement("footer");
  controls.className = "library-task-stage__controls";
  const transport = section(ownerDocument, "library-task-stage__transport");
  const previous = actionButton(ownerDocument, "", "previous", false);
  const play = actionButton(ownerDocument, "", "play-pause", true);
  const next = actionButton(ownerDocument, "", "next", false);
  const timelineLabel = ownerDocument.createElement("label");
  timelineLabel.className = "insertion-sort-stage__timeline";
  const timelineText = ownerDocument.createElement("span");
  timelineText.id = "insertion-sort-stage-timeline-label";
  const seek = ownerDocument.createElement("input");
  seek.type = "range";
  seek.step = "1";
  seek.dataset.taskLessonInput = "timeline";
  seek.setAttribute("aria-labelledby", timelineText.id);
  timelineLabel.append(timelineText, seek);
  transport.append(previous, play, next, timelineLabel);
  const speed = section(ownerDocument, "library-task-stage__speed");
  const rateLabel = ownerDocument.createElement("span");
  speed.append(rateLabel);
  const rates = [0.5, 1, 1.5, 2].map((rate) => {
    const button = actionButton(ownerDocument, `${String(rate)}×`, `rate-${String(rate)}`, false);
    button.dataset.rate = String(rate);
    speed.append(button);
    return button;
  });
  const recovery = section(ownerDocument, "library-task-stage__recovery");
  const undoStep = actionButton(ownerDocument, "", "undo-step", false);
  const resetRound = actionButton(ownerDocument, "", "reset-round", false);
  const showStep = actionButton(ownerDocument, "", "show-step", false);
  recovery.append(undoStep, resetRound, showStep);
  controls.append(transport, speed, recovery);
  workspace.append(header, main, controls);

  const completion = section(ownerDocument, "library-task-lesson__completion");
  completion.dataset.surface = "completion";
  root.append(intro, workspace, completion);
  refreshIntroCopy(intro, copy);
  void entry;
  return {
    root,
    intro,
    workspace,
    completion,
    lessonLabel,
    stageLabel,
    progress,
    exitButton,
    title,
    instruction,
    boundary,
    board,
    boardGrid,
    keyTray,
    keyTrayLabel,
    relationSvg,
    relationText,
    sourceView,
    facts,
    expected,
    feedback,
    prediction,
    predictShift,
    predictStop,
    experiment,
    customTitle,
    customInput,
    customRun,
    customError,
    reflection,
    reflectionTitle,
    reflectionQuestions,
    previous,
    play,
    next,
    seek,
    timelineLabel,
    timelineText,
    rates,
    resetRound,
    undoStep,
    showStep,
    rateLabel,
  };
}

function reflectionQuestion(
  ownerDocument: Document,
  question: ReflectionQuestion,
  choices: readonly ReflectionChoice[],
): HTMLElement {
  const fieldset = ownerDocument.createElement("fieldset");
  fieldset.dataset.question = question;
  fieldset.append(ownerDocument.createElement("legend"));
  for (const choice of choices) {
    const button = actionButton(ownerDocument, "", `reflect-${choice}`, false);
    button.dataset.question = question;
    button.dataset.choice = choice;
    fieldset.append(button);
  }
  return fieldset;
}

function refreshIntroCopy(host: HTMLElement, copy: LessonCopy): void {
  setBoundText(host, "intro-eyebrow", copy.introEyebrow);
  setBoundText(host, "intro-title", copy.introTitle);
  setBoundText(host, "intro-summary", copy.introSummary);
  setBoundText(host, "intro-boundary", copy.introBoundary);
  setBoundText(host, "goals-title", copy.goalsTitle);
  for (const [index, goal] of copy.goals.entries())
    setBoundText(host, `goal-${String(index)}`, goal);
  const start = findByDataset(host, "taskLessonAction", "start");
  if (start !== null) start.textContent = copy.start;
}

function refreshCompletion(
  host: HTMLElement,
  entry: LibraryEntry,
  copy: LessonCopy,
  onReplay: () => void,
  onIntro: () => void,
): void {
  const ownerDocument = host.ownerDocument;
  const header = section(ownerDocument, "library-task-lesson__completion-header");
  header.append(
    text(ownerDocument, "p", copy.completionEyebrow, "library-task-lesson__eyebrow"),
    text(ownerDocument, "h2", copy.completionTitle),
    text(ownerDocument, "p", copy.completionSummary, "library-task-lesson__lead"),
  );
  const signature = matchTextbookInsertionSortTutorialSignature(INSERTION_SORT_LAB_SOURCE);
  const recognition = section(ownerDocument, "library-task-lesson__completion-section");
  recognition.append(
    text(ownerDocument, "h3", copy.recognitionTitle),
    text(
      ownerDocument,
      "strong",
      `${copy.recognitionResult} · ${String(signature.matchedCount)}/${String(signature.totalCount)}`,
    ),
    text(ownerDocument, "p", copy.recognitionBoundary, "library-task-lesson__boundary"),
  );
  const evidence = ownerDocument.createElement("ul");
  for (const item of signature.evidence) {
    const row = ownerDocument.createElement("li");
    const sourceLine =
      item.sourceLine === null ? "—" : `${copy.sourceLine} ${String(item.sourceLine)}`;
    row.textContent = `${copy.evidence[item.id] ?? item.id} · ${sourceLine}`;
    evidence.append(row);
  }
  recognition.append(evidence);

  const cases = section(ownerDocument, "library-task-lesson__completion-section");
  cases.append(text(ownerDocument, "h3", copy.caseTitle));
  const table = ownerDocument.createElement("table");
  const body = ownerDocument.createElement("tbody");
  for (const labCase of INSERTION_SORT_LAB_CASES) {
    const finalState = createInsertionSortTeachingTimeline(labCase.input).finalState;
    const values = insertionSortSnapshotValues(finalState);
    const row = ownerDocument.createElement("tr");
    row.append(
      tableCell(ownerDocument, "th", copy.caseLabels[labCase.id] ?? labCase.id),
      tableCell(ownerDocument, "td", `${copy.caseInput} ${labCase.input.join(" ")}`),
      tableCell(ownerDocument, "td", `${copy.caseOutput} ${values.join(" ")}`),
    );
    body.append(row);
  }
  table.append(body);
  cases.append(table);

  const semantic = section(ownerDocument, "library-task-lesson__completion-section");
  semantic.append(
    text(ownerDocument, "h3", copy.semanticTitle),
    text(ownerDocument, "p", copy.semanticBoundary, "library-task-lesson__boundary"),
  );
  const relations = ownerDocument.createElement("ul");
  for (const relation of INSERTION_SORT_SEMANTIC_RELATIONS) {
    const item = ownerDocument.createElement("li");
    item.textContent = `${relation.from} → ${relation.to} · ${copy.relationRoles[relation.id]}`;
    relations.append(item);
  }
  semantic.append(relations);

  const details = section(ownerDocument, "library-task-lesson__completion-section");
  details.append(text(ownerDocument, "h3", copy.detailsTitle));
  for (const paragraph of entry.details) details.append(text(ownerDocument, "p", paragraph));
  if (entry.complexity != null) details.append(text(ownerDocument, "p", entry.complexity));
  const source = ownerDocument.createElement("details");
  const summary = ownerDocument.createElement("summary");
  summary.textContent = copy.fullSource;
  const pre = ownerDocument.createElement("pre");
  const code = ownerDocument.createElement("code");
  code.textContent = INSERTION_SORT_LAB_SOURCE;
  pre.append(code);
  source.append(summary, pre);
  details.append(source);

  const footer = ownerDocument.createElement("footer");
  const replay = actionButton(ownerDocument, copy.replayLesson, "replay-lesson", true);
  const intro = actionButton(ownerDocument, copy.backToIntro, "back-to-intro", false);
  replay.addEventListener("click", onReplay);
  intro.addEventListener("click", onIntro);
  footer.append(replay, intro);
  host.replaceChildren(header, recognition, cases, semantic, details, footer);
}

function boundText(
  ownerDocument: Document,
  tagName: string,
  key: string,
  className = "",
): HTMLElement {
  const element = text(ownerDocument, tagName, "", className);
  element.dataset.copyKey = key;
  return element;
}

function setBoundText(host: HTMLElement, key: string, value: string): void {
  const element = findByDataset(host, "copyKey", key);
  if (element !== null) element.textContent = value;
}

function findByDataset(host: HTMLElement, key: string, value: string): HTMLElement | null {
  for (const element of descendants(host)) {
    if (element.dataset[key] === value) return element;
  }
  return null;
}

function descendants(root: HTMLElement): readonly HTMLElement[] {
  const result: HTMLElement[] = [root];
  for (const child of Array.from(root.children)) {
    result.push(...descendants(child as HTMLElement));
  }
  return result;
}

function tableCell(ownerDocument: Document, tagName: "th" | "td", value: string): HTMLElement {
  return text(ownerDocument, tagName, value);
}

function actionButton(
  ownerDocument: Document,
  label: string,
  action: string,
  primary: boolean,
): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = primary ? "button button--primary" : "button button--quiet";
  button.dataset.taskLessonAction = action;
  button.textContent = label;
  return button;
}

function section(ownerDocument: Document, className: string): HTMLElement {
  const element = ownerDocument.createElement("section");
  element.className = className;
  return element;
}

function text(
  ownerDocument: Document,
  tagName: string,
  value: string,
  className = "",
): HTMLElement {
  const element = ownerDocument.createElement(tagName);
  element.className = className;
  element.textContent = value;
  return element;
}

const CHINESE_COPY: LessonCopy = Object.freeze({
  introEyebrow: "教程 9 · 中级 · 约 15 分钟",
  introTitle: "插入排序：连续语义实验",
  introSummary:
    "先用教材的相邻交换理解“当前值逐步向左”，再操作 key+右移的少写入优化对照。完成迁移与自由实验后解锁两种实现的证据。",
  introBoundary: "确定性教学模型 · 不写入项目 · 不冒充真实 Trace · 不计入性能历史",
  goalsTitle: "任务目标",
  goals: Object.freeze([
    "看懂 pick-key、compare、shift、insert、settle 五个语义事件",
    "预测比较结果，并用拖拽或键盘完成一次插入",
    "在重复值与自定义输入上迁移方法",
    "解释 key 暂存与输入顺序如何影响操作量",
  ]),
  start: "开始实验",
  exit: "退出实验",
  stageNames: Object.freeze({
    observe: "观察一次插入",
    practice: "完成下一轮",
    transfer: "重复值迁移",
    experiment: "自由实验",
    reflect: "解释与判断",
  }),
  stageLabel: (index: number) => `任务 ${String(index)}/5`,
  instructions: Object.freeze({
    observe:
      "系统演示 [5, 2, 4, 6, 1] 的第一轮：2 被保存为 key，5 右移，2 回填空槽。可随时暂停、回退或拖动时间轴。",
    practice:
      "轮到你处理 key=4。先把 key 拖到暂存区；每次比较做出预测，再把需要移动的元素接到空槽。",
    transfer: "在包含重复值的数组中完成 i=3 这一轮。相等元素不右移；本阶段只保留最少提示。",
    experiment: "输入 2–12 个整数并播放语义时间线。观察不同顺序如何改变比较、右移和写入次数。",
    reflect: "根据刚才的直接操作回答两个问题。两题都正确后，结构证据、案例和源码会解锁。",
  }),
  evidenceBoundary: "语义推演，不是运行时变量采样；操作计数仅用于本课。",
  keyTray: "key 暂存位",
  keyEmpty: "等待放入",
  sortedPrefix: "已排序前缀",
  comparisons: "比较",
  shifts: "右移",
  writes: "写入",
  activeRelation: "当前关系",
  sourceLine: "源码行",
  sourceDisclosure: "实时代码 · 与当前语义动作同步",
  previous: "上一步",
  play: "播放",
  pause: "暂停",
  next: "下一步",
  timeline: "时间轴",
  rate: "速度",
  resetRound: "重置本轮",
  undoStep: "撤销本步",
  predictTitle: "预测比较结果",
  predictShift: "成立，继续右移",
  predictStop: "不成立，停止右移",
  expectedAction: Object.freeze({
    "pick-key": "把当前元素拖到 key 暂存位",
    compare: "判断前驱元素是否大于 key",
    shift: "把较大的前驱元素拖进空槽",
    insert: "把 key 放回空槽",
    settle: "本轮状态正在稳定",
  }),
  eventNames: Object.freeze({
    "pick-key": "暂存 key",
    compare: "比较",
    shift: "右移",
    insert: "回填 key",
    settle: "稳定本轮",
  }),
  hintTitle: "提示",
  hints: Object.freeze({
    "pick-key": Object.freeze([
      "只看外层索引 i 指向的当前元素。",
      "这个值必须先离开数组，右移才不会覆盖它。",
      "半透明暂存位就是唯一合法目标。",
    ]),
    compare: Object.freeze([
      "当前只比较空槽左边的元素与 key。",
      "把两个数字代入 values[j - 1] > key。",
      "选择表达式实际得到的真假结果。",
    ]),
    shift: Object.freeze([
      "只移动空槽左边且比 key 大的元素。",
      "这个元素不是交换，而是复制到右侧空槽。",
      "半透明空槽就是唯一合法目标。",
    ]),
    insert: Object.freeze([
      "所有较大前驱都移开后，key 才能回到数组。",
      "从暂存位拿起 key，目标是当前空槽。",
      "半透明空槽就是唯一合法目标。",
    ]),
    settle: Object.freeze(["本轮已经完成。", "等待状态稳定。", "无需额外操作。"]),
  }),
  showStep: "演示本步",
  transferNote: "重复值保持相对顺序",
  customTitle: "自定义整数（2–12 个）",
  customPlaceholder: "例如 9, 3, 7, 1",
  runExperiment: "运行推演",
  customErrors: Object.freeze({
    empty: "请输入至少两个整数。",
    "invalid-token": "只接受用空格或逗号分隔的整数。",
    "unsafe-integer": "存在超出安全整数范围的值。",
    "too-few": "至少需要两个整数。",
    "too-many": "最多输入十二个整数。",
  }),
  reflectionTitle: "把操作转成算法解释",
  reflectionKey: "右移覆盖原槽位时，为什么当前元素不会丢失？",
  reflectionOrder: "在元素数量相同时，哪种输入通常触发更多右移？",
  reflectionChoices: Object.freeze({
    "key-snapshot": "values[i] 已先保存到 key",
    "key-count": "count 会自动保存当前元素",
    "key-output": "printf 会恢复被覆盖的值",
    reverse: "逆序输入",
    sorted: "已经升序的输入",
    same: "输入顺序不影响右移数量",
  }),
  correct: "正确，进入下一状态。",
  tryAgain: "这一步没有改变数组",
  completionEyebrow: "5/5 任务完成",
  completionTitle: "插入排序实验已完成",
  completionSummary: "以下内容现在作为你刚才操作的解释与证据展开，而不是课前信息负担。",
  recognitionTitle: "本课结构匹配",
  recognitionResult: "与教材相邻交换模板一致",
  recognitionBoundary: "这是限定本教程源码的 5/5 结构匹配，不代表平台可以识别任意 C 算法。",
  evidence: Object.freeze({
    "sorted-prefix": "外层循环从索引 1 开始",
    "adjacent-condition": "只比较相邻元素",
    temporary: "先暂存左侧元素",
    "swap-left": "当前元素向左交换",
    "swap-right": "暂存元素写回右侧",
    "key-snapshot": "当前元素保存为 key",
    "larger-predecessor": "只处理更大的前驱",
    "right-shift": "前驱右移一个槽位",
    "key-insert": "key 写回空位",
  }),
  caseTitle: "固定案例核对",
  caseLabels: Object.freeze({ normal: "普通", reverse: "逆序", duplicates: "重复值" }),
  caseInput: "输入",
  caseOutput: "输出",
  semanticTitle: "语义数据关系",
  semanticBoundary:
    "上方直接操作是 key+右移优化对照；这里的关系属于教学模型，不冒充通用 def-use 或真实 Trace 事实。",
  detailsTitle: "原理、复杂度与源码",
  fullSource: "查看完整 C 源码",
  replayLesson: "再来一遍",
  backToIntro: "返回介绍",
  relationRoles: Object.freeze({
    "array-to-key": "保存当前元素",
    "predecessor-to-condition": "判断是否继续右移",
    "predecessor-to-slot": "较大元素进入右侧空槽",
    "key-to-slot": "当前元素回填空槽",
  }),
  eventStatus: chineseEventStatus,
  comparison: (left: number, right: number, result: boolean) =>
    `${String(left)} > ${String(right)} 为${result ? "真" : "假"}`,
});

const ENGLISH_COPY: LessonCopy = Object.freeze({
  introEyebrow: "Tutorial 9 · Intermediate · about 15 min",
  introTitle: "Insertion sort: continuous semantic lab",
  introSummary:
    "Start with the textbook adjacent-swap path, then operate the lower-write key-and-shift optimization as a contrast. Both implementations unlock after transfer and free experimentation.",
  introBoundary:
    "Deterministic teaching model · no project writes · not real Trace · excluded from performance history",
  goalsTitle: "Task goals",
  goals: Object.freeze([
    "Read the pick-key, compare, shift, insert, and settle semantic events",
    "Predict comparisons and complete one insertion by drag or keyboard",
    "Transfer the method to duplicates and custom input",
    "Explain key preservation and how input order affects work",
  ]),
  start: "Start experiment",
  exit: "Exit experiment",
  stageNames: Object.freeze({
    observe: "Observe one insertion",
    practice: "Complete the next round",
    transfer: "Transfer with duplicates",
    experiment: "Free experiment",
    reflect: "Explain and judge",
  }),
  stageLabel: (index: number) => `Task ${String(index)}/5`,
  instructions: Object.freeze({
    observe:
      "The system demonstrates the first round of [5, 2, 4, 6, 1]: preserve 2 as key, shift 5, then insert 2. Pause, reverse, or seek at any time.",
    practice:
      "Now process key=4. Drag the key into temporary storage, predict each comparison, then move the required value into the open slot.",
    transfer:
      "Complete outer round i=3 in an array with duplicates. Equal values do not shift; this stage uses fewer hints.",
    experiment:
      "Enter 2–12 integers and play the semantic timeline. Compare how order changes comparisons, shifts, and writes.",
    reflect:
      "Use the actions you just performed to answer two questions. Both must be correct before structure evidence, cases, and source unlock.",
  }),
  evidenceBoundary:
    "Semantic replay, not sampled runtime variables; operation counts are lesson-only.",
  keyTray: "key storage",
  keyEmpty: "waiting",
  sortedPrefix: "Sorted prefix",
  comparisons: "Comparisons",
  shifts: "Shifts",
  writes: "Writes",
  activeRelation: "Active relation",
  sourceLine: "source line",
  sourceDisclosure: "Live code · synced with the current semantic action",
  previous: "Previous",
  play: "Play",
  pause: "Pause",
  next: "Next",
  timeline: "Timeline",
  rate: "Speed",
  resetRound: "Reset round",
  undoStep: "Undo step",
  predictTitle: "Predict the comparison",
  predictShift: "True — keep shifting",
  predictStop: "False — stop shifting",
  expectedAction: Object.freeze({
    "pick-key": "Drag the current value into key storage",
    compare: "Decide whether the predecessor is greater than key",
    shift: "Drag the larger predecessor into the open slot",
    insert: "Put key into the open slot",
    settle: "The round is settling",
  }),
  eventNames: Object.freeze({
    "pick-key": "pick key",
    compare: "compare",
    shift: "shift",
    insert: "insert key",
    settle: "settle round",
  }),
  hintTitle: "Hint",
  hints: Object.freeze({
    "pick-key": Object.freeze([
      "Look only at the current value selected by outer index i.",
      "It must leave the array before a shift can overwrite its slot.",
      "The translucent key tray is the only compatible target.",
    ]),
    compare: Object.freeze([
      "Compare only the value left of the open slot with key.",
      "Substitute both numbers into values[j - 1] > key.",
      "Choose the actual truth value of the expression.",
    ]),
    shift: Object.freeze([
      "Move only the value left of the hole that is greater than key.",
      "This is a copy into the right-hand hole, not a swap.",
      "The translucent hole is the only compatible target.",
    ]),
    insert: Object.freeze([
      "key returns only after all larger predecessors have moved.",
      "Take key from storage and target the current open slot.",
      "The translucent hole is the only compatible target.",
    ]),
    settle: Object.freeze([
      "The round is complete.",
      "Wait for the state to settle.",
      "No action is required.",
    ]),
  }),
  showStep: "Show this step",
  transferNote: "Equal values keep their relative order",
  customTitle: "Custom integers (2–12)",
  customPlaceholder: "For example: 9, 3, 7, 1",
  runExperiment: "Run replay",
  customErrors: Object.freeze({
    empty: "Enter at least two integers.",
    "invalid-token": "Use integers separated by spaces or commas only.",
    "unsafe-integer": "A value is outside the safe integer range.",
    "too-few": "At least two integers are required.",
    "too-many": "Enter no more than twelve integers.",
  }),
  reflectionTitle: "Turn the actions into an algorithm explanation",
  reflectionKey: "Why is the current value not lost when a shift overwrites its original slot?",
  reflectionOrder: "With the same number of values, which input usually causes more shifts?",
  reflectionChoices: Object.freeze({
    "key-snapshot": "values[i] was already preserved in key",
    "key-count": "count automatically preserves the current value",
    "key-output": "printf restores overwritten values",
    reverse: "Reverse-sorted input",
    sorted: "Already sorted input",
    same: "Input order does not affect the number of shifts",
  }),
  correct: "Correct — moving to the next state.",
  tryAgain: "The array did not change",
  completionEyebrow: "5/5 tasks complete",
  completionTitle: "Insertion-sort lab complete",
  completionSummary:
    "The material below now explains the actions and evidence you produced instead of front-loading them before the task.",
  recognitionTitle: "Lesson structure match",
  recognitionResult: "Matches the textbook adjacent-swap template",
  recognitionBoundary:
    "This is a 5/5 match for the lesson source only. It does not claim to recognize arbitrary C algorithms.",
  evidence: Object.freeze({
    "sorted-prefix": "Outer loop begins at index 1",
    "adjacent-condition": "Only adjacent values are compared",
    temporary: "The left value is preserved temporarily",
    "swap-left": "The current value swaps left",
    "swap-right": "The preserved value is written right",
    "key-snapshot": "Current value is preserved as key",
    "larger-predecessor": "Only larger predecessors are processed",
    "right-shift": "A predecessor shifts one slot right",
    "key-insert": "key is written into the open slot",
  }),
  caseTitle: "Fixed-case checks",
  caseLabels: Object.freeze({ normal: "Normal", reverse: "Reverse", duplicates: "Duplicates" }),
  caseInput: "input",
  caseOutput: "output",
  semanticTitle: "Semantic data relationships",
  semanticBoundary:
    "The direct-manipulation stage above is the key-and-shift optimization contrast. These relationships belong to the lesson model, not general def-use or real Trace facts.",
  detailsTitle: "Explanation, complexity, and source",
  fullSource: "View complete C source",
  replayLesson: "Try again",
  backToIntro: "Back to introduction",
  relationRoles: Object.freeze({
    "array-to-key": "Preserve the current value",
    "predecessor-to-condition": "Decide whether shifting continues",
    "predecessor-to-slot": "Move a larger value into the right-hand hole",
    "key-to-slot": "Insert the current value into the hole",
  }),
  eventStatus: englishEventStatus,
  comparison: (left: number, right: number, result: boolean) =>
    `${String(left)} > ${String(right)} is ${result ? "true" : "false"}`,
});

function chineseEventStatus(
  event: InsertionSortTeachingEvent | null,
  state: InsertionSortTeachingSnapshot,
): string {
  if (event === null) return "准备：数组对象保持稳定，等待第一个语义事件。";
  if (event.kind === "pick-key") return `已把 ${String(state.key?.value ?? "—")} 保存为 key。`;
  if (event.kind === "compare") {
    const values = insertionSortSnapshotValues(state);
    const left = values[event.compareSlot];
    return `${String(left)} > ${String(state.key?.value ?? "—")} 为${event.shouldShift ? "真" : "假"}。`;
  }
  if (event.kind === "shift")
    return `元素已从槽位 ${String(event.fromSlot)} 右移到 ${String(event.toSlot)}。`;
  if (event.kind === "insert") return `key 已回填到槽位 ${String(event.toSlot)}。`;
  return event.completed ? "全部轮次完成。" : `第 ${String(event.outerIndex)} 轮稳定。`;
}

function englishEventStatus(
  event: InsertionSortTeachingEvent | null,
  state: InsertionSortTeachingSnapshot,
): string {
  if (event === null) return "Ready: stable objects are waiting for the first semantic event.";
  if (event.kind === "pick-key") return `${String(state.key?.value ?? "—")} is preserved as key.`;
  if (event.kind === "compare") {
    const values = insertionSortSnapshotValues(state);
    const left = values[event.compareSlot];
    return `${String(left)} > ${String(state.key?.value ?? "—")} is ${event.shouldShift ? "true" : "false"}.`;
  }
  if (event.kind === "shift")
    return `The value moved from slot ${String(event.fromSlot)} to ${String(event.toSlot)}.`;
  if (event.kind === "insert") return `key was inserted into slot ${String(event.toSlot)}.`;
  return event.completed
    ? "All rounds are complete."
    : `Outer round ${String(event.outerIndex)} settled.`;
}
