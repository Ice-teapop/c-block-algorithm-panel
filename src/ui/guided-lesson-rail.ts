import type { InterfaceLocale } from "./interface-preferences.js";

export type GuidedLessonRequirementStatus = "pending" | "passed" | "failed";
export type GuidedLessonStatusState = "idle" | "working" | "success" | "error";
export type GuidedLessonHintLevel = 0 | 1 | 2 | 3;

export interface GuidedLessonRequirementSnapshot {
  readonly label: string;
  readonly status: GuidedLessonRequirementStatus;
  readonly detail?: string | undefined;
}

export interface GuidedLessonPredictionRow {
  readonly iteration: string;
  readonly input: string;
  readonly comparison: string;
  readonly maximum: string;
}

export interface GuidedLessonStatusSnapshot {
  readonly state: GuidedLessonStatusState;
  readonly message: string;
}

export interface GuidedLessonVisualGuideSnapshot {
  readonly phase: string;
  readonly title: string;
  readonly explanation: string;
  readonly facts: readonly Readonly<{ label: string; description: string }>[];
  readonly question: string | null;
  readonly options: readonly Readonly<{ id: string; label: string }>[];
  readonly selectedOptionId: string | null;
  readonly feedback: string | null;
  readonly feedbackState: "idle" | "incorrect" | "correct";
}

/**
 * A presentation-only snapshot. The rail deliberately does not import the lesson controller so
 * the evidence state machine remains independently testable and replaceable.
 */
export interface GuidedLessonRailSnapshot {
  readonly lessonLabel: string;
  readonly missionIndex: number;
  readonly missionCount: number;
  readonly title: string;
  readonly instruction: string;
  readonly requirements: readonly GuidedLessonRequirementSnapshot[];
  readonly canAdvance: boolean;
  readonly expandedWhy: boolean;
  readonly hintLevel: GuidedLessonHintLevel;
  readonly predictionRows: readonly GuidedLessonPredictionRow[];
  readonly busy: boolean;
  readonly status: GuidedLessonStatusSnapshot;
  readonly visualGuide?: GuidedLessonVisualGuideSnapshot | undefined;
  readonly why?: string | undefined;
  readonly hints?: readonly string[] | undefined;
  readonly showPrepareSkeleton?: boolean | undefined;
  readonly showInjectBug?: boolean | undefined;
}

export interface GuidedLessonRailCallbacks {
  readonly onLocate: () => void;
  readonly onToggleWhy: () => void;
  readonly onNextHint: () => void;
  readonly onReset: () => void;
  readonly onExit: () => void;
  readonly onNext: () => void;
  readonly onPrepareSkeleton: () => void;
  readonly onInjectBug: () => void;
  readonly onVisualAnswer: (answerId: string) => void;
}

export interface GuidedLessonRail {
  readonly element: HTMLElement;
  update(snapshot: GuidedLessonRailSnapshot): void;
  destroy(): void;
}

interface GuidedLessonRailCopy {
  readonly requirementLabels: Readonly<Record<GuidedLessonRequirementStatus, string>>;
  readonly requirements: string;
  readonly predictionSummary: string;
  readonly predictionNote: string;
  readonly predictionCaption: string;
  readonly predictionHeaders: readonly [string, string, string, string];
  readonly why: string;
  readonly hintProgress: (level: GuidedLessonHintLevel) => string;
  readonly firstHint: string;
  readonly nextHint: string;
  readonly prepareSkeleton: string;
  readonly injectBug: string;
  readonly locate: string;
  readonly reset: string;
  readonly exit: string;
  readonly tools: string;
  readonly next: string;
  readonly details: string;
  readonly missionProgress: (index: number, count: number) => string;
  readonly railAria: (lessonLabel: string) => string;
  readonly defaultWhy: string;
  readonly defaultHints: readonly [string, string, string];
}

