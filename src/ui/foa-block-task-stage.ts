import type {
  FoaLessonDefinition,
  FoaLessonMode,
  FoaLocale,
  FoaSemanticEvent,
} from "../tutorials/foa-contracts.js";
import type { PanelApi } from "../shared/api.js";
import {
  buildFoaSourceBlockDescriptors,
  type FoaSourceBlockDescriptor,
} from "./foa-source-block-descriptors.js";
import { teachingBoilerplateLineNumbers } from "./teaching-source-view.js";
import {
  createTaskLessonMotionController,
  type TaskLessonMotionController,
  type TaskLessonMotionLayout,
} from "./task-lesson-motion.js";
import {
  createFoaTransitionPrototypeStage,
  isFoaTransitionPrototypeStageOrder,
  type FoaTransitionFrameSelection,
  type FoaTransitionPrototypeStage,
} from "./foa-transition-prototype-stage.js";

export type FoaBlockTaskStagePhase = "intro" | "task" | "completed";

export type FoaBlockTaskEvidenceType =
  "block-observation-completed" | "block-gap-completed" | "block-composition-completed";

export interface FoaBlockTaskStageLocalEvidence {
  readonly type: FoaBlockTaskEvidenceType;
  readonly lessonId: string;
  readonly complete: true;
}

/** Block-stage subset of the shared lesson options, with block-only local evidence. */
export interface FoaBlockTaskStageOptions {
  readonly locale: FoaLocale;
  readonly traceApi?: Pick<PanelApi, "startTrace" | "readTrace" | "cancelTrace"> | undefined;
  readonly onPhaseChange?: ((phase: FoaBlockTaskStagePhase) => void) | undefined;
  readonly onLocalEvidence?: ((evidence: FoaBlockTaskStageLocalEvidence) => void) | undefined;
  readonly reducedMotion?: boolean | undefined;
}

/** Block-stage lifecycle compatible with the shared lesson controller surface. */
export interface FoaBlockTaskStage {
  readonly phase: FoaBlockTaskStagePhase;
  setLocale(locale: FoaLocale): void;
  setVerifiedWorkspaceEvidence(evidence: unknown): void;
  setReducedMotion(reducedMotion: boolean): void;
  destroy(): void;
}

export {
  buildFoaSourceBlockDescriptors,
  type FoaSourceBlockDescriptor,
} from "./foa-source-block-descriptors.js";

type BlockMode = Extract<FoaLessonMode, "block-observe" | "block-complete" | "block-compose">;

interface Copy {
  readonly lesson: string;
  readonly start: string;
  readonly reset: string;
  readonly repeat: string;
  readonly backToIntro: string;
  readonly completed: string;
  readonly source: string;
  readonly candidateBank: string;
  readonly sequence: string;
  readonly verify: string;
  readonly correct: string;
  readonly incorrectObservation: string;
  readonly incorrectGap: string;
  readonly incorrectComposition: string;
  readonly gapLabel: string;
  readonly dragHint: string;
  readonly keyboardHint: string;
  readonly line: string;
  readonly sourceHidden: string;
  readonly showFullSource: string;
  readonly showTaskSource: string;
  hiddenSetup(count: number): string;
}

interface PointerDragState {
  readonly pointerId: number;
  readonly eventId: string;
  readonly role: "sequence" | "candidate";
  readonly block: HTMLButtonElement;
  readonly originLeft: number;
  readonly originTop: number;
  readonly grabOffsetX: number;
  readonly grabOffsetY: number;
  readonly originalDraggable: boolean;
  readonly originalPosition: string;
  readonly originalPointerEvents: string;
  readonly originalTransform: string;
  readonly originalWillChange: string;
  readonly originalZIndex: string;
  latestClientX: number;
  latestClientY: number;
  frameRequest: number | null;
  moved: boolean;
  dropTarget: HTMLElement | null;
}

export interface FoaPointerDragOffset {
  readonly x: number;
  readonly y: number;
}

/** Keeps the exact point grabbed by the learner under the pointer instead of snapping to centre. */
export function foaPointerDragOffset(
  origin: { readonly left: number; readonly top: number },
  grabOffset: { readonly x: number; readonly y: number },
  pointer: { readonly x: number; readonly y: number },
): FoaPointerDragOffset {
  return Object.freeze({
    x: pointer.x - grabOffset.x - origin.left,
    y: pointer.y - grabOffset.y - origin.top,
  });
}

