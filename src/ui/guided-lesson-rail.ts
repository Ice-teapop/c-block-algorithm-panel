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
}

export interface GuidedLessonRail {
  readonly element: HTMLElement;
  update(snapshot: GuidedLessonRailSnapshot): void;
  destroy(): void;
}

const REQUIREMENT_LABELS: Readonly<Record<GuidedLessonRequirementStatus, string>> = Object.freeze({
  pending: "待验证",
  passed: "已通过",
  failed: "未通过",
});

const DEFAULT_WHY = "完成当前操作后，任务轨会使用真实工作区证据检查结果。";
const DEFAULT_HINTS = Object.freeze([
  "先使用“定位”找到当前任务对应的面板。",
  "核对当前案例、源码和任务要求是否一致。",
  "如果状态仍未通过，读取失败条件并只修改相关位置。",
]);

export function createGuidedLessonRail(
  host: HTMLElement,
  initialSnapshot: GuidedLessonRailSnapshot,
  callbacks: GuidedLessonRailCallbacks,
): GuidedLessonRail {
  assertCallbacks(callbacks);
  assertSnapshot(initialSnapshot);
  const document = host.ownerDocument;
  const root = document.createElement("aside");
  root.className = "guided-lesson-rail";

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

  const requirementsSection = document.createElement("section");
  requirementsSection.className = "guided-lesson-rail__requirements";
  const requirementsHeading = document.createElement("h3");
  requirementsHeading.textContent = "验收条件";
  const requirements = document.createElement("ul");
  requirementsSection.append(requirementsHeading, requirements);

  const prediction = document.createElement("details");
  prediction.className = "guided-lesson-rail__prediction";
  const predictionSummary = document.createElement("summary");
  predictionSummary.textContent = "逐轮推演（非运行时变量）";
  const predictionNote = document.createElement("p");
  predictionNote.textContent = "这张表用于理解算法；真实 Trace 只证明执行行与分支路径。";
  const predictionTable = document.createElement("table");
  const predictionCaption = document.createElement("caption");
  predictionCaption.textContent = "扫描求最大值的逐轮推演";
  const predictionHead = document.createElement("thead");
  const predictionHeadRow = document.createElement("tr");
  for (const label of ["轮次", "输入", "比较", "maximum"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    predictionHeadRow.append(cell);
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
  whySummary.textContent = "为什么";
  const whyText = document.createElement("p");
  why.append(whySummary, whyText);
  const hint = document.createElement("section");
  hint.className = "guided-lesson-rail__hints";
  const hintButton = textButton(document, "提示 0/3");
  hintButton.dataset.lessonAction = "hint";
  const hintList = document.createElement("ol");
  hint.append(hintButton, hintList);
  disclosure.append(why, hint);

  const missionActions = document.createElement("div");
  missionActions.className = "guided-lesson-rail__mission-actions";
  const prepareSkeleton = textButton(document, "开始补全");
  prepareSkeleton.dataset.lessonAction = "prepare-skeleton";
  const injectBug = textButton(document, "载入故障版本");
  injectBug.dataset.lessonAction = "inject-bug";
  missionActions.append(prepareSkeleton, injectBug);

  const actions = document.createElement("div");
  actions.className = "guided-lesson-rail__actions";
  const locate = textButton(document, "定位");
  locate.dataset.lessonAction = "locate";
  const reset = textButton(document, "重置");
  reset.dataset.lessonAction = "reset";
  const exit = textButton(document, "退出课程");
  exit.dataset.lessonAction = "exit";
  actions.append(locate, reset, exit);

  const next = textButton(document, "下一任务");
  next.className = "guided-lesson-rail__next";
  next.dataset.lessonAction = "next";

  root.append(
    header,
    status,
    requirementsSection,
    prediction,
    disclosure,
    missionActions,
    actions,
    next,
  );
  host.replaceChildren(root);

  let snapshot = initialSnapshot;
  let destroyed = false;

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
    root.setAttribute("aria-label", `${snapshot.lessonLabel}任务轨`);
    root.setAttribute("aria-busy", String(snapshot.busy));
    root.dataset.state = snapshot.status.state;
    lessonLabel.textContent = snapshot.lessonLabel;
    progress.textContent = `任务 ${String(snapshot.missionIndex)} / ${String(snapshot.missionCount)}`;
    title.textContent = snapshot.title;
    instruction.textContent = snapshot.instruction;
    status.textContent = snapshot.status.message;
    status.dataset.state = snapshot.status.state;

    requirements.replaceChildren(
      ...snapshot.requirements.map((requirement) => {
        const item = document.createElement("li");
        item.dataset.state = requirement.status;
        const stateLabel = document.createElement("strong");
        stateLabel.textContent = REQUIREMENT_LABELS[requirement.status];
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
    prediction.open = snapshot.predictionRows.length > 0;
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
    whyText.textContent = snapshot.why ?? DEFAULT_WHY;
    const hints = snapshot.hints ?? DEFAULT_HINTS;
    const visibleHintCount = Math.min(snapshot.hintLevel, hints.length);
    hintButton.textContent = `提示 ${String(snapshot.hintLevel)}/3`;
    hintButton.disabled = snapshot.busy || snapshot.hintLevel >= 3;
    hintList.hidden = visibleHintCount === 0;
    hintList.replaceChildren(
      ...hints.slice(0, visibleHintCount).map((message) => {
        const item = document.createElement("li");
        item.textContent = message;
        return item;
      }),
    );

    prepareSkeleton.hidden = snapshot.showPrepareSkeleton !== true;
    injectBug.hidden = snapshot.showInjectBug !== true;
    missionActions.hidden = prepareSkeleton.hidden && injectBug.hidden;
    for (const button of [locate, reset, exit, prepareSkeleton, injectBug]) {
      button.disabled = snapshot.busy;
    }
    next.disabled = snapshot.busy || !snapshot.canAdvance;
  };

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
      root.remove();
    },
  });
}

function textButton(document: Document, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  return button;
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
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("GuidedLessonRail 已销毁");
}