const RAIL_COPY: Readonly<Record<InterfaceLocale, GuidedLessonRailCopy>> = Object.freeze({
  "zh-CN": Object.freeze({
    requirementLabels: Object.freeze({
      pending: "待验证",
      passed: "已通过",
      failed: "未通过",
    }),
    requirements: "验收条件",
    predictionSummary: "逐轮推演（非运行时变量）",
    predictionNote: "这张表用于理解算法；真实 Trace 只证明执行行与分支路径。",
    predictionCaption: "扫描求最大值的逐轮推演",
    predictionHeaders: Object.freeze(["轮次", "输入", "比较", "maximum"] as const),
    why: "为什么",
    hintProgress: (level: GuidedLessonHintLevel) => `提示 · ${String(level)}/3`,
    firstHint: "显示第一条提示",
    nextHint: "显示下一条提示",
    prepareSkeleton: "开始补全",
    injectBug: "载入故障版本",
    locate: "定位",
    reset: "重置",
    exit: "退出课程",
    tools: "任务工具",
    next: "下一任务",
    details: "查看任务详情",
    missionProgress: (index: number, count: number) => `任务 ${String(index)} / ${String(count)}`,
    railAria: (lessonLabel: string) => `${lessonLabel}任务轨`,
    defaultWhy: "完成当前操作后，任务轨会使用真实工作区证据检查结果。",
    defaultHints: Object.freeze([
      "先使用“定位”找到当前任务对应的面板。",
      "核对当前案例、源码和任务要求是否一致。",
      "如果状态仍未通过，读取失败条件并只修改相关位置。",
    ] as const),
  }),
  en: Object.freeze({
    requirementLabels: Object.freeze({
      pending: "Pending",
      passed: "Passed",
      failed: "Failed",
    }),
    requirements: "Acceptance criteria",
    predictionSummary: "Iteration walkthrough (not runtime variables)",
    predictionNote:
      "This table explains the algorithm; a real Trace only proves executed lines and branch paths.",
    predictionCaption: "Iteration walkthrough for scanning the maximum",
    predictionHeaders: Object.freeze(["Iteration", "Input", "Comparison", "maximum"] as const),
    why: "Why",
    hintProgress: (level: GuidedLessonHintLevel) => `Hints · ${String(level)}/3`,
    firstHint: "Show first hint",
    nextHint: "Show next hint",
    prepareSkeleton: "Start completion",
    injectBug: "Load faulty version",
    locate: "Locate",
    reset: "Reset",
    exit: "Exit lesson",
    tools: "Mission tools",
    next: "Next mission",
    details: "View mission details",
    missionProgress: (index: number, count: number) =>
      `Mission ${String(index)} / ${String(count)}`,
    railAria: (lessonLabel: string) => `${lessonLabel} mission rail`,
    defaultWhy:
      "After you complete the current action, the rail checks it against evidence from the real workspace.",
    defaultHints: Object.freeze([
      "Use Locate to find the panel for the current mission.",
      "Check that the current scenario, source and mission requirements match.",
      "If the check still fails, read the failed condition and change only the relevant location.",
    ] as const),
  }),
});

