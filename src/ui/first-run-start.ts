export type FirstRunStartStatusState = "idle" | "working" | "success" | "error";

export interface FirstRunStartCallbacks {
  readonly onStartLesson: () => void | Promise<void>;
  readonly onContinue: () => void | Promise<void>;
}

export interface FirstRunStart {
  readonly element: HTMLElement;
  setBusy(busy: boolean, message?: string): void;
  setStatus(message: string, state?: FirstRunStartStatusState): void;
  destroy(): void;
}

const COPY = Object.freeze({
  "zh-CN": Object.freeze({
    label: "首次使用",
    heading: "从一个可运行的算法开始",
    description:
      "第一课会创建独立沙箱，用真实运行、Trace、两张数据图、Benchmark 和测试完成一次完整练习。",
    start: "开始第一课 · 扫描求最大值",
    continue: "直接进入工作台",
    creating: "正在创建教学沙箱…",
    created: "教学沙箱已准备。",
    entering: "正在进入工作台…",
    entered: "已进入工作台。",
    failed: "操作未完成，请重试。",
    failedPrefix: "操作未完成：",
  }),
  en: Object.freeze({
    label: "First Use",
    heading: "Start with a Working Algorithm",
    description:
      "The first lesson creates an isolated sandbox and completes one exercise with a real run, Trace, both evidence charts, a benchmark, and tests.",
    start: "Start Lesson 1 · Scan for Maximum",
    continue: "Go Straight to the Workbench",
    creating: "Creating the lesson sandbox…",
    created: "Lesson sandbox ready.",
    entering: "Opening the workbench…",
    entered: "Workbench opened.",
    failed: "The action did not complete. Try again.",
    failedPrefix: "The action did not complete: ",
  }),
});

export function createFirstRunStart(
  host: HTMLElement,
  callbacks: FirstRunStartCallbacks,
): FirstRunStart {
  assertCallbacks(callbacks);
  const document = host.ownerDocument;
  const localeHost =
    typeof host.closest === "function" ? host.closest<HTMLElement>("[data-locale]") : null;
  const locale = (): keyof typeof COPY => (localeHost?.dataset.locale === "en" ? "en" : "zh-CN");
  const copy = () => COPY[locale()];
  const root = document.createElement("section");
  root.className = "first-run-start";
  root.setAttribute("aria-label", copy().label);

  const heading = document.createElement("h2");
  heading.textContent = copy().heading;
  const description = document.createElement("p");
  description.textContent = copy().description;
  const actions = document.createElement("div");
  actions.className = "first-run-start__actions";
  const start = textButton(document, copy().start);
  start.dataset.firstRunAction = "start-lesson";
  const continueWorkbench = textButton(document, copy().continue);
  continueWorkbench.dataset.firstRunAction = "continue";
  actions.append(start, continueWorkbench);
  const status = document.createElement("output");
  status.className = "first-run-start__status";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  root.append(heading, description, actions, status);
  host.prepend(root);

  let busy = false;
  let destroyed = false;
  let internalStatus: "creating" | "created" | "entering" | "entered" | null = null;

  const renderBusy = (): void => {
    root.setAttribute("aria-busy", String(busy));
    start.disabled = busy;
    continueWorkbench.disabled = busy;
  };

  const run = async (
    action: () => void | Promise<void>,
    kind: "lesson" | "workbench",
  ): Promise<void> => {
    if (busy || destroyed) return;
    busy = true;
    internalStatus = kind === "lesson" ? "creating" : "entering";
    status.textContent = copy()[internalStatus];
    status.dataset.state = "working";
    renderBusy();
    try {
      await action();
      if (destroyed) return;
      internalStatus = internalStatus === "creating" ? "created" : "entered";
      status.textContent = copy()[internalStatus];
      status.dataset.state = "success";
    } catch (error: unknown) {
      if (destroyed) return;
      internalStatus = null;
      status.textContent =
        error instanceof Error ? `${copy().failedPrefix}${error.message}` : copy().failed;
      status.dataset.state = "error";
    } finally {
      if (!destroyed) {
        busy = false;
        renderBusy();
      }
    }
  };

  start.addEventListener("click", () => {
    void run(callbacks.onStartLesson, "lesson");
  });
  continueWorkbench.addEventListener("click", () => {
    void run(callbacks.onContinue, "workbench");
  });
  const renderLocale = (): void => {
    const localized = copy();
    root.setAttribute("aria-label", localized.label);
    heading.textContent = localized.heading;
    description.textContent = localized.description;
    start.textContent = localized.start;
    continueWorkbench.textContent = localized.continue;
    if (internalStatus !== null) status.textContent = localized[internalStatus];
  };
  const onLocaleChange = (): void => renderLocale();
  localeHost?.addEventListener("workbench-locale-change", onLocaleChange);
  renderBusy();

  return Object.freeze({
    element: root,
    setBusy(nextBusy: boolean, message?: string): void {
      assertActive(destroyed);
      busy = nextBusy;
      if (message !== undefined) {
        internalStatus = null;
        status.textContent = message;
        status.dataset.state = nextBusy ? "working" : "idle";
      }
      renderBusy();
    },
    setStatus(message: string, state: FirstRunStartStatusState = "idle"): void {
      assertActive(destroyed);
      status.textContent = message;
      internalStatus = null;
      status.dataset.state = state;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      localeHost?.removeEventListener("workbench-locale-change", onLocaleChange);
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

function assertCallbacks(callbacks: FirstRunStartCallbacks): void {
  if (typeof callbacks.onStartLesson !== "function" || typeof callbacks.onContinue !== "function") {
    throw new Error("FirstRunStart 回调不完整");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("FirstRunStart 已销毁");
}
