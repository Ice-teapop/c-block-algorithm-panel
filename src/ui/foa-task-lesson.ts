import type {
  FoaLessonDefinition,
  FoaLessonMode,
  FoaLocale,
  FoaSemanticEvent,
} from "../tutorials/foa-contracts.js";
import { createFoaBlockTaskStage, isFoaBlockTaskMode } from "./foa-block-task-stage.js";
import { createFoaSemanticTaskStage } from "./foa-semantic-task-stage.js";
import { createTeachingSourceView } from "./teaching-source-view.js";
import type {
  FoaLocalEvidenceType,
  FoaTaskLesson,
  FoaTaskLessonOptions,
  FoaTaskLessonPhase,
  FoaVerifiedWorkspaceEvidence,
} from "./foa-task-lesson-contracts.js";

export type {
  FoaLocalEvidenceType,
  FoaTaskLesson,
  FoaTaskLessonLocalEvidence,
  FoaTaskLessonOptions,
  FoaTaskLessonPhase,
  FoaVerifiedWorkspaceEvidence,
} from "./foa-task-lesson-contracts.js";

interface Copy {
  readonly lesson: string;
  readonly start: string;
  readonly reset: string;
  readonly repeat: string;
  readonly backToIntro: string;
  readonly complete: string;
  readonly source: string;
  readonly activate: string;
  readonly confirm: string;
  readonly gap: string;
  readonly compose: string;
  readonly add: string;
  readonly remove: string;
  readonly moveLeft: string;
  readonly moveRight: string;
  readonly verify: string;
  readonly workspaceRequirement: string;
  readonly workspaceOnly: string;
  readonly workspaceReady: string;
  readonly workspaceRejected: string;
  workspaceProgress(completedCaseId: string, nextCaseId: string): string;
  readonly sequenceComplete: string;
  readonly incompleteComposition: string;
  readonly incorrect: string;
  readonly correct: string;
  readonly showFullSource: string;
  readonly showTaskCodeOnly: string;
  setupLinesHidden(count: number): string;
}

const COPY: Readonly<Record<FoaLocale, Copy>> = Object.freeze({
  zh: {
    lesson: "课程",
    start: "开始任务",
    reset: "重置",
    repeat: "再来一遍",
    backToIntro: "返回介绍",
    complete: "任务完成",
    source: "C 源码",
    activate: "激活此事件",
    confirm: "确认此块",
    gap: "补入缺失关键块",
    compose: "组合语义块",
    add: "加入顺序",
    remove: "移除",
    moveLeft: "左移",
    moveRight: "右移",
    verify: "在工作区验证",
    workspaceRequirement: "任务要求",
    workspaceOnly: "此课必须由外部真实运行证据完成；本地操作不会标记完成。",
    workspaceReady: "已收到匹配的外部验证证据。",
    workspaceRejected: "外部证据尚未匹配本课的完整预期输出。",
    workspaceProgress: (completedCaseId, nextCaseId) =>
      `案例 ${completedCaseId} 已通过；下一项：${nextCaseId}。`,
    sequenceComplete: "语义顺序已完成。",
    incompleteComposition: "先按时间线排完全部语义块。",
    incorrect: "顺序不对；查看当前高亮事件。",
    correct: "已确认。",
    showFullSource: "显示完整源码",
    showTaskCodeOnly: "只显示任务代码",
    setupLinesHidden: (count) => `${String(count)} 行环境代码已收起`,
  },
  en: {
    lesson: "Lesson",
    start: "Start task",
    reset: "Reset",
    repeat: "Try again",
    backToIntro: "Back to introduction",
    complete: "Task complete",
    source: "C source",
    activate: "Activate this event",
    confirm: "Confirm this block",
    gap: "Fill the missing key block",
    compose: "Compose semantic blocks",
    add: "Add to sequence",
    remove: "Remove",
    moveLeft: "Move left",
    moveRight: "Move right",
    verify: "Verify in workspace",
    workspaceRequirement: "Task requirement",
    workspaceOnly:
      "This lesson can only complete from external evidence of a real workspace run; local actions do not complete it.",
    workspaceReady: "Matching externally verified evidence was received.",
    workspaceRejected:
      "External evidence does not yet match this lesson's complete expected output.",
    workspaceProgress: (completedCaseId, nextCaseId) =>
      `Case ${completedCaseId} passed; next: ${nextCaseId}.`,
    sequenceComplete: "The semantic sequence is complete.",
    incompleteComposition: "Arrange every semantic block in timeline order first.",
    incorrect: "That is not the next event; inspect the highlighted event.",
    correct: "Confirmed.",
    showFullSource: "Show full source",
    showTaskCodeOnly: "Show task code only",
    setupLinesHidden: (count) => `${String(count)} setup lines hidden`,
  },
});