const COPY: Readonly<Record<FoaLocale, Copy>> = Object.freeze({
  zh: {
    lesson: "课程",
    start: "开始积木任务",
    reset: "重置",
    repeat: "再来一遍",
    backToIntro: "返回介绍",
    completed: "任务完成",
    source: "真实 C 源码",
    candidateBank: "兼容候选",
    sequence: "执行顺序",
    verify: "验证顺序",
    correct: "结构与源码锚点一致。",
    incorrectObservation: "这不是当前执行块；请对照高亮源码。",
    incorrectGap: "该块端口兼容，但语义不匹配；缺口仍未完成。",
    incorrectComposition: "顺序尚未与语义时间线一致。",
    gapLabel: "缺失的关键块",
    dragHint: "拖到缺口，或单击候选。",
    keyboardHint: "拖拽重排；键盘可用方向键、Home 和 End。",
    line: "行",
    sourceHidden: "关键行已隐藏",
    showFullSource: "展开完整源码",
    showTaskSource: "只看任务代码",
    hiddenSetup: (count) => `已收起 ${String(count)} 行环境准备代码`,
  },
  en: {
    lesson: "Lesson",
    start: "Start block task",
    reset: "Reset",
    repeat: "Try again",
    backToIntro: "Back to introduction",
    completed: "Task complete",
    source: "Real C source",
    candidateBank: "Compatible candidates",
    sequence: "Execution sequence",
    verify: "Verify order",
    correct: "The structure matches the source anchors.",
    incorrectObservation:
      "That is not the current execution block; inspect the highlighted source.",
    incorrectGap: "The ports fit, but the semantics do not; the gap remains incomplete.",
    incorrectComposition: "The order does not yet match the semantic timeline.",
    gapLabel: "Missing key block",
    dragHint: "Drop into the gap, or click a candidate.",
    keyboardHint: "Drag to reorder; use Arrow keys, Home, or End from the keyboard.",
    line: "line",
    sourceHidden: "key line hidden",
    showFullSource: "Show full source",
    showTaskSource: "Show task code only",
    hiddenSetup: (count) => `${String(count)} setup lines hidden`,
  },
});

export function isFoaBlockTaskMode(mode: FoaLessonMode): mode is BlockMode {
  return mode === "block-observe" || mode === "block-complete" || mode === "block-compose";
}

export function initialFoaCompositionOrder(eventIds: readonly string[]): readonly string[] {
  if (eventIds.length < 2) return Object.freeze([...eventIds]);
  return Object.freeze([...eventIds.slice(1), eventIds[0]!]);
}

export function isFoaCompositionCorrect(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}