export function createGuidedLessonRail(
  host: HTMLElement,
  initialSnapshot: GuidedLessonRailSnapshot,
  callbacks: GuidedLessonRailCallbacks,
): GuidedLessonRail {
  assertCallbacks(callbacks);
  assertSnapshot(initialSnapshot);
  const document = host.ownerDocument;
  const localeHost = resolveLocaleHost(host);
  let locale = resolveRailLocale(
    localeHost.dataset.locale ??
      document.documentElement?.dataset.locale ??
      document.documentElement?.lang,
  );
  let copy = RAIL_COPY[locale];
  const root = document.createElement("aside");
  root.className = "guided-lesson-rail";
  root.dataset.locale = locale;

  const header = document.createElement("header");
  header.className = "guided-lesson-rail__header";
  const lessonLabel = document.createElement("p");
  lessonLabel.className = "guided-lesson-rail__lesson-label";
  const progress = document.createElement("p");
  progress.className = "guided-lesson-rail__progress";
  const title = document.createElement("h2");
  title.className = "guided-lesson-rail__title";
  const instruction = document.createElement("p");
  instruction.className = "guided-lesson-rail__instruction";
  header.append(lessonLabel, progress, title, instruction);

  const status = document.createElement("output");
  status.className = "guided-lesson-rail__status";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");

  const missionState = document.createElement("section");
  missionState.className = "guided-lesson-rail__mission-state";

  const visualGuide = document.createElement("section");
  visualGuide.className = "guided-lesson-rail__visual-guide";
  const visualPhase = document.createElement("p");
  visualPhase.className = "guided-lesson-rail__visual-phase";
  const visualTitle = document.createElement("h3");
  const visualExplanation = document.createElement("p");
  const visualFacts = document.createElement("dl");
  visualFacts.className = "guided-lesson-rail__visual-facts";
  const visualQuestion = document.createElement("fieldset");
  const visualLegend = document.createElement("legend");
  const visualOptions = document.createElement("div");
  visualOptions.className = "guided-lesson-rail__visual-options";
  const visualFeedback = document.createElement("output");
  visualFeedback.className = "guided-lesson-rail__visual-feedback";
  visualFeedback.setAttribute("aria-live", "polite");
  visualQuestion.append(visualLegend, visualOptions);
  visualGuide.append(
    visualPhase,
    visualTitle,
    visualExplanation,
    visualFacts,
    visualQuestion,
    visualFeedback,
  );
  missionState.append(status, visualGuide);

  const requirementsSection = document.createElement("details");
  requirementsSection.className = "guided-lesson-rail__requirements";
  const requirementsSummary = document.createElement("summary");
  const requirements = document.createElement("ul");
  requirementsSection.append(requirementsSummary, requirements);

  const prediction = document.createElement("details");
  prediction.className = "guided-lesson-rail__prediction";
  const predictionSummary = document.createElement("summary");
  const predictionNote = document.createElement("p");
  const predictionTable = document.createElement("table");
  const predictionCaption = document.createElement("caption");
  const predictionHead = document.createElement("thead");
  const predictionHeadRow = document.createElement("tr");
  const predictionHeaderCells: HTMLTableCellElement[] = [];
  for (let index = 0; index < 4; index += 1) {
    const cell = document.createElement("th");
    cell.scope = "col";
    predictionHeadRow.append(cell);
    predictionHeaderCells.push(cell);
  }
  predictionHead.append(predictionHeadRow);
  const predictionBody = document.createElement("tbody");
  predictionTable.append(predictionCaption, predictionHead, predictionBody);
  prediction.append(predictionSummary, predictionNote, predictionTable);

  const disclosure = document.createElement("div");
  disclosure.className = "guided-lesson-rail__disclosure";
  const why = document.createElement("details");
  why.className = "guided-lesson-rail__why";
  const whySummary = document.createElement("summary");
  const whyText = document.createElement("p");
  why.append(whySummary, whyText);
  const hint = document.createElement("details");
  hint.className = "guided-lesson-rail__hints";
  const hintSummary = document.createElement("summary");
  const hintButton = textButton(document);
  hintButton.dataset.lessonAction = "hint";
  const hintList = document.createElement("ol");
  hint.append(hintSummary, hintList, hintButton);
  disclosure.append(why, hint);

  const prepareSkeleton = textButton(document);
  prepareSkeleton.dataset.lessonAction = "prepare-skeleton";
  const injectBug = textButton(document);
  injectBug.dataset.lessonAction = "inject-bug";

  const actions = document.createElement("div");
  actions.className = "guided-lesson-rail__actions";
  const locate = textButton(document);
  locate.dataset.lessonAction = "locate";
  const reset = textButton(document);
  reset.dataset.lessonAction = "reset";
  const exit = textButton(document);
  exit.dataset.lessonAction = "exit";
  actions.append(locate, reset, exit);

  const tools = document.createElement("details");
  tools.className = "guided-lesson-rail__tools";
  const toolsSummary = document.createElement("summary");
  tools.append(toolsSummary, actions);

  const next = textButton(document);
  next.className = "guided-lesson-rail__next";
  next.dataset.lessonAction = "next";

  const primaryAction = document.createElement("div");
  primaryAction.className = "guided-lesson-rail__primary-action";
  primaryAction.append(prepareSkeleton, injectBug, next);

  const support = document.createElement("details");
  support.className = "guided-lesson-rail__support";
  const supportSummary = document.createElement("summary");
  support.append(supportSummary, requirementsSection, prediction, disclosure, tools);

  root.append(header, missionState, primaryAction, support);
  host.replaceChildren(root);

  let snapshot = initialSnapshot;
  let destroyed = false;

  const applyStaticCopy = (): void => {
    copy = RAIL_COPY[locale];
    root.dataset.locale = locale;
    predictionSummary.textContent = copy.predictionSummary;
    predictionNote.textContent = copy.predictionNote;
    predictionCaption.textContent = copy.predictionCaption;
    for (const [index, cell] of predictionHeaderCells.entries()) {
      cell.textContent = copy.predictionHeaders[index] ?? "";
    }
    whySummary.textContent = copy.why;
    prepareSkeleton.textContent = copy.prepareSkeleton;
    injectBug.textContent = copy.injectBug;
    locate.textContent = copy.locate;
    reset.textContent = copy.reset;
    exit.textContent = copy.exit;
    toolsSummary.textContent = copy.tools;
    next.textContent = copy.next;
    supportSummary.textContent = copy.details;
  };

  const invoke = (callback: () => void): void => {
    if (destroyed || snapshot.busy) return;
    callback();
  };

  locate.addEventListener("click", () => invoke(callbacks.onLocate));
  reset.addEventListener("click", () => invoke(callbacks.onReset));
  exit.addEventListener("click", () => invoke(callbacks.onExit));
  next.addEventListener("click", () => {
    if (!snapshot.canAdvance) return;
    invoke(callbacks.onNext);
  });
  hintButton.addEventListener("click", () => {
    if (snapshot.hintLevel >= 3) return;
    invoke(callbacks.onNextHint);
  });
  whySummary.addEventListener("click", (event) => {
    event.preventDefault();
    invoke(callbacks.onToggleWhy);
  });
  prepareSkeleton.addEventListener("click", () => invoke(callbacks.onPrepareSkeleton));
  injectBug.addEventListener("click", () => invoke(callbacks.onInjectBug));

  const render = (): void => {
    root.setAttribute("aria-label", copy.railAria(snapshot.lessonLabel));
    root.setAttribute("aria-busy", String(snapshot.busy));
    root.dataset.state = snapshot.status.state;
    lessonLabel.textContent = snapshot.lessonLabel;
    progress.textContent = copy.missionProgress(snapshot.missionIndex, snapshot.missionCount);
    title.textContent = snapshot.title;
    instruction.textContent = snapshot.instruction;
    status.textContent = snapshot.status.message;
    status.dataset.state = snapshot.status.state;

    const guide = snapshot.visualGuide;
    visualGuide.hidden = guide === undefined;
    if (guide !== undefined) {
      visualPhase.textContent = guide.phase;
      visualTitle.textContent = guide.title;
      visualExplanation.textContent = guide.explanation;
      visualFacts.replaceChildren(
        ...guide.facts.flatMap((fact) => {
          const term = document.createElement("dt");
          term.textContent = fact.label;
          const description = document.createElement("dd");
          description.textContent = fact.description;
          return [term, description];
        }),
      );
      const hasQuestion = guide.question !== null && guide.options.length > 0;
      visualQuestion.hidden = !hasQuestion;
      visualLegend.textContent = guide.question ?? "";
      visualOptions.replaceChildren(
        ...guide.options.map((option) => {
          const answer = textButton(document);
          answer.dataset.visualAnswer = option.id;
          answer.textContent = option.label;
          answer.setAttribute("aria-pressed", String(option.id === guide.selectedOptionId));
          answer.disabled = snapshot.busy;
          answer.addEventListener("click", () => invoke(() => callbacks.onVisualAnswer(option.id)));
          return answer;
        }),
      );
      visualFeedback.hidden = guide.feedback === null;
      visualFeedback.textContent = guide.feedback ?? "";
      visualFeedback.dataset.state = guide.feedbackState;
    } else {
      visualFacts.replaceChildren();
      visualOptions.replaceChildren();
      visualFeedback.textContent = "";
    }

    const passedRequirementCount = snapshot.requirements.filter(
      (requirement) => requirement.status === "passed",
    ).length;
    requirementsSection.hidden = snapshot.requirements.length === 0;
    requirementsSummary.textContent = `${copy.requirements} · ${String(passedRequirementCount)}/${String(snapshot.requirements.length)}`;

    requirements.replaceChildren(
      ...snapshot.requirements.map((requirement) => {
        const item = document.createElement("li");
        item.dataset.state = requirement.status;
        const stateLabel = document.createElement("strong");
        stateLabel.textContent = copy.requirementLabels[requirement.status];
        const label = document.createElement("span");
        label.textContent = requirement.label;
        item.append(stateLabel, label);
        if (requirement.detail !== undefined && requirement.detail.length > 0) {
          const detail = document.createElement("small");
          detail.textContent = requirement.detail;
          item.append(detail);
        }
        return item;
      }),
    );

    prediction.hidden = snapshot.predictionRows.length === 0;
    predictionBody.replaceChildren(
      ...snapshot.predictionRows.map((row) => {
        const tableRow = document.createElement("tr");
        for (const value of [row.iteration, row.input, row.comparison, row.maximum]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          tableRow.append(cell);
        }
        return tableRow;
      }),
    );

    why.open = snapshot.expandedWhy;
    whyText.textContent = snapshot.why ?? copy.defaultWhy;
    const hints = snapshot.hints ?? copy.defaultHints;
    const visibleHintCount = Math.min(snapshot.hintLevel, hints.length);
    hintSummary.textContent = copy.hintProgress(snapshot.hintLevel);
    hintButton.textContent = snapshot.hintLevel === 0 ? copy.firstHint : copy.nextHint;
    hintButton.disabled = snapshot.busy || snapshot.hintLevel >= 3;
    hintList.hidden = visibleHintCount === 0;
    hintList.replaceChildren(
      ...hints.slice(0, visibleHintCount).map((message) => {
        const item = document.createElement("li");
        item.textContent = message;
        return item;
      }),
    );

    const showPrepareSkeleton = snapshot.showPrepareSkeleton === true;
    const showInjectBug = !showPrepareSkeleton && snapshot.showInjectBug === true;
    prepareSkeleton.hidden = !showPrepareSkeleton;
    injectBug.hidden = !showInjectBug;
    next.hidden = showPrepareSkeleton || showInjectBug;
    for (const button of [locate, reset, exit, prepareSkeleton, injectBug]) {
      button.disabled = snapshot.busy;
    }
    next.disabled = snapshot.busy || !snapshot.canAdvance;
  };

  const renderLocale = (nextLocale: InterfaceLocale): void => {
    if (destroyed) return;
    locale = nextLocale;
    applyStaticCopy();
    render();
  };
  const onLocaleChange = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    const candidate =
      typeof detail === "object" && detail !== null && "locale" in detail
        ? detail.locale
        : localeHost.dataset.locale;
    renderLocale(resolveRailLocale(candidate));
  };
  const MutationObserverConstructor = document.defaultView?.MutationObserver;
  const localeObserver =
    MutationObserverConstructor === undefined
      ? null
      : new MutationObserverConstructor(() => {
          renderLocale(resolveRailLocale(localeHost.dataset.locale));
        });
  localeObserver?.observe(localeHost, {
    attributes: true,
    attributeFilter: ["data-locale"],
  });
  localeHost.addEventListener("workbench-locale-change", onLocaleChange);
  applyStaticCopy();
  render();

  return Object.freeze({
    element: root,
    update(nextSnapshot: GuidedLessonRailSnapshot): void {
      assertActive(destroyed);
      assertSnapshot(nextSnapshot);
      snapshot = nextSnapshot;
      render();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      localeHost.removeEventListener("workbench-locale-change", onLocaleChange);
      localeObserver?.disconnect();
      root.remove();
    },
  });
}