/**
 * Routes one FOA lesson to its renderer without owning persisted course state. Renderers may emit
 * bounded local evidence; verified workspace completion remains external.
 */
export function createFoaTaskLesson(
  host: HTMLElement,
  lesson: FoaLessonDefinition,
  options: FoaTaskLessonOptions,
): FoaTaskLesson {
  if (lesson.mode === "semantic") {
    return createFoaSemanticTaskStage(host, lesson, options);
  }
  if (isFoaBlockTaskMode(lesson.mode)) {
    return createFoaBlockTaskStage(host, lesson, options);
  }
  return createLegacyFoaTaskLesson(host, lesson, options);
}

function createLegacyFoaTaskLesson(
  host: HTMLElement,
  lesson: FoaLessonDefinition,
  options: FoaTaskLessonOptions,
): FoaTaskLesson {
  const ownerDocument = host.ownerDocument;
  let locale = options.locale;
  let phase: FoaTaskLessonPhase = "intro";
  let destroyed = false;
  let eventIndex = 0;
  let feedback = "";
  let composedIds: string[] = [];
  let reducedMotion = options.reducedMotion ?? prefersReducedMotion(ownerDocument);

  const root = ownerDocument.createElement("section");
  root.className = "library-task-lesson library-task-lesson--v2 foa-task-lesson";
  root.tabIndex = -1;
  host.replaceChildren(root);
  render();
  options.onPhaseChange?.(phase);

  return Object.freeze({
    get phase(): FoaTaskLessonPhase {
      return phase;
    },
    setLocale(nextLocale: FoaLocale): void {
      assertLive();
      locale = nextLocale;
      render();
    },
    setVerifiedWorkspaceEvidence(evidence: FoaVerifiedWorkspaceEvidence): void {
      assertLive();
      if (lesson.mode !== "workspace-evidence") return;
      if (isVerifiedWorkspaceEvidenceForLesson(evidence, lesson)) {
        feedback = copy().workspaceReady;
        eventIndex = Math.max(0, lesson.semanticEvents.length - 1);
        setPhase("completed");
      } else if (
        evidence.verified &&
        evidence.lessonId === lesson.id &&
        evidence.completedCaseId !== null &&
        evidence.nextCaseId !== null
      ) {
        feedback = copy().workspaceProgress(evidence.completedCaseId, evidence.nextCaseId);
        render();
      } else {
        feedback = copy().workspaceRejected;
        render();
      }
    },
    setReducedMotion(nextReducedMotion: boolean): void {
      assertLive();
      reducedMotion = nextReducedMotion;
      render();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      host.replaceChildren();
    },
  });

  function copy(): Copy {
    return COPY[locale];
  }

  function setPhase(next: FoaTaskLessonPhase): void {
    if (phase === next) {
      render();
      return;
    }
    phase = next;
    options.onPhaseChange?.(phase);
    render();
  }

  function reset(nextPhase: Extract<FoaTaskLessonPhase, "intro" | "task">): void {
    eventIndex = 0;
    composedIds = [];
    feedback = "";
    setPhase(nextPhase);
  }

  function completeLocal(): void {
    const type = localEvidenceType(lesson.mode);
    if (type === null) throw new Error("Workspace lessons require verified workspace evidence");
    options.onLocalEvidence?.(Object.freeze({ type, lessonId: lesson.id, complete: true }));
    feedback = copy().sequenceComplete;
    setPhase("completed");
  }

  function activate(event: FoaSemanticEvent): void {
    const expected = lesson.semanticEvents[eventIndex];
    if (expected?.id !== event.id) {
      feedback = copy().incorrect;
      render();
      return;
    }
    feedback = copy().correct;
    eventIndex += 1;
    if (eventIndex === lesson.semanticEvents.length) completeLocal();
    else render();
  }

  function fillGap(event: FoaSemanticEvent): void {
    const target =
      lesson.semanticEvents[2] ?? lesson.semanticEvents[lesson.semanticEvents.length - 1];
    if (target?.id !== event.id) {
      feedback = copy().incorrect;
      render();
      return;
    }
    eventIndex = Math.min(lesson.semanticEvents.length - 1, 2);
    completeLocal();
  }

  function confirmComposition(): void {
    if (
      composedIds.length !== lesson.semanticEvents.length ||
      composedIds.some((id, index) => id !== lesson.semanticEvents[index]?.id)
    ) {
      feedback = copy().incompleteComposition;
      render();
      return;
    }
    eventIndex = lesson.semanticEvents.length - 1;
    completeLocal();
  }

  function render(): void {
    if (destroyed) return;
    const strings = copy();
    root.dataset.locale = locale;
    root.dataset.phase = phase;
    root.dataset.reducedMotion = String(reducedMotion);
    root.dataset.visualFamily = lesson.experience.visualFamily;
    root.dataset.visualModel = lesson.experience.visualModel[locale];
    root.dataset.playbackPolicy = lesson.experience.playbackPolicy;
    root.setAttribute("aria-label", `${strings.lesson}: ${lesson.title[locale]}`);
    root.replaceChildren();

    if (phase === "intro") {
      const intro = el("div", "library-task-lesson__intro");
      intro.append(
        text(
          "span",
          "library-task-lesson__eyebrow",
          `${strings.lesson} ${lesson.order} · ${lesson.section}`,
        ),
        text("h2", "", lesson.title[locale]),
        text("p", "library-task-lesson__lead", lesson.summary[locale]),
      );
      const footer = el("footer");
      const start = button(strings.start, () => setPhase("task"), true);
      start.dataset.taskLessonAction = "start";
      footer.append(start);
      intro.append(footer);
      root.append(intro);
      return;
    }

    if (phase === "completed") {
      const completed = el("section", "library-task-lesson__completion");
      completed.append(
        text(
          "span",
          "library-task-lesson__eyebrow",
          lesson.mode === "workspace-evidence" ? strings.workspaceReady : strings.complete,
        ),
        text("h2", "", lesson.title[locale]),
        text("p", "", feedback || lesson.experience.persistentEvidence[locale]),
      );
      const footer = el("footer");
      const repeat = button(strings.repeat, () => reset("task"), true);
      repeat.dataset.taskLessonAction = "repeat";
      const backToIntro = button(strings.backToIntro, () => reset("intro"));
      backToIntro.dataset.taskLessonAction = "back-to-intro";
      footer.append(repeat, backToIntro);
      completed.append(footer);
      root.append(completed);
      return;
    }

    const task = el("section", "library-task-stage foa-task-lesson__stage");
    const header = el("header", "library-task-stage__header");
    const identity = el("div", "library-task-stage__identity");
    identity.append(
      text("span", "", `${strings.lesson} ${lesson.order} · ${lesson.section}`),
      text("strong", "", lesson.title[locale]),
    );
    const progress = ownerDocument.createElement("ol");
    progress.className = "library-task-stage__progress";
    for (const [index, event] of lesson.semanticEvents.entries()) {
      const item = text("li", "", String(index + 1).padStart(2, "0"));
      item.setAttribute("aria-label", event.label[locale]);
      item.dataset.state =
        index < eventIndex ? "done" : index === eventIndex ? "active" : "pending";
      progress.append(item);
    }
    header.append(
      identity,
      progress,
      button(strings.reset, () => reset("task")),
    );

    const main = el("div", "library-task-stage__main");
    const prompt = el("section", "library-task-stage__prompt");
    prompt.append(text("p", "", lesson.experience.primaryAction[locale]));

    const board = el("div", "library-task-stage__board foa-task-lesson__board");
    board.append(renderInteraction(strings), renderSource(strings));
    main.append(prompt, board);
    task.append(header, main);
    root.append(task);
  }

  function taskInstruction(strings: Copy): string {
    if (lesson.mode === "semantic") return strings.activate;
    if (lesson.mode === "block-observe") return strings.confirm;
    if (lesson.mode === "block-complete") return strings.gap;
    if (lesson.mode === "block-compose") return strings.compose;
    return strings.workspaceRequirement;
  }

  function renderInteraction(strings: Copy): HTMLElement {
    const section = el("section", "library-task-stage__action-state foa-task-lesson__interaction");
    const instruction = taskInstruction(strings);
    section.tabIndex = 0;
    section.setAttribute("role", "region");
    section.setAttribute("aria-label", instruction);
    section.append(text("strong", "", instruction));
    if (lesson.mode === "workspace-evidence") {
      const openWorkspace = button(strings.verify, () => options.onOpenWorkspace?.(), true);
      openWorkspace.dataset.taskLessonAction = "open-workspace";
      section.append(text("p", "", strings.workspaceOnly), openWorkspace);
      return section;
    }

    if (lesson.mode === "block-compose") {
      const available = el("div", "foa-task-lesson__blocks");
      for (const event of lesson.semanticEvents) {
        if (composedIds.includes(event.id)) continue;
        available.append(
          button(`${strings.add}: ${event.label[locale]}`, () => {
            composedIds = [...composedIds, event.id];
            eventIndex = Math.min(composedIds.length - 1, lesson.semanticEvents.length - 1);
            feedback = "";
            render();
          }),
        );
      }
      const sequence = ownerDocument.createElement("ol");
      sequence.className = "foa-task-lesson__composition";
      for (const [index, id] of composedIds.entries()) {
        const event = lesson.semanticEvents.find((candidate) => candidate.id === id);
        if (event === undefined) continue;
        const item = ownerDocument.createElement("li");
        item.append(
          text("span", "", event.label[locale]),
          button(strings.moveLeft, () => moveComposition(index, -1), false, index === 0),
          button(
            strings.moveRight,
            () => moveComposition(index, 1),
            false,
            index === composedIds.length - 1,
          ),
          button(strings.remove, () => {
            composedIds = composedIds.filter((candidate) => candidate !== id);
            feedback = "";
            render();
          }),
        );
        sequence.append(item);
      }
      section.append(available, sequence, button(strings.complete, confirmComposition, true));
      return section;
    }

    const candidates =
      lesson.mode === "block-complete" ? compatibleGapCandidates(lesson) : lesson.semanticEvents;
    const action =
      lesson.mode === "semantic"
        ? strings.activate
        : lesson.mode === "block-observe"
          ? strings.confirm
          : strings.gap;
    for (const event of candidates) {
      section.append(
        button(
          `${action}: ${event.label[locale]}`,
          () => {
            if (lesson.mode === "block-complete") fillGap(event);
            else activate(event);
          },
          eventIndex < lesson.semanticEvents.length,
          false,
          event.id,
        ),
      );
    }
    return section;
  }

  function moveComposition(index: number, direction: -1 | 1): void {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= composedIds.length) return;
    const next = [...composedIds];
    const current = next[index];
    next[index] = next[nextIndex]!;
    next[nextIndex] = current!;
    composedIds = next;
    feedback = "";
    render();
  }

  function renderSource(strings: Copy): HTMLElement {
    const sourceText = lesson.workspaceExercise?.initialSource ?? lesson.code.text;
    const activeLine = foaTaskEventLine(
      { code: { ...lesson.code, text: sourceText }, semanticEvents: lesson.semanticEvents },
      eventIndex,
    );
    const source = createTeachingSourceView(ownerDocument, {
      source: sourceText,
      startLine: 1,
      collapseBoilerplate: true,
    });
    source.root.className += " foa-task-lesson__source";
    source.setLabel(strings.source);
    source.setBoilerplateCopy({
      show: strings.showFullSource,
      hide: strings.showTaskCodeOnly,
      summary: strings.setupLinesHidden,
    });
    source.highlight({
      activeLine,
      previousLine: null,
      status: activeEvent()?.codeAnchor ?? "",
    });
    return source.root;
  }

  function activeEvent(): FoaSemanticEvent | null {
    return lesson.semanticEvents[Math.min(eventIndex, lesson.semanticEvents.length - 1)] ?? null;
  }

  function el(tagName: string, className = ""): HTMLElement {
    const element = ownerDocument.createElement(tagName);
    element.className = className;
    return element;
  }

  function text(tagName: string, className: string, value: string): HTMLElement {
    const element = el(tagName, className);
    element.textContent = value;
    return element;
  }

  function button(
    label: string,
    action: () => void,
    primary = false,
    disabled = false,
    eventId?: string,
  ): HTMLButtonElement {
    const element = ownerDocument.createElement("button");
    element.type = "button";
    element.className = primary ? "button button--primary" : "button";
    element.textContent = label;
    element.disabled = disabled;
    if (eventId !== undefined) element.dataset.semanticEventId = eventId;
    element.addEventListener("click", action);
    return element;
  }

  function assertLive(): void {
    if (destroyed) throw new Error("FoaTaskLesson 已销毁");
  }
}