export function createFoaBlockTaskStage(
  host: HTMLElement,
  lesson: FoaLessonDefinition,
  options: FoaBlockTaskStageOptions,
): FoaBlockTaskStage {
  if (!isFoaBlockTaskMode(lesson.mode)) {
    throw new TypeError(`FOA block stage does not support mode ${lesson.mode}`);
  }
  const mode: BlockMode = lesson.mode;

  const ownerDocument = host.ownerDocument;
  const descriptors = buildFoaSourceBlockDescriptors(lesson);
  const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.eventId, descriptor]));
  const expectedIds = lesson.semanticEvents.map((event) => event.id);
  const gapTarget = lesson.semanticEvents[2] ?? lesson.semanticEvents.at(-1)!;
  const gapCandidates = [
    gapTarget,
    ...lesson.semanticEvents.filter((event) => event.id !== gapTarget.id).slice(0, 2),
  ];

  let locale = options.locale;
  let phase: FoaBlockTaskStagePhase = "intro";
  let reducedMotion = options.reducedMotion ?? prefersReducedMotion(ownerDocument);
  let destroyed = false;
  let activeIndex = 0;
  let gapComplete = false;
  let compositionIds = [...initialFoaCompositionOrder(expectedIds)];
  let draggingId: string | null = null;
  let feedbackKind: "idle" | "correct" | "incorrect" = "idle";
  let feedbackKey:
    | keyof Pick<Copy, "correct" | "incorrectObservation" | "incorrectGap" | "incorrectComposition">
    | null = null;
  let sourceExpanded = false;
  let motion: TaskLessonMotionController = createTaskLessonMotionController({ reducedMotion });
  let pointerDrag: PointerDragState | null = null;
  let prototypeFrameSelection: FoaTransitionFrameSelection | null = null;
  const suppressNextClick = new Set<string>();
  const localizedUpdates: Array<() => void> = [];

  const root = element("section", "foa-block-stage");
  // A lesson can be narrow inside a wide application window. Make the stage itself the source
  // of truth for the existing `@container tutorial-stage` rules.
  root.setAttribute("style", "container-name: tutorial-stage; container-type: inline-size;");
  root.tabIndex = -1;
  root.dataset.mode = mode;
  root.dataset.phase = phase;
  root.dataset.reducedMotion = String(reducedMotion);
  root.dataset.visualFamily = lesson.experience.visualFamily;
  root.dataset.playbackPolicy = lesson.experience.playbackPolicy;
  root.dataset.layoutBasis = "container";
  root.dataset.transitionPrototype = String(isFoaTransitionPrototypeStageOrder(lesson.order));

  const intro = element("section", "foa-block-stage__intro");
  const eyebrow = element("span", "foa-block-stage__eyebrow");
  bindText(eyebrow, () => `${copy().lesson} ${lesson.order} · ${lesson.section}`);
  const title = element("h2");
  bindText(title, () => lesson.title[locale]);
  const summary = element("p", "foa-block-stage__lead");
  bindText(summary, () => lesson.summary[locale]);
  const start = button("start", () => setPhase("task"), true);
  bindText(start, () => copy().start);
  intro.append(eyebrow, title, summary, start);

  const task = element("section", "foa-block-stage__task");
  task.hidden = true;
  const taskHeader = element("header", "foa-block-stage__header");
  const taskTitle = element("strong");
  bindTextAndTitle(taskTitle, () => `${copy().lesson} ${lesson.order} · ${lesson.title[locale]}`);
  const instruction = element("p", "foa-block-stage__instruction");
  bindTextAndTitle(instruction, () => lesson.experience.primaryAction[locale]);
  const reset = button("reset", () => resetStage("task"));
  bindText(reset, () => copy().reset);
  taskHeader.append(taskTitle, instruction, reset);

  const transitionPrototypeHost = element("div", "foa-block-stage__transition-prototype");
  transitionPrototypeHost.hidden = !isFoaTransitionPrototypeStageOrder(lesson.order);

  const workspace = element("div", "foa-block-stage__workspace");
  const interaction = element("section", "foa-block-stage__interaction");
  interaction.tabIndex = 0;
  interaction.setAttribute("role", "region");
  interaction.setAttribute("aria-live", "polite");
  const sequenceHeading = element("strong");
  bindText(sequenceHeading, () => copy().sequence);
  const sequence = element("ol", "foa-block-stage__sequence");
  const blockElements = new Map<string, HTMLButtonElement>();
  for (const event of lesson.semanticEvents) {
    const block = sourceBlock(event, descriptorById.get(event.id)!, "sequence");
    blockElements.set(event.id, block);
  }

  const gap = element("li", "foa-block-stage__gap");
  gap.dataset.taskLessonAction = "block-gap";
  gap.tabIndex = -1;
  gap.setAttribute("role", "group");
  const gapTitle = element("strong");
  bindText(gapTitle, () => copy().gapLabel);
  const gapHint = element("span");
  bindText(gapHint, () => copy().dragHint);
  gap.append(gapTitle, gapHint);
  gap.addEventListener("dragover", (event) => event.preventDefault());
  gap.addEventListener("drop", (event) => {
    event.preventDefault();
    const id = event.dataTransfer?.getData("text/plain") || draggingId;
    if (id !== null && id.length > 0) attemptGap(id);
  });

  if (lesson.mode === "block-observe") {
    for (const event of lesson.semanticEvents) sequence.append(blockElements.get(event.id)!);
  } else if (lesson.mode === "block-complete") {
    for (const event of lesson.semanticEvents) {
      if (event.id === gapTarget.id) sequence.append(gap);
      else sequence.append(blockElements.get(event.id)!);
    }
    const hiddenTarget = blockElements.get(gapTarget.id)!;
    hiddenTarget.hidden = true;
    gap.append(hiddenTarget);
  } else {
    for (const id of compositionIds) sequence.append(blockElements.get(id)!);
  }

  const candidateSection = element("section", "foa-block-stage__candidate-section");
  const candidateHeading = element("strong");
  bindText(candidateHeading, () => copy().candidateBank);
  const candidateBank = element("div", "foa-block-stage__candidate-bank");
  const candidateElements = new Map<string, HTMLButtonElement>();
  if (lesson.mode === "block-complete") {
    for (const event of gapCandidates) {
      const candidate = sourceBlock(event, descriptorById.get(event.id)!, "candidate");
      candidate.addEventListener("click", () => {
        if (suppressNextClick.delete(event.id)) return;
        attemptGap(event.id);
      });
      candidateElements.set(event.id, candidate);
      candidateBank.append(candidate);
    }
  }
  candidateSection.append(candidateHeading, candidateBank);
  candidateSection.hidden = lesson.mode !== "block-complete";

  const verify = button("verify-composition", verifyComposition, true);
  bindText(verify, () => copy().verify);
  verify.hidden = lesson.mode !== "block-compose";
  const keyboardHint = element("p", "foa-block-stage__hint");
  bindText(keyboardHint, () => copy().keyboardHint);
  keyboardHint.hidden = lesson.mode !== "block-compose";
  const feedback = element("p", "foa-block-stage__feedback");
  feedback.dataset.kind = feedbackKind;
  interaction.append(sequenceHeading, sequence, candidateSection, keyboardHint, verify, feedback);

  const evidence = element("aside", "foa-block-stage__evidence");
  const sourceSection = element("section", "foa-block-stage__source");
  const sourceHeader = element("header", "foa-block-stage__source-header");
  const sourceHeading = element("strong");
  bindText(sourceHeading, () => copy().source);
  const sourceAnchor = element("span", "foa-block-stage__source-anchor");
  const sourceHeaderActions = element("div", "foa-block-stage__source-actions");
  const sourceSummary = element("span", "foa-block-stage__source-summary");
  const sourceToggle = button("toggle-source-boilerplate", () => {
    sourceExpanded = !sourceExpanded;
    renderSourceVisibility();
  });
  sourceToggle.className = "foa-block-stage__source-toggle";
  const sourcePre = ownerDocument.createElement("pre");
  sourcePre.tabIndex = 0;
  sourcePre.setAttribute("role", "region");
  sourcePre.id = `foa-block-source-${String(lesson.order)}`;
  sourceToggle.setAttribute("aria-controls", sourcePre.id);
  const sourceCode = ownerDocument.createElement("code");
  const rawSourceLines = lesson.code.text.split("\n");
  const boilerplateLines = teachingBoilerplateLineNumbers(rawSourceLines);
  const sourceLines = rawSourceLines.map((line, index) => {
    const row = element("span", "foa-block-stage__source-line");
    row.dataset.sourceLine = String(index + 1);
    const gutter = element("span", "foa-block-stage__source-gutter");
    gutter.textContent = String(index + 1);
    const content = element("span", "foa-block-stage__source-content");
    content.textContent = line;
    row.append(gutter, content);
    sourceCode.append(row);
    return { row, content, original: line };
  });
  sourcePre.append(sourceCode);
  sourceHeaderActions.append(sourceAnchor, sourceSummary, sourceToggle);
  sourceHeader.append(sourceHeading, sourceHeaderActions);
  sourceSection.append(sourceHeader, sourcePre);

  evidence.append(sourceSection);
  workspace.append(interaction, evidence);
  task.append(taskHeader, transitionPrototypeHost, workspace);

  const completion = element("section", "foa-block-stage__completion");
  completion.hidden = true;
  const completionEyebrow = element("span", "foa-block-stage__eyebrow");
  bindText(completionEyebrow, () => copy().completed);
  const completionTitle = element("h2");
  bindText(completionTitle, () => lesson.title[locale]);
  const completionText = element("p");
  bindText(completionText, () => lesson.experience.persistentEvidence[locale]);
  const repeat = button("repeat", () => resetStage("task"), true);
  bindText(repeat, () => copy().repeat);
  const backToIntro = button("back-to-intro", () => resetStage("intro"));
  bindText(backToIntro, () => copy().backToIntro);
  completion.append(completionEyebrow, completionTitle, completionText, repeat, backToIntro);

  root.append(intro, task, completion);
  host.replaceChildren(root);
  const transitionPrototype: FoaTransitionPrototypeStage | null =
    isFoaTransitionPrototypeStageOrder(lesson.order)
      ? createFoaTransitionPrototypeStage(transitionPrototypeHost, lesson, {
          locale,
          reducedMotion,
          traceApi: options.traceApi,
          onFrameChange(selection): void {
            prototypeFrameSelection = selection;
            root.dataset.prototypeSourceLine = String(selection.sourceLine);
            root.dataset.prototypeSourceAnchorId = selection.sourceAnchorId;
            if (root.isConnected) renderStableState();
          },
        })
      : null;
  applyLocale();
  renderStableState();
  options.onPhaseChange?.(phase);

  return Object.freeze({
    get phase(): FoaBlockTaskStagePhase {
      return phase;
    },
    setLocale(nextLocale: FoaLocale): void {
      assertLive();
      locale = nextLocale;
      applyLocale();
      transitionPrototype?.setLocale(locale);
      renderStableState();
    },
    setVerifiedWorkspaceEvidence(_evidence: unknown): void {
      assertLive();
      // Block stages accept bounded local actions only, never workspace execution proof.
    },
    setReducedMotion(nextReducedMotion: boolean): void {
      assertLive();
      reducedMotion = nextReducedMotion;
      root.dataset.reducedMotion = String(reducedMotion);
      motion.destroy();
      motion = createTaskLessonMotionController({ reducedMotion });
      transitionPrototype?.setReducedMotion(reducedMotion);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cancelPointerDrag(false);
      transitionPrototype?.destroy();
      motion.destroy();
      host.replaceChildren();
    },
  });

  function copy(): Copy {
    return COPY[locale];
  }

  function bindText(target: HTMLElement, value: () => string): void {
    localizedUpdates.push(() => {
      target.textContent = value();
    });
  }

  function bindTextAndTitle(target: HTMLElement, value: () => string): void {
    localizedUpdates.push(() => {
      const text = value();
      target.textContent = text;
      target.title = text;
    });
  }

  function applyLocale(): void {
    root.dataset.locale = locale;
    root.setAttribute("aria-label", `${copy().lesson}: ${lesson.title[locale]}`);
    interaction.setAttribute("aria-label", copy().sequence);
    sourcePre.setAttribute("aria-label", copy().source);
    for (const update of localizedUpdates) update();
    sourceToggle.textContent = sourceExpanded ? copy().showTaskSource : copy().showFullSource;
    for (const event of lesson.semanticEvents) {
      const block = blockElements.get(event.id);
      if (block !== undefined) updateBlockLabel(block, event, descriptorById.get(event.id)!);
      const candidate = candidateElements.get(event.id);
      if (candidate !== undefined)
        updateBlockLabel(candidate, event, descriptorById.get(event.id)!);
    }
    updateFeedback();
  }

  function setPhase(next: FoaBlockTaskStagePhase): void {
    if (phase === next) return;
    phase = next;
    root.dataset.phase = phase;
    intro.hidden = phase !== "intro";
    task.hidden = phase === "intro";
    completion.hidden = phase !== "completed";
    options.onPhaseChange?.(phase);
    renderStableState();
  }

  function resetStage(nextPhase: Extract<FoaBlockTaskStagePhase, "intro" | "task">): void {
    cancelPointerDrag(false);
    motion.cancel();
    activeIndex = 0;
    gapComplete = false;
    compositionIds = [...initialFoaCompositionOrder(expectedIds)];
    draggingId = null;
    delete root.dataset.draggingEventId;
    feedbackKind = "idle";
    feedbackKey = null;
    transitionPrototype?.reset();
    transitionPrototypeHost.scrollTop = 0;
    transitionPrototypeHost.scrollLeft = 0;
    setPhase(nextPhase);
    renderStableState();
  }

  function complete(type: FoaBlockTaskEvidenceType): void {
    feedbackKind = "correct";
    feedbackKey = "correct";
    options.onLocalEvidence?.(Object.freeze({ type, lessonId: lesson.id, complete: true }));
    setPhase("completed");
  }

  function confirmObservation(id: string): void {
    const expected = expectedIds[activeIndex];
    if (id !== expected) {
      feedbackKind = "incorrect";
      feedbackKey = "incorrectObservation";
      renderStableState();
      return;
    }
    feedbackKind = "correct";
    feedbackKey = "correct";
    activeIndex += 1;
    if (activeIndex >= expectedIds.length) complete("block-observation-completed");
    else renderStableState();
  }

  function attemptGap(id: string): void {
    if (gapComplete) return;
    if (id !== gapTarget.id) {
      feedbackKind = "incorrect";
      feedbackKey = "incorrectGap";
      renderStableState();
      return;
    }
    gapComplete = true;
    activeIndex = expectedIds.indexOf(gapTarget.id);
    feedbackKind = "correct";
    feedbackKey = "correct";
    complete("block-gap-completed");
  }

  function verifyComposition(): void {
    if (!isFoaCompositionCorrect(compositionIds, expectedIds)) {
      feedbackKind = "incorrect";
      feedbackKey = "incorrectComposition";
      renderStableState();
      return;
    }
    activeIndex = expectedIds.length - 1;
    complete("block-composition-completed");
  }

  function moveComposition(
    id: string,
    targetIndex: number,
    presentationLayout: TaskLessonMotionLayout | null = null,
  ): void {
    const from = compositionIds.indexOf(id);
    if (from < 0) return;
    const bounded = Math.max(0, Math.min(targetIndex, compositionIds.length - 1));
    if (from === bounded) return;
    const before = presentationLayout ?? motion.capture(blockElements.values());
    const next = [...compositionIds];
    next.splice(from, 1);
    next.splice(bounded, 0, id);
    compositionIds = next;
    const mismatch = expectedIds.findIndex((expected, index) => compositionIds[index] !== expected);
    activeIndex = mismatch < 0 ? expectedIds.length - 1 : mismatch;
    feedbackKind = "idle";
    feedbackKey = null;
    renderStableState();
    void motion.animateFrom(before, blockElements.values(), "shift");
    blockElements.get(id)?.focus();
  }

  function sourceBlock(
    event: FoaSemanticEvent,
    descriptor: FoaSourceBlockDescriptor,
    role: "sequence" | "candidate",
  ): HTMLButtonElement {
    const block = ownerDocument.createElement("button");
    block.type = "button";
    block.className = "foa-block-stage__block";
    block.dataset.foaBlockEventId = event.id;
    block.dataset.blockRole = role;
    const canDrag =
      lesson.mode === "block-compose" || (lesson.mode === "block-complete" && role === "candidate");
    block.draggable = canDrag;
    block.dataset.teachingTokenId = event.id;
    if (canDrag) block.style.touchAction = "none";
    block.addEventListener("pointerdown", (pointerEvent) => {
      beginPointerDrag(block, event.id, role, canDrag, pointerEvent);
    });
    block.addEventListener("pointermove", updatePointerDrag);
    block.addEventListener("pointerup", finishPointerDrag);
    block.addEventListener("pointercancel", () => cancelPointerDrag(true));
    block.addEventListener("dragstart", (dragEvent) => {
      if (!canDrag) {
        dragEvent.preventDefault();
        return;
      }
      draggingId = event.id;
      dragEvent.dataTransfer?.setData("text/plain", event.id);
      if (dragEvent.dataTransfer !== null) dragEvent.dataTransfer.effectAllowed = "move";
      root.dataset.draggingEventId = event.id;
    });
    block.addEventListener("dragend", () => {
      draggingId = null;
      delete root.dataset.draggingEventId;
    });
    if (role === "sequence") {
      block.addEventListener("click", () => {
        if (lesson.mode === "block-observe") confirmObservation(event.id);
      });
      block.addEventListener("dragover", (dragEvent) => {
        if (lesson.mode === "block-compose") dragEvent.preventDefault();
      });
      block.addEventListener("drop", (dragEvent) => {
        if (lesson.mode !== "block-compose") return;
        dragEvent.preventDefault();
        const movedId = dragEvent.dataTransfer?.getData("text/plain") || draggingId;
        if (movedId === null || movedId.length === 0) return;
        moveComposition(movedId, compositionIds.indexOf(event.id));
      });
      block.addEventListener("keydown", (keyboardEvent) => {
        if (lesson.mode !== "block-compose") return;
        const index = compositionIds.indexOf(event.id);
        if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowUp") {
          keyboardEvent.preventDefault();
          moveComposition(event.id, index - 1);
        } else if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "ArrowDown") {
          keyboardEvent.preventDefault();
          moveComposition(event.id, index + 1);
        } else if (keyboardEvent.key === "Home") {
          keyboardEvent.preventDefault();
          moveComposition(event.id, 0);
        } else if (keyboardEvent.key === "End") {
          keyboardEvent.preventDefault();
          moveComposition(event.id, compositionIds.length - 1);
        }
      });
    }
    updateBlockLabel(block, event, descriptor);
    return block;
  }

  function updateBlockLabel(
    block: HTMLButtonElement,
    event: FoaSemanticEvent,
    descriptor: FoaSourceBlockDescriptor,
  ): void {
    block.replaceChildren();
    const meta = element("span", "foa-block-stage__block-meta");
    meta.textContent = `${event.label[locale]} · ${copy().line} ${descriptor.sourceLine}`;
    const code = element("code", "foa-block-stage__block-code");
    code.textContent = descriptor.sourceText;
    block.append(meta, code);
    meta.title = meta.textContent;
    code.title = descriptor.sourceText;
    block.title = `${event.label[locale]} · ${copy().line} ${String(descriptor.sourceLine)} · ${descriptor.sourceText}`;
    block.setAttribute(
      "aria-label",
      `${event.label[locale]}, ${copy().line} ${descriptor.sourceLine}: ${descriptor.sourceText}`,
    );
  }

  function renderStableState(): void {
    if (destroyed) return;
    root.dataset.phase = phase;
    root.dataset.reducedMotion = String(reducedMotion);
    root.dataset.visualModel = lesson.experience.visualModel[locale];
    root.dataset.activeEventId = expectedIds[Math.min(activeIndex, expectedIds.length - 1)] ?? "";
    root.dataset.gapComplete = String(gapComplete);

    if (lesson.mode === "block-compose") {
      for (const id of compositionIds) {
        const block = blockElements.get(id);
        if (block !== undefined) sequence.append(block);
      }
    } else if (lesson.mode === "block-complete") {
      gapTitle.hidden = gapComplete;
      gapHint.hidden = gapComplete;
      blockElements.get(gapTarget.id)!.hidden = !gapComplete;
    }

    const activeId = expectedIds[Math.min(activeIndex, expectedIds.length - 1)] ?? null;
    for (const [id, block] of blockElements) {
      const index = expectedIds.indexOf(id);
      block.dataset.state =
        lesson.mode === "block-observe"
          ? index < activeIndex
            ? "done"
            : id === activeId
              ? "active"
              : "pending"
          : id === activeId
            ? "active"
            : "idle";
      block.setAttribute("aria-pressed", String(id === activeId));
    }
    for (const [id, candidate] of candidateElements) {
      candidate.dataset.state = id === gapTarget.id && gapComplete ? "used" : "compatible";
      candidate.disabled = gapComplete;
    }

    const activeDescriptor = activeId === null ? null : (descriptorById.get(activeId) ?? null);
    const synchronizedSourceLine = prototypeFrameSelection?.sourceLine ?? null;
    const synchronizedSourceText = prototypeFrameSelection?.sourceText ?? null;
    sourceAnchor.textContent =
      synchronizedSourceLine !== null && synchronizedSourceText !== null
        ? `${copy().line} ${String(synchronizedSourceLine)} · ${synchronizedSourceText}`
        : activeDescriptor === null
          ? ""
          : `${copy().line} ${activeDescriptor.sourceLine} · ${activeDescriptor.sourceText}`;
    sourceAnchor.title = sourceAnchor.textContent;
    const hiddenLine = lesson.mode === "block-complete" ? descriptorById.get(gapTarget.id) : null;
    for (const [index, sourceLine] of sourceLines.entries()) {
      const lineNumber = index + 1;
      sourceLine.row.dataset.state =
        (synchronizedSourceLine ?? activeDescriptor?.sourceLine) === lineNumber ? "active" : "idle";
      const shouldHide = hiddenLine?.sourceLine === lineNumber && !gapComplete;
      sourceLine.row.dataset.redacted = String(shouldHide);
      sourceLine.content.textContent = shouldHide
        ? redactSourceRange(sourceLine.original, hiddenLine, copy().sourceHidden)
        : sourceLine.original;
    }

    renderSourceVisibility();

    updateFeedback();
  }

  function updateFeedback(): void {
    feedback.dataset.kind = feedbackKind;
    feedback.textContent = feedbackKey === null ? "" : copy()[feedbackKey];
  }

  function renderSourceVisibility(): void {
    const activeLine =
      prototypeFrameSelection?.sourceLine ??
      descriptorById.get(expectedIds[Math.min(activeIndex, expectedIds.length - 1)] ?? "")
        ?.sourceLine;
    sourceSection.dataset.boilerplateCollapsed = String(!sourceExpanded);
    sourceToggle.textContent = sourceExpanded ? copy().showTaskSource : copy().showFullSource;
    sourceToggle.setAttribute("aria-expanded", String(sourceExpanded));
    sourceToggle.hidden = boilerplateLines.size === 0;
    sourceSummary.hidden = sourceExpanded || boilerplateLines.size === 0;
    sourceSummary.textContent = sourceExpanded ? "" : copy().hiddenSetup(boilerplateLines.size);
    for (const [index, sourceLine] of sourceLines.entries()) {
      const lineNumber = index + 1;
      sourceLine.row.hidden =
        !sourceExpanded && boilerplateLines.has(lineNumber) && lineNumber !== activeLine;
    }
  }

  function beginPointerDrag(
    block: HTMLButtonElement,
    eventId: string,
    role: "sequence" | "candidate",
    canDrag: boolean,
    event: PointerEvent,
  ): void {
    if (!canDrag || event.button !== 0 || event.isPrimary === false || pointerDrag !== null) return;
    const rectangle = block.getBoundingClientRect();
    event.preventDefault();
    block.focus({ preventScroll: true });
    block.setPointerCapture?.(event.pointerId);
    pointerDrag = {
      pointerId: event.pointerId,
      eventId,
      role,
      block,
      originLeft: rectangle.left,
      originTop: rectangle.top,
      grabOffsetX: event.clientX - rectangle.left,
      grabOffsetY: event.clientY - rectangle.top,
      originalDraggable: block.draggable,
      originalPosition: block.style.position,
      originalPointerEvents: block.style.pointerEvents,
      originalTransform: block.style.transform,
      originalWillChange: block.style.willChange,
      originalZIndex: block.style.zIndex,
      latestClientX: event.clientX,
      latestClientY: event.clientY,
      frameRequest: null,
      moved: false,
      dropTarget: null,
    };
    block.draggable = false;
    block.style.position = "relative";
    block.style.pointerEvents = "none";
    block.style.willChange = "transform";
    block.style.zIndex = "4";
    root.dataset.draggingEventId = eventId;
    root.dataset.pointerDraggingEventId = eventId;
  }

  function updatePointerDrag(event: PointerEvent): void {
    const state = pointerDrag;
    if (state === null || state.pointerId !== event.pointerId) return;
    state.latestClientX = event.clientX;
    state.latestClientY = event.clientY;
    if (
      !state.moved &&
      Math.hypot(
        event.clientX - state.originLeft - state.grabOffsetX,
        event.clientY - state.originTop - state.grabOffsetY,
      ) < 4
    ) {
      return;
    }
    state.moved = true;
    event.preventDefault();
    if (state.frameRequest !== null) return;
    state.frameRequest = requestFrame(ownerDocument, () => {
      if (pointerDrag !== state) return;
      state.frameRequest = null;
      applyPointerDragFrame(state);
    });
  }

  function applyPointerDragFrame(state: PointerDragState): void {
    const offset = foaPointerDragOffset(
      { left: state.originLeft, top: state.originTop },
      { x: state.grabOffsetX, y: state.grabOffsetY },
      { x: state.latestClientX, y: state.latestClientY },
    );
    state.block.style.transform = `translate3d(${String(offset.x)}px, ${String(offset.y)}px, 0)`;
    setPointerDropTarget(state, pointerDropTarget(state));
  }

  function pointerDropTarget(state: PointerDragState): HTMLElement | null {
    const hit = ownerDocument.elementFromPoint?.(state.latestClientX, state.latestClientY);
    if (hit === null || hit === undefined || !root.contains(hit)) return null;
    if (mode === "block-complete" && state.role === "candidate") {
      return hit.closest<HTMLElement>('[data-task-lesson-action="block-gap"]');
    }
    if (mode === "block-compose" && state.role === "sequence") {
      const target = hit.closest<HTMLElement>(
        '.foa-block-stage__block[data-block-role="sequence"]',
      );
      return target?.dataset.foaBlockEventId === state.eventId ? null : target;
    }
    return null;
  }

  function setPointerDropTarget(state: PointerDragState, target: HTMLElement | null): void {
    if (state.dropTarget === target) return;
    if (state.dropTarget !== null) delete state.dropTarget.dataset.pointerDropState;
    state.dropTarget = target;
    if (target !== null) target.dataset.pointerDropState = "compatible";
  }

  function finishPointerDrag(event: PointerEvent): void {
    const state = pointerDrag;
    if (state === null || state.pointerId !== event.pointerId) return;
    state.latestClientX = event.clientX;
    state.latestClientY = event.clientY;
    if (state.moved) applyPointerDragFrame(state);
    const target = state.dropTarget;
    const presentation = motion.capture(blockElements.values());
    const moved = state.moved;
    const eventId = state.eventId;
    const role = state.role;
    restorePointerDrag(state);
    if (!moved) return;
    suppressNextClick.add(eventId);
    ownerDocument.defaultView?.setTimeout(() => suppressNextClick.delete(eventId), 0);
    if (mode === "block-complete" && role === "candidate" && target === gap) {
      attemptGap(eventId);
      return;
    }
    if (mode === "block-compose" && role === "sequence" && target !== null) {
      const targetId = target.dataset.foaBlockEventId;
      if (targetId !== undefined) {
        moveComposition(eventId, compositionIds.indexOf(targetId), presentation);
        return;
      }
    }
    void motion.animateFrom(presentation, blockElements.values(), "settle");
  }

  function cancelPointerDrag(animateReturn: boolean): void {
    const state = pointerDrag;
    if (state === null) return;
    const presentation = animateReturn ? motion.capture(blockElements.values()) : null;
    restorePointerDrag(state);
    if (presentation !== null) {
      void motion.animateFrom(presentation, blockElements.values(), "settle");
    }
  }

  function restorePointerDrag(state: PointerDragState): void {
    if (state.frameRequest !== null) cancelFrame(ownerDocument, state.frameRequest);
    setPointerDropTarget(state, null);
    if (state.block.hasPointerCapture?.(state.pointerId) === true) {
      state.block.releasePointerCapture(state.pointerId);
    }
    state.block.draggable = state.originalDraggable;
    state.block.style.position = state.originalPosition;
    state.block.style.pointerEvents = state.originalPointerEvents;
    state.block.style.transform = state.originalTransform;
    state.block.style.willChange = state.originalWillChange;
    state.block.style.zIndex = state.originalZIndex;
    delete root.dataset.draggingEventId;
    delete root.dataset.pointerDraggingEventId;
    pointerDrag = null;
  }

  function element(tagName: string, className = ""): HTMLElement {
    const node = ownerDocument.createElement(tagName);
    node.className = className;
    return node;
  }

  function button(action: string, listener: () => void, primary = false): HTMLButtonElement {
    const node = ownerDocument.createElement("button");
    node.type = "button";
    node.className = primary ? "button button--primary" : "button";
    node.dataset.taskLessonAction = action;
    node.addEventListener("click", listener);
    return node;
  }

  function assertLive(): void {
    if (destroyed) throw new Error("FoaBlockTaskStage has been destroyed");
  }
}

function redactSourceRange(
  sourceLine: string,
  descriptor: FoaSourceBlockDescriptor,
  replacement: string,
): string {
  const start = descriptor.sourceColumnStart - 1;
  const end = descriptor.sourceColumnEnd - 1;
  return `${sourceLine.slice(0, start)}/* ${replacement} */${sourceLine.slice(end)}`;
}

function prefersReducedMotion(ownerDocument: Document): boolean {
  return (
    ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

function requestFrame(ownerDocument: Document, callback: FrameRequestCallback): number {
  return ownerDocument.defaultView?.requestAnimationFrame?.(callback) ?? fallbackFrame(callback);
}

function cancelFrame(ownerDocument: Document, request: number): void {
  if (request < 0) return;
  ownerDocument.defaultView?.cancelAnimationFrame?.(request);
}

function fallbackFrame(callback: FrameRequestCallback): number {
  queueMicrotask(() => callback(globalThis.performance?.now() ?? 0));
  return -1;
}