function textButton(document: Document): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  return button;
}

export function resolveRailLocale(value: unknown): InterfaceLocale {
  if (typeof value !== "string") return "zh-CN";
  return value.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

function resolveLocaleHost(host: HTMLElement): HTMLElement {
  if (typeof host.closest !== "function") return host;
  return host.closest<HTMLElement>("[data-locale]") ?? host;
}

function assertCallbacks(callbacks: GuidedLessonRailCallbacks): void {
  for (const callback of Object.values(callbacks)) {
    if (typeof callback !== "function") throw new Error("GuidedLessonRail 回调不完整");
  }
}

function assertSnapshot(snapshot: GuidedLessonRailSnapshot): void {
  if (!Number.isInteger(snapshot.missionIndex) || snapshot.missionIndex < 1) {
    throw new Error("任务序号必须从 1 开始");
  }
  if (!Number.isInteger(snapshot.missionCount) || snapshot.missionCount < snapshot.missionIndex) {
    throw new Error("任务总数不能小于当前任务序号");
  }
  if (!Number.isInteger(snapshot.hintLevel) || snapshot.hintLevel < 0 || snapshot.hintLevel > 3) {
    throw new Error("提示层级必须在 0 到 3 之间");
  }
  if (snapshot.visualGuide !== undefined) {
    const optionIds = new Set<string>();
    for (const option of snapshot.visualGuide.options) {
      if (option.id.length === 0 || optionIds.has(option.id)) {
        throw new Error("读图练习选项 ID 必须非空且唯一");
      }
      optionIds.add(option.id);
    }
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("GuidedLessonRail 已销毁");
}
