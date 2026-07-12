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

export function createFirstRunStart(
  host: HTMLElement,
  callbacks: FirstRunStartCallbacks,
): FirstRunStart {
  assertCallbacks(callbacks);
  const document = host.ownerDocument;
  const root = document.createElement("section");
  root.className = "first-run-start";
  root.setAttribute("aria-label", "首次使用");

  const heading = document.createElement("h2");
  heading.textContent = "从一个可运行的算法开始";
  const description = document.createElement("p");
  description.textContent = "第一课会创建独立沙箱，用真实运行、Trace 和测试完成一次完整练习。";
  const actions = document.createElement("div");
  actions.className = "first-run-start__actions";
  const start = textButton(document, "开始第一课 · 扫描求最大值");
  start.dataset.firstRunAction = "start-lesson";
  const continueWorkbench = textButton(document, "直接进入工作台");
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

  const renderBusy = (): void => {
    root.setAttribute("aria-busy", String(busy));
    start.disabled = busy;
    continueWorkbench.disabled = busy;
  };

  const run = async (
    action: () => void | Promise<void>,
    workingMessage: string,
    successMessage: string,
  ): Promise<void> => {
    if (busy || destroyed) return;
    busy = true;
    status.textContent = workingMessage;
    status.dataset.state = "working";
    renderBusy();
    try {
      await action();
      if (destroyed) return;
      status.textContent = successMessage;
      status.dataset.state = "success";
    } catch (error: unknown) {
      if (destroyed) return;
      status.textContent =
        error instanceof Error ? `操作未完成：${error.message}` : "操作未完成，请重试。";
      status.dataset.state = "error";
    } finally {
      if (!destroyed) {
        busy = false;
        renderBusy();
      }
    }
  };

  start.addEventListener("click", () => {
    void run(callbacks.onStartLesson, "正在创建教学沙箱…", "教学沙箱已准备。");
  });
  continueWorkbench.addEventListener("click", () => {
    void run(callbacks.onContinue, "正在进入工作台…", "已进入工作台。");
  });
  renderBusy();

  return Object.freeze({
    element: root,
    setBusy(nextBusy: boolean, message?: string): void {
      assertActive(destroyed);
      busy = nextBusy;
      if (message !== undefined) {
        status.textContent = message;
        status.dataset.state = nextBusy ? "working" : "idle";
      }
      renderBusy();
    },
    setStatus(message: string, state: FirstRunStartStatusState = "idle"): void {
      assertActive(destroyed);
      status.textContent = message;
      status.dataset.state = state;
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

function assertCallbacks(callbacks: FirstRunStartCallbacks): void {
  if (typeof callbacks.onStartLesson !== "function" || typeof callbacks.onContinue !== "function") {
    throw new Error("FirstRunStart 回调不完整");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("FirstRunStart 已销毁");
}
