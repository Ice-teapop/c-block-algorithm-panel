import type { InterfaceLocale } from "../shared/interface-locale.js";

export type StartupStage = "shell" | "parser" | "parser-ready" | "source";

export interface StartupLoaderElements {
  readonly root: HTMLElement;
  readonly progress: HTMLProgressElement;
  readonly status: HTMLOutputElement;
  readonly locale?: (() => InterfaceLocale) | undefined;
}

export interface StartupLoader {
  readonly stage: StartupStage | "ready" | "error";
  readonly progress: number;
  advance(stage: StartupStage): void;
  complete(): void;
  fail(message: string): void;
  destroy(): void;
}

interface StagePresentation {
  readonly progress: number;
  readonly message: string;
}

const STAGES: Readonly<Record<InterfaceLocale, Readonly<Record<StartupStage, StagePresentation>>>> =
  Object.freeze({
    "zh-CN": Object.freeze({
      shell: Object.freeze({ progress: 8, message: "正在建立本地工作台…" }),
      parser: Object.freeze({ progress: 32, message: "正在加载 C 解析器…" }),
      "parser-ready": Object.freeze({ progress: 68, message: "解析器已就绪，正在准备算法面板…" }),
      source: Object.freeze({ progress: 86, message: "正在读取 Documents 工作区…" }),
    }),
    en: Object.freeze({
      shell: Object.freeze({ progress: 8, message: "Building the local workbench…" }),
      parser: Object.freeze({ progress: 32, message: "Loading the C parser…" }),
      "parser-ready": Object.freeze({
        progress: 68,
        message: "Parser ready. Preparing the algorithm workspace…",
      }),
      source: Object.freeze({ progress: 86, message: "Reading the Documents workspace…" }),
    }),
  });

const COMPLETE_COPY: Readonly<Record<InterfaceLocale, string>> = Object.freeze({
  "zh-CN": "工作台已就绪",
  en: "Workbench ready",
});

const FAILURE_COPY: Readonly<Record<InterfaceLocale, string>> = Object.freeze({
  "zh-CN": "工作台初始化失败",
  en: "Workbench initialization failed",
});

const COMPLETE_HIDE_DELAY_MS = 480;

/** Presents real startup milestones; it never invents progress with an interval. */
export function createStartupLoader(elements: StartupLoaderElements): StartupLoader {
  let stage: StartupLoader["stage"] = "shell";
  let progress = 0;
  let destroyed = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const locale = (): InterfaceLocale => (elements.locale?.() === "en" ? "en" : "zh-CN");

  const hide = (): void => {
    if (stage !== "ready" || destroyed) return;
    elements.root.hidden = true;
  };
  const handleVisualEnd = (event: Event): void => {
    if (event.target === elements.root) hide();
  };
  elements.root.addEventListener("transitionend", handleVisualEnd);
  elements.root.addEventListener("animationend", handleVisualEnd);

  const present = (nextStage: StartupStage): void => {
    assertActive(destroyed);
    if (stage === "ready" || stage === "error") {
      throw new Error("启动加载层已进入终态");
    }
    const next = STAGES[locale()][nextStage];
    if (next.progress < progress) throw new RangeError("启动阶段不可倒退");
    stage = nextStage;
    progress = next.progress;
    elements.progress.value = progress;
    elements.progress.setAttribute("aria-valuenow", String(progress));
    elements.status.textContent = next.message;
    elements.root.dataset.state = "loading";
    elements.root.setAttribute("aria-busy", "true");
  };

  present("shell");

  return Object.freeze({
    get stage(): StartupLoader["stage"] {
      return stage;
    },
    get progress(): number {
      return progress;
    },
    advance: present,
    complete(): void {
      assertActive(destroyed);
      if (stage === "ready") return;
      if (stage === "error") throw new Error("启动加载层已进入错误状态");
      stage = "ready";
      progress = 100;
      elements.progress.value = progress;
      elements.progress.setAttribute("aria-valuenow", "100");
      elements.status.textContent = COMPLETE_COPY[locale()];
      elements.root.dataset.state = "ready";
      elements.root.setAttribute("aria-busy", "false");
      hideTimer = setTimeout(hide, COMPLETE_HIDE_DELAY_MS);
    },
    fail(message: string): void {
      assertActive(destroyed);
      if (stage === "ready") return;
      const detail = message.trim();
      stage = "error";
      elements.status.textContent = detail.length === 0 ? FAILURE_COPY[locale()] : detail;
      elements.root.dataset.state = "error";
      elements.root.setAttribute("aria-busy", "false");
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (hideTimer !== undefined) clearTimeout(hideTimer);
      elements.root.removeEventListener("transitionend", handleVisualEnd);
      elements.root.removeEventListener("animationend", handleVisualEnd);
    },
  });
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("启动加载层已销毁");
}