/** Maps interactive lesson modes to local evidence; workspace-only modes return no local proof. */
export function localEvidenceType(mode: FoaLessonMode): FoaLocalEvidenceType | null {
  if (mode === "semantic") return "semantic-sequence-completed";
  if (mode === "block-observe") return "block-observation-completed";
  if (mode === "block-complete") return "block-gap-completed";
  if (mode === "block-compose") return "block-composition-completed";
  return null;
}

/** Accepts workspace evidence only when its verified lesson identity and mastery state match. */
export function isVerifiedWorkspaceEvidenceForLesson(
  evidence: FoaVerifiedWorkspaceEvidence,
  lesson: Readonly<{ readonly id: string }>,
): boolean {
  return evidence.verified && evidence.lessonId === lesson.id && evidence.mastered;
}

/** Display-only fallback for source highlighting; it is not structural or runtime verification. */
export function foaTaskEventLine(
  lesson: Pick<FoaLessonDefinition, "code" | "semanticEvents">,
  index: number,
): number {
  const event =
    lesson.semanticEvents[Math.max(0, Math.min(index, lesson.semanticEvents.length - 1))];
  if (event === undefined) return 1;
  const lines = lesson.code.text.split("\n");
  const anchor = event.codeAnchor;
  const needles =
    anchor === "scanf/input"
      ? ["scanf", "input"]
      : anchor === "printf/output"
        ? ["printf", "puts", "putchar"]
        : anchor === "FOA_STEP"
          ? ["FOA_STEP", "TODO("]
          : [anchor, "FOA_STEP"];
  for (const needle of needles) {
    const found = lines.findIndex((line) => line.includes(needle));
    if (found >= 0) return found + 1;
  }
  return 1;
}

function compatibleGapCandidates(lesson: FoaLessonDefinition): readonly FoaSemanticEvent[] {
  const target = lesson.semanticEvents[2];
  if (target === undefined) return lesson.semanticEvents;
  const decoys = lesson.semanticEvents.filter((event) => event.id !== target.id).slice(0, 2);
  return Object.freeze([target, ...decoys]);
}

function prefersReducedMotion(ownerDocument: Document): boolean {
  return (
    ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}
